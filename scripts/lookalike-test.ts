// Look-alike test with q8 embeddings (what the browser runs). Photos live in
// test_pictures/lookalikes/ named  <family>_<variant>_<n>.jpg  e.g.  pasta_penne_1.jpg,
// pasta_penne_2.jpg, pasta_fusilli_1.jpg. Same family = look-alike siblings.
//
// Leave-one-out: every lookalike photo is a query against all the OTHER photos. Items score as the
// best of their photos. Then a threshold sweep shows, for "auto-resolve if score >= T and gap >= G",
// how many queries are correct-auto, wrong-auto (false green) and sent on to the LLM.
//
//   npx tsx scripts/lookalike-test.ts
//   DIR=some/other/folder npx tsx scripts/lookalike-test.ts

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const MODEL = "Xenova/clip-vit-base-patch32";
const DIR = process.env.DIR ?? "test_pictures/lookalikes";
const EXTRA_DIR = "test_pictures"; // unrelated items used only as distractors

const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });

type Mode = "center" | "pad" | "guide";
// center: resize, then CLIP's center-crop. pad: whole photo shrunk into a square.
// guide: central 80% square, simulating a capture-screen framing guide that fills the frame.
async function embed(file: string, mode: Mode): Promise<Float32Array> {
  const oriented = await sharp(file).rotate().flatten({ background: "#ffffff" }).toBuffer();
  let img = sharp(oriented);
  if (mode === "guide") {
    const { width = 0, height = 0 } = await sharp(oriented).metadata();
    const side = Math.round(Math.min(width, height) * 0.8);
    img = img.extract({ left: Math.round((width - side) / 2), top: Math.round((height - side) / 2), width: side, height: side });
  }
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
const hash = (f: string) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const isImage = (f: string) => /\.(jpe?g|png|webp)$/i.test(f);

type Photo = { file: string; family: string; variant: string; query: boolean };
const photos: Photo[] = [];
for (const f of fs.readdirSync(DIR).filter(isImage).sort()) {
  const m = path.parse(f).name.match(/^([^_]+)_([^_]+)_\d+$/);
  if (!m) { console.log(`skipping ${f}: name must look like family_variant_1.jpg`); continue; }
  photos.push({ file: path.join(DIR, f), family: m[1], variant: `${m[1]}_${m[2]}`, query: true });
}
if (DIR === "test_pictures/lookalikes") {
  // Distractors: older unrelated photos, one-per-item, deduped by hash. Never used as queries.
  const seen = new Set(photos.map((p) => hash(p.file)));
  for (const f of fs.readdirSync(EXTRA_DIR).filter(isImage).sort()) {
    const file = path.join(EXTRA_DIR, f);
    if (/^[a-z]+[2-9]\./i.test(f) || seen.has(hash(file))) continue;
    seen.add(hash(file));
    photos.push({ file, family: `other-${f}`, variant: `other-${f}`, query: false });
  }
}
const variants = new Set(photos.filter((p) => p.query).map((p) => p.variant));
for (const v of variants) {
  if (photos.filter((p) => p.variant === v).length < 2) console.log(`warning: ${v} has only one photo, it cannot be a query`);
}
console.log(`model ${MODEL} q8; ${photos.filter((p) => p.query).length} query photos, ${photos.length} total, ${variants.size} variants\n`);

const Ts = [0.7, 0.75, 0.8, 0.85, 0.9];
const Gs = [0, 0.05, 0.1, 0.15];
for (const mode of ["center", "pad", "guide"] as const) {
  const emb = new Map<string, Float32Array>();
  for (const p of photos) emb.set(p.file, await embed(p.file, mode));

  type R = { q: Photo; top: string; score: number; gap: number; correct: boolean; sibling: boolean; correctScore: number; bestWrong: number };
  const results: R[] = [];
  for (const q of photos.filter((p) => p.query)) {
    const others = photos.filter((p) => p.file !== q.file);
    if (!others.some((o) => o.variant === q.variant)) continue;
    const best = new Map<string, number>();
    for (const o of others) best.set(o.variant, Math.max(best.get(o.variant) ?? -1, cos(emb.get(q.file)!, emb.get(o.file)!)));
    const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
    const [top, score] = ranked[0];
    const bestWrong = ranked.find(([v]) => v !== q.variant)![1];
    results.push({
      q, top, score, gap: score - (ranked[1]?.[1] ?? 0), correct: top === q.variant,
      sibling: top !== q.variant && photos.find((p) => p.variant === top)!.family === q.family,
      correctScore: best.get(q.variant)!, bestWrong,
    });
  }

  console.log(`=== ${mode} ===`);
  for (const r of results) {
    console.log(
      `${path.basename(r.q.file).padEnd(34)} ${r.correct ? "ok   " : r.sibling ? "SIBLING" : "WRONG  "} top ${r.top} ${r.score.toFixed(3)} gap ${r.gap.toFixed(3)} | correct item ${r.correctScore.toFixed(3)} vs best wrong ${r.bestWrong.toFixed(3)}`,
    );
  }
  const top1 = results.filter((r) => r.correct).length;
  console.log(`top-1 correct: ${top1}/${results.length}  (wrong to a sibling: ${results.filter((r) => r.sibling).length})\n`);
  console.log("auto-resolve rule sweep: correct-auto / FALSE-GREEN / to-LLM  (of " + results.length + ")");
  console.log("score>=T, gap>=G".padEnd(18) + Gs.map((g) => `G=${g}`.padEnd(14)).join(""));
  for (const t of Ts) {
    let line = `T=${t}`.padEnd(18);
    for (const g of Gs) {
      const auto = results.filter((r) => r.score >= t && r.gap >= g);
      const ok = auto.filter((r) => r.correct).length;
      line += `${ok}/${auto.length - ok}/${results.length - auto.length}`.padEnd(14);
    }
    console.log(line);
  }
  console.log();
}
