import { q } from '../db/index.js';

/** Re-derive the product (and store) rating from published reviews. Products/stores without any keep their seeded value. */
export function recomputeRatings(productId, storeId) {
  const p = q.get("SELECT COUNT(*) AS n, AVG(rating) AS a FROM reviews WHERE product_id=? AND status='published'", [productId]);
  if (p.n) q.run('UPDATE products SET rating=?, rating_count=? WHERE id=?', [Math.round(p.a * 10) / 10, p.n, productId]);
  else q.run('UPDATE products SET rating=0, rating_count=0 WHERE id=?', [productId]);
  const s = q.get("SELECT COUNT(*) AS n, AVG(rating) AS a FROM reviews WHERE store_id=? AND status='published'", [storeId]);
  if (s.n) q.run('UPDATE stores SET rating=?, rating_count=? WHERE id=?', [Math.round(s.a * 10) / 10, s.n, storeId]);
}
