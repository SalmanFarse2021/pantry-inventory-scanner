// POST /api/shelf { scanId }  with  Authorization: Bearer <user access token>
// One call per shelf scan; the client never waits on the result (status changes arrive through Realtime).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { utaUser } from "./_lib/auth.js";
import { claimShelfScan, runShelfScan } from "./_lib/runShelf.js";

const BodySchema = z.object({ scanId: z.uuid() });

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "scanId required" });

  const user = await utaUser(req);
  if ("error" in user) return res.status(user.status).json({ error: user.error });

  try {
    const claimed = await claimShelfScan(parsed.data.scanId, user.id);
    if (!claimed) return res.status(409).json({ error: "scan not found or already handled" });
    return res.status(200).json({ status: await runShelfScan(parsed.data.scanId, claimed) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
