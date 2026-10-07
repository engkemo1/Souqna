import { buildTheme } from '@souqna/shared';
import { q, json } from '../db/index.js';
import { mediaMap, getMedia, serializeMedia } from './media.js';

export const bi = (row, field) => ({ ar: row[`${field}_ar`] ?? '', en: row[`${field}_en`] ?? '' });

export function serializeStore(s, { withTheme = true } = {}) {
  const media = mediaMap([s.logo_media_id, s.cover_media_id]);
  const out = {
    id: s.id,
    slug: s.slug,
    code: s.code,
    name: bi(s, 'name'),
    tagline: bi(s, 'tagline'),
    description: bi(s, 'description'),
    address: bi(s, 'address'),
    category: s.category,
    city: s.city,
    phone: s.phone,
    whatsapp: s.whatsapp,
    instagram: s.instagram,
    facebook: s.facebook,
    logo: media.get(s.logo_media_id) || null,
    cover: media.get(s.cover_media_id) || null,
    rating: s.rating,
    ratingCount: s.rating_count,
    featured: !!s.featured,
    offerBadge: s.offer_badge_ar || s.offer_badge_en ? bi(s, 'offer_badge') : null,
    shippingFee: s.shipping_fee,
    freeShippingOver: s.free_shipping_over,
    productCount: s.product_count ?? undefined,
  };
  if (withTheme) {
    const t = buildTheme(json(s.theme_json, {}));
    out.theme = { input: t.input, cssVars: t.cssVars, dark: t.dark };
  }
  return out;
}

export function stockStatus(p) {
  if (!p.track_stock) return 'in';
  if (p.stock <= 0) return 'out';
  if (p.stock <= p.low_stock_at) return 'low';
  return 'in';
}

const NEW_DAYS = 21;
export function isNew(p) {
  if (p.is_new) return true;
  return Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime() < NEW_DAYS * 864e5;
}

/** Product cards for grids — 2 images (primary + hover), batched. */
export function serializeCards(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const pm = q.all(
    `SELECT product_id, media_id, is_primary, position FROM product_media
     WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY product_id, is_primary DESC, position`,
    ids,
  );
  const byProduct = new Map();
  for (const r of pm) {
    const list = byProduct.get(r.product_id) || [];
    if (list.length < 2) list.push(r.media_id);
    byProduct.set(r.product_id, list);
  }
  const media = mediaMap(pm.map((r) => r.media_id));
  return rows.map((p) => {
    const images = (byProduct.get(p.id) || []).map((id) => media.get(id)).filter(Boolean);
    return {
      id: p.id,
      slug: p.slug,
      name: bi(p, 'name'),
      price: p.price,
      compareAt: p.compare_at_price && p.compare_at_price > p.price ? p.compare_at_price : null,
      discount: p.compare_at_price > p.price ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0,
      image: images[0] || null,
      hoverImage: images[1] || null,
      colors: json(p.colors_json, []),
      isNew: isNew(p),
      stock: stockStatus(p),
      rating: p.rating,
      ratingCount: p.rating_count,
      categoryId: p.category_id,
    };
  });
}

export function serializeProductDetail(p) {
  const media = q
    .all('SELECT m.*, pm.is_primary, pm.position FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=? ORDER BY pm.is_primary DESC, pm.position', [p.id])
    .map((m) => ({ ...serializeMedia(m), primary: !!m.is_primary }));
  const variants = q.all('SELECT id, color, size, sku, stock FROM variants WHERE product_id=? ORDER BY id', [p.id]);
  const category = p.category_id ? q.get('SELECT id, slug, name_ar, name_en FROM categories WHERE id=?', [p.category_id]) : null;
  const [card] = serializeCards([p]);
  return {
    ...card,
    description: bi(p, 'description'),
    sku: p.sku,
    media,
    sizes: json(p.sizes_json, []),
    variants,
    trackStock: !!p.track_stock,
    stockCount: p.stock,
    lowStockAt: p.low_stock_at,
    category: category ? { id: category.id, slug: category.slug, name: bi(category, 'name') } : null,
    seo: { title: p.seo_title, description: p.seo_description },
  };
}

export function serializeCategory(c) {
  return { id: c.id, slug: c.slug, name: bi(c, 'name'), image: c.media_id ? serializeMedia(getMedia(c.media_id)) : null, count: c.count ?? undefined, sort: c.sort };
}

export function serializeBanner(b, media) {
  return {
    id: b.id,
    image: media.get(b.media_id) || null,
    mobileImage: media.get(b.mobile_media_id) || null,
    eyebrow: bi(b, 'eyebrow'),
    title: bi(b, 'title'),
    subtitle: bi(b, 'subtitle'),
    cta: bi(b, 'cta'),
    link: b.link,
    align: b.align,
    tone: b.tone,
    mirrorRtl: !!b.mirror_rtl,
    position: b.position,
    active: !!b.active,
  };
}

export function serializeOffer(o) {
  return {
    id: o.id, type: o.type, code: o.code, title: bi(o, 'title'), value: o.value, minSubtotal: o.min_subtotal,
    startsAt: o.starts_at, endsAt: o.ends_at, usageLimit: o.usage_limit, usageCount: o.usage_count, active: !!o.active,
  };
}
