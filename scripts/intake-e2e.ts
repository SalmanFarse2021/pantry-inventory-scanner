// End-to-end check of /api/identify against the real Supabase project and Gemini (spends 1 call).
// Creates a throwaway user, uploads one test photo, creates a job, calls the handler directly,
// checks the item / status / job, then cleans everything up.
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
const email = `e2e-${stamp}@mavs.uta.edu`; // registration only accepts UTA addresses
const password = `Tmp-${stamp}-pw!`;
const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (userErr) throw userErr;
const userId = created.user.id;

const user = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { data: signIn, error: signInErr } = await user.auth.signInWithPassword({ email, password });
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

async function newJob(availability: "in_stock" | "low" | "out") {
  const jobId = crypto.randomUUID();
  const photoPath = `${userId}/${batchId}/${jobId}.jpg`;
  jobIds.push(jobId);
  photoPaths.push(photoPath);
  const up = await user.storage.from("intake-photos").upload(photoPath, jpg, { contentType: "image/jpeg" });
  const ins = await user.from("intake_jobs").insert({ id: jobId, batch_id: batchId, photo_path: photoPath, availability, created_by: userId });
  check(`user uploads photo and creates job (${availability})`, !up.error && !ins.error, up.error ?? ins.error);
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
const statusOf = async (itemId: string) => (await admin.from("items").select("status").eq("id", itemId).single()).data?.status;
const token = signIn.session!.access_token;
const touchedItems = new Set<string>();

try {
  // 1. First scan of a new product: item created automatically, shown yellow once.
  const j1 = await newJob("low");
  check("no token is rejected", (await identify(j1)).status === 401);
  check("identify succeeds", (await identify(j1, token)).status === 200);
  const a = await getJob(j1);
  check("new item created and flagged yellow", a?.status === "yellow" && !!a.item_id && !!a.identified, a);
  touchedItems.add(a?.item_id);
  check("new item gets the status the user chose", (await statusOf(a?.item_id)) === "low");
  check("repeat call on a handled job is refused", (await identify(j1, token)).status === 409);

  // 2. User confirms it.
  const conf = await user.rpc("confirm_job", { p_job_id: j1, p_name: a?.identified?.name ?? "E2E Item", p_brand: null, p_categories: a?.identified?.categories ?? ["other"] });
  check("user confirms the new item", !conf.error && (await getJob(j1))?.status === "green", conf.error);

  // 3. Same product again: must resolve to the SAME item (the point of Phase 3).
  const j2 = await newJob("in_stock");
  await identify(j2, token);
  const b = await getJob(j2);
  if (b?.item_id) touchedItems.add(b.item_id);
  check("second scan resolves green to the same item", b?.status === "green" && b.item_id === a?.item_id, { status: b?.status, candidates: b?.candidates });
  check("second scan updated the status and added no item", (await statusOf(a?.item_id)) === "in_stock");

  // 4. Yellow review path: an unresolved job picked by hand, and one created as new.
  const j3 = await newJob("out");
  const pick = await user.rpc("resolve_job_existing", { p_job_id: j3, p_item_id: a?.item_id });
  check("user resolves a job onto an existing item", !pick.error && (await statusOf(a?.item_id)) === "out", pick.error);
  const again = await user.rpc("resolve_job_existing", { p_job_id: j3, p_item_id: a?.item_id });
  check("resolving twice changes nothing", !again.error && (await statusOf(a?.item_id)) === "out", again.error);

  const j4 = await newJob("in_stock");
  const made = await user.rpc("resolve_job_new", { p_job_id: j4, p_name: "E2E Manual Item", p_brand: null, p_size: null, p_categories: ["other"] });
  if (made.data) touchedItems.add(made.data);
  check("user enters a red job manually", !made.error && (await getJob(j4))?.status === "green", made.error);
  const bad = await user.rpc("resolve_job_new", { p_job_id: await newJob("in_stock"), p_name: "x", p_brand: null, p_size: null, p_categories: ["not_a_category"] });
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
  for (const id of touchedItems) await admin.from("items").delete().eq("id", id).eq("created_by", userId); // cascades to images and status log
  for (const id of jobIds) await admin.from("intake_jobs").delete().eq("id", id);
  await admin.storage.from("intake-photos").remove(photoPaths);
  await admin.auth.admin.deleteUser(userId);
}
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
