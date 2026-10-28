/** Optional shopper accounts: separate token (own secret, own header) so a shopper token can never act as a store owner. */
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { config } from '../config.js';
import { q } from '../db/index.js';
import { AppError } from './errors.js';
import { vapidPublicKey } from './push.js';

const SECRET = `${config.jwtSecret}:buyer`;
export const signBuyer = (b) => jwt.sign({ sub: b.id, k: 'buyer' }, SECRET, { expiresIn: '90d' });

export function buyerFromReq(req) {
  const t = req.headers['x-buyer-token'];
  if (!t || typeof t !== 'string') return null;
  try { const p = jwt.verify(t, SECRET); return p.k === 'buyer' ? q.get('SELECT id, name, phone, phone_verified FROM buyers WHERE id=?', [p.sub]) || null : null; } catch { return null; }
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
  const o = q.get('SELECT o.id, o.number, o.buyer_id, o.track_token, o.delivery_by, s.name_ar AS sname FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=?', [orderId]);
  const t = (o?.delivery_by === 'pickup' ? PICKUP_TEXT : STATUS_TEXT)[status]; if (!t) return;
  if (!o?.buyer_id) return;
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
