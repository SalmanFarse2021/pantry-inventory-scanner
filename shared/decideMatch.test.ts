import assert from "node:assert/strict";
import { test } from "node:test";
import { decideMatch } from "./decideMatch";
import { normalizeName } from "./normalizeName";

const cat = (...names: string[]) => names.map((name, id) => ({ id, name }));
const kind = (name: string, catalog: string[]) => decideMatch(name, cat(...catalog)).kind;

test("normalize drops sizes, keeps product numbers, singularizes", () => {
  assert.deepEqual(normalizeName("Barilla Spaghetti 1 LB (454 g)"), { words: ["barilla", "spaghetti"], numbers: [] });
  assert.deepEqual(normalizeName("365 Whole Foods Market Organic Chicken Broth Low Sodium 32 FL OZ").numbers, ["365"]);
  assert.deepEqual(normalizeName("Kimono Mom's Umami Furikake").words, ["kimono", "mom", "umami", "furikake"]);
  assert.deepEqual(normalizeName("Ritz Crackers").words, ["ritz", "cracker"]);
  assert.deepEqual(normalizeName("Nutricost Niacinamide 500 mg 240 Capsules"), { words: ["nutricost", "niacinamide", "mg"], numbers: ["500"] });
});

test("identical and trivially different names resolve green", () => {
  assert.equal(kind("Ritz Cracker", ["Ritz Crackers"]), "green");
  assert.equal(kind("Barilla Spaghetti", ["Barilla Spaghetti 32 oz"]), "green");
  assert.equal(kind("Kimono Mom Umami Furikake", ["Kimono Mom's Umami Furikake"]), "green");
  assert.equal(kind("BARILLA  SPAGHETTI", ["Barilla Spaghetti"]), "green");
});

test("a one or two letter typo inside a longer word still resolves green", () => {
  assert.equal(kind("Kirkland Signature Pepper", ["Kirkland Signature Peper"]), "green");
  assert.equal(kind("Nutricost Niacinamide", ["Nutricost Niacinimide"]), "green");
});

test("siblings that differ by a variety word never resolve green", () => {
  assert.notEqual(kind("Better Than Bouillon Roasted Beef Base", ["Better Than Bouillon Roasted Chicken Base"]), "green");
  assert.notEqual(kind("Kirkland Signature Pepper", ["Kirkland Signature Sea Salt"]), "green");
  assert.notEqual(kind("Pepper Fine", ["Pepper Coarse"]), "green");
  assert.notEqual(kind("Chosen Foods Avocado Oil", ["Trader Joe's Avocado Oil"]), "green");
});

test("a sibling is offered as a candidate, not hidden", () => {
  const d = decideMatch("Better Than Bouillon Beef Base", cat("Better Than Bouillon Chicken Base"));
  assert.equal(d.kind, "yellow");
  if (d.kind === "yellow") assert.equal(d.candidates[0].relation, "one_word_off");
});

test("short words must match exactly", () => {
  assert.notEqual(kind("Beef Broth", ["Beet Broth"]), "green");
  assert.notEqual(kind("Sea Salt Fine", ["Sea Salt Fire"]), "green");
});

test("dropped variety words go to review, not green", () => {
  assert.equal(kind("Central Market Crunchy Peanut Butter", ["Central Market Salted Crunchy Peanut Butter"]), "yellow");
  assert.equal(kind("Zab's Hot Honey", ["Zab's Datil Pepper Hot Honey"]), "yellow");
});

test("different numbers need a check", () => {
  assert.equal(kind("Nutricost Niacinamide 500 mg", ["Nutricost Niacinamide 250 mg"]), "yellow");
  assert.equal(kind("Nutricost Niacinamide 500 mg", ["Nutricost Niacinamide 500 mg"]), "green");
});

test("size differences alone do not matter", () => {
  assert.equal(kind("Barilla Spaghetti 16 oz", ["Barilla Spaghetti 32 oz"]), "green");
});

test("unrelated names are new", () => {
  assert.equal(kind("Starbucks Hot Cocoa Mix", ["Barilla Spaghetti", "Ritz Crackers"]), "new");
  assert.equal(kind("Anything", []), "new");
});

test("an exact match beside a sibling still resolves", () => {
  const d = decideMatch("Better Than Bouillon Beef Base", cat("Better Than Bouillon Chicken Base", "Better Than Bouillon Beef Base"));
  assert.equal(d.kind, "green");
  if (d.kind === "green") assert.equal(d.item.id, 1);
});
