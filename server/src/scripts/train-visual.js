/**
 * Train & calibrate the free CLIP visual search on Banha's own catalogue.   npm run train:visual -w server [-- --apply]
 *
 *  1. indexes every active product with the CLIP model,
 *  2. measures how well the garment classifier (zero-shot text prompts + learned catalogue centroids) recognises your
 *     products, leave-one-out, with a per-family report and the most common confusions,
 *  3. calibrates the "only show genuinely similar products" floor: each product photo is re-shot synthetically
 *     (crop / brightness / re-compression, like a customer's phone photo) and compared with the catalogue. The floor is
 *     placed between "same product" scores and "just another item of the same type" scores.
 *  With --apply the recommended floor is saved and CLIP becomes the active model.
 */
import sharp from 'sharp';
import { clipReady, clipStatus, clipEmbedImage, clipEmbedTexts, CLIP_MODEL_NAME } from '../lib/visual-clip.js';
import { buildTextPrototypes, familyProbabilities, MIN_CENTROID_N } from '../lib/visual-classify.js';
import { normalize, colorDescriptor, rankConfident } from '../lib/visual-core.js';
import { reindexPending, loadVisualCatalog, invalidateVisualCache, readPrimaryImage, saveVisualSettings, visualSettings } from '../lib/visual.js';

const apply = process.argv.includes('--apply');
const pct = (arr, p) => { if (!arr.length) return NaN; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');

if (!(await clipReady())) { console.error(`CLIP model could not load: ${clipStatus().error}\nMake sure @huggingface/transformers is installed and the server can reach huggingface.co once to download the model.`); process.exit(1); }
if (apply) saveVisualSettings({ model: 'clip' });
else if (visualSettings().model !== 'clip') { console.error('CLIP is not the selected model. Select it in Admin → النظام → البحث بالصورة, or re-run with --apply.'); process.exit(1); }

console.log('1/3 indexing products with CLIP …');
let round = 0;
for (;;) { const r = await reindexPending(25, CLIP_MODEL_NAME); round += r.done; process.stdout.write(`\r  indexed ${round}`); if (!r.remaining) break; }
console.log();
invalidateVisualCache();
const rows = loadVisualCatalog(CLIP_MODEL_NAME).rows;
console.log(`  ${rows.length} products with vectors, ${rows.filter((r) => r.family).length} with a known type`);
if (rows.length < 10) { console.error('Too few products to train on. Add products first.'); process.exit(1); }

console.log('2/3 garment-type classifier (leave-one-out) …');
const text = await buildTextPrototypes(clipEmbedTexts);
const labelled = rows.filter((r) => r.family);
const dim = labelled[0].vec.length;
const sums = new Map(); const counts = new Map();
for (const r of labelled) { const s = sums.get(r.family) || new Float32Array(dim); for (let i = 0; i < dim; i++) s[i] += r.vec[i]; sums.set(r.family, s); counts.set(r.family, (counts.get(r.family) || 0) + 1); }
const stats = {}; const confusion = new Map();
let zeroOk = 0, learnedOk = 0;
for (const r of labelled) {
  const centroids = new Map();
  for (const [f, s] of sums) {
    const n = counts.get(f) - (f === r.family ? 1 : 0); if (n < MIN_CENTROID_N) continue;
    const v = Float32Array.from(s); if (f === r.family) for (let i = 0; i < dim; i++) v[i] -= r.vec[i];
    centroids.set(f, { vec: normalize(v), n });
  }
  const z = familyProbabilities(r.vec, { text, centroids: new Map() })[0].family;
  const l = familyProbabilities(r.vec, { text, centroids })[0].family;
  zeroOk += z === r.family; learnedOk += l === r.family;
  const st = (stats[r.family] ||= { n: 0, ok: 0 }); st.n++; st.ok += l === r.family;
  if (l !== r.family) { const k = `${r.family} → ${l}`; confusion.set(k, (confusion.get(k) || 0) + 1); }
}
console.log(`  zero-shot accuracy : ${(100 * zeroOk / labelled.length).toFixed(1)}%`);
console.log(`  after learning     : ${(100 * learnedOk / labelled.length).toFixed(1)}%  (${labelled.length} labelled products)`);
for (const [f, st] of Object.entries(stats)) console.log(`    ${f.padEnd(16)} ${String(st.ok).padStart(4)}/${String(st.n).padEnd(4)} ${(100 * st.ok / st.n).toFixed(0)}%`);
const topConf = [...confusion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
if (topConf.length) console.log("  most common mix-ups (check those products' names/categories):", topConf.map(([k, v]) => `${k} ×${v}`).join(' | '));

console.log('3/3 calibrating the similarity floor …');
const byId = new Map(rows.map((r) => [r.id, r]));
const sample = [...labelled].sort(() => Math.random() - 0.5).slice(0, 200);
const pos = [], neg = [];
for (const r of sample) {
  const img = await readPrimaryImage(r.id); if (!img) continue;
  const meta = await sharp(img).rotate().metadata();
  const k = 0.72 + Math.random() * 0.2; const w = Math.round(meta.width * k), h = Math.round(meta.height * k);
  const left = Math.round((meta.width - w) * Math.random()), top = Math.round((meta.height - h) * Math.random());
  const shot = await sharp(img).rotate().extract({ left, top, width: w, height: h })
    .modulate({ brightness: 0.85 + Math.random() * 0.3, saturation: 0.85 + Math.random() * 0.3 }).resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 55 }).toBuffer();
  const qv = normalize(await clipEmbedImage(shot)); const qh = await colorDescriptor(shot);
  const all = rankConfident(qv, qh, rows.filter((x) => x.family === r.family), { floor: -Infinity, window: Infinity, limit: 100000, useColor: true });
  const self = all.find((x) => x.id === r.id); if (self) pos.push(self.score);
  for (const x of all) {
    if (x.id === r.id) continue;
    const other = byId.get(x.id); let d = 0; for (let i = 0; i < dim; i++) d += r.vec[i] * other.vec[i];
    if (d < 0.97) neg.push(x.score); // skip near-duplicates (the same item listed twice)
  }
}
const p10 = pct(pos, 0.1), p50 = pct(pos, 0.5), n75 = pct(neg, 0.75), n95 = pct(neg, 0.95);
console.log(`  same product      : median ${f2(p50)}  10th percentile ${f2(p10)}  (${pos.length} samples)`);
console.log(`  other items (type): 75th percentile ${f2(n75)}  95th percentile ${f2(n95)}  (${neg.length} pairs)`);
const rec = Math.max(0.7, Math.min(0.92, Number.isFinite(p10) && Number.isFinite(n75) ? (p10 + n75) / 2 : 0.8));
console.log(`\n  Recommended floor: ${Math.round(rec * 100)}   (current: ${visualSettings().minSimilarityByModel.clip})`);
if (apply) { saveVisualSettings({ model: 'clip', minSimilarity: Math.round(rec * 100) }); console.log('  Saved — CLIP is now the active model.'); }
else console.log('  Re-run with --apply to save it, or set it in Admin → النظام → البحث بالصورة.');
process.exit(0);
