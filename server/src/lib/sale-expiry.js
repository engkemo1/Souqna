/**
 * Timed discounts. A product on sale has price (the sale price) and compare_at_price (the old price); the owner may also give
 * sale_ends_at (ms). When that moment passes the price goes back to compare_at_price and the discount is cleared, so every other
 * part of the system (cart, orders, search, rails) keeps working with plain prices and never needs to know about timers.
 */
import { q } from '../db/index.js';

export function expireSales(now = Date.now()) {
  const r = q.run("UPDATE products SET price=compare_at_price, compare_at_price=NULL, sale_ends_at=NULL, updated_at=datetime('now') WHERE sale_ends_at IS NOT NULL AND sale_ends_at<=? AND compare_at_price IS NOT NULL AND compare_at_price>price", [now]);
  // an end date left on a product that is no longer discounted is just stale
  q.run('UPDATE products SET sale_ends_at=NULL WHERE sale_ends_at IS NOT NULL AND sale_ends_at<=? AND (compare_at_price IS NULL OR compare_at_price<=price)', [now]);
  if (r.changes) { import('./stylist.js').then((m) => m.invalidateModaCatalogue()).catch(() => {}); console.log(`[sale] ${r.changes} timed discount(s) ended`); }
  return r.changes;
}

export function startSaleExpiry() {
  const run = () => { try { expireSales(); } catch (e) { console.error(`[sale] expiry sweep failed: ${e.message}`); } };
  run();
  setInterval(run, 60e3).unref?.();
}
