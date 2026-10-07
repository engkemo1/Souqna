import { q } from '../db/index.js';
import { badRequest } from './errors.js';
import { bi } from './serialize.js';

const today = () => new Date().toISOString().slice(0, 10);

export function findCoupon(storeId, code) {
  if (!code) return null;
  const o = q.get('SELECT * FROM offers WHERE store_id=? AND UPPER(code)=UPPER(?) AND active=1', [storeId, String(code).trim()]);
  if (!o) return { error: 'coupon_invalid' };
  const d = today();
  if (o.starts_at && o.starts_at > d) return { error: 'coupon_not_started' };
  if (o.ends_at && o.ends_at < d) return { error: 'coupon_expired' };
  if (o.usage_limit && o.usage_count >= o.usage_limit) return { error: 'coupon_used_up' };
  return { offer: o };
}

/**
 * Prices are always re-read from the database — the client only sends ids & quantities.
 * Returns a quote with per-line availability so the cart UI can explain problems.
 */
export function quote(store, items = [], couponCode) {
  if (!Array.isArray(items) || !items.length) throw badRequest('cart_empty', 'Your cart is empty.');
  const lines = [];
  for (const it of items.slice(0, 50)) {
    const qty = Math.max(1, Math.min(20, Number.parseInt(it.qty, 10) || 1));
    const p = q.get("SELECT * FROM products WHERE id=? AND store_id=? AND status='active'", [it.productId, store.id]);
    if (!p) { lines.push({ ...it, qty, available: 0, error: 'unavailable' }); continue; }
    let available = p.track_stock ? p.stock : 99;
    let variant = null;
    if (it.variantId) {
      variant = q.get('SELECT * FROM variants WHERE id=? AND product_id=?', [it.variantId, p.id]);
      if (!variant) { lines.push({ ...it, qty, available: 0, error: 'unavailable' }); continue; }
      available = p.track_stock ? variant.stock : 99;
    }
    const mediaId = q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [p.id]);
    lines.push({
      productId: p.id,
      variantId: variant?.id ?? null,
      name: bi(p, 'name'),
      price: p.price,
      color: variant?.color ?? null,
      size: variant?.size ?? null,
      qty,
      available,
      mediaId,
      error: available <= 0 ? 'out_of_stock' : qty > available ? 'insufficient_stock' : null,
    });
  }
  const subtotal = lines.filter((l) => !l.error).reduce((s, l) => s + l.price * l.qty, 0);

  let discount = 0;
  let freeShipping = subtotal >= store.free_shipping_over;
  let coupon = null;
  let couponError = null;
  if (couponCode) {
    const r = findCoupon(store.id, couponCode);
    if (r.error) couponError = r.error;
    else if (subtotal < r.offer.min_subtotal) couponError = 'coupon_min_subtotal';
    else {
      const o = r.offer;
      if (o.type === 'percentage') discount = Math.round((subtotal * o.value) / 100);
      if (o.type === 'fixed') discount = Math.min(subtotal, o.value);
      if (o.type === 'free_shipping') freeShipping = true;
      coupon = { code: o.code, type: o.type, value: o.value, title: bi(o, 'title'), minSubtotal: o.min_subtotal, id: o.id };
    }
  }
  const shipping = freeShipping || subtotal === 0 ? 0 : store.shipping_fee;
  return {
    lines,
    subtotal,
    discount,
    shipping,
    total: Math.max(0, subtotal - discount + shipping),
    coupon,
    couponError,
    couponMinSubtotal: couponError === 'coupon_min_subtotal' ? findCoupon(store.id, couponCode)?.offer?.min_subtotal : undefined,
    freeShippingOver: store.free_shipping_over,
    hasErrors: lines.some((l) => l.error),
  };
}
