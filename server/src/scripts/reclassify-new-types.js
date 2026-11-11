/**
 * One-off: after adding the types cufflinks / lingerie / robe, fixes the saved type (moda_key) of products that already exist.
 * Only products whose NAME now clearly says cufflinks, lingerie or robe are touched, and only their moda_key (nothing else).
 *
 *   docker compose exec app sh -c "DRY=1 node --no-warnings /app/server/src/scripts/reclassify-new-types.js"   (lists, changes nothing)
 *   docker compose exec app sh -c "node --no-warnings /app/server/src/scripts/reclassify-new-types.js"         (applies)
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKnowledge } from '../lib/moda/knowledge.js';
import { inferKey } from '../lib/moda/products.js';

const file = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/souqna.db');
const db = new DatabaseSync(file);
const K = loadKnowledge();
const NEW = new Set(['cufflinks', 'lingerie', 'robe']);
const rows = db.prepare('SELECT p.id, p.name_ar, p.name_en, p.moda_key, s.slug AS store FROM products p JOIN stores s ON s.id = p.store_id').all();
const update = db.prepare('UPDATE products SET moda_key = ? WHERE id = ?');
let n = 0;
for (const r of rows) {
  const key = inferKey(`${r.name_ar || ''} ${r.name_en || ''}`, K);
  if (!NEW.has(key) || r.moda_key === key) continue;
  n++;
  console.log(`#${r.id} [${r.store}] "${r.name_ar}"  ${r.moda_key || '(none)'} -> ${key}`);
  if (!process.env.DRY) update.run(key, r.id);
}
console.log(process.env.DRY ? `Dry run: ${n} products would change.` : `Done: ${n} products updated. Restart the app so Twila reloads the catalogue: docker compose restart app`);
