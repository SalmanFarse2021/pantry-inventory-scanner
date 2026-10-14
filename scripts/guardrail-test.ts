// Run photos through the REAL intake prompt, schema and guardrail (shared/), one request per photo,
// and print the verdict the pipeline would reach. Use it with photos that should pass and photos
// that should be rejected (alcohol, medicine, a person, ...).
//
//   npx tsx scripts/guardrail-test.ts a.jpg b.jpg
//   DIR=test_pictures/guardrail npx tsx scripts/guardrail-test.ts      # every image in a folder
//   MODEL=gemini-3.1-flash-lite npx tsx scripts/guardrail-test.ts ...
//
// Name files with the expected outcome to get a pass/fail summary: "reject_beer.jpg" should be
// rejected, "accept_soup.jpg" should be accepted. Other names are just printed.

import fs from "node:fs";
import path from "node:path";
import { FinishReason, GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import sharp from "sharp";
import { z } from "zod";
import { decide, ModelOutputSchema, type Decision } from "../shared/guardrail";
import { IDENTIFY_SYSTEM, parseModelJson } from "../shared/identifyItem";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const MODEL = process.env.MODEL ?? "gemini-3.5-flash-lite";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SAFETY = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));
const BLOCKED = [FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.IMAGE_SAFETY];

const prepare = async (file: string) =>
  (await sharp(file).rotate().resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64");

async function run(file: string): Promise<{ decision: Decision; via: string }> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: await prepare(file) } }, { text: "Identify and categorize this product." }] }],
    config: {
      systemInstruction: IDENTIFY_SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(ModelOutputSchema),
      ...(MODEL.startsWith("gemini") && { safetySettings: SAFETY }),
    },
  });
  if (response.promptFeedback?.blockReason || BLOCKED.includes(response.candidates?.[0]?.finishReason as FinishReason)) {
    return { decision: { kind: "reject", reason: "inappropriate" }, via: "gemini safety filter" };
  }
  const out = ModelOutputSchema.parse(parseModelJson(response.text ?? ""));
  const decision = decide(out);
  const via = out.verdict === "reject" ? "model" : decision.kind === "reject" ? "blocklist" : "model";
  return { decision, via };
}

const args = process.argv.slice(2);
const dir = process.env.DIR;
const files = args.length ? args : dir ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => path.join(dir, f)) : [];
if (!files.length) {
  console.error("give image paths or set DIR=folder");
  process.exit(1);
}

console.log(`model: ${MODEL}\n`);
let checked = 0;
let wrong = 0;
for (const file of files) {
  const expected = /^(accept|reject)_/.exec(path.basename(file))?.[1];
  try {
    const { decision, via } = await run(file);
    const result = decision.kind === "accept" ? `ACCEPT  ${decision.item.name}  ->  ${decision.item.categories.join(" + ")}${decision.item.categories[0] === "other" ? "  (held for review)" : ""}` : `REJECT  ${decision.reason} (by ${via})`;
    const mark = expected ? (expected === decision.kind ? "ok   " : "WRONG") : "     ";
    if (expected) {
      checked++;
      if (expected !== decision.kind) wrong++;
    }
    console.log(`${mark} ${path.basename(file).padEnd(30)} ${result}`);
  } catch (err) {
    console.log(`ERROR ${path.basename(file).padEnd(30)} ${err instanceof Error ? err.message.slice(0, 160) : err}`);
  }
}
if (checked) console.log(`\n${checked - wrong}/${checked} matched the expected outcome`);
