/**
 * One-off: bring EXISTING product photos to the uniform 4:5 look used for new uploads.
 *   npm run reprocess-media -w server            # all products
 *   npm run reprocess-media -w server -- --dry   # just count
 * Safe to re-run: images already at 1600x2000 are skipped. Failures are logged, never fatal.
 */
import { q } from '../db/index.js';
import { reprocessProductMedia } from '../lib/media.js';

const dry = process.argv.includes('--dry');
const rows = q.all("SELECT * FROM media WHERE kind='product' AND NOT (width=1600 AND height=2000)");
console.log(`${rows.length} product image(s) to convert${dry ? ' (dry run)' : ''}`);
let ok = 0, fail = 0;
if (!dry) {
  for (const m of rows) {
    try { await reprocessProductMedia(m); ok++; } catch (e) { fail++; console.warn(`media ${m.id}: ${e.message}`); }
  }
}
console.log(`done: ${ok} converted, ${fail} failed`);
