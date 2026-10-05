// End-to-end check of /api/identify against the real Supabase project and Gemini (spends 1 call).
// Creates a throwaway worker, uploads one test photo, creates a job, calls the handler directly,
// checks the item / stock / job, then cleans everything up.
//
//   npm run intake-e2e [path/to/photo.jpg]

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const { default: handler } = await import("../api/identify");

const url = process.env.SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const photoFile = process.argv[2] ?? "test_pictures/IMG_8058.jpeg";

const stamp = Date.now();
const email = `e2e-${stamp}@example.test`;
const password = `Tmp-${stamp}-pw!`;
const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (userErr) throw userErr;
const userId = created.user.id;
await admin.from("staff").insert({ user_id: userId, email, role: "worker" }).throwOnError();

const worker = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { data: signIn, error: signInErr } = await worker.auth.signInWithPassword({ email, password });
if (signInErr) throw signInErr;

const jobId = crypto.randomUUID();
const batchId = crypto.randomUUID();
const photoPath = `${batchId}/${jobId}.jpg`;
let itemId: string | null = null;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
};

try {
  const jpg = await sharp(photoFile).rotate().resize({ width: 1568, height: 1568, fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
  const up = await worker.storage.from("intake-photos").upload(photoPath, jpg, { contentType: "image/jpeg" });
  check("worker uploads photo", !up.error, up.error);
  const ins = await worker.from("intake_jobs").insert({ id: jobId, batch_id: batchId, photo_path: photoPath, quantity: 3, created_by: userId });
  check("worker creates job", !ins.error, ins.error);

  const call = async (token?: string) => {
    let status = 0;
    let body: unknown;
    const res = { status: (s: number) => ((status = s), res), json: (b: unknown) => ((body = b), res) };
    await handler({ method: "POST", body: { jobId }, headers: { authorization: token ? `Bearer ${token}` : "" } } as never, res as never);
    return { status, body };
  };

  check("no token is rejected", (await call()).status === 401);
  const out = await call(signIn.session!.access_token);
  check("identify succeeds", out.status === 200, out);

  const { data: job } = await admin.from("intake_jobs").select("*").eq("id", jobId).single();
  itemId = job?.item_id ?? null;
  check("job is green with an item", job?.status === "green" && !!itemId, job);
  check("model_used recorded", !!job?.model_used, job);
  const { data: stock } = await admin.from("item_stock").select("stock").eq("item_id", itemId!).single();
  check("stock equals quantity", stock?.stock === 3, stock);
  const { data: item } = await admin.from("items").select("name, categories").eq("id", itemId!).single();
  console.log("      item:", item, "via", job?.model_used);

  const again = await call(signIn.session!.access_token);
  check("second call on a finished job is refused", again.status === 409, again);
  const { data: events } = await admin.from("inventory_events").select("id").eq("job_id", jobId);
  check("exactly one intake event", events?.length === 1, events);
} finally {
  if (itemId) await admin.from("items").delete().eq("id", itemId); // cascades to events
  await admin.from("intake_jobs").delete().eq("id", jobId);
  await admin.storage.from("intake-photos").remove([photoPath]);
  await admin.from("staff").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
