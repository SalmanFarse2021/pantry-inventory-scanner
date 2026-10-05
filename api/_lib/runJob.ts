// Identify one intake job: Gemini chain, then name match, then write the result.
// Shared by /api/identify (a worker's request) and /api/sweep (the daily quota retry).

import { z } from "zod";
import { IDENTIFY_SYSTEM, IdentifiedItemSchema, parseModelJson } from "../../shared/identifyItem.js";
import { matchJob, type CatalogItem } from "../../shared/matchJob.js";
import { QuotaError, TIERS, runChain } from "../../shared/modelChain.js";
import { admin, ai } from "./clients.js";

// Gemini's free-tier quotas reset at midnight Pacific.
const quotaDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// Claim the job so a double tap, a retry or the sweep cannot run it twice at once.
export async function claimJob(jobId: string) {
  const { data, error } = await admin
    .from("intake_jobs")
    .update({ status: "processing" })
    .eq("id", jobId)
    .in("status", ["queued", "waiting_quota", "red"])
    .select("photo_path, attempts")
    .maybeSingle();
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

export type JobOutcome = "green" | "yellow" | "red" | "waiting_quota";

export async function runJob(jobId: string, claimed: { photo_path: string; attempts: number }): Promise<JobOutcome> {
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

    if (result.kind !== "ok") {
      const status = result.kind === "waiting_quota" ? "waiting_quota" : "red";
      const error = result.kind === "failed" ? result.error : "all models are out of quota today";
      await admin.from("intake_jobs").update({ status, attempts, error }).eq("id", jobId);
      return status;
    }

    const item = result.value;
    // Keep what Gemini read, so a worker can resolve the job from the review screen.
    await admin.from("intake_jobs").update({ identified: item, model_used: result.model, attempts }).eq("id", jobId);

    const match = matchJob(item.name, await loadCatalog());
    if (match.kind === "green") {
      const { error } = await admin.rpc("resolve_job_existing", { p_job_id: jobId, p_item_id: match.itemId, p_model: result.model });
      if (error) throw error;
      return "green";
    }
    if (match.kind === "yellow") {
      // No item yet: the worker picks a candidate or creates a new one.
      await admin.from("intake_jobs").update({ status: "yellow", candidates: match.candidates }).eq("id", jobId);
      return "yellow";
    }
    // New item: create it now (stock is counted) and show it yellow once so a worker eyeballs it.
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
