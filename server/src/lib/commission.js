// Twist's commission on delivered orders.
// Rate = the store's own override, else (store has a live subscription AND a subscribed rate is set) the subscribed rate, else the default rate.
// The rate and amount are frozen on the order the first time it is seen as delivered, so changing a rate later never rewrites history.
// Base = the products' value after the SHOP's own discounts and after returns. Twist-funded discounts (campaign / platform_discount) do not reduce
// it: the shop is paid in full for those. Delivery fees are never part of the base.
import { q } from '../db/index.js';

const setting = (key, fallback) => q.get('SELECT value FROM app_settings WHERE key=?', [key])?.value ?? fallback;
const pctOrNull = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };

export function commissionSettings() {
  return { defaultRate: pctOrNull(setting('commission_default_rate', '8')) ?? 8, subscribedRate: pctOrNull(setting('commission_subscribed_rate', '')) };
}

export function saveCommissionSettings({ defaultRate, subscribedRate }) {
  const put = (k, v) => q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
  if (defaultRate !== undefined) put('commission_default_rate', String(defaultRate));
  if (subscribedRate !== undefined) put('commission_subscribed_rate', subscribedRate === null ? '' : String(subscribedRate));
}

/** Rate (percent) that applies to `storeId` on `day` (YYYY-MM-DD). */
export function rateFor(storeId, day) {
  const st = q.get('SELECT commission_rate_override AS o FROM stores WHERE id=?', [storeId]);
  if (st?.o != null) return { rate: Number(st.o), source: 'store' };
  const { defaultRate, subscribedRate } = commissionSettings();
  if (subscribedRate != null) {
    const sub = q.get('SELECT covered_through FROM store_subscriptions WHERE store_id=?', [storeId]);
    if (sub?.covered_through && sub.covered_through >= day) return { rate: subscribedRate, source: 'subscription' };
  }
  return { rate: defaultRate, source: 'default' };
}

/** Part of `discount` that Twist funded on the products (campaign + a platform coupon's product discount). A free-shipping coupon is NOT a product discount
 *  (orders.platform_discount carries the shipping fee for it), so it never counts here. Never more than the discount itself. */
function twistFunded(o) {
  const campaign = o.campaign_discount || 0;
  let coupon = Math.max(0, (o.platform_discount || 0) - campaign);
  if (coupon > 0 && o.coupon_code && q.get("SELECT 1 FROM platform_coupons WHERE UPPER(code)=UPPER(?) AND type='free_shipping'", [o.coupon_code])) coupon = 0;
  return Math.min(o.discount || 0, campaign + coupon);
}
const baseOf = (o) => {
  const refunds = q.val('SELECT COALESCE(SUM(refund),0) FROM order_returns WHERE order_id=?', [o.id]) || 0;
  return Math.max(0, (o.subtotal || 0) - (o.discount || 0) + twistFunded(o) - refunds);
};

/** Freeze the commission of one delivered order (no-op if already frozen, or if the order is not delivered). */
export function settleCommission(orderId) {
  const o = q.get("SELECT * FROM orders WHERE id=? AND status='delivered' AND commission_amount IS NULL AND delivery_by <> 'pickup'", [orderId]);
  if (!o) return null;
  const at = q.val("SELECT MAX(created_at) FROM order_events WHERE order_id=? AND status='delivered'", [o.id]) || o.updated_at || o.created_at || '';
  const rate = o.commission_rate != null ? Number(o.commission_rate) : rateFor(o.store_id, String(at).slice(0, 10)).rate; // a rate frozen when the shop was paid wins
  const amount = Math.round((baseOf(o) * rate) / 100);
  q.run('UPDATE orders SET commission_rate=?, commission_amount=? WHERE id=?', [rate, amount, o.id]);
  return { rate, amount };
}

/** Catch every delivered order not frozen yet (all delivery paths end up here, so none has to remember to call settleCommission). */
export function settleAll() {
  const since = setting('commission_start', '') || '0000';
  for (const { id } of q.all("SELECT id FROM orders WHERE status='delivered' AND commission_amount IS NULL AND delivery_by <> 'pickup' AND created_at >= ? LIMIT 2000", [since])) settleCommission(id);
}

/** A return after delivery lowers the base: refresh the frozen amount at the SAME rate. */
export function refreshAfterReturn(orderId) {
  const o = q.get("SELECT * FROM orders WHERE id=? AND status='delivered' AND commission_amount IS NOT NULL", [orderId]);
  if (o) q.run('UPDATE orders SET commission_amount=? WHERE id=?', [Math.round((baseOf(o) * o.commission_rate) / 100), o.id]);
}

/** What the shop is owed for one order, and where the payout stands. due = products after the shop's discount, minus Twist's commission. */
export function payoutState(o) {
  const base = baseOf(o);
  const rate = o.commission_rate != null ? Number(o.commission_rate) : rateFor(o.store_id, new Date().toISOString().slice(0, 10)).rate;
  const commission = o.commission_amount != null ? o.commission_amount : Math.round((base * rate) / 100);
  const cancelled = o.status === 'cancelled';
  const due = cancelled ? 0 : Math.max(0, base - commission);
  const paid = o.shop_paid_at ? (o.shop_paid_amount || 0) : 0;
  return { applies: o.delivery_by !== 'pickup', rate, commission: cancelled ? 0 : commission, due, paid, paidAt: o.shop_paid_at || null, owedBack: o.shop_paid_at ? Math.max(0, paid - due) : 0 };
}

export function markShopPaid(orderId, paid) {
  const o = q.get('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!o) return null;
  if (!paid) {
    // forget the frozen rate too, unless the commission itself is already settled on delivery
    q.run('UPDATE orders SET shop_paid_at=NULL, shop_paid_amount=NULL, commission_rate=CASE WHEN commission_amount IS NULL THEN NULL ELSE commission_rate END WHERE id=?', [o.id]);
    return payoutState(q.get('SELECT * FROM orders WHERE id=?', [o.id]));
  }
  if (o.status === 'cancelled') throw new Error('cancelled');
  const at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rate = o.commission_rate != null ? Number(o.commission_rate) : rateFor(o.store_id, at.slice(0, 10)).rate;
  const amount = payoutState({ ...o, commission_rate: rate, shop_paid_at: null }).due;
  q.run('UPDATE orders SET shop_paid_at=?, shop_paid_amount=?, commission_rate=? WHERE id=?', [at, amount, rate, o.id]);
  return payoutState(q.get('SELECT * FROM orders WHERE id=?', [o.id]));
}

/** Orders Twist already paid the shop for that no longer justify the payment (cancelled, or goods returned afterwards). */
export function clawbacks() {
  return q.all(`SELECT o.*, s.name_ar AS store_name, s.slug FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.shop_paid_at IS NOT NULL ORDER BY o.id DESC LIMIT 500`)
    .map((o) => ({ id: o.id, number: o.number, store: o.store_name, slug: o.slug, status: o.status, ...payoutState(o) })).filter((x) => x.owedBack > 0);
}

/** Totals since `fromSql` (SQL datetime) — overall and per store — plus the current settings. */
export function commissionReport(fromSql) {
  settleAll();
  const rows = q.all(`SELECT s.slug, s.name_ar AS name, COUNT(*) AS orders, COALESCE(SUM(o.commission_amount),0) AS commission, MAX(o.commission_rate) AS rate
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.status='delivered' AND o.commission_amount IS NOT NULL AND o.created_at >= ?
    GROUP BY s.id ORDER BY commission DESC`, [fromSql]);
  return { settings: commissionSettings(), total: rows.reduce((a, r) => a + r.commission, 0), stores: rows, clawbacks: clawbacks() };
}
