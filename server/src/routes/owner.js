import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ORDER_FLOW, buildTheme, THEME_FIELDS } from '@souqna/shared';
import { q, tx, insert, update, json } from '../db/index.js';
import { config } from '../config.js';
import { h, notFound, badRequest, AppError } from '../lib/errors.js';
import { requireOwner } from '../lib/auth.js';
import { clampInt, nowIso, slugify } from '../lib/util.js';
import { processImage, serializeMedia, getMedia, mediaMap, deleteMedia } from '../lib/media.js';
import {
  serializeStore, serializeProductDetail, serializeCategory, serializeBanner, serializeOffer, bi, stockStatus,
} from '../lib/serialize.js';

const r = Router();
r.use(requireOwner);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 12 } });
const LOCAL_DAY = "date(created_at, '+3 hours')"; // Cairo
const NOT_CANCELLED = "status <> 'cancelled'";

const dayStr = (d) => d.toISOString().slice(0, 10);
const cairoToday = () => new Date(Date.now() + 3 * 3600e3);
function rangeDays(n) {
  const end = cairoToday();
  const days = [];
  for (let i = n - 1; i >= 0; i--) days.push(dayStr(new Date(end.getTime() - i * 864e5)));
  return days;
}
const pct = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur ? 100 : 0);

/* ---------------------------------------------------------- store */

r.get('/notifications', h((req, res) => {
  const since = typeof req.query.since === 'string' ? req.query.since : '1970-01-01T00:00:00.000Z';
  const newOrders = q.all(
    "SELECT number, customer_name, phone, city, total, created_at FROM orders WHERE store_id=? AND created_at > ? ORDER BY created_at DESC LIMIT 5",
    [req.store.id, since],
  );
  const pending = q.val("SELECT COUNT(*) FROM orders WHERE store_id=? AND status='pending'", [req.store.id]);
  res.json({ pending, newOrders, now: nowIso() });
}));

r.get('/store', h((req, res) => {
  const t = buildTheme(json(req.store.theme_json, {}));
  res.json({ store: serializeStore(req.store), user: req.user, themeReport: t.report, themeChecks: t.checks });
}));

const storeSchema = z.object({
  name_ar: z.string().trim().min(2).max(60), name_en: z.string().trim().min(2).max(60),
  tagline_ar: z.string().trim().max(120).optional(), tagline_en: z.string().trim().max(120).optional(),
  description_ar: z.string().trim().max(600).optional(), description_en: z.string().trim().max(600).optional(),
  address_ar: z.string().trim().max(160).optional(), address_en: z.string().trim().max(160).optional(),
  category: z.enum(['men', 'women', 'kids', 'mixed', 'denim', 'sports', 'accessories']).optional(),
  phone: z.string().trim().max(20).optional(), whatsapp: z.string().trim().max(20).optional(),
  hero_mode: z.enum(['auto', 'cover', 'slider']).optional(),
  opens_at: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_invalid')]).optional().nullable(),
  closes_at: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_invalid')]).optional().nullable(),
  day_off: z.union([z.literal(''), z.coerce.number().int().min(0).max(6)]).optional().nullable(),
  map_url: z.union([z.literal(''), z.string().trim().url().max(400).refine((u) => /^https:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(u), 'map_url_invalid')]).optional().nullable(),
  instagram: z.string().trim().max(60).optional(), facebook: z.string().trim().max(60).optional(),
  shipping_fee: z.coerce.number().int().min(0).max(1000).optional(),
  free_shipping_over: z.coerce.number().int().min(0).max(100000).optional(),
  offer_badge_ar: z.string().trim().max(30).optional().nullable(), offer_badge_en: z.string().trim().max(30).optional().nullable(),
});

r.put('/store', h((req, res) => {
  const body = storeSchema.parse(req.body);
  for (const k of ['opens_at', 'closes_at', 'day_off', 'map_url']) if (body[k] === '') body[k] = null;
  update('stores', req.store.id, body);
  const s = q.get('SELECT * FROM stores WHERE id=?', [req.store.id]);
  res.json({ store: serializeStore(s) });
}));

r.put('/store/theme', h((req, res) => {
  const body = z.object(Object.fromEntries(THEME_FIELDS.map((f) => [f, z.string().regex(/^#?[0-9a-fA-F]{3,6}$/, 'invalid_hex')]))).partial().parse(req.body);
  const t = buildTheme(body);
  if (!t.valid) throw badRequest('invalid_theme', 'Some colours are not valid.', t.report);
  q.run('UPDATE stores SET theme_json=? WHERE id=?', [JSON.stringify(t.input), req.store.id]);
  res.json({ theme: { input: t.input, cssVars: t.cssVars, dark: t.dark }, report: t.report, checks: t.checks });
}));

r.post('/store/theme/preview', h((req, res) => {
  const t = buildTheme(req.body || {});
  res.json({ theme: { input: t.input, cssVars: t.cssVars, dark: t.dark }, report: t.report, checks: t.checks });
}));

// Auto-designed luxury cover: dark gradient in the store's colour + its best product photos in gold-framed cards.
r.post('/store/cover/auto', h(async (req, res) => {
  const sharp = (await import('sharp')).default;
  const fs = await import('node:fs');
  const path = await import('node:path');
  const theme = json(req.store.theme_json, {});
  const base = /^#?[0-9a-fA-F]{6}$/.test(theme.primary || '') ? `#${String(theme.primary).replace('#', '')}` : '#1B1B1B';
  const W = 1600, H = 1000;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${base}"/><stop offset=".55" stop-color="#121214"/><stop offset="1" stop-color="#0B0B0C"/></linearGradient>
      <radialGradient id="glow" cx=".78" cy=".2" r=".6"><stop offset="0" stop-color="#C9A24D" stop-opacity=".35"/><stop offset="1" stop-color="#C9A24D" stop-opacity="0"/></radialGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DFA2"/><stop offset=".5" stop-color="#C9A24D"/><stop offset="1" stop-color="#8E6A24"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
    <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="28" fill="none" stroke="url(#gold)" stroke-width="2" opacity=".55"/>
  </svg>`);
  const ids = q.all(`SELECT pm.media_id AS id FROM product_media pm JOIN products p ON p.id=pm.product_id
    WHERE p.store_id=? AND p.status='active' AND pm.is_primary=1 ORDER BY p.featured DESC, p.sold_count DESC LIMIT 3`, [req.store.id]).map((r) => r.id);
  const cardW = 380, cardH = 560, gap = 36, top = Math.round((H - cardH) / 2);
  const mask = Buffer.from(`<svg width="${cardW}" height="${cardH}"><rect width="${cardW}" height="${cardH}" rx="26" fill="#fff"/></svg>`);
  const frame = Buffer.from(`<svg width="${cardW}" height="${cardH}"><defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DFA2"/><stop offset="1" stop-color="#8E6A24"/></linearGradient></defs><rect x="1.5" y="1.5" width="${cardW - 3}" height="${cardH - 3}" rx="25" fill="none" stroke="url(#gold)" stroke-width="3"/></svg>`);
  const layers = [];
  let i = 0;
  for (const id of ids) {
    const m = getMedia(id);
    if (!m) continue;
    const dir = path.join(config.mediaDir, String(m.store_id), m.key);
    const file = ['lg.jpg', 'md.jpg', 'original.jpg'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
    if (!file) continue;
    const card = await sharp(file).resize(cardW, cardH, { fit: 'cover', position: 'attention' }).composite([{ input: mask, blend: 'dest-in' }, { input: frame }]).png().toBuffer();
    const left = W - 96 - (i + 1) * cardW - i * gap;
    layers.push({ input: card, left, top: top + (i === 1 ? -28 : 28) });
    i++;
  }
  const buffer = await sharp(bg).composite(layers).jpeg({ quality: 92 }).toBuffer();
  const m = await processImage(buffer, { storeId: req.store.id, kind: 'cover' });
  const old = getMedia(req.store.cover_media_id);
  q.run('UPDATE stores SET cover_media_id=? WHERE id=?', [m.id, req.store.id]);
  q.run('UPDATE media SET attached=1 WHERE id=?', [m.id]);
  if (old) await deleteMedia(old);
  res.json({ media: serializeMedia(m) });
}));

r.post('/store/:slot(logo|cover)', upload.single('file'), h(async (req, res) => {
  if (!req.file) throw badRequest('no_file', 'Please choose an image.');
  const kind = req.params.slot;
  const m = await processImage(req.file.buffer, { storeId: req.store.id, kind });
  const col = kind === 'logo' ? 'logo_media_id' : 'cover_media_id';
  const old = getMedia(req.store[col]);
  q.run(`UPDATE stores SET ${col}=? WHERE id=?`, [m.id, req.store.id]);
  q.run('UPDATE media SET attached=1 WHERE id=?', [m.id]);
  if (old) await deleteMedia(old);
  res.json({ media: serializeMedia(m) });
}));

/* ---------------------------------------------------------- overview & analytics */

function periodStats(storeId, days) {
  const from = days[0], to = days[days.length - 1];
  const o = q.get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS sales FROM orders WHERE store_id=? AND ${NOT_CANCELLED} AND ${LOCAL_DAY} BETWEEN ? AND ?`, [storeId, from, to]);
  const customers = q.val(`SELECT COUNT(*) FROM customers WHERE store_id=? AND ${LOCAL_DAY} BETWEEN ? AND ?`, [storeId, from, to]);
  const visits = q.val('SELECT COALESCE(SUM(visits),0) FROM store_visits WHERE store_id=? AND day BETWEEN ? AND ?', [storeId, from, to]);
  return { ...o, aov: o.orders ? Math.round(o.sales / o.orders) : 0, customers, visits, conversion: visits ? Math.round((o.orders / visits) * 1000) / 10 : 0 };
}

function series(storeId, days) {
  const rows = q.all(`SELECT ${LOCAL_DAY} AS day, COUNT(*) AS orders, SUM(total) AS sales FROM orders WHERE store_id=? AND ${NOT_CANCELLED} AND ${LOCAL_DAY} BETWEEN ? AND ? GROUP BY day`, [storeId, days[0], days.at(-1)]);
  const visits = q.all('SELECT day, visits FROM store_visits WHERE store_id=? AND day BETWEEN ? AND ?', [storeId, days[0], days.at(-1)]);
  const map = new Map(rows.map((x) => [x.day, x]));
  const vmap = new Map(visits.map((x) => [x.day, x.visits]));
  return days.map((d) => ({ day: d, sales: map.get(d)?.sales || 0, orders: map.get(d)?.orders || 0, visits: vmap.get(d) || 0 }));
}

function orderCards(rows) {
  if (!rows.length) return [];
  const ids = rows.map((o) => o.id);
  const items = q.all(`SELECT order_id, media_id, qty FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`, ids);
  const media = mediaMap(items.map((i) => i.media_id));
  return rows.map((o) => {
    const its = items.filter((i) => i.order_id === o.id);
    return {
      id: o.id, number: o.number, status: o.status, customer: o.customer_name, phone: o.phone, city: o.city, governorate: o.governorate,
      total: o.total, createdAt: o.created_at, itemsCount: its.reduce((s, i) => s + i.qty, 0),
      images: its.slice(0, 3).map((i) => media.get(i.media_id)).filter(Boolean),
    };
  });
}

r.get('/overview', h((req, res) => {
  const n = [7, 30, 90].includes(Number(req.query.range)) ? Number(req.query.range) : 7;
  const sid = req.store.id;
  const days = rangeDays(n * 2);
  const prev = days.slice(0, n), cur = days.slice(n);
  const a = periodStats(sid, cur), b = periodStats(sid, prev);
  const today = cur.at(-1);
  const todayStats = q.get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS sales FROM orders WHERE store_id=? AND ${NOT_CANCELLED} AND ${LOCAL_DAY}=?`, [sid, today]);
  const statusCounts = Object.fromEntries(q.all('SELECT status, COUNT(*) AS c FROM orders WHERE store_id=? GROUP BY status', [sid]).map((x) => [x.status, x.c]));
  const recent = orderCards(q.all('SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC LIMIT 6', [sid]));
  const top = q.all(
    `SELECT oi.product_id AS id, oi.name_ar, oi.name_en, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue, MAX(oi.media_id) AS media_id
     FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.store_id=? AND o.${NOT_CANCELLED} AND date(o.created_at,'+3 hours') BETWEEN ? AND ?
     GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 5`, [sid, cur[0], today],
  );
  const tm = mediaMap(top.map((t) => t.media_id));
  const lowStock = q.all("SELECT * FROM products WHERE store_id=? AND status='active' AND track_stock=1 AND stock <= low_stock_at ORDER BY stock ASC LIMIT 5", [sid]);
  const lm = mediaMap(lowStock.map((p) => q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [p.id])));
  res.json({
    range: n,
    today: { ...todayStats, pending: statusCounts.pending || 0 },
    kpis: {
      sales: { value: a.sales, delta: pct(a.sales, b.sales) },
      orders: { value: a.orders, delta: pct(a.orders, b.orders) },
      aov: { value: a.aov, delta: pct(a.aov, b.aov) },
      customers: { value: a.customers, delta: pct(a.customers, b.customers) },
      visits: { value: a.visits, delta: pct(a.visits, b.visits) },
      conversion: { value: a.conversion, delta: Math.round((a.conversion - b.conversion) * 10) / 10 },
    },
    totals: {
      products: q.val("SELECT COUNT(*) FROM products WHERE store_id=? AND status<>'archived'", [sid]),
      customers: q.val('SELECT COUNT(*) FROM customers WHERE store_id=?', [sid]),
    },
    series: series(sid, cur),
    previousSeries: series(sid, prev).map((x) => x.sales),
    statusCounts,
    recentOrders: recent,
    topProducts: top.map((t) => ({ id: t.id, name: bi(t, 'name'), qty: t.qty, revenue: t.revenue, image: tm.get(t.media_id) || null })),
    lowStock: lowStock.map((p) => {
      const mid = q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [p.id]);
      return { id: p.id, name: bi(p, 'name'), stock: p.stock, image: lm.get(mid) || null };
    }),
  });
}));

r.get('/analytics', h((req, res) => {
  const n = [7, 30, 90].includes(Number(req.query.range)) ? Number(req.query.range) : 30;
  const sid = req.store.id;
  const days = rangeDays(n * 2);
  const prev = days.slice(0, n), cur = days.slice(n);
  const a = periodStats(sid, cur), b = periodStats(sid, prev);
  const between = [sid, cur[0], cur.at(-1)];
  const byCategory = q.all(
    `SELECT COALESCE(c.name_en,'Other') AS name_en, COALESCE(c.name_ar,'أخرى') AS name_ar, SUM(oi.qty*oi.price) AS revenue, SUM(oi.qty) AS qty
     FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
     WHERE o.store_id=? AND o.status<>'cancelled' AND date(o.created_at,'+3 hours') BETWEEN ? AND ? GROUP BY c.id ORDER BY revenue DESC`, between,
  );
  const byCity = q.all(`SELECT city, COUNT(*) AS orders, SUM(total) AS sales FROM orders WHERE store_id=? AND ${NOT_CANCELLED} AND ${LOCAL_DAY} BETWEEN ? AND ? GROUP BY city ORDER BY orders DESC LIMIT 6`, between);
  const byHour = q.all(`SELECT CAST(strftime('%H', created_at, '+3 hours') AS INTEGER) AS hour, COUNT(*) AS orders FROM orders WHERE store_id=? AND ${LOCAL_DAY} BETWEEN ? AND ? GROUP BY hour`, between);
  const hours = Array.from({ length: 24 }, (_, hh) => ({ hour: hh, orders: byHour.find((x) => x.hour === hh)?.orders || 0 }));
  const byWeekday = q.all(`SELECT CAST(strftime('%w', created_at, '+3 hours') AS INTEGER) AS wd, COUNT(*) AS orders, SUM(total) AS sales FROM orders WHERE store_id=? AND ${NOT_CANCELLED} AND ${LOCAL_DAY} BETWEEN ? AND ? GROUP BY wd`, between);
  const top = q.all(
    `SELECT oi.product_id AS id, oi.name_ar, oi.name_en, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue, MAX(oi.media_id) AS media_id
     FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.store_id=? AND o.status<>'cancelled' AND date(o.created_at,'+3 hours') BETWEEN ? AND ?
     GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 8`, between,
  );
  const tm = mediaMap(top.map((t) => t.media_id));
  const repeat = q.get('SELECT SUM(orders_count>1) AS repeat, COUNT(*) AS total FROM customers WHERE store_id=?', [sid]);
  const views = q.val("SELECT COALESCE(SUM(views),0) FROM products WHERE store_id=?", [sid]);
  const statusCounts = Object.fromEntries(q.all(`SELECT status, COUNT(*) AS c FROM orders WHERE store_id=? AND ${LOCAL_DAY} BETWEEN ? AND ? GROUP BY status`, between).map((x) => [x.status, x.c]));
  res.json({
    range: n,
    kpis: {
      sales: { value: a.sales, delta: pct(a.sales, b.sales) },
      orders: { value: a.orders, delta: pct(a.orders, b.orders) },
      aov: { value: a.aov, delta: pct(a.aov, b.aov) },
      visits: { value: a.visits, delta: pct(a.visits, b.visits) },
      conversion: { value: a.conversion, delta: Math.round((a.conversion - b.conversion) * 10) / 10 },
      repeatRate: { value: repeat.total ? Math.round((repeat.repeat / repeat.total) * 1000) / 10 : 0 },
    },
    series: series(sid, cur),
    previousSeries: series(sid, prev).map((x) => x.sales),
    byCategory: byCategory.map((c) => ({ name: bi(c, 'name'), revenue: c.revenue, qty: c.qty })),
    byCity,
    byHour: hours,
    byWeekday: Array.from({ length: 7 }, (_, d) => byWeekday.find((x) => x.wd === d) || { wd: d, orders: 0, sales: 0 }),
    topProducts: top.map((t) => ({ id: t.id, name: bi(t, 'name'), qty: t.qty, revenue: t.revenue, image: tm.get(t.media_id) || null })),
    funnel: { visits: a.visits, productViews: Math.min(views, Math.round(a.visits * 2.4)), orders: a.orders },
    statusCounts,
  });
}));

/* ---------------------------------------------------------- media */

r.post('/media', upload.array('files', 12), h(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw badRequest('no_file', 'Please choose at least one image.');
  const kind = ['product', 'banner', 'category', 'logo', 'cover'].includes(req.query.kind) ? req.query.kind : 'product';
  const out = [];
  for (const f of files) out.push(serializeMedia(await processImage(f.buffer, { storeId: req.store.id, kind })));
  res.status(201).json({ media: out });
}));

r.delete('/media/:id', h(async (req, res) => {
  const m = q.get('SELECT * FROM media WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!m) throw notFound('Image');
  const inUse = q.val('SELECT COUNT(*) FROM product_media WHERE media_id=?', [m.id]);
  if (!inUse) await deleteMedia(m);
  res.status(204).end();
}));

/* ---------------------------------------------------------- products */

function firstImage(productIds) {
  if (!productIds.length) return new Map();
  const rows = q.all(`SELECT product_id, media_id FROM product_media WHERE product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY is_primary DESC, position`, productIds);
  const first = new Map();
  for (const row of rows) if (!first.has(row.product_id)) first.set(row.product_id, row.media_id);
  const media = mediaMap([...first.values()]);
  return new Map([...first].map(([pid, mid]) => [pid, media.get(mid)]));
}

r.get('/products', h((req, res) => {
  const sid = req.store.id;
  const { q: term, status, category, stock, sort = 'newest' } = req.query;
  const where = ['p.store_id=?'];
  const params = [sid];
  if (status && status !== 'all') { where.push('p.status=?'); params.push(String(status)); } else where.push("p.status<>'archived'");
  if (category) { where.push('p.category_id=?'); params.push(Number(category)); }
  if (stock === 'low') where.push('p.track_stock=1 AND p.stock>0 AND p.stock<=p.low_stock_at');
  if (stock === 'out') where.push('p.track_stock=1 AND p.stock<=0');
  if (term) { const like = `%${String(term).slice(0, 60)}%`; where.push('(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.sku LIKE ?)'); params.push(like, like, like); }
  const order = { newest: 'p.created_at DESC', oldest: 'p.created_at ASC', price_asc: 'p.price ASC', price_desc: 'p.price DESC', stock: 'p.stock ASC', best: 'p.sold_count DESC', name: 'p.name_en ASC' }[sort] || 'p.created_at DESC';
  const limit = clampInt(req.query.limit, 1, 100, 24);
  const page = clampInt(req.query.page, 1, 1000, 1);
  const total = q.val(`SELECT COUNT(*) FROM products p WHERE ${where.join(' AND ')}`, params);
  const rows = q.all(
    `SELECT p.*, c.name_ar AS cat_ar, c.name_en AS cat_en, (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) AS variant_count
     FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );
  const images = firstImage(rows.map((p) => p.id));
  const counts = q.get(
    `SELECT COUNT(*) AS all_, SUM(status='active') AS active, SUM(status='draft') AS draft,
      SUM(track_stock=1 AND stock>0 AND stock<=low_stock_at) AS low, SUM(track_stock=1 AND stock<=0) AS out_
     FROM products WHERE store_id=? AND status<>'archived'`, [sid],
  );
  res.json({
    items: rows.map((p) => ({
      id: p.id, slug: p.slug, name: bi(p, 'name'), price: p.price, compareAt: p.compare_at_price, sku: p.sku, status: p.status,
      stock: p.stock, stockStatus: stockStatus(p), trackStock: !!p.track_stock, sold: p.sold_count, featured: !!p.featured,
      category: p.cat_en ? { ar: p.cat_ar, en: p.cat_en } : null, variantCount: p.variant_count, image: images.get(p.id) || null, updatedAt: p.updated_at,
    })),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    counts: { all: counts.all_ || 0, active: counts.active || 0, draft: counts.draft || 0, low: counts.low || 0, out: counts.out_ || 0 },
  });
}));

r.get('/products/:id', h((req, res) => {
  const p = q.get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!p) throw notFound('Product');
  res.json({
    product: {
      ...serializeProductDetail(p),
      status: p.status, cost: p.cost, featured: !!p.featured, isNewFlag: !!p.is_new, categoryId: p.category_id,
      compareAt: p.compare_at_price, sold: p.sold_count, views: p.views,
    },
  });
}));

const colorSchema = z.object({ name_ar: z.string().trim().min(1).max(30), name_en: z.string().trim().min(1).max(30), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
const productSchema = z.object({
  name_ar: z.string().trim().min(2, 'required').max(120),
  name_en: z.string().trim().min(2, 'required').max(120),
  description_ar: z.string().trim().max(4000).optional().default(''),
  description_en: z.string().trim().max(4000).optional().default(''),
  price: z.coerce.number().int().min(1, 'price_required').max(1_000_000),
  compare_at_price: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  cost: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  sku: z.string().trim().max(60).optional().nullable(),
  category_id: z.coerce.number().int().nullable().optional(),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  featured: z.boolean().optional().default(false),
  is_new: z.boolean().optional().default(false),
  colors: z.array(colorSchema).max(12).default([]),
  sizes: z.array(z.string().trim().min(1).max(12)).max(15).default([]),
  variants: z.array(z.object({ id: z.number().int().optional().nullable(), color: z.string().nullable().optional(), size: z.string().nullable().optional(), stock: z.coerce.number().int().min(0).max(100000), sku: z.string().max(60).optional().nullable() })).max(200).default([]),
  track_stock: z.boolean().optional().default(true),
  stock: z.coerce.number().int().min(0).max(100000).optional().default(0),
  low_stock_at: z.coerce.number().int().min(0).max(1000).optional().default(5),
  media: z.array(z.number().int()).max(15).default([]),
  primary_media_id: z.number().int().nullable().optional(),
  seo_title: z.string().trim().max(70).optional().nullable(),
  seo_description: z.string().trim().max(170).optional().nullable(),
}).refine((d) => !d.compare_at_price || d.compare_at_price > d.price, { message: 'compare_gt_price', path: ['compare_at_price'] });

function uniqueSlug(storeId, base, exceptId = 0) {
  let slug = slugify(base);
  let i = 1;
  while (q.val('SELECT id FROM products WHERE store_id=? AND slug=? AND id<>?', [storeId, slug, exceptId])) slug = `${slugify(base)}-${++i}`;
  return slug;
}

function saveProduct(storeId, data, existing) {
  return tx(() => {
    if (data.category_id && !q.val('SELECT id FROM categories WHERE id=? AND store_id=?', [data.category_id, storeId])) throw badRequest('invalid_category', 'Category not found.');
    const mediaIds = data.media.filter((id) => q.val('SELECT id FROM media WHERE id=? AND store_id=?', [id, storeId]));
    const variants = data.variants.filter((v) => v.color || v.size);
    const stock = variants.length ? variants.reduce((s, v) => s + v.stock, 0) : data.stock;
    const row = {
      name_ar: data.name_ar, name_en: data.name_en, description_ar: data.description_ar, description_en: data.description_en,
      price: data.price, compare_at_price: data.compare_at_price || null, cost: data.cost ?? null, sku: data.sku || null,
      category_id: data.category_id || null, status: data.status, featured: data.featured ? 1 : 0, is_new: data.is_new ? 1 : 0,
      colors_json: JSON.stringify(data.colors), sizes_json: JSON.stringify(data.sizes), track_stock: data.track_stock ? 1 : 0,
      stock, low_stock_at: data.low_stock_at, seo_title: data.seo_title || null, seo_description: data.seo_description || null, updated_at: nowIso(),
    };
    let id;
    if (existing) {
      id = existing.id;
      update('products', id, row);
    } else {
      id = insert('products', { ...row, store_id: storeId, slug: uniqueSlug(storeId, data.name_en) });
    }
    // media: order as sent, primary flagged
    q.run('DELETE FROM product_media WHERE product_id=?', [id]);
    const primary = mediaIds.includes(data.primary_media_id) ? data.primary_media_id : mediaIds[0];
    mediaIds.forEach((mid, i) => {
      insert('product_media', { product_id: id, media_id: mid, position: i, is_primary: mid === primary ? 1 : 0 });
      q.run('UPDATE media SET attached=1 WHERE id=?', [mid]);
    });
    // variants: upsert & prune
    const keep = [];
    for (const v of variants) {
      if (v.id && q.val('SELECT id FROM variants WHERE id=? AND product_id=?', [v.id, id])) {
        q.run('UPDATE variants SET color=?, size=?, stock=?, sku=? WHERE id=?', [v.color || null, v.size || null, v.stock, v.sku || null, v.id]);
        keep.push(v.id);
      } else keep.push(insert('variants', { product_id: id, color: v.color || null, size: v.size || null, stock: v.stock, sku: v.sku || null }));
    }
    q.run(`DELETE FROM variants WHERE product_id=? ${keep.length ? `AND id NOT IN (${keep.join(',')})` : ''}`, [id]);
    return id;
  });
}

r.post('/products', h((req, res) => {
  const data = productSchema.parse(req.body);
  const id = saveProduct(req.store.id, data, null);
  res.status(201).json({ product: serializeProductDetail(q.get('SELECT * FROM products WHERE id=?', [id])) });
}));

r.put('/products/:id', h((req, res) => {
  const p = q.get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!p) throw notFound('Product');
  const data = productSchema.parse(req.body);
  saveProduct(req.store.id, data, p);
  res.json({ product: serializeProductDetail(q.get('SELECT * FROM products WHERE id=?', [p.id])) });
}));

/** Quick edits from the list / mobile: price, stock, status. */
r.patch('/products/:id', h((req, res) => {
  const p = q.get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!p) throw notFound('Product');
  const body = z.object({
    price: z.coerce.number().int().min(1).max(1_000_000).optional(),
    compare_at_price: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
    stock: z.coerce.number().int().min(0).max(100000).optional(),
    status: z.enum(['active', 'draft', 'archived']).optional(),
    featured: z.boolean().optional(),
  }).parse(req.body);
  const price = body.price ?? p.price;
  const cmp = body.compare_at_price === undefined ? p.compare_at_price : body.compare_at_price;
  if (cmp && cmp <= price) throw new AppError(422, 'validation_failed', 'Compare-at price must be higher than price.', { compare_at_price: 'compare_gt_price' });
  const hasVariants = q.val('SELECT COUNT(*) FROM variants WHERE product_id=?', [p.id]) > 0;
  if (body.stock !== undefined && hasVariants) throw badRequest('has_variants', 'Update stock per variant for this product.');
  update('products', p.id, { price: body.price, compare_at_price: body.compare_at_price === undefined ? undefined : body.compare_at_price || null, stock: body.stock, status: body.status, featured: body.featured === undefined ? undefined : Number(body.featured), updated_at: nowIso() });
  const np = q.get('SELECT * FROM products WHERE id=?', [p.id]);
  res.json({ product: { id: np.id, price: np.price, compareAt: np.compare_at_price, stock: np.stock, status: np.status, stockStatus: stockStatus(np), featured: !!np.featured } });
}));

r.patch('/variants/:id', h((req, res) => {
  const v = q.get('SELECT v.*, p.store_id FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?', [req.params.id]);
  if (!v || v.store_id !== req.store.id) throw notFound('Variant');
  const { stock } = z.object({ stock: z.coerce.number().int().min(0).max(100000) }).parse(req.body);
  tx(() => {
    q.run('UPDATE variants SET stock=? WHERE id=?', [stock, v.id]);
    q.run('UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=?), updated_at=? WHERE id=?', [v.product_id, nowIso(), v.product_id]);
  });
  const p = q.get('SELECT * FROM products WHERE id=?', [v.product_id]);
  res.json({ variant: { id: v.id, stock }, product: { id: p.id, stock: p.stock, stockStatus: stockStatus(p) } });
}));

r.delete('/products/:id', h((req, res) => {
  const p = q.get('SELECT * FROM products WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!p) throw notFound('Product');
  const hasOrders = q.val('SELECT COUNT(*) FROM order_items WHERE product_id=?', [p.id]);
  if (hasOrders) q.run("UPDATE products SET status='archived' WHERE id=?", [p.id]);
  else q.run('DELETE FROM products WHERE id=?', [p.id]);
  res.json({ archived: !!hasOrders });
}));

/* ---------------------------------------------------------- orders */

r.get('/orders', h((req, res) => {
  const sid = req.store.id;
  const { status, q: term, sort = 'newest' } = req.query;
  const where = ['store_id=?'];
  const params = [sid];
  if (status && status !== 'all') { where.push('status=?'); params.push(String(status)); }
  if (term) { const like = `%${String(term).slice(0, 60)}%`; where.push('(number LIKE ? OR customer_name LIKE ? OR phone LIKE ?)'); params.push(like, like, like); }
  const limit = clampInt(req.query.limit, 1, 100, 20);
  const page = clampInt(req.query.page, 1, 1000, 1);
  const total = q.val(`SELECT COUNT(*) FROM orders WHERE ${where.join(' AND ')}`, params);
  const order = { newest: 'created_at DESC', oldest: 'created_at ASC', total_desc: 'total DESC', total_asc: 'total ASC' }[sort] || 'created_at DESC';
  const rows = q.all(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const counts = Object.fromEntries(q.all('SELECT status, COUNT(*) AS c FROM orders WHERE store_id=? GROUP BY status', [sid]).map((x) => [x.status, x.c]));
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({ items: orderCards(rows), total, page, pages: Math.max(1, Math.ceil(total / limit)), counts });
}));

r.get('/orders/:id', h((req, res) => {
  const o = q.get('SELECT * FROM orders WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!o) throw notFound('Order');
  const items = q.all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
  const media = mediaMap(items.map((i) => i.media_id));
  const customer = o.customer_id ? q.get('SELECT * FROM customers WHERE id=?', [o.customer_id]) : null;
  res.json({
    order: {
      id: o.id, number: o.number, status: o.status, next: ORDER_FLOW[o.status] || [], createdAt: o.created_at, updatedAt: o.updated_at,
      customer: { id: customer?.id, name: o.customer_name, phone: o.phone, governorate: o.governorate, city: o.city, address: o.address, ordersCount: customer?.orders_count || 1, totalSpent: customer?.total_spent || o.total },
      notes: o.notes, payment: o.payment_method, coupon: o.coupon_code,
      subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total,
      items: items.map((i) => ({ id: i.id, productId: i.product_id, name: bi(i, 'name'), price: i.price, qty: i.qty, color: i.color, size: i.size, image: media.get(i.media_id) || null })),
      events: q.all('SELECT status, note, created_at FROM order_events WHERE order_id=? ORDER BY id', [o.id]),
    },
  });
}));

r.patch('/orders/:id/status', h((req, res) => {
  const o = q.get('SELECT * FROM orders WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!o) throw notFound('Order');
  const { status, note } = z.object({ status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']), note: z.string().trim().max(300).optional() }).parse(req.body);
  if (!(ORDER_FLOW[o.status] || []).includes(status)) throw badRequest('invalid_transition', 'This status change is not allowed.');
  tx(() => {
    const now = nowIso();
    q.run('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, now, o.id]);
    insert('order_events', { order_id: o.id, status, note: note || null, created_at: now });
    if (status === 'cancelled') {
      // return stock
      for (const i of q.all('SELECT * FROM order_items WHERE order_id=?', [o.id])) {
        if (i.variant_id) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [i.qty, i.variant_id]);
        q.run('UPDATE products SET stock=stock+?, sold_count=MAX(0,sold_count-?) WHERE id=?', [i.qty, i.qty, i.product_id]);
      }
      if (o.customer_id) q.run('UPDATE customers SET total_spent=MAX(0,total_spent-?) WHERE id=?', [o.total, o.customer_id]);
    }
  });
  res.json({ status, next: ORDER_FLOW[status] });
}));

/* ---------------------------------------------------------- customers */

r.get('/customers', h((req, res) => {
  const sid = req.store.id;
  const { q: term, sort = 'recent' } = req.query;
  const where = ['store_id=?'];
  const params = [sid];
  if (term) { const like = `%${String(term).slice(0, 60)}%`; where.push('(name LIKE ? OR phone LIKE ? OR city LIKE ?)'); params.push(like, like, like); }
  const order = { recent: 'last_order_at DESC', spent: 'total_spent DESC', orders: 'orders_count DESC', name: 'name ASC' }[sort] || 'last_order_at DESC';
  const limit = clampInt(req.query.limit, 1, 100, 24);
  const page = clampInt(req.query.page, 1, 1000, 1);
  const total = q.val(`SELECT COUNT(*) FROM customers WHERE ${where.join(' AND ')}`, params);
  const rows = q.all(`SELECT * FROM customers WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const summary = q.get('SELECT COUNT(*) AS total, SUM(orders_count>1) AS repeat, COALESCE(AVG(total_spent),0) AS avg FROM customers WHERE store_id=?', [sid]);
  res.json({ items: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, city: c.city, governorate: c.governorate, orders: c.orders_count, spent: c.total_spent, lastOrderAt: c.last_order_at, since: c.created_at })), total, page, pages: Math.max(1, Math.ceil(total / limit)), summary: { total: summary.total, repeat: summary.repeat || 0, avg: Math.round(summary.avg) } });
}));

r.get('/customers/:id', h((req, res) => {
  const c = q.get('SELECT * FROM customers WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!c) throw notFound('Customer');
  const orders = orderCards(q.all('SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 20', [c.id]));
  res.json({ customer: { id: c.id, name: c.name, phone: c.phone, city: c.city, governorate: c.governorate, address: c.address, orders: c.orders_count, spent: c.total_spent, since: c.created_at, lastOrderAt: c.last_order_at }, orders });
}));

/* ---------------------------------------------------------- categories */

r.get('/categories', h((req, res) => {
  const rows = q.all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status<>\'archived\') AS count FROM categories c WHERE store_id=? ORDER BY sort, id', [req.store.id]);
  res.json({ items: rows.map(serializeCategory) });
}));

const catSchema = z.object({ name_ar: z.string().trim().min(1).max(40), name_en: z.string().trim().min(1).max(40), media_id: z.number().int().nullable().optional() });
r.post('/categories', h((req, res) => {
  const d = catSchema.parse(req.body);
  let slug = slugify(d.name_en), i = 1;
  while (q.val('SELECT id FROM categories WHERE store_id=? AND slug=?', [req.store.id, slug])) slug = `${slugify(d.name_en)}-${++i}`;
  const sort = (q.val('SELECT MAX(sort) FROM categories WHERE store_id=?', [req.store.id]) || 0) + 1;
  const id = insert('categories', { store_id: req.store.id, slug, name_ar: d.name_ar, name_en: d.name_en, media_id: d.media_id ?? null, sort });
  res.status(201).json({ category: serializeCategory({ ...q.get('SELECT * FROM categories WHERE id=?', [id]), count: 0 }) });
}));
r.put('/categories/:id', h((req, res) => {
  const c = q.get('SELECT * FROM categories WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!c) throw notFound('Category');
  const d = catSchema.parse(req.body);
  update('categories', c.id, { name_ar: d.name_ar, name_en: d.name_en, media_id: d.media_id === undefined ? undefined : d.media_id });
  res.json({ category: serializeCategory(q.get('SELECT * FROM categories WHERE id=?', [c.id])) });
}));
r.put('/categories-order', h((req, res) => {
  const ids = z.array(z.number().int()).parse(req.body.ids);
  tx(() => ids.forEach((id, i) => q.run('UPDATE categories SET sort=? WHERE id=? AND store_id=?', [i, id, req.store.id])));
  res.status(204).end();
}));
r.delete('/categories/:id', h((req, res) => {
  q.run('DELETE FROM categories WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  res.status(204).end();
}));

/* ---------------------------------------------------------- offers */

const offerSchema = z.object({
  type: z.enum(['percentage', 'fixed', 'free_shipping']),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, 'code_invalid'),
  title_ar: z.string().trim().min(2).max(60), title_en: z.string().trim().min(2).max(60),
  value: z.coerce.number().int().min(0).max(100000).default(0),
  min_subtotal: z.coerce.number().int().min(0).max(1000000).default(0),
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  usage_limit: z.coerce.number().int().min(1).nullable().optional(),
  active: z.boolean().default(true),
}).refine((d) => d.type !== 'percentage' || (d.value >= 1 && d.value <= 90), { message: 'percent_range', path: ['value'] })
  .refine((d) => d.type !== 'fixed' || d.value >= 1, { message: 'value_required', path: ['value'] })
  .refine((d) => !d.starts_at || !d.ends_at || d.ends_at >= d.starts_at, { message: 'end_before_start', path: ['ends_at'] });

r.get('/offers', h((req, res) => {
  res.json({ items: q.all('SELECT * FROM offers WHERE store_id=? ORDER BY active DESC, created_at DESC', [req.store.id]).map(serializeOffer) });
}));
r.post('/offers', h((req, res) => {
  const d = offerSchema.parse(req.body);
  if (q.val('SELECT id FROM offers WHERE store_id=? AND UPPER(code)=?', [req.store.id, d.code])) throw new AppError(422, 'validation_failed', 'Code already used', { code: 'code_taken' });
  const id = insert('offers', { ...d, active: d.active ? 1 : 0, store_id: req.store.id });
  res.status(201).json({ offer: serializeOffer(q.get('SELECT * FROM offers WHERE id=?', [id])) });
}));
r.put('/offers/:id', h((req, res) => {
  const o = q.get('SELECT * FROM offers WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!o) throw notFound('Offer');
  const d = offerSchema.parse(req.body);
  if (q.val('SELECT id FROM offers WHERE store_id=? AND UPPER(code)=? AND id<>?', [req.store.id, d.code, o.id])) throw new AppError(422, 'validation_failed', 'Code already used', { code: 'code_taken' });
  update('offers', o.id, { ...d, active: d.active ? 1 : 0, starts_at: d.starts_at ?? null, ends_at: d.ends_at ?? null, usage_limit: d.usage_limit ?? null });
  res.json({ offer: serializeOffer(q.get('SELECT * FROM offers WHERE id=?', [o.id])) });
}));
r.patch('/offers/:id', h((req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  q.run('UPDATE offers SET active=? WHERE id=? AND store_id=?', [active ? 1 : 0, req.params.id, req.store.id]);
  res.json({ active });
}));
r.delete('/offers/:id', h((req, res) => {
  q.run('DELETE FROM offers WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  res.status(204).end();
}));

/* ---------------------------------------------------------- banners */

const bannerSchema = z.object({
  media_id: z.number().int(), mobile_media_id: z.number().int().nullable().optional(),
  eyebrow_ar: z.string().trim().max(40).optional().default(''), eyebrow_en: z.string().trim().max(40).optional().default(''),
  title_ar: z.string().trim().max(80).optional().default(''), title_en: z.string().trim().max(80).optional().default(''),
  subtitle_ar: z.string().trim().max(160).optional().default(''), subtitle_en: z.string().trim().max(160).optional().default(''),
  cta_ar: z.string().trim().max(30).optional().default(''), cta_en: z.string().trim().max(30).optional().default(''),
  link: z.string().trim().max(200).optional().default('/shop'),
  align: z.enum(['start', 'center', 'end']).default('start'),
  tone: z.enum(['dark', 'light']).default('dark'),
  mirror_rtl: z.boolean().default(false).transform(Number),
  active: z.boolean().default(true),
});

const bannersOut = (sid) => {
  const rows = q.all('SELECT * FROM banners WHERE store_id=? ORDER BY position, id', [sid]);
  const m = mediaMap(rows.flatMap((b) => [b.media_id, b.mobile_media_id]));
  return rows.map((b) => serializeBanner(b, m));
};
r.get('/banners', h((req, res) => res.json({ items: bannersOut(req.store.id) })));
r.post('/banners', h((req, res) => {
  const d = bannerSchema.parse(req.body);
  const position = (q.val('SELECT MAX(position) FROM banners WHERE store_id=?', [req.store.id]) ?? -1) + 1;
  insert('banners', { ...d, active: d.active ? 1 : 0, store_id: req.store.id, position });
  q.run('UPDATE media SET attached=1 WHERE id IN (?,?)', [d.media_id, d.mobile_media_id || 0]);
  res.status(201).json({ items: bannersOut(req.store.id) });
}));
r.put('/banners/:id', h((req, res) => {
  const b = q.get('SELECT * FROM banners WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  if (!b) throw notFound('Banner');
  const d = bannerSchema.parse(req.body);
  update('banners', b.id, { ...d, active: d.active ? 1 : 0, mobile_media_id: d.mobile_media_id ?? null });
  res.json({ items: bannersOut(req.store.id) });
}));
r.put('/banners-order', h((req, res) => {
  const ids = z.array(z.number().int()).parse(req.body.ids);
  tx(() => ids.forEach((id, i) => q.run('UPDATE banners SET position=? WHERE id=? AND store_id=?', [i, id, req.store.id])));
  res.json({ items: bannersOut(req.store.id) });
}));
r.delete('/banners/:id', h((req, res) => {
  q.run('DELETE FROM banners WHERE id=? AND store_id=?', [req.params.id, req.store.id]);
  res.json({ items: bannersOut(req.store.id) });
}));

export default r;
