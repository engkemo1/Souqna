/**
 * Model comparison helpers (used by `npm run compare:visual`). Pure functions + an injectable model adapter
 * ({ embedImage(buffer) → Float32Array, embedTexts(texts) → Float32Array[] }) so they are testable without a real model.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { normalize, dot } from './visual-core.js';
import { buildTextPrototypes, familyProbabilities, FAMILY_PROMPTS } from './visual-classify.js';

const IMG = /\.(jpe?g|png|webp)$/i;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : IMG.test(e.name) ? [path.join(dir, e.name)] : []));

/**
 * Build test items from folders instead of the database, so any photos can be used (Amazon downloads, a public dataset, your own phone shots).
 *  catalogueDir: product photos, any depth. A parent folder named like a garment family (tops, bottoms, dresses, shoes, bags …) gives the product its type.
 *  queriesDir (optional): real customer-style photos. A query named `<catalogue file name without extension>__anything.jpg` belongs to that product;
 *  products without queries fall back to synthetic re-shots.
 */
export function loadFolderItems(catalogueDir, queriesDir, { limit = Infinity } = {}) {
  const queries = new Map();
  if (queriesDir) for (const f of walk(queriesDir)) { const k = path.basename(f).split('__')[0].replace(IMG, ''); if (path.basename(f).includes('__')) (queries.get(k) || queries.set(k, []).get(k)).push(f); }
  const items = [];
  for (const f of walk(catalogueDir)) {
    const stem = path.basename(f).replace(IMG, ''); const parent = path.basename(path.dirname(f)).toLowerCase();
    items.push({ id: path.relative(catalogueDir, f), family: parent in FAMILY_PROMPTS ? parent : null, buffer: fs.readFileSync(f), queries: (queries.get(stem) || []).map((q) => fs.readFileSync(q)) });
  }
  return items.sort(() => Math.random() - 0.5).slice(0, limit);
}


export function percentile(arr, p) {
  if (!arr.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))];
}

/** A synthetic "customer re-shot" of a catalogue photo: random crop, brightness/saturation drift, low-quality JPEG. */
export async function augmentedShot(img, rnd = Math.random) {
  const meta = await sharp(img).rotate().metadata();
  const k = 0.72 + rnd() * 0.2; const w = Math.round(meta.width * k); const h = Math.round(meta.height * k);
  const left = Math.round((meta.width - w) * rnd()); const top = Math.round((meta.height - h) * rnd());
  return sharp(img).rotate().extract({ left, top, width: w, height: h })
    .modulate({ brightness: 0.85 + rnd() * 0.3, saturation: 0.85 + rnd() * 0.3 })
    .resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 55 }).toBuffer();
}

/**
 * items: [{ id, family, buffer }]. Embeds every item once, then measures
 *  - zeroShotAcc: garment-family accuracy from text prompts only,
 *  - hit@1 / hit@5 / mrr: does an augmented re-shot find its own product among the whole catalogue (cosine only),
 *  - margin: median (own score − best other score) — how clearly the right product wins,
 *  - msPerImage: embedding speed.
 */
export async function evaluateModel(model, items, { shots = 1, rnd = Math.random, onProgress } = {}) {
  const t0 = Date.now();
  const vecs = [];
  for (let i = 0; i < items.length; i++) { vecs.push(normalize(await model.embedImage(items[i].buffer))); onProgress?.(i + 1, items.length); }
  const msPerImage = items.length ? (Date.now() - t0) / items.length : NaN;

  const text = await buildTextPrototypes((t) => model.embedTexts(t));
  const labelled = items.map((it, i) => ({ it, i })).filter((x) => x.it.family);
  const zeroOk = labelled.filter(({ it, i }) => familyProbabilities(vecs[i], { text, centroids: new Map() })[0].family === it.family).length;

  let h1 = 0, h5 = 0, rr = 0, n = 0; const margins = [];
  for (let i = 0; i < items.length; i++) {
    const real = items[i].queries?.length ? items[i].queries : null; // real customer photos when provided, else synthetic re-shots
    for (let s = 0; s < (real ? real.length : shots); s++) {
      const q = normalize(await model.embedImage(real ? real[s] : await augmentedShot(items[i].buffer, rnd)));
      const scored = vecs.map((v, j) => ({ j, s: dot(q, v) })).sort((a, b) => b.s - a.s);
      const rank = scored.findIndex((x) => x.j === i);
      n++; if (rank === 0) h1++; if (rank >= 0 && rank < 5) h5++; rr += rank >= 0 ? 1 / (rank + 1) : 0;
      const own = scored[rank]?.s ?? 0; const other = scored.find((x) => x.j !== i)?.s ?? 0;
      margins.push(own - other);
    }
  }
  return {
    n: items.length, queries: n,
    zeroShotAcc: labelled.length ? zeroOk / labelled.length : NaN,
    hit1: n ? h1 / n : NaN, hit5: n ? h5 / n : NaN, mrr: n ? rr / n : NaN,
    margin: percentile(margins, 0.5), msPerImage,
  };
}
