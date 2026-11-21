/**
 * End-to-end acceptance test of visual search on YOUR real catalogue, using the same pipeline customers hit (searchByImage).
 *   npm run eval:visual -w server                      → measure
 *   npm run eval:visual -w server -- --sweep           → also table of recall per similarity floor + recommended floor
 *   options: --target 98  (exit code 1 below this recall, look-alikes counted)   --max 300  (products sampled)
 * Run it on a COPY of the production database (restore from Litestream / R2), never against live data you cannot lose:
 * it only reads, except that it indexes any product that has no vector yet (what the server does by itself anyway).
 *
 * Cases per product: (1) a synthetic phone re-shot of its photo, (2) each of its other photos used as the query with that very
 * photo LEFT OUT of the catalogue (worn / different-angle photo must still find the product through its remaining photos),
 * (3) ~20 meaningless images that must NOT return a match (false-positive rate).
 */
import sharp from 'sharp';
import { q } from '../db/index.js';
import { readMediaFile } from '../lib/media.js';
import { reindexPending, invalidateVisualCache, searchByImage, activeModel, visualSettings, loadVisualCatalog } from '../lib/visual.js';
import { augmentedShot } from '../lib/visual-eval.js';
import { measure, sweep, recommendFloor, failureReason } from '../lib/visual-acceptance.js';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? def : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const target = Number(arg('target', 98)) / 100; const max = Number(arg('max', 300)); const doSweep = Boolean(arg('sweep', false));
const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : 'n/a');

async function bytes(m) { for (const f of ['md.jpg', 'md.webp', 'sm.jpg', 'sm.webp', 'original.jpg']) { try { return await readMediaFile(m, f); } catch { /* next */ } } return null; }

const model = await activeModel();
console.log(`model: ${model}   floor(clip/color): ${visualSettings().minSimilarityByModel.clip}/${visualSettings().minSimilarityByModel.color}`);
if (model === 'color-v1') console.log('WARNING: the colour model answers searches (CLIP is not selected or could not load). Results below describe the colour model.');

process.stdout.write('indexing');
for (;;) { const r = await reindexPending(25, model); process.stdout.write('.'); if (!r.remaining) break; }
invalidateVisualCache(); console.log();

const products = q.all(`SELECT p.id, p.name_ar FROM products p JOIN stores s ON s.id=p.store_id
  WHERE p.status='active' AND (p.track_stock=0 OR p.stock>0) AND s.status='active' AND s.hidden=0`).sort(() => Math.random() - 0.5).slice(0, max);
// products that look the same as each other (one garment listed in several colours / twice): showing one of them is a success for the shopper
const catalogue = loadVisualCatalog(model).rows; const vecById = new Map(catalogue.map((r) => [r.id, r.vec]));
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const equivOf = (id) => { const v = vecById.get(id); const out = new Set(); if (v) for (const [o, w] of vecById) if (o !== id && dot(v, w) >= 0.93) out.add(o); return out; };
const cases = [];
for (const p of products) {
  const equiv = equivOf(p.id);
  const media = q.all('SELECT m.*, pm.is_primary FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=? ORDER BY pm.is_primary DESC, pm.position, pm.media_id LIMIT 4', [p.id]);
  const bufs = [];
  for (const m of media) { const b = await bytes(m); if (b) bufs.push({ m, b }); }
  if (!bufs.length) continue;
  cases.push({ kind: 'reshot', expectId: p.id, equiv, name: p.name_ar, buffer: await augmentedShot(bufs[0].b) });
  if (bufs.length >= 2) for (const { m, b } of bufs.slice(0, 3)) cases.push({ kind: 'photo', expectId: p.id, equiv, name: p.name_ar, excludeSlot: `m${m.id}`, buffer: await sharp(b).rotate().resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer() });
}
// photos that resemble nothing in a clothing catalogue
for (let i = 0; i < 20; i++) {
  const c = { r: (i * 53) % 256, g: (i * 97) % 256, b: (i * 29) % 256 };
  cases.push({ kind: 'noise', buffer: await sharp({ create: { width: 480, height: 640, channels: 3, background: c } }).jpeg().toBuffer() });
}
console.log(`${products.length} products → ${cases.filter((c) => c.kind !== 'noise').length} test photos (+${cases.filter((c) => c.kind === 'noise').length} noise)`);

const search = (buf, o) => searchByImage(buf, { limit: 24, ...o });
const res = await measure(cases, search, { onProgress: (i, n) => { if (i % 50 === 0 || i === n) process.stdout.write(`\r  searched ${i}/${n}`); } });
console.log();
console.log('\n=== RESULT ===');
console.log(`found as a MATCH     : ${pct(res.strictRecall)}   (target ${pct(target)})`);
console.log(`found, counting a look-alike product (same item in another colour / listed twice): ${pct(res.equivRecall)}`);
console.log(`found at all (match or "closest"): ${pct(res.nearRecall)}`);
for (const [k, v] of Object.entries(res.byKind)) if (k !== 'noise') console.log(`  ${k.padEnd(7)} ${v.strict}/${v.n} match, ${v.near}/${v.n} incl. closest`);
console.log(`false matches on meaningless photos: ${pct(res.noiseFalsePositive)} of ${res.noiseN}`);
console.log(`average matches shown per search   : ${Number.isFinite(res.avgItems) ? res.avgItems.toFixed(1) : 'n/a'}`);
if (res.fails.length) {
  console.log(`\nnot found even counting look-alikes (${res.fails.length}), first 20:`);
  const reasons = {};
  for (const f of res.fails) { const r = failureReason(f.diag, (f.diag?.floor ?? 80) / 100); reasons[r] = (reasons[r] || 0) + 1; f.reason = r; }
  console.log('  by reason:', JSON.stringify(reasons), ' (wrong_family = product not in the searched families, below_floor = score under the floor, cut_off = above the floor but not shown)');
  for (const f of res.fails.slice(0, 20)) console.log(`  #${f.id} ${f.name} [${f.kind}] ${f.reason} ${f.near ? '(shown as closest)' : '(not shown)'} expect=${JSON.stringify(f.diag?.expect)}`);
}
if (doSweep) {
  console.log('\nfloor sweep:');
  // the sweep repeats every search once per floor: use a sample (all noise photos + up to 120 real ones) so it finishes in minutes
  const sample = [...cases.filter((c) => c.kind !== 'noise').sort(() => Math.random() - 0.5).slice(0, 70), ...cases.filter((c) => c.kind === 'noise')];
  console.log(`  (sweep sample: ${sample.length} photos × 8 floors)`);
  const show = (r) => console.log(`  floor ${String(Math.round(r.floor * 100)).padEnd(3)} match ${pct(r.strictRecall).padEnd(7)} incl.look-alike ${pct(r.equivRecall).padEnd(7)} shown/search ${r.avgItems.toFixed(1).padEnd(5)} false-matches ${pct(r.noiseFalsePositive)}`);
  // each row is printed as soon as it is ready (the sweep takes a while: do not copy the output before "Recommended floor" appears)
  const rows = await sweep(sample, search, [0.64, 0.68, 0.70, 0.72, 0.74, 0.76, 0.78, 0.80], show);
  const rec = recommendFloor(rows, target);
  console.log(rec ? `\nRecommended floor: ${Math.round(rec * 100)}  (highest floor that still reaches ${pct(target)}; set it in Admin → النظام → البحث بالصورة)` : `\nNo floor reaches ${pct(target)} with ≤2% false matches on this catalogue — see the failures above.`);
}
process.exit(res.equivRecall >= target ? 0 : 1);
