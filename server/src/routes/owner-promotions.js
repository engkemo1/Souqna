import { Router } from 'express';
import { z } from 'zod';
import { q, tx, insert } from '../db/index.js';
import { h, notFound, badRequest, AppError } from '../lib/errors.js';
import { clampInt, nowIso } from '../lib/util.js';
import { bi } from '../lib/serialize.js';
import { mediaMap } from '../lib/media.js';
import { TYPES, definitionSchema, validateDefinition, effectsOf } from '../lib/promotions/definition.js';
import { evaluateCart } from '../lib/promotions/engine.js';
import { logAudit, snapshot, changedFields, history } from '../lib/promotions/audit.js';
import { promotionAnalytics } from '../lib/promotions/analytics.js';
import { describePromotion } from '../lib/promotions/describe.js';
import { imageCategories, libraryItems, resolveOfferImage, resolveTemplate } from '../lib/promotions/templates.js';
import {
  cairoStamp, promoState, isLive, parseRow, usageCount, savePromotion, setProductInPromotion, promotionsForProduct,
  resolveProductIds, categoryChains, TEMPLATE_KEYS, indexTargets,
} from '../lib/promotions/store.js';

/** Owner-facing promotions API. Mounted by owner.js under /promotions; req.store is the authenticated store - every query is scoped to it. */
const r = Router();

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional();
const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().or(z.literal(''));
const inputSchema = z.object({
  name_ar: z.string().trim().min(2, 'name_required').max(80),
  name_en: z.string().trim().max(80).optional().nullable(),
  description_ar: z.string().trim().max(400).optional().nullable(),
  description_en: z.string().trim().max(400).optional().nullable(),
  type: z.enum(TYPES),
  status: z.enum(['draft', 'active', 'paused']).default('draft'),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
  stacking: z.enum(['exclusive', 'per_product', 'stackable']).default('per_product'),
  stack_with_coupons: z.boolean().default(true),
  image_media_id: z.coerce.number().int().positive().nullable().optional(),
  template_key: z.enum(TEMPLATE_KEYS).nullable().optional(),
  image_mode: z.enum(['auto', 'library', 'custom']).default('auto'),
  image_category: z.string().regex(/^[a-z0-9_]{1,40}$/).nullable().optional(),
  starts_at: stamp, ends_at: stamp, daily_from: hm, daily_to: hm,
  days_mask: z.coerce.number().int().min(1).max(127).default(127),
  usage_limit: z.coerce.number().int().min(1).max(10_000_000).nullable().optional(),
  per_customer_limit: z.coerce.number().int().min(1).max(1000).nullable().optional(),
  audience: z.enum(['all', 'new', 'returning', 'phones']).default('all'),
  audience_phones: z.array(z.string().max(20)).max(500).default([]),
  def: z.any(),
});

function serialize(row, { images, full = false, productIds } = {}) {
  const now = cairoStamp();
  const state = promoState(row, now);
  const def = row.def;
  const text = def ? describePromotion(def) : null;
  const out = {
    id: row.id, name: bi(row, 'name'), description: bi(row, 'description'), type: row.type, status: row.status, state,
    live: isLive(row, now), priority: row.priority, stacking: row.stacking, stackWithCoupons: !!row.stack_with_coupons,
    image: row.image_mode === 'custom' && row.image_media_id ? (images?.get(row.image_media_id) || null) : null, imageMediaId: row.image_media_id ?? null, templateKey: row.template_key,
    imageMode: row.image_mode, imageCategory: row.image_category, imageResolved: resolveOfferImage(row, productIds ?? (def ? resolveProductIds(row.store_id, def) : [])),
    startsAt: row.starts_at, endsAt: row.ends_at, dailyFrom: row.daily_from, dailyTo: row.daily_to, daysMask: row.days_mask,
    usageLimit: row.usage_limit, usageCount: usageCount(row.id), perCustomerLimit: row.per_customer_limit,
    audience: row.audience, createdAt: row.created_at, updatedAt: row.updated_at, text,
    valid: !!def && validateDefinition(row.type, def).length === 0,
  };
  if (full) {
    out.def = def; out.audiencePhones = JSON.parse(row.audience_phones_json || '[]');
    out.issues = def ? validateDefinition(row.type, def) : [{ code: 'invalid_definition', ar: 'تعريف العرض تالف.', en: 'The offer definition is damaged.' }];
  }
  return out;
}

const loadOwn = (req, id) => {
  const row = parseRow(q.get('SELECT * FROM promotions WHERE id=? AND store_id=?', [id, req.store.id]));
  if (!row) throw notFound('Offer');
  return row;
};
const imagesFor = (rows) => mediaMap(rows.map((x) => x.image_media_id));
const parseInput = (body) => {
  const p = inputSchema.safeParse(body);
  if (!p.success) throw p.error;
  return p.data;
};

/* ---------------------------------------------------------- dashboard */

r.get('/stats', h((req, res) => {
  const sid = req.store.id; const now = cairoStamp();
  const rows = q.all('SELECT * FROM promotions WHERE store_id=?', [sid]).map(parseRow);
  const counts = { total: rows.length, active: 0, scheduled: 0, expired: 0, draft: 0, paused: 0 };
  const products = new Set();
  for (const p of rows) {
    const st = promoState(p, now); counts[st]++;
    if ((st === 'active' || st === 'scheduled') && p.def) resolveProductIds(sid, p.def).forEach((id) => products.add(id));
  }
  const perf = q.get(`SELECT COUNT(DISTINCT op.order_id) AS orders, COALESCE(SUM(op.discount),0) AS discount FROM order_promotions op JOIN orders o ON o.id=op.order_id WHERE op.store_id=? AND o.status<>'cancelled' AND o.created_at >= datetime('now','-30 days')`, [sid]);
  const revenue = q.val(`SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.status<>'cancelled' AND o.created_at >= datetime('now','-30 days') AND o.id IN (SELECT order_id FROM order_promotions WHERE store_id=?)`, [sid]);
  const top = q.all(`SELECT op.promotion_id AS id, op.name_ar, op.name_en, COUNT(DISTINCT op.order_id) AS orders, SUM(op.discount) AS discount, SUM(op.applications) AS applications
    FROM order_promotions op JOIN orders o ON o.id=op.order_id WHERE op.store_id=? AND o.status<>'cancelled' GROUP BY op.promotion_id, op.name_ar, op.name_en ORDER BY orders DESC LIMIT 5`, [sid]);
  res.json({
    counts, participatingProducts: products.size,
    performance: { days: 30, orders: perf.orders || 0, discountGiven: perf.discount || 0, revenue: revenue || 0 },
    top: top.map((t) => ({ id: t.id, name: { ar: t.name_ar, en: t.name_en || t.name_ar }, orders: t.orders, discount: t.discount || 0, applications: t.applications || 0 })),
  });
}));

r.get('/', h((req, res) => {
  const state = String(req.query.state || 'all'); const term = String(req.query.q || '').trim().slice(0, 60);
  let rows = q.all('SELECT * FROM promotions WHERE store_id=? ORDER BY updated_at DESC, id DESC', [req.store.id]).map(parseRow);
  const now = cairoStamp();
  if (term) rows = rows.filter((p) => `${p.name_ar} ${p.name_en || ''}`.toLowerCase().includes(term.toLowerCase()));
  if (state !== 'all') rows = rows.filter((p) => promoState(p, now) === state);
  const images = imagesFor(rows);
  res.json({
    items: rows.map((p) => { const ids = p.def ? resolveProductIds(req.store.id, p.def) : []; return { ...serialize(p, { images, productIds: ids }), productCount: ids.length }; }),
  });
}));

/* ---------------------------------------------------------- settings & templates */

r.get('/settings', h((req, res) => res.json({ resolution: req.store.promo_resolution || 'best_savings', maxPerCart: req.store.promo_max_per_cart ?? null })));
r.put('/settings', h((req, res) => {
  const d = z.object({ resolution: z.enum(['best_savings', 'priority']), maxPerCart: z.coerce.number().int().min(1).max(20).nullable().optional() }).parse(req.body);
  q.run('UPDATE stores SET promo_resolution=?, promo_max_per_cart=? WHERE id=?', [d.resolution, d.maxPerCart ?? null, req.store.id]);
  res.json({ resolution: d.resolution, maxPerCart: d.maxPerCart ?? null });
}));

/** Shared image library: offer types x product categories. Images are stored once for all stores; the engine never reads them. */
r.get('/templates', h((req, res) => res.json({
  types: TEMPLATE_KEYS.map((key) => ({ key, name: TEMPLATE_NAMES[key], palette: TEMPLATE_PALETTE[key] })),
  categories: imageCategories().map((c) => ({ ...c, image: resolveTemplate(String(req.query.type || 'custom'), c.key)?.url || null })),
  items: libraryItems(),
})));
const TEMPLATE_NAMES = {
  buy_x_get_y: { ar: 'اشتري X واحصل على Y', en: 'Buy X Get Y' }, group_price: { ar: 'اشتري X بسعر ثابت', en: 'Buy X for a Fixed Price' },
  buy_more_save_more: { ar: 'اشتري أكتر ووفّر أكتر', en: 'Buy More Save More' }, percentage: { ar: 'خصم بنسبة مئوية', en: 'Percentage Discount' },
  fixed_amount: { ar: 'خصم بمبلغ ثابت', en: 'Fixed Amount Discount' }, bundle: { ar: 'باقة خاصة', en: 'Special Bundle' }, gift: { ar: 'هدية مجانية', en: 'Free Gift' },
  tiered_pricing: { ar: 'أسعار حسب الكمية', en: 'Tiered Pricing' }, category_reward: { ar: 'اشتري من قسم واحصل على مكافأة', en: 'Category Reward' }, custom: { ar: 'عرض مخصص', en: 'Custom Promotion' },
};
const TEMPLATE_PALETTE = {
  buy_x_get_y: ['#ff5a5f', '#ffb199'], group_price: ['#6c5ce7', '#a29bfe'], buy_more_save_more: ['#00b894', '#55efc4'], percentage: ['#e17055', '#fab1a0'],
  fixed_amount: ['#0984e3', '#74b9ff'], bundle: ['#fd79a8', '#fdcb6e'], gift: ['#d63031', '#ff7675'], tiered_pricing: ['#2d3436', '#636e72'],
  category_reward: ['#00cec9', '#81ecec'], custom: ['#341f97', '#5f27cd'],
};

/* ---------------------------------------------------------- product picker */

r.get('/products/search', h((req, res) => {
  const sid = req.store.id;
  const where = ["p.store_id=?", "p.status<>'archived'"]; const params = [sid];
  const term = String(req.query.q || '').trim().slice(0, 60);
  if (term) { const like = `%${term}%`; where.push('(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.sku LIKE ?))'); params.push(like, like, like, like, like); }
  if (req.query.category) {
    const ids = [...categoryChains(sid)].filter(([, chain]) => chain.includes(Number(req.query.category))).map(([id]) => id);
    where.push(`p.category_id IN (${(ids.length ? ids : [0]).map(() => '?').join(',')})`); params.push(...(ids.length ? ids : [0]));
  }
  if (req.query.minPrice) { where.push('p.price>=?'); params.push(Number(req.query.minPrice) || 0); }
  if (req.query.maxPrice) { where.push('p.price<=?'); params.push(Number(req.query.maxPrice) || 0); }
  if (req.query.availability === 'in') where.push("p.status='active' AND (p.track_stock=0 OR p.stock>0)");
  if (req.query.availability === 'out') where.push('p.track_stock=1 AND p.stock<=0');
  if (req.query.ids) { const ids = String(req.query.ids).split(',').map(Number).filter(Boolean).slice(0, 500); where.push(`p.id IN (${ids.map(() => '?').join(',') || '0'})`); params.push(...ids); }
  const limit = clampInt(req.query.limit, 1, 100, 30); const offset = clampInt(req.query.offset, 0, 100000, 0);
  const total = q.val(`SELECT COUNT(*) FROM products p WHERE ${where.join(' AND ')}`, params);
  const rows = q.all(`SELECT p.id, p.name_ar, p.name_en, p.price, p.sku, p.barcode, p.stock, p.track_stock, p.status, p.category_id, p.exclude_from_promotions FROM products p WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const imgIds = rows.length ? q.all(`SELECT product_id, media_id FROM product_media WHERE is_primary=1 AND product_id IN (${rows.map(() => '?').join(',')})`, rows.map((x) => x.id)) : [];
  const media = mediaMap(imgIds.map((x) => x.media_id)); const byProduct = new Map(imgIds.map((x) => [x.product_id, media.get(x.media_id)]));
  res.json({
    total, items: rows.map((p) => ({ id: p.id, name: bi(p, 'name'), price: p.price, sku: p.sku, barcode: p.barcode, stock: p.track_stock ? p.stock : null, inStock: !p.track_stock || p.stock > 0, status: p.status, categoryId: p.category_id, excluded: !!p.exclude_from_promotions, image: byProduct.get(p.id) || null })),
  });
}));

r.get('/categories', h((req, res) => {
  const rows = q.all('SELECT c.id, c.parent_id, c.name_ar, c.name_en, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status<>\'archived\') AS products FROM categories c WHERE c.store_id=? ORDER BY c.sort, c.id', [req.store.id]);
  res.json({ items: rows.map((c) => ({ id: c.id, parentId: c.parent_id, name: bi(c, 'name'), products: c.products })) });
}));

/* ---------------------------------------------------------- validate / preview (nothing is saved) */

r.post('/validate', h((req, res) => {
  const d = parseInput({ name_ar: 'x1', ...req.body });
  const def = definitionSchema.parse(d.def);
  const image = resolveOfferImage({ store_id: req.store.id, type: d.type, template_key: d.template_key || d.type, image_mode: d.image_mode, image_category: d.image_category, image_media_id: d.image_media_id }, resolveProductIds(req.store.id, def));
  res.json({ issues: validateDefinition(d.type, def, { startsAt: d.starts_at, endsAt: d.ends_at }), text: describePromotion(def), imageResolved: image });
}));

/** Run an unsaved offer against a sample cart of the owner's own products. */
r.post('/preview', h((req, res) => {
  const body = z.object({ offer: z.any(), cart: z.array(z.object({ productId: z.coerce.number().int(), qty: z.coerce.number().int().min(1).max(50) })).max(30).default([]) }).parse(req.body);
  const d = parseInput({ name_ar: 'x1', ...body.offer });
  const def = definitionSchema.parse(d.def);
  const issues = validateDefinition(d.type, def, { startsAt: d.starts_at, endsAt: d.ends_at });
  const chains = categoryChains(req.store.id);
  const lines = [];
  for (const it of body.cart) {
    const p = q.get('SELECT id, category_id, price, name_ar, name_en FROM products WHERE id=? AND store_id=?', [it.productId, req.store.id]);
    if (p) lines.push({ key: p.id, productId: p.id, price: p.price, qty: it.qty, catChain: p.category_id ? chains.get(p.category_id) || [p.category_id] : [], name: bi(p, 'name') });
  }
  const gifts = new Map(effectsOf(def).filter((e) => e.kind === 'gift').flatMap((e) => e.gifts).map((id) => [id, 99]));
  const result = issues.length ? null : evaluateCart({ lines, promotions: [{ id: 0, priority: 0, stacking: d.stacking, def }], settings: {}, giftStock: gifts });
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  res.json({ issues, text: describePromotion(def), subtotal, discount: result?.promoDiscount ?? 0, total: subtotal - (result?.promoDiscount ?? 0), lines: lines.map((l, i) => ({ name: l.name, qty: l.qty, price: l.price, discount: result?.lines[i].promoDiscount ?? 0 })), gifts: result?.gifts ?? [], hints: result?.hints ?? [] });
}));

r.get('/analytics', h((req, res) => res.json(promotionAnalytics(req.store.id, { days: clampInt(req.query.days, 1, 365, 30) }))));
r.get('/history', h((req, res) => {
  const pid = req.query.promotionId ? Number(req.query.promotionId) : null;
  res.json({ items: history(req.store.id, { promotionId: Number.isInteger(pid) ? pid : null, limit: clampInt(req.query.limit, 1, 200, 100) }) });
}));

/* ---------------------------------------------------------- bulk assignment & product form */

r.post('/bulk-assign', h((req, res) => {
  const d = z.object({ promotionIds: z.array(z.coerce.number().int()).min(1).max(50), productIds: z.array(z.coerce.number().int()).min(1).max(2000), mode: z.enum(['add', 'remove']) }).parse(req.body);
  tx(() => { for (const pid of d.promotionIds) for (const prod of d.productIds) setProductInPromotion(req.store.id, pid, prod, d.mode === 'add'); });
  for (const pid of d.promotionIds) { const row = q.get('SELECT name_ar FROM promotions WHERE id=? AND store_id=?', [pid, req.store.id]); if (row) logAudit(req, { promotionId: pid, name: row.name_ar, action: 'updated', detail: { changed: ['products'], bulk: d.mode, count: d.productIds.length } }); }
  res.json({ ok: true });
}));

const productOffers = (req, productId) => {
  const p = q.get('SELECT id, exclude_from_promotions FROM products WHERE id=? AND store_id=?', [productId, req.store.id]);
  if (!p) throw notFound('Product');
  const now = cairoStamp();
  const rows = promotionsForProduct(req.store.id, productId);
  const images = imagesFor(rows);
  return {
    excluded: !!p.exclude_from_promotions,
    items: rows.map((o) => ({ ...serialize(o, { images }), direct: !!o.def && (o.def.qualify.products.includes(productId)), stateAt: now.stamp })),
    available: q.all("SELECT * FROM promotions WHERE store_id=? AND status<>'draft'", [req.store.id]).map(parseRow).filter((o) => promoState(o, now) !== 'expired' && o.def && !o.def.qualify.all)
      .map((o) => ({ id: o.id, name: bi(o, 'name'), state: promoState(o, now), type: o.type, joined: o.def.qualify.products.includes(productId) })),
  };
};
r.get('/for-product/:productId', h((req, res) => res.json(productOffers(req, Number(req.params.productId)))));
r.put('/for-product/:productId', h((req, res) => {
  const productId = Number(req.params.productId);
  const d = z.object({ add: z.array(z.coerce.number().int()).max(50).default([]), remove: z.array(z.coerce.number().int()).max(50).default([]), exclude: z.boolean().optional() }).parse(req.body);
  if (!q.get('SELECT id FROM products WHERE id=? AND store_id=?', [productId, req.store.id])) throw notFound('Product');
  tx(() => {
    for (const id of d.add) setProductInPromotion(req.store.id, id, productId, true);
    for (const id of d.remove) setProductInPromotion(req.store.id, id, productId, false);
    if (d.exclude !== undefined) q.run('UPDATE products SET exclude_from_promotions=? WHERE id=? AND store_id=?', [d.exclude ? 1 : 0, productId, req.store.id]);
  });
  for (const [ids, on] of [[d.add, 'added'], [d.remove, 'removed']]) for (const id of ids) { const row = q.get('SELECT name_ar FROM promotions WHERE id=? AND store_id=?', [id, req.store.id]); if (row) logAudit(req, { promotionId: id, name: row.name_ar, action: 'updated', detail: { changed: ['products'], product: productId, [on]: true } }); }
  res.json(productOffers(req, productId));
}));

/* ---------------------------------------------------------- CRUD */

r.post('/', h((req, res) => {
  const d = parseInput(req.body);
  const id = savePromotion(req.store.id, d);
  const made = loadOwn(req, id);
  logAudit(req, { promotionId: id, name: made.name_ar, action: 'created', detail: { type: made.type, status: made.status } });
  res.status(201).json({ offer: serialize(loadOwn(req, id), { images: imagesFor([loadOwn(req, id)]), full: true }) });
}));

r.get('/:id', h((req, res) => {
  const row = loadOwn(req, Number(req.params.id));
  res.json({ offer: { ...serialize(row, { images: imagesFor([row]), full: true }), productCount: row.def ? resolveProductIds(req.store.id, row.def).length : 0 } });
}));

r.put('/:id', h((req, res) => {
  const row = loadOwn(req, Number(req.params.id));
  const before = snapshot(row);
  savePromotion(req.store.id, parseInput(req.body), row.id);
  const fresh = loadOwn(req, row.id);
  const changed = changedFields(before, snapshot(fresh));
  if (changed.length) logAudit(req, { promotionId: row.id, name: fresh.name_ar, action: 'updated', detail: { changed, from: before.status, to: fresh.status } });
  res.json({ offer: serialize(fresh, { images: imagesFor([fresh]), full: true }) });
}));

r.patch('/:id/status', h((req, res) => {
  const row = loadOwn(req, Number(req.params.id));
  const { status } = z.object({ status: z.enum(['draft', 'active', 'paused']) }).parse(req.body);
  if (status === 'active') {
    const issues = row.def ? validateDefinition(row.type, row.def) : [{ en: 'Damaged definition' }];
    if (issues.length) throw new AppError(422, 'promotion_invalid', issues[0].en, { issues });
  }
  q.run('UPDATE promotions SET status=?, updated_at=? WHERE id=?', [status, nowIso(), row.id]);
  if (status !== row.status) logAudit(req, { promotionId: row.id, name: row.name_ar, action: { active: 'activated', paused: 'paused', draft: 'drafted' }[status], detail: { from: row.status } });
  res.json({ offer: serialize(loadOwn(req, row.id), { images: imagesFor([row]) }) });
}));

r.post('/:id/duplicate', h((req, res) => {
  const row = loadOwn(req, Number(req.params.id));
  const id = tx(() => {
    const nid = insert('promotions', {
      store_id: req.store.id, name_ar: `${row.name_ar} (نسخة)`, name_en: row.name_en ? `${row.name_en} (copy)` : null, description_ar: row.description_ar, description_en: row.description_en,
      type: row.type, status: 'draft', priority: row.priority, stacking: row.stacking, stack_with_coupons: row.stack_with_coupons, image_media_id: row.image_media_id, template_key: row.template_key,
      starts_at: row.starts_at, ends_at: row.ends_at, daily_from: row.daily_from, daily_to: row.daily_to, days_mask: row.days_mask, usage_limit: row.usage_limit,
      per_customer_limit: row.per_customer_limit, audience: row.audience, audience_phones_json: row.audience_phones_json, rules_json: row.rules_json, created_at: nowIso(), updated_at: nowIso(),
    });
    if (row.def) indexTargets(nid, row.def);
    return nid;
  });
  logAudit(req, { promotionId: id, name: `${row.name_ar} (نسخة)`, action: 'duplicated', detail: { from: row.id } });
  res.status(201).json({ offer: serialize(loadOwn(req, id), { images: imagesFor([row]), full: true }) });
}));

r.get('/:id/products', h((req, res) => {
  const row = loadOwn(req, Number(req.params.id));
  const ids = row.def ? resolveProductIds(req.store.id, row.def) : [];
  const slice = ids.slice(0, 500);
  const rows = slice.length ? q.all(`SELECT id, name_ar, name_en, price, stock, track_stock, status FROM products WHERE store_id=? AND id IN (${slice.map(() => '?').join(',')})`, [req.store.id, ...slice]) : [];
  const imgs = slice.length ? q.all(`SELECT product_id, media_id FROM product_media WHERE is_primary=1 AND product_id IN (${slice.map(() => '?').join(',')})`, slice) : [];
  const media = mediaMap(imgs.map((x) => x.media_id)); const by = new Map(imgs.map((x) => [x.product_id, media.get(x.media_id)]));
  res.json({ total: ids.length, items: rows.map((p) => ({ id: p.id, name: bi(p, 'name'), price: p.price, inStock: !p.track_stock || p.stock > 0, status: p.status, image: by.get(p.id) || null })) });
}));

r.delete('/:id', h((req, res) => {
  const row = loadOwn(req, Number(req.params.id));
  logAudit(req, { promotionId: row.id, name: row.name_ar, action: 'deleted', detail: { status: row.status, type: row.type } });
  q.run('DELETE FROM promotions WHERE id=? AND store_id=?', [row.id, req.store.id]); // order history keeps its snapshot
  res.json({ ok: true });
}));

export default r;
