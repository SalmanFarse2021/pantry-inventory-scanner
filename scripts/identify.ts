// Feasibility check: photo of pantry items -> list of { name, category } for a worker to confirm.
//
// Usage (GEMINI_API_KEY is read from .env):
//   npm run identify                    # runs on samples/*
//   npm run identify -- path/to.jpg     # specific images
//   MODEL=gemini-3.1-flash-lite npm run identify   # try a cheaper model

import fs from "node:fs";
import path from "node:path";
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
  name: z.string().describe("Short display name: brand + product, e.g. \"Barilla Spaghetti\""),
  brand: z.string().nullable(),
  size: z.string().nullable().describe("Package size ONLY if clearly legible in the photo; otherwise null. Never guess."),
  box_2d: z
    .array(z.number())
    .length(4)
    .describe("Tight bounding box around this one product: [ymin, xmin, ymax, xmax], each 0-1000 normalized to the image"),
  category: z.enum(CATEGORIES),
  subcategory: z.string().describe("Free-text, e.g. \"fruit\", \"crackers\", \"pasta\""),
  position: z.string().describe("Where it sits in the photo, e.g. \"far left\", \"back right\""),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().nullable().describe("Only if something needs the worker's attention"),
});

const ResultSchema = z.object({ items: z.array(ItemSchema) });

const SYSTEM = `You help a school pantry worker log donated items. They photograph a group of products; \
you return one entry per distinct product so they can confirm or correct each one.

- List each distinct product once, even if several identical ones are visible. Do not count.
- Only list products that are clearly the subject of the photo. Ignore the background (counters, bags, \
clutter, household objects that are not products on display).
- Name it the way a person would write it on an inventory sheet: brand + product (+ variety if it matters).
- Read the label. If you cannot read enough to be sure, give your best guess, set confidence to "low", \
and say what is uncertain in "note". Never invent a brand you cannot see.
- Give a tight bounding box around each product (the whole package, nothing else).
- Order items left to right, front to back.`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Phone photos are 10+ MB; downscale like the real app would before upload.
async function prepare(file: string): Promise<string> {
  const buf = await sharp(file)
    .rotate() // honor EXIF orientation
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return buf.toString("base64");
}

// Gemini returns 503 under load; back off and retry a few times.
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const transient = err instanceof Error && /"code":\s*(503|429)/.test(err.message);
      if (!transient || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

type Item = z.infer<typeof ItemSchema>;

// Crop each item out of the FULL-resolution photo (not the downscaled copy sent to the model)
// so thumbnails stay sharp. Also writes an overlay with the boxes drawn for eyeballing.
async function cropItems(file: string, items: Item[]) {
  const base = path.basename(file, path.extname(file));
  const dir = path.join("out", base);
  fs.mkdirSync(dir, { recursive: true });

  const oriented = await sharp(file).rotate().toBuffer();
  const { width: W = 0, height: H = 0 } = await sharp(oriented).metadata();
  const PAD = 0.02; // 2% of box size on each side

  const rects = items.map((it) => {
    const [y0, x0, y1, x1] = it.box_2d.map((v) => Math.min(1000, Math.max(0, v)));
    const bw = x1 - x0;
    const bh = y1 - y0;
    const left = Math.max(0, Math.round(((x0 - bw * PAD) / 1000) * W));
    const top = Math.max(0, Math.round(((y0 - bh * PAD) / 1000) * H));
    const right = Math.min(W, Math.round(((x1 + bw * PAD) / 1000) * W));
    const bottom = Math.min(H, Math.round(((y1 + bh * PAD) / 1000) * H));
    return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  });

  await Promise.all(
    rects.map((r, i) =>
      sharp(oriented)
        .extract(r)
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(path.join(dir, `${String(i + 1).padStart(2, "0")}.jpg`)),
    ),
  );

  const stroke = Math.max(4, Math.round(W / 350));
  const OW = Math.min(W, 1600);
  const OH = Math.round((H * OW) / W);
  const svg = `<svg width="${OW}" height="${OH}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${rects
    .map(
      (r, i) =>
        `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff2d55" stroke-width="${stroke}"/>` +
        `<text x="${r.left + stroke * 2}" y="${r.top + stroke * 9}" font-size="${stroke * 8}" font-family="Arial" font-weight="bold" fill="#ff2d55" stroke="white" stroke-width="${stroke / 2}" paint-order="stroke">${i + 1}</text>`,
    )
    .join("")}</svg>`;
  const small = await sharp(oriented).resize({ width: OW, height: OH }).toBuffer();
  await sharp(small)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toFile(path.join("out", `${base}-boxes.jpg`));
}

// A bad answer (server 500, invalid JSON, schema mismatch) gets one fresh attempt. After that the
// photo is reported as needing manual review instead of silently retrying forever.
const MAX_ATTEMPTS = 2;

async function identify(file: string) {
  const reasons: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return { ...(await identifyOnce(file)), attempts: attempt };
    } catch (err) {
      reasons.push(err instanceof Error ? err.message.slice(0, 160) : String(err));
      // Quota errors (429) are not a bad answer; retrying right away just burns quota.
      if (reasons.at(-1)?.includes('"code":429')) break;
    }
  }
  throw new Error(`needs manual review after ${reasons.length} attempt(s): ${reasons.join(" | ")}`);
}

async function identifyOnce(file: string) {
  const data = await prepare(file);
  const started = Date.now();
  const response = await withRetry(() => ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data } },
          { text: "Identify and categorize the products in this photo." },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(ResultSchema),
    },
  }));

  const parsed = ResultSchema.parse(JSON.parse(response.text ?? ""));
  return {
    items: parsed.items,
    seconds: (Date.now() - started) / 1000,
    tokens: response.usageMetadata?.totalTokenCount ?? 0,
  };
}

function defaultInputs(): string[] {
  const dir = "samples";
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

async function main() {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : defaultInputs();
  fs.mkdirSync("out", { recursive: true });
  console.log(`model: ${MODEL}\n`);

  // CONCURRENCY=1 (default) is sequential; raise it to send photos in parallel.
  const concurrency = Math.max(1, Number(process.env.CONCURRENCY ?? 1));
  const queue = [...files];
  const wallStart = Date.now();

  async function worker() {
    for (let file = queue.shift(); file; file = queue.shift()) {
      try {
        const { items, seconds, tokens, attempts } = await identify(file);
        // Build the whole block first so parallel workers don't interleave their output.
        let block = `== ${file}  (${items.length} items, ${seconds.toFixed(1)}s, ${tokens} tokens${attempts > 1 ? `, took ${attempts} attempts` : ""})\n`;
        await cropItems(file, items);
        for (const [i, it] of items.entries()) {
          const flag = it.confidence === "high" ? " " : it.confidence === "medium" ? "?" : "??";
          block +=
            `  ${flag.padEnd(2)} ${String(i + 1).padStart(2)}. ${it.name}${it.size ? ` [${it.size}]` : ""}  ->  ${it.category} / ${it.subcategory}  (${it.position})\n` +
            (it.note ? `       note: ${it.note}\n` : "");
        }
        console.log(block);
        fs.writeFileSync(
          path.join("out", `${path.basename(file, path.extname(file))}.json`),
          JSON.stringify(items, null, 2),
        );
      } catch (err) {
        console.error(`${file}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`total wall time: ${((Date.now() - wallStart) / 1000).toFixed(1)}s (concurrency ${concurrency})`);
}

await main();
