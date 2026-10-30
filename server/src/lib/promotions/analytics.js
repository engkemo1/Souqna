import { q } from '../../db/index.js';
import { cairoStamp } from './store.js';

/**
 * Offer performance for one store. Definitions (shown to merchants too):
 *  views      - impressions: one per visitor session per offer (NOT a purchase; a visitor who only looked counts here)
 *  orders     - distinct non-cancelled orders that actually received the offer (a conversion)
 *  uses       - how many times the rule fired inside those orders (Buy 2 Get 1 on 6 items = 2 uses)
 *  revenue    - items revenue AFTER every discount of the orders that used the offer (shipping excluded), minus what was refunded on returns
 *  discount   - money given away by the offer (sum of order_promotions.discount)
 *  giftCost   - cost of the gifts handed out (product cost when known, otherwise its price)
 */
export function promotionAnalytics(storeId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400_000);
  const sinceDay = cairoStamp(since).date;
  const sinceTs = since.toISOString().slice(0, 19).replace('T', ' ');
  const rows = q.all('SELECT id, name_ar, name_en, status FROM promotions WHERE store_id=?', [storeId]);
  const views = new Map(q.all('SELECT promotion_id AS id, SUM(views) AS n FROM promotion_views WHERE day>=? AND promotion_id IN (SELECT id FROM promotions WHERE store_id=?) GROUP BY promotion_id', [sinceDay, storeId]).map((r) => [r.id, r.n]));
  const base = `FROM order_promotions op JOIN orders o ON o.id=op.order_id WHERE op.store_id=? AND o.status<>'cancelled' AND o.created_at>=?`;
  const used = q.all(`SELECT op.promotion_id AS id, COUNT(DISTINCT op.order_id) AS orders, SUM(op.applications) AS uses, SUM(op.discount) AS discount ${base} GROUP BY op.promotion_id`, [storeId, sinceTs]);
  const byPromo = new Map(used.map((r) => [r.id, r]));
  // revenue per offer: each order counted once per offer it used
  const revenue = new Map(q.all(`SELECT op.promotion_id AS id, SUM(o.subtotal - o.discount) AS rev ${base} GROUP BY op.promotion_id`, [storeId, sinceTs]).map((r) => [r.id, r.rev || 0]));
  const refunds = new Map(q.all(`SELECT op.promotion_id AS id, COALESCE(SUM(r.refund),0) AS ref FROM order_promotions op JOIN orders o ON o.id=op.order_id JOIN order_returns r ON r.order_id=o.id
    WHERE op.store_id=? AND o.status<>'cancelled' AND o.created_at>=? GROUP BY op.promotion_id`, [storeId, sinceTs]).map((r) => [r.id, r.ref]));
  const gifts = new Map(q.all(`SELECT i.promotion_id AS id, SUM(i.qty * COALESCE(p.cost, p.price, 0)) AS cost FROM order_items i JOIN orders o ON o.id=i.order_id LEFT JOIN products p ON p.id=i.product_id
    WHERE o.store_id=? AND o.status<>'cancelled' AND o.created_at>=? AND i.is_gift=1 GROUP BY i.promotion_id`, [storeId, sinceTs]).map((r) => [r.id, r.cost || 0]));
  const items = rows.map((p) => {
    const u = byPromo.get(p.id) || {};
    const v = views.get(p.id) || 0; const orders = u.orders || 0;
    return { id: p.id, name: { ar: p.name_ar, en: p.name_en || p.name_ar }, status: p.status, views: v, orders, uses: u.uses || 0, revenue: Math.max(0, (revenue.get(p.id) || 0) - (refunds.get(p.id) || 0)), discountCost: u.discount || 0, giftCost: gifts.get(p.id) || 0, conversion: v > 0 ? Math.round((orders / v) * 1000) / 10 : null };
  }).filter((x) => x.views || x.orders || x.discountCost || x.giftCost).sort((a, b) => b.orders - a.orders || b.views - a.views);
  // totals count each order once, even when several offers applied to it
  const t = q.get(`SELECT COUNT(DISTINCT op.order_id) AS orders, COALESCE(SUM(op.discount),0) AS discount ${base}`, [storeId, sinceTs]);
  const tr = q.get(`SELECT COALESCE(SUM(o.subtotal - o.discount),0) AS rev FROM orders o WHERE o.store_id=? AND o.status<>'cancelled' AND o.created_at>=? AND o.id IN (SELECT order_id FROM order_promotions WHERE store_id=?)`, [storeId, sinceTs, storeId]);
  const tref = q.val(`SELECT COALESCE(SUM(r.refund),0) FROM order_returns r JOIN orders o ON o.id=r.order_id WHERE o.store_id=? AND o.status<>'cancelled' AND o.created_at>=? AND o.id IN (SELECT order_id FROM order_promotions WHERE store_id=?)`, [storeId, sinceTs, storeId]) || 0;
  const totalViews = [...views.values()].reduce((a, b) => a + b, 0);
  return {
    days,
    totals: { views: totalViews, orders: t.orders || 0, revenue: Math.max(0, (tr.rev || 0) - tref), discountCost: t.discount || 0, giftCost: [...gifts.values()].reduce((a, b) => a + b, 0), conversion: totalViews > 0 ? Math.round(((t.orders || 0) / totalViews) * 1000) / 10 : null },
    items,
  };
}
