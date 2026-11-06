/**
 * Featured Ads & Offers — platform-admin controlled sponsored campaigns.
 *
 * Two campaign types:
 *   custom — a hand-made ad (copy, images, colours, destination)
 *   offer  — a store offer from the promotion engine, promoted with optional custom copy.
 *            It stays linked to promotions.id and only DISPLAYS the offer: pricing/eligibility remain the engine's job, and an offer the
 *            engine no longer considers live disappears from the public API by itself.
 *
 * Stored status: draft | active | paused | archived. Derived state adds scheduled / expired from the Cairo wall-clock window
 * (same 'YYYY-MM-DDTHH:MM' convention as promotions). Analytics are daily aggregates only — no visitor identifiers are kept.
 */
import crypto from 'node:crypto';
import { q, db, insert, update, json, tx } from '../db/index.js';
import { AppError } from './errors.js';
import { cairoStamp, promoState } from './promotions/store.js';
import { storeOffers } from './promotions/public.js';
import { mediaMap } from './media.js';

db.exec(`
CREATE TABLE IF NOT EXISTS featured_campaigns (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('custom','offer')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  subtitle_ar TEXT NOT NULL DEFAULT '', subtitle_en TEXT NOT NULL DEFAULT '',
  cta_ar TEXT NOT NULL DEFAULT '', cta_en TEXT NOT NULL DEFAULT '',
  badge_ar TEXT NOT NULL DEFAULT '', badge_en TEXT NOT NULL DEFAULT '',
  destination_url TEXT NOT NULL DEFAULT '',
  store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  promotion_id INTEGER REFERENCES promotions(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  desktop_image TEXT NOT NULL DEFAULT '', mobile_image TEXT NOT NULL DEFAULT '',
  background_color TEXT NOT NULL DEFAULT '#0f172a', text_color TEXT NOT NULL DEFAULT '#ffffff', cta_style TEXT NOT NULL DEFAULT 'solid',
  placements_json TEXT NOT NULL DEFAULT '[]',
  targeting_json TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 50,
  starts_at TEXT, ends_at TEXT,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_featured_status ON featured_campaigns(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_featured_store ON featured_campaigns(store_id);
CREATE TABLE IF NOT EXISTS featured_stats (
  day TEXT NOT NULL, campaign_id INTEGER NOT NULL REFERENCES featured_campaigns(id) ON DELETE CASCADE,
  placement TEXT NOT NULL, event TEXT NOT NULL CHECK (event IN ('impression','click')), n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, campaign_id, placement, event)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS featured_hourly (
  day TEXT NOT NULL, hour INTEGER NOT NULL, campaign_id INTEGER NOT NULL REFERENCES featured_campaigns(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('impression','click')), n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, campaign_id, event)
) WITHOUT ROWID;
`);
for (const [col, ddl] of [['text_align', "TEXT NOT NULL DEFAULT 'start'"], ['overlay', 'INTEGER NOT NULL DEFAULT 65'], ['image_zoom', 'INTEGER NOT NULL DEFAULT 100'], ['image_x', 'INTEGER NOT NULL DEFAULT 50'], ['image_y', 'INTEGER NOT NULL DEFAULT 50'], ['fg_image', "TEXT NOT NULL DEFAULT ''"], ['fg_size', 'INTEGER NOT NULL DEFAULT 40'], ['fg_pos', "TEXT NOT NULL DEFAULT 'end'"], ['layout_width', "TEXT NOT NULL DEFAULT 'wide'"], ['layout_height', "TEXT NOT NULL DEFAULT 'm'"], ['layout_align', "TEXT NOT NULL DEFAULT 'center'"], ['repeat_json', "TEXT NOT NULL DEFAULT ''"], ['advertiser_id', 'INTEGER']]) {
  if (!q.all('PRAGMA table_info(featured_campaigns)').some((c) => c.name === col)) db.exec(`ALTER TABLE featured_campaigns ADD COLUMN ${col} ${ddl}`);
}

/* ------------------------------------------------------------------ catalogue of slots */
/** limit = how many campaigns may be active (or scheduled in the same window) in a slot, so the layout never overflows. */
export const PLACEMENTS = {
  market_top:   { scope: 'market', limit: 2, ar: 'الصفحة الرئيسية للسوق — أعلى الصفحة (تحت الهيدر)', en: 'Marketplace homepage — top of page' },
  market_hero:  { scope: 'market', limit: 3, ar: 'الصفحة الرئيسية للسوق — الواجهة الرئيسية', en: 'Marketplace homepage — hero' },
  market_strip: { scope: 'market', limit: 6, ar: 'الصفحة الرئيسية للسوق — شريط المميز', en: 'Marketplace homepage — featured strip' },
  market_grid:  { scope: 'market', limit: 4, ar: 'الصفحة الرئيسية للسوق — شبكة العروض', en: 'Marketplace homepage — promo grid' },
  store_hero:   { scope: 'store',  limit: 2, ar: 'صفحة المحل — الواجهة الرئيسية', en: 'Storefront — hero' },
  store_offers: { scope: 'store',  limit: 4, ar: 'صفحة المحل — العروض المميزة', en: 'Storefront — featured offers' },
  store_ticker: { scope: 'store',  limit: 5, ar: 'صفحة المحل — الشريط المتحرك', en: 'Storefront — announcement ticker' },
  market_bottom: { scope: 'market', limit: 3, ar: 'الصفحة الرئيسية للسوق — أسفل الصفحة', en: 'Marketplace homepage — bottom of page' },
  search_slot:  { scope: 'market', limit: 2, ar: 'نتائج البحث والأقسام — خانة مميزة', en: 'Search / category results — featured slot' },
};
export const PLACEMENT_KEYS = Object.keys(PLACEMENTS);
const CTA_STYLES = ['solid', 'outline', 'light'];
const ALIGNS = ['start', 'center', 'end'];
const WIDTHS = ['full', 'wide', 'narrow'];
const HEIGHTS = ['s', 'm', 'l'];
const AUDIENCES = ['all', 'marketplace', 'store'];
const DEVICES = ['desktop', 'mobile'];

/* ------------------------------------------------------------------ validation (bilingual) */
const MSG = {
  required: ['هذا الحقل مطلوب', 'This field is required'],
  too_long: ['النص أطول من المسموح', 'Text is too long'],
  bad_url: ['الرابط غير آمن أو غير صحيح', 'The link is invalid or unsafe'],
  bad_color: ['اللون غير صحيح', 'Invalid colour'],
  bad_date: ['التاريخ غير صحيح', 'Invalid date'],
  end_before_start: ['تاريخ النهاية لازم يكون بعد البداية', 'End must be after start'],
  bad_value: ['قيمة غير مسموحة', 'Value not allowed'],
  no_placement: ['اختر مكان ظهور واحد على الأقل', 'Choose at least one placement'],
  store_required: ['اختر المحل', 'Select a store'],
  offer_required: ['اختر العرض', 'Select an offer'],
  store_missing: ['المحل غير موجود أو غير نشط', 'Store not found or inactive'],
  offer_unavailable: ['العرض غير متاح أو لا يخص هذا المحل', 'The offer is unavailable or does not belong to this store'],
  destination_missing: ['حدّد وجهة الإعلان (رابط أو محل أو منتج)', 'Set a destination (link, store or product)'],
  image_required: ['ارفع صورة للإعلان', 'Upload an image'],
  target_invalid: ['الاستهداف يشير لعنصر غير موجود', 'Targeting points to something that does not exist'],
};
export const fieldMsg = (code) => { const m = MSG[code] || MSG.bad_value; return { ar: m[0], en: m[1] }; };
function invalid(fields) {
  const first = Object.values(fields)[0];
  const m = fieldMsg(first);
  throw new AppError(422, 'validation_failed', `${m.en} — ${m.ar}`, fields);
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max + 1);
const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
const GRAD = /^linear-gradient\(\s*\d{1,3}deg\s*,\s*#[0-9a-fA-F]{3,6}\s*,\s*#[0-9a-fA-F]{3,6}\s*\)$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const validDate = (s) => DATE.test(s) && Number.isFinite(Date.parse(`${s}:00Z`)) && new Date(`${s}:00Z`).toISOString().slice(0, 16) === s;

/** Internal path ("/s/shop/p/x") or https URL. Never javascript:, data:, protocol-relative or backslash tricks. */
export function safeUrl(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.length > 500 || /[\s\u0000-\u001f\u007f"'<>\\`]/.test(s)) return null;
  if (s.startsWith('/')) return s.startsWith('//') ? null : s;
  try { const u = new URL(s); return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null; } catch { return null; }
}
const safeImage = (v) => { const s = String(v ?? '').trim(); if (!s) return ''; return safeUrl(s); };

/** Normalise + validate a campaign body. Returns the DB-shaped object, or throws a bilingual 422. */
/* ------------------------------------------------------------------ recurring schedule
 * repeat = { days: [0..6] (0 = Sunday; empty = every day), windows: [{ from:'HH:MM', to:'HH:MM' }] (empty = all day) }.
 * It narrows the starts_at..ends_at range: the ad shows only on those days / inside those windows (Cairo wall-clock).
 * A window whose `to` is earlier than `from` runs past midnight into the next day. */
const WEEK = 7 * 1440;
const hmToMin = (v) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export function parseRepeat(raw) {
  if (!raw) return null;
  const r = typeof raw === 'string' ? json(raw, null) : raw;
  return r && typeof r === 'object' ? r : null;
}
/** Week intervals [start,end) in minutes since Sunday 00:00. */
function repeatIntervals(rep) {
  if (!rep) return [[0, WEEK]];
  const days = rep.days?.length ? rep.days : [0, 1, 2, 3, 4, 5, 6];
  const wins = rep.windows?.length ? rep.windows : [{ from: '00:00', to: '24:00' }];
  const out = [];
  for (const d of days) for (const w of wins) {
    const a = w.from === '24:00' ? 1440 : hmToMin(w.from); const bRaw = w.to === '24:00' ? 1440 : hmToMin(w.to);
    const len = bRaw > a ? bRaw - a : bRaw + 1440 - a;
    const start = d * 1440 + a; const end = start + len;
    if (end > WEEK) { out.push([start, WEEK], [0, end - WEEK]); } else out.push([start, end]);
  }
  return out;
}
export function repeatMatches(rep, now = cairoStamp()) {
  if (!rep) return true;
  const t = now.dow * 1440 + hmToMin(now.hm);
  return repeatIntervals(rep).some(([a, b]) => t >= a && t < b);
}
const repeatsIntersect = (ra, rb) => {
  if (!ra || !rb) return true;
  const A = repeatIntervals(ra); const B = repeatIntervals(rb);
  return A.some(([a1, a2]) => B.some(([b1, b2]) => a1 < b2 && b1 < a2));
};
/** Minutes from `fromStamp` (Cairo wall-clock) until the schedule next opens; null if never (within a week). */
export function repeatNextOpen(rep, fromStamp) {
  if (!rep) return 0;
  const base = Date.parse(`${fromStamp}:00Z`);
  const iv = repeatIntervals(rep);
  const at = (m) => { const d = new Date(base + m * 60000); return d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const open = (t) => iv.some(([a, b]) => t >= a && t < b);
  if (open(at(0))) return 0;
  for (let m = 1; m <= WEEK; m++) if (open(at(m))) return m;
  return null;
}
function normalizeRepeat(raw, f) {
  if (raw == null || raw === '' || raw === false) return null;
  if (typeof raw !== 'object') { f.repeat = 'bad_value'; return null; }
  const days = [...new Set((Array.isArray(raw.days) ? raw.days : []).map(Number))];
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) { f.repeat = 'bad_days'; return null; }
  const wins = Array.isArray(raw.windows) ? raw.windows : [];
  if (wins.length > 4) { f.repeat = 'too_many_windows'; return null; }
  const windows = [];
  for (const w of wins) {
    const from = hmToMin(w?.from); const to = w?.to === '24:00' ? 1440 : hmToMin(w?.to);
    if (from == null || to == null || from === to) { f.repeat = 'bad_window'; return null; }
    windows.push({ from: w.from, to: w.to });
  }
  days.sort((a, b) => a - b);
  const allDays = days.length === 0 || days.length === 7;
  if (allDays && !windows.length) return null; // no restriction
  return { days: allDays ? [] : days, windows };
}

export function normalizeCampaign(body, { partial = false } = {}) {
  const f = {};
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  const type = b.type;
  if (!['custom', 'offer'].includes(type)) f.type = 'bad_value';
  out.type = type;

  const text = (key, max, req = false) => {
    const v = clean(b[key], max);
    if (v.length > max) f[key] = 'too_long';
    else if (req && !v) f[key] = 'required';
    return v.slice(0, max);
  };
  const offer = type === 'offer';
  out.title_ar = text('title_ar', 80, !offer); out.title_en = text('title_en', 80, !offer);
  out.subtitle_ar = text('subtitle_ar', 180); out.subtitle_en = text('subtitle_en', 180);
  out.cta_ar = text('cta_ar', 30); out.cta_en = text('cta_en', 30);
  out.badge_ar = text('badge_ar', 24); out.badge_en = text('badge_en', 24);

  const dest = safeUrl(b.destination_url);
  if (dest === null) f.destination_url = 'bad_url'; else out.destination_url = dest;
  for (const k of ['desktop_image', 'mobile_image']) { const u = safeImage(b[k]); if (u === null) f[k] = 'bad_url'; else out[k] = u; }

  const colour = (k, def, allowGrad) => {
    const v = String(b[k] || def).trim(); // empty = the default colour
    if (HEX.test(v) || (allowGrad && GRAD.test(v))) out[k] = v; else f[k] = 'bad_color';
  };
  colour('background_color', '#0f172a', true); colour('text_color', '#ffffff', false);
  out.text_align = ALIGNS.includes(b.text_align) ? b.text_align : (b.text_align == null || b.text_align === '' ? 'start' : (f.text_align = 'bad_value'));
  const ov = b.overlay == null || b.overlay === '' ? 65 : Number(b.overlay);
  if (Number.isInteger(ov) && ov >= 0 && ov <= 80) out.overlay = ov; else f.overlay = 'bad_value';
  const num = (k, def, lo, hi) => { const v = b[k] == null || b[k] === '' ? def : Number(b[k]); if (Number.isInteger(v) && v >= lo && v <= hi) out[k] = v; else f[k] = 'bad_value'; };
  num('image_zoom', 100, 100, 300); num('image_x', 50, 0, 100); num('image_y', 50, 0, 100); num('fg_size', 40, 10, 90);
  out.fg_pos = ALIGNS.includes(b.fg_pos) ? b.fg_pos : (b.fg_pos == null || b.fg_pos === '' ? 'end' : (f.fg_pos = 'bad_value'));
  { const u = safeImage(b.fg_image); if (u === null) f.fg_image = 'bad_url'; else out.fg_image = u; }
  const pick = (k, list, def) => { if (list.includes(b[k])) out[k] = b[k]; else if (b[k] == null || b[k] === '') out[k] = def; else f[k] = 'bad_value'; };
  pick('layout_width', WIDTHS, 'wide'); pick('layout_height', HEIGHTS, 'm'); pick('layout_align', ALIGNS, 'center');
  out.cta_style = CTA_STYLES.includes(b.cta_style) ? b.cta_style : (b.cta_style == null ? 'solid' : (f.cta_style = 'bad_value'));

  const id = (k) => { if (b[k] == null || b[k] === '') return null; const n = Number(b[k]); if (!Number.isInteger(n) || n <= 0) { f[k] = 'bad_value'; return null; } return n; };
  out.advertiser_id = type === 'custom' ? id('advertiser_id') : null; out.store_id = id('store_id'); out.promotion_id = id('promotion_id'); out.product_id = id('product_id'); out.category_id = id('category_id');

  const pr = b.priority == null ? 50 : Number(b.priority);
  if (!Number.isInteger(pr) || pr < 0 || pr > 100) f.priority = 'bad_value'; else out.priority = pr;

  // placements
  const placements = [];
  const seen = new Set();
  for (const p of Array.isArray(b.placements) ? b.placements : []) {
    if (!p || !PLACEMENT_KEYS.includes(p.key) || seen.has(p.key)) { f.placements = 'bad_value'; continue; }
    seen.add(p.key);
    const order = p.order == null ? 0 : Number(p.order);
    const prio = p.priority == null ? out.priority ?? 50 : Number(p.priority);
    const devices = Array.isArray(p.devices) ? [...new Set(p.devices)].filter((d) => DEVICES.includes(d)) : DEVICES;
    if (!Number.isInteger(order) || order < 0 || order > 99 || !Number.isInteger(prio) || prio < 0 || prio > 100 || !devices.length) { f.placements = 'bad_value'; continue; }
    placements.push({ key: p.key, enabled: p.enabled !== false, order, priority: prio, devices });
  }
  if (!f.placements && !placements.some((p) => p.enabled)) f.placements = 'no_placement';
  out.placements = placements;

  // targeting
  const t = b.targeting && typeof b.targeting === 'object' ? b.targeting : {};
  const ids = (a) => [...new Set((Array.isArray(a) ? a : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  const audience = t.audience == null ? 'all' : t.audience;
  if (!AUDIENCES.includes(audience)) f['targeting.audience'] = 'bad_value';
  out.targeting = { stores: ids(t.stores), categories: ids(t.categories), audience };

  // schedule
  const sched = (k) => { const v = b[k]; if (v == null || v === '') return null; if (!validDate(String(v))) { f[k] = 'bad_date'; return null; } return String(v); };
  out.starts_at = sched('starts_at'); out.ends_at = sched('ends_at');
  if (out.starts_at && out.ends_at && out.ends_at <= out.starts_at) f.ends_at = 'end_before_start';
  out.repeat = normalizeRepeat(b.repeat, f);

  if (Object.keys(f).length) invalid(f);
  return out;
}

/** Cross-reference checks that need the database: store/offer/product/category/targets exist, link is consistent, content is complete. */
export function verifyReferences(c, { publishing }) {
  const f = {};
  const activeStore = (id) => q.get("SELECT id, slug FROM stores WHERE id=? AND status='active'", [id]);
  let store = null;
  if (c.type === 'offer') {
    if (!c.store_id) f.store_id = 'store_required';
    else if (!(store = activeStore(c.store_id))) f.store_id = 'store_missing';
    if (!c.promotion_id) f.promotion_id = 'offer_required';
    else if (!f.store_id) {
      const p = q.get('SELECT * FROM promotions WHERE id=? AND store_id=?', [c.promotion_id, c.store_id]);
      if (!p || p.status !== 'active' || !['active', 'scheduled'].includes(promoState(p))) f.promotion_id = 'offer_unavailable';
    }
  } else {
    c.promotion_id = null;
    if (c.store_id && !(store = activeStore(c.store_id))) f.store_id = 'store_missing';
    if (c.advertiser_id && !q.get('SELECT 1 AS x FROM featured_advertisers WHERE id=?', [c.advertiser_id])) f.advertiser_id = 'target_invalid';
    if (c.advertiser_id && c.store_id) f.advertiser_id = 'bad_value'; // either a platform shop or an outside advertiser, not both
  }
  if (!f.store_id && c.store_id) {
    if (c.product_id && !q.get('SELECT 1 AS x FROM products WHERE id=? AND store_id=?', [c.product_id, c.store_id])) f.product_id = 'target_invalid';
    if (c.category_id && !q.get('SELECT 1 AS x FROM categories WHERE id=? AND store_id=?', [c.category_id, c.store_id])) f.category_id = 'target_invalid';
  } else if (!c.store_id) { c.product_id = null; c.category_id = null; }
  for (const sid of c.targeting.stores) if (!q.get("SELECT 1 AS x FROM stores WHERE id=? AND status<>'deleted'", [sid])) { f['targeting.stores'] = 'target_invalid'; break; }
  for (const cid of c.targeting.categories) if (!q.get('SELECT 1 AS x FROM categories WHERE id=?', [cid])) { f['targeting.categories'] = 'target_invalid'; break; }
  if (publishing) {
    if (c.type === 'custom') {
      if (!c.title_ar || !c.title_en) f[!c.title_ar ? 'title_ar' : 'title_en'] = 'required';
      if (!c.desktop_image && !c.mobile_image && !c.fg_image && !f.desktop_image) f.desktop_image = 'image_required';
      if (!c.destination_url && !c.store_id && !c.advertiser_id) f.destination_url = 'destination_missing';
    }
  }
  if (Object.keys(f).length) invalid(f);
  return store;
}

/* ------------------------------------------------------------------ state, serialisation */
export function campaignState(row, now = cairoStamp()) {
  if (row.status === 'archived') return 'archived';
  if (row.status === 'draft') return 'draft';
  if (row.status === 'paused') return 'paused';
  if (row.starts_at && row.starts_at > now.stamp) return 'scheduled';
  if (row.ends_at && row.ends_at < now.stamp) return 'expired';
  if (!repeatMatches(parseRepeat(row.repeat_json ?? row.repeat), now)) return 'resting';
  return 'active';
}

const parse = (row) => ({ ...row, placements: json(row.placements_json, []), targeting: { stores: [], categories: [], audience: 'all', ...json(row.targeting_json, {}) } });
const toDb = (c) => ({
  type: c.type, title_ar: c.title_ar, title_en: c.title_en, subtitle_ar: c.subtitle_ar, subtitle_en: c.subtitle_en, cta_ar: c.cta_ar, cta_en: c.cta_en,
  badge_ar: c.badge_ar, badge_en: c.badge_en, destination_url: c.destination_url, store_id: c.store_id, promotion_id: c.promotion_id, product_id: c.product_id, category_id: c.category_id,
  desktop_image: c.desktop_image, mobile_image: c.mobile_image, background_color: c.background_color, text_color: c.text_color, cta_style: c.cta_style, text_align: c.text_align, overlay: c.overlay,
  image_zoom: c.image_zoom, image_x: c.image_x, image_y: c.image_y, fg_image: c.fg_image, fg_size: c.fg_size, fg_pos: c.fg_pos, layout_width: c.layout_width, layout_height: c.layout_height, layout_align: c.layout_align,
  placements_json: JSON.stringify(c.placements), targeting_json: JSON.stringify(c.targeting), priority: c.priority, starts_at: c.starts_at, ends_at: c.ends_at, repeat_json: c.repeat ? JSON.stringify(c.repeat) : '', advertiser_id: c.advertiser_id || null,
});

/** Where the campaign sends the visitor. An explicit destination wins; otherwise it is built from store / product / category. */
export function destinationOf(c) {
  if (c.destination_url) return c.destination_url;
  if (c.advertiser_id) { const a = q.get("SELECT slug FROM featured_advertisers WHERE id=? AND status='active' AND consent=1", [c.advertiser_id]); return a ? `/a/${a.slug}` : '/'; }
  if (!c.store_id) return '/';
  const s = q.get('SELECT slug FROM stores WHERE id=?', [c.store_id]);
  if (!s) return '/';
  if (c.product_id) { const p = q.get('SELECT slug FROM products WHERE id=?', [c.product_id]); if (p) return `/s/${s.slug}/p/${p.slug}`; }
  if (c.category_id) { const k = q.get('SELECT slug FROM categories WHERE id=?', [c.category_id]); if (k) return `/s/${s.slug}/shop?category=${encodeURIComponent(k.slug)}`; }
  return `/s/${s.slug}`;
}

const biOf = (row, f) => ({ ar: row[`${f}_ar`] || '', en: row[`${f}_en`] || '' });

/** Customer-facing shape. `live` offers (from the promotion engine) are passed in so a list renders with one engine call per store. */
function publicShape(row, placement, liveByStore, mediaCache) {
  let offer = null; let store = null;
  if (row.advertiser_id && !q.get("SELECT 1 AS x FROM featured_advertisers WHERE id=? AND status='active' AND consent=1", [row.advertiser_id])) return null; // advertiser hidden / withdrawn consent
  if (row.store_id) {
    const s = q.get("SELECT id, slug, name_ar, name_en, logo_media_id, logo_initials, logo_color FROM stores WHERE id=? AND status='active'", [row.store_id]);
    if (!s) return null; // targeting an inactive / deleted store
    store = { slug: s.slug, name: biOf(s, 'name'), logoInitials: s.logo_initials || '', logoColor: s.logo_color || '#1B1B1B', logo: mediaCache.get(s.logo_media_id) || null };
  }
  if (row.type === 'offer') {
    const live = liveByStore.get(row.store_id)?.find((o) => o.id === row.promotion_id);
    if (!live) return null; // offer no longer live in the engine (expired, paused, deleted, usage limit reached…)
    offer = { id: live.id, name: live.name, headline: live.text?.headline || null, image: live.imageMediaId ? mediaCache.get(live.imageMediaId) || null : null };
  }
  const ti = biOf(row, 'title'); const su = biOf(row, 'subtitle');
  const title = { ar: ti.ar || offer?.name?.ar || '', en: ti.en || offer?.name?.en || offer?.name?.ar || '' };
  if (!title.ar && !title.en) return null;
  const subtitle = { ar: su.ar || offer?.headline?.ar || '', en: su.en || offer?.headline?.en || offer?.headline?.ar || '' };
  const href = destinationOf(row);
  return {
    id: row.id, type: row.type, placement, title, subtitle, cta: biOf(row, 'cta'), badge: biOf(row, 'badge'),
    href, external: /^https?:/i.test(href),
    image: { desktop: row.desktop_image || null, mobile: row.mobile_image || null, offer: offer?.image || null },
    bg: row.background_color, color: row.text_color, ctaStyle: row.cta_style, align: row.text_align || 'start', overlay: row.overlay ?? 65,
    layout: { width: row.layout_width || 'wide', height: row.layout_height || 'm', align: row.layout_align || 'center' },
    fit: { zoom: row.image_zoom ?? 100, x: row.image_x ?? 50, y: row.image_y ?? 50 }, fg: row.fg_image ? { src: row.fg_image, size: row.fg_size ?? 40, pos: row.fg_pos || 'end' } : null, store, offer: offer ? { id: offer.id, headline: offer.headline } : null,
  };
}

/* ------------------------------------------------------------------ public listing */
function overlaps(a, b) {
  const rep = (x) => (x.repeat !== undefined ? x.repeat : parseRepeat(x.repeat_json));
  return (!a.ends_at || !b.starts_at || a.ends_at >= b.starts_at) && (!b.ends_at || !a.starts_at || b.ends_at >= a.starts_at) && repeatsIntersect(rep(a), rep(b));
}

/**
 * Campaigns visible right now in one slot. Filters: live window, slot enabled, device, audience scope, store/category targeting,
 * store still active, offer still live. Never returns the same campaign — or the same offer — twice, and never more than the slot's limit.
 */
export function publicCampaigns({ placement, store = null, category = null, device = null, now = cairoStamp() }) {
  const spec = PLACEMENTS[placement];
  if (!spec) throw new AppError(422, 'validation_failed', 'Unknown placement — مكان غير معروف', { placement: 'bad_value' });
  const storeRow = store ? q.get("SELECT id FROM stores WHERE slug=? AND status='active'", [store]) : null;
  if (spec.scope === 'store' && !storeRow) return [];
  const catRow = category && storeRow ? q.get('SELECT id FROM categories WHERE store_id=? AND slug=?', [storeRow.id, category]) : null;

  const rows = q.all("SELECT * FROM featured_campaigns WHERE status='active' ORDER BY id").map(parse).filter((c) => campaignState(c, now) === 'active');
  const liveByStore = new Map(); const mediaIds = [];
  const picked = [];
  for (const c of rows) {
    const pl = c.placements.find((p) => p.key === placement && p.enabled !== false);
    if (!pl) continue;
    if (device && !pl.devices.includes(device)) continue;
    const aud = c.targeting.audience;
    if ((aud === 'marketplace' && spec.scope !== 'market') || (aud === 'store' && spec.scope !== 'store')) continue;
    if (spec.scope === 'store' && c.targeting.stores.length && !c.targeting.stores.includes(storeRow.id)) continue;
    if (c.targeting.categories.length && placement === 'search_slot' && !(catRow && c.targeting.categories.includes(catRow.id))) continue;
    if (c.type === 'offer' && !liveByStore.has(c.store_id)) liveByStore.set(c.store_id, c.store_id ? storeOffers(c.store_id) : []);
    picked.push({ c, pl });
  }
  for (const { c } of picked) { if (c.type === 'offer') for (const o of liveByStore.get(c.store_id) || []) if (o.imageMediaId) mediaIds.push(o.imageMediaId); }
  const stores = q.all('SELECT logo_media_id FROM stores WHERE logo_media_id IS NOT NULL');
  const mediaCache = mediaMap([...mediaIds, ...stores.map((s) => s.logo_media_id)]);
  picked.sort((a, b) => a.pl.order - b.pl.order || b.pl.priority - a.pl.priority || b.c.id - a.c.id);
  const out = []; const offers = new Set();
  for (const { c } of picked) {
    if (out.length >= spec.limit) break;
    if (c.type === 'offer') { const k = `${c.store_id}:${c.promotion_id}`; if (offers.has(k)) continue; offers.add(k); }
    const shaped = publicShape(c, placement, liveByStore, mediaCache);
    if (shaped) out.push(shaped);
  }
  return out;
}

/* ------------------------------------------------------------------ admin CRUD */
function usedBy(row) { return json(row.placements_json, []).filter((p) => p.enabled !== false).map((p) => p.key); }

/** A slot may hold only `limit` campaigns that are (or will be) active in overlapping windows. */
export function assertSlotCapacity(candidate, excludeId = null) {
  const now = cairoStamp();
  const others = q.all("SELECT * FROM featured_campaigns WHERE status='active'").filter((r) => r.id !== excludeId && !['expired'].includes(campaignState(r, now)));
  for (const key of candidate.placements.filter((p) => p.enabled !== false).map((p) => p.key)) {
    const clash = others.filter((r) => usedBy(r).includes(key) && overlaps(r, candidate));
    if (clash.length >= PLACEMENTS[key].limit) {
      const m = PLACEMENTS[key];
      throw new AppError(409, 'placement_full', `"${m.en}" already has ${m.limit} campaigns in this period — pause one or change the dates. / مكان "${m.ar}" وصل للحد الأقصى (${m.limit}) في هذه الفترة، أوقف حملة أو غيّر التواريخ.`, { placements: 'placement_full', placement: key, limit: m.limit, campaigns: clash.map((r) => ({ id: r.id, title: r.title_ar || r.title_en })) });
    }
  }
}

function adminShape(row, stats = {}, now = cairoStamp()) {
  const c = parse(row);
  const state = campaignState(c, now);
  const store = c.store_id ? q.get('SELECT id, slug, name_ar, name_en FROM stores WHERE id=?', [c.store_id]) : null;
  let health = null;
  if (c.type === 'offer' && !['draft', 'archived'].includes(state)) {
    const p = q.get('SELECT * FROM promotions WHERE id=?', [c.promotion_id]);
    if (!p || p.status !== 'active' || !['active', 'scheduled'].includes(promoState(p))) health = 'offer_unavailable';
  }
  if (store && !q.get("SELECT 1 AS x FROM stores WHERE id=? AND status='active'", [store.id])) health = 'store_inactive';
  if (c.advertiser_id && !['draft', 'archived'].includes(state) && !q.get("SELECT 1 AS x FROM featured_advertisers WHERE id=? AND status='active' AND consent=1", [c.advertiser_id])) health = 'advertiser_hidden';
  const views = stats.impression || 0; const clicks = stats.click || 0;
  return {
    id: c.id, type: c.type, status: c.status, state, health,
    title: biOf(c, 'title'), subtitle: biOf(c, 'subtitle'), cta: biOf(c, 'cta'), badge: biOf(c, 'badge'),
    destinationUrl: c.destination_url, href: destinationOf(c), storeId: c.store_id, promotionId: c.promotion_id, productId: c.product_id, categoryId: c.category_id,
    store: store ? { id: store.id, slug: store.slug, name: biOf(store, 'name') } : null,
    desktopImage: c.desktop_image, mobileImage: c.mobile_image, backgroundColor: c.background_color, textColor: c.text_color, ctaStyle: c.cta_style, textAlign: c.text_align || 'start', overlay: c.overlay ?? 65,
    imageZoom: c.image_zoom ?? 100, imageX: c.image_x ?? 50, imageY: c.image_y ?? 50, fgImage: c.fg_image || '', fgSize: c.fg_size ?? 40, fgPos: c.fg_pos || 'end', layoutWidth: c.layout_width || 'wide', layoutHeight: c.layout_height || 'm', layoutAlign: c.layout_align || 'center',
    placements: c.placements, targeting: c.targeting, priority: c.priority, startsAt: c.starts_at, endsAt: c.ends_at, advertiserId: c.advertiser_id || null, advertiser: c.advertiser_id ? q.get('SELECT id, slug, name_ar FROM featured_advertisers WHERE id=?', [c.advertiser_id]) || null : null, repeat: parseRepeat(c.repeat_json), repeatNextInMin: state === 'resting' ? repeatNextOpen(parseRepeat(c.repeat_json), (c.starts_at && c.starts_at > now.stamp ? c.starts_at : now.stamp)) : null,
    createdBy: c.created_by, createdAt: c.created_at, updatedAt: c.updated_at, archivedAt: c.archived_at,
    stats: { views, clicks, ctr: views ? Math.round((clicks / views) * 1000) / 10 : null },
  };
}
const statsFor = (ids) => {
  const map = new Map();
  if (!ids.length) return map;
  for (const r of q.all(`SELECT campaign_id, event, SUM(n) AS n FROM featured_stats WHERE campaign_id IN (${ids.map(() => '?').join(',')}) GROUP BY campaign_id, event`, ids)) {
    map.set(r.campaign_id, { ...(map.get(r.campaign_id) || {}), [r.event]: r.n });
  }
  return map;
};

export function listCampaigns({ state, type, store, placement, search, sort = 'newest' } = {}) {
  const now = cairoStamp();
  const rows = q.all('SELECT * FROM featured_campaigns ORDER BY id DESC');
  const stats = statsFor(rows.map((r) => r.id));
  let items = rows.map((r) => adminShape(r, stats.get(r.id), now));
  if (state) items = items.filter((c) => c.state === state);
  if (type) items = items.filter((c) => c.type === type);
  if (store) items = items.filter((c) => String(c.storeId) === String(store));
  if (placement) items = items.filter((c) => c.placements.some((p) => p.key === placement && p.enabled !== false));
  if (search) { const s = String(search).toLowerCase(); items = items.filter((c) => [c.title.ar, c.title.en, c.store?.name.ar, c.store?.name.en].some((x) => String(x || '').toLowerCase().includes(s))); }
  const by = { newest: (a, b) => b.id - a.id, priority: (a, b) => b.priority - a.priority || b.id - a.id, views: (a, b) => b.stats.views - a.stats.views, ctr: (a, b) => (b.stats.ctr ?? -1) - (a.stats.ctr ?? -1) };
  items.sort(by[sort] || by.newest);
  const counts = {}; for (const c of rows.map((r) => campaignState(r, now))) counts[c] = (counts[c] || 0) + 1;
  return { items, counts, placements: PLACEMENT_KEYS.map((k) => ({ key: k, ...PLACEMENTS[k] })) };
}

export function getCampaign(id) {
  const row = q.get('SELECT * FROM featured_campaigns WHERE id=?', [id]);
  if (!row) throw new AppError(404, 'not_found', 'Campaign not found — الحملة غير موجودة');
  return adminShape(row, statsFor([id]).get(id));
}

export function createCampaign(body, { publish = false, by = 'admin' } = {}) {
  const c = normalizeCampaign(body);
  const wantsLive = publish || body?.status === 'active';
  verifyReferences(c, { publishing: wantsLive });
  const status = wantsLive ? 'active' : 'draft';
  if (status === 'active') assertSlotCapacity(c);
  const id = insert('featured_campaigns', { ...toDb(c), status, created_by: String(by).slice(0, 60) });
  return getCampaign(id);
}

export function updateCampaign(id, body) {
  const row = q.get('SELECT * FROM featured_campaigns WHERE id=?', [id]);
  if (!row) throw new AppError(404, 'not_found', 'Campaign not found — الحملة غير موجودة');
  if (row.status === 'archived') throw new AppError(409, 'archived', 'Restore the campaign before editing — استرجع الحملة قبل التعديل');
  const c = normalizeCampaign({ ...body, type: row.type }); // the type of an existing campaign never changes
  const live = row.status === 'active';
  verifyReferences(c, { publishing: live || body?.status === 'active' });
  let status = row.status;
  if (body?.status === 'active' && row.status === 'draft') status = 'active';
  if (body?.status === 'draft' && row.status !== 'archived') status = 'draft';
  if (status === 'active') assertSlotCapacity(c, id);
  update('featured_campaigns', id, { ...toDb(c), status, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
  return getCampaign(id);
}

export function setPaused(id, paused) {
  const row = q.get('SELECT * FROM featured_campaigns WHERE id=?', [id]);
  if (!row) throw new AppError(404, 'not_found', 'Campaign not found — الحملة غير موجودة');
  if (paused) {
    if (row.status !== 'active') throw new AppError(409, 'bad_state', 'Only an active campaign can be paused — الحملة لازم تكون نشطة');
    update('featured_campaigns', id, { status: 'paused' });
  } else {
    if (row.status !== 'paused') throw new AppError(409, 'bad_state', 'Only a paused campaign can be resumed — الحملة لازم تكون موقوفة');
    const c = parse(row); verifyReferences(c, { publishing: true }); assertSlotCapacity(c, id);
    update('featured_campaigns', id, { status: 'active' });
  }
  return getCampaign(id);
}

export function archiveCampaign(id) {
  const row = q.get('SELECT * FROM featured_campaigns WHERE id=?', [id]);
  if (!row) throw new AppError(404, 'not_found', 'Campaign not found — الحملة غير موجودة');
  update('featured_campaigns', id, { status: 'archived', archived_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
  return getCampaign(id);
}
export function restoreCampaign(id) {
  const row = q.get('SELECT * FROM featured_campaigns WHERE id=?', [id]);
  if (!row) throw new AppError(404, 'not_found', 'Campaign not found — الحملة غير موجودة');
  if (row.status !== 'archived') throw new AppError(409, 'bad_state', 'Campaign is not archived — الحملة غير مؤرشفة');
  q.run("UPDATE featured_campaigns SET status='draft', archived_at=NULL WHERE id=?", [id]);
  return getCampaign(id);
}
export function deleteCampaign(id) {
  const row = q.get('SELECT id FROM featured_campaigns WHERE id=?', [id]);
  if (!row) throw new AppError(404, 'not_found', 'Campaign not found — الحملة غير موجودة');
  tx(() => { q.run('DELETE FROM featured_stats WHERE campaign_id=?', [id]); q.run('DELETE FROM featured_hourly WHERE campaign_id=?', [id]); q.run('DELETE FROM featured_campaigns WHERE id=?', [id]); });
  return { deleted: true };
}
export function duplicateCampaign(id, by = 'admin') {
  const row = q.get('SELECT * FROM featured_campaigns WHERE id=?', [id]);
  if (!row) throw new AppError(404, 'not_found', 'Campaign not found — الحملة غير موجودة');
  const { id: _i, created_at, updated_at, archived_at, ...rest } = row;
  const newId = insert('featured_campaigns', { ...rest, status: 'draft', title_ar: rest.title_ar ? `${rest.title_ar} (نسخة)`.slice(0, 80) : '', title_en: rest.title_en ? `${rest.title_en} (copy)`.slice(0, 80) : '', created_by: String(by).slice(0, 60) });
  return getCampaign(newId);
}

/** Preview of an unsaved campaign in the exact public shape (never persisted). Offer campaigns use the live engine data. */
export function previewCampaign(body) {
  const c = normalizeCampaign(body);
  verifyReferences(c, { publishing: false });
  const row = { id: 0, ...toDb(c), status: 'active' };
  const liveByStore = new Map();
  const warnings = [];
  if (c.type === 'offer') liveByStore.set(c.store_id, storeOffers(c.store_id));
  const media = mediaMap([...[...liveByStore.values()].flat().map((o) => o.imageMediaId).filter(Boolean), ...(c.store_id ? [q.val('SELECT logo_media_id FROM stores WHERE id=?', [c.store_id])].filter(Boolean) : [])]);
  const placement = c.placements.find((p) => p.enabled !== false)?.key || 'market_hero';
  const shaped = publicShape(row, placement, liveByStore, media);
  if (!shaped) warnings.push(c.type === 'offer' ? 'offer_unavailable' : 'incomplete');
  if (c.type === 'custom' && !c.desktop_image && !c.mobile_image) warnings.push('no_image');
  return { campaign: shaped, warnings };
}

/** Live offers a store can promote (straight from the promotion engine's read model). */
export function eligibleOffers(storeId) {
  const store = q.get("SELECT id, slug, name_ar, name_en FROM stores WHERE id=? AND status='active'", [storeId]);
  if (!store) throw new AppError(404, 'not_found', 'Store not found or inactive — المحل غير موجود أو غير نشط');
  const offers = storeOffers(storeId);
  const media = mediaMap(offers.map((o) => o.imageMediaId));
  return {
    store: { id: store.id, slug: store.slug, name: biOf(store, 'name') },
    items: offers.map((o) => {
      const r = q.get('SELECT starts_at, ends_at, status FROM promotions WHERE id=?', [o.id]);
      return { id: o.id, name: o.name, headline: o.text?.headline || null, type: o.type, productCount: o.productCount, startsAt: r?.starts_at || null, endsAt: r?.ends_at || null, status: r?.status || 'active', image: o.imageMediaId ? media.get(o.imageMediaId) || null : null };
    }),
  };
}

export function adminStores() {
  const rows = q.all("SELECT id, slug, name_ar, name_en, logo_media_id FROM stores WHERE status='active' ORDER BY name_ar");
  const media = mediaMap(rows.map((r) => r.logo_media_id));
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: biOf(r, 'name'), logo: media.get(r.logo_media_id) || null }));
}
export function storeTargets(storeId) {
  if (!q.get("SELECT 1 AS x FROM stores WHERE id=? AND status='active'", [storeId])) throw new AppError(404, 'not_found', 'Store not found or inactive — المحل غير موجود أو غير نشط');
  return {
    categories: q.all('SELECT id, slug, name_ar, name_en FROM categories WHERE store_id=? ORDER BY sort, id', [storeId]).map((c) => ({ id: c.id, slug: c.slug, name: biOf(c, 'name') })),
    products: q.all("SELECT id, slug, name_ar, name_en FROM products WHERE store_id=? AND status='active' ORDER BY id DESC LIMIT 200", [storeId]).map((p) => ({ id: p.id, slug: p.slug, name: biOf(p, 'name') })),
  };
}
export function allCategories() {
  return q.all('SELECT c.id, c.slug, c.name_ar, c.name_en, c.store_id FROM categories c JOIN stores s ON s.id=c.store_id WHERE s.status=\'active\' ORDER BY c.name_ar LIMIT 500').map((c) => ({ id: c.id, storeId: c.store_id, name: biOf(c, 'name') }));
}

/* ------------------------------------------------------------------ analytics */
const seen = new Map(); // visitor|campaign|placement|event -> ms. One impression per visitor per slot per 30 min; clicks throttled to 1 / 3 s.
const WINDOW = { impression: 30 * 60e3, click: 3e3 };
const visitorKey = (ip, ua) => crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 16);

/** Count one event. Only a currently-live campaign in a slot it is actually enabled for can count. Returns true when counted. */
export function recordEvent({ id, placement, event, ip = '', ua = '' }, now = Date.now()) {
  if (!['impression', 'click'].includes(event) || !PLACEMENTS[placement]) return false;
  const row = q.get("SELECT * FROM featured_campaigns WHERE id=? AND status='active'", [id]);
  if (!row) return false;
  const c = parse(row);
  if (campaignState(c) !== 'active' || !c.placements.some((p) => p.key === placement && p.enabled !== false)) return false;
  const key = `${visitorKey(ip, ua)}|${id}|${placement}|${event}`;
  const last = seen.get(key);
  if (last && now - last < WINDOW[event]) return false;
  if (seen.size > 50_000) { for (const [k, t] of seen) if (now - t > 30 * 60e3) seen.delete(k); if (seen.size > 50_000) seen.clear(); }
  seen.set(key, now);
  const stamp = cairoStamp();
  q.run('INSERT INTO featured_stats (day, campaign_id, placement, event, n) VALUES (?,?,?,?,1) ON CONFLICT(day, campaign_id, placement, event) DO UPDATE SET n=n+1', [stamp.date, id, placement, event]);
  q.run('INSERT INTO featured_hourly (day, hour, campaign_id, event, n) VALUES (?,?,?,?,1) ON CONFLICT(day, hour, campaign_id, event) DO UPDATE SET n=n+1', [stamp.date, Number(stamp.stamp.slice(11, 13)), id, event]);
  return true;
}
export const _resetSeen = () => seen.clear();

const shiftDay = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Views / clicks / CTR for each hour of the Cairo day, so the best time to run a campaign is visible. */
function hourly(from, to, id) {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0, clicks: 0, ctr: null }));
  for (const r of q.all(`SELECT hour, event, SUM(n) AS n FROM featured_hourly WHERE day BETWEEN ? AND ? ${id ? 'AND campaign_id=?' : ''} GROUP BY hour, event`, [from, to, ...(id ? [id] : [])])) {
    out[r.hour][r.event === 'impression' ? 'views' : 'clicks'] += r.n;
  }
  for (const h of out) h.ctr = h.views ? Math.round((h.clicks / h.views) * 1000) / 10 : null;
  return out;
}
export function analytics({ days = 30, id = null } = {}) {
  const today = cairoStamp().date; const from = shiftDay(today, -(days - 1));
  const where = id ? 'AND s.campaign_id=?' : '';
  const base = [from, today, ...(id ? [id] : [])];
  const rate = (v, c) => (v ? Math.round((c / v) * 1000) / 10 : null);
  const fold = (rows, keyOf) => {
    const m = new Map();
    for (const r of rows) { const k = keyOf(r); const o = m.get(k) || { views: 0, clicks: 0 }; if (r.event === 'impression') o.views += r.n; else o.clicks += r.n; m.set(k, o); }
    return m;
  };
  const rows = q.all(`SELECT s.day, s.campaign_id, s.placement, s.event, s.n, c.store_id, c.title_ar, c.title_en FROM featured_stats s JOIN featured_campaigns c ON c.id=s.campaign_id WHERE s.day BETWEEN ? AND ? ${where}`, base);
  const withCtr = (m, extra = () => ({})) => [...m.entries()].map(([k, v]) => ({ key: k, ...v, ctr: rate(v.views, v.clicks), ...extra(k) }));
  const totalsMap = fold(rows, () => 'all'); const t = totalsMap.get('all') || { views: 0, clicks: 0 };
  const dailyMap = fold(rows, (r) => r.day);
  const daily = Array.from({ length: days }, (_, i) => { const d = shiftDay(from, i); const v = dailyMap.get(d) || { views: 0, clicks: 0 }; return { day: d, ...v, ctr: rate(v.views, v.clicks) }; });
  const storeNames = new Map(q.all('SELECT id, name_ar, name_en FROM stores').map((s) => [s.id, biOf(s, 'name')]));
  const campTitles = new Map(rows.map((r) => [r.campaign_id, { ar: r.title_ar, en: r.title_en }]));
  return {
    hours: hourly(from, today, id),
    days, from, to: today, totals: { ...t, ctr: rate(t.views, t.clicks) }, daily,
    placements: withCtr(fold(rows, (r) => r.placement), (k) => ({ label: { ar: PLACEMENTS[k]?.ar, en: PLACEMENTS[k]?.en } })).sort((a, b) => b.views - a.views),
    stores: withCtr(fold(rows.filter((r) => r.store_id), (r) => r.store_id), (k) => ({ name: storeNames.get(k) || null })).sort((a, b) => b.views - a.views),
    campaigns: withCtr(fold(rows, (r) => r.campaign_id), (k) => ({ title: campTitles.get(k) || null })).sort((a, b) => b.views - a.views).slice(0, 50),
  };
}
