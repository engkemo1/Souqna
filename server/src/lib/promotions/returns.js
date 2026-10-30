/**
 * Partial-return refund policy (pure calculation, never touches the order's saved totals).
 *
 * What the customer keeps decides what they are still entitled to:
 *   1. The offers that applied to the ORIGINAL order are re-evaluated on the units the customer KEEPS, with the definitions
 *      snapshotted on the order (so later edits of the offer change nothing). A benefit that is no longer earned is removed.
 *   2. The original coupon discount follows the kept goods (same coupon rate on what is kept, never more than the original amount).
 *   3. A free gift the customer keeps but no longer earns is charged back at its catalogue price.
 *   4. cost of kept goods = kept subtotal - offers still earned - coupon on kept goods  (+ unearned gifts)
 *      refunded so far + this refund = amount paid for goods - cost of kept goods     (floored at 0, never above what was paid)
 * Refunding is cumulative, so any order of partial returns lands on the same total and the total can never exceed what was paid.
 */
import { q } from '../../db/index.js';
import { evaluateCart } from './engine.js';
import { categoryChains, parseRow } from './store.js';
import { giftIdsOf } from './definition.js';

const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** largest-remainder split of `total` over integer weights (exact, deterministic) */
export function splitExact(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const parts = weights.map((w, i) => { const x = (total * w) / sum; return { i, base: Math.floor(x), frac: x - Math.floor(x) }; });
  let left = total - parts.reduce((a, p) => a + p.base, 0);
  for (const p of [...parts].sort((a, b) => b.frac - a.frac || a.i - b.i)) { if (left <= 0) break; if (weights[p.i] > 0) { p.base += 1; left -= 1; } }
  return parts.map((p) => p.base);
}

/** The offers of the order with the definition each one was sold under (snapshot first, current definition as a fallback for older orders). */
function orderOffers(order) {
  const rows = q.all('SELECT * FROM order_promotions WHERE order_id=? ORDER BY id', [order.id]);
  const offers = []; let mode = 'snapshot';
  for (const r of rows) {
    const snap = json(r.snapshot_json, null);
    if (snap?.def) { offers.push({ id: r.promotion_id ?? -r.id, name_ar: r.name_ar, name_en: r.name_en, priority: snap.priority || 0, stacking: snap.stacking || 'per_product', def: snap.def }); continue; }
    const cur = r.promotion_id ? parseRow(q.get('SELECT * FROM promotions WHERE id=? AND store_id=?', [r.promotion_id, order.store_id])) : null;
    if (!cur?.def) return null; // cannot be re-evaluated safely
    mode = 'current_definition';
    offers.push({ id: cur.id, name_ar: r.name_ar, name_en: r.name_en, priority: cur.priority, stacking: cur.stacking, def: cur.def });
  }
  return { offers, mode };
}

/**
 * @param order     orders row
 * @param items     all order_items rows of the order (with returned_qty as saved BEFORE this return)
 * @param request   Map(order_item_id -> qty being returned now)
 * @returns {{ refund, lines:[{itemId, qty, refund}], calc }}
 */
export function computeReturn(order, items, request, { store } = {}) {
  const paid = items.filter((l) => !l.is_gift); const gifts = items.filter((l) => l.is_gift);
  const keptOf = (l) => l.qty - (l.returned_qty || 0) - (request.get(l.id) || 0);
  const refundedBefore = q.val('SELECT COALESCE(SUM(refund),0) FROM order_returns WHERE order_id=?', [order.id]) || 0;
  const itemsPaid = Math.max(0, (order.subtotal || 0) - (order.discount || 0));
  const originalPromo = order.promo_discount || 0; const originalCoupon = Math.max(0, (order.discount || 0) - originalPromo);
  const origNet = paid.reduce((a, l) => a + Math.max(0, l.price * l.qty - (l.promo_discount || 0)), 0);

  const keptSubtotal = paid.reduce((a, l) => a + l.price * keptOf(l), 0);
  const keptReturnedAll = paid.every((l) => keptOf(l) === 0);
  const offerInfo = orderOffers(order);
  const base = { itemsPaid, originalPromo, originalCoupon, refundedBefore, keptSubtotal };

  let newPromo = 0; let appliedAfter = []; let entitled = new Map(); let mode;
  if (offerInfo) {
    mode = offerInfo.mode;
    if (offerInfo.offers.length && !keptReturnedAll) {
      const chains = categoryChains(order.store_id);
      const lines = []; let k = 0;
      for (const l of paid) {
        const qty = keptOf(l); if (qty <= 0) continue;
        const p = l.product_id ? q.get('SELECT category_id, exclude_from_promotions FROM products WHERE id=?', [l.product_id]) : null;
        lines.push({ key: k++, productId: l.product_id, variantId: l.variant_id, price: l.price, qty, catChain: p?.category_id ? chains.get(p.category_id) || [p.category_id] : [], excluded: !!p?.exclude_from_promotions });
      }
      const giftStock = new Map(offerInfo.offers.flatMap((o) => giftIdsOf(o.def)).map((id) => [id, 9999]));
      const selections = {}; for (const g of gifts) if (g.promotion_id) selections[g.promotion_id] = g.product_id;
      const res = evaluateCart({ lines, promotions: offerInfo.offers.map((o) => ({ id: o.id, priority: o.priority, stacking: o.stacking, def: o.def })), settings: { resolution: store?.promo_resolution === 'priority' ? 'priority' : 'best_savings', maxPerCart: store?.promo_max_per_cart || null }, giftStock, selections });
      newPromo = res.promoDiscount;
      appliedAfter = res.applied.map((a) => a.id);
      for (const a of res.applied) for (const g of a.gifts) entitled.set(g.productId, (entitled.get(g.productId) || 0) + g.qty);
    }
  } else mode = 'legacy_proportional';

  let calc;
  if (mode === 'legacy_proportional') {
    // an order whose offers can no longer be re-evaluated: proportional to what each unit paid (previous behaviour, still never above what was paid)
    const couponTotal = originalCoupon;
    const nets = paid.map((l) => Math.max(0, l.price * l.qty - (l.promo_discount || 0)));
    const cs = splitExact(couponTotal, nets);
    let total = 0;
    paid.forEach((l, i) => { const net = Math.max(0, nets[i] - cs[i]); const after = (l.returned_qty || 0) + (request.get(l.id) || 0); total += Math.round((net * after) / l.qty); });
    const refundTotalAfter = Math.min(itemsPaid, total);
    calc = { ...base, mode, keptPromo: null, promoLost: null, keptCoupon: null, giftClawback: 0, unearnedGifts: [], promotionsAfter: [], refundTotalAfter };
  } else {
    const keptNet = keptSubtotal - newPromo;
    const keptCoupon = origNet > 0 ? Math.min(originalCoupon, Math.round((originalCoupon * keptNet) / origNet)) : 0;
    const keptCost = keptSubtotal - newPromo - keptCoupon;
    // offers earned on the originally bought units that these kept units carried vs. what they still earn
    const originalPromoOnKept = paid.reduce((a, l) => a + Math.round(((l.promo_discount || 0) * keptOf(l)) / l.qty), 0);
    // gifts kept but no longer earned
    const unearned = []; const left = new Map(entitled);
    for (const g of gifts) {
      const kept = keptOf(g); if (kept <= 0) continue;
      const have = left.get(g.product_id) || 0; const ok = Math.min(have, kept); left.set(g.product_id, have - ok);
      const bad = kept - ok;
      if (bad > 0) { const unit = (g.product_id && q.val('SELECT price FROM products WHERE id=?', [g.product_id])) || 0; unearned.push({ itemId: g.id, productId: g.product_id, qty: bad, unitValue: unit, value: unit * bad }); }
    }
    const giftClawback = unearned.reduce((a, g) => a + g.value, 0);
    const refundTotalAfter = Math.max(0, Math.min(itemsPaid, itemsPaid - keptCost - giftClawback));
    calc = { ...base, mode, keptPromo: newPromo, promoLost: Math.max(0, originalPromoOnKept - newPromo), keptCoupon, giftClawback, unearnedGifts: unearned, promotionsAfter: appliedAfter, keptCost, refundTotalAfter };
  }

  const refund = Math.max(0, calc.refundTotalAfter - refundedBefore);
  // spread this refund over the returned lines in proportion to what each of them paid (gifts weigh 0 unless only gifts come back)
  const reqs = [...request.entries()].map(([id, qty]) => ({ l: items.find((x) => x.id === id), qty })).filter((x) => x.l);
  let weights = reqs.map(({ l, qty }) => (l.is_gift ? 0 : Math.round((Math.max(0, l.price * l.qty - (l.promo_discount || 0)) * qty) / l.qty)));
  if (!weights.some((w) => w > 0)) weights = reqs.map(({ qty }) => qty);
  const shares = splitExact(refund, weights);
  const lines = reqs.map(({ l, qty }, i) => ({ itemId: l.id, qty, refund: shares[i], gift: !!l.is_gift }));
  calc = { ...calc, refund, rule: 'refund = paid for goods - (kept goods - offers still earned - coupon on kept goods) - unearned gifts, minus refunded before; floored at 0 and capped at what was paid' };
  return { refund, lines, calc };
}
