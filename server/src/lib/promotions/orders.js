import { insert, q } from '../../db/index.js';

/** Snapshot the promotions an order received (called inside the order transaction, right after the order row is inserted). */
export function recordOrderPromotions(orderId, storeId, qt, now) {
  for (const r of qt.appliedPromos || []) {
    insert('order_promotions', {
      order_id: orderId, promotion_id: r.promotionId, store_id: storeId, name_ar: r.name_ar, name_en: r.name_en || null, type: r.type,
      discount: r.discount, applications: r.applications, detail_json: JSON.stringify({ gifts: r.gifts }), snapshot_json: r.def ? JSON.stringify({ def: r.def, stacking: r.stacking, priority: r.priority }) : null, created_at: now,
    });
  }
}

/** order_items columns that come from the quote line (promotion share + gift flag). */
export const promoItemCols = (l) => ({ promo_discount: l.promoDiscount || 0, is_gift: l.gift ? 1 : 0, promotion_id: l.promotionId ?? (l.promotionIds?.[0] ?? null) });

/** What an order received, as the customer / owner sees it (from the snapshot, so later edits to the offer change nothing). */
export function orderPromotions(orderId) {
  return q.all('SELECT promotion_id, name_ar, name_en, type, discount, applications FROM order_promotions WHERE order_id=? ORDER BY id', [orderId])
    .map((r) => ({ id: r.promotion_id, name: { ar: r.name_ar, en: r.name_en || r.name_ar }, type: r.type, discount: r.discount, applications: r.applications }));
}
