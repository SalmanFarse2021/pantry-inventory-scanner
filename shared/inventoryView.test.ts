import { test } from "node:test";
import assert from "node:assert/strict";
import { availabilityOf, filterInventory, type InventoryRow } from "./inventoryView";

const row = (o: Partial<InventoryRow> & { name: string }): InventoryRow => ({
  id: o.name,
  brand: null,
  categories: ["snacks"],
  thumbnail_path: null,
  limit_per_visit: null,
  stock: 5,
  created_at: "2026-10-05T00:00:00Z",
  ...o,
});

const rows = [
  row({ name: "Ritz Crackers", brand: "Nabisco", stock: 2 }),
  row({ name: "Barilla Spaghetti", categories: ["pasta_grains_rice"], stock: 0, created_at: "2026-10-06T00:00:00Z" }),
  row({ name: "Café Mocha", categories: ["beverages"], stock: 12 }),
];
const base = { search: "", category: null, availability: null, sort: "name" } as const;

test("availability thresholds", () => {
  assert.equal(availabilityOf(0), "out");
  assert.equal(availabilityOf(-1), "out");
  assert.equal(availabilityOf(3), "low");
  assert.equal(availabilityOf(4), "in_stock");
});

test("search matches name, brand and category, ignoring accents and case", () => {
  assert.deepEqual(filterInventory(rows, { ...base, search: "cafe" }).map((r) => r.name), ["Café Mocha"]);
  assert.deepEqual(filterInventory(rows, { ...base, search: "nabisco ritz" }).map((r) => r.name), ["Ritz Crackers"]);
  assert.deepEqual(filterInventory(rows, { ...base, search: "pasta grains" }).map((r) => r.name), ["Barilla Spaghetti"]);
});

test("category and availability filters combine", () => {
  assert.deepEqual(filterInventory(rows, { ...base, availability: "out" }).map((r) => r.name), ["Barilla Spaghetti"]);
  assert.deepEqual(filterInventory(rows, { ...base, category: "snacks", availability: "low" }).map((r) => r.name), ["Ritz Crackers"]);
  assert.deepEqual(filterInventory(rows, { ...base, category: "snacks", availability: "out" }), []);
});

test("sorting", () => {
  assert.deepEqual(filterInventory(rows, { ...base, sort: "stock_asc" }).map((r) => r.stock), [0, 2, 12]);
  assert.deepEqual(filterInventory(rows, { ...base, sort: "stock_desc" }).map((r) => r.stock), [12, 2, 0]);
  assert.equal(filterInventory(rows, { ...base, sort: "newest" })[0].name, "Barilla Spaghetti");
});
