// POST /api/identify { jobId }  with  Authorization: Bearer <staff access token>
// Runs the Gemini chain on the job's photo and resolves the job. One call per job; the client
// never waits on it (status changes arrive through Realtime).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { IDENTIFY_SYSTEM, IdentifiedItemSchema, parseModelJson } from "../shared/identifyItem.js";
import { QuotaError, TIERS, runChain } from "../shared/modelChain.js";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BodySchema = z.object({ jobId: z.uuid() });

// Gemini's free-tier quotas reset at midnight Pacific.
const quotaDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "jobId required" });
  const { jobId } = parsed.data;

  // Only signed-in staff may spend Gemini quota.
  const token = req.headers.authorization?.replace(/^Bearer /i, "");
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!userData.user) return res.status(401).json({ error: "sign in required" });
  const { data: staff } = await admin.from("staff").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!staff) return res.status(403).json({ error: "staff only" });

  // Claim the job so a double tap or a retry cannot run it twice at once.
  const { data: claimed, error: claimErr } = await admin
    .from("intake_jobs")
    .update({ status: "processing" })
    .eq("id", jobId)
    .in("status", ["queued", "waiting_quota", "red"])
    .select("photo_path, attempts")
    .maybeSingle();
  if (claimErr) return res.status(500).json({ error: claimErr.message });
  if (!claimed) return res.status(409).json({ error: "job not found or already handled" });

  try {
    const { data: blob, error: dlErr } = await admin.storage.from("intake-photos").download(claimed.photo_path);
    if (dlErr || !blob) throw new Error(`photo download failed: ${dlErr?.message}`);
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const day = quotaDay();

    const result = await runChain(TIERS, {
      call: async (model) => {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: "image/jpeg", data } },
                  { text: "Identify and categorize this product." },
                ],
              },
            ],
            config: {
              systemInstruction: IDENTIFY_SYSTEM,
              responseMimeType: "application/json",
              responseJsonSchema: z.toJSONSchema(IdentifiedItemSchema),
            },
          });
          return IdentifiedItemSchema.parse(parseModelJson(response.text ?? ""));
        } catch (err) {
          if (err instanceof Error && /"code":\s*429/.test(err.message)) throw new QuotaError(err.message);
          throw err;
        }
      },
      reserve: async (tier) => {
        const { data: ok, error } = await admin.rpc("reserve_model_usage", {
          p_model: tier.model,
          p_day: day,
          p_limit: tier.dailyLimit,
        });
        if (error) throw error;
        return ok === true;
      },
      markExhausted: async (tier) => {
        await admin.rpc("exhaust_model_usage", { p_model: tier.model, p_day: day, p_limit: tier.dailyLimit });
      },
    });

    const attempts = (claimed.attempts ?? 0) + result.attempts;

    if (result.kind === "ok") {
      const item = result.value;
      const { error } = await admin.rpc("resolve_intake_job", {
        p_job_id: jobId,
        p_name: item.name,
        p_brand: item.brand,
        p_size: item.size,
        p_categories: item.categories,
        p_model: result.model,
      });
      if (error) throw error;
      await admin.from("intake_jobs").update({ attempts }).eq("id", jobId);
      return res.status(200).json({ status: "green" });
    }

    const status = result.kind === "waiting_quota" ? "waiting_quota" : "red";
    const error = result.kind === "failed" ? result.error : "all models are out of quota today";
    await admin.from("intake_jobs").update({ status, attempts, error }).eq("id", jobId);
    return res.status(200).json({ status });
  } catch (err) {
    // Unexpected failure: leave the job retryable instead of stuck in "processing".
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("intake_jobs").update({ status: "red", error: message.slice(0, 300) }).eq("id", jobId);
    return res.status(500).json({ error: message });
  }
}
