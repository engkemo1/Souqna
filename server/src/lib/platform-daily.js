/**
 * Morning report to the platform team on WhatsApp (the same alert channel as the watchdog): yesterday's orders and sales,
 * new stores and shoppers, the top store and featured-ad performance. One message a day, sent from 09:00 Cairo.
 * PLATFORM_DAILY=0 turns it off. Does nothing until the team WhatsApp alert is configured.
 */
import { q, db } from '../db/index.js';
import { cairoNow } from './sameDay.js';
import { shiftDay } from './traffic.js';
import { notifyPlatformAlert } from './whatsapp.js';

const money = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0));

/** Hours between UTC and Cairo right now (2 in winter, 3 in summer), so "yesterday in Cairo" is a true Cairo day. */
function cairoOffsetHours(nowMs = Date.now()) {
  const c = cairoNow(new Date(nowMs));
  return Math.round((Date.parse(`${c.date}T${c.hm}:00Z`) - nowMs) / 36e5);
}

export function buildReport(day, offset = cairoOffsetHours()) {
  const mod = `${offset >= 0 ? '+' : ''}${offset} hours`;
  const o = q.get(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS sales FROM orders WHERE status<>'cancelled' AND date(created_at, ?)=?`, [mod, day]);
  const cancelled = q.val(`SELECT COUNT(*) FROM orders WHERE status='cancelled' AND date(created_at, ?)=?`, [mod, day]);
  const stores = q.val(`SELECT COUNT(*) FROM stores WHERE date(created_at, ?)=?`, [mod, day]);
  const buyers = q.val(`SELECT COUNT(*) FROM buyers WHERE date(created_at, ?)=?`, [mod, day]);
  const top = q.get(`SELECT s.name_ar AS name, COUNT(*) AS n FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.status<>'cancelled' AND date(o.created_at, ?)=? GROUP BY s.id ORDER BY n DESC, SUM(o.total) DESC LIMIT 1`, [mod, day]);
  let ads = null;
  try { ads = q.get(`SELECT COALESCE(SUM(CASE WHEN event='impression' THEN n END),0) AS v, COALESCE(SUM(CASE WHEN event='click' THEN n END),0) AS c FROM featured_stats WHERE day=?`, [day]); } catch { /* table appears with the first campaign */ }
  const lines = [`تقرير Twist — ${day}`, `الطلبات: ${o.n}${cancelled ? ` (ملغي ${cancelled})` : ''} · المبيعات: ${money(o.sales)} ج.م`];
  if (top) lines.push(`أعلى محل: ${top.name} (${top.n} طلب)`);
  lines.push(`محلات جديدة: ${stores} · عملاء جدد: ${buyers}`);
  if (ads && (ads.v || ads.c)) lines.push(`الإعلانات المميزة: ${money(ads.v)} مشاهدة · ${money(ads.c)} نقرة`);
  return { text: lines.join('\n'), orders: o.n, sales: o.sales };
}

db.exec(`CREATE TABLE IF NOT EXISTS engage_log (k TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')));`);

export function sweepPlatformDaily(now = cairoNow(), send = notifyPlatformAlert, nowMs = Date.now()) {
  if (now.hm < '09:00' || now.hm >= '12:00') return false;
  const k = `platform-daily:${now.date}`;
  if (q.get('SELECT 1 AS x FROM engage_log WHERE k=?', [k])) return false;
  db.prepare('INSERT OR IGNORE INTO engage_log (k) VALUES (?)').run(k);
  send(buildReport(shiftDay(now.date, -1), cairoOffsetHours(nowMs)).text);
  return true;
}
