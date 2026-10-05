import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const MODEL = "Xenova/clip-vit-base-patch32";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Reference = { samples: { name: string; embedding: number[] }[] };
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
let model: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
let reference: Reference;
let cfg = "";

// The report survives a reload so cold vs cached loads end up in one paste.
const LOG_KEY = "embed-spike-log";
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
const report = $<HTMLTextAreaElement>("report");
report.value = safe(() => localStorage.getItem(LOG_KEY) ?? "", "");
function log(line = "") {
  report.value += line + "\n";
  safe(() => localStorage.setItem(LOG_KEY, report.value), undefined);
  report.scrollTop = report.scrollHeight;
}
const status = (s: string) => ($("status").textContent = s);
const ms = (n: number) => `${n.toFixed(0)}ms`;
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `min ${ms(s[0])} / median ${ms(s[Math.floor(s.length / 2)])} / max ${ms(s[s.length - 1])}`;
};

async function embedBlob(blob: Blob): Promise<Float32Array> {
  const out = await model(await processor(await RawImage.fromBlob(blob)));
  const v = Float32Array.from(out.image_embeds.data as ArrayLike<number>);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}
const cos = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const fetchSample = async (name: string) => (await fetch(`/samples/${name}`)).blob();

$("load").onclick = async () => {
  const device = $<HTMLSelectElement>("device").value;
  const dtype = $<HTMLSelectElement>("dtype").value;
  cfg = `${device}/${dtype}`;
  ($("load") as HTMLButtonElement).disabled = true;
  log(`\n=== LOAD ${cfg} @ ${new Date().toISOString()} ===`);
  log(`UA: ${navigator.userAgent}`);
  log(`secureContext=${isSecureContext} crossOriginIsolated=${crossOriginIsolated} cacheApi=${"caches" in self} webgpu=${"gpu" in navigator} cores=${navigator.hardwareConcurrency}`);
  const files = new Map<string, { loaded: number; total: number }>();
  const progress = (p: any) => {
    if (p.status === "progress" && p.file) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      const all = [...files.values()];
      const l = all.reduce((s, f) => s + f.loaded, 0);
      const t = all.reduce((s, f) => s + f.total, 0);
      status(`downloading ${(l / 1e6).toFixed(1)} / ${(t / 1e6).toFixed(1)} MB`);
    }
  };
  const t0 = performance.now();
  try {
    processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback: progress });
    model = await CLIPVisionModelWithProjection.from_pretrained(MODEL, {
      device: device as any, dtype: dtype as any, progress_callback: progress,
    });
    reference = await (await fetch("/reference.json")).json();
    const total = [...files.values()].reduce((s, f) => s + f.total, 0);
    log(`model load: ${ms(performance.now() - t0)}, bytes reported by loader: ${(total / 1e6).toFixed(1)} MB (0 can mean cache hit)`);
    status("model loaded");
    for (const id of ["bench", "stress", "photo"]) ($(id) as HTMLButtonElement).disabled = false;
  } catch (e) {
    log(`LOAD FAILED: ${e}`);
    status(`load failed: ${e}`);
    ($("load") as HTMLButtonElement).disabled = false;
  }
};

$("bench").onclick = async () => {
  log(`\n--- BENCHMARK ${cfg} ---`);
  const blobs = await Promise.all(reference.samples.map((s) => fetchSample(s.name)));
  const times: number[] = [];
  const vecs: Float32Array[] = [];
  for (let i = 0; i < blobs.length; i++) {
    status(`embedding ${i + 1}/${blobs.length}`);
    const t = performance.now();
    vecs.push(await embedBlob(blobs[i]));
    times.push(performance.now() - t);
  }
  log(`first photo (cold, includes warmup): ${ms(times[0])}`);
  log(`photos 2-${times.length} (warm): ${stats(times.slice(1))}`);
  log(`vector length: ${vecs[0].length}, first 4 values: ${[...vecs[0].slice(0, 4)].map((x) => x.toFixed(4)).join(", ")}`);

  log("parity vs desktop fp32 (cosine, want ~0.99+):");
  const par = vecs.map((v, i) => cos(v, reference.samples[i].embedding));
  par.forEach((c, i) => log(`  ${reference.samples[i].name.padEnd(16)} ${c.toFixed(4)}`));
  log(`  min parity ${Math.min(...par).toFixed(4)}`);

  const idx = (n: string) => reference.samples.findIndex((s) => s.name === n);
  const pair = (a: string, b: string) => cos(vecs[idx(a)], vecs[idx(b)]).toFixed(3);
  log("same-item pairs on this device (desktop fp32 center-mode: furikake 0.875, ramune 0.882, barilla 0.658):");
  log(`  furikake1~2 ${pair("furikake1.jpg", "furikake2.jpg")}  ramune1~2 ${pair("ramune1.jpg", "ramune2.jpg")}  barilla1~2 ${pair("barilla1.jpg", "barilla2.jpg")}`);
  status("benchmark done");
};

$("stress").onclick = async () => {
  log(`\n--- STRESS ${cfg}: 30 sequential embeddings ---`);
  const blobs = await Promise.all(reference.samples.map((s) => fetchSample(s.name)));
  const times: number[] = [];
  try {
    for (let i = 0; i < 30; i++) {
      status(`stress ${i + 1}/30`);
      const t = performance.now();
      await embedBlob(blobs[i % blobs.length]);
      times.push(performance.now() - t);
    }
    log(`completed 30/30, ${stats(times)}`);
    log(`first 5 median vs last 5 median (slowdown check): ${ms(times.slice(0, 5).sort((a, b) => a - b)[2])} vs ${ms(times.slice(-5).sort((a, b) => a - b)[2])}`);
    status("stress done");
  } catch (e) {
    log(`STRESS FAILED after ${times.length}: ${e}`);
  }
};

$<HTMLInputElement>("photo").onchange = async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  log(`\n--- OWN PHOTO ${cfg}: ${file.name} ${(file.size / 1e6).toFixed(2)} MB ---`);
  const t0 = performance.now();
  // Same resize the app would do before upload: longest side 512, EXIF orientation applied.
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = 512 / Math.max(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
  const t1 = performance.now();
  const v = await embedBlob(blob);
  const t2 = performance.now();
  log(`${bmp.width}x${bmp.height} -> ${canvas.width}x${canvas.height}, resize ${ms(t1 - t0)}, embed ${ms(t2 - t1)}`);
  const ranked = reference.samples.map((s) => ({ n: s.name, c: cos(v, s.embedding) })).sort((a, b) => b.c - a.c);
  log(`closest bundled photos: ${ranked.slice(0, 3).map((r) => `${r.n} ${r.c.toFixed(3)}`).join(", ")}`);
  status("photo embedded");
};

$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(report.value);
    status("copied");
  } catch {
    report.select();
    status("select-all done; tap Copy in the iOS menu");
  }
};
$("clear").onclick = () => { report.value = ""; safe(() => localStorage.removeItem(LOG_KEY), undefined); };
