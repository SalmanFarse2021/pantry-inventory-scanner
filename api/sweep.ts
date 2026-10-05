// Daily cron (after Gemini's midnight-Pacific quota reset): retry jobs that were waiting for quota.
// Vercel sends  Authorization: Bearer $CRON_SECRET.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { admin } from "./_lib/clients.js";
import { claimJob, runJob } from "./_lib/runJob.js";

export const config = { maxDuration: 300 };

const BUDGET_MS = 240_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { data: jobs, error } = await admin
    .from("intake_jobs")
    .select("id")
    .eq("status", "waiting_quota")
    .order("created_at");
  if (error) return res.status(500).json({ error: error.message });

  const started = Date.now();
  const outcomes: Record<string, number> = {};
  for (const { id } of jobs) {
    if (Date.now() - started > BUDGET_MS) break;
    try {
      const claimed = await claimJob(id);
      if (!claimed) continue;
      const outcome = await runJob(id, claimed);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      if (outcome === "waiting_quota") break; // still out of quota; try again tomorrow
    } catch {
      outcomes.error = (outcomes.error ?? 0) + 1;
    }
  }
  return res.status(200).json({ waiting: jobs.length, outcomes });
}
