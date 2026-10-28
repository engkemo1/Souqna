/**
 * One-off: re-make older product photos that show as "a picture inside a frame" (non-4:5 photos shown whole with bars).
 *   npm run media:refresh -w server -- --dry   → only counts what would change
 *   npm run media:refresh -w server            → does it (photo ids stay the same; each gets a fresh URL)
 * Safe to run more than once: photos already fixed are skipped.
 */
import { q } from '../db/index.js';
import { refreshProductPhoto } from '../lib/media.js';

const dry = process.argv.includes('--dry');
const rows = q.all("SELECT * FROM media WHERE kind='product' ORDER BY id");
const count = {};
let n = 0;
for (const m of rows) {
  let r;
  try { r = await refreshProductPhoto(m, { dry }); } catch (e) { r = 'error'; console.error(`[refresh] photo ${m.id}: ${e.message}`); }
  count[r] = (count[r] || 0) + 1;
  if (++n % 25 === 0) console.log(`[refresh] ${n}/${rows.length}…`);
}
console.log(`[refresh] ${dry ? 'DRY RUN — nothing changed. ' : ''}checked ${rows.length} photos:`, count);
console.log("[refresh] done = re-made · would = would be re-made · fine/studio/asis = already OK · no_source = uploaded before originals were kept (left as is)");
process.exit(0);
