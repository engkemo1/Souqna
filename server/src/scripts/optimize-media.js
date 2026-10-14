/**
 * Shrink photos that are already stored (R2 or local disk) WITHOUT changing a single URL the site uses.
 *   npm run media:optimize -w server                 -> dry run: prints what would be saved, changes nothing
 *   npm run media:optimize -w server -- --apply      -> re-encodes WebP renditions (only when the new file is smaller) and deletes the
 *                                                       redundant JPEG renditions (thumb/sm/md/lg/xl .jpg). original.jpg is never touched.
 *   add --keep-jpg to keep the JPEG renditions and only re-encode WebP.
 * Safe to re-run. Each photo is rebuilt from its own original.jpg.
 */
import sharp from 'sharp';
import { q } from '../db/index.js';
import { readMediaFile, writeMediaFile, deleteMediaFile, renderWebp } from '../lib/media.js';

const apply = process.argv.includes('--apply');
const keepJpg = process.argv.includes('--keep-jpg');
const rows = q.all('SELECT * FROM media ORDER BY id');
let before = 0, after = 0, changed = 0, failed = 0, droppedBytes = 0;
const mb = (n) => (n / 1048576).toFixed(1);

for (const m of rows) {
  try {
    const sizes = JSON.parse(m.sizes || '[]');
    const original = await readMediaFile(m, 'original.jpg');
    let delta = 0;
    for (const { name, width } of sizes) {
      let old = null; try { old = await readMediaFile(m, `${name}.webp`); } catch { /* missing webp: skip */ continue; }
      before += old.length;
      const fresh = await renderWebp(original, name, width);
      if (fresh.length < old.length) { if (apply) await writeMediaFile(m, `${name}.webp`, fresh); after += fresh.length; delta += old.length - fresh.length; } else after += old.length;
      if (!keepJpg) {
        let jpg = null; try { jpg = await readMediaFile(m, `${name}.jpg`); } catch { /* already gone */ }
        if (jpg) { droppedBytes += jpg.length; delta += jpg.length; if (apply) await deleteMediaFile(m, `${name}.jpg`); }
      }
    }
    if (delta > 0) { changed++; if (apply) q.run('UPDATE media SET bytes=MAX(0, bytes-?) WHERE id=?', [delta, m.id]); }
  } catch (e) { failed++; console.warn(`media ${m.id}: ${e.message}`); }
}
console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: ${rows.length} photos, ${changed} would change/changed, ${failed} failed`);
console.log(`WebP renditions: ${mb(before)} MB -> ${mb(after)} MB; redundant JPEG renditions removed: ${mb(droppedBytes)} MB; total saved: ${mb(before - after + droppedBytes)} MB`);
if (!apply) console.log('Nothing was changed. Re-run with --apply to do it.');
