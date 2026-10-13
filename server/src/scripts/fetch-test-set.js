/**
 * Download a public fashion-product photo set and arrange it for `npm run compare:visual -- --dir=…`.
 *   npm run testset:visual -w server [-- --out=../test-set --n=300 --dataset=ceyda/fashion-products-small]
 * Uses the HuggingFace datasets-server (needs internet once). Photos are grouped into folders named after garment families.
 * NOTE: this is a *public* e-commerce set (clean studio photos), not your customers' phone photos — use it as a quick sanity check, and
 * trust a test with real phone photos of your own products more. Some fashion-tuned models were evaluated on sets like this one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseRow } from '../lib/visual-testset.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const dataset = arg('dataset', 'ceyda/fashion-products-small'); const out = path.resolve(arg('out', '../test-set')); const want = Number(arg('n', 300));
const api = (offset, length) => `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=default&split=train&offset=${offset}&length=${length}`;
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

const first = await getJson(api(0, 1)).catch((e) => { console.error(`Could not reach the dataset server: ${e.message}`); process.exit(1); });
const total = first.num_rows_total || 1000;
console.log(`${dataset}: ${total} rows. Fetching about ${want} photos into ${out}`);
const picked = []; const seen = new Set(); const perFamily = {}; const maxPer = Math.ceil(want / 6); // keep the mix balanced
for (let tries = 0; picked.length < want && tries < 60; tries++) {
  const offset = Math.floor(Math.random() * Math.max(1, total - 100));
  const page = await getJson(api(offset, 100)).catch(() => null); if (!page) continue;
  for (const r of page.rows || []) {
    const p = parseRow(r); if (!p || seen.has(p.id)) continue;
    if ((perFamily[p.family] || 0) >= maxPer) continue;
    seen.add(p.id); perFamily[p.family] = (perFamily[p.family] || 0) + 1; picked.push(p);
    if (picked.length >= want) break;
  }
}
if (!picked.length) { console.error('No usable rows (the dataset columns may differ). Open an issue with the dataset name, or pass --dataset=<another>.'); process.exit(1); }

let ok = 0;
for (const p of picked) {
  try {
    const res = await fetch(p.url); if (!res.ok) continue;
    const dir = path.join(out, p.family); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${p.id}.jpg`), Buffer.from(await res.arrayBuffer())); ok++;
    process.stdout.write(`\r  downloaded ${ok}/${picked.length}`);
  } catch { /* skip */ }
}
console.log(`\nDone. Per type: ${Object.entries(perFamily).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`Now run:  npm run compare:visual -w server -- --dir=${out} --limit=${ok} --shots=2`);
