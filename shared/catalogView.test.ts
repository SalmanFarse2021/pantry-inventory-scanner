import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCatalog, type CatalogRow } from "./catalogView";

const row = (o: Partial<CatalogRow> & { name: string }): CatalogRow => ({
  id: o.name,
  category: "snacks",
  thumbnail_path: null,
  availability: "in_stock",
  limit_per_visit: null,
  ...o,
});

const rows = [
  row({ name: "Ritz Crackers", availability: "low" }),
  row({ name: "Barilla Spaghetti", category: "pasta_grains_rice", availability: "out" }),
  row({ name: "Café Mocha", category: "beverages" }),
  row({ name: "Apple Juice", category: "beverages" }),
];
const base = { search: "", category: null, hideOut: false };
const names = (r: CatalogRow[]) => r.map((x) => x.name);

test("available items first, out of stock last, then by name", () => {
  assert.deepEqual(names(filterCatalog(rows, base)), ["Apple Juice", "Café Mocha", "Ritz Crackers", "Barilla Spaghetti"]);
});

test("search ignores accents and case, and matches category words", () => {
  assert.deepEqual(names(filterCatalog(rows, { ...base, search: "CAFE" })), ["Café Mocha"]);
  assert.deepEqual(names(filterCatalog(rows, { ...base, search: "pasta spag" })), ["Barilla Spaghetti"]);
});

test("category filter and hide out of stock", () => {
  assert.deepEqual(names(filterCatalog(rows, { ...base, category: "beverages" })), ["Apple Juice", "Café Mocha"]);
  assert.equal(filterCatalog(rows, { ...base, hideOut: true }).some((r) => r.availability === "out"), false);
});
