// Is the 0.90-0.96 parity from q8 quantization (any device) or from the iPhone? Run q8 in node.
import fs from "node:fs";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
const M = "Xenova/clip-vit-base-patch32";
const ref = JSON.parse(fs.readFileSync("public/reference.json", "utf8"));
const processor = await AutoProcessor.from_pretrained(M);
const model = await CLIPVisionModelWithProjection.from_pretrained(M, { dtype: "q8" });
const vecs: Float32Array[] = [];
for (const s of ref.samples) {
  const out = await model(await processor(await RawImage.fromBlob(new Blob([fs.readFileSync(`public/samples/${s.name}`)]))));
  const v = Float32Array.from(out.image_embeds.data as ArrayLike<number>); const n = Math.hypot(...v);
  vecs.push(v.map((x) => x / n));
  console.log(s.name.padEnd(16), v.reduce((a, x, i) => a + (x / n) * s.embedding[i], 0).toFixed(4));
}
const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
const i = (n: string) => ref.samples.findIndex((s: any) => s.name === n);
console.log("pairs q8-node: furikake", cos(vecs[i("furikake1.jpg")], vecs[i("furikake2.jpg")]).toFixed(3), "ramune", cos(vecs[i("ramune1.jpg")], vecs[i("ramune2.jpg")]).toFixed(3), "barilla", cos(vecs[i("barilla1.jpg")], vecs[i("barilla2.jpg")]).toFixed(3));
