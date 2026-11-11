/**
 * Checks every product's main PHOTO against its name/category using the free local CLIP model (no API cost).
 * If the photo clearly shows a different kind of item (e.g. name says "boxer", photo is a jacket), the product gets
 * photo_mismatch=1 and Twila stops recommending it (an empty/0 value = fine). Re-run any time; it only touches photo_mismatch / photo_note.
 *
 *   docker compose exec app sh -c "DRY=1 node --no-warnings /app/server/src/scripts/verify-product-photos.js"   (lists only)
 *   docker compose exec app sh -c "node --no-warnings /app/server/src/scripts/verify-product-photos.js"         (applies)
 *   LIMIT=200 limits the run; MIN_P=0.8 sets how sure CLIP must be (default 0.8); ONLY_NEW=1 skips products already checked.
 * Then: docker compose restart app
 */
import { q } from '../db/index.js';
import { clipReady, clipEmbedImage, clipEmbedTexts, clipStatus } from '../lib/visual-clip.js';
import { buildTextPrototypes, familyProbabilities } from '../lib/visual-classify.js';
import { normalize } from '../lib/visual-core.js';
import { readPrimaryImage } from '../lib/visual.js';
import { visualProductFamily } from '../lib/visual-taxonomy.js';
import { loadKnowledge } from '../lib/moda/knowledge.js';

const K = loadKnowledge();
const MIN_P = Number(process.env.MIN_P || 0.8); const LIMIT = Number(process.env.LIMIT || 100000);
// عائلات متقاربة بصريًا: مش بنعتبر الاختلاف بينها تعارض
const NEAR = [['tops', 'outerwear'], ['tops', 'sport'], ['bottoms', 'sport'], ['dresses', 'modest'], ['outerwear', 'modest'], ['outerwear', 'suiting'], ['tops', 'suiting'], ['bottoms', 'suiting'], ['tops', 'underwear_sleep'], ['bottoms', 'underwear_sleep'], ['dresses', 'underwear_sleep'], ['accessories', 'bags']];
const near = (a, b) => NEAR.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

if (!(await clipReady())) { console.error(`CLIP model not available: ${clipStatus().error}`); process.exit(1); }
const protos = { text: await buildTextPrototypes(clipEmbedTexts), centroids: new Map() };
const rows = q.all(`SELECT p.id, p.name_ar, p.name_en, p.photo_mismatch, COALESCE(c.name_ar || ' ' || c.name_en, '') AS cat_text, p.department, s.slug AS store
  FROM products p JOIN stores s ON s.id=p.store_id LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active'${process.env.ONLY_NEW ? ' AND p.photo_mismatch IS NULL' : ''} LIMIT ?`, [LIMIT]);
let checked = 0, bad = 0, noPhoto = 0, noFamily = 0;
for (const r of rows) {
  const expected = visualProductFamily(r, K);
  if (!expected) { noFamily++; continue; }
  const buf = await readPrimaryImage(r.id);
  if (!buf) { noPhoto++; continue; }
  let probs;
  try { probs = familyProbabilities(normalize(await clipEmbedImage(buf)), protos); } catch (e) { console.error(`#${r.id} ${e.message}`); continue; }
  checked++;
  const top = probs[0]; const pe = probs.find((x) => x.family === expected)?.p || 0;
  const mismatch = top.family !== expected && !near(top.family, expected) && top.p >= MIN_P && pe < 0.15;
  const note = mismatch ? `الصورة شكلها ${top.family} (${Math.round(top.p * 100)}%) والاسم/القسم ${expected}` : null;
  if (mismatch) { bad++; console.log(`#${r.id} [${r.store}] "${r.name_ar}" | ${note}`); }
  if (!process.env.DRY) q.run('UPDATE products SET photo_mismatch=?, photo_note=? WHERE id=?', [mismatch ? 1 : 0, note, r.id]);
}
console.log(`${process.env.DRY ? 'Dry run — ' : ''}checked ${checked}, mismatches ${bad}, no photo ${noPhoto}, type unknown ${noFamily}.${process.env.DRY ? '' : ' Restart the app: docker compose restart app'}`);
process.exit(0);
