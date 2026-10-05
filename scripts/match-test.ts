// Re-identification test: do crops from one photo match the same product in another photo?
// Embeds every crop in out/shelf-1 (the "catalog") and out/shelf-2 (the "queries") and, for each
// query, ranks the catalog by cosine similarity.
//
//   npm run match-test                      # default model (CLIP)
//   EMBED_MODEL=Xenova/dinov2-small npm run match-test

import fs from "node:fs";
import path from "node:path";
import { AutoProcessor, CLIPVisionModelWithProjection, AutoModel, RawImage } from "@huggingface/transformers";

const MODEL = process.env.EMBED_MODEL ?? "Xenova/clip-vit-base-patch32";

// Ground truth: query crop (shelf-2) -> catalog crop (shelf-1), 1-indexed, taken from out/*.json names.
const TRUTH: Record<number, number> = { 1: 3, 2: 5, 3: 2, 4: 1 };

const names = (f: string): string[] => JSON.parse(fs.readFileSync(`out/${f}.json`, "utf8")).map((x: { name: string }) => x.name);
const catalogNames = names("shelf-1");
const queryNames = names("shelf-2");

const processor = await AutoProcessor.from_pretrained(MODEL);
const isClip = /clip/i.test(MODEL);
const model = isClip
  ? await CLIPVisionModelWithProjection.from_pretrained(MODEL)
  : await AutoModel.from_pretrained(MODEL);

async function embed(file: string): Promise<Float32Array> {
  const image = await RawImage.read(file);
  const inputs = await processor(image);
  const out = await model(inputs);
  const t = isClip ? out.image_embeds : (out.pooler_output ?? out.last_hidden_state.mean(1));
  const v = Float32Array.from(t.data as ArrayLike<number>);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
const files = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => path.join(dir, f));

console.log(`model: ${MODEL}\n`);
const catalog = await Promise.all(files("out/shelf-1").map(embed));
const queries = await Promise.all(files("out/shelf-2").map(embed));

let top1 = 0;
queries.forEach((q, qi) => {
  const ranked = catalog.map((c, ci) => ({ ci, score: cos(q, c) })).sort((a, b) => b.score - a.score);
  const want = TRUTH[qi + 1] - 1;
  const rank = ranked.findIndex((r) => r.ci === want) + 1;
  if (rank === 1) top1++;
  console.log(`query: ${queryNames[qi]}  -> correct match is "${catalogNames[want]}"  (rank ${rank}/${catalog.length})`);
  for (const r of ranked.slice(0, 3)) {
    console.log(`   ${r.ci === want ? "✓" : " "} ${r.score.toFixed(3)}  ${catalogNames[r.ci]}`);
  }
});
console.log(`\ntop-1 accuracy: ${top1}/${queries.length}`);
