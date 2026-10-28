/**
 * One-off: re-make older product photos that show as "a picture inside a frame" (non-4:5 photos shown whole with bars).
 *   npm run media:refresh -w server -- --dry   → only counts what would change
 *   npm run media:refresh -w server            → does it (photo ids stay the same; each gets a fresh URL)
 * Safe to run more than once: photos already fixed are skipped.
 */
import { q } from '../db/index.js';
import { refreshProductPhoto, matchProductPhotos } from '../lib/media.js';

const dry = process.argv.includes('--dry');
const rows = q.all("SELECT * FROM media WHERE kind='product' ORDER BY id");
const count = {};
const redone = [];
let n = 0;
for (const m of rows) {
  let r;
  try { r = await refreshProductPhoto(m, { dry }); } catch (e) { r = 'error'; console.error(`[refresh] photo ${m.id}: ${e.message}`); }
  count[r] = (count[r] || 0) + 1;
  if (r === 'done') redone.push(m.id);
  if (r === 'later') { console.log('[refresh] the AI photo check is not answering (daily limit?): stopping here. Run it again tomorrow — finished photos are skipped.'); break; }
  if (++n % 25 === 0) console.log(`[refresh] ${n}/${rows.length}…`);
}
// a product whose photos now differ (one kept its real background, another was cut) is made consistent
if (redone.length) {
  const products = q.all(`SELECT DISTINCT product_id AS id FROM product_media WHERE media_id IN (${redone.map(() => '?').join(',')})`, redone);
  let matched = 0;
  for (const p of products) matched += await matchProductPhotos(p.id);
  if (matched) console.log(`[refresh] ${matched} photo(s) put back on their real background to match the rest of their product`);
}
console.log(`[refresh] ${dry ? 'DRY RUN — nothing changed. ' : ''}checked ${rows.length} photos:`, count);
console.log("[refresh] later = not checked yet (AI limit), run again tomorrow");
console.log("[refresh] done = re-made · would = would be re-made · fine/studio/asis = already OK · no_source = uploaded before originals were kept (left as is)");
process.exit(0);
