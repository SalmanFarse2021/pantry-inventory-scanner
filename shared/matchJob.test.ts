import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultsToNewItem, matchJob } from "./matchJob";

const catalog = [
  { id: "1", name: "Ritz Crackers" },
  { id: "2", name: "Better Than Bouillon Roasted Beef Base" },
  { id: "3", name: "Barilla Spaghetti" },
];

test("Ritz Cracker resolves to the existing Ritz Crackers", () => {
  assert.deepEqual(matchJob("Ritz Cracker", catalog), { kind: "green", itemId: "1" });
});

test("a sibling variety is never green", () => {
  const m = matchJob("Better Than Bouillon Roasted Chicken Base", catalog);
  assert.equal(m.kind, "yellow");
  assert.ok(m.kind === "yellow" && defaultsToNewItem(m.candidates));
});

test("an unrelated name is new", () => {
  assert.deepEqual(matchJob("Kirkland Pepper", catalog), { kind: "new" });
});

test("a name that only adds a word is yellow, not new item by default", () => {
  const m = matchJob("Barilla Whole Grain Spaghetti", catalog);
  assert.equal(m.kind, "yellow");
  assert.ok(m.kind === "yellow" && !defaultsToNewItem(m.candidates));
});
