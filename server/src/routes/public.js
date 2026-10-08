import { Router } from 'express';
import { z } from 'zod';
import { q, tx, insert } from '../db/index.js';
import { h, notFound, AppError } from '../lib/errors.js';
import { clampInt, nowIso } from '../lib/util.js';
import { mediaMap } from '../lib/media.js';
import { quote } from '../lib/cart.js';
import { sendNewOrderAlert } from '../lib/whatsapp.js';
import {
  serializeStore, serializeCards, serializeProductDetail, serializeCategory, serializeBanner, serializeOffer, bi,
} from '../lib/serialize.js';

const r = Router();

const cache = (res, seconds = 30) => res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);

const ACTIVE = "status='active'";
const STORE_COLS = `s.*, (SELECT COUNT(*) FROM products p WHERE p.store_id=s.id AND p.status='active') AS product_count`;

function loadStore(slug) {
  const s = q.get(`SELECT ${STORE_COLS} FROM stores s WHERE s.slug=? AND s.status='active'`, [slug]);
  if (!s) throw notFound('Store');
  return s;
}

/* ---------------------------------------------------------- marketplace */

r.get('/marketplace', h((req, res) => {
  const { q: term = '', category = '', sort = 'featured' } = req.query;
  const where = ["s.status='active'", 's.hidden=0'];
  const params = [];
  if (category && category !== 'all') { where.push('s.category=?'); params.push(String(category)); }
  if (term) {
    where.push('(s.name_ar LIKE ? OR s.name_en LIKE ? OR s.tagline_ar LIKE ? OR s.tagline_en LIKE ?)');
    const like = `%${String(term).slice(0, 60)}%`;
    params.push(like, like, like, like);
  }
  const order = {
    featured: 's.featured DESC, s.rating DESC',
    rating: 's.rating DESC, s.rating_count DESC',
    newest: 's.created_at DESC',
    products: 'product_count DESC',
  }[sort] || 's.featured DESC, s.rating DESC';
  const rows = q.all(`SELECT ${STORE_COLS} FROM stores s WHERE ${where.join(' AND ')} ORDER BY s.sort_order ASC, ${order}`, params);
  const categories = q.all("SELECT category AS id, COUNT(*) AS count FROM stores WHERE status='active' AND hidden=0 GROUP BY category ORDER BY count DESC");
  const stats = {
    stores: q.val("SELECT COUNT(*) FROM stores WHERE status='active' AND hidden=0"),
    products: q.val("SELECT COUNT(*) FROM products WHERE status='active'"),
  };
  // A few trending products across stores for the marketplace home
  const trendingRows = q.all(
    `SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en FROM products p JOIN stores s ON s.id=p.store_id
     WHERE p.status='active' AND s.status='active' ORDER BY p.sold_count DESC LIMIT 12`,
  );
  const trending = serializeCards(trendingRows).map((c, i) => ({ ...c, store: { slug: trendingRows[i].store_slug, name: bi(trendingRows[i], 'store_name') } }));
  cache(res, 60);
  res.json({ stores: rows.map((s) => serializeStore(s)), categories, stats, trending });
}));

/* ---------------------------------------------------------- storefront */

r.get('/stores/:slug', h((req, res) => {
  const s = loadStore(req.params.slug);
  const categories = q.all(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status='active') AS count
     FROM categories c WHERE c.store_id=? ORDER BY c.sort, c.id`, [s.id],
  );
  const banners = q.all('SELECT * FROM banners WHERE store_id=? AND active=1 ORDER BY position, id', [s.id]);
  const bm = mediaMap(banners.flatMap((b) => [b.media_id, b.mobile_media_id]));
  const d = new Date().toISOString().slice(0, 10);
  const offers = q.all(
    `SELECT * FROM offers WHERE store_id=? AND active=1 AND code IS NOT NULL
     AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) ORDER BY value DESC LIMIT 3`, [s.id, d, d],
  );
  cache(res, 30);
  res.json({
    store: serializeStore(s),
    categories: categories.map(serializeCategory),
    banners: banners.map((b) => serializeBanner(b, bm)),
    offers: offers.map(serializeOffer),
  });
}));

r.get('/stores/:slug/home', h((req, res) => {
  const s = loadStore(req.params.slug);
  const sec = (order, extra = '') => serializeCards(q.all(`SELECT * FROM products WHERE store_id=? AND ${ACTIVE} ${extra} ORDER BY ${order} LIMIT 8`, [s.id]));
  cache(res, 30);
  res.json({
    newArrivals: sec('created_at DESC'),
    bestSellers: sec('sold_count DESC'),
    onSale: sec('(1.0*price/compare_at_price) ASC', 'AND compare_at_price > price'),
    featured: sec('sold_count DESC', 'AND featured=1'),
  });
}));

r.get('/stores/:slug/products', h((req, res) => {
  const s = loadStore(req.params.slug);
  const { category, q: term, sort = 'featured', sale, sizes, colors, min, max, ids } = req.query;
  const where = ['p.store_id=?', "p.status='active'"];
  const params = [s.id];
  if (ids) {
    const list = String(ids).split(',').map(Number).filter(Boolean).slice(0, 100);
    if (!list.length) return res.json({ items: [], total: 0, page: 1, pages: 1 });
    where.push(`p.id IN (${list.map(() => '?').join(',')})`);
    params.push(...list);
  }
  if (category) {
    where.push('p.category_id = (SELECT id FROM categories WHERE store_id=? AND slug=?)');
    params.push(s.id, String(category));
  }
  if (term) {
    const like = `%${String(term).slice(0, 60)}%`;
    where.push('(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.description_en LIKE ? OR p.description_ar LIKE ?)');
    params.push(like, like, like, like);
  }
  if (sale === '1') where.push('p.compare_at_price > p.price');
  if (min) { where.push('p.price >= ?'); params.push(clampInt(min, 0, 1e7, 0)); }
  if (max) { where.push('p.price <= ?'); params.push(clampInt(max, 0, 1e7, 1e7)); }
  if (sizes) {
    const list = String(sizes).split(',').slice(0, 10);
    where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.stock>0 AND v.size IN (${list.map(() => '?').join(',')}))`);
    params.push(...list);
  }
  if (colors) {
    const list = String(colors).split(',').slice(0, 10).map((c) => c.toUpperCase());
    where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.stock>0 AND UPPER(v.color) IN (${list.map(() => '?').join(',')}))`);
    params.push(...list);
  }
  const order = {
    featured: 'p.featured DESC, p.sold_count DESC',
    newest: 'p.created_at DESC',
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    best: 'p.sold_count DESC',
    discount: '(1.0*p.price/COALESCE(p.compare_at_price,p.price)) ASC',
  }[sort] || 'p.featured DESC, p.sold_count DESC';

  const limit = clampInt(req.query.limit, 1, 48, 24);
  const page = clampInt(req.query.page, 1, 1000, 1);
  const whereSql = where.join(' AND ');
  const total = q.val(`SELECT COUNT(*) FROM products p WHERE ${whereSql}`, params);
  const rows = q.all(`SELECT p.* FROM products p WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);

  // facets for the filter sheet (store-wide, so options don't vanish as you filter)
  const facetSizes = q.all("SELECT DISTINCT v.size FROM variants v JOIN products p ON p.id=v.product_id WHERE p.store_id=? AND p.status='active' AND v.size IS NOT NULL", [s.id]).map((x) => x.size);
  const order6 = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', 'One size'];
  facetSizes.sort((a, b) => order6.indexOf(a) - order6.indexOf(b));
  const colorMap = new Map();
  for (const row of q.all("SELECT colors_json FROM products WHERE store_id=? AND status='active'", [s.id])) {
    for (const c of JSON.parse(row.colors_json || '[]')) if (!colorMap.has(c.hex.toUpperCase())) colorMap.set(c.hex.toUpperCase(), c);
  }
  const price = q.get("SELECT MIN(price) AS min, MAX(price) AS max FROM products WHERE store_id=? AND status='active'", [s.id]);

  cache(res, 20);
  res.json({
    items: serializeCards(rows),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    facets: { sizes: facetSizes, colors: [...colorMap.values()], price },
  });
}));

r.get('/stores/:slug/products/:pslug', h((req, res) => {
  const s = loadStore(req.params.slug);
  const p = q.get("SELECT * FROM products WHERE store_id=? AND slug=? AND status='active'", [s.id, req.params.pslug]);
  if (!p) throw notFound('Product');
  q.run('UPDATE products SET views=views+1 WHERE id=?', [p.id]);
  const related = serializeCards(
    q.all(`SELECT * FROM products WHERE store_id=? AND ${ACTIVE} AND id<>? ORDER BY (category_id IS ?) DESC, sold_count DESC LIMIT 8`, [s.id, p.id, p.category_id]),
  );
  res.json({ product: serializeProductDetail(p), related });
}));

r.post('/stores/:slug/visit', h((req, res) => {
  const s = loadStore(req.params.slug);
  const day = new Date().toISOString().slice(0, 10);
  q.run('INSERT INTO store_visits (store_id, day, visits) VALUES (?,?,1) ON CONFLICT(store_id, day) DO UPDATE SET visits=visits+1', [s.id, day]);
  res.status(204).end();
}));

const cartItems = z.array(z.object({ productId: z.coerce.number().int(), variantId: z.coerce.number().int().nullable().optional(), qty: z.coerce.number().int().min(1).max(20) })).min(1).max(50);

r.post('/stores/:slug/quote', h((req, res) => {
  const s = loadStore(req.params.slug);
  const body = z.object({ items: cartItems, coupon: z.string().max(40).optional().nullable() }).parse(req.body);
  const qt = quote(s, body.items, body.coupon);
  const media = mediaMap(qt.lines.map((l) => l.mediaId));
  res.json({ ...qt, lines: qt.lines.map((l) => ({ ...l, image: media.get(l.mediaId) || null })) });
}));

const orderSchema = z.object({
  name: z.string().trim().min(2, 'name_required').max(80),
  phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid'),
  governorate: z.string().trim().min(2, 'governorate_required').max(40),
  city: z.string().trim().min(2, 'city_required').max(60),
  address: z.string().trim().min(6, 'address_required').max(240),
  notes: z.string().trim().max(400).optional().default(''),
  coupon: z.string().trim().max(40).optional().nullable(),
  items: cartItems,
});

r.post('/stores/:slug/orders', h((req, res) => {
  const s = loadStore(req.params.slug);
  const body = orderSchema.parse(req.body);
  const result = tx(() => {
    const qt = quote(s, body.items, body.coupon);
    if (qt.hasErrors) throw new AppError(409, 'cart_changed', 'Some items in your cart are no longer available.', { lines: qt.lines });
    const now = nowIso();
    let customer = q.get('SELECT * FROM customers WHERE store_id=? AND phone=?', [s.id, body.phone]);
    if (!customer) {
      const id = insert('customers', { store_id: s.id, name: body.name, phone: body.phone, governorate: body.governorate, city: body.city, address: body.address, created_at: now });
      customer = { id };
    }
    q.run('UPDATE customers SET name=?, governorate=?, city=?, address=?, orders_count=orders_count+1, total_spent=total_spent+?, last_order_at=? WHERE id=?',
      [body.name, body.governorate, body.city, body.address, qt.total, now, customer.id]);
    const seq = q.val('SELECT COUNT(*) FROM orders WHERE store_id=?', [s.id]) + 10001;
    const number = `${s.code}-${seq}`;
    const orderId = insert('orders', {
      store_id: s.id, number, customer_id: customer.id, customer_name: body.name, phone: body.phone,
      governorate: body.governorate, city: body.city, address: body.address, notes: body.notes,
      status: 'pending', subtotal: qt.subtotal, discount: qt.discount, shipping: qt.shipping, total: qt.total,
      coupon_code: qt.coupon?.code ?? null, created_at: now, updated_at: now,
    });
    for (const l of qt.lines) {
      insert('order_items', { order_id: orderId, product_id: l.productId, variant_id: l.variantId, name_ar: l.name.ar, name_en: l.name.en, media_id: l.mediaId, color: l.color, size: l.size, price: l.price, qty: l.qty });
      if (l.variantId) q.run('UPDATE variants SET stock=MAX(0, stock-?) WHERE id=?', [l.qty, l.variantId]);
      q.run('UPDATE products SET stock=MAX(0, stock-?), sold_count=sold_count+? WHERE id=?', [l.qty, l.qty, l.productId]);
    }
    insert('order_events', { order_id: orderId, status: 'pending', note: null, created_at: now });
    if (qt.coupon) q.run('UPDATE offers SET usage_count=usage_count+1 WHERE id=?', [qt.coupon.id]);
    return { number, total: qt.total, orderId };
  });
  if (s.auto_whatsapp) {
    sendNewOrderAlert(s, result.orderId)
      .then((r) => { if (r.sent) console.log(`[whatsapp] ${result.number} → ${r.to}`); else console.log(`[whatsapp] ${result.number} skipped: ${r.skipped}`); })
      .catch((e) => console.error(`[whatsapp] ${result.number} failed: ${e.message}`));
  }
  delete result.orderId;
  res.status(201).json({ order: result });
}));

r.get('/stores/:slug/orders/:number', h((req, res) => {
  const s = loadStore(req.params.slug);
  const o = q.get('SELECT * FROM orders WHERE store_id=? AND number=?', [s.id, req.params.number]);
  if (!o || (req.query.phone && req.query.phone !== o.phone)) throw notFound('Order');
  const items = q.all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
  const media = mediaMap(items.map((i) => i.media_id));
  const events = q.all('SELECT status, note, created_at FROM order_events WHERE order_id=? ORDER BY id', [o.id]);
  res.json({
    order: {
      number: o.number, status: o.status, createdAt: o.created_at, name: o.customer_name, phone: o.phone.replace(/^(\d{3})\d{5}/, '$1•••••'),
      governorate: o.governorate, city: o.city, address: o.address,
      subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total, coupon: o.coupon_code,
      items: items.map((i) => ({ name: bi(i, 'name'), price: i.price, qty: i.qty, color: i.color, size: i.size, image: media.get(i.media_id) || null })),
      events,
    },
  });
}));

export default r;
