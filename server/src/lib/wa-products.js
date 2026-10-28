/**
 * Products by WhatsApp: a store owner sends a photo (caption = price) to the Twist number and it becomes a product.
 *  - The AI writes the name, description, colours and who it is for; the photo gets the usual studio treatment.
 *  - With a price it goes live straight away; without one it waits as a draft until the owner replies with the price.
 *  - Products added this way live LIFE_DAYS, then hide themselves (status → draft), like a story.
 *  - Replying to our "published" message: «خلص» hides it, «لسه» brings it back for another LIFE_DAYS, a number changes the price.
 * Everything is dormant unless WA_ENABLED=1 (the webhook answers 404 otherwise).
 */
import { q } from '../db/index.js';
import { onWhatsAppMessage } from '../routes/wa.js';
import { sendText, downloadMedia, waNumber, waReady } from './wa.js';
import { processImage, readMediaFile } from './media.js';
import { describeProduct, invalidateModaCatalogue } from './stylist.js';
import { triggerReindex } from './visual.js';
import { decodeDepartments } from '@souqna/shared';
import { productSchema, saveProduct } from '../routes/owner.js';

export const LIFE_DAYS = 14;
const DAY = 86400e3;
const DAILY_LIMIT = 60;
const SITE = (process.env.SITE_URL || 'https://twistegy.com').replace(/\/+$/, '');

const COLORS = {
  Black: ['#1C1C1E', 'أسود'], White: ['#F4F3EF', 'أبيض'], Grey: ['#8E9096', 'رمادي'], Navy: ['#1F2B4D', 'كحلي'], Blue: ['#30558F', 'أزرق'],
  Red: ['#B3343A', 'أحمر'], Burgundy: ['#6E2433', 'نبيتي'], Green: ['#3F7A55', 'أخضر'], Olive: ['#4E5A3A', 'زيتي'], Beige: ['#D9C6A5', 'بيج'],
  Brown: ['#7A5634', 'بني'], Yellow: ['#E2C044', 'أصفر'], Orange: ['#E07A3A', 'برتقالي'], Purple: ['#6C4E8C', 'بنفسجي'], Pink: ['#E8A5B5', 'بينك'],
};

const SOLD = /^(خلص|خلصت|خلاص خلصت|نفد|نفدت|نفذ|نفذت|اتباع|اتباعت|اتباعو|مفيش|بيع|sold|out)$/i;
const BACK = /^(لسه|لسة|موجود|موجوده|موجودة|رجع|رجعت|متاح|متاحه|متاحة|available|yes)$/i;

const toLatin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const clean = (s) => toLatin(s).trim().replace(/[.!؟?،,]+$/g, '').trim();
/** «فستان 350 جنيه» → { price: 350, words: 'فستان' } */
export function parseCaption(text) {
  const t = toLatin(text).replace(/,/g, '');
  const nums = [...t.matchAll(/\d{2,7}/g)].map((m) => Number(m[0])).filter((n) => n >= 10 && n <= 1_000_000);
  const words = t.replace(/\d+/g, ' ').replace(/(ج\.?م|جنيه|جنية|ج|le|egp|pound)s?/gi, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return { price: nums.length ? nums[nums.length - 1] : null, words };
}

/** The store whose WhatsApp/phone number matches the sender (owners only). */
function storeFor(from) {
  const rows = q.all("SELECT s.* FROM stores s JOIN users u ON u.id=s.owner_id WHERE u.role IN ('owner','admin') AND (s.whatsapp IS NOT NULL OR s.phone IS NOT NULL)");
  return rows.find((s) => waNumber(s.whatsapp) === from || waNumber(s.phone) === from) || null;
}

const productUrl = (store, p) => encodeURI(`${SITE}/s/${store.slug}/p/${p.slug}`);
const NO_NAME = 'منتج جديد';
const link = (outId, store, productId) => { if (outId) q.run('INSERT OR REPLACE INTO wa_links (out_id, store_id, product_id) VALUES (?,?,?)', [outId, store.id, productId]); };
const reply = (to, text, replyTo) => sendText(to, text, { replyTo }).catch((e) => { console.error(`[wa] reply failed: ${e.message}`); return null; });
const fmt = (n) => `${Number(n).toLocaleString('en-US')} ج.م`;
const touched = () => { invalidateModaCatalogue(); triggerReindex(); };

const HELP = [
  'أهلاً 👋 ده رقم تويست لإضافة المنتجات.',
  'ابعت صورة القطعة واكتب تحتها السعر، مثلاً: 350',
  'وإحنا هنكتب الاسم والوصف ونحسّن الصورة وننزلها في محلك.',
  `القطعة بتفضل ظاهرة ${LIFE_DAYS} يوم. لو خلصت قبلها، رد على رسالة النشر بكلمة «خلص».`,
].join('\n');

async function addFromPhoto(store, m) {
  const today = new Date().toISOString().slice(0, 10);
  const used = q.val("SELECT COUNT(*) FROM products WHERE store_id=? AND source='whatsapp' AND substr(created_at,1,10)=?", [store.id, today]) || 0;
  if (used >= DAILY_LIMIT) return reply(m.from, `وصلت للحد اليومي (${DAILY_LIMIT} منتج من واتساب). كمّل من لوحة التحكم أو بكرة.`, m.id);

  const { buffer } = await downloadMedia(m.image.id);
  const media = await processImage(buffer, { storeId: store.id, kind: 'product' });
  const { price, words } = parseCaption(m.image.caption || '');

  let ai = null;
  try {
    let src = buffer;
    for (const f of ['md.jpg', 'md.webp']) { try { src = await readMediaFile(media, f); break; } catch { /* next */ } }
    ai = await describeProduct(src, { hint: words || '', departments: decodeDepartments(store.departments) });
  } catch (e) { console.error(`[wa] AI describe failed: ${e.message}`); }

  const name = (ai?.name_ar || words || '').trim().slice(0, 120);
  const colors = (ai?.colors || []).map((c) => COLORS[c]).filter(Boolean).slice(0, 6).map(([hex, ar], i) => ({ hex, name_ar: ar, name_en: (ai.colors.filter((c) => COLORS[c]))[i] }));
  const audience = { men: 'men', women: 'women', kids: 'kids' }[ai?.department] || null;
  const live = Boolean(price && name.length >= 2);
  const data = productSchema.parse({
    name_ar: name.length >= 2 ? name : NO_NAME,
    name_en: ai?.name_en || '',
    description_ar: ai?.description_ar || '',
    description_en: ai?.description_en || '',
    price: price || 1,
    audience,
    colors,
    media: [media.id],
    status: live ? 'active' : 'draft',
    track_stock: false,
  });
  const id = saveProduct(store.id, data, null);
  q.run("UPDATE products SET source='whatsapp', expires_at=? WHERE id=?", [Date.now() + LIFE_DAYS * DAY, id]);
  touched();
  const p = q.get('SELECT * FROM products WHERE id=?', [id]);

  const text = live
    ? [`اتنشر ✓ «${p.name_ar}» بـ ${fmt(p.price)}`, productUrl(store, p), '', 'لو القطعة خلصت: رد على الرسالة دي بكلمة «خلص».', 'لو عايز تغيّر السعر: رد عليها بالسعر الجديد.'].join('\n')
    : name.length < 2
      ? ['استلمنا الصورة ✓', `ناقص ${price ? '' : 'السعر و'}اسم القطعة: رد على الرسالة دي ${price ? 'بالاسم' : 'بالسعر الأول (مثلاً 350) وبعدها بالاسم'}.`].join('\n')
      : [`استلمنا الصورة ✓ «${p.name_ar}»`, 'ناقص السعر بس: رد على الرسالة دي بالسعر (مثلاً 350) وهتتنشر على طول.'].join('\n');
  link(await reply(m.from, text, m.id), store, id);
}

async function handleReply(store, m, text) {
  const ln = q.get('SELECT * FROM wa_links WHERE out_id=? AND store_id=?', [m.context.id, store.id]);
  if (!ln) return false;
  const p = q.get('SELECT * FROM products WHERE id=? AND store_id=?', [ln.product_id, store.id]);
  if (!p) return false;
  const word = clean(text);
  const { price } = parseCaption(word);
  if (SOLD.test(word)) {
    q.run("UPDATE products SET status='draft', updated_at=datetime('now') WHERE id=?", [p.id]);
    touched();
    link(await reply(m.from, `تمام، «${p.name_ar}» اتشالت من المحل. لو رجعت، رد على الرسالة دي بكلمة «لسه».`, m.id), store, p.id);
    return true;
  }
  if (BACK.test(word)) {
    if (p.price < 2) { link(await reply(m.from, 'ناقص السعر: رد على الرسالة دي بالسعر.', m.id), store, p.id); return true; }
    q.run("UPDATE products SET status='active', expires_at=?, updated_at=datetime('now') WHERE id=?", [Date.now() + LIFE_DAYS * DAY, p.id]);
    touched();
    link(await reply(m.from, `رجعت ✓ «${p.name_ar}» ظاهرة تاني ${LIFE_DAYS} يوم.\n${productUrl(store, p)}`, m.id), store, p.id);
    return true;
  }
  if (price && /^\d+(\s*(ج\.?م|جنيه|جنية|ج))?$/.test(word)) {
    const named = p.name_ar !== NO_NAME;
    const status = p.status === 'archived' ? 'archived' : named ? 'active' : 'draft';
    q.run("UPDATE products SET price=?, status=?, expires_at=COALESCE(expires_at, ?), updated_at=datetime('now') WHERE id=?", [price, status, Date.now() + LIFE_DAYS * DAY, p.id]);
    touched();
    const fresh = q.get('SELECT * FROM products WHERE id=?', [p.id]);
    const msg = named ? `اتنشر ✓ «${fresh.name_ar}» بـ ${fmt(price)}\n${productUrl(store, fresh)}\n\nلو خلصت: رد بكلمة «خلص».` : `السعر ${fmt(price)} ✓ ناقص اسم القطعة: رد على الرسالة دي بالاسم.`;
    link(await reply(m.from, msg, m.id), store, p.id);
    return true;
  }
  if (p.name_ar === NO_NAME && word.length >= 2 && word.length <= 120 && !/^\d+$/.test(word)) {
    const live = p.price > 1 && p.status !== 'archived';
    q.run("UPDATE products SET name_ar=?, name_en=?, status=?, updated_at=datetime('now') WHERE id=?", [word, word, live ? 'active' : p.status, p.id]);
    touched();
    const fresh = q.get('SELECT * FROM products WHERE id=?', [p.id]);
    link(await reply(m.from, live ? `اتنشر ✓ «${word}» بـ ${fmt(fresh.price)}\n${productUrl(store, fresh)}\n\nلو خلصت: رد بكلمة «خلص».` : `الاسم «${word}» ✓ ناقص السعر: رد على الرسالة دي بالسعر.`, m.id), store, p.id);
    return true;
  }
  return false;
}

onWhatsAppMessage(async (m) => {
  if (!waReady()) return;
  const store = storeFor(m.from);
  if (!store) {
    if (m.type === 'image' || m.type === 'text') await reply(m.from, 'أهلاً بيك في تويست 👋\nالرقم ده لأصحاب المحلات المسجّلين. لو عندك محل وعايز تنضم، كلمنا من الموقع: twistegy.com', m.id);
    return;
  }
  if (m.type === 'image') {
    try { await addFromPhoto(store, m); } catch (e) {
      console.error(`[wa] photo → product failed: ${e.message}`);
      await reply(m.from, 'معرفناش نضيف الصورة دي. جرّب تبعتها تاني كصورة (مش ملف).', m.id);
    }
    return;
  }
  const text = m.text?.body || m.button?.text || '';
  if (m.context?.id && text && await handleReply(store, m, text)) return;
  await reply(m.from, HELP, m.id);
});

/** Hide WhatsApp products whose time is up (runs hourly). */
export function expireWhatsAppProducts(now = Date.now()) {
  const r = q.run("UPDATE products SET status='draft', updated_at=datetime('now') WHERE source='whatsapp' AND status='active' AND expires_at IS NOT NULL AND expires_at < ?", [now]);
  if (r.changes) { touched(); console.log(`[wa] ${r.changes} WhatsApp product(s) expired`); }
  return r.changes;
}
setInterval(() => { try { expireWhatsAppProducts(); } catch (e) { console.error(`[wa] expiry sweep failed: ${e.message}`); } }, 3600e3).unref();
