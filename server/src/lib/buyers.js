/** Optional shopper accounts: separate token (own secret, own header) so a shopper token can never act as a store owner. */
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { config } from '../config.js';
import { q } from '../db/index.js';
import { AppError } from './errors.js';
import { vapidPublicKey } from './push.js';
import { notifyGuestOrderWhatsApp } from './whatsapp.js';

const SECRET = `${config.jwtSecret}:buyer`;
export const signBuyer = (b) => { touchSeen(b.id); return jwt.sign({ sub: b.id, k: 'buyer' }, SECRET, { expiresIn: '90d' }); };
function touchSeen(id) { try { q.run("UPDATE buyers SET last_seen_at=datetime('now') WHERE id=?", [id]); } catch { /* never block a sign-in */ } }
const SEEN_EVERY = 10 * 60e3;

export function buyerFromReq(req) {
  const t = req.headers['x-buyer-token'];
  if (!t || typeof t !== 'string') return null;
  let b = null;
  try { const p = jwt.verify(t, SECRET, { algorithms: ['HS256'] }); b = p.k === 'buyer' ? q.get('SELECT id, name, phone, phone_verified, last_seen_at, blocked FROM buyers WHERE id=?', [p.sub]) || null : null; } catch { return null; }
  if (b && (b.blocked || isPhoneBlocked(b.phone))) return null; // blocked by the team: signed out everywhere
  if (b && (!b.last_seen_at || Date.parse(`${b.last_seen_at.replace(' ', 'T')}Z`) < Date.now() - SEEN_EVERY)) touchSeen(b.id);
  return b;
}
/* ------------------------------------------------ blocked customers */
export function isPhoneBlocked(phone) {
  const p = String(phone || '');
  if (!/^01\d{9}$/.test(p)) return false;
  try { return !!q.get('SELECT 1 AS x FROM customer_flags WHERE phone=? AND blocked=1', [p]); } catch { return false; }
}
/** Called before any order, reservation or sign-in: a blocked number (or account) gets a polite refusal pointing to support. */
export function assertCustomerAllowed(phone, req) {
  let blocked = isPhoneBlocked(phone);
  if (!blocked && req) {
    const t = req.headers['x-buyer-token'];
    if (t && typeof t === 'string') { try { const p = jwt.verify(t, SECRET, { algorithms: ['HS256'] }); const row = q.get('SELECT phone, blocked FROM buyers WHERE id=?', [p.sub]); blocked = !!(row && (row.blocked || isPhoneBlocked(row.phone))); } catch { /* bad token: ignore */ } }
  }
  if (blocked) throw new AppError(403, 'customer_blocked', 'We cannot take this request. Please contact Twist support on WhatsApp.');
}

export function requireBuyer(req, _res, next) {
  const b = buyerFromReq(req);
  if (!b) return next(new AppError(401, 'unauthorized', 'Please sign in to continue.'));
  req.buyer = b; next();
}

/** In-app notification + a phone push if the shopper enabled it. Never throws. */
export function notifyBuyer(buyerId, { kind, title, body = '', url = '/account' }) {
  try {
    q.run('INSERT INTO buyer_notifications (buyer_id, kind, title, body, url) VALUES (?,?,?,?,?)', [buyerId, kind, title, body, url]);
    const subs = q.all('SELECT * FROM buyer_push WHERE buyer_id=?', [buyerId]);
    if (!subs.length) return;
    vapidPublicKey(); // makes sure VAPID is configured
    for (const s of subs) {
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url, tag: `${kind}-${buyerId}` }), { TTL: 86400, urgency: 'normal' })
        .catch((e) => { if (e.statusCode === 404 || e.statusCode === 410) q.run('DELETE FROM buyer_push WHERE id=?', [s.id]); else console.error(`[buyer push] ${e.statusCode || ''} ${e.message}`); });
    }
  } catch (e) { console.error(`[buyer notify] ${e.message}`); }
}

const STATUS_TEXT = {
  confirmed: ['طلبك اتأكد ✅', (n, s) => `محل ${s} أكد طلب ${n}`],
  processing: ['طلبك بيتجهز 📦', (n, s) => `${s} بيجهّز طلب ${n}`],
  shipped: ['طلبك في الطريق 🚚', (n) => `طلب ${n} خرج للتوصيل`],
  delivered: ['وصل طلبك 🎉', (n) => `طلب ${n} اتسلّم. قيّم مشترياتك وساعد غيرك يختار`],
  cancelled: ['الطلب اتلغى', (n, s) => `طلب ${n} من ${s} اتلغى`],
};
/** In-store reservations ("reserve & try in store") read differently from deliveries. */
const PICKUP_TEXT = {
  confirmed: ['القطعة جاهزة في المحل ✅', (n, s) => `${s} جهّز حجزك ${n}. عدّي قيسها قبل ما وقت الحجز يخلص.`],
  delivered: ['مبروك عليك 🛍️', (n, s) => `شكرًا إنك اشتريت من ${s}.`],
  cancelled: ['الحجز اتلغى', (n, s) => `حجزك ${n} في ${s} اتلغى. افتح الحجز تشوف قطع شبهها.`],
};

export function notifyOrderStatus(orderId, status) {
  const o = q.get('SELECT o.id, o.number, o.buyer_id, o.track_token, o.delivery_by, o.customer_name, o.phone, s.name_ar AS sname FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=?', [orderId]);
  const t = (o?.delivery_by === 'pickup' ? PICKUP_TEXT : STATUS_TEXT)[status]; if (!t) return;
  if (!o) return;
  if (!o.buyer_id) { // ordered without an account: WhatsApp (when a customer template is configured)
    notifyGuestOrderWhatsApp({ phone: o.phone, name: o.customer_name, number: o.number, text: `${t[0].replace(/[\u{1F300}-\u{1FAFF}\u2705\u2714]/gu, '').trim()} — ${t[1](o.number, o.sname)}`, token: o.track_token });
    return;
  }
  notifyBuyer(o.buyer_id, { kind: 'order', title: t[0], body: t[1](o.number, o.sname), url: `/track/${o.track_token}` });
}

const egp = (n) => `${Number(n).toLocaleString('en-US')} ج.م`;
export function notifyPriceDrop(productId, oldPrice, newPrice) {
  if (!(newPrice < oldPrice)) return;
  const p = q.get('SELECT p.name_ar, p.slug, s.slug AS sslug FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=?', [productId]);
  if (!p) return;
  for (const w of q.all('SELECT buyer_id FROM buyer_watches WHERE product_id=?', [productId])) {
    notifyBuyer(w.buyer_id, { kind: 'price', title: 'السعر نزل 🔻', body: `${p.name_ar}: كان ${egp(oldPrice)} وبقى ${egp(newPrice)}`, url: `/s/${p.sslug}/p/${p.slug}` });
  }
}
/** A sold-out product is available again: tell everyone who asked to be notified. */
export function notifyBackInStock(productId) {
  const p = q.get('SELECT p.name_ar, p.slug, s.slug AS sslug FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=?', [productId]);
  if (!p) return;
  for (const w of q.all('SELECT buyer_id FROM buyer_watches WHERE product_id=?', [productId])) {
    notifyBuyer(w.buyer_id, { kind: 'stock', title: 'اتوفر تاني ✅', body: `${p.name_ar} رجع متاح. الحق اطلبه قبل ما يخلص.`, url: `/s/${p.sslug}/p/${p.slug}` });
  }
}

export function notifyFollowers(storeId, { kind, title, body }) {
  const s = q.get('SELECT slug FROM stores WHERE id=?', [storeId]);
  for (const f of q.all('SELECT buyer_id FROM buyer_follows WHERE store_id=?', [storeId])) notifyBuyer(f.buyer_id, { kind, title, body, url: `/s/${s.slug}` });
}

/* ------------------------------------------------ admin: every shopper account and what it did */
const VIA = "COALESCE(b.signup_via, CASE WHEN b.google_sub IS NOT NULL THEN 'google' WHEN b.phone_verified=1 THEN 'whatsapp' ELSE 'password' END)";
const ADMIN_COLS = `b.id, b.name, b.phone, b.email, b.blocked AS account_blocked, (SELECT cf.blocked FROM customer_flags cf WHERE cf.phone=b.phone) AS phone_blocked, b.phone_verified, b.google_sub IS NOT NULL AS google, ${VIA} AS via, b.created_at, b.last_seen_at,
  (SELECT COUNT(*) FROM orders o WHERE o.buyer_id=b.id) AS orders,
  (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.buyer_id=b.id AND o.status<>'cancelled') AS spent,
  (SELECT MAX(o.created_at) FROM orders o WHERE o.buyer_id=b.id) AS last_order_at,
  (SELECT COUNT(*) FROM buyer_watches w WHERE w.buyer_id=b.id) AS watches,
  (SELECT COUNT(*) FROM buyer_follows f WHERE f.buyer_id=b.id) AS follows,
  (SELECT COUNT(*) FROM buyer_stylist_chats c WHERE c.buyer_id=b.id) AS chats,
  (SELECT COUNT(*) FROM buyer_push p WHERE p.buyer_id=b.id) AS push`;
const adminRow = (b) => { const { account_blocked: ab, phone_blocked: pb, ...rest } = b; return { ...rest, phone: String(b.phone || '').startsWith('g_') ? '' : b.phone, google: !!b.google, phone_verified: !!b.phone_verified, blocked: !!(ab || pb) }; };
const SORTS = { new: 'b.id DESC', active: "COALESCE(b.last_seen_at, b.created_at) DESC", spent: 'spent DESC, b.id DESC', orders: 'orders DESC, b.id DESC' };

function adminWhere({ term = '', via = '' } = {}) {
  const where = []; const params = [];
  const t = String(term).trim().slice(0, 60);
  if (t) {
    const digits = t.replace(/\D/g, '');
    where.push(`(b.name LIKE ? OR b.email LIKE ?${digits.length >= 3 ? ' OR b.phone LIKE ?' : ''})`);
    params.push(`%${t}%`, `%${t}%`, ...(digits.length >= 3 ? [`%${digits}%`] : []));
  }
  if (['google', 'whatsapp', 'password'].includes(via)) { where.push(`${VIA}=?`); params.push(via); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function adminBuyersList({ term, via, sort = 'new', page = 1, per = 50 } = {}) {
  const w = adminWhere({ term, via });
  const p = Math.max(1, Number.parseInt(page, 10) || 1);
  const total = q.val(`SELECT COUNT(*) FROM buyers b ${w.sql}`, w.params);
  const items = q.all(`SELECT ${ADMIN_COLS} FROM buyers b ${w.sql} ORDER BY ${SORTS[sort] || SORTS.new} LIMIT ? OFFSET ?`, [...w.params, per, (p - 1) * per]).map(adminRow);
  const counts = Object.fromEntries(q.all(`SELECT ${VIA} AS via, COUNT(*) AS n FROM buyers b GROUP BY 1`).map((r) => [r.via, r.n]));
  const stats = {
    all: q.val('SELECT COUNT(*) FROM buyers'), google: counts.google || 0, whatsapp: counts.whatsapp || 0, password: counts.password || 0,
    new7: q.val("SELECT COUNT(*) FROM buyers WHERE created_at >= datetime('now','-7 days')"),
    active7: q.val("SELECT COUNT(*) FROM buyers WHERE last_seen_at >= datetime('now','-7 days')"),
    buyers: q.val('SELECT COUNT(DISTINCT buyer_id) FROM orders WHERE buyer_id IS NOT NULL'),
  };
  return { items, total, page: p, pages: Math.max(1, Math.ceil(total / per)), stats };
}

export function adminBuyerDetail(id) {
  const b = q.get(`SELECT ${ADMIN_COLS} FROM buyers b WHERE b.id=?`, [id]);
  if (!b) return null;
  const orders = q.all(`SELECT o.number, o.status, o.total, o.delivery_by, o.created_at, o.track_token, s.name_ar AS store
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.buyer_id=? ORDER BY o.id DESC LIMIT 30`, [id]);
  const watches = q.all(`SELECT p.id, p.name_ar AS name, p.price FROM buyer_watches w JOIN products p ON p.id=w.product_id WHERE w.buyer_id=? ORDER BY p.id DESC LIMIT 30`, [id]);
  const follows = q.all(`SELECT s.name_ar AS name, s.slug FROM buyer_follows f JOIN stores s ON s.id=f.store_id WHERE f.buyer_id=? LIMIT 30`, [id]);
  return { buyer: adminRow(b), orders, watches, follows };
}

export function adminBuyersCsv() {
  const rows = q.all(`SELECT ${ADMIN_COLS} FROM buyers b ORDER BY b.id DESC`).map(adminRow);
  const VIA_AR = { google: 'جوجل', whatsapp: 'واتساب', password: 'باسورد' };
  return { header: ['الاسم', 'الموبايل', 'الإيميل', 'طريقة التسجيل', 'الرقم متأكد', 'تاريخ التسجيل', 'آخر ظهور', 'عدد الطلبات', 'إجمالي المشتريات', 'آخر طلب', 'منتجات بيتابعها', 'محلات بيتابعها', 'محادثات تويلا', 'إشعارات الموبايل'],
    rows: rows.map((b) => [b.name, b.phone, b.email || '', VIA_AR[b.via] || b.via, b.phone_verified ? 'أيوه' : 'لأ', b.created_at, b.last_seen_at || '', b.orders, b.spent, b.last_order_at || '', b.watches, b.follows, b.chats, b.push ? 'مفعّلة' : 'لأ']) };
}

/* ------------------------------------------------ admin: everyone who ordered (guests too), grouped by mobile number */
const CUST_SORTS = { recent: 'last_order DESC', spent: 'spent DESC', orders: 'orders DESC', cancelled: 'cancelled DESC, last_order DESC' };
export function adminCustomersList({ term = '', filter = '', sort = 'recent', page = 1, per = 50 } = {}) {
  const where = []; const params = [];
  const t = String(term).trim().slice(0, 60);
  if (t) { const d = t.replace(/\D/g, ''); where.push(`(o.customer_name LIKE ?${d.length >= 3 ? ' OR o.phone LIKE ?' : ''})`); params.push(`%${t}%`, ...(d.length >= 3 ? [`%${d}%`] : [])); }
  const having = filter === 'blocked' ? 'HAVING blocked=1' : filter === 'cancelled' ? 'HAVING cancelled>0' : filter === 'guests' ? 'HAVING has_account=0' : filter === 'noted' ? "HAVING note IS NOT NULL AND note<>''" : '';
  const base = `SELECT o.phone,
      (SELECT o2.customer_name FROM orders o2 WHERE o2.phone=o.phone ORDER BY o2.id DESC LIMIT 1) AS name,
      (SELECT o2.governorate || ' - ' || o2.city FROM orders o2 WHERE o2.phone=o.phone ORDER BY o2.id DESC LIMIT 1) AS area,
      COUNT(*) AS orders, SUM(o.status='delivered') AS delivered, SUM(o.status='cancelled') AS cancelled,
      SUM(o.status IN ('pending','confirmed','processing','shipped')) AS open,
      SUM(CASE WHEN o.status<>'cancelled' THEN o.total ELSE 0 END) AS spent,
      MIN(o.created_at) AS first_order, MAX(o.created_at) AS last_order,
      EXISTS(SELECT 1 FROM buyers b WHERE b.phone=o.phone) AS has_account,
      COALESCE((SELECT cf.blocked FROM customer_flags cf WHERE cf.phone=o.phone), 0) AS blocked,
      (SELECT cf.note FROM customer_flags cf WHERE cf.phone=o.phone) AS note
    FROM orders o ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY o.phone ${having}`;
  const p = Math.max(1, Number.parseInt(page, 10) || 1);
  const total = q.val(`SELECT COUNT(*) FROM (${base})`, params);
  const items = q.all(`${base} ORDER BY ${CUST_SORTS[sort] || CUST_SORTS.recent} LIMIT ? OFFSET ?`, [...params, per, (p - 1) * per])
    .map((c) => ({ ...c, has_account: !!c.has_account, blocked: !!c.blocked }));
  const stats = {
    all: q.val('SELECT COUNT(DISTINCT phone) FROM orders'),
    guests: q.val('SELECT COUNT(DISTINCT phone) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM buyers b WHERE b.phone=o.phone)'),
    cancelled: q.val("SELECT COUNT(DISTINCT phone) FROM orders WHERE status='cancelled'"),
    blocked: q.val('SELECT COUNT(*) FROM customer_flags WHERE blocked=1'),
  };
  return { items, total, page: p, pages: Math.max(1, Math.ceil(total / per)), stats };
}

export function adminCustomerDetail(phone) {
  const orders = q.all(`SELECT o.id, o.number, o.status, o.total, o.delivery_by, o.customer_name, o.governorate, o.city, o.address, o.notes, o.created_at, o.track_token,
      s.name_ar AS store, (SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) AS items
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.phone=? ORDER BY o.id DESC LIMIT 100`, [phone]);
  const account = q.get('SELECT id, name, email, created_at, last_seen_at FROM buyers WHERE phone=?', [phone]) || null;
  const flag = q.get('SELECT blocked, reason, note, updated_at FROM customer_flags WHERE phone=?', [phone]) || { blocked: 0, reason: null, note: null };
  if (!orders.length && !account && !flag.updated_at) return null;
  return { phone, name: orders[0]?.customer_name || account?.name || '', account, orders, blocked: !!flag.blocked, reason: flag.reason, note: flag.note, flaggedAt: flag.updated_at || null };
}

/** Block / unblock a mobile number (guest or account) and keep the reason and a private note. */
export function setCustomerFlag(phone, { blocked, reason, note } = {}) {
  const cur = q.get('SELECT * FROM customer_flags WHERE phone=?', [phone]);
  const next = { blocked: blocked === undefined ? (cur?.blocked || 0) : (blocked ? 1 : 0), reason: reason === undefined ? cur?.reason ?? null : reason || null, note: note === undefined ? cur?.note ?? null : note || null };
  q.run(`INSERT INTO customer_flags (phone, blocked, reason, note, updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(phone) DO UPDATE SET blocked=excluded.blocked, reason=excluded.reason, note=excluded.note, updated_at=excluded.updated_at`, [phone, next.blocked, next.reason, next.note]);
  return next;
}
/** Block an account that has no mobile number yet (signed up with Google only). */
export function setBuyerBlocked(id, blocked) { return q.run('UPDATE buyers SET blocked=? WHERE id=?', [blocked ? 1 : 0, id]).changes; }
