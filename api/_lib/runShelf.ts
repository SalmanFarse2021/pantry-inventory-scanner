// Read one shelf photo: Gemini chain, then match every product to the catalog, then park the list
// as 'ready' for the student to verify. Never changes an item; that happens when they confirm.
// Shared by /api/shelf (a user's request) and /api/sweep (the daily quota retry).

import { TIERS, runChain } from "../../shared/modelChain.js";
import { MAX_PRODUCTS, resolveShelf, ShelfModelOutputSchema, SHELF_SYSTEM, type ShelfModelOutput } from "../../shared/shelfScan.js";
import { admin } from "./clients.js";
import { downloadPhotoBase64, generateJson, loadCatalog, quotaDeps } from "./gemini.js";

export async function claimShelfScan(scanId: string, userId?: string) {
  let query = admin
    .from("shelf_scans")
    .update({ status: "processing" })
    .eq("id", scanId)
    .in("status", ["queued", "waiting_quota", "red"]);
  if (userId) query = query.eq("created_by", userId);
  const { data, error } = await query.select("photo_path, attempts").maybeSingle();
  if (error) throw error;
  return data;
}

export type ShelfOutcome = "ready" | "red" | "waiting_quota" | "rejected";

type Answer = { kind: "reject"; reason: string } | { kind: "ok"; out: ShelfModelOutput };

export async function runShelfScan(scanId: string, claimed: { photo_path: string; attempts: number }): Promise<ShelfOutcome> {
  try {
    const image = await downloadPhotoBase64(claimed.photo_path);

    const result = await runChain<Answer>(TIERS, {
      call: async (model) => {
        const res = await generateJson(model, {
          image,
          prompt: "List every distinct product on this shelf.",
          system: SHELF_SYSTEM,
          schema: ShelfModelOutputSchema,
        });
        if (res.blocked) return { kind: "reject", reason: "inappropriate" };
        const out = ShelfModelOutputSchema.parse(res.json);
        if (out.verdict === "reject") return { kind: "reject", reason: out.reject_reason ?? "not_grocery" };
        return { kind: "ok", out };
      },
      ...quotaDeps(),
    });
    const attempts = (claimed.attempts ?? 0) + result.attempts;

    if (result.kind !== "ok") {
      const status = result.kind === "waiting_quota" ? "waiting_quota" : "red";
      const error = result.kind === "failed" ? result.error : "all models are out of quota today";
      await admin.from("shelf_scans").update({ status, attempts, error }).eq("id", scanId);
      return status;
    }
    if (result.value.kind === "reject") {
      await admin
        .from("shelf_scans")
        .update({ status: "rejected", reject_reason: result.value.reason, detections: null, model_used: result.model, attempts, error: null })
        .eq("id", scanId);
      return "rejected";
    }

    const { detections } = resolveShelf(result.value.out.products.slice(0, MAX_PRODUCTS), await loadCatalog());
    await admin
      .from("shelf_scans")
      .update({ status: "ready", detections, model_used: result.model, attempts, error: null })
      .eq("id", scanId);
    return "ready";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("shelf_scans").update({ status: "red", error: message.slice(0, 300) }).eq("id", scanId);
    throw err;
  }
}
