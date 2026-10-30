/** Customer-facing read model for offers: what the storefront may show. Never used for pricing (that is the engine's job). */
import { q } from '../../db/index.js';
import { bi } from '../serialize.js';
import { eligiblePromotions, categoryChains, promotionsForProduct, resolveProductIds, cairoStamp } from './store.js';
import { describePromotion } from './describe.js';
import { resolveOfferImage } from './templates.js';

const shape = (row, productIds) => ({
  id: row.id, name: bi(row, 'name'), description: bi(row, 'description'), type: row.type, templateKey: row.template_key || row.type,
  imageMode: row.image_mode, imageMediaId: row.image_mode === 'custom' ? row.image_media_id ?? null : null,
  imageResolved: resolveOfferImage(row, productIds), text: row.def ? describePromotion(row.def) : null, def: row.def,
  endsAt: row.ends_at || null, dailyTo: row.daily_to || null, productCount: productIds.length,
});

/** Offers a visitor of this store can see right now (audience-restricted offers are shown only inside the cart, once the phone is known). */
export function liveOffers(storeId) {
  return eligiblePromotions(storeId, {}).filter((p) => p.audience === 'all').sort((a, b) => b.priority - a.priority || b.id - a.id);
}

export function storeOffers(storeId) {
  return liveOffers(storeId).map((p) => shape(p, resolveProductIds(storeId, p.def)));
}

export function productOffers(storeId, productId) {
  const live = new Map(liveOffers(storeId).map((p) => [p.id, p]));
  return promotionsForProduct(storeId, productId)
    .filter((p) => live.has(p.id) && p.def && !p.def.exclude.all)
    .map((p) => shape(live.get(p.id), resolveProductIds(storeId, p.def)));
}

/** {productId -> {id, headline}} for the cards of one store: the first live offer whose qualifying selector covers the product. */
export function offerBadges(storeId, productIds) {
  if (!productIds.length) return new Map();
  const offers = liveOffers(storeId).filter((p) => p.def);
  if (!offers.length) return new Map();
  const chains = categoryChains(storeId);
  const prods = q.all(`SELECT id, category_id, exclude_from_promotions FROM products WHERE store_id=? AND id IN (${productIds.map(() => '?').join(',')})`, [storeId, ...productIds]);
  const out = new Map();
  for (const pr of prods) {
    if (pr.exclude_from_promotions) continue;
    const chain = pr.category_id ? chains.get(pr.category_id) || [pr.category_id] : [];
    for (const o of offers) {
      const d = o.def; const s = d.qualify;
      const hit = s.all || s.products.includes(pr.id) || chain.some((c) => s.categories.includes(c));
      const ex = d.exclude.all || d.exclude.products.includes(pr.id) || chain.some((c) => d.exclude.categories.includes(c));
      if (hit && !ex) { out.set(pr.id, { id: o.id, name: bi(o, 'name'), headline: describePromotion(d).headline, type: o.type, def: d }); break; }
    }
  }
  return out;
}

/** Daily impression counter (aggregate only, no visitor identifiers). */
export function countView(storeId, promotionId) {
  if (!q.get('SELECT id FROM promotions WHERE id=? AND store_id=?', [promotionId, storeId])) return false;
  const day = cairoStamp().stamp.slice(0, 10);
  q.run('INSERT INTO promotion_views(promotion_id, day, views) VALUES (?,?,1) ON CONFLICT(promotion_id, day) DO UPDATE SET views=views+1', [promotionId, day]);
  return true;
}
