import { decodeDepartments } from '@souqna/shared';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { listDepartments } from '../lib/departments.js';
import { z } from 'zod';
import { q, tx, insert } from '../db/index.js';
import { randomBytes } from 'node:crypto';
import { h, notFound, badRequest, AppError } from '../lib/errors.js';
import { clampInt, nowIso } from '../lib/util.js';
import { mediaMap, processImage } from '../lib/media.js';
import { sameDaySql } from '../lib/sameDay.js';
import { buyerFromReq } from '../lib/buyers.js';
import { recomputeRatings } from '../lib/reviews.js';
import { searchByImage, visualSettings } from '../lib/visual.js';
import { runStylist, stylistSettings, addStylistFeedback, lookOfDay, cardsByIds } from '../lib/stylist.js';
import { quote } from '../lib/cart.js';
import { notifyStore } from '../lib/push.js';
import { sendNewOrderAlert, notifyPlatformDelivery } from '../lib/whatsapp.js';
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

r.get('/departments', h((_req, res) => res.json({ departments: listDepartments().map(({ slug, name, sizes, image }) => ({ slug, name, sizes, image })) })));

/* ---------------------------------------------------------- global product search */

const NORM = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}),'أ','ا'),'إ','ا'),'آ','ا'),'ة','ه'),'ى','ي'),'ـ','')`;
const normText = (s) => String(s).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '').trim();
// Everyday words people type → other spellings / words that should also match.
const SYNONYMS = {
  كوتشي: ['كوتش', 'حذاء', 'جزمه', 'shoe', 'sneaker'], كوتش: ['كوتشي', 'حذاء', 'shoe'], حذاء: ['كوتش', 'جزمه', 'shoe'], جزمه: ['حذاء', 'كوتش', 'shoe'], جزمة: ['حذاء', 'كوتش', 'shoe'],
  شنطه: ['حقيبه', 'bag'], حقيبه: ['شنطه', 'bag'], طرحه: ['حجاب', 'hijab', 'طرح'], طرح: ['حجاب', 'hijab'], حجاب: ['طرح', 'hijab'],
  فستان: ['dress', 'فساتين'], فساتين: ['فستان', 'dress'], بدله: ['بدل', 'suit'], بدل: ['بدله', 'suit'], عبايه: ['عبايات', 'abaya'], جلابيه: ['جلاليب', 'galabiya', 'jalabiya'], جلاليب: ['جلابيه', 'jalabiya'],
  تيشيرت: ['tshirt', 'تي شيرت', 't-shirt'], بنطلون: ['بنطال', 'pants', 'jeans', 'جينز'], جينز: ['jeans', 'بنطلون'], اطفال: ['كيدز', 'kids', 'طفل'], طفل: ['اطفال', 'kids'],
};

r.get('/search', h((req, res) => {
  const { q: term = '', department = '', store = '', sort = 'relevance', min, max, page = '1', sale, new: isNew, in_stock: inStock, rating } = req.query;
  const tokens = normText(String(term).slice(0, 80)).split(/\s+/).filter(Boolean).slice(0, 6);
  const where = ["p.status='active'", "s.status='active'", 's.hidden=0']; const params = [];
  for (const tk of tokens) {
    const alts = [...new Set([tk, ...(SYNONYMS[tk] || []).map(normText)])];
    const ors = [];
    for (const a of alts) {
      const like = `%${a}%`;
      ors.push(`${NORM('p.name_ar')} LIKE ?`, `${NORM('p.name_en')} LIKE ?`, `${NORM('p.description_ar')} LIKE ?`, `${NORM('p.description_en')} LIKE ?`, `${NORM('s.name_ar')} LIKE ?`, `${NORM('s.name_en')} LIKE ?`,
        `EXISTS (SELECT 1 FROM categories c WHERE c.id=p.category_id AND (${NORM('c.name_ar')} LIKE ? OR ${NORM('c.name_en')} LIKE ?))`,
        `EXISTS (SELECT 1 FROM departments d WHERE p.department=d.slug AND (${NORM('d.name_ar')} LIKE ? OR ${NORM('d.name_en')} LIKE ? OR d.slug LIKE ?))`);
      params.push(like, like, like, like, like, like, like, like, like, like, like);
    }
    where.push(`(${ors.join(' OR ')})`);
  }
  if (min) { where.push('p.price >= ?'); params.push(clampInt(min, 0, 1e7, 0)); }
  if (max) { where.push('p.price <= ?'); params.push(clampInt(max, 0, 1e7, 1e7)); }
  if (sale === '1') where.push('p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price');
  if (isNew === '1') where.push("(p.is_new=1 OR p.created_at >= datetime('now','-30 days'))");
  if (inStock === '1') where.push('(p.track_stock=0 OR p.stock>0)');
  if (rating === '1') where.push('p.rating >= 4');
  if (req.query.same_day === '1') { const sd = sameDaySql(); where.push(sd.sql); params.push(...sd.params); }
  // facets (counts per department / per store) are computed with every filter EXCEPT their own
  const baseWhere = [...where]; const baseParams = [...params];
  const deptSlug = String(department).replace(/[^a-z0-9_]/g, '');
  const storeSlug = String(store).replace(/[^a-z0-9_-]/gi, '');
  const facetFrom = (extra, extraParams) => ({ sql: `FROM products p JOIN stores s ON s.id=p.store_id WHERE ${[...baseWhere, ...extra].join(' AND ')}`, params: [...baseParams, ...extraParams] });
  if (deptSlug) { where.push('p.department=?'); params.push(deptSlug); }
  if (storeSlug) { where.push('s.slug=?'); params.push(storeSlug); }
  const order = { relevance: 'p.featured DESC, p.sold_count DESC, p.id DESC', price_asc: 'p.price ASC', price_desc: 'p.price DESC', newest: 'p.created_at DESC', best: 'p.sold_count DESC' }[sort] || 'p.sold_count DESC';
  const limit = 24; const pg = clampInt(page, 1, 1000, 1);
  const from = `FROM products p JOIN stores s ON s.id=p.store_id WHERE ${where.join(' AND ')}`;
  const total = q.val(`SELECT COUNT(*) ${from}`, params);
  const rows = q.all(`SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (pg - 1) * limit]);
  const items = serializeCards(rows).map((c, i) => ({ ...c, store: { slug: rows[i].store_slug, name: bi(rows[i], 'store_name') } }));
  const price = q.get(`SELECT MIN(p.price) AS min, MAX(p.price) AS max ${from}`, params);
  const fd = facetFrom(storeSlug ? ['s.slug=?'] : [], storeSlug ? [storeSlug] : []);
  const departments = q.all(`SELECT p.department AS slug, COUNT(*) AS n ${fd.sql} AND p.department IS NOT NULL GROUP BY p.department`, fd.params);
  const fs2 = facetFrom(deptSlug ? ['p.department=?'] : [], deptSlug ? [deptSlug] : []);
  const stores = q.all(`SELECT s.slug AS slug, s.name_ar AS name_ar, s.name_en AS name_en, COUNT(*) AS n ${fs2.sql} GROUP BY s.id ORDER BY n DESC LIMIT 12`, fs2.params)
    .map((x) => ({ slug: x.slug, name: { ar: x.name_ar, en: x.name_en }, n: x.n }));
  cache(res, 20);
  res.json({ items, total, page: pg, pages: Math.max(1, Math.ceil(total / limit)), price: { min: price?.min ?? 0, max: price?.max ?? 0 }, facets: { departments, stores } });
}));

/* ---------------------------------------------------------- visual search: "snap it, find it in Banha" */
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const hits = new Map(); // ip -> [timestamps] (simple per-IP limit: 40 photos / hour)
r.post('/visual-search', photoUpload.single('file'), h(async (req, res) => {
  const vs = visualSettings();
  if (!vs.enabled) throw new AppError(503, 'visual_disabled', 'Visual search is switched off.');
  const ip = req.ip || 'x'; const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 86400e3);
  if (recent.length >= 120 || recent.filter((t) => now - t < 3600e3).length >= 40) throw new AppError(429, 'rate_limited', 'Too many searches, try again later.');
  // free daily quota per visitor (0 = unlimited). Admin → النظام → البحث بالصورة.
  if (vs.dailyFree && recent.filter((t) => t > new Date().setHours(0, 0, 0, 0)).length >= vs.dailyFree) throw new AppError(429, 'visual_quota', 'Daily free searches used up.');
  hits.set(ip, [...recent, now]);
  if (!req.file) throw new AppError(422, 'validation_failed', 'Pick a photo.', { file: 'required' });
  const department = String(req.body?.department || '').replace(/[^a-z0-9_]/g, '');
  let top;
  try { top = await searchByImage(req.file.buffer, { department, limit: 24 }); } catch { throw new AppError(400, 'invalid_image', 'This file is not a supported image.'); }
  if (!top.length) return res.json({ items: [], total: 0 });
  const rows = q.all(
    `SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id IN (${top.map(() => '?').join(',')})`, top.map((t) => t.id));
  const byId = new Map(rows.map((x) => [x.id, x]));
  const ordered = top.map((t) => byId.get(t.id)).filter(Boolean);
  const items = serializeCards(ordered).map((c, i) => ({ ...c, store: { slug: ordered[i].store_slug, name: bi(ordered[i], 'store_name') }, match: Math.round(Math.max(0, Math.min(1, top[i].score)) * 100) }));
  res.json({ items, total: items.length });
}));

/* ---------------------------------------------------------- stylist chat ("مودة") */
const chatHits = new Map();
r.post('/stylist', h(async (req, res) => {
  const st = stylistSettings();
  if (!st.enabled) throw new AppError(503, 'stylist_disabled', 'The stylist is switched off.');
  const body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(700) })).min(1).max(30), image: z.string().max(950000).optional(), image2: z.string().max(950000).optional(), profile: z.record(z.string().max(500)).optional() }).parse(req.body);
  if (body.messages[body.messages.length - 1].role !== 'user') throw new AppError(422, 'validation_failed', 'Last message must be from the shopper.');
  const ip = req.ip || 'x'; const now = Date.now();
  const recent = (chatHits.get(ip) || []).filter((t) => now - t < 86400e3);
  if (recent.length >= 200 || recent.filter((t) => now - t < 3600e3).length >= 40) throw new AppError(429, 'rate_limited', 'Too many messages, try again later.');
  if (st.dailyFree && recent.filter((t) => t > new Date().setHours(0, 0, 0, 0)).length >= st.dailyFree) throw new AppError(429, 'stylist_quota', 'Daily free messages used up.');
  chatHits.set(ip, [...recent, now]);
  // a signed-in shopper's wardrobe (what she/he really bought) lets Moda build looks around it
  const me = buyerFromReq(req); let profile = body.profile;
  if (me) {
    const owned = q.all("SELECT oi.name_ar, oi.color FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.buyer_id=? AND o.status='delivered' ORDER BY o.id DESC LIMIT 8", [me.id]);
    if (owned.length) profile = { ...(profile || {}), owns: owned.map((x) => [x.name_ar, x.color].filter(Boolean).join(' ')).join('، ').slice(0, 300), ...(me.name ? { name: me.name.split(' ')[0] } : {}) };
  }
  try { res.json(await runStylist(body.messages, { image: body.image, image2: body.image2, profile })); }
  catch (e) { if (e.code === 'stylist_no_vision') throw new AppError(422, 'stylist_no_vision', 'Photos need the Anthropic provider.'); if (e.code === 'stylist_bad_image') throw new AppError(422, 'stylist_bad_image', 'Unsupported image.'); if (e.code === 'stylist_unavailable') throw new AppError(503, 'stylist_unavailable', 'The stylist is unavailable right now.'); throw e; }
}));

r.post('/stylist/feedback', h((req, res) => {
  const body = z.object({
    rating: z.enum(['good', 'bad']),
    reason: z.enum(['mismatch', 'color', 'occasion', 'price', 'fit', 'other']).optional(),
    note: z.string().trim().max(240).optional().default(''),
    question: z.string().trim().min(1).max(300),
    reply: z.string().max(500).optional().default(''),
    items: z.array(z.string().max(120)).max(12).optional().default([]),
  }).parse(req.body);
  if (body.rating === 'bad' && !body.reason) throw new AppError(422, 'validation_failed', 'Choose a reason for the feedback.');
  const item = addStylistFeedback({ ...body, note: body.note.slice(0, 240) });
  res.status(201).json({ id: item.id });
}));

r.post('/look-share', h(async (req, res) => {
  const b = z.object({ title: z.string().max(80).optional(), items: z.array(z.object({ id: z.number().int(), label: z.string().max(60).optional() })).min(1).max(12) }).parse(req.body);
  const valid = new Set(cardsByIds(b.items.map((i) => i.id)).map((c) => c.id));
  const items = b.items.filter((i) => valid.has(i.id));
  if (!items.length) throw badRequest('No valid products.');
  const token = randomBytes(6).toString('base64url');
  q.run('INSERT INTO shared_looks(token,title,items_json) VALUES(?,?,?)', [token, (b.title || '').trim(), JSON.stringify(items)]);
  res.status(201).json({ token, url: `/look/${token}` });
}));

export function loadSharedLook(token) {
  const row = /^[\w-]{6,16}$/.test(token || '') ? q.get('SELECT * FROM shared_looks WHERE token=?', [token]) : null;
  if (!row) return null;
  let items = []; try { items = JSON.parse(row.items_json); } catch { /* empty */ }
  const cards = new Map(cardsByIds(items.map((i) => i.id)).map((c) => [c.id, c]));
  const pieces = items.map((i) => (cards.get(i.id) ? { label: i.label || '', ...cards.get(i.id) } : null)).filter(Boolean);
  return { token, title: row.title, pieces, total: pieces.reduce((s, p) => s + p.price, 0) };
}

r.get('/look-share/:token', h(async (req, res) => {
  const look = loadSharedLook(req.params.token);
  if (!look) throw notFound('Look not found.');
  res.json(look);
}));

r.get('/look-of-day', h(async (_req, res) => {
  const mode = q.get("SELECT value FROM app_settings WHERE key='look_of_day_mode'")?.value || 'ai';
  res.set('Cache-Control', mode === 'manual' || mode === 'off' ? 'no-store' : 'public, max-age=300');
  res.json(await lookOfDay());
}));

r.get('/marketplace', h((req, res) => {
  const { q: term = '', category = '', sort = 'featured' } = req.query;
  const where = ["s.status='active'", 's.hidden=0'];
  const params = [];
  if (category && category !== 'all') { where.push('s.departments LIKE ?'); params.push(`%,${String(category).replace(/[^a-z_]/g, '')},%`); }
  if (term) {
    where.push('(s.name_ar LIKE ? OR s.name_en LIKE ? OR s.tagline_ar LIKE ? OR s.tagline_en LIKE ?)');
    const like = `%${String(term).slice(0, 60)}%`;
    params.push(like, like, like, like);
  }
  if (req.query.same_day === '1') { const sd = sameDaySql(); where.push(sd.sql); params.push(...sd.params); }
  const order = {
    featured: 's.featured DESC, s.rating DESC',
    rating: 's.rating DESC, s.rating_count DESC',
    newest: 's.created_at DESC',
    products: 'product_count DESC',
  }[sort] || 's.featured DESC, s.rating DESC';
  const rows = q.all(`SELECT ${STORE_COLS} FROM stores s WHERE ${where.join(' AND ')} ORDER BY s.sort_order ASC, ${order}`, params);
  const deptCount = new Map();
  for (const row of q.all("SELECT departments FROM stores WHERE status='active' AND hidden=0")) {
    for (const d of decodeDepartments(row.departments)) deptCount.set(d, (deptCount.get(d) || 0) + 1);
  }
  const names = new Map(listDepartments().map((d) => [d.slug, d]));
  const categories = [...deptCount].filter(([id]) => names.has(id)).map(([id, count]) => ({ id, count, name: names.get(id).name })).sort((a, b) => b.count - a.count);
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
  const railRows = (sql, params = []) => {
    const rs = q.all(`SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en FROM products p JOIN stores s ON s.id=p.store_id
      WHERE p.status='active' AND s.status='active' AND s.hidden=0 ${sql}`, params);
    return serializeCards(rs).map((c, i) => ({ ...c, store: { slug: rs[i].store_slug, name: bi(rs[i], 'store_name') } }));
  };
  const newest = railRows("ORDER BY p.is_new DESC, p.created_at DESC LIMIT 12");
  const deals = railRows('AND p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price ORDER BY (p.compare_at_price - p.price) * 1.0 / p.compare_at_price DESC LIMIT 12');
  const deptCounts = q.all("SELECT p.department AS slug, COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND p.department IS NOT NULL GROUP BY p.department");
  const countBy = new Map(deptCounts.map((d) => [d.slug, d.n]));
  const departments = listDepartments().map((d) => ({ slug: d.slug, name: d.name, image: d.image, products: countBy.get(d.slug) || 0 }));
  const deptRails = departments.filter((d) => d.products >= 3).sort((a, b) => b.products - a.products).slice(0, 4)
    .map((d) => ({ slug: d.slug, name: d.name, items: railRows('AND p.department=? ORDER BY p.sold_count DESC, p.id DESC LIMIT 10', [d.slug]) }));
  cache(res, 60);
  res.json({ stores: rows.map((s) => serializeStore(s)), categories, stats, trending, newest, deals, departments, deptRails, features: { visual: visualSettings().enabled, stylist: stylistSettings().enabled, stylistName: stylistSettings().name, stylistAvatar: stylistSettings().avatar || null } });
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

/* ---------------------------------------------------------- reviews (verified buyers only, photos allowed) */
const reviewPhotos = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 3 } });

function reviewOut(rows) {
  const media = mediaMap(rows.flatMap((x) => JSON.parse(x.media_ids || '[]')));
  return rows.map((x) => ({ id: x.id, name: x.name, rating: x.rating, comment: x.comment || '', createdAt: x.created_at, photos: JSON.parse(x.media_ids || '[]').map((id) => media.get(id)).filter(Boolean) }));
}

r.get('/stores/:slug/products/:pslug/reviews', h((req, res) => {
  const s = loadStore(req.params.slug);
  const p = q.get("SELECT id FROM products WHERE store_id=? AND slug=? AND status='active'", [s.id, req.params.pslug]);
  if (!p) throw notFound('Product');
  const rows = q.all("SELECT * FROM reviews WHERE product_id=? AND status='published' ORDER BY (media_ids <> '[]') DESC, id DESC LIMIT 40", [p.id]);
  const dist = [0, 0, 0, 0, 0];
  for (const d of q.all("SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id=? AND status='published' GROUP BY rating", [p.id])) dist[d.rating - 1] = d.n;
  const count = dist.reduce((a, b) => a + b, 0);
  const avg = count ? Math.round((dist.reduce((a, n, i) => a + n * (i + 1), 0) / count) * 10) / 10 : 0;
  cache(res, 15);
  res.json({ summary: { avg, count, dist }, items: reviewOut(rows) });
}));

const reviewHits = new Map();
r.post('/track/:token/review', reviewPhotos.array('photos', 3), h(async (req, res) => {
  const recent = trackGuard(req);
  const o = /^[A-Za-z0-9_-]{10,40}$/.test(req.params.token) ? q.get('SELECT * FROM orders WHERE track_token=?', [req.params.token]) : null;
  if (!o) trackMiss(req, recent);
  if (o.status !== 'delivered') throw new AppError(409, 'review_not_delivered', 'You can review once the order is delivered.');
  const b = z.object({ productId: z.coerce.number().int().positive(), rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(600).optional().default('') }).parse(req.body);
  if (!q.get('SELECT 1 AS x FROM order_items WHERE order_id=? AND product_id=?', [o.id, b.productId])) throw notFound('Product');
  if (q.get('SELECT 1 AS x FROM reviews WHERE order_id=? AND product_id=?', [o.id, b.productId])) throw new AppError(409, 'review_exists', 'You already reviewed this product.');
  const hits = (reviewHits.get(req.ip) || []).filter((t) => Date.now() - t < 3600e3);
  if (hits.length >= 20) throw new AppError(429, 'rate_limited', 'Too many reviews, try again later.');
  reviewHits.set(req.ip, [...hits, Date.now()]);
  const ids = [];
  for (const f of req.files || []) {
    const m = await processImage(f.buffer, { storeId: o.store_id, kind: 'review', alt: null });
    q.run('UPDATE media SET attached=1 WHERE id=?', [m.id]);
    ids.push(m.id);
  }
  const name = String(o.customer_name || '').trim().split(/\s+/)[0] || 'عميل';
  tx(() => {
    insert('reviews', { store_id: o.store_id, product_id: b.productId, order_id: o.id, name, rating: b.rating, comment: b.comment || null, media_ids: JSON.stringify(ids), status: 'published', created_at: nowIso() });
    recomputeRatings(b.productId, o.store_id);
  });
  notifyStore(o.store_id, { title: `تقييم جديد ${'★'.repeat(b.rating)}`, body: b.comment || 'عميل قيّم منتجك', url: '/dashboard/reviews' });
  res.status(201).json({ ok: true });
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
  const body = z.object({ items: cartItems, coupon: z.string().max(40).optional().nullable(), phone: z.string().max(20).optional().nullable() }).parse(req.body);
  const qt = quote(s, body.items, body.coupon, { phone: body.phone });
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
    const qt = quote(s, body.items, body.coupon, { phone: body.phone });
    if (body.coupon && qt.couponError) throw new AppError(409, qt.couponError, 'This coupon can no longer be applied.'); // never charge more than the customer was shown
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
    const trackToken = crypto.randomBytes(12).toString('base64url');
    const orderId = insert('orders', {
      store_id: s.id, number, customer_id: customer.id, customer_name: body.name, phone: body.phone,
      governorate: body.governorate, city: body.city, address: body.address, notes: body.notes,
      status: 'pending', delivery_by: s.delivery_mode === 'platform' ? 'platform' : 'store', subtotal: qt.subtotal, discount: qt.discount, shipping: qt.shipping, total: qt.total,
      coupon_code: qt.coupon?.code ?? null, platform_discount: qt.platformDiscount || 0, track_token: trackToken, buyer_id: buyerFromReq(req)?.id ?? null, created_at: now, updated_at: now,
    });
    for (const l of qt.lines) {
      insert('order_items', { order_id: orderId, product_id: l.productId, variant_id: l.variantId, name_ar: l.name.ar, name_en: l.name.en, media_id: l.mediaId, color: l.color, size: l.size, price: l.price, qty: l.qty });
      if (l.variantId) q.run('UPDATE variants SET stock=MAX(0, stock-?) WHERE id=?', [l.qty, l.variantId]);
      q.run('UPDATE products SET stock=MAX(0, stock-?), sold_count=sold_count+? WHERE id=?', [l.qty, l.qty, l.productId]);
    }
    insert('order_events', { order_id: orderId, status: 'pending', note: null, created_at: now });
    if (qt.coupon) q.run(`UPDATE ${qt.coupon.source === 'platform' ? 'platform_coupons' : 'offers'} SET usage_count=usage_count+1 WHERE id=?`, [qt.coupon.id]);
    return { number, total: qt.total, trackToken, orderId };
  });
  if (s.auto_whatsapp) {
    sendNewOrderAlert(s, result.orderId)
      .then((r) => { if (r.sent) console.log(`[whatsapp] ${result.number} → ${r.to}`); else console.log(`[whatsapp] ${result.number} skipped: ${r.skipped}`); })
      .catch((e) => console.error(`[whatsapp] ${result.number} failed: ${e.message}`));
  }
  notifyStore(s.id, { title: `طلب جديد 🛍️ ${result.number}`, body: `${body.name} · ${result.total} ج.م`, url: `/dashboard/orders/${result.orderId}`, tag: `order-${result.orderId}` });
  if (s.delivery_mode === 'platform') notifyPlatformDelivery(result.orderId, result.number);
  delete result.orderId;
  res.status(201).json({ order: result });
}));

/** The platform coupon promoted on the marketplace home (if any). */
r.get('/promo', h((_req, res) => {
  const d = new Date().toISOString().slice(0, 10);
  const c = q.get(`SELECT code, type, value, max_discount, min_subtotal, first_order_only, title_ar, title_en FROM platform_coupons
    WHERE promoted=1 AND active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) AND (usage_limit IS NULL OR usage_count<usage_limit) ORDER BY id DESC LIMIT 1`, [d, d]);
  res.json({ promo: c ? { code: c.code, type: c.type, value: c.value, minSubtotal: c.min_subtotal, firstOrderOnly: !!c.first_order_only, title: { ar: c.title_ar, en: c.title_en } } : null });
}));

/* ------------------------------------------------------------ order tracking (no login)
 * A customer can follow an order two ways, both without an account:
 *   - private link   /track/<token>   (token is random, given right after checkout)
 *   - order number + phone (POST /track/lookup) — both must match
 * Only non-sensitive fields are returned (first name, city, masked phone — never the street address).
 */
const trackFails = new Map();
function trackGuard(req) {
  const recent = (trackFails.get(req.ip) || []).filter((t) => Date.now() - t < 10 * 60e3);
  if (recent.length >= 20) throw new AppError(429, 'too_many_attempts', 'Too many attempts. Please wait a few minutes.');
  return recent;
}
const trackMiss = (req, recent) => { trackFails.set(req.ip, [...recent, Date.now()]); throw notFound('Order'); };
const normPhone = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.startsWith('20') && d.length === 12 ? `0${d.slice(2)}` : d; };

function trackPayload(o) {
  const s = q.get('SELECT name_ar, name_en, slug, phone FROM stores WHERE id=?', [o.store_id]);
  const items = q.all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
  const media = mediaMap(items.map((i) => i.media_id));
  const events = q.all('SELECT status, created_at FROM order_events WHERE order_id=? ORDER BY id', [o.id]);
  return {
    number: o.number, token: o.track_token, status: o.status, createdAt: o.created_at, updatedAt: o.updated_at,
    deliveryBy: o.delivery_by, firstName: String(o.customer_name || '').split(' ')[0],
    city: o.city, governorate: o.governorate, phone: o.phone.replace(/^(\d{3})\d{5}/, '$1•••••'),
    subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total, payment: o.payment_method,
    store: { name: { ar: s?.name_ar, en: s?.name_en }, slug: s?.slug, phone: s?.phone || null },
    items: items.map((i) => ({ productId: i.product_id, reviewed: i.product_id ? !!q.get('SELECT 1 AS x FROM reviews WHERE order_id=? AND product_id=?', [o.id, i.product_id]) : true, name: bi(i, 'name'), price: i.price, qty: i.qty, color: i.color, size: i.size, image: media.get(i.media_id) || null })),
    events,
  };
}

r.get('/track/:token', h((req, res) => {
  const recent = trackGuard(req);
  const o = /^[A-Za-z0-9_-]{10,40}$/.test(req.params.token) ? q.get('SELECT * FROM orders WHERE track_token=?', [req.params.token]) : null;
  if (!o) trackMiss(req, recent);
  res.json({ order: trackPayload(o) });
}));

r.post('/track/lookup', h((req, res) => {
  const recent = trackGuard(req);
  const body = z.object({ number: z.string().trim().min(3).max(30), phone: z.string().trim().min(8).max(20) }).parse(req.body);
  const o = q.get('SELECT * FROM orders WHERE UPPER(number)=UPPER(?)', [body.number]);
  if (!o || normPhone(o.phone) !== normPhone(body.phone)) trackMiss(req, recent);
  res.json({ order: trackPayload(o) });
}));

/* ---------------------------------------------------------- "not in Banha? we get it for you" (platform sourcing, inspection before handover) */
const SOURCING_STATUSES = ['new', 'quoted', 'approved', 'ordered', 'arrived', 'delivered', 'cancelled'];
const sourcingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const sourcingHits = new Map();

const sourcingOut = (x) => ({ number: x.number, token: x.track_token, title: x.title, details: x.details, status: x.status, quotePrice: x.quote_price, note: x.admin_note, createdAt: x.created_at, updatedAt: x.updated_at, photo: x.photo || null, firstName: String(x.name).split(' ')[0] });

r.post('/sourcing', sourcingUpload.single('photo'), h(async (req, res) => {
  const hits = (sourcingHits.get(req.ip) || []).filter((t) => Date.now() - t < 3600e3);
  if (hits.length >= 6) throw new AppError(429, 'rate_limited', 'Too many requests, try again later.');
  const clean = (v) => (v === undefined || v === '' ? undefined : v);
  const b = z.object({
    title: z.string().trim().min(3).max(120), details: z.string().trim().max(800).optional(), link: z.preprocess(clean, z.string().trim().url().max(400).optional()),
    size: z.string().trim().max(30).optional(), color: z.string().trim().max(40).optional(), budget: z.preprocess(clean, z.coerce.number().int().min(0).max(1e6).optional()),
    name: z.string().trim().min(2).max(60), phone: z.string().trim().min(8).max(20), governorate: z.string().trim().max(40).optional(), city: z.string().trim().max(60).optional(),
    address: z.string().trim().min(6).max(200), source: z.string().trim().max(20).optional(),
  }).parse(req.body);
  if (!/^01[0-9]{9}$/.test(normPhone(b.phone))) throw new AppError(422, 'validation_failed', 'Enter a valid Egyptian mobile number.', { phone: 'phone_invalid' });
  let photo = null;
  if (req.file) {
    try { photo = `data:image/jpeg;base64,${(await sharp(req.file.buffer).rotate().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer()).toString('base64')}`; }
    catch { throw new AppError(400, 'invalid_image', 'This file is not a supported image.'); }
  }
  sourcingHits.set(req.ip, [...hits, Date.now()]);
  const number = `RQ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomInt(1000, 9999)}`;
  const track = crypto.randomBytes(12).toString('base64url');
  const now = nowIso();
  insert('sourcing_requests', { number, track_token: track, title: b.title, details: b.details || null, link: b.link || null, size: b.size || null, color: b.color || null, budget: b.budget ?? null, photo,
    name: b.name, phone: normPhone(b.phone), governorate: b.governorate || null, city: b.city || null, address: b.address, source: b.source || null, created_at: now, updated_at: now });
  res.status(201).json({ number, token: track });
}));

r.get('/sourcing/:token', h((req, res) => {
  const recent = trackGuard(req);
  const x = /^[A-Za-z0-9_-]{10,40}$/.test(req.params.token) ? q.get('SELECT * FROM sourcing_requests WHERE track_token=?', [req.params.token]) : null;
  if (!x) trackMiss(req, recent);
  res.json({ request: sourcingOut(x) });
}));

/** The customer accepts or declines the price we quoted. */
r.post('/sourcing/:token/respond', h((req, res) => {
  const recent = trackGuard(req);
  const x = /^[A-Za-z0-9_-]{10,40}$/.test(req.params.token) ? q.get('SELECT * FROM sourcing_requests WHERE track_token=?', [req.params.token]) : null;
  if (!x) trackMiss(req, recent);
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  if (x.status !== 'quoted') throw new AppError(409, 'sourcing_not_quoted', 'There is no price to answer yet.');
  q.run('UPDATE sourcing_requests SET status=?, updated_at=? WHERE id=?', [accept ? 'approved' : 'cancelled', nowIso(), x.id]);
  res.json({ ok: true });
}));

export default r;
