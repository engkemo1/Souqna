/**
 * Compare candidate CLIP-family models on YOUR catalogue (free, local).   npm run compare:visual -w server [-- --models=a,b --limit=120 --shots=2]
 * Any photos can be used instead of the database:  -- --dir=<catalogue photos> [--queries=<customer-style photos named <product>__x.jpg>]
 *   (a parent folder named tops / bottoms / dresses / shoes / bags … gives the product its garment type).
 * Nothing is written to R2 or to the database. Default candidates: the current CLIP and Marqo's fashion-tuned CLIP.
 * Pick the winner, then set VISUAL_CLIP_MODEL on the server and run `npm run train:visual -- --apply`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClip } from '../lib/visual-clip.js';
import { evaluateModel, loadFolderItems } from '../lib/visual-eval.js';
import { loadVisualCatalog, readPrimaryImage } from '../lib/visual.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const models = arg('models', 'Xenova/clip-vit-base-patch32,Marqo/marqo-fashionCLIP').split(',').map((s) => s.trim()).filter(Boolean);
const limit = Number(arg('limit', 120)); const shots = Number(arg('shots', 1));
const dirSize = (d) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } } catch { /* ignore */ } return n; };

const dir = arg('dir', ''); const queriesDir = arg('queries', '');
let items = [];
if (dir) items = loadFolderItems(dir, queriesDir, { limit });
else {
  // catalogue sample: products with a known type (the colour-model catalogue always exists, so no CLIP index is needed)
  const rows = loadVisualCatalog('color-v1').rows.filter((r) => r.family).sort(() => Math.random() - 0.5).slice(0, limit);
  for (const r of rows) { const buffer = await readPrimaryImage(r.id); if (buffer) items.push({ id: r.id, family: r.family, buffer }); }
}
if (items.length < 10) { console.error('Need at least 10 products with photos.'); process.exit(1); }
const realQ = items.reduce((n, it) => n + (it.queries?.length || 0), 0);
console.log(`Comparing ${models.join(' vs ')} on ${items.length} of your products (${realQ ? `${realQ} real customer photos` : `${shots} synthetic re-shot${shots > 1 ? 's' : ''} each`})\n`);

const results = [];
for (const id of models) {
  const cacheDir = path.join(os.tmpdir(), 'souqna-compare', id.replace(/\W+/g, '_'));
  const clip = createClip(id, { r2: false, cacheDir });
  const t0 = Date.now(); const rss0 = process.memoryUsage().rss;
  if (!(await clip.ready())) { console.log(`✗ ${id}: could not load — ${clip.status().error}\n`); results.push({ id, error: clip.status().error }); continue; }
  const loadSec = (Date.now() - t0) / 1000; const ramMb = Math.max(0, (process.memoryUsage().rss - rss0) / 2 ** 20);
  process.stdout.write(`• ${id} loaded in ${loadSec.toFixed(1)}s (${clip.status().dtypes.vision}/${clip.status().dtypes.text})\n`);
  const r = await evaluateModel(clip, items, { shots, onProgress: (i, n) => process.stdout.write(`\r  embedding ${i}/${n}`) });
  process.stdout.write('\n');
  results.push({ id, ...r, loadSec, ramMb, diskMb: dirSize(cacheDir) / 2 ** 20, dtypes: clip.status().dtypes });
  await clip.dispose();
}

const pc = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : 'n/a');
console.log('\nmodel'.padEnd(34) + 'type acc'.padEnd(10) + 'hit@1'.padEnd(9) + 'hit@5'.padEnd(9) + 'MRR'.padEnd(8) + 'margin'.padEnd(9) + 'ms/img'.padEnd(8) + 'disk MB'.padEnd(9) + 'RAM MB');
for (const r of results) {
  if (r.error) { console.log(r.id.padEnd(33) + 'FAILED'); continue; }
  console.log(r.id.padEnd(33) + pc(r.zeroShotAcc).padEnd(10) + pc(r.hit1).padEnd(9) + pc(r.hit5).padEnd(9) + r.mrr.toFixed(3).padEnd(8) + r.margin.toFixed(3).padEnd(9) + r.msPerImage.toFixed(0).padEnd(8) + r.diskMb.toFixed(0).padEnd(9) + r.ramMb.toFixed(0));
}
const ok = results.filter((r) => !r.error);
if (ok.length > 1) {
  // retrieval matters most; type-from-text counts little because the live system learns types from your own catalogue
  const score = (r) => r.hit1 * 0.55 + r.hit5 * 0.2 + Math.min(1, r.margin * 4) * 0.15 + (Number.isFinite(r.zeroShotAcc) ? r.zeroShotAcc : 0.5) * 0.1;
  const best = [...ok].sort((a, b) => score(b) - score(a))[0];
  console.log(`\nBest on your catalogue: ${best.id}${best.id === models[0] ? '' : `  → set VISUAL_CLIP_MODEL=${best.id}, redeploy, then npm run train:visual -w server -- --apply`}`);
  console.log('Weigh it against cost: bigger models need more RAM on Railway and more R2 space (see disk/RAM columns).');
}
process.exit(0);
