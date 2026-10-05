// RLS test: runs as anonymous, worker and manager and checks every blocked action is blocked.
// Needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY in .env. Run against a
// dev/staging project: it creates and deletes throwaway users and items.
//
//   npm run rls-test

import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
const serviceKey = process.env.SUPABASE_SECRET_KEY!;
if (!url || !anonKey || !serviceKey) throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY in .env");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = () => createClient(url, anonKey, { auth: { persistSession: false } });

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
}

const stamp = Date.now();
const password = `Tmp-${stamp}-pw!`;

async function makeUser(label: string, role: "worker" | "manager" | null) {
  const email = `rls-${label}-${stamp}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  if (role) await admin.from("staff").insert({ user_id: id, email, role }).throwOnError();
  const client = anon();
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id, client };
}

const stockOf = async (itemId: string) => {
  const { data } = await admin.from("inventory_events").select("delta").eq("item_id", itemId);
  return (data ?? []).reduce((n, r) => n + r.delta, 0);
};

async function main() {
  const worker = await makeUser("worker", "worker");
  const manager = await makeUser("manager", "manager");
  const outsider = await makeUser("outsider", null); // valid login, not in staff
  const guest = anon();
  const createdUsers = [worker.id, manager.id, outsider.id];

  // Fixtures via service role.
  const { data: item } = await admin.from("items")
    .insert({ name: "RLS Test Beans", categories: ["canned_jarred"], limit_per_visit: 2, created_by: manager.id })
    .select().single().throwOnError();
  const itemId = item!.id as string;
  await admin.from("inventory_events").insert({ item_id: itemId, type: "intake", delta: 5, actor: manager.id }).throwOnError();

  try {
    // ----- anonymous -----
    const aItems = await guest.from("items").select("id");
    check("anon cannot read items", (aItems.data ?? []).length === 0, aItems);
    const aEvents = await guest.from("inventory_events").select("id");
    check("anon cannot read ledger", (aEvents.data ?? []).length === 0, aEvents);
    const aStaff = await guest.from("staff").select("user_id");
    check("anon cannot read staff", (aStaff.data ?? []).length === 0, aStaff);
    const aJobs = await guest.from("intake_jobs").select("id");
    check("anon cannot read intake_jobs", (aJobs.data ?? []).length === 0, aJobs);
    const aUsage = await guest.from("api_usage").select("model");
    check("anon cannot read api_usage", (aUsage.data ?? []).length === 0, aUsage);
    const aView = await guest.from("available_items").select("*").eq("id", itemId);
    check("anon can read available_items", aView.data?.length === 1 && aView.data[0].availability === "in_stock", aView);
    check("available_items exposes no counts", aView.data?.[0] && !("stock" in aView.data[0]) && !("count" in aView.data[0]), aView.data);
    const aCats = await guest.from("categories").select("slug");
    check("anon can read categories", (aCats.data ?? []).length === 18, aCats);
    const aInsertItem = await guest.from("items").insert({ name: "x", categories: ["other"] });
    check("anon cannot insert items", !!aInsertItem.error, aInsertItem);
    const aInsertEvent = await guest.from("inventory_events").insert({ item_id: itemId, type: "intake", delta: 100 });
    check("anon cannot insert ledger rows directly", !!aInsertEvent.error, aInsertEvent);
    const aStaffInsert = await guest.from("staff").insert({ user_id: outsider.id, email: "a@b.c", role: "manager" });
    check("anon cannot insert staff", !!aStaffInsert.error, aStaffInsert);

    // ----- anonymous checkout -----
    const c0 = await guest.rpc("checkout_item", { p_item_id: itemId, p_qty: 0 });
    check("checkout rejects qty 0", !!c0.error, c0);
    const cNeg = await guest.rpc("checkout_item", { p_item_id: itemId, p_qty: -3 });
    check("checkout rejects negative qty", !!cNeg.error, cNeg);
    const cLimit = await guest.rpc("checkout_item", { p_item_id: itemId, p_qty: 3 });
    check("checkout rejects qty over per-visit limit", !!cLimit.error, cLimit);
    const cOk = await guest.rpc("checkout_item", { p_item_id: itemId, p_qty: 2 });
    check("checkout within limit succeeds", !cOk.error, cOk);
    check("stock dropped by 2", (await stockOf(itemId)) === 3, await stockOf(itemId));
    await admin.from("items").update({ limit_per_visit: null }).eq("id", itemId).throwOnError();
    const cOver = await guest.rpc("checkout_item", { p_item_id: itemId, p_qty: 4 });
    check("checkout rejects qty over stock", !!cOver.error, cOver);
    check("stock unchanged after rejected checkouts", (await stockOf(itemId)) === 3, await stockOf(itemId));
    const cMissing = await guest.rpc("checkout_item", { p_item_id: crypto.randomUUID(), p_qty: 1 });
    check("checkout rejects unknown item", !!cMissing.error, cMissing);

    // ----- logged-in but not on the staff list -----
    const oItems = await outsider.client.from("items").select("id");
    check("non-staff login cannot read items", (oItems.data ?? []).length === 0, oItems);
    const oInsert = await outsider.client.from("items").insert({ name: "x", categories: ["other"], created_by: outsider.id });
    check("non-staff login cannot insert items", !!oInsert.error, oInsert);
    const oEvent = await outsider.client.from("inventory_events").insert({ item_id: itemId, type: "adjustment", delta: 50, actor: outsider.id });
    check("non-staff login cannot insert ledger rows", !!oEvent.error, oEvent);

    // ----- worker -----
    const wItems = await worker.client.from("items").select("id").eq("id", itemId);
    check("worker can read items", wItems.data?.length === 1, wItems);
    const wStock = await worker.client.from("item_stock").select("stock").eq("item_id", itemId).single();
    check("worker can read real stock", wStock.data?.stock === 3, wStock);
    const wNew = await worker.client.from("items")
      .insert({ name: "Worker Item", categories: ["snacks"], created_by: worker.id }).select().single();
    check("worker can create items", !wNew.error, wNew);
    const wIntake = await worker.client.from("inventory_events")
      .insert({ item_id: itemId, type: "intake", delta: 2, actor: worker.id });
    check("worker can insert intake event", !wIntake.error, wIntake);
    const wCheckoutEvent = await worker.client.from("inventory_events")
      .insert({ item_id: itemId, type: "checkout", delta: -1, actor: worker.id });
    check("worker cannot insert checkout event directly", !!wCheckoutEvent.error, wCheckoutEvent);
    const wSpoof = await worker.client.from("inventory_events")
      .insert({ item_id: itemId, type: "adjustment", delta: 1, actor: manager.id });
    check("worker cannot spoof another actor", !!wSpoof.error, wSpoof);
    const wUpdateEvent = await worker.client.from("inventory_events").update({ delta: 999 }).eq("item_id", itemId).select();
    check("worker cannot edit ledger rows", !wUpdateEvent.data?.length, wUpdateEvent);
    const wDeleteEvent = await worker.client.from("inventory_events").delete().eq("item_id", itemId).select();
    check("worker cannot delete ledger rows", !wDeleteEvent.data?.length, wDeleteEvent);
    const wDeleteOther = await worker.client.from("items").delete().eq("id", itemId).select();
    check("worker cannot delete items they did not create", !wDeleteOther.data?.length, wDeleteOther);
    if (wNew.data) {
      const wDeleteOwn = await worker.client.from("items").delete().eq("id", wNew.data.id).select();
      check("worker can delete items they created", wDeleteOwn.data?.length === 1, wDeleteOwn);
    }
    const wStaffRead = await worker.client.from("staff").select("user_id");
    check("worker sees only their own staff row", wStaffRead.data?.length === 1 && wStaffRead.data[0].user_id === worker.id, wStaffRead);
    const wPromote = await worker.client.from("staff").update({ role: "manager" }).eq("user_id", worker.id).select();
    check("worker cannot promote self", !wPromote.data?.length, wPromote);
    const wStaffInsert = await worker.client.from("staff").insert({ user_id: outsider.id, email: "o@example.test", role: "worker" });
    check("worker cannot add staff", !!wStaffInsert.error, wStaffInsert);
    const wUsage = await worker.client.from("api_usage").select("model");
    check("worker cannot read api_usage", (wUsage.data ?? []).length === 0, wUsage);

    // ----- manager -----
    const mStaff = await manager.client.from("staff").select("user_id");
    check("manager can read all staff", (mStaff.data ?? []).length >= 2, mStaff);
    const mAdd = await manager.client.from("staff").insert({ user_id: outsider.id, email: `rls-outsider-${stamp}@example.test`, role: "worker" });
    check("manager can add staff", !mAdd.error, mAdd);
    const mDelItem = await manager.client.from("items").delete().eq("id", itemId).select();
    check("manager can delete any item", mDelItem.data?.length === 1, mDelItem);
  } finally {
    await admin.from("items").delete().eq("id", itemId);
    await admin.from("items").delete().like("name", "Worker Item");
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  }

  console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
