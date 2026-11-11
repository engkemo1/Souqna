/**
 * Rebuilds the model photos already used by "جرّب اللوك": every photo is laid on white and cut again by the person model, which drops
 * the white studio leftovers and soft halos the old cut left behind. It cannot bring back parts of the clothes the old cut already
 * lost (that needs the original photo). Old files are kept and the old URLs are written to a backup file, so it can be undone.
 *
 *   docker compose exec app sh -c "DRY=1 node --no-warnings /app/server/src/scripts/polish-look-images.js"   (only lists)
 *   docker compose exec app sh -c "node --no-warnings /app/server/src/scripts/polish-look-images.js"         (does it)
 * Undo: restore the saved JSON into app_settings 'look_of_day_manual' (the backup file path is printed).
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recutLookImage } from '../lib/deptImage.js';

const file = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/souqna.db');
const db = new DatabaseSync(file);
const row = db.prepare("SELECT value FROM app_settings WHERE key='look_of_day_manual'").get();
if (!row) { console.log('No manual looks saved.'); process.exit(0); }
const data = JSON.parse(row.value || '{}');
if (!process.env.DRY) {
  const backup = path.join(path.dirname(file), `look_of_day_manual.backup-${Date.now()}.json`);
  fs.writeFileSync(backup, row.value);
  console.log('Backup of the current looks:', backup);
}
const cache = new Map();
const fix = async (u) => {
  if (!u || !/look-of-day\//.test(u)) return u;
  if (!cache.has(u)) {
    if (process.env.DRY) { console.log('would rebuild', u); cache.set(u, u); }
    else { const nu = await recutLookImage(u, { rebuild: true }); console.log(nu === u ? 'left as it was (model not sure)' : 'rebuilt', u, '->', nu); cache.set(u, nu); }
  }
  return cache.get(u);
};
for (const o of data.outfits || []) {
  if (o.coverImage) o.coverImage = await fix(o.coverImage);
  if (o.backImage) o.backImage = await fix(o.backImage);
  if (o.rightImage) o.rightImage = await fix(o.rightImage);
  if (o.leftImage) o.leftImage = await fix(o.leftImage);
  if (Array.isArray(o.images)) o.images = await Promise.all(o.images.map(fix));
}
if (data.coverImage) data.coverImage = await fix(data.coverImage);
if (!process.env.DRY) db.prepare("UPDATE app_settings SET value=? WHERE key='look_of_day_manual'").run(JSON.stringify(data));
console.log(process.env.DRY ? 'Dry run: nothing changed.' : 'Done. Purge the Cloudflare cache and refresh.');
