// Gemini plumbing shared by the single-item (runJob) and shelf (runShelf) pipelines.

import { FinishReason, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";
import { parseModelJson } from "../../shared/identifyItem.js";
import { QuotaError, type ChainDeps, type Tier } from "../../shared/modelChain.js";
import { admin, ai } from "./clients.js";

// Gemini's free-tier quotas reset at midnight Pacific.
export const quotaDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

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

export async function downloadPhotoBase64(path: string): Promise<string> {
  const { data: blob, error } = await admin.storage.from("intake-photos").download(path);
  if (error || !blob) throw new Error(`photo download failed: ${error?.message}`);
  return Buffer.from(await blob.arrayBuffer()).toString("base64");
}

type JsonCall = { image: string; prompt: string; system: string; schema: z.ZodType };

// One structured-output call. `blocked` means Gemini's own safety filter fired on the photo or the
// answer: that is a rejection, not a retry. A 429 becomes a QuotaError so the chain moves on.
export async function generateJson(model: string, c: JsonCall): Promise<{ blocked: true } | { blocked: false; json: unknown }> {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: c.image } }, { text: c.prompt }] }],
      config: {
        systemInstruction: c.system,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(c.schema),
        ...(model.startsWith("gemini") && { safetySettings: SAFETY_SETTINGS }),
      },
    });
    if (response.promptFeedback?.blockReason || BLOCKED_FINISH.includes(response.candidates?.[0]?.finishReason)) {
      return { blocked: true };
    }
    return { blocked: false, json: parseModelJson(response.text ?? "") };
  } catch (err) {
    if (err instanceof Error && /"code":\s*429/.test(err.message)) throw new QuotaError(err.message);
    throw err;
  }
}

// The quota counters in api_usage, as the reserve / markExhausted half of the model chain.
export function quotaDeps(): Pick<ChainDeps<unknown>, "reserve" | "markExhausted"> {
  const day = quotaDay();
  return {
    reserve: async (tier: Tier) => {
      const { data: ok, error } = await admin.rpc("reserve_model_usage", { p_model: tier.model, p_day: day, p_limit: tier.dailyLimit });
      if (error) throw error;
      return ok === true;
    },
    markExhausted: async (tier: Tier) => {
      await admin.rpc("exhaust_model_usage", { p_model: tier.model, p_day: day, p_limit: tier.dailyLimit });
    },
  };
}

export async function loadCatalog(): Promise<{ id: string; name: string }[]> {
  const all: { id: string; name: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("items").select("id, name").order("created_at").range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}
