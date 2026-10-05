// Experiment: N single-item photos in ONE Gemini request (vs. one request per photo in identify.ts).
// Each photo is labeled "Photo i" in the prompt and the model returns one entry per photo with its index.
//
// Usage (GEMINI_API_KEY is read from .env):
//   npm run identify-batch -- a.jpg b.jpg c.jpg ...
//   MODEL=gemini-3.1-flash-lite npm run identify-batch -- ...

import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { z } from "zod";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const MODEL = process.env.MODEL ?? "gemini-3.5-flash";

const CATEGORIES = [
  "produce",
  "canned_jarred",
  "soup_broth",
  "pasta_grains_rice",
  "bread_bakery",
  "breakfast_cereal",
  "snacks",
  "beverages",
  "dairy_eggs",
  "meat_protein",
  "frozen",
  "condiments_sauces_spices",
  "baking",
  "baby",
  "supplements",
  "personal_care",
  "household",
  "other",
] as const;

const ItemSchema = z.object({
  photo: z.number().int().describe("1-based index of the photo this entry describes"),
  name: z.string().describe("Short display name: brand + product, e.g. \"Barilla Spaghetti\""),
  brand: z.string().nullable(),
  size: z.string().nullable().describe("Package size ONLY if clearly legible in the photo; otherwise null. Never guess."),
  category: z.enum(CATEGORIES),
  subcategory: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().nullable().describe("Only if something needs the worker's attention"),
});
const ResultSchema = z.object({ items: z.array(ItemSchema) });

const SYSTEM = `You help a school pantry worker log donated items. You receive several photos, each showing ONE \
product held in a hand, each preceded by a "Photo N" label. Return exactly one entry per photo, with "photo" set to N.

- Name it the way a person would write it on an inventory sheet: brand + product (+ variety if it matters).
- Read the label. If you cannot read enough to be sure, give your best guess, set confidence to "low", \
and say what is uncertain in "note". Never invent a brand you cannot see.`;

async function prepare(file: string): Promise<string> {
  const buf = await sharp(file)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return buf.toString("base64");
}

const files = process.argv.slice(2);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const parts: object[] = [];
for (const [i, file] of files.entries()) {
  parts.push({ text: `Photo ${i + 1}:` });
  parts.push({ inlineData: { mimeType: "image/jpeg", data: await prepare(file) } });
}
parts.push({ text: `Identify and categorize the product in each of the ${files.length} photos.` });

console.log(`model: ${MODEL}, ${files.length} photos in one request`);
const started = Date.now();
const response = await ai.models.generateContent({
  model: MODEL,
  contents: [{ role: "user", parts }],
  config: {
    systemInstruction: SYSTEM,
    responseMimeType: "application/json",
    responseJsonSchema: z.toJSONSchema(ResultSchema),
  },
});

const { items } = ResultSchema.parse(JSON.parse(response.text ?? ""));
const u = response.usageMetadata;
console.log(
  `${items.length} entries, ${((Date.now() - started) / 1000).toFixed(1)}s, ` +
    `tokens: ${u?.totalTokenCount ?? 0} total = ${u?.promptTokenCount ?? 0} prompt + ${u?.candidatesTokenCount ?? 0} output + ${u?.thoughtsTokenCount ?? 0} thinking\n`,
);
for (const it of items.sort((a, b) => a.photo - b.photo)) {
  console.log(
    `${String(it.photo).padStart(2)}. ${it.name}${it.size ? ` [${it.size}]` : ""} -> ${it.category} / ${it.subcategory} (${it.confidence})` +
      (it.note ? `\n    note: ${it.note}` : ""),
  );
}
