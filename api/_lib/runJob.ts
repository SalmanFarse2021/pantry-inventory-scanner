// Identify one intake job: Gemini chain, then name match, then write the result.
// Shared by /api/identify (a user's request) and /api/sweep (the daily quota retry).

import { FinishReason, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";
import { decide, ModelOutputSchema, type Decision } from "../../shared/guardrail.js";
import { IDENTIFY_SYSTEM, parseModelJson } from "../../shared/identifyItem.js";
import { matchJob, type CatalogItem } from "../../shared/matchJob.js";
import { QuotaError, TIERS, runChain } from "../../shared/modelChain.js";
import { admin, ai } from "./clients.js";

// Gemini's free-tier quotas reset at midnight Pacific.
const quotaDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// Claim the job so a double tap, a retry or the sweep cannot run it twice at once.
// Pass the caller's id to restrict the claim to their own job; the sweep claims any.
export async function claimJob(jobId: string, userId?: string) {
  let query = admin
    .from("intake_jobs")
    .update({ status: "processing" })
    .eq("id", jobId)
    .in("status", ["queued", "waiting_quota", "red"]);
  if (userId) query = query.eq("created_by", userId);
  const { data, error } = await query.select("photo_path, attempts").maybeSingle();
  if (error) throw error;
  return data;
}

async function loadCatalog(): Promise<CatalogItem[]> {
  const all: CatalogItem[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("items").select("id, name").order("created_at").range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

export type JobOutcome = "green" | "yellow" | "red" | "waiting_quota" | "rejected";

// Strictest filter on every category. Applied to Gemini models only; not verified for gemma.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));

const BLOCKED_FINISH: (FinishReason | undefined)[] = [
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
];

export async function runJob(jobId: string, claimed: { photo_path: string; attempts: number }): Promise<JobOutcome> {
  try {
    const { data: blob, error: dlErr } = await admin.storage.from("intake-photos").download(claimed.photo_path);
    if (dlErr || !blob) throw new Error(`photo download failed: ${dlErr?.message}`);
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const day = quotaDay();

    const result = await runChain<Decision>(TIERS, {
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
              responseJsonSchema: z.toJSONSchema(ModelOutputSchema),
              ...(model.startsWith("gemini") && { safetySettings: SAFETY_SETTINGS }),
            },
          });
          // Gemini's own filter fired on the photo or the answer: that is a rejection, not a retry.
          if (response.promptFeedback?.blockReason || BLOCKED_FINISH.includes(response.candidates?.[0]?.finishReason)) {
            return { kind: "reject", reason: "inappropriate" };
          }
          return decide(ModelOutputSchema.parse(parseModelJson(response.text ?? "")));
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

    if (result.kind !== "ok") {
      const status = result.kind === "waiting_quota" ? "waiting_quota" : "red";
      const error = result.kind === "failed" ? result.error : "all models are out of quota today";
      await admin.from("intake_jobs").update({ status, attempts, error }).eq("id", jobId);
      return status;
    }

    if (result.value.kind === "reject") {
      // Nothing is created. The thumbnail bucket is public, so take the photo out of it; the
      // full-size copy stays in the private bucket for auditing.
      await admin.storage.from("thumbnails").remove([`${jobId}.jpg`]);
      await admin
        .from("intake_jobs")
        .update({ status: "rejected", reject_reason: result.value.reason, identified: null, model_used: result.model, attempts, error: null })
        .eq("id", jobId);
      return "rejected";
    }
    const item = result.value.item;
    // Keep what Gemini read, so the user can resolve the job from the review screen.
    await admin.from("intake_jobs").update({ identified: item, model_used: result.model, attempts }).eq("id", jobId);

    const match = matchJob(item.name, await loadCatalog());
    if (match.kind === "green") {
      const { error } = await admin.rpc("resolve_job_existing", { p_job_id: jobId, p_item_id: match.itemId, p_model: result.model });
      if (error) throw error;
      return "green";
    }
    if (match.kind === "yellow") {
      // No item yet: the user picks a candidate or creates a new one.
      await admin.from("intake_jobs").update({ status: "yellow", candidates: match.candidates }).eq("id", jobId);
      return "yellow";
    }
    // New item: create it now with the status the user chose, and show it yellow once so the user can check it.
    const { error } = await admin.rpc("resolve_job_new", {
      p_job_id: jobId,
      p_name: item.name,
      p_brand: item.brand,
      p_size: item.size,
      p_categories: item.categories,
      p_status: "yellow",
      p_model: result.model,
    });
    if (error) throw error;
    return "yellow";
  } catch (err) {
    // Unexpected failure: leave the job retryable instead of stuck in "processing".
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("intake_jobs").update({ status: "red", error: message.slice(0, 300) }).eq("id", jobId);
    throw err;
  }
}
