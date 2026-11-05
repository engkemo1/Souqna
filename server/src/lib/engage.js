/**
 * Engagement jobs + growth report. Additive: reads existing tables, writes only to engage_log.
 * - Low-stock push to each store (max once a day per store, 10:00–21:00 Cairo).
 * - Weekly store report push (once a week, Saturday from 10:00 Cairo).
 * - growthReport(): rising products + SEO gaps for the admin.
 * ENGAGE_JOBS=0 disables the jobs. Push only — no messages to customers.
 */
import { q, db } from '../db/index.js';
import { cairoNow } from './sameDay.js';
import { shiftDay } from './traffic.js';
import { segments } from './insights.js';
import { notifyBuyer } from './buyers.js';
import { notifyGuestOrderWhatsApp } from './whatsapp.js';
import { notifyStore } from './push.js';
import { sweepAbandoned } from './abandoned.js';
import { sweepPlatformDaily } from './platform-daily.js';

db.exec(`CREATE TABLE IF NOT EXISTS engage_log (k TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')));`);

const sqlTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const done = (k) => !!q.get('SELECT 1 AS x FROM engage_log WHERE k=?', [k]);
const mark = (k) => db.prepare('INSERT OR IGNORE INTO engage_log (k) VALUES (?)').run(k);
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat

export function sweepStock(now = cairoNow()) {
  if (now.hm < '10:00' || now.hm >= '21:00') return 0;
  const rows = q.all(`SELECT p.store_id, p.name_ar, p.stock, p.low_stock_at FROM products p JOIN stores s ON s.id=p.store_id
    WHERE s.status='active' AND p.status='active' AND p.track_stock=1 AND p.stock <= p.low_stock_at ORDER BY p.store_id, p.stock, p.id`);
  const by = new Map();
  for (const r of rows) { if (!by.has(r.store_id)) by.set(r.store_id, []); by.get(r.store_id).push(r); }
  let sent = 0;
  for (const [storeId, list] of by) {
    const k = `stock:${storeId}:${now.date}`;
    if (done(k)) continue;
    mark(k);
    const out = list.filter((p) => p.stock <= 0), low = list.filter((p) => p.stock > 0);
    const parts = [];
    if (out.length) parts.push(`${out.length} منتج خلص (${out.slice(0, 2).map((p) => p.name_ar).join('، ')})`);
    if (low.length) parts.push(`${low.length} منتج قرّب يخلص`);
    notifyStore(storeId, { title: 'المخزون محتاج متابعة 📦', body: parts.join(' · '), url: '/dashboard/products', tag: 'stock' });
    sent++;
  }
  return sent;
}

export function storeWeek(storeId, today = cairoNow().date) {
  const from = shiftDay(today, -7), to = shiftDay(today, -1), pFrom = shiftDay(today, -14), pTo = shiftDay(today, -8);
  const ord = (a, b) => q.get("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS t FROM orders WHERE store_id=? AND status!='cancelled' AND date(created_at,'+2 hours') BETWEEN ? AND ?", [storeId, a, b]);
  const vis = (a, b) => q.get('SELECT COALESCE(SUM(visits),0) AS v FROM store_visits WHERE store_id=? AND day BETWEEN ? AND ?', [storeId, a, b]).v;
  return { orders: ord(from, to), prevOrders: ord(pFrom, pTo), visits: vis(from, to), prevVisits: vis(pFrom, pTo) };
}

export function sweepWeekly(now = cairoNow()) {
  if (weekday(now.date) !== 6 || now.hm < '10:00' || now.hm >= '21:00') return 0;
  let sent = 0;
  for (const s of q.all("SELECT id FROM stores WHERE status='active'")) {
    const k = `week:${s.id}:${now.date}`;
    if (done(k)) continue;
    mark(k);
    const w = storeWeek(s.id, now.date);
    if (!w.orders.n && !w.visits) continue; // nothing to report
    const d = w.prevOrders.n > 0 ? Math.round(((w.orders.n - w.prevOrders.n) / w.prevOrders.n) * 100) : null;
    const trend = d == null ? '' : d >= 0 ? ` (↑ ${d}%)` : ` (↓ ${Math.abs(d)}%)`;
    notifyStore(s.id, { title: 'ملخص أسبوعك على Twist 📊', body: `${w.visits} زيارة · ${w.orders.n} طلب${trend} · ${w.orders.t} ج.م مبيعات`, url: '/dashboard', tag: 'weekly' });
    sent++;
  }
  return sent;
}

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const ts = (s) => Date.parse(String(s).replace(' ', 'T') + 'Z');

/**
 * Review request ~2 days after delivery (window: 2–10 days), once per order, only if some product in it is still unreviewed.
 * Recipient: the order's account → else an account with the same phone → else WhatsApp (same customer template as the order updates).
 */
export function sweepReviews(now = cairoNow(), nowMs = Date.now(), cap = 30) {
  if (now.hm < '10:00' || now.hm >= '21:00') return 0;
  const orders = q.all(`SELECT o.id, o.number, o.buyer_id, o.phone, o.customer_name, o.track_token, o.updated_at, s.name_ar AS sname,
      (SELECT MAX(e.created_at) FROM order_events e WHERE e.order_id=o.id AND e.status='delivered') AS delivered_at
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.status='delivered' AND o.track_token IS NOT NULL AND o.updated_at >= ? ORDER BY o.id DESC LIMIT 300`, [sqlTime(nowMs - 12 * 864e5)]);
  let accounts = null, sent = 0;
  for (const o of orders) {
    if (sent >= cap) break;
    const at = ts(o.delivered_at || o.updated_at);
    if (!Number.isFinite(at) || nowMs - at < 2 * 864e5 || nowMs - at > 10 * 864e5) continue;
    const k = `review:${o.id}`;
    if (done(k)) continue;
    const open = q.get(`SELECT COUNT(*) AS n FROM order_items oi WHERE oi.order_id=? AND oi.product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_id=oi.order_id AND r.product_id=oi.product_id)`, [o.id]).n;
    mark(k);
    if (!open) continue;
    const text = `إزاي كانت مشترياتك من ${o.sname}؟ قيّمها في ثواني وساعد غيرك يختار`;
    let buyerId = o.buyer_id;
    if (!buyerId) {
      if (!accounts) accounts = new Map(q.all('SELECT id, phone FROM buyers').map((b) => [last10(b.phone), b.id]));
      buyerId = accounts.get(last10(o.phone)) || null;
    }
    if (buyerId) notifyBuyer(buyerId, { kind: 'review', title: 'قيّم مشترياتك ⭐', body: text, url: `/track/${o.track_token}` });
    else notifyGuestOrderWhatsApp({ phone: o.phone, name: o.customer_name, number: o.number, text: `قيّم مشترياتك — ${text}`, token: o.track_token });
    sent++;
  }
  return sent;
}

export function startEngageJobs() {
  if (process.env.ENGAGE_JOBS === '0') return;
  const run = () => {
    try { sweepStock(); } catch (e) { console.error(`[engage stock] ${e.message}`); }
    try { sweepReviews(); } catch (e) { console.error(`[engage reviews] ${e.message}`); }
    try { if (process.env.ABANDONED_CART !== '0') sweepAbandoned(); } catch (e) { console.error(`[engage cart] ${e.message}`); }
    try { if (process.env.PLATFORM_DAILY !== '0') sweepPlatformDaily(); } catch (e) { console.error(`[engage daily] ${e.message}`); }
    try { sweepWeekly(); } catch (e) { console.error(`[engage weekly] ${e.message}`); }
    try { if (Math.random() < 0.01) db.prepare("DELETE FROM engage_log WHERE at < datetime('now','-60 days')").run(); } catch { /* ignore */ }
  };
  setTimeout(run, 90e3).unref?.();
  setInterval(run, 30 * 60e3).unref?.();
}

/** Rising products (views this week vs last week) + catalogue/SEO gaps. */
export function growthReport() {
  const today = cairoNow().date;
  const wkFrom = shiftDay(today, -6), pFrom = shiftDay(today, -13), pTo = shiftDay(today, -7);
  const views = q.all(`SELECT v.store_id, v.path, SUM(CASE WHEN v.day >= ? THEN v.views ELSE 0 END) AS cur, SUM(CASE WHEN v.day <= ? THEN v.views ELSE 0 END) AS prev
    FROM store_page_views v WHERE v.page_type='product' AND v.day BETWEEN ? AND ? GROUP BY v.store_id, v.path`, [wkFrom, pTo, pFrom, today]);
  const stores = new Map(q.all("SELECT id, slug, name_ar FROM stores WHERE status!='deleted'").map((s) => [s.id, s]));
  const trending = [];
  for (const v of views) {
    const s = stores.get(v.store_id); if (!s || v.cur < 5) continue;
    const m = String(v.path).match(/\/p\/([^/]+)/); if (!m) continue;
    let slug; try { slug = decodeURIComponent(m[1]); } catch { slug = m[1]; }
    const p = q.get("SELECT name_ar, stock, track_stock FROM products WHERE store_id=? AND slug=? AND status='active'", [v.store_id, slug]);
    if (!p) continue;
    trending.push({ store: s.name_ar, storeSlug: s.slug, slug, name: p.name_ar, views: v.cur, prevViews: v.prev, growth: v.prev > 0 ? Math.round(((v.cur - v.prev) / v.prev) * 100) : null, lowStock: !!p.track_stock && p.stock <= 3 });
  }
  trending.sort((a, b) => b.views - a.views);

  const seo = q.all(`SELECT s.id, s.slug, s.name_ar AS name,
      SUM(CASE WHEN COALESCE(TRIM(p.description_ar),'')='' THEN 1 ELSE 0 END) AS noDesc,
      SUM(CASE WHEN COALESCE(TRIM(p.seo_title),'')='' AND COALESCE(TRIM(p.seo_description),'')='' THEN 1 ELSE 0 END) AS noSeo,
      COUNT(*) AS products
    FROM stores s JOIN products p ON p.store_id=s.id AND p.status='active' WHERE s.status='active' GROUP BY s.id`)
    .filter((r) => r.noDesc > 0 || r.noSeo > 0).sort((a, b) => b.noDesc - a.noDesc);
  const outOfStock = q.all(`SELECT s.id, s.slug, s.name_ar AS name, COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id
    WHERE s.status='active' AND p.status='active' AND p.track_stock=1 AND p.stock<=0 GROUP BY s.id ORDER BY n DESC`);
  const weakStores = q.all(`SELECT s.id, s.slug, s.name_ar AS name, s.rating, s.rating_count AS ratingCount,
      (SELECT COUNT(*) FROM reviews r WHERE r.store_id=s.id AND r.status='published' AND r.rating<=2 AND r.created_at >= datetime('now','-30 days')) AS low30
    FROM stores s WHERE s.status='active' AND s.rating_count>=3 ORDER BY s.rating ASC, s.rating_count DESC LIMIT 8`);
  const sg = segments();
  return { trending: trending.slice(0, 15), seo, outOfStock, weakStores, segments: { customers: sg.all.length, repeat: sg.repeat.length, lapsed: sg.lapsed.length } };
}
