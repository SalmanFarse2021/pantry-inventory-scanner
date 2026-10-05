// Builds the fixed sample set the phone page embeds, plus desktop (fp32, node) embeddings of
// the exact same 512px jpegs so the phone can be checked against them.
//   npm run reference
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const MODEL = "Xenova/clip-vit-base-patch32";
const SRC = "../../test_pictures";
const OUT = "public/samples";
const FILES = [
  "furikake1.jpeg", "furikake2.jpeg", "ramune1.jpeg", "ramune2.jpeg", "oliveoil1.jpeg",
  "barilla1.jpeg", "barilla2.jpeg", "spice1.jpeg", "IMG_8058.jpeg", "IMG_8061.jpeg",
];

const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL);
fs.mkdirSync(OUT, { recursive: true });

const samples: { name: string; embedding: number[] }[] = [];
for (const f of FILES) {
  const name = path.parse(f).name + ".jpg";
  const buf = await sharp(path.join(SRC, f)).rotate().flatten({ background: "#ffffff" })
    .resize({ width: 512, height: 512, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(OUT, name), buf);
  const out = await model(await processor(await RawImage.fromBlob(new Blob([new Uint8Array(buf)]))));
  const v = Float32Array.from(out.image_embeds.data as ArrayLike<number>);
  const norm = Math.hypot(...v);
  samples.push({ name, embedding: Array.from(v, (x) => x / norm) });
  console.log("embedded", name);
}
fs.writeFileSync("public/reference.json", JSON.stringify({ model: MODEL, dtype: "fp32 (node)", samples }));
