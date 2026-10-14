import { test } from "node:test";
import assert from "node:assert/strict";
import { blocklistReason, decide, type ModelOutput } from "./guardrail";

const accept = (over: Partial<ModelOutput> = {}): ModelOutput => ({
  verdict: "accept",
  reject_reason: null,
  name: "Barilla Thin Spaghetti",
  brand: "Barilla",
  size: null,
  categories: ["pasta_grains_rice"],
  confidence: "high",
  note: null,
  ...over,
});

test("accepts an ordinary grocery item", () => {
  const d = decide(accept());
  assert.equal(d.kind, "accept");
});

test("a reject verdict carries its reason, defaulting to not_grocery", () => {
  assert.deepEqual(decide(accept({ verdict: "reject", reject_reason: "medicine", name: "", categories: [] })), { kind: "reject", reason: "medicine" });
  assert.deepEqual(decide(accept({ verdict: "reject", reject_reason: null, name: "", categories: [] })), { kind: "reject", reason: "not_grocery" });
});

test("blocklist overrides an accept verdict", () => {
  assert.deepEqual(decide(accept({ name: "Corona Extra Beer" })), { kind: "reject", reason: "alcohol" });
  assert.deepEqual(decide(accept({ name: "Juul Pods", categories: ["other"] })), { kind: "reject", reason: "tobacco_vape" });
  assert.deepEqual(decide(accept({ name: "Advil Liqui-Gels", brand: "Advil" })), { kind: "reject", reason: "medicine" });
  assert.deepEqual(decide(accept({ note: "label also says vodka" })), { kind: "reject", reason: "alcohol" });
});

test("blocklist catches plurals, case, accents and non-alcoholic versions", () => {
  assert.equal(blocklistReason("WINES"), "alcohol");
  assert.equal(blocklistReason("Heineken 0.0 Non-Alcoholic"), "alcohol");
  assert.equal(blocklistReason("Sauvignon Blanc Cooking Wine"), "alcohol");
  assert.equal(blocklistReason("Margarita Mix"), "alcohol");
  assert.equal(blocklistReason("Cafe Rhum"), null);
});

test("ordinary grocery words that merely contain a blocked substring pass", () => {
  for (const ok of [
    "Canada Dry Ginger Ale",
    "A&W Root Beer",
    "Red Wine Vinegar",
    "Scotch-Brite Sponges",
    "Rumford Baking Powder",
    "Ginger Snap Cookies",
    "Vitamin C Gummies",
    "Orgain Protein Powder",
    "Apple Cider Vinegar",
    "Mott's Apple Cider",
    "Nature Made Melatonin",
  ]) {
    assert.equal(blocklistReason(ok), null, ok);
  }
});

test("a malformed accept throws so the model chain retries", () => {
  assert.throws(() => decide(accept({ name: "  " })));
  assert.throws(() => decide(accept({ categories: [] })));
  assert.throws(() => decide(accept({ categories: ["other", "snacks"] })));
});

test("other is accepted alone (held out of the public catalog by the database)", () => {
  const d = decide(accept({ name: "Reusable Shopping Bag", categories: ["other"] }));
  assert.equal(d.kind, "accept");
});
