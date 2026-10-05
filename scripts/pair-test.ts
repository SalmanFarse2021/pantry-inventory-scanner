// Same-item re-photo test over every "<name>1" / "<name>2" pair in test_pictures/.
// Catalog = every photo that is not a "2" photo (duplicates removed by file hash).
// Each "2" photo is a query that should match its own "1" photo.
//
//   npx tsx scripts/pair-test.ts
//   EMBED_MODEL=Xenova/dinov2-small npx tsx scripts/pair-test.ts

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const MODEL = process.env.EMBED_MODEL ?? "Xenova/clip-vit-base-patch32";
const DIR = "test_pictures";

const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL);

// "center": resize, then CLIP's own center-crop (cuts the edges of non-square photos).
// "pad": shrink the whole photo into a square so nothing is cut.
async function embed(file: string, mode: "center" | "pad", angle = 0): Promise<Float32Array> {
  const oriented = await sharp(file).rotate().flatten({ background: "#ffffff" }).toBuffer(); // webp/png may have alpha
  const img = angle ? sharp(oriented).rotate(angle) : sharp(oriented);
  const buf = await (mode === "pad"
    ? img.resize(512, 512, { fit: "contain", background: "#808080" })
    : img.resize({ width: 512, height: 512, fit: "inside" })
  ).jpeg().toBuffer();
  const out = await model(await processor(await RawImage.fromBlob(new Blob([new Uint8Array(buf)]))));
  const v = Float32Array.from(out.image_embeds.data as ArrayLike<number>);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
const hash = (f: string) => crypto.createHash("md5").update(fs.readFileSync(path.join(DIR, f))).digest("hex");

const files = fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const isNamed = (f: string) => !f.startsWith("IMG_");
const queries = files.filter((f) => /^[a-z]+2\./i.test(f));
const queryHashes = new Set(queries.map(hash));
const namedHashes = new Set(files.filter(isNamed).map(hash));

// Catalog: skip "2" photos, and skip IMG_ files that are copies of a named file or of a query.
const catalog = files.filter((f) => {
  if (queries.includes(f)) return false;
  if (!isNamed(f) && (queryHashes.has(hash(f)) || namedHashes.has(hash(f)))) return false;
  return true;
});

console.log(`model: ${MODEL}`);
console.log(`catalog: ${catalog.length} photos, queries: ${queries.length}\n`);

const ANGLES = [0, 90, 180, 270];
for (const label of ["center", "pad", "pad+rot"] as const) {
  const mode = label === "center" ? "center" : "pad";
  const rot = label === "pad+rot";
  const emb = new Map<string, Float32Array>();
  for (const f of catalog) emb.set(f, await embed(path.join(DIR, f), mode));
  // With rotation tolerance each query keeps one embedding per angle; the score is the best of them.
  const qEmb = new Map<string, Float32Array[]>();
  for (const q of queries) {
    qEmb.set(q, await Promise.all((rot ? ANGLES : [0]).map((a) => embed(path.join(DIR, q), mode, a))));
  }

  console.log(`=== ${label} ===`);
  let top1 = 0;
  for (const q of queries) {
    const stem = q.replace(/2\.[a-z]+$/i, "1");
    const truth = catalog.find((f) => f.startsWith(`${stem}.`))!;
    const ranked = catalog
      .map((f) => ({ f, score: Math.max(...qEmb.get(q)!.map((v) => cos(v, emb.get(f)!))) }))
      .sort((a, b) => b.score - a.score);
    const rank = ranked.findIndex((r) => r.f === truth) + 1;
    if (rank === 1) top1++;
    const correct = ranked[rank - 1];
    const bestWrong = ranked.find((r) => r.f !== truth)!;
    console.log(
      `${q.padEnd(16)} rank ${rank}/${catalog.length}  correct ${correct?.score.toFixed(3)}  best wrong ${bestWrong.score.toFixed(3)} (${bestWrong.f})  gap ${((correct?.score ?? 0) - bestWrong.score).toFixed(3)}`,
    );
    if (rank !== 1) for (const r of ranked.slice(0, 3)) console.log(`     ${r.f === truth ? "✓" : " "} ${r.score.toFixed(3)}  ${r.f}`);
  }
  console.log(`top-1: ${top1}/${queries.length}\n`);
}
