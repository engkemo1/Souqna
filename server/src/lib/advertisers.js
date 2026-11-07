/**
 * Outside advertisers ("معلن خارجي"): a business that does NOT have a shop on the platform but appears in a featured ad.
 * Clicking the ad opens a light public profile page (/a/:slug): name, photos, address, hours, WhatsApp / call / map buttons and an
 * optional "say this word at the shop" offer. No products, no cart. Contact clicks are counted per day so the advertiser can be
 * sent a simple report. The platform admin manages these records; nothing here is editable by the public.
 */
import crypto from 'node:crypto';
import { q, db, insert, update } from '../db/index.js';
import { AppError } from './errors.js';
import { cairoStamp } from './promotions/store.js';
import { safeUrl, repeatMatches, parseRepeat } from './featured.js';
import { syncAdvertiserShop, cartInfoFor, isSellable } from './advertiser-shop.js';

db.exec(`
CREATE TABLE IF NOT EXISTS featured_advertisers (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
  tagline_ar TEXT NOT NULL DEFAULT '', tagline_en TEXT NOT NULL DEFAULT '',
  about_ar TEXT NOT NULL DEFAULT '', about_en TEXT NOT NULL DEFAULT '',
  logo TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', gallery_json TEXT NOT NULL DEFAULT '[]',
  address_ar TEXT NOT NULL DEFAULT '', address_en TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', maps_url TEXT NOT NULL DEFAULT '',
  hours_ar TEXT NOT NULL DEFAULT '', hours_en TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '', facebook TEXT NOT NULL DEFAULT '',
  offer_text_ar TEXT NOT NULL DEFAULT '', offer_text_en TEXT NOT NULL DEFAULT '', offer_code TEXT NOT NULL DEFAULT '',
  hours_json TEXT NOT NULL DEFAULT '',
  twist_orders INTEGER NOT NULL DEFAULT 0, store_id INTEGER,
  consent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS featured_advertiser_stats (
  day TEXT NOT NULL, advertiser_id INTEGER NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, advertiser_id, event)
);
`);

for (const [col, ddl] of [['lat', 'REAL'], ['lng', 'REAL'], ['tiktok', "TEXT NOT NULL DEFAULT ''"], ['hours_json', "TEXT NOT NULL DEFAULT ''"], ['twist_orders', 'INTEGER NOT NULL DEFAULT 0'], ['store_id', 'INTEGER']]) {
  if (!q.all('PRAGMA table_info(featured_advertisers)').some((c) => c.name === col)) db.exec(`ALTER TABLE featured_advertisers ADD COLUMN ${col} ${ddl}`);
}

export const EVENTS = ['view', 'whatsapp', 'call', 'map', 'offer', 'social', 'order', 'cart'];
const WINDOW = { view: 30 * 60e3, whatsapp: 20e3, call: 20e3, map: 20e3, offer: 20e3, social: 20e3, order: 20e3, cart: 5e3 };
const seen = new Map();
export const _resetSeen = () => seen.clear();

const MSG = {
  required: ['This field is required', 'هذا الحقل مطلوب'], too_long: ['Too long', 'النص طويل'], bad_value: ['Invalid value', 'قيمة غير صالحة'],
  bad_url: ['Invalid link — use https://', 'رابط غير صالح — لازم https://'], bad_phone: ['Invalid phone number', 'رقم غير صالح'],
  slug_taken: ['This page address is already used', 'عنوان الصفحة مستخدم قبل كده'], consent_required: ['Advertiser consent is required to publish', 'لازم تأكد موافقة المعلن على النشر'],
  too_many: ['Too many photos (max 6)', 'عدد الصور كبير (٦ بحد أقصى)'], no_sellable: ['Give at least one photo a name and a price first', 'اكتب اسم وسعر لصورة واحدة على الأقل الأول'], bad_price: ['Price must be a whole number of EGP', 'السعر لازم رقم صحيح بالجنيه'],
};
function invalid(fields) { const m = MSG[Object.values(fields)[0]] || MSG.bad_value; throw new AppError(422, 'validation_failed', `${m[0]} — ${m[1]}`, fields); }

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max + 1);
/** Egyptian numbers: 01xxxxxxxxx → 20xxxxxxxxxx. Anything else must already be 8–15 digits (international, no +). */
export function normalizePhone(v) {
  let d = String(v ?? '').replace(/[\s\-().+]/g, '');
  if (!d) return '';
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (/^0\d{10}$/.test(d)) d = `20${d.slice(1)}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function normalizeAdvertiser(body, { id = null } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const f = {}; const out = {};
  const text = (k, max, req = false) => { const v = clean(b[k], max); if (v.length > max) f[k] = 'too_long'; else if (req && !v) f[k] = 'required'; return v.slice(0, max); };
  out.name_ar = text('name_ar', 80, true); out.name_en = text('name_en', 80);
  out.tagline_ar = text('tagline_ar', 90); out.tagline_en = text('tagline_en', 90);
  out.about_ar = text('about_ar', 400); out.about_en = text('about_en', 400);
  out.address_ar = text('address_ar', 160); out.address_en = text('address_en', 160);
  out.hours_ar = text('hours_ar', 100); out.hours_en = text('hours_en', 100);
  out.offer_text_ar = text('offer_text_ar', 120); out.offer_text_en = text('offer_text_en', 120);
  out.offer_code = text('offer_code', 30);
  if (/https?:|www\./i.test(out.offer_code)) f.offer_code = 'bad_value';
  const url = (k) => { const v = safeUrl(b[k]); if (v === null || (v && !/^https:/i.test(v))) { f[k] = 'bad_url'; return ''; } return v; };
  for (const k of ['logo', 'cover']) { const v = safeUrl(b[k]); if (v === null) f[k] = 'bad_url'; out[k] = v || ''; }
  out.maps_url = url('maps_url'); out.instagram = url('instagram'); out.facebook = url('facebook'); out.tiktok = url('tiktok');
  const gal = Array.isArray(b.gallery) ? b.gallery : [];
  // optional per-photo colours / sizes: an array or free text split on , ، ; and newlines. Max 10 values of 20 characters, duplicates dropped; null = invalid.
  const opts = (v) => {
    if (v === undefined || v === null || v === '') return [];
    const list = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,،;\n]/) : null);
    if (!list) return null;
    const seen = new Set(); const res = [];
    for (const x of list) {
      if (typeof x !== 'string' && typeof x !== 'number') return null;
      const t = clean(String(x), 40);
      if (!t) continue;
      if (t.length > 20) return null;
      const k = t.toLowerCase();
      if (!seen.has(k)) { seen.add(k); res.push(t); }
    }
    return res.length > 10 ? null : res;
  };
  if (gal.length > 6) f.gallery = 'too_many';
  out.gallery = [];
  // each photo may carry an optional name + price (managed by the platform admin, not by the advertiser). Plain strings = photo only.
  for (const g of gal.slice(0, 6)) {
    const o = typeof g === 'string' ? { src: g } : (g && typeof g === 'object' ? g : {});
    const src = safeUrl(o.src);
    if (src === null) { f.gallery = 'bad_url'; break; }
    if (!src) continue;
    const name = clean(o.name, 60);
    if (name.length > 60) { f.gallery = 'too_long'; break; }
    let price = null;
    if (o.price !== undefined && o.price !== null && o.price !== '') { const n = Number(o.price); if (!Number.isInteger(n) || n < 1 || n > 10_000_000) { f.gallery = 'bad_price'; break; } price = n; }
    const colors = opts(o.colors); const sizes = opts(o.sizes);
    if (colors === null || sizes === null) { f.gallery = 'bad_options'; break; }
    out.gallery.push({ src, name, price, ...(colors.length ? { colors } : {}), ...(sizes.length ? { sizes } : {}) });
  }
  // shop location picked on the map (optional): both numbers or neither
  const hasLat = b.lat !== undefined && b.lat !== null && b.lat !== ''; const hasLng = b.lng !== undefined && b.lng !== null && b.lng !== '';
  out.lat = null; out.lng = null;
  if (hasLat || hasLng) {
    const la = Number(b.lat); const ln = Number(b.lng);
    if (!hasLat || !hasLng || !Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) f.lat = 'bad_location';
    else { out.lat = Math.round(la * 1e6) / 1e6; out.lng = Math.round(ln * 1e6) / 1e6; }
  }
  for (const k of ['whatsapp', 'phone']) { const v = normalizePhone(b[k]); if (v === null) f[k] = 'bad_phone'; out[k] = v || ''; }
  // structured opening hours (optional) → "open now" badge. Same shape as an ad's repeat: open days + one daily window (past midnight allowed).
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const from = String(b.open_from || ''); const to = String(b.open_to || '');
  const days = [...new Set((Array.isArray(b.open_days) ? b.open_days : []).map(Number))];
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) f.open_days = 'bad_value';
  if ((from || to) && (!hm.test(from) || !hm.test(to) || from === to)) f.open_from = 'bad_value';
  out.hours = (from && to && !f.open_from) ? { days: days.length === 7 ? [] : days.sort((a, c) => a - c), windows: [{ from, to }] } : (days.length && days.length < 7 && !f.open_days ? { days: days.sort((a, c) => a - c), windows: [] } : null);
  out.twist_orders = b.twist_orders === true || b.twist_orders === 1 || b.twist_orders === '1' ? 1 : 0;
  if (out.twist_orders && !out.gallery.some(isSellable)) f.twist_orders = 'no_sellable';
  out.consent = b.consent === true || b.consent === 1 || b.consent === '1' ? 1 : 0;
  out.status = b.status === 'hidden' ? 'hidden' : 'active';
  if (out.status === 'active' && !out.consent) f.consent = 'consent_required';
  if (!out.whatsapp && !out.phone && !out.maps_url && out.lat === null && !f.whatsapp && !f.phone) f.whatsapp = 'required'; // a profile with no way to reach the business is useless
  let slug = slugify(b.slug) || slugify(out.name_en) || '';
  if (!slug) slug = `a-${crypto.randomBytes(3).toString('hex')}`;
  const clash = q.get('SELECT id FROM featured_advertisers WHERE slug=?', [slug]);
  if (clash && clash.id !== id) { if (b.slug) f.slug = 'slug_taken'; else slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`; }
  out.slug = slug;
  if (Object.keys(f).length) invalid(f);
  return out;
}
const toDb = (a) => { const { gallery, hours, ...rest } = a; return { ...rest, gallery_json: JSON.stringify(gallery), hours_json: hours ? JSON.stringify(hours) : '' }; };
const gal = (row) => { try { const g = JSON.parse(row.gallery_json || '[]'); return Array.isArray(g) ? g.map((x) => (typeof x === 'string' ? { src: x, name: '', price: null } : { src: x.src, name: x.name || '', price: x.price ?? null, colors: Array.isArray(x.colors) ? x.colors : [], sizes: Array.isArray(x.sizes) ? x.sizes : [] })).filter((x) => x.src) : []; } catch { return []; } };
const bi = (row, f) => ({ ar: row[`${f}_ar`] || '', en: row[`${f}_en`] || row[`${f}_ar`] || '' });

export function publicAdvertiser(slug) {
  const r = q.get("SELECT * FROM featured_advertisers WHERE slug=? AND status='active' AND consent=1", [String(slug || '').slice(0, 60)]);
  if (!r) return null;
  const name = bi(r, 'name');
  return {
    slug: r.slug, name, tagline: bi(r, 'tagline'), about: bi(r, 'about'), logo: r.logo || null, cover: r.cover || null,
    gallery: (() => { const cart = cartInfoFor(r); return gal(r).map((it) => ({ ...it, cart: cart.get(it.src) || null })); })(),
    address: bi(r, 'address'), hours: bi(r, 'hours'), openNow: r.hours_json ? repeatMatches(parseRepeat(r.hours_json)) : null, whatsapp: r.whatsapp || null, phone: r.phone || null, mapsUrl: r.maps_url || (r.lat != null && r.lng != null ? `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}` : null), lat: r.lat ?? null, lng: r.lng ?? null,
    instagram: r.instagram || null, facebook: r.facebook || null, tiktok: r.tiktok || null,
    offer: r.offer_text_ar || r.offer_text_en || r.offer_code ? { text: bi(r, 'offer_text'), code: r.offer_code || null } : null,
    whatsappText: `السلام عليكم، شفت إعلان ${name.ar} على Twist${r.offer_code ? ` — كلمة السر: ${r.offer_code}` : ''}`,
  };
}

const visitorKey = (ip, ua) => crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 16);
export function recordAdvertiserEvent({ slug, event, ip = '', ua = '' }, now = Date.now()) {
  if (!EVENTS.includes(event)) return false;
  const r = q.get("SELECT id FROM featured_advertisers WHERE slug=? AND status='active' AND consent=1", [String(slug || '').slice(0, 60)]);
  if (!r) return false;
  const key = `${visitorKey(ip, ua)}|${r.id}|${event}`;
  const last = seen.get(key);
  if (last && now - last < WINDOW[event]) return false;
  if (seen.size > 50_000) { for (const [k, t] of seen) if (now - t > 30 * 60e3) seen.delete(k); if (seen.size > 50_000) seen.clear(); }
  seen.set(key, now);
  q.run('INSERT INTO featured_advertiser_stats (day, advertiser_id, event, n) VALUES (?,?,?,1) ON CONFLICT(day, advertiser_id, event) DO UPDATE SET n=n+1', [cairoStamp().date, r.id, event]);
  return true;
}

const shiftDay = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function statsFor(id, days) {
  const today = cairoStamp().date; const from = shiftDay(today, -(days - 1));
  const t = { view: 0, whatsapp: 0, call: 0, map: 0, offer: 0, social: 0, order: 0, cart: 0 };
  for (const r of q.all('SELECT event, SUM(n) AS n FROM featured_advertiser_stats WHERE advertiser_id=? AND day BETWEEN ? AND ? GROUP BY event', [id, from, today])) t[r.event] = r.n;
  const contacts = t.whatsapp + t.call + t.map + t.order;
  return { ...t, contacts, rate: t.view ? Math.round((contacts / t.view) * 1000) / 10 : null, from, to: today };
}
/** Adverts that point at this advertiser (so the ad's own views / clicks can be reported with the page's numbers). */
function campaignStats(id, days) {
  const today = cairoStamp().date; const from = shiftDay(today, -(days - 1));
  const ids = q.all('SELECT id FROM featured_campaigns WHERE advertiser_id=?', [id]).map((x) => x.id);
  if (!ids.length) return { campaigns: 0, adViews: 0, adClicks: 0 };
  const rows = q.all(`SELECT event, SUM(n) AS n FROM featured_stats WHERE day BETWEEN ? AND ? AND campaign_id IN (${ids.map(() => '?').join(',')}) GROUP BY event`, [from, today, ...ids]);
  const n = (e) => rows.find((r) => r.event === e)?.n || 0;
  return { campaigns: ids.length, adViews: n('impression'), adClicks: n('click') };
}

const adminShape = (r, days = 30) => ({
  id: r.id, slug: r.slug, name: bi(r, 'name'), nameAr: r.name_ar, nameEn: r.name_en, taglineAr: r.tagline_ar, taglineEn: r.tagline_en, aboutAr: r.about_ar, aboutEn: r.about_en,
  logo: r.logo, cover: r.cover, gallery: gal(r), addressAr: r.address_ar, addressEn: r.address_en, whatsapp: r.whatsapp, phone: r.phone, mapsUrl: r.maps_url, lat: r.lat ?? null, lng: r.lng ?? null,
  hoursAr: r.hours_ar, hoursEn: r.hours_en, openFrom: parseRepeat(r.hours_json)?.windows?.[0]?.from || '', openTo: parseRepeat(r.hours_json)?.windows?.[0]?.to || '', openDays: parseRepeat(r.hours_json)?.days || [], instagram: r.instagram, facebook: r.facebook, tiktok: r.tiktok || '', offerTextAr: r.offer_text_ar, offerTextEn: r.offer_text_en, offerCode: r.offer_code,
  consent: !!r.consent, twistOrders: !!r.twist_orders, shopSlug: r.store_id ? q.val('SELECT slug FROM stores WHERE id=?', [r.store_id]) : null, status: r.status, url: `/a/${r.slug}`, stats: statsFor(r.id, days), ads: campaignStats(r.id, days), createdAt: r.created_at,
});

export const listAdvertisers = ({ days = 30 } = {}) => ({ items: q.all('SELECT * FROM featured_advertisers ORDER BY id DESC').map((r) => adminShape(r, days)) });
export function getAdvertiser(id, days = 30) {
  const r = q.get('SELECT * FROM featured_advertisers WHERE id=?', [id]);
  if (!r) throw new AppError(404, 'not_found', 'Advertiser not found — المعلن غير موجود');
  return adminShape(r, days);
}
export async function createAdvertiser(body) {
  const a = normalizeAdvertiser(body);
  const id = insert('featured_advertisers', toDb(a));
  await syncAdvertiserShop(id);
  return getAdvertiser(id);
}
export async function updateAdvertiser(id, body) {
  getAdvertiser(id);
  const a = normalizeAdvertiser(body, { id });
  update('featured_advertisers', id, { ...toDb(a), updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
  await syncAdvertiserShop(id);
  return getAdvertiser(id);
}
export function deleteAdvertiser(id) {
  getAdvertiser(id);
  if (q.val('SELECT COUNT(*) FROM featured_campaigns WHERE advertiser_id=?', [id])) throw new AppError(409, 'in_use', 'This advertiser has campaigns — hide it instead — المعلن عليه إعلانات، خبّيه بدل ما تمسحه');
  const row = q.get('SELECT store_id FROM featured_advertisers WHERE id=?', [id]);
  if (row?.store_id && q.val('SELECT COUNT(*) FROM orders WHERE store_id=?', [row.store_id])) throw new AppError(409, 'has_orders', 'This advertiser has orders — hide it instead — عليه طلبات، خبّيه بدل ما تمسحه');
  if (row?.store_id) q.run('DELETE FROM stores WHERE id=?', [row.store_id]);
  q.run('DELETE FROM featured_advertiser_stats WHERE advertiser_id=?', [id]);
  q.run('DELETE FROM featured_advertisers WHERE id=?', [id]);
  return { ok: true };
}

/** A short Arabic text the admin can paste into WhatsApp to send the advertiser. Numbers only, nothing invented. */
export function advertiserReport(id, days = 7) {
  const a = getAdvertiser(id, days);
  const s = a.stats; const ad = a.ads;
  const lines = [
    `تقرير إعلان ${a.nameAr} على Twist — آخر ${days} أيام`,
    ad.campaigns ? `• ظهر إعلانك ${ad.adViews} مرة، وضغط عليه ${ad.adClicks} شخص` : null,
    `• زاروا صفحتك ${s.view} مرة`,
    `• ضغطوا واتساب ${s.whatsapp} مرة، واتصال ${s.call}، وخريطة ${s.map}`,
    s.order ? `• طلبوا قطع من عندك ${s.order} مرة` : null,
    s.cart ? `• ضافوا قطع من عندك لسلة Twist ${s.cart} مرة` : null,
    a.offerCode ? `• استخدموا عرضك (نسخ الكلمة "${a.offerCode}") ${s.offer} مرة` : null,
    s.view ? `• من كل 100 زيارة، ${Math.round((s.contacts / s.view) * 100)} تواصلوا معاك` : null,
  ].filter(Boolean);
  return { text: lines.join('\n'), stats: s, ads: ad };
}
