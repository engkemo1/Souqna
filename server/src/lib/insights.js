/**
 * Admin insights: courier cash accounts, late-order alerts, store health, market analytics, audit log, CSV export.
 * Everything here is additive — it reads existing tables and only writes to its own tables (created below).
 * Days are Cairo dates. Money is whole EGP like the rest of the app.
 */
import { q, db, tx } from '../db/index.js';
import { adminBuyersCsv } from './buyers.js';
import { cairoNow } from './sameDay.js';
import { shiftDay } from './traffic.js';
import { notifyStore } from './push.js';
import { notifyPlatformAlert } from './whatsapp.js';
import { startEngageJobs } from './engage.js';
import { startWatchdog } from './watchdog.js';

db.exec(`
CREATE TABLE IF NOT EXISTS courier_settlements (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL, day TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_courier_settlements_person ON courier_settlements(person_id);
CREATE TABLE IF NOT EXISTS order_alerts (order_id INTEGER NOT NULL, kind TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (order_id, kind));
CREATE TABLE IF NOT EXISTS search_terms (day TEXT NOT NULL, term TEXT NOT NULL, searches INTEGER NOT NULL DEFAULT 0, misses INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, term));
CREATE TABLE IF NOT EXISTS site_events (day TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event));
CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL, fields TEXT);
`);

const cairoDay = () => cairoNow().date;
const ts = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')) : NaN);
const dayOf = (s) => { const t = ts(s); return Number.isFinite(t) ? cairoNow(new Date(t)).date : null; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sum = (a, f) => a.reduce((x, y) => x + (f(y) || 0), 0);
const sqlTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

/* =========================================================== courier cash accounts */

/** One run = the orders a courier carries together (same route/basket). Money is attributed to the run's first order. */
function deliveredRuns() {
  const rows = q.all(`SELECT o.id, o.delivery_route_id, o.delivery_group, o.delivery_person_id, o.courier_cost, o.total, o.subtotal, o.discount, o.platform_discount,
      o.delivery_sponsor_share, o.delivery_sponsor_collected, o.updated_at,
      (SELECT MAX(e.created_at) FROM order_events e WHERE e.order_id=o.id AND e.status='delivered') AS delivered_at
    FROM orders o WHERE o.delivery_by='platform' AND o.status='delivered'`);
  const groups = new Map();
  for (const o of rows) {
    const key = o.delivery_route_id || o.delivery_group || `order:${o.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  return [...groups.entries()].map(([key, list]) => {
    list.sort((a, b) => a.id - b.id);
    const owner = list[0];
    const personId = list.find((o) => o.delivery_person_id)?.delivery_person_id ?? null;
    const when = list.map((o) => o.delivered_at || o.updated_at).filter(Boolean).sort().at(-1);
    const collected = sum(list, (o) => o.total);
    // What the store is paid for the goods: full price minus only the discount the STORE funded (platform coupons are Twist's cost).
    const storePay = sum(list, (o) => Math.max(0, o.subtotal - Math.max(0, (o.discount || 0) - Math.min(o.platform_discount || 0, o.discount || 0))));
    const sponsor = sum(list, (o) => (o.delivery_sponsor_collected ? o.delivery_sponsor_share : 0));
    const handover = collected + sponsor - storePay;
    const wage = owner.courier_cost == null ? null : Number(owner.courier_cost);
    return { key, personId, day: dayOf(when), orders: list.length, collected, storePay, sponsor, handover, wage, net: handover - (wage || 0) };
  });
}

export function couriersReport(days = 14) {
  const today = cairoDay();
  const from = shiftDay(today, -(days - 1));
  const runs = deliveredRuns();
  const people = q.all('SELECT id, name, phone, active FROM delivery_people ORDER BY active DESC, name');
  const settles = q.all('SELECT id, person_id, day, amount, note, created_at FROM courier_settlements ORDER BY id DESC');
  const out = people.map((p) => {
    const mine = runs.filter((r) => r.personId === p.id);
    const set = settles.filter((s) => s.person_id === p.id);
    const byDay = new Map();
    for (const r of mine) {
      if (!r.day || r.day < from) continue;
      const d = byDay.get(r.day) || { day: r.day, runs: 0, orders: 0, collected: 0, storePay: 0, sponsor: 0, handover: 0, wage: 0, net: 0, wageMissing: 0 };
      d.runs += 1; d.orders += r.orders; d.collected += r.collected; d.storePay += r.storePay; d.sponsor += r.sponsor; d.handover += r.handover; d.wage += r.wage || 0; d.net += r.net;
      if (r.wage == null) d.wageMissing += 1;
      byDay.set(r.day, d);
    }
    const earned = sum(mine, (r) => r.net), settled = sum(set, (s) => s.amount);
    return {
      id: p.id, name: p.name, phone: p.phone, active: !!p.active,
      earnedTotal: earned, settledTotal: settled, outstanding: earned - settled, runsTotal: mine.length,
      daily: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
      settlements: set.slice(0, 12),
    };
  });
  const un = runs.filter((r) => !r.personId);
  return { days, from, today, couriers: out, unassigned: { runs: un.length, handover: sum(un, (r) => r.handover) }, totalOutstanding: sum(out, (c) => c.outstanding) };
}

export function addSettlement(personId, amount, note, day) {
  if (!q.get('SELECT id FROM delivery_people WHERE id=?', [personId])) return null;
  const id = Number(q.run('INSERT INTO courier_settlements (person_id, day, amount, note) VALUES (?,?,?,?)', [personId, day || cairoDay(), Math.round(amount), note || null]).lastInsertRowid);
  return id;
}
export const deleteSettlement = (id) => q.run('DELETE FROM courier_settlements WHERE id=?', [id]).changes > 0;

/* =========================================================== alerts: late orders, stuck deliveries, store onboarding */

export const LATE_STORE_MIN = 20;   // push the store
export const LATE_ADMIN_MIN = 45;   // WhatsApp the platform admin

export function alertsReport(nowMs = Date.now(), { light = false } = {}) {
  const since = sqlTime(nowMs - 3 * 864e5);
  const pending = q.all(`SELECT o.id, o.number, o.total, o.created_at, o.delivery_by, s.id AS store_id, s.name_ar, s.slug,
      EXISTS(SELECT 1 FROM order_alerts a WHERE a.order_id=o.id AND a.kind='store') AS pushed
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.status='pending' AND o.created_at >= ? ORDER BY o.created_at`, [since]);
  const late = pending.map((o) => ({ ...o, minutes: Math.floor((nowMs - ts(o.created_at)) / 60000) }))
    .filter((o) => o.minutes >= LATE_STORE_MIN).sort((a, b) => b.minutes - a.minutes)
    .map((o) => ({ id: o.id, number: o.number, total: o.total, store: o.name_ar, slug: o.slug, minutes: o.minutes, level: o.minutes >= 60 ? 'urgent' : 'warn', pushed: !!o.pushed }));

  const ready = q.all(`SELECT o.id, o.number, o.status, o.updated_at, s.name_ar FROM orders o JOIN stores s ON s.id=o.store_id
    WHERE o.delivery_by='platform' AND o.status IN ('processing','shipped') AND o.updated_at >= ?`, [since]);
  const stuck = ready.map((o) => ({ id: o.id, number: o.number, store: o.name_ar, status: o.status, hours: Math.round(((nowMs - ts(o.updated_at)) / 3600e3) * 10) / 10 }))
    .filter((o) => (o.status === 'processing' && o.hours >= 2) || (o.status === 'shipped' && o.hours >= 6)).sort((a, b) => b.hours - a.hours);

  return { late, stuck, onboarding: light ? [] : storeOnboarding(), thresholds: { storeMin: LATE_STORE_MIN, adminMin: LATE_ADMIN_MIN } };
}

/** A store is "ready to sell" when it has products, photos, contact info and hours. */
export function storeOnboarding() {
  const stores = q.all("SELECT id, slug, name_ar, status, created_at, logo_media_id, cover_media_id, phone, whatsapp, address_ar, opens_at, hours_json, description_ar FROM stores WHERE status='active' AND hidden=0");
  const prod = new Map(q.all("SELECT store_id, COUNT(*) AS n FROM products WHERE status='active' GROUP BY store_id").map((r) => [r.store_id, r.n]));
  const withPhoto = new Map(q.all("SELECT p.store_id, COUNT(DISTINCT p.id) AS n FROM products p JOIN product_media pm ON pm.product_id=p.id WHERE p.status='active' GROUP BY p.store_id").map((r) => [r.store_id, r.n]));
  const orders = new Map(q.all("SELECT store_id, COUNT(*) AS n FROM orders WHERE status!='cancelled' GROUP BY store_id").map((r) => [r.store_id, r.n]));
  const now = Date.now();
  return stores.map((s) => {
    const n = prod.get(s.id) || 0, ph = withPhoto.get(s.id) || 0;
    const checks = [
      { key: 'logo', label: 'لوجو المحل', ok: !!s.logo_media_id },
      { key: 'cover', label: 'صورة غلاف', ok: !!s.cover_media_id },
      { key: 'contact', label: 'رقم واتساب أو تليفون', ok: !!(s.whatsapp || s.phone) },
      { key: 'address', label: 'عنوان المحل', ok: !!s.address_ar },
      { key: 'hours', label: 'مواعيد الشغل', ok: !!(s.opens_at || (s.hours_json && s.hours_json !== '{}' && s.hours_json !== 'null')) },
      { key: 'about', label: 'نبذة عن المحل', ok: !!s.description_ar },
      { key: 'products', label: '٥ منتجات على الأقل', ok: n >= 5, detail: `${n} منتج` },
      { key: 'photos', label: 'كل المنتجات ليها صور', ok: n > 0 && ph >= n, detail: `${ph} من ${n}` },
    ];
    const done = checks.filter((c) => c.ok).length;
    const ageDays = Math.floor((now - ts(s.created_at)) / 864e5);
    const firstOrder = (orders.get(s.id) || 0) > 0;
    return { id: s.id, slug: s.slug, name: s.name_ar, ageDays, products: n, hasOrder: firstOrder, score: Math.round((done / checks.length) * 100), missing: checks.filter((c) => !c.ok), stalled: !firstOrder && ageDays >= 3 && done < checks.length };
  }).filter((s) => s.score < 100).sort((a, b) => Number(b.stalled) - Number(a.stalled) || a.score - b.score);
}

/** Pushes the store after LATE_STORE_MIN of silence and WhatsApps the admin after LATE_ADMIN_MIN. Each order alerts once per kind. */
export function sweepLateOrders(nowMs = Date.now()) {
  const c = cairoNow(new Date(nowMs));
  const hour = Number(c.hm.slice(0, 2));
  if (hour < 9 || hour >= 23) return { skipped: 'night' };
  const rows = q.all(`SELECT o.id, o.number, o.total, o.created_at, s.id AS store_id, s.name_ar FROM orders o JOIN stores s ON s.id=o.store_id
    WHERE o.status='pending' AND o.created_at >= ?`, [sqlTime(nowMs - 24 * 3600e3)]);
  let pushed = 0; const toAdmin = [];
  const mark = (id, kind) => db.prepare('INSERT OR IGNORE INTO order_alerts (order_id, kind) VALUES (?, ?)').run(id, kind).changes > 0;
  for (const o of rows) {
    const min = (nowMs - ts(o.created_at)) / 60000;
    if (!Number.isFinite(min)) continue;
    if (min >= LATE_STORE_MIN && mark(o.id, 'store')) {
      notifyStore(o.store_id, { title: 'طلب مستني ردك ⏰', body: `الطلب ${o.number} بقاله ${Math.floor(min)} دقيقة. العميل مستني تأكيدك.`, url: `/dashboard/orders/${o.id}`, tag: `late-${o.id}` });
      pushed += 1;
    }
    if (min >= LATE_ADMIN_MIN && mark(o.id, 'admin')) toAdmin.push({ ...o, min: Math.floor(min) });
  }
  if (toAdmin.length) {
    const lines = toAdmin.slice(0, 6).map((o) => `• ${o.name_ar} — ${o.number} (${o.min} د)`).join('\n');
    notifyPlatformAlert(`⏰ ${toAdmin.length} طلب مستني رد المحل أكتر من ${LATE_ADMIN_MIN} دقيقة:\n${lines}${toAdmin.length > 6 ? `\nو${toAdmin.length - 6} كمان` : ''}`);
  }
  return { pushed, admin: toAdmin.length };
}

export function startLateOrderAlerts() {
  startWatchdog(); // backup/disk/memory self-check → WhatsApp (WATCHDOG=0 disables)
  startEngageJobs(); // stock + weekly pushes (own flag ENGAGE_JOBS=0)
  if (process.env.LATE_ALERTS === '0') return;
  const run = () => { try { sweepLateOrders(); } catch (e) { console.error(`[late-orders] ${e.message}`); } };
  setTimeout(run, 60e3).unref?.();
  setInterval(run, 5 * 60e3).unref?.();
}

/* =========================================================== search gaps + funnel events */

const normTerm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);

/** Called from the public search. found=false when a plain text search returned nothing. Never throws. */
export function logSearch(term, found) {
  try {
    const t = normTerm(term);
    if (t.length < 2) return;
    const day = cairoDay();
    const exists = q.get('SELECT 1 AS x FROM search_terms WHERE day=? AND term=?', [day, t]);
    if (!exists && q.val('SELECT COUNT(*) FROM search_terms WHERE day=?', [day]) >= 3000) return; // junk-flood guard
    db.prepare('INSERT INTO search_terms (day, term, searches, misses) VALUES (?, ?, 1, ?) ON CONFLICT(day, term) DO UPDATE SET searches=searches+1, misses=misses+?').run(day, t, found ? 0 : 1, found ? 0 : 1);
    if (Math.random() < 0.01) db.prepare('DELETE FROM search_terms WHERE day < ?').run(shiftDay(day, -120));
  } catch { /* logging must never break search */ }
}

export const EVENTS = ['checkout_start'];
export function trackEvent(name) {
  if (!EVENTS.includes(name)) return false;
  db.prepare('INSERT INTO site_events (day, event, n) VALUES (?, ?, 1) ON CONFLICT(day, event) DO UPDATE SET n=n+1').run(cairoDay(), name);
  return true;
}

/* =========================================================== market insights */

function scorecard(days) {
  const from = sqlTime(Date.now() - days * 864e5);
  const stores = q.all("SELECT id, slug, name_ar, rating, rating_count FROM stores WHERE status='active' AND hidden=0");
  const orders = q.all(`SELECT o.store_id, o.status, o.created_at,
      (SELECT MIN(e.created_at) FROM order_events e WHERE e.order_id=o.id AND e.status='confirmed') AS confirmed_at FROM orders o WHERE o.created_at >= ?`, [from]);
  const by = new Map(stores.map((s) => [s.id, []]));
  for (const o of orders) by.get(o.store_id)?.push(o);
  return stores.map((s) => {
    const os = by.get(s.id) || [];
    const cancelled = os.filter((o) => o.status === 'cancelled').length;
    const mins = avg(os.filter((o) => o.confirmed_at).map((o) => (ts(o.confirmed_at) - ts(o.created_at)) / 60000).filter((m) => m >= 0));
    const cancelRate = os.length ? Math.round((cancelled / os.length) * 100) : 0;
    const speed = mins == null ? 70 : mins <= 15 ? 100 : mins <= 30 ? 80 : mins <= 60 ? 50 : 20;
    const cancel = cancelRate <= 5 ? 100 : cancelRate <= 10 ? 70 : cancelRate <= 20 ? 40 : 10;
    const rate = s.rating_count >= 3 ? Math.round((s.rating / 5) * 100) : 70;
    const score = os.length === 0 ? null : Math.round(speed * 0.4 + cancel * 0.35 + rate * 0.25);
    const badges = [];
    if (mins != null && mins <= 15 && os.length >= 3) badges.push('fast');
    if (os.length >= 5 && cancelRate <= 5) badges.push('reliable');
    if (s.rating >= 4.5 && s.rating_count >= 5) badges.push('top_rated');
    return { id: s.id, slug: s.slug, name: s.name_ar, orders: os.length, confirmMinutes: mins == null ? null : Math.round(mins), cancelRate, rating: s.rating, ratingCount: s.rating_count, score, badges };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.orders - a.orders);
}

export function marketInsights(days = 30) {
  const today = cairoDay();
  const from = shiftDay(today, -(days - 1));
  const fromSql = `${from} 00:00:00`;
  const live = q.all("SELECT id, store_id, phone, city, governorate, total, shipping, platform_discount, delivery_by, delivery_group, status, created_at FROM orders WHERE created_at >= ? AND status!='cancelled'", [fromSql]);

  // ---- funnel (site-wide)
  const visits = q.val('SELECT COALESCE(SUM(visits),0) FROM site_visits WHERE day BETWEEN ? AND ?', [from, today]);
  const productViews = q.val("SELECT COALESCE(SUM(views),0) FROM store_page_views WHERE page_type='product' AND day BETWEEN ? AND ?", [from, today]);
  const checkouts = q.val("SELECT COALESCE(SUM(n),0) FROM site_events WHERE event='checkout_start' AND day BETWEEN ? AND ?", [from, today]);
  const steps = [
    { key: 'visits', label: 'دخلوا الموقع', n: visits },
    { key: 'views', label: 'شافوا منتج', n: productViews },
    { key: 'checkout', label: 'وصلوا لصفحة الشراء', n: checkouts },
    { key: 'orders', label: 'كملوا الطلب', n: live.length },
  ].map((s, i, a) => { const p = i && a[i - 1].n ? Math.round((s.n / a[i - 1].n) * 100) : null; return { ...s, ofPrev: p != null && p <= 100 ? p : null }; }); // >100% just means the earlier step was not tracked yet

  // ---- search
  const gaps = q.all('SELECT term, SUM(misses) AS misses, SUM(searches) AS searches FROM search_terms WHERE day BETWEEN ? AND ? GROUP BY term HAVING SUM(misses) > 0 ORDER BY misses DESC, searches DESC LIMIT 25', [from, today]);
  const top = q.all('SELECT term, SUM(searches) AS searches, SUM(misses) AS misses FROM search_terms WHERE day BETWEEN ? AND ? GROUP BY term ORDER BY searches DESC LIMIT 15', [from, today]);
  const searchTotals = q.get('SELECT COALESCE(SUM(searches),0) AS searches, COALESCE(SUM(misses),0) AS misses FROM search_terms WHERE day BETWEEN ? AND ?', [from, today]);

  // ---- customers (by phone)
  const firstSeen = new Map(q.all("SELECT phone, MIN(created_at) AS first FROM orders WHERE status!='cancelled' GROUP BY phone").map((r) => [r.phone, r.first]));
  const phones = new Set(live.map((o) => o.phone));
  let fresh = 0;
  for (const p of phones) if ((firstSeen.get(p) || '') >= fromSql) fresh += 1;
  // one basket split across several stores counts as ONE purchase, so a multi-store order is not mistaken for a repeat customer
  const perPhone = new Map();
  for (const o of live) { if (!perPhone.has(o.phone)) perPhone.set(o.phone, new Set()); perPhone.get(o.phone).add(o.delivery_group || `o${o.id}`); }
  const baskets = sum([...perPhone.values()], (set) => set.size);
  const repeaters = [...perPhone.values()].filter((set) => set.size >= 2).length;
  const cities = new Map();
  for (const o of live) { const k = o.city || o.governorate || 'غير محدد'; cities.set(k, (cities.get(k) || 0) + 1); }
  const gmv = sum(live, (o) => o.total);
  const customers = {
    total: phones.size, newCustomers: fresh, returning: phones.size - fresh, repeatRate: phones.size ? Math.round((repeaters / phones.size) * 100) : 0,
    avgOrder: live.length ? Math.round(gmv / live.length) : 0, ordersPerCustomer: phones.size ? Math.round((baskets / phones.size) * 10) / 10 : 0,
    cities: [...cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([city, n]) => ({ city, orders: n })),
  };

  // ---- platform revenue (estimates from recorded figures)
  const runs = deliveredRuns().filter((r) => r.day && r.day >= from);
  const deliveryFees = q.val("SELECT COALESCE(SUM(shipping),0) FROM orders WHERE delivery_by='platform' AND status='delivered' AND created_at >= ?", [fromSql]);
  const courierCosts = sum(runs, (r) => r.wage);
  const sponsors = sum(runs, (r) => r.sponsor);
  const subs = q.val("SELECT COALESCE(SUM(amount),0) FROM subscription_periods WHERE kind='paid' AND created_at >= ?", [fromSql]);
  const discounts = sum(live, (o) => o.platform_discount);
  const revenue = {
    gmv, orders: live.length, deliveryFees, sponsors, courierCosts, deliveryProfit: deliveryFees + sponsors - courierCosts,
    subscriptions: subs, platformDiscounts: discounts, net: deliveryFees + sponsors - courierCosts + subs - discounts,
    wageMissingRuns: runs.filter((r) => r.wage == null).length,
  };

  return { days, from, to: today, funnel: steps, search: { totals: searchTotals, gaps, top }, customers, revenue, scorecard: scorecard(days) };
}

/* =========================================================== audit log */

const SKIP_AUDIT = /^\/(login)(\/|$)/;
/** Express middleware: records every authenticated write (method, path, status, the NAMES of the fields sent — never their values). */
export function auditMiddleware(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    try {
      if (SKIP_AUDIT.test(req.path)) return;
      const body = req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 12).join(',') : '';
      db.prepare('INSERT INTO admin_audit (method, path, status, fields) VALUES (?, ?, ?, ?)').run(req.method, String(req.originalUrl || req.path).replace(/^\/api\/admin/, '').split('?')[0].slice(0, 200), res.statusCode, body || null);
      if (Math.random() < 0.01) db.prepare("DELETE FROM admin_audit WHERE at < datetime('now','-120 days')").run();
    } catch { /* never break a request over logging */ }
  });
  next();
}
export const auditList = (limit = 300) => q.all('SELECT id, at, method, path, status, fields FROM admin_audit ORDER BY id DESC LIMIT ?', [Math.min(1000, Math.max(1, limit))]);

/* =========================================================== CSV export */

const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (head, rows) => `﻿${[head.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')}\r\n`;

export function exportCsv(kind, days = 30) {
  const d = days;
  if (kind === 'orders') {
    const rows = q.all(`SELECT o.number, s.name_ar AS store, o.status, o.city, o.governorate, o.subtotal, o.discount, o.platform_discount, o.shipping, o.total, o.delivery_by, o.payment_method, o.created_at
      FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.created_at >= ? ORDER BY o.id DESC`, [sqlTime(Date.now() - d * 864e5)]);
    return { name: 'orders', csv: toCsv(['رقم الطلب', 'المحل', 'الحالة', 'المدينة', 'المحافظة', 'المنتجات', 'خصم', 'خصم المنصة', 'الشحن', 'الإجمالي', 'التوصيل', 'الدفع', 'التاريخ'], rows.map((r) => [r.number, r.store, r.status, r.city, r.governorate, r.subtotal, r.discount, r.platform_discount, r.shipping, r.total, r.delivery_by, r.payment_method, r.created_at])) };
  }
  if (kind === 'stores') {
    const rows = scorecard(d);
    return { name: 'stores', csv: toCsv(['المحل', 'الطلبات', 'متوسط التأكيد (دقيقة)', 'نسبة الإلغاء %', 'التقييم', 'عدد التقييمات', 'الدرجة'], rows.map((r) => [r.name, r.orders, r.confirmMinutes, r.cancelRate, r.rating, r.ratingCount, r.score])) };
  }
  if (kind === 'search-gaps') {
    const m = marketInsights(d).search.gaps;
    return { name: 'search-gaps', csv: toCsv(['كلمة البحث', 'مرات بدون نتيجة', 'إجمالي مرات البحث'], m.map((r) => [r.term, r.misses, r.searches])) };
  }
  if (kind === 'segment-repeat' || kind === 'segment-lapsed') {
    const seg = segments()[kind === 'segment-repeat' ? 'repeat' : 'lapsed'].sort((a, b) => b.spent - a.spent);
    return { name: kind, csv: toCsv(['الاسم', 'الموبايل', 'عدد الطلبات', 'إجمالي المشتريات', 'آخر طلب'], seg.map((c) => [c.name, c.phone, c.orders, c.spent, c.last])) };
  }
  if (kind === 'buyers') { const b = adminBuyersCsv(); return { name: 'buyers', csv: toCsv(b.header, b.rows) }; }
  if (kind === 'couriers') {
    const rep = couriersReport(Math.max(d, 7));
    const rows = rep.couriers.flatMap((c) => c.daily.map((x) => [c.name, x.day, x.runs, x.orders, x.collected, x.storePay, x.sponsor, x.handover, x.wage, x.net]));
    return { name: 'couriers', csv: toCsv(['المندوب', 'اليوم', 'الرحلات', 'الطلبات', 'اتحصّل من العملاء', 'اندفع للمحلات', 'حصة المحلات في التوصيل', 'مطلوب تسليمه', 'أجره', 'الصافي'], rows) };
  }
  return null;
}

/** Customer segments by phone (all time, cancelled orders ignored). A multi-store basket counts as one purchase. */
export function segments() {
  const rows = q.all("SELECT phone, customer_name, delivery_group, id, total, created_at FROM orders WHERE status!='cancelled' ORDER BY id");
  const by = new Map();
  for (const o of rows) {
    if (!o.phone) continue;
    const c = by.get(o.phone) || { phone: o.phone, name: o.customer_name, baskets: new Set(), spent: 0, last: '' };
    c.baskets.add(o.delivery_group || `o${o.id}`); c.spent += o.total || 0; c.name = o.customer_name || c.name;
    if (o.created_at > c.last) c.last = o.created_at;
    by.set(o.phone, c);
  }
  const cutoff = sqlTime(Date.now() - 30 * 864e5);
  const list = [...by.values()].map((c) => ({ phone: c.phone, name: c.name, orders: c.baskets.size, spent: c.spent, last: c.last }));
  return { all: list, repeat: list.filter((c) => c.orders >= 2), lapsed: list.filter((c) => c.last < cutoff) };
}

/** Small summary for the top of the admin home page. */
export function todayGlance() {
  const now = cairoNow();
  const today = now.date, yesterday = shiftDay(today, -1), hourNow = Number(now.hm.slice(0, 2)) || 0;
  const v = q.get('SELECT visits, uniques FROM site_visits WHERE day=?', [today]) || { visits: 0, uniques: 0 };
  const ySoFar = q.val('SELECT COALESCE(SUM(visits),0) FROM site_hours WHERE day=? AND hour<=?', [yesterday, hourNow]);
  const recent = q.all("SELECT total, created_at FROM orders WHERE created_at >= ? AND status!='cancelled'", [`${shiftDay(today, -1)} 00:00:00`]).filter((o) => dayOf(o.created_at) === today);
  const al = alertsReport(Date.now(), { light: true });
  const cr = couriersReport(7);
  return {
    visits: { today: v.visits, uniques: v.uniques, delta: pct(v.visits, ySoFar) },
    orders: { count: recent.length, gmv: sum(recent, (o) => o.total) },
    late: al.late.length, stuck: al.stuck.length,
    couriersOwed: sum(cr.couriers, (c) => Math.max(0, c.outstanding)), couriersDue: sum(cr.couriers, (c) => Math.max(0, -c.outstanding)),
  };
}
