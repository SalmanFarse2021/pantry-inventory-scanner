// Gemini-first pipeline test on test_pictures/lookalikes/ (files named family_variant_n.jpg).
// Each photo is identified PASSES times (one photo per request). Results are cached in
// out/name-test/results.json so re-running the report never spends quota; FRESH=1 starts over.
//
// Then the report shows: names per item across passes, category stability, and a catalog
// simulation: one name per item as the "existing" catalog, every other result as a new scan.
//
//   npx tsx scripts/name-test.ts
//   MODEL=gemini-3.1-flash-lite PASSES=2 npx tsx scripts/name-test.ts

import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { z } from "zod";
import { CATEGORIES, CategoriesSchema, MAX_CATEGORIES } from "../shared/categories";
import { decideMatch } from "../shared/decideMatch";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const MODEL = process.env.MODEL ?? "gemini-3.5-flash-lite";
const PASSES = Number(process.env.PASSES ?? 2);
const DIR = "test_pictures/lookalikes";
const CACHE = "out/name-test/results.json";

const ItemSchema = z.object({
  name: z.string().describe('Brand + product + variety, no package size. e.g. "Barilla Whole Grain Thin Spaghetti"'),
  brand: z.string().nullable(),
  size: z.string().nullable().describe("Package size ONLY if clearly legible; otherwise null. Never guess."),
  categories: CategoriesSchema.describe(`1 to ${MAX_CATEGORIES} categories from the fixed list, primary first`),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().nullable().describe("Only if something needs the worker's attention"),
});
type Item = z.infer<typeof ItemSchema>;

const SYSTEM = `You help a school pantry worker log donated items. The photo shows ONE product, usually held \
in hand or on a counter. Return that product.

- name: brand + product + variety, the way it would be written on an inventory sheet. Include the variety \
(flavor, type, grind, strength) when the label shows it, because the same brand sells several. Do not include package size.
- Read the label. If you cannot read enough to be sure, give your best guess, set confidence to "low", and \
say what is uncertain in "note". Never invent a brand you cannot see.
- categories: choose ONLY from this fixed list: ${CATEGORIES.join(", ")}. Use the single best category. Add a \
second or third only if the product genuinely belongs to more than one (for example a protein bar that is both \
snacks and supplements). Primary category first. Never invent a category. Use "other" only when nothing fits, and then alone.`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function prepare(file: string): Promise<string> {
  return (await sharp(file).rotate().resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64");
}

type Row = { file: string; variant: string; pass: number; item?: Item; error?: string; seconds?: number };
const rows: Row[] = fs.existsSync(CACHE) && !process.env.FRESH ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : [];
const save = () => { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(rows, null, 2)); };

const files = fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const variantOf = (f: string) => path.parse(f).name.replace(/_\d+$/, "");

async function callOnce(file: string): Promise<Item> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: await prepare(path.join(DIR, file)) } }, { text: "Identify and categorize this product." }] }],
    config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(ItemSchema) },
  });
  return ItemSchema.parse(JSON.parse(response.text ?? ""));
}

let quotaHit = false;
for (let pass = 1; pass <= PASSES && !quotaHit; pass++) {
  for (const file of files) {
    if (rows.some((r) => r.file === file && r.pass === pass && r.item)) continue;
    const started = Date.now();
    let item: Item | undefined;
    let error: string | undefined;
    for (let attempt = 1; attempt <= 2 && !item; attempt++) { // a bad answer gets one retry
      try { item = await callOnce(file); } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 200) : String(e);
        if (error.includes('"code":429')) { quotaHit = true; break; }
        if (/"code":\s*503/.test(error)) await new Promise((r) => setTimeout(r, 3000));
      }
    }
    rows.splice(0, rows.length, ...rows.filter((r) => !(r.file === file && r.pass === pass)), { file, variant: variantOf(file), pass, item, error: item ? undefined : error, seconds: (Date.now() - started) / 1000 });
    save();
    console.log(`pass ${pass} ${file.padEnd(26)} ${item ? item.name : `FAILED: ${error}`}`);
    if (quotaHit) { console.log("quota hit, stopping. Re-run later; finished results are cached."); break; }
  }
}

const ok = rows.filter((r) => r.item);
console.log(`\nmodel ${MODEL}: ${ok.length}/${files.length * PASSES} results (${rows.length - ok.length} failed)\n`);

// 1. Names and categories per item.
const variants = [...new Set(files.map(variantOf))];
console.log("=== names and categories per item (photo n, pass p) ===");
let catUnstable = 0;
for (const v of variants) {
  const rs = ok.filter((r) => r.variant === v).sort((a, b) => a.file.localeCompare(b.file) || a.pass - b.pass);
  console.log(`\n${v}`);
  for (const r of rs) console.log(`  ${r.file.replace(/\.\w+$/, "").slice(v.length + 1)}/p${r.pass}  ${r.item!.name}${r.item!.size ? ` [${r.item!.size}]` : ""}  ->  ${r.item!.categories.join(" + ")}  (${r.item!.confidence})`);
  const sets = new Set(rs.map((r) => [...r.item!.categories].sort().join("+")));
  const primaries = new Set(rs.map((r) => r.item!.categories[0]));
  if (sets.size > 1) { catUnstable++; console.log(`  category sets differ: ${[...sets].join(" | ")}${primaries.size > 1 ? "  (PRIMARY differs)" : ""}`); }
}
console.log(`\nitems whose category set varied: ${catUnstable}/${variants.length}`);

// 2. Catalog simulation. The catalog holds the name from photo 1, pass 1 of each item (what the
// first scan would have created). Every other result is a later scan of some item.
const catalog = variants.flatMap((v) => {
  const first = ok.find((r) => r.variant === v && r.pass === 1 && r.file.endsWith(`_1${path.extname(r.file)}`));
  return first ? [{ name: first.item!.name, variant: v }] : [];
});
console.log("\n=== catalog simulation ===");
console.log("catalog: " + catalog.map((c) => `${c.variant}="${c.name}"`).join("; ") + "\n");
const tally = { greenOk: 0, greenWrong: 0, yellowRight: 0, yellowWrongOnly: 0, newItem: 0 };
for (const r of ok) {
  if (r.pass === 1 && r.file.includes("_1.")) continue; // that is the catalog entry itself
  const d = decideMatch(r.item!.name, catalog);
  let label: string;
  if (d.kind === "green") { const right = d.item.variant === r.variant; right ? tally.greenOk++ : tally.greenWrong++; label = right ? "green ok" : `GREEN WRONG -> ${d.item.variant}`; }
  else if (d.kind === "yellow") { const hit = d.candidates.some((c) => c.item.variant === r.variant); hit ? tally.yellowRight++ : tally.yellowWrongOnly++; label = `yellow ${d.candidates.map((c) => `${c.item.variant}(${c.relation})`).join(", ")}${hit ? "" : "  [correct item not offered]"}`; }
  else { tally.newItem++; label = "NEW (would create a duplicate item)"; }
  console.log(`${r.file.replace(/\.\w+$/, "").padEnd(24)} p${r.pass}  "${r.item!.name}"  =>  ${label}`);
}
const total = Object.values(tally).reduce((a, b) => a + b, 0);
console.log(`\nof ${total} later scans: green correct ${tally.greenOk}, GREEN WRONG ${tally.greenWrong}, yellow with correct item offered ${tally.yellowRight}, yellow without it ${tally.yellowWrongOnly}, new ${tally.newItem}`);
