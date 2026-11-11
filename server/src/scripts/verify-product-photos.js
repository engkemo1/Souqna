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
import { buildTextPrototypes, familyProbabilities, FAMILY_PROMPTS } from '../lib/visual-classify.js';
import { readMediaFile } from '../lib/media.js';
import { normalize } from '../lib/visual-core.js';
import { visualProductFamily } from '../lib/visual-taxonomy.js';
import { loadKnowledge } from '../lib/moda/knowledge.js';

const K = loadKnowledge();
const MIN_P = Number(process.env.MIN_P || 0.9); const LIMIT = Number(process.env.LIMIT || 100000);
// CLIP بيفرّق كويس بين (لبس / شنطة / جزمة / إكسسوار)، لكن بيتلخبط جدًا بين أنواع اللبس نفسها (محجبة في الصورة ← "محتشم"، طقم ← قميص/بنطلون).
// فبنعتبر التعارض حقيقي بس لو الصورة والاسم في مجموعتين مختلفتين من دول.
const GROUP = { tops: 'clothes', bottoms: 'clothes', dresses: 'clothes', suiting: 'clothes', outerwear: 'clothes', modest: 'clothes', sport: 'clothes', underwear_sleep: 'clothes', shoes: 'shoes', bags: 'bags', accessories: 'accessories' };
// منتجات قماش/لفّة (اسكارف، طرحة، شال…) بتتصوّر مطوية فبتشبه الشنطة في CLIP، ومنتجات الديكور/المفروشات كمان: مش بنفحص صورتها خالص.
const SOFT = /(اسكارف|ايشارب|إيشارب|وشاح|شال|سنول|طرحه|طرحة|حجاب|كوفيه|كوفية|بشكير|مفرش|ستارة|اسدال|إسدال|scarf|shawl|hijab|snood|stole|towel)/i;
const softText = (r) => SOFT.test(`${r.name_ar || ''} ${r.name_en || ''} ${r.cat_text || ''}`.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه'));
const near = (a, b) => (GROUP[a] || a) === (GROUP[b] || b);

if (!(await clipReady())) { console.error(`CLIP model not available: ${clipStatus().error}`); process.exit(1); }
// برومبتات إضافية للقماش المطوي (اسكارف/طرحة/شال) عشان CLIP ما يفتكرهوش شنطة. بتتستخدم هنا بس (مش بتغيّر البحث بالصورة).
const PROMPTS = { ...FAMILY_PROMPTS,
  accessories: [...FAMILY_PROMPTS.accessories, 'a folded silk scarf', 'a folded hijab headscarf', 'a shawl', 'a stack of folded fabric scarves'],
  modest: [...FAMILY_PROMPTS.modest, 'a folded hijab scarf', 'a printed hijab scarf'] };
const protos = { text: await buildTextPrototypes(clipEmbedTexts, PROMPTS), centroids: new Map() };
const PHOTOS = Number(process.env.PHOTOS || 4); // بنفحص لحد 4 صور للمنتج: لو أي صورة منهم متفقة مع الاسم يبقى سليم
async function photosOf(id) {
  const ms = q.all('SELECT m.* FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=? ORDER BY pm.is_primary DESC, pm.position LIMIT ?', [id, PHOTOS]);
  const out = [];
  for (const m of ms) { for (const f of ['md.jpg', 'md.webp', 'sm.jpg', 'sm.webp', 'original.jpg']) { try { out.push(await readMediaFile(m, f)); break; } catch { /* next */ } } }
  return out;
}
const rows = q.all(`SELECT p.id, p.name_ar, p.name_en, p.photo_mismatch, COALESCE(c.name_ar || ' ' || c.name_en, '') AS cat_text, p.department, s.slug AS store
  FROM products p JOIN stores s ON s.id=p.store_id LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active'${process.env.ONLY_NEW ? ' AND p.photo_mismatch IS NULL' : ''} LIMIT ?`, [LIMIT]);
let checked = 0, bad = 0, noPhoto = 0, noFamily = 0;
for (const r of rows) {
  if (Number(r.photo_mismatch) === 2) continue; // الأدمن اعتمد الصورة يدويًا: مبنعيدش فحصها
  const soft = softText(r);
  const expected = visualProductFamily(r, K);
  if (!expected) { noFamily++; continue; }
  const bufs = await photosOf(r.id);
  if (!bufs.length) { noPhoto++; continue; }
  // القماش/الاسكارف: لبس أو إكسسوار الاتنين مقبولين، ولازم تأكد أعلى (97%) قبل ما نعتبره تعارض
  const okGroup = (g) => g === (GROUP[expected] || expected) || (soft && (g === 'clothes' || g === 'accessories'));
  const need = soft ? Math.max(MIN_P, 0.97) : MIN_P;
  let agree = false; let worst = null;
  for (const buf of bufs) {
    let probs;
    try { probs = familyProbabilities(normalize(await clipEmbedImage(buf)), protos); } catch (e) { console.error(`#${r.id} ${e.message}`); continue; }
    const top = probs[0]; const pe = probs.find((x) => x.family === expected)?.p || 0;
    const isBad = !okGroup(GROUP[top.family] || top.family) && top.p >= need && pe < 0.15;
    if (!isBad) { agree = true; break; } // صورة واحدة سليمة تكفي
    if (!worst || top.p > worst.p) worst = { top, pe };
  }
  checked++;
  const mismatch = !agree && !!worst;
  const note = mismatch ? `كل الصور (${bufs.length}) شكلها ${worst.top.family} (${Math.round(worst.top.p * 100)}%) والاسم/القسم ${expected}` : null;
  if (mismatch) { bad++; console.log(`#${r.id} [${r.store}] "${r.name_ar}" | ${note}`); }
  if (!process.env.DRY) q.run('UPDATE products SET photo_mismatch=?, photo_note=? WHERE id=?', [mismatch ? 1 : 0, note, r.id]);
}
console.log(`${process.env.DRY ? 'Dry run — ' : ''}checked ${checked}, mismatches ${bad}, no photo ${noPhoto}, type unknown ${noFamily}.${process.env.DRY ? '' : ' Restart the app: docker compose restart app'}`);
process.exit(0);
