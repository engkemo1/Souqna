/**
 * Site-wide traffic (platform admin → الزيارات).
 *
 * Privacy: no IP and no raw visitor id is stored. The browser keeps a random id; here it is hashed with a server secret and only
 * the hash + the Cairo day are kept, which is enough to count unique visitors per day. Everything else is a daily aggregate.
 * All days are Cairo dates so "today" flips at Cairo midnight, not at UTC midnight.
 */
import crypto from 'node:crypto';
import { q, db, tx } from '../db/index.js';
import { config } from '../config.js';
import { cairoNow } from './sameDay.js';

db.exec(`
CREATE TABLE IF NOT EXISTS site_visits (day TEXT PRIMARY KEY, visits INTEGER NOT NULL DEFAULT 0, uniques INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS site_visitors (day TEXT NOT NULL, vid TEXT NOT NULL, PRIMARY KEY (day, vid)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS site_sources (day TEXT NOT NULL, source TEXT NOT NULL, visits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, source));
CREATE TABLE IF NOT EXISTS site_campaigns (day TEXT NOT NULL, camp TEXT NOT NULL, source TEXT NOT NULL, visits INTEGER NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, camp, source));
CREATE TABLE IF NOT EXISTS site_hours (day TEXT NOT NULL, hour INTEGER NOT NULL, visits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, hour));
`);

export const SOURCES = ['whatsapp', 'instagram', 'facebook', 'tiktok', 'youtube', 'google', 'direct', 'other'];
const CAMP_RE = /^[a-z0-9_-]{1,40}$/;
export const cairoDay = () => cairoNow().date;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp\/|telegram|python|curl|wget/i;

/** Add n days to a YYYY-MM-DD string (calendar arithmetic, no timezone involved). */
export function shiftDay(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function recordSiteVisit({ vid, src, camp, ua }) {
  if (!/^[A-Za-z0-9_-]{12,40}$/.test(String(vid || ''))) return false;
  if (BOT.test(String(ua || ''))) return false;
  const source = SOURCES.includes(src) ? src : 'other';
  const hash = crypto.createHash('sha256').update(`${vid}|${config.jwtSecret}`).digest('hex').slice(0, 20);
  const now = cairoNow();
  const day = now.date;
  const hour = Number(now.hm.slice(0, 2)) || 0;
  tx(() => {
    const isNew = db.prepare('INSERT OR IGNORE INTO site_visitors (day, vid) VALUES (?, ?)').run(day, hash).changes > 0;
    db.prepare('INSERT INTO site_visits (day, visits, uniques) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET visits=visits+1, uniques=uniques+?').run(day, isNew ? 1 : 0, isNew ? 1 : 0);
    db.prepare('INSERT INTO site_sources (day, source, visits) VALUES (?, ?, 1) ON CONFLICT(day, source) DO UPDATE SET visits=visits+1').run(day, source);
    db.prepare('INSERT INTO site_hours (day, hour, visits) VALUES (?, ?, 1) ON CONFLICT(day, hour) DO UPDATE SET visits=visits+1').run(day, hour);
    if (CAMP_RE.test(String(camp || ''))) db.prepare('INSERT INTO site_campaigns (day, camp, source, visits) VALUES (?, ?, ?, 1) ON CONFLICT(day, camp, source) DO UPDATE SET visits=visits+1').run(day, camp, source);
  });
  if (Math.random() < 0.002) db.prepare('DELETE FROM site_visitors WHERE day < ?').run(shiftDay(day, -400)); // housekeeping
  return true;
}

const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);

export function trafficStats() {
  const now = cairoNow();
  const today = now.date;
  const hourNow = Number(now.hm.slice(0, 2)) || 0;
  const d = (n) => shiftDay(today, n);
  const yesterday = d(-1);
  const wkFrom = d(-6);        // last 7 days including today
  const prevWkFrom = d(-13);   // the 7 days before that
  const prevWkTo = d(-7);

  const siteRow = (day) => q.get('SELECT visits, uniques FROM site_visits WHERE day=?', [day]) || { visits: 0, uniques: 0 };
  const range = (from, to) => q.get('SELECT COALESCE(SUM(visits),0) AS visits FROM site_visits WHERE day BETWEEN ? AND ?', [from, to]).visits;
  const uniq = (from, to) => q.get('SELECT COUNT(DISTINCT vid) AS n FROM site_visitors WHERE day BETWEEN ? AND ?', [from, to]).n;

  const tdy = siteRow(today), yst = siteRow(yesterday);
  // fair "today vs yesterday": yesterday only up to the same hour of the day
  const ystSoFar = q.get('SELECT COALESCE(SUM(visits),0) AS v FROM site_hours WHERE day=? AND hour<=?', [yesterday, hourNow]).v;
  const wk = range(wkFrom, today), prevWk = range(prevWkFrom, prevWkTo);
  const all = q.get('SELECT COALESCE(SUM(visits),0) AS visits, MIN(day) AS since FROM site_visits');
  const allUniq = q.get('SELECT COUNT(DISTINCT vid) AS n FROM site_visitors').n;

  const dailyRows = q.all('SELECT day, visits, uniques FROM site_visits WHERE day BETWEEN ? AND ?', [d(-13), today]);
  const dm = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = Array.from({ length: 14 }, (_, i) => { const day = d(i - 13); const r = dm.get(day); return { day, visits: r?.visits || 0, uniques: r?.uniques || 0 }; });

  const sources = q.all('SELECT source, SUM(visits) AS visits FROM site_sources WHERE day BETWEEN ? AND ? GROUP BY source ORDER BY visits DESC', [wkFrom, today]);
  const hoursRaw = q.all('SELECT hour, SUM(visits) AS visits FROM site_hours WHERE day BETWEEN ? AND ? GROUP BY hour', [wkFrom, today]);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, visits: hoursRaw.find((r) => r.hour === h)?.visits || 0 }));

  // ---- per store ----
  const sinceOrders = `${wkFrom} 00:00:00`;
  const stores = q.all("SELECT id, slug, name_ar, status FROM stores WHERE status!='deleted' ORDER BY name_ar");
  const sv = q.all('SELECT store_id, day, visits FROM store_visits WHERE day >= ?', [prevWkFrom]);
  const totals = new Map(q.all('SELECT store_id, SUM(visits) AS v, MIN(day) AS since FROM store_visits GROUP BY store_id').map((r) => [r.store_id, r]));
  const prodViews = new Map(q.all("SELECT store_id, SUM(views) AS v FROM store_page_views WHERE day BETWEEN ? AND ? AND page_type='product' GROUP BY store_id", [wkFrom, today]).map((r) => [r.store_id, r.v]));
  const ordersWk = new Map(q.all("SELECT store_id, COUNT(*) AS n FROM orders WHERE created_at >= ? AND status!='cancelled' GROUP BY store_id", [sinceOrders]).map((r) => [r.store_id, r.n]));
  const bySt = new Map();
  for (const r of sv) { if (!bySt.has(r.store_id)) bySt.set(r.store_id, new Map()); bySt.get(r.store_id).set(r.day, r.visits); }
  const days7 = Array.from({ length: 7 }, (_, i) => d(i - 6));
  const rows = stores.map((s) => {
    const m = bySt.get(s.id) || new Map();
    const at = (day) => m.get(day) || 0;
    const week = days7.reduce((a, day) => a + at(day), 0);
    const prev = Array.from({ length: 7 }, (_, i) => at(d(i - 13))).reduce((a, b) => a + b, 0);
    const orders = ordersWk.get(s.id) || 0;
    return {
      id: s.id, slug: s.slug, name: s.name_ar, status: s.status,
      today: at(today), yesterday: at(yesterday), week, prevWeek: prev, total: totals.get(s.id)?.v || 0,
      spark: days7.map(at), productViews: prodViews.get(s.id) || 0, orders, conversion: week > 0 ? Math.round((orders / week) * 1000) / 10 : null,
      change: pct(week, prev),
    };
  }).sort((a, b) => b.week - a.week || b.total - a.total);

  const quiet = rows.filter((s) => s.status === 'active' && (s.week === 0 || (s.prevWeek >= 10 && s.week <= s.prevWeek * 0.5)))
    .map((s) => ({ id: s.id, slug: s.slug, name: s.name, week: s.week, prevWeek: s.prevWeek, reason: s.week === 0 ? 'none' : 'drop' }));

  return {
    asOf: now, since: all.since || null,
    cards: {
      today: { visits: tdy.visits, uniques: tdy.uniques, delta: pct(tdy.visits, ystSoFar), vsYesterdaySoFar: ystSoFar },
      yesterday: { visits: yst.visits, uniques: yst.uniques },
      week: { visits: wk, uniques: uniq(wkFrom, today), delta: pct(wk, prevWk) },
      total: { visits: all.visits, uniques: allUniq },
    },
    daily, sources, hours, stores: rows, quiet,
    storeTotals: { today: sum(rows, 'today'), yesterday: sum(rows, 'yesterday'), week: sum(rows, 'week'), total: sum(rows, 'total') },
  };
}

/** A session ended in an order. camp may be empty (organic) — we still count it per source so the admin sees orders by source. */
export function recordConversion({ src, camp, ua }) {
  if (BOT.test(String(ua || ''))) return false;
  const source = SOURCES.includes(src) ? src : 'other';
  const c = CAMP_RE.test(String(camp || '')) ? camp : '';
  db.prepare('INSERT INTO site_campaigns (day, camp, source, orders) VALUES (?, ?, ?, 1) ON CONFLICT(day, camp, source) DO UPDATE SET orders=orders+1').run(cairoDay(), c, source);
  return true;
}

export function campaignStats(days = 30) {
  const today = cairoDay();
  const from = shiftDay(today, -(days - 1));
  const rate = (o, v) => (v > 0 ? Math.round((o / v) * 1000) / 10 : null);
  const camps = q.all("SELECT camp, source, SUM(visits) AS visits, SUM(orders) AS orders, MIN(day) AS first, MAX(day) AS last FROM site_campaigns WHERE camp!='' AND day BETWEEN ? AND ? GROUP BY camp, source ORDER BY visits DESC, orders DESC", [from, today])
    .map((r) => ({ ...r, conversion: rate(r.orders, r.visits) }));
  const visitsBySource = new Map(q.all('SELECT source, SUM(visits) AS v FROM site_sources WHERE day BETWEEN ? AND ? GROUP BY source', [from, today]).map((r) => [r.source, r.v]));
  const ordersBySource = new Map(q.all('SELECT source, SUM(orders) AS o FROM site_campaigns WHERE day BETWEEN ? AND ? GROUP BY source', [from, today]).map((r) => [r.source, r.o]));
  const bySource = [...new Set([...visitsBySource.keys(), ...ordersBySource.keys()])].map((s) => {
    const v = visitsBySource.get(s) || 0, o = ordersBySource.get(s) || 0;
    return { source: s, visits: v, orders: o, conversion: rate(o, v) };
  }).sort((a, b) => b.visits - a.visits);
  return { days, from, campaigns: camps, bySource };
}
