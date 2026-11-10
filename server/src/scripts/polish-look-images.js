/**
 * Re-polishes the model photos already used by "جرّب اللوك" (white leftovers, halos, ragged edges) and swaps the URLs in the
 * saved looks. Old files are kept (nothing is deleted). Usage inside the container:
 *   DRY=1 node --no-warnings src/scripts/polish-look-images.js     (only lists what it would do)
 *   node --no-warnings src/scripts/polish-look-images.js
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recutLookImage } from '../lib/deptImage.js';

const file = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/souqna.db');
const db = new DatabaseSync(file);
const row = db.prepare("SELECT value FROM app_settings WHERE key='look_of_day_manual'").get();
if (!row) { console.log('No manual looks saved.'); process.exit(0); }
const data = JSON.parse(row.value || '{}');
const cache = new Map();
const fix = async (u) => {
  if (!u || !/look-of-day\//.test(u)) return u;
  if (!cache.has(u)) {
    if (process.env.DRY) { console.log('would polish', u); cache.set(u, u); }
    else { const nu = await recutLookImage(u); console.log(nu === u ? 'unchanged' : 'polished', u, '->', nu); cache.set(u, nu); }
  }
  return cache.get(u);
};
for (const o of data.outfits || []) {
  if (o.coverImage) o.coverImage = await fix(o.coverImage);
  if (o.backImage) o.backImage = await fix(o.backImage);
  if (Array.isArray(o.images)) o.images = await Promise.all(o.images.map(fix));
}
if (data.coverImage) data.coverImage = await fix(data.coverImage);
if (!process.env.DRY) db.prepare("UPDATE app_settings SET value=? WHERE key='look_of_day_manual'").run(JSON.stringify(data));
console.log(process.env.DRY ? 'Dry run: nothing changed.' : 'Done.');
