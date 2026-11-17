/**
 * "Send me two sizes, I'll choose at the door" (Try 2 Sizes).
 * A shop switches it on per product (products.try_sizes). The shopper picks a second size at checkout; the order is a normal order for the
 * size they chose first ('main') plus a second line for the other size ('alt', price 0 while it is only on trial). Both pieces are held from
 * stock. At the door the courier records what the shopper kept: the first size, the other size, or nothing. The piece not kept goes back to
 * stock, and the order total follows what was kept (nothing kept = delivery fee only).
 */
import { q, tx, insert } from '../db/index.js';
import { AppError } from './errors.js';
import { nowIso } from './util.js';

const NONE_WINDOW = '-60 days';
const NONE_LIMIT = 2;
const BLOCK_DAYS = 14;

/** A shopper (by phone) who sent both sizes back twice in 60 days cannot use the option for 14 days after the last time. */
export function tryRecord(phone) {
  const r = q.get("SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM orders WHERE phone=? AND has_try=1 AND try_outcome='none' AND updated_at >= datetime('now', ?)", [phone, NONE_WINDOW]);
  let blockedUntil = null;
  if ((r?.n || 0) >= NONE_LIMIT && r.last) {
    const until = new Date(`${String(r.last).replace(' ', 'T')}Z`).getTime() + BLOCK_DAYS * 86400e3;
    if (until > Date.now()) blockedUntil = new Date(until).toISOString();
  }
  return { sentBack: r?.n || 0, blockedUntil };
}

/** Other sizes of the same colour that are in stock, for a product that has the option switched on. */
export function tryAlternatives(storeId, productId, variantId) {
  const p = q.get("SELECT id, try_sizes, track_stock FROM products WHERE id=? AND store_id=? AND status='active'", [productId, storeId]);
  if (!p || !p.try_sizes || !variantId) return { eligible: false, alts: [] };
  const main = q.get('SELECT id, color, size FROM variants WHERE id=? AND product_id=?', [variantId, p.id]);
  if (!main || !main.size) return { eligible: false, alts: [] };
  const rows = q.all('SELECT id, color, size, stock FROM variants WHERE product_id=? AND id<>? AND size IS NOT NULL ORDER BY id', [p.id, main.id]);
  const alts = rows
    .filter((v) => v.size !== main.size && (v.color || null) === (main.color || null) && (!p.track_stock || v.stock > 0))
    .map((v) => ({ variantId: v.id, size: v.size, color: v.color || null }));
  return { eligible: alts.length > 0, alts, mainSize: main.size };
}

/** Checks the "second size" the shopper asked for. Returns null when none was asked, else what attachTry needs. */
export function prepareTry(store, items, phone) {
  const asked = (items || []).filter((it) => it.tryVariantId);
  if (!asked.length) return null;
  if (asked.length > 1) throw new AppError(409, 'try_one_only', 'Only one item per order can be sent in two sizes.');
  const it = asked[0];
  if (Number(it.qty) !== 1) throw new AppError(409, 'try_one_only', 'Two sizes can be sent for a single piece only.');
  const rec = tryRecord(phone);
  if (rec.blockedUntil) throw new AppError(403, 'try_blocked', 'Sending two sizes is paused for this number for a while.', { until: rec.blockedUntil });
  const { eligible, alts } = tryAlternatives(store.id, it.productId, it.variantId);
  const alt = alts.find((a) => a.variantId === Number(it.tryVariantId));
  if (!eligible || !alt) throw new AppError(409, 'try_unavailable', 'This size can no longer be sent for trying.');
  return { productId: it.productId, variantId: it.variantId, altVariantId: alt.variantId, altSize: alt.size };
}

/** Adds the second size to a freshly created order: the line, the stock hold and the flags. Call inside the order transaction. */
export function attachTry(orderId, t, now = nowIso()) {
  if (!t) return;
  const main = q.get('SELECT * FROM order_items WHERE order_id=? AND product_id=? AND variant_id=? AND is_gift=0 AND try_role IS NULL ORDER BY id LIMIT 1', [orderId, t.productId, t.variantId]);
  const alt = q.get('SELECT * FROM variants WHERE id=? AND product_id=?', [t.altVariantId, t.productId]);
  if (!main || !alt) throw new AppError(409, 'cart_changed', 'Some items in your cart are no longer available.');
  const p = q.get('SELECT track_stock FROM products WHERE id=?', [t.productId]);
  if (p?.track_stock) {
    if (!q.run('UPDATE variants SET stock=stock-1 WHERE id=? AND stock>=1', [alt.id]).changes) throw new AppError(409, 'cart_changed', 'Some items in your cart are no longer available.');
    if (!q.run('UPDATE products SET stock=stock-1, sold_count=sold_count+1 WHERE id=? AND stock>=1', [t.productId]).changes) throw new AppError(409, 'cart_changed', 'Some items in your cart are no longer available.');
  } else q.run('UPDATE products SET sold_count=sold_count+1 WHERE id=?', [t.productId]);
  insert('order_items', { order_id: orderId, product_id: t.productId, variant_id: alt.id, name_ar: main.name_ar, name_en: main.name_en, media_id: main.media_id, color: alt.color || null, size: alt.size, price: 0, qty: 1, try_role: 'alt' });
  q.run("UPDATE order_items SET try_role='main' WHERE id=?", [main.id]);
  q.run('UPDATE orders SET has_try=1 WHERE id=?', [orderId]);
  insert('order_events', { order_id: orderId, status: 'pending', note: 'try_sizes', created_at: now });
}

const giveBack = (line) => {
  if (!line || line.qty <= 0) return;
  const p = line.product_id ? q.get('SELECT track_stock FROM products WHERE id=?', [line.product_id]) : null;
  if (p?.track_stock) {
    if (line.variant_id) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [line.qty, line.variant_id]);
    q.run('UPDATE products SET stock=stock+? WHERE id=?', [line.qty, line.product_id]);
  }
  if (line.product_id) q.run('UPDATE products SET sold_count=MAX(0,sold_count-?) WHERE id=?', [line.qty, line.product_id]);
};

/** What the shopper kept at the door: 'main' (the size chosen first), 'alt' (the other size) or 'none'. Pieces not kept return to stock. */
export function settleTry(orderId, keep) {
  if (!['main', 'alt', 'none'].includes(keep)) throw new AppError(400, 'invalid_choice', 'Choose main, alt or none.');
  return tx(() => {
    const o = q.get('SELECT * FROM orders WHERE id=?', [orderId]);
    if (!o || !o.has_try) throw new AppError(404, 'not_found', 'This order has no two-size trial.');
    if (o.try_outcome) throw new AppError(409, 'try_already_settled', 'This trial was already settled.');
    if (o.status !== 'shipped') throw new AppError(409, 'invalid_transition', 'Record what the shopper kept once the courier is on the way.');
    const main = q.get("SELECT * FROM order_items WHERE order_id=? AND try_role='main'", [orderId]);
    const alt = q.get("SELECT * FROM order_items WHERE order_id=? AND try_role='alt'", [orderId]);
    if (!main || !alt) throw new AppError(409, 'try_broken', 'The two sizes of this order could not be found.');
    const now = nowIso();
    const drop = (line) => { q.run("UPDATE order_items SET qty=0, try_result='returned' WHERE id=?", [line.id]); };
    if (keep === 'main') {
      giveBack(alt); drop(alt);
      q.run("UPDATE order_items SET try_result='kept' WHERE id=?", [main.id]);
    } else if (keep === 'alt') {
      giveBack(main);
      q.run("UPDATE order_items SET variant_id=?, size=?, color=?, try_result='kept' WHERE id=?", [alt.variant_id, alt.size, alt.color, main.id]);
      drop(alt);
    } else {
      giveBack(main); giveBack(alt); drop(main); drop(alt);
      for (const g of q.all('SELECT * FROM order_items WHERE order_id=? AND is_gift=1 AND qty>0', [orderId])) { giveBack(g); q.run('UPDATE order_items SET qty=0 WHERE id=?', [g.id]); }
      const itemsValue = o.subtotal - (o.discount || 0);
      q.run('UPDATE orders SET subtotal=0, discount=0, promo_discount=0, total=shipping WHERE id=?', [orderId]);
      if (o.customer_id && itemsValue > 0) q.run('UPDATE customers SET total_spent=MAX(0,total_spent-?) WHERE id=?', [itemsValue, o.customer_id]);
    }
    q.run('UPDATE orders SET try_outcome=?, updated_at=? WHERE id=?', [keep, now, orderId]);
    insert('order_events', { order_id: orderId, status: o.status, note: `try_${keep}`, created_at: now });
    return { outcome: keep, total: q.val('SELECT total FROM orders WHERE id=?', [orderId]) };
  });
}

/** For lists: what each order's trial looks like (sizes + whether it still has to be settled). */
export function tryInfoFor(orderIds) {
  const ids = [...new Set(orderIds)].filter(Boolean);
  const out = new Map();
  if (!ids.length) return out;
  const rows = q.all(`SELECT i.order_id, i.try_role, i.size, i.color, i.name_ar, o.try_outcome FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.order_id IN (${ids.map(() => '?').join(',')}) AND i.try_role IS NOT NULL ORDER BY i.id`, ids);
  for (const r of rows) {
    const e = out.get(r.order_id) || { outcome: r.try_outcome || null, name: r.name_ar };
    e[r.try_role] = { size: r.size, color: r.color };
    out.set(r.order_id, e);
  }
  return out;
}
