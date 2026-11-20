/**
 * Products by WhatsApp: a store owner sends a photo (caption = price) to the Twist number and it becomes a product.
 *  - The AI writes the name, description, colours and who it is for; the photo gets the usual studio treatment.
 *  - NOTHING goes live by itself: every photo becomes a draft and the owner confirms with the «نشر الآن» button (message cost: ~2 per product).
 *  - Only real clothing photos count: tiny images, phone screenshots and anything the AI does not call a product are refused and never saved.
 *  - Products added this way live LIFE_DAYS, then hide themselves (status → draft), like a story.
 *  - Replying to our "published" message: «خلص» hides it, «لسه» brings it back for another LIFE_DAYS, a number changes the price.
 * Everything is dormant unless WA_ENABLED=1 (the webhook answers 404 otherwise).
 */
import { q } from '../db/index.js';
import { onWhatsAppMessage } from '../routes/wa.js';
import sharp from 'sharp';
import { sendText, sendButtons, downloadMedia, waNumber, waReady } from './wa.js';
import { processImage } from './media.js';
import { describeProduct, invalidateModaCatalogue } from './stylist.js';
import { triggerReindex } from './visual.js';
import { decodeDepartments } from '@souqna/shared';
import { productSchema, saveProduct } from '../routes/owner.js';
import { notifyPlatformAlert } from './whatsapp.js';
import { quotaFor, usedThisMonth, quotaLeft, productsEnabled, storeEnabled, messageFor, requestUpgrade, noteRejected, alertCapOk, COMPANY_NUMBER } from './wa-quota.js';

export const LIFE_DAYS = 14;
const DAY = 86400e3;
const DAILY_LIMIT = 20;   // photos accepted per store per day
const MAX_PHOTOS = 6;     // photos per product
const PENDING_LIMIT = 10; // drafts waiting for the owner's «نشر / إلغاء»
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
  const words = t.replace(/\d+/g, ' ').replace(/(^|\s)(ج\.?م|جنيه|جنية|ج|le|egp|pounds?)(?=\s|$)/gi, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return { price: nums.length ? nums[nums.length - 1] : null, words };
}

// ---- Structured caption: one field per line («الاسم: …», «السعر: …», «قبل الخصم: …», «الألوان: …», «المقاسات: …», «الخامة: …», «مفيش استبدال») ----
const norm = (s) => toLatin(s).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ًٌٍَُِّْـ]/g, '').trim();
const COLOR_AR = (() => {
  const m = {};
  for (const [, [hex, ar]] of Object.entries(COLORS)) m[norm(ar)] = [hex, ar];
  Object.assign(m, { [norm('اسود')]: COLORS.Black, [norm('رمادى')]: COLORS.Grey, [norm('كحلى')]: COLORS.Navy, [norm('ازرق')]: COLORS.Blue, [norm('سماوي')]: ['#7FB5E0', 'سماوي'], [norm('لبني')]: ['#7FB5E0', 'سماوي'], [norm('وردي')]: COLORS.Pink, [norm('روز')]: COLORS.Pink, [norm('فضي')]: ['#C0C0C0', 'فضي'], [norm('ذهبي')]: ['#C9A227', 'ذهبي'], [norm('عنابي')]: COLORS.Burgundy, [norm('موف')]: COLORS.Purple, [norm('طوبي')]: ['#A5522E', 'طوبي'], [norm('كاكي')]: ['#A89968', 'كاكي'], [norm('جملي')]: ['#B98A55', 'جملي'], [norm('سكري')]: ['#E6D8BE', 'سكري'], [norm('كريمي')]: ['#EFE6D2', 'كريمي'], [norm('اوف وايت')]: ['#EFE9DA', 'أوف وايت'], [norm('زيتوني')]: COLORS.Olive, [norm('احمر')]: COLORS.Red, [norm('اخضر')]: COLORS.Green, [norm('اصفر')]: COLORS.Yellow, [norm('بنفسجي')]: COLORS.Purple });
  return m;
})();
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const LABELS = {
  name: /^(?:اسم(?:\s*القطعه)?|الاسم|المنتج|name)$/, price: /^(?:السعر|سعر|price)$/, old: /^(?:قبل(?:\s*الخصم)?|السعر\s*(?:قبل|القديم)|بدل|كان|سعر\s*قديم)$/,
  colors: /^(?:الوان|الالوان|لون|اللون|colou?rs?)$/, sizes: /^(?:مقاسات|المقاسات|مقاس|المقاس|sizes?)$/, material: /^(?:خامه|الخامه|الخامات|خامات|material)$/,
};
const NO_EXCHANGE = /(?:^|\s)(?:مفيش|ممنوع|بدون|من\s*غير|لا)\s*(?:استبدال|ارجاع|استرجاع)|(?:استبدال|استرجاع|ارجاع)\s*(?:ممنوع|غير\s*متاح)/;

function parseSizes(raw) {
  const out = [];
  const t = toLatin(raw).toUpperCase().replace(/فري\s*سايز|FREE\s*SIZE|FREESIZE|ONE\s*SIZE/g, ' FREE ').replace(/[،,/|\\]+/g, ' ');
  const rng = t.match(/(\d{2,3})\s*(?:-|الي|الى|لـ|ل|TO)\s*(\d{2,3})/);
  if (rng && Number(rng[2]) > Number(rng[1]) && Number(rng[2]) - Number(rng[1]) <= 12) for (let n = Number(rng[1]); n <= Number(rng[2]); n++) out.push(String(n));
  const letters = t.match(/\b(XXS|XS|S|M|L|XL|XXL|[2-5]XL)\s*-\s*(XXS|XS|S|M|L|XL|XXL|[2-5]XL)\b/);
  if (letters) { const a = SIZE_ORDER.indexOf(letters[1]); const b = SIZE_ORDER.indexOf(letters[2]); if (a >= 0 && b > a) out.push(...SIZE_ORDER.slice(a, b + 1)); }
  const rest = t.replace(/(\d{2,3})\s*(?:-|الي|الى|لـ|ل|TO)\s*(\d{2,3})/g, ' ').replace(/\b(XXS|XS|S|M|L|XL|XXL|[2-5]XL)\s*-\s*(XXS|XS|S|M|L|XL|XXL|[2-5]XL)\b/g, ' ');
  for (const tok of rest.split(/[\s\-+]+/)) {
    if (!tok) continue;
    if (tok === 'FREE') out.push('فري سايز');
    else if (/^(XXS|XS|S|M|L|XL|XXL|[2-5]XL)$/.test(tok) || /^\d{2,3}$/.test(tok)) out.push(tok);
  }
  return [...new Set(out)].slice(0, 20);
}

function parseColors(raw) {
  const out = [];
  const parts = norm(raw).split(/[\s،,/\-+]+/).filter(Boolean);
  const seen = new Set();
  for (let i = 0; i < parts.length; i++) {
    const two = i + 1 < parts.length ? `${parts[i]} ${parts[i + 1]}` : '';
    let hit = COLOR_AR[two] ? (i++, COLOR_AR[two]) : COLOR_AR[parts[i]];
    if (!hit && parts[i].startsWith('و') && COLOR_AR[parts[i].slice(1)]) hit = COLOR_AR[parts[i].slice(1)];
    if (hit && !seen.has(hit[1])) { seen.add(hit[1]); out.push({ hex: hit[0], name_ar: hit[1], name_en: hit[1] }); }
  }
  return out.slice(0, 8);
}

/** Everything the owner can say in the caption. Without labels it behaves like the old «اسم + سعر». */
export function parseDetails(text) {
  const d = { name: '', price: null, oldPrice: null, colors: [], sizes: [], material: '', noReturn: false, labeled: false };
  const free = [];
  for (const line of toLatin(text).split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    if (NO_EXCHANGE.test(norm(l))) { d.noReturn = true; continue; }
    const m = l.match(/^([^:：=]{1,24})[:：=]\s*(.+)$/);
    const key = m && Object.entries(LABELS).find(([, re]) => re.test(norm(m[1])));
    if (!key) { free.push(l); continue; }
    d.labeled = true;
    const v = m[2].trim();
    const num = (v.match(/\d[\d,]*/) || [''])[0].replace(/,/g, '');
    if (key[0] === 'name') d.name = v.slice(0, 120);
    else if (key[0] === 'price') d.price = Number(num) || null;
    else if (key[0] === 'old') d.oldPrice = Number(num) || null;
    else if (key[0] === 'colors') d.colors = parseColors(v);
    else if (key[0] === 'sizes') d.sizes = parseSizes(v);
    else if (key[0] === 'material') d.material = v.slice(0, 80);
  }
  const rest = free.join(' ');
  const both = norm(rest).match(/(\d{2,7})\s*(?:بدل|كان|قبل)\s*(\d{2,7})/) || norm(rest).match(/(\d{2,7})\s*(?:بدل|كان|قبل)/);
  const loose = parseCaption(rest);
  if (!d.price) d.price = both ? Number(both[1]) : loose.price;
  if (!d.oldPrice && both && both[2]) d.oldPrice = Number(both[2]);
  if (!d.name) d.name = (d.labeled ? free[0] || '' : loose.words).replace(/\d+/g, ' ').replace(/(^|\s)(ج\.?م|جنيه|جنية|ج)(?=\s|$)/g, ' ').replace(/(^|\s)(بدل|كان|قبل)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (d.oldPrice && (!d.price || d.oldPrice <= d.price)) d.oldPrice = null;
  return d;
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

const CAPTION_TEMPLATE = ['الاسم: فستان سواريه', 'السعر: 350', 'قبل الخصم: 450', 'الألوان: أسود، أحمر، بيج', 'المقاسات: S M L XL', 'الخامة: ستان', 'مفيش استبدال'].join('\n');
const HELP = [
  'أهلاً 👋 ده رقم تويست لإضافة المنتجات.',
  'ابعت صورة القطعة نفسها (مش لقطة شاشة) واكتب تحتها بالشكل ده. لو عندك أكتر من صورة لنفس القطعة ابعتهم ورا بعض (الكابشن على أول صورة بس):',
  '',
  CAPTION_TEMPLATE,
  '',
  'المطلوب بس الاسم والسعر، والباقي اختياري: «قبل الخصم» لو فيه خصم، و«مفيش استبدال» لو القطعة مبتتبدلش.',
  'بعدها هيجيلك زرار «نشر الآن» للتأكيد. مفيش حاجة بتظهر في المحل قبل ما تضغطه.',
  `القطعة بتفضل ظاهرة ${LIFE_DAYS} يوم. لو خلصت قبلها رد على رسالة النشر بكلمة «خلص».`,
  'التفاصيل التانية (المخزون، الفئة) تقدر تكمّلها من لوحة التحكم.',
  `محتاج مساعدة؟ كلّم فريق تويست: https://wa.me/${COMPANY_NUMBER}`,
].join('\n');

const NOT_PRODUCT = ['معرفناش نتعرف على قطعة ملابس في الصورة، فمحطّيناهاش في المحل.', 'ابعت صورة واضحة للقطعة نفسها (مش لقطة شاشة) واكتب تحتها الاسم والسعر، أو ابعت كلمة «مساعدة» عشان أبعتلك الشكل الكامل.'].join('\n');
const pendingCount = (storeId) => q.val("SELECT COUNT(*) FROM products WHERE store_id=? AND source='whatsapp' AND status='draft' AND expires_at IS NULL", [storeId]) || 0;

/** Cheap check before any AI cost: reject tiny pictures and phone screenshots (those are ~2:1 or taller). */
async function plausiblePhoto(buffer) {
  try {
    const { width = 0, height = 0 } = await sharp(buffer).metadata();
    if (width < 300 || height < 300) return false;
    return Math.max(width, height) / Math.min(width, height) <= 2.1;
  } catch { return false; }
}

const summary = (p) => {
  const j = (x) => { try { const v = JSON.parse(x || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const colors = j(p.colors_json).map((c) => c.name_ar).filter(Boolean).join('، ');
  const sizes = j(p.sizes_json).join(' ');
  return [`استلمنا ✓ «${p.name_ar}»`, `السعر: ${fmt(p.price)}${p.compare_at_price ? ` (قبل الخصم ${fmt(p.compare_at_price)})` : ''}`, colors && `الألوان: ${colors}`, sizes && `المقاسات: ${sizes}`, p.material_ar && `الخامة: ${p.material_ar}`, p.no_return ? 'مفيش استبدال' : '', quotaLeft(p.store_id) <= 5 ? `(باقي لك ${quotaLeft(p.store_id)} قطعة الشهر ده بواتساب)` : ''].filter(Boolean).join('\n');
};
/** Ask the owner to decide. The product stays a hidden draft until «نشر الآن» is pressed. */
async function askConfirm(to, store, p, replyTo) {
  const id = await sendButtons(to, summary(p) + '\nتنشرها في محلك دلوقتي؟', [{ id: `wp:pub:${p.id}`, title: 'نشر الآن' }, { id: `wp:del:${p.id}`, title: 'إلغاء' }])
    .catch((e) => { console.error(`[wa] confirm buttons failed: ${e.message}`); return null; });
  link(id, store, p.id);
  return id;
}

async function addFromPhoto(store, m) {
  const today = new Date().toISOString().slice(0, 10);
  const used = q.val("SELECT COUNT(*) FROM products WHERE store_id=? AND source='whatsapp' AND substr(created_at,1,10)=?", [store.id, today]) || 0;
  if (used >= DAILY_LIMIT) return reply(m.from, `وصلت للحد اليومي (${DAILY_LIMIT} منتج من واتساب). كمّل من لوحة التحكم أو بكرة.`, m.id);
  const cap = quotaFor(store.id);
  if (usedThisMonth(store.id) >= cap) {
    await sendButtons(m.from, messageFor('limit', { limit: cap }), [{ id: 'wp:upg', title: 'عايز أزوّد الحد' }]).catch(() => reply(m.from, messageFor('limit', { limit: cap }), m.id));
    return;
  }
  if (pendingCount(store.id) >= PENDING_LIMIT) return reply(m.from, `عندك ${PENDING_LIMIT} قطع مستنية قرارك. اضغط «نشر الآن» أو «إلغاء» على رسايلها الأول، وبعدها ابعت غيرها.`, m.id);

  const { buffer } = await downloadMedia(m.image.id);
  if (!(await plausiblePhoto(buffer))) { noteRejected(store.id); return reply(m.from, NOT_PRODUCT, m.id); }

  // More photos of the SAME piece: a photo with no caption sent right after another one, or a photo sent as a reply to that product's message.
  const noCaption = !(m.image.caption || '').trim();
  const viaReply = m.context?.id ? q.val('SELECT product_id FROM wa_links WHERE out_id=? AND store_id=?', [m.context.id, store.id]) : null;
  const target = viaReply
    ? q.get("SELECT * FROM products WHERE id=? AND store_id=? AND source='whatsapp' AND status<>'archived'", [viaReply, store.id])
    : noCaption ? q.get("SELECT * FROM products WHERE store_id=? AND source='whatsapp' AND status='draft' AND expires_at IS NULL AND created_at >= datetime('now','-3 minutes') ORDER BY id DESC LIMIT 1", [store.id]) : null;
  if (target) {
    const have = q.val('SELECT COUNT(*) FROM product_media WHERE product_id=?', [target.id]) || 0;
    if (have >= MAX_PHOTOS) return reply(m.from, `وصلت للحد الأقصى (${MAX_PHOTOS} صور للقطعة الواحدة).`, m.id);
    const extra = await processImage(buffer, { storeId: store.id, kind: 'product' });
    q.run('INSERT INTO product_media (product_id, media_id, position, is_primary) VALUES (?,?,?,0)', [target.id, extra.id, have]);
    q.run("UPDATE products SET updated_at=datetime('now') WHERE id=?", [target.id]);
    touched();
    if (viaReply) await reply(m.from, `اتضافت الصورة لـ «${target.name_ar}» ✓ (${have + 1} صور)`, m.id);
    return;
  }
  const det = parseDetails(m.image.caption || '');
  const { price, name: words } = det;

  // Read the photo BEFORE saving anything: a screenshot or an unclear shot must never become a product.
  let ai = null;
  try {
    ai = await describeProduct(buffer, { hint: words || '', departments: decodeDepartments(store.departments) });
  } catch (e) { console.error(`[wa] AI describe failed: ${e.message}`); }

  const name = (words || ai?.name_ar || '').trim().slice(0, 120);
  // AI answered: it must say this is a product. AI unavailable: accept only when the owner typed both a name and a price himself.
  const ok = ai ? ai.is_product === true && name.length >= 2 : words.length >= 2 && Boolean(price);
  if (!ok) { noteRejected(store.id); return reply(m.from, NOT_PRODUCT, m.id); }

  const media = await processImage(buffer, { storeId: store.id, kind: 'product' });
  const aiColors = (ai?.colors || []).map((c) => COLORS[c] && ({ hex: COLORS[c][0], name_ar: COLORS[c][1], name_en: c })).filter(Boolean).slice(0, 6);
  const colors = det.colors.length ? det.colors : aiColors; // the owner's own list wins
  const audience = { men: 'men', women: 'women', kids: 'kids' }[ai?.department] || null;
  const data = productSchema.parse({
    name_ar: name,
    name_en: ai?.name_en || '',
    description_ar: ai?.description_ar || '',
    description_en: ai?.description_en || '',
    price: price || 1,
    audience,
    colors,
    media: [media.id],
    compare_at_price: det.oldPrice || null,
    sizes: det.sizes,
    material: det.material || null,
    ...(det.noReturn ? { no_return: true } : {}),
    status: 'draft',
    track_stock: false,
  });
  const id = saveProduct(store.id, data, null);
  q.run("UPDATE products SET source='whatsapp', expires_at=NULL WHERE id=?", [id]); // expires_at is set only when it is published
  touched();
  const p = q.get('SELECT * FROM products WHERE id=?', [id]);

  if (price) { await askConfirm(m.from, store, p, m.id); return; }
  link(await reply(m.from, `استلمنا الصورة ✓ «${p.name_ar}»\nناقص السعر بس: رد على الرسالة دي بالسعر (مثلاً 350).`, m.id), store, id);
}

/** «نشر الآن» / «إلغاء» buttons (payload wp:pub:<id> / wp:del:<id>). */
async function handleProductButton(store, m, payload) {
  if (payload === 'wp:upg') { requestUpgrade(store.id); if (alertCapOk('upgrade', 3)) notifyPlatformAlert(`طلب زيادة حد واتساب من محل ${store.name_ar} (استخدم ${usedThisMonth(store.id)} من ${quotaFor(store.id)} هذا الشهر). رقمه: ${waNumber(store.whatsapp) || waNumber(store.phone) || m.from}`); console.log(`[wa] store ${store.id} asked to raise its WhatsApp limit`); await reply(m.from, messageFor('upg'), m.id); return; }
  const [, action, pid] = payload.match(/^wp:(pub|del):(\d+)$/) || [];
  if (!action) return;
  const p = q.get("SELECT * FROM products WHERE id=? AND store_id=? AND source='whatsapp'", [Number(pid), store.id]);
  if (!p) { await reply(m.from, 'مش لاقيين القطعة دي.', m.id); return; }
  if (p.status === 'archived') { await reply(m.from, 'القطعة دي اتلغت قبل كده. ابعت صورتها تاني لو عايزها.', m.id); return; }
  if (action === 'del') {
    if (p.status !== 'draft') { await reply(m.from, 'القطعة دي اتنشرت قبل كده. لو خلصت رد على رسالة النشر بكلمة «خلص».', m.id); return; }
    q.run("UPDATE products SET status='archived', updated_at=datetime('now') WHERE id=?", [p.id]);
    touched();
    await reply(m.from, 'اتلغت ✓ ومحطّيناهاش في المحل.', m.id);
    return;
  }
  if (p.status === 'active') { await reply(m.from, `القطعة دي منشورة بالفعل ✓\n${productUrl(store, p)}`, m.id); return; }
  if (p.name_ar === NO_NAME || p.price < 2) { link(await reply(m.from, 'ناقص السعر: رد على رسالة القطعة بالسعر (مثلاً 350) وبعدها اضغط «نشر الآن».', m.id), store, p.id); return; }
  q.run("UPDATE products SET status='active', expires_at=?, updated_at=datetime('now') WHERE id=?", [Date.now() + LIFE_DAYS * DAY, p.id]);
  touched();
  const fresh = q.get('SELECT * FROM products WHERE id=?', [p.id]);
  link(await reply(m.from, [`اتنشر ✓ «${fresh.name_ar}» بـ ${fmt(fresh.price)}`, productUrl(store, fresh), '', 'لو القطعة خلصت: رد على الرسالة دي بكلمة «خلص».', 'لو عايز تغيّر السعر: رد عليها بالسعر الجديد.'].join('\n'), m.id), store, p.id);
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
    if (p.status === 'draft' && p.expires_at == null) { await askConfirm(m.from, store, p, m.id); return true; } // never published yet: needs the explicit button
    q.run("UPDATE products SET status='active', expires_at=?, updated_at=datetime('now') WHERE id=?", [Date.now() + LIFE_DAYS * DAY, p.id]);
    touched();
    link(await reply(m.from, `رجعت ✓ «${p.name_ar}» ظاهرة تاني ${LIFE_DAYS} يوم.\n${productUrl(store, p)}`, m.id), store, p.id);
    return true;
  }
  if (price && /^\d+(\s*(ج\.?م|جنيه|جنية|ج))?$/.test(word)) {
    const named = p.name_ar !== NO_NAME;
    q.run("UPDATE products SET price=?, updated_at=datetime('now') WHERE id=?", [price, p.id]); // status is NOT touched: a draft stays a draft
    touched();
    const fresh = q.get('SELECT * FROM products WHERE id=?', [p.id]);
    if (p.status === 'active') link(await reply(m.from, `السعر اتغيّر ✓ «${fresh.name_ar}» بقى ${fmt(price)}\n${productUrl(store, fresh)}`, m.id), store, p.id);
    else if (p.status === 'draft' && named) await askConfirm(m.from, store, fresh, m.id);
    else if (p.status === 'draft') link(await reply(m.from, `السعر ${fmt(price)} ✓ ناقص اسم القطعة: رد على الرسالة دي بالاسم.`, m.id), store, p.id);
    return true;
  }
  if (p.name_ar === NO_NAME && p.status === 'draft' && word.length >= 2 && word.length <= 120 && !/^\d+$/.test(word)) {
    q.run("UPDATE products SET name_ar=?, name_en=?, updated_at=datetime('now') WHERE id=?", [word, word, p.id]);
    touched();
    const fresh = q.get('SELECT * FROM products WHERE id=?', [p.id]);
    if (fresh.price > 1) await askConfirm(m.from, store, fresh, m.id);
    else link(await reply(m.from, `الاسم «${word}» ✓ ناقص السعر: رد على الرسالة دي بالسعر.`, m.id), store, p.id);
    return true;
  }
  return false;
}

const lanes = new Map(); // one message at a time per sender, so a batch of photos is attached in order
onWhatsAppMessage((m) => {
  const run = (lanes.get(m.from) || Promise.resolve()).catch(() => {}).then(() => handleMessage(m));
  lanes.set(m.from, run);
  run.finally(() => { if (lanes.get(m.from) === run) lanes.delete(m.from); });
  return run;
});

async function handleMessage(m) {
  if (!waReady()) return;
  if (/^(ord|cust):/.test(m.button?.payload || m.interactive?.button_reply?.id || '')) return; // order buttons: handled in wa-orders.js
  const store = storeFor(m.from);
  if (!store) {
    if (m.type === 'image' || m.type === 'text') await reply(m.from, `أهلاً بيك في تويست 👋\nالرقم ده لأصحاب المحلات المسجّلين بس.\nلو عندك محل وعايز تنضم: سجّل من الموقع twistegy.com أو كلّم فريقنا على واتساب: https://wa.me/${COMPANY_NUMBER}\nولو بتدوّر على منتج، ادخل الموقع وهتلاقي مساعد تويستا يساعدك.`, m.id);
    return;
  }
  if (!productsEnabled() || !storeEnabled(store.id)) { if (m.type === 'image' || m.type === 'text' || /^wp:/.test(m.interactive?.button_reply?.id || m.button?.payload || '')) await reply(m.from, messageFor('off'), m.id); return; }
  const btn = m.interactive?.button_reply?.id || m.button?.payload || '';
  if (/^wp:/.test(btn)) { await handleProductButton(store, m, btn).catch((e) => console.error(`[wa] product button failed: ${e.message}`)); return; }
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
}

/** Hide WhatsApp products whose time is up (runs hourly). */
export function expireWhatsAppProducts(now = Date.now()) {
  const r = q.run("UPDATE products SET status='draft', updated_at=datetime('now') WHERE source='whatsapp' AND status='active' AND expires_at IS NOT NULL AND expires_at < ?", [now]);
  if (r.changes) { touched(); console.log(`[wa] ${r.changes} WhatsApp product(s) expired`); }
  return r.changes;
}
setInterval(() => { try { expireWhatsAppProducts(); } catch (e) { console.error(`[wa] expiry sweep failed: ${e.message}`); } }, 3600e3).unref();
import './wa-orders.js'; // order buttons (store confirm steps + customer quick questions)
