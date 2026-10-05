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
const { default: sweep } = await import("../api/sweep");

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

const batchId = crypto.randomUUID();
const jobIds: string[] = [];
const photoPaths: string[] = [];
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
};

const jpg = await sharp(photoFile).rotate().resize({ width: 1568, height: 1568, fit: "inside" }).jpeg({ quality: 88 }).toBuffer();

async function newJob(quantity: number) {
  const jobId = crypto.randomUUID();
  const photoPath = `${batchId}/${jobId}.jpg`;
  jobIds.push(jobId);
  photoPaths.push(photoPath);
  const up = await worker.storage.from("intake-photos").upload(photoPath, jpg, { contentType: "image/jpeg" });
  const ins = await worker.from("intake_jobs").insert({ id: jobId, batch_id: batchId, photo_path: photoPath, quantity, created_by: userId });
  check(`worker uploads photo and creates job (qty ${quantity})`, !up.error && !ins.error, up.error ?? ins.error);
  return jobId;
}

async function identify(jobId: string, token?: string) {
  let status = 0;
  let body: unknown;
  const res = { status: (s: number) => ((status = s), res), json: (b: unknown) => ((body = b), res) };
  await handler({ method: "POST", body: { jobId }, headers: { authorization: token ? `Bearer ${token}` : "" } } as never, res as never);
  return { status, body };
}

const getJob = async (id: string) => (await admin.from("intake_jobs").select("*").eq("id", id).single()).data;
const stockOf = async (itemId: string) => (await admin.from("item_stock").select("stock").eq("item_id", itemId).single()).data?.stock;
const token = signIn.session!.access_token;
const touchedItems = new Set<string>();

try {
  // 1. First scan of a new product: item created automatically, shown yellow once.
  const j1 = await newJob(3);
  check("no token is rejected", (await identify(j1)).status === 401);
  check("identify succeeds", (await identify(j1, token)).status === 200);
  const a = await getJob(j1);
  check("new item created and flagged yellow", a?.status === "yellow" && !!a.item_id && !!a.identified, a);
  touchedItems.add(a?.item_id);
  check("stock equals quantity", (await stockOf(a?.item_id)) === 3);
  check("repeat call on a handled job is refused", (await identify(j1, token)).status === 409);

  // 2. Worker confirms it.
  const conf = await worker.rpc("confirm_job", { p_job_id: j1 });
  check("worker confirms the new item", !conf.error && (await getJob(j1))?.status === "green", conf.error);

  // 3. Same product again: must resolve to the SAME item (the point of Phase 3).
  const j2 = await newJob(2);
  await identify(j2, token);
  const b = await getJob(j2);
  if (b?.item_id) touchedItems.add(b.item_id);
  check("second scan resolves green to the same item", b?.status === "green" && b.item_id === a?.item_id, { status: b?.status, candidates: b?.candidates });
  check("stock is 5 after both scans", (await stockOf(a?.item_id)) === 5);

  // 4. Yellow review path: an unresolved job picked by hand, and one created as new.
  const j3 = await newJob(1);
  const pick = await worker.rpc("resolve_job_existing", { p_job_id: j3, p_item_id: a?.item_id });
  check("worker resolves a job onto an existing item", !pick.error && (await stockOf(a?.item_id)) === 6, pick.error);
  const again = await worker.rpc("resolve_job_existing", { p_job_id: j3, p_item_id: a?.item_id });
  check("resolving twice does not double count", !again.error && (await stockOf(a?.item_id)) === 6, again.error);

  const j4 = await newJob(4);
  const made = await worker.rpc("resolve_job_new", { p_job_id: j4, p_name: "E2E Manual Item", p_brand: null, p_size: null, p_categories: ["other"] });
  if (made.data) touchedItems.add(made.data);
  check("worker enters a red job manually", !made.error && (await getJob(j4))?.status === "green", made.error);
  const bad = await worker.rpc("resolve_job_new", { p_job_id: await newJob(1), p_name: "x", p_brand: null, p_size: null, p_categories: ["not_a_category"] });
  check("unknown category is rejected", !!bad.error);

  // 5. Anonymous callers cannot use the resolve functions or the sweep.
  const anon = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const anonRes = await anon.rpc("resolve_job_existing", { p_job_id: j3, p_item_id: a?.item_id });
  check("anon cannot call resolve_job_existing", !!anonRes.error);
  let sweepStatus = 0;
  const sres = { status: (s: number) => ((sweepStatus = s), sres), json: () => sres };
  await sweep({ headers: {} } as never, sres as never);
  check("sweep without the cron secret is rejected", sweepStatus === 401);
} finally {
  for (const id of touchedItems) await admin.from("items").delete().eq("id", id).eq("created_by", userId); // cascades to events and images
  for (const id of jobIds) await admin.from("intake_jobs").delete().eq("id", id);
  await admin.storage.from("intake-photos").remove(photoPaths);
  await admin.from("staff").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
