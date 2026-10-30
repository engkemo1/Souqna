import { q } from '../db/index.js';
import { badRequest } from './errors.js';
import { bi } from './serialize.js';
import { evaluateCart } from './promotions/engine.js';
import { eligiblePromotions, categoryChains } from './promotions/store.js';
import { giftIdsOf } from './promotions/definition.js';
import { describePromotion, hintText } from './promotions/describe.js';

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

const dayOk = (o, d) => (o.starts_at && o.starts_at > d ? 'coupon_not_started' : o.ends_at && o.ends_at < d ? 'coupon_expired' : o.usage_limit && o.usage_count >= o.usage_limit ? 'coupon_used_up' : null);
const normPhone = (v) => String(v || '').replace(/\D/g, '');

/** Platform-wide coupon (funded by Twist). `phone` is optional while browsing; it is enforced when the order is placed. */
export function findPlatformCoupon(code, phone) {
  if (!code) return null;
  const o = q.get('SELECT * FROM platform_coupons WHERE UPPER(code)=UPPER(?) AND active=1', [String(code).trim()]);
  if (!o) return { error: 'coupon_invalid' };
  const err = dayOk(o, today());
  if (err) return { error: err };
  const ph = normPhone(phone);
  if (ph) {
    const prior = q.val("SELECT COUNT(*) FROM orders WHERE phone=? AND status<>'cancelled'", [ph]);
    if (o.first_order_only && prior > 0) return { error: 'coupon_first_order_only' };
    const used = q.val("SELECT COUNT(*) FROM orders WHERE phone=? AND UPPER(coupon_code)=UPPER(?) AND status<>'cancelled'", [ph, o.code]);
    if (used >= (o.per_phone_limit || 1)) return { error: 'coupon_already_used' };
  }
  return { offer: o, platform: true };
}

/**
 * Prices are always re-read from the database — the client only sends ids & quantities.
 * Returns a quote with per-line availability so the cart UI can explain problems.
 */
export function quote(store, items = [], couponCode, { phone, giftChoices } = {}) {
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
      categoryId: p.category_id ?? null,
      excludedFromPromos: !!p.exclude_from_promotions,
      error: available <= 0 ? 'out_of_stock' : qty > available ? 'insufficient_stock' : null,
    });
  }
  const paid = lines.filter((l) => !l.error);
  const subtotal = paid.reduce((s, l) => s + l.price * l.qty, 0);

  /* ---- store promotions (server-side, from the database only) ---- */
  const promo = applyPromotions(store, lines, paid, { phone, giftChoices });
  const promoDiscount = promo.discount;
  const payable = subtotal - promoDiscount;

  let discount = 0;
  let freeShipping = store.free_shipping_over > 0 && subtotal >= store.free_shipping_over;
  let coupon = null;
  let couponError = null;
  let platformDiscount = 0;
  if (couponCode) {
    let r = findCoupon(store.id, couponCode);
    if (r.error === 'coupon_invalid') r = findPlatformCoupon(couponCode, phone); // not a store code → try a Twist code
    if (r.error) couponError = r.error;
    else if (promo.blocksCoupons) couponError = 'coupon_not_combinable';
    else if (payable < r.offer.min_subtotal) couponError = 'coupon_min_subtotal';
    else {
      const o = r.offer;
      const alreadyFree = freeShipping;
      if (o.type === 'percentage') { discount = Math.round((payable * o.value) / 100); if (o.max_discount) discount = Math.min(discount, o.max_discount); }
      if (o.type === 'fixed') discount = Math.min(payable, o.value);
      if (o.type === 'free_shipping') freeShipping = true;
      coupon = { code: o.code, type: o.type, value: o.value, title: bi(o, 'title'), minSubtotal: o.min_subtotal, id: o.id, source: r.platform ? 'platform' : 'store' };
      if (r.platform) platformDiscount = discount + (o.type === 'free_shipping' && !alreadyFree && payable > 0 ? store.shipping_fee : 0);
    }
  }
  const couponDiscount = discount;
  discount += promoDiscount;
  const shipping = freeShipping || subtotal === 0 ? 0 : store.shipping_fee;
  return {
    lines: promo.lines,
    subtotal,
    discount,
    promoDiscount,
    couponDiscount,
    promotions: promo.applied,
    promoHints: promo.hints,
    shipping,
    total: Math.max(0, subtotal - discount + shipping),
    coupon,
    couponError,
    platformDiscount,
    couponMinSubtotal: couponError === 'coupon_min_subtotal' ? (findCoupon(store.id, couponCode)?.offer || findPlatformCoupon(couponCode, phone)?.offer)?.min_subtotal : undefined,
    freeShippingOver: store.free_shipping_over,
    hasErrors: lines.some((l) => l.error),
    appliedPromos: promo.records,
  };
}

/**
 * Run the promotions engine over the valid lines and return: lines decorated with per-line discount + free-gift lines,
 * the applied offers (customer-facing), progress hints, and `records` (what the order persists).
 */
function applyPromotions(store, lines, paid, { phone, giftChoices } = {}) {
  const none = { discount: 0, applied: [], hints: [], records: [], blocksCoupons: false, lines: lines.map((l) => ({ ...l, promoDiscount: 0, lineTotal: l.error ? 0 : l.price * l.qty })) };
  if (!paid.length) return none;
  const promos = eligiblePromotions(store.id, { phone });
  if (!promos.length) return none;
  const chains = categoryChains(store.id);
  const engineLines = paid.map((l, i) => ({ key: i, productId: l.productId, variantId: l.variantId, price: l.price, qty: l.qty, catChain: l.categoryId ? (chains.get(l.categoryId) || [l.categoryId]) : [], excluded: l.excludedFromPromos }));

  // gifts: what can actually be handed out (active, in stock after what the shopper already holds)
  const cartQty = new Map();
  for (const l of paid) cartQty.set(`${l.productId}:${l.variantId ?? ''}`, (cartQty.get(`${l.productId}:${l.variantId ?? ''}`) || 0) + l.qty);
  const giftInfo = new Map(); const giftStock = new Map();
  for (const id of new Set(promos.flatMap((p) => (p.def ? giftIdsOf(p.def) : [])))) {
    const g = q.get("SELECT * FROM products WHERE id=? AND store_id=? AND status='active'", [id, store.id]);
    if (!g) continue;
    const variants = q.all('SELECT * FROM variants WHERE product_id=? ORDER BY id', [g.id]);
    let variant = null; let avail = g.track_stock ? g.stock : 99;
    if (variants.length) {
      const pick = variants.map((v) => ({ v, free: (g.track_stock ? v.stock : 99) - (cartQty.get(`${g.id}:${v.id}`) || 0) })).sort((a, b) => b.free - a.free)[0];
      variant = pick.v; avail = pick.free;
    } else avail -= cartQty.get(`${g.id}:`) || 0;
    if (avail > 0) { giftInfo.set(id, { p: g, variant, avail }); giftStock.set(id, avail); }
  }

  const res = evaluateCart({
    lines: engineLines, promotions: promos.map((p) => ({ id: p.id, priority: p.priority, stacking: p.stacking, def: p.def })),
    settings: { resolution: store.promo_resolution === 'priority' ? 'priority' : 'best_savings', maxPerCart: store.promo_max_per_cart || null },
    giftStock, selections: giftChoices || {},
  });
  const byId = new Map(promos.map((p) => [p.id, p]));

  const out = lines.map((l) => ({ ...l, promoDiscount: 0, lineTotal: l.error ? 0 : l.price * l.qty }));
  paid.forEach((l, i) => { const o = out[lines.indexOf(l)]; o.promoDiscount = res.lines[i].promoDiscount; o.lineTotal = l.price * l.qty - o.promoDiscount; o.promotionIds = res.lines[i].promotions.map((x) => x.id); });

  // free gift lines
  const records = []; const applied = [];
  for (const a of res.applied) {
    const p = byId.get(a.id);
    const gifts = []; let giftOptions = [];
    for (const g of a.gifts) {
      giftOptions = (g.options || []).map((id) => giftInfo.get(id)).filter(Boolean).map((x) => ({ productId: x.p.id, name: bi(x.p, 'name') }));
      const gi = giftInfo.get(g.productId); if (!gi) continue;
      const qty = Math.min(g.qty, gi.avail); if (qty <= 0) continue;
      gi.avail -= qty;
      const mediaId = q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [gi.p.id]);
      out.push({ productId: gi.p.id, variantId: gi.variant?.id ?? null, name: bi(gi.p, 'name'), price: 0, listPrice: gi.p.price, color: gi.variant?.color ?? null, size: gi.variant?.size ?? null, qty, available: gi.avail + qty, mediaId, error: null, gift: true, promotionId: p.id, promoDiscount: 0, lineTotal: 0, giftOptions: g.options });
      gifts.push({ productId: gi.p.id, qty, name: bi(gi.p, 'name') });
    }
    if (!a.discount && !gifts.length) continue;
    const text = describePromotion(p.def);
    applied.push({ id: p.id, name: bi(p, 'name'), type: p.type, discount: a.discount, applications: a.applications, headline: text.headline, gifts, giftOptions: giftOptions.length > 1 ? giftOptions : [], imageMediaId: p.image_media_id ?? null });
    records.push({ promotionId: p.id, name_ar: p.name_ar, name_en: p.name_en, type: p.type, discount: a.discount, applications: a.applications, gifts, def: p.def, stacking: p.stacking, priority: p.priority });
  }
  const hints = res.hints.map((h) => { const p = byId.get(h.promotionId); return { ...h, promotionName: bi(p, 'name'), text: hintText(h, p.def) }; });
  const blocksCoupons = records.some((r) => !byId.get(r.promotionId).stack_with_coupons);
  return { discount: res.promoDiscount, applied, hints, records, blocksCoupons, lines: out };
}
