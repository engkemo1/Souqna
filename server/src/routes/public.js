import { decodeDepartments } from '@souqna/shared';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { listDepartments, customerDepartments, deptSubtree, deptAncestors, deptAttrDefs, deptProfile } from '../lib/departments.js';
import { z } from 'zod';
import { q, tx, insert, json, db } from '../db/index.js';
import { resolveAlias } from '../lib/category-aliases.js';
import { publicSlug, storedSlug } from '../lib/seo-slugs.js';
import { randomBytes } from 'node:crypto';
import { h, notFound, badRequest, AppError } from '../lib/errors.js';
import { clampInt, nowIso } from '../lib/util.js';
import { mediaMap, processImage } from '../lib/media.js';
import { recordOrderPromotions, promoItemCols, orderPromotions } from '../lib/promotions/orders.js';
import { storeOffers, productOffers, offerBadges, countView } from '../lib/promotions/public.js';
// Soft ranking: a product whose main photo scored clearly weak (<50) sits just below the others of the same standing. Older photos (no score) are never demoted.
const WEAK_PHOTO = `(CASE WHEN COALESCE((SELECT m.quality FROM product_media pm JOIN media m ON m.id=pm.media_id WHERE pm.product_id=p.id AND pm.is_primary=1 LIMIT 1), 100) < 50 THEN 1 ELSE 0 END)`;
import { sameDaySql, cairoNow } from '../lib/sameDay.js';
import { buyerFromReq } from '../lib/buyers.js';
import { recordSiteVisit, recordConversion, cairoDay } from '../lib/traffic.js';
import { logSearch, trackEvent } from '../lib/insights.js';
import { buildQuery, matchProducts, prepareRow, vocabFrom, suggestCorrection } from '../lib/search-text.js';
import { recomputeRatings } from '../lib/reviews.js';
import { publicCampaigns, recordEvent, PLACEMENT_KEYS } from '../lib/featured.js';
import { publicAdvertiser, recordAdvertiserEvent } from '../lib/advertisers.js';
import { logoBrand } from '../lib/advertiser-shop.js';
import { searchByImage, visualSettings, visualTypeOptions, VisualProviderError } from '../lib/visual.js';
import { logVisualSearch } from '../lib/visual-demand.js';
import { runStylist, modaBrain, modaCurator, modaUnderstander, modaVerifier, stylistSettings, stylistTrainingSettings, addStylistFeedback, lookOfDay, cardsByIds, liveOffersForModa, storesForModa } from '../lib/stylist.js';
import { matchStore } from '../lib/moda/stores.js';
import { contactFromEnv } from '../lib/moda/contact.js';
import { logStylist } from '../lib/stylist-log.js';
import { runModa } from '../lib/moda/engine.js';
import { getModaPrompts } from '../lib/modaPrompts.js';
import { AUDIENCE_KEYS } from '../lib/product-types.js';
import { loadKnowledge as loadModaKnowledge } from '../lib/moda/knowledge.js';
import { quote } from '../lib/cart.js';
import { computeBasketDelivery, splitSharedDeliveryFee, platformFreeApplies, getPlatformFreeShipping } from '../lib/deliveryRates.js';
import { notifyStore } from '../lib/push.js';
import { sendNewOrderAlert, notifyPlatformAlert } from '../lib/whatsapp.js';
import { confirmDeadline, reserveRecord } from '../lib/reserve.js';
import { storeHours } from '../lib/hours.js';
import { waAuthReady } from '../lib/wa.js';
import {
  serializeStore, serializeCards, serializeProductDetail, serializeCategory, serializeBanner, serializeOffer, bi,
} from '../lib/serialize.js';

const r = Router();

const cache = (res, seconds = 30) => res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);

const ACTIVE = "status='active'";
const STORE_COLS = `s.*, (SELECT COUNT(*) FROM products p WHERE p.store_id=s.id AND p.status='active') AS product_count`;

function loadStore(slug) {
  let s = q.get(`SELECT ${STORE_COLS} FROM stores s WHERE s.slug=? AND s.status='active'`, [slug]);
  if (!s) {
    const al = q.get('SELECT store_id FROM store_slug_aliases WHERE old_slug=?', [slug]);
    if (al) s = q.get(`SELECT ${STORE_COLS} FROM stores s WHERE s.id=? AND s.status='active'`, [al.store_id]);
  }
  if (!s) throw notFound('Store');
  return s;
}

/* ---------------------------------------------------------- marketplace */

/** Customer-facing tree: hidden sections and sections with nothing in them (no products, no shops) stay out unless the admin set "show when empty". */
const publicDept = ({ slug, name, sizes, image, images, parent, level, profile_effective: profile, attrs_effective: attrs, description, icon, product_count, stores_count, seo }) => ({ slug, name, sizes, image, images, parent, level, profile, attrs, description, icon, product_count, stores_count, seo });
// ?all=1: every non-hidden section (store setup, product forms and labels need sections that have no products yet)
r.get('/departments', h((req, res) => { cache(res, 60); res.json({ departments: (req.query.all ? listDepartments().filter((d) => d.visibility !== 'hidden') : customerDepartments()).map(publicDept) }); }));
/** One section's landing data: breadcrumb, own details, visible children (with images), SEO. Reads stored rows only — never generates anything. */
r.get('/departments/:slug', h((req, res) => {
  const all = listDepartments(); const by = new Map(all.map((d) => [d.slug, d]));
  const reqSlug = String(req.params.slug);
  let d = by.get(storedSlug(reqSlug)); let redirectedFrom = publicSlug(reqSlug) !== reqSlug ? reqSlug : null; // an opaque stored slug in the URL -> the page replaces it with the readable one
  if (!d) { const canon = resolveAlias(db, req.params.slug); if (canon && by.get(canon)) { redirectedFrom = String(req.params.slug); d = by.get(canon); } } // old URL -> canonical section (the page replaces its URL)
  if (!d || d.visibility === 'hidden') throw new AppError(404, 'not_found', 'Section not found.');
  const visible = new Set(customerDepartments().map((x) => x.slug));
  if (!visible.has(d.slug)) throw new AppError(404, 'not_found', 'Section not found.');
  const crumbs = []; for (let c = d, i = 0; c && i < 10; c = by.get(c.parent), i++) crumbs.unshift({ slug: publicSlug(c.slug), name: c.name });
  cache(res, 60);
  res.json({ department: publicDept(d), canonical: publicSlug(d.slug), redirected_from: redirectedFrom, breadcrumb: crumbs, children: all.filter((x) => x.parent === d.slug && visible.has(x.slug)).map(publicDept),
    // the other sections under the same parent, so a leaf page can keep showing its siblings as the filter row
    siblings: d.parent ? all.filter((x) => x.parent === d.parent && visible.has(x.slug)).map(publicDept) : [] });
}));

r.get('/homepage-ads', h((_req, res) => {
  const today = cairoNow().date;
  const items = q.all(`SELECT id, image_url, title_ar, title_en, subtitle_ar, subtitle_en, cta_ar, cta_en, link
    FROM homepage_ads WHERE active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?)
    ORDER BY position, id LIMIT 6`, [today, today]).map((ad) => ({
    id: ad.id, image: ad.image_url, title: bi(ad, 'title'), subtitle: bi(ad, 'subtitle'), cta: bi(ad, 'cta'), link: ad.link,
  }));
  cache(res, 30);
  res.json({ items });
}));

/* ---------------------------------------------------------- featured ads & offers (platform-admin campaigns) */
r.get('/featured', h((req, res) => {
  const placement = String(req.query.placement || '');
  if (!PLACEMENT_KEYS.includes(placement)) throw new AppError(422, 'validation_failed', 'Unknown placement', { placement: 'bad_value' });
  const device = ['desktop', 'mobile'].includes(String(req.query.device)) ? String(req.query.device) : null;
  cache(res, 30);
  res.json({ items: publicCampaigns({ placement, store: String(req.query.store || '').slice(0, 80) || null, category: String(req.query.category || '').slice(0, 80) || null, device }) });
}));
const featuredEvent = (event) => h((req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const counted = recordEvent({ id: Number(req.params.id) || 0, placement: String(body.placement || ''), event, ip: req.ip || '', ua: String(req.headers['user-agent'] || '').slice(0, 200) });
  res.status(202).json({ counted });
});
r.post('/featured/:id/impression', featuredEvent('impression'));
r.post('/featured/:id/click', featuredEvent('click'));
/* outside advertisers' profile pages (reached from a featured ad) */
r.get('/advertiser/:slug', h(async (req, res) => {
  const a = publicAdvertiser(req.params.slug);
  if (!a) throw new AppError(404, 'not_found', 'Page not found');
  cache(res, 30);
  res.json({ advertiser: { ...a, brand: await logoBrand(a.logo) } });
}));
r.post('/advertiser/:slug/event', h((req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const counted = recordAdvertiserEvent({ slug: req.params.slug, event: String(body.event || ''), ip: req.ip || '', ua: String(req.headers['user-agent'] || '').slice(0, 200) });
  res.status(202).json({ counted });
}));

/* ---------------------------------------------------------- global product search */

const NORM = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}),'أ','ا'),'إ','ا'),'آ','ا'),'ة','ه'),'ى','ي'),'ـ','')`;
const normText = (s) => String(s).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '').trim();

// ---- smarter search (see lib/search-text.js): words, spellings, synonyms, typos ----
let searchCache = { at: 0, vocab: new Map(), rows: [], depts: [], cats: [], stores: [] };
const searchLookups = () => {
  if (Date.now() - searchCache.at < 20000) return searchCache;
  const prods = q.all("SELECT p.id, p.name_ar, p.name_en, p.description_ar, p.description_en, p.badge_text, p.department, p.category_id, p.store_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0");
  const depts = q.all('SELECT slug, name_ar, name_en FROM departments WHERE active=1');
  const cats = q.all("SELECT c.id, c.name_ar, c.name_en FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id=c.id AND p.status='active')");
  const stores = q.all("SELECT id, name_ar, name_en FROM stores WHERE status='active' AND hidden=0");
  searchCache = {
    at: Date.now(), rows: prods.map(prepareRow), depts, cats, stores,
    vocab: vocabFrom([...prods.flatMap((n) => [n.name_ar, n.name_en]), ...depts.flatMap((d) => [d.name_ar, d.name_en]), ...cats.flatMap((c) => [c.name_ar, c.name_en])]),
  };
  return searchCache;
};
/** Products matching what the customer typed (optionally only one shop's). `ids` is ready to drop into a WHERE, `score` into an ORDER BY. */
const searchPlan = (term, onlyStore = null, opts = {}) => {
  const L = searchLookups();
  const built = buildQuery(term, { vocab: L.vocab, prefix: !!opts.prefix });
  if (!built.tokens.length) return built.onlyFiller || !built.text ? null : { level: 1, count: 0, where: '0', params: [], score: '(p.id * 0)', scoreParams: [] };
  const rows = onlyStore ? L.rows.filter((r) => r.store === onlyStore) : L.rows;
  const m = matchProducts(built.tokens, rows, L);
  const hits = m.hits.slice(0, 3000);
  return {
    level: m.level, count: hits.length,
    where: 'p.id IN (SELECT value FROM json_each(?))', params: [JSON.stringify(hits.map((x) => x.id))],
    score: `COALESCE(json_extract(?, '$."' || p.id || '"'), 0)`, scoreParams: [JSON.stringify(Object.fromEntries(hits.map((x) => [x.id, x.score])))],
  };
};

/** Autocomplete for the search box: product names (prefix matches first), departments and stores. Cheap, cached, no personal data. */
r.get('/search/suggest', h((req, res) => {
  const term = normText(String(req.query.q || '').slice(0, 40));
  if (term.length < 2) { cache(res, 60); return res.json({ products: [], departments: [], stores: [] }); }
  const like = `%${term}%`; const starts = `${term}%`;
  const plan = searchPlan(term, null, { prefix: true });
  const products = plan && plan.level <= 2 ? q.all(
    `SELECT p.name_ar, p.name_en, s.slug AS store_slug, s.name_ar AS store_ar, s.name_en AS store_en,
            (CASE WHEN ${NORM('p.name_ar')} LIKE ? OR ${NORM('p.name_en')} LIKE ? THEN 0 ELSE 1 END) AS rank
     FROM products p JOIN stores s ON s.id=p.store_id
     WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND ${plan.where}
     ORDER BY rank, ${plan.score} DESC, p.sold_count DESC LIMIT 40`, [starts, starts, ...plan.params, ...plan.scoreParams]) : [];
  const seen = new Set(); const names = [];
  for (const p of products) {
    const key = normText(p.name_ar);
    if (seen.has(key)) continue; seen.add(key);
    names.push({ name: { ar: p.name_ar, en: p.name_en } });
    if (names.length >= 6) break;
  }
  const departments = q.all(`SELECT d.slug, d.name_ar, d.name_en FROM departments d WHERE d.active=1 AND (${NORM('d.name_ar')} LIKE ? OR ${NORM('d.name_en')} LIKE ? OR d.slug LIKE ?) LIMIT 3`, [like, like, like])
    .map((d) => ({ slug: d.slug, name: { ar: d.name_ar, en: d.name_en } }));
  const stores = q.all(`SELECT s.slug, s.name_ar, s.name_en FROM stores s WHERE s.status='active' AND s.hidden=0 AND (${NORM('s.name_ar')} LIKE ? OR ${NORM('s.name_en')} LIKE ?) LIMIT 3`, [like, like])
    .map((x) => ({ slug: x.slug, name: { ar: x.name_ar, en: x.name_en } }));
  cache(res, 30);
  res.json({ products: names, departments, stores });
}));

/** What other shoppers search most (last 2 weeks): only words searched by at least 3 sessions' worth of searches that still find products today. Aggregate only, no personal data. */
let popularCache = { at: 0, items: [] };
r.get('/search/popular', h((_req, res) => {
  if (Date.now() - popularCache.at > 10 * 60 * 1000) {
    const rows = q.all("SELECT term, SUM(searches) AS n, SUM(misses) AS m FROM search_terms WHERE day >= date('now', '-14 day') GROUP BY term HAVING SUM(searches) >= 3 AND SUM(misses) * 2 < SUM(searches) ORDER BY n DESC LIMIT 30");
    const items = [];
    for (const row of rows) {
      if (/\d{5,}|@|https?:/i.test(row.term)) continue;
      const plan = searchPlan(row.term);
      if (plan && plan.level <= 2 && plan.count > 0) items.push(row.term);
      if (items.length >= 6) break;
    }
    popularCache = { at: Date.now(), items };
  }
  cache(res, 300);
  res.json({ items: popularCache.items });
}));

const AUD_GROUP = { men: ['men', 'unisex'], women: ['women', 'unisex'], kids: ['kids', 'boys', 'girls'], boys: ['boys', 'kids'], girls: ['girls', 'kids'], unisex: ['unisex'] };
// خامات بنستنتجها من اسم المنتج / وصفه / شارته (مفيش عمود خامة في الداتا): قطن، جينز، جلد…
const MATERIALS = [
  { key: 'cotton', ar: 'قطن', en: 'Cotton', words: ['قطن', 'cotton'] },
  { key: 'denim', ar: 'جينز / دنيم', en: 'Denim', words: ['جينز', 'دنيم', 'denim', 'jeans'] },
  { key: 'leather', ar: 'جلد', en: 'Leather', words: ['جلد', 'leather'] },
  { key: 'linen', ar: 'كتان', en: 'Linen', words: ['كتان', 'linen'] },
  { key: 'wool', ar: 'صوف / تريكو', en: 'Wool & knit', words: ['صوف', 'تريكو', 'wool', 'knit'] },
  { key: 'fleece', ar: 'فليس', en: 'Fleece', words: ['فليس', 'fleece'] },
  { key: 'polyester', ar: 'بوليستر', en: 'Polyester', words: ['بوليستر', 'polyester'] },
  { key: 'satin', ar: 'ساتان / حرير', en: 'Satin & silk', words: ['ساتان', 'حرير', 'satin', 'silk'] },
  { key: 'chiffon', ar: 'شيفون', en: 'Chiffon', words: ['شيفون', 'chiffon'] },
  { key: 'velvet', ar: 'مخمل / قطيفة', en: 'Velvet', words: ['مخمل', 'قطيفه', 'velvet'] },
  { key: 'stretch', ar: 'استريتش / لايكرا', en: 'Stretch', words: ['استريتش', 'لايكرا', 'stretch', 'lycra'] },
  { key: 'dryfit', ar: 'دراي فيت', en: 'Dri-fit', words: ['دراي فيت', 'دراي-فيت', 'dri fit', 'dri-fit', 'dryfit'] },
];
const MATERIAL_KEYS = new Set(MATERIALS.map((m) => m.key));
const MAT_TEXT = () => `(' ' || ${NORM('COALESCE(p.name_ar,\'\')')} || ' ' || ${NORM('COALESCE(p.name_en,\'\')')} || ' ' || ${NORM('COALESCE(p.description_ar,\'\')')} || ' ' || ${NORM('COALESCE(p.description_en,\'\')')} || ' ' || ${NORM('COALESCE(p.badge_text,\'\')')})`;
const matCond = (m) => ({ sql: `(${m.words.map(() => `${MAT_TEXT()} LIKE ?`).join(' OR ')})`, params: m.words.map((w) => `%${normText(w)}%`) });

// sold-out products stay visible (own page, SEO) but always sort after the ones that can be bought
const SOLD_OUT_LAST = '(CASE WHEN p.track_stock=1 AND p.stock<=0 THEN 1 ELSE 0 END) ASC';

const AUD_DEPT = { men: 'men', women: 'women', kids: 'kids', boys: 'kids', girls: 'kids' };

r.get('/search', h((req, res) => {
  const { q: term = '', department = '', store = '', sort = 'relevance', min, max, page = '1', sale, new: isNew, in_stock: inStock, rating, ids, sizes, colors } = req.query;
  const where = ["p.status='active'", "s.status='active'", 's.hidden=0']; const params = [];
  if (ids) {
    const list = String(ids).split(',').map(Number).filter(Boolean).slice(0, 100);
    if (!list.length) return res.json({ items: [], total: 0, page: 1, pages: 1, price: { min: 0, max: 0 }, facets: { departments: [], stores: [] } });
    where.push(`p.id IN (${list.map(() => '?').join(',')})`);
    params.push(...list);
  }
  // relevance + matching live in lib/search-text.js: words match at the start of a word, spellings / synonyms / typos are understood,
  // and if nothing matches strictly the search widens (descriptions, then "at least one word") instead of showing an empty page.
  const plan = searchPlan(term);
  const scoreSql = plan ? [plan.score] : []; const scoreParams = plan ? [...plan.scoreParams] : [];
  if (plan) { where.push(plan.where); params.push(...plan.params); }
  if (min) { where.push('p.price >= ?'); params.push(clampInt(min, 0, 1e7, 0)); }
  if (max) { where.push('p.price <= ?'); params.push(clampInt(max, 0, 1e7, 1e7)); }
  if (sale === '1') where.push('p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price');
  if (isNew) { const days = isNew === '1' ? 30 : [7, 30, 90].includes(Number(isNew)) ? Number(isNew) : 0; if (days) where.push(`(p.is_new=1 OR p.created_at >= datetime('now','-${days} days'))`); }
  if (inStock === '1') where.push('(p.track_stock=0 OR p.stock>0)');
  if (rating === '1' || rating === '4') where.push('p.rating >= 4');
  else if (rating === '3') where.push('p.rating >= 3');
  const discMin = [20, 30, 50, 70].includes(Number(req.query.discount)) ? Number(req.query.discount) : 0;
  if (discMin) { where.push('(p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price AND (p.compare_at_price - p.price) * 100.0 / p.compare_at_price >= ?)'); params.push(discMin); }
  if (req.query.same_day === '1') { const sd = sameDaySql(); where.push(sd.sql); params.push(...sd.params); }
  // facets (counts per department / per store) are computed with every filter EXCEPT their own
  const rawCat = String(req.query.category || '').slice(0, 60);
  const KN = loadModaKnowledge();
  const typeKey = /^[a-z_]{2,30}$/.test(rawCat) && KN.items.has(rawCat) && !KN.items.get(rawCat).virtual ? rawCat : ''; // نوع المنتج (قميص/جينز…) أو اسم مجموعة قديمة
  const catKey = typeKey ? '' : normText(rawCat);
  const catClause = catKey ? `EXISTS (SELECT 1 FROM categories c WHERE c.id=p.category_id AND ${NORM('c.name_ar')}=?)` : null;
  const baseWhere = [...where]; const baseParams = [...params];
  if (catClause) { baseWhere.push(catClause); baseParams.push(catKey); } // department / store counts respect the chosen category
  const deptSlug = (() => { const raw = storedSlug(String(department)).replace(/[^a-z0-9_]/g, ''); return department && !(raw && q.get('SELECT 1 FROM departments WHERE slug=?', [raw])) ? (resolveAlias(db, department) || raw) : raw; })();
  const storeSlug = String(store).replace(/[^a-z0-9_-]/gi, '');
  const facetFrom = (extra, extraParams) => ({ sql: `FROM products p JOIN stores s ON s.id=p.store_id WHERE ${[...baseWhere, ...extra].join(' AND ')}`, params: [...baseParams, ...extraParams] });
  const deptList = deptSlug ? deptSubtree(deptSlug) : [];
  const deptIn = `p.department IN (${deptList.map(() => '?').join(',') || "''"})`;
  if (deptSlug) { where.push(deptIn); params.push(...deptList); }
  if (storeSlug) { where.push('s.slug=?'); params.push(storeSlug); }
  const preAud = { where: [...where], params: [...params] }; // the audience facet ignores its own filter
  const audKey = AUDIENCE_KEYS.has(String(req.query.audience || '')) ? String(req.query.audience) : '';
  if (audKey) {
    // "رجالي" = every product made for men, whatever its department (shoes, jalabiya, accessories…), plus unisex ones;
    // old products with no audience yet fall back to their department.
    const g = AUD_GROUP[audKey];
    const audDepts = deptSubtree(AUD_DEPT[audKey] || '_none');
    where.push(`(p.audience IN (${g.map(() => '?').join(',')}) OR (p.audience IS NULL AND p.department IN (${audDepts.map(() => '?').join(',')})))`);
    params.push(...g, ...audDepts);
  }
  const noCat = { where: [...where], params: [...params] }; // the category / type facet ignores its own filter
  if (catClause) { where.push(catClause); params.push(catKey); }
  if (typeKey) { where.push('p.moda_key=?'); params.push(typeKey); }
  const preMat = { where: [...where], params: [...params] }; // facet الخامة بتتجاهل فلتر الخامة نفسه
  const matList = String(req.query.material || '').split(',').filter((k) => MATERIAL_KEYS.has(k)).slice(0, 6);
  if (matList.length) {
    const cs = matList.map((k) => matCond(MATERIALS.find((m) => m.key === k)));
    where.push(`(${cs.map((c) => c.sql).join(' OR ')})`); params.push(...cs.flatMap((c) => c.params));
  }
  // product-type filters (material, fit, fabric, finish...): defined per department, chosen as ?a_<key>=v1,v2
  const attrDefs = deptSlug ? deptAttrDefs(deptSlug) : [];
  const attrCond = (d, vals) => ({ sql: `EXISTS (SELECT 1 FROM json_each(p.attrs_json, '$.${d.key}') j WHERE ${d.type === 'text' ? 'LOWER(j.value)' : 'j.value'} IN (${vals.map(() => '?').join(',')}))`, params: d.type === 'text' ? vals.map((v) => v.toLowerCase()) : vals });
  const attrSel = new Map();
  for (const d of attrDefs) {
    const allowed = d.type === 'text' ? null : new Set(d.options.map((x) => x.v));
    const vals = String(req.query[`a_${d.key}`] || '').split(',').map((x) => x.trim().slice(0, 40)).filter((x) => x && (!allowed || allowed.has(x))).slice(0, 8);
    if (vals.length) attrSel.set(d.key, vals);
  }
  const preAttr = { where: [...where], params: [...params] };
  for (const d of attrDefs) if (attrSel.has(d.key)) { const c = attrCond(d, attrSel.get(d.key)); where.push(c.sql); params.push(...c.params); }
  const preVariant = { where: [...where], params: [...params] }; // facets for size/colour ignore their own filter
  if (sizes) {
    const list = String(sizes).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
    if (list.length) { where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.stock>0 AND v.size IN (${list.map(() => '?').join(',')}))`); params.push(...list); }
  }
  if (colors) {
    const list = String(colors).split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^#[0-9A-F]{3,8}$/.test(x)).slice(0, 12);
    if (list.length) { where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.stock>0 AND UPPER(v.color) IN (${list.map(() => '?').join(',')}))`); params.push(...list); }
  }
  const rel = scoreSql.length ? `(${scoreSql.join(' + ')}) DESC, ` : '';
  const orderParams = [];
  const order = {
    relevance: `${rel}p.featured DESC, ${WEAK_PHOTO} ASC, p.sold_count DESC, p.id DESC`, price_asc: 'p.price ASC', price_desc: 'p.price DESC', newest: 'p.created_at DESC', best: 'p.sold_count DESC',
    discount: '(1.0*p.price/COALESCE(p.compare_at_price,p.price)) ASC, p.sold_count DESC', rating: 'p.rating DESC, p.rating_count DESC, p.sold_count DESC',
  }[sort] || 'p.sold_count DESC';
  if (sort === 'relevance' || !['price_asc', 'price_desc', 'newest', 'best', 'discount', 'rating'].includes(sort)) orderParams.push(...scoreParams);
  const limit = ids ? 100 : 24; const pg = clampInt(page, 1, 1000, 1);
  const from = `FROM products p JOIN stores s ON s.id=p.store_id WHERE ${where.join(' AND ')}`;
  const total = q.val(`SELECT COUNT(*) ${from}`, params);
  const rows = q.all(`SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en ${from} ORDER BY ${SOLD_OUT_LAST}, ${order} LIMIT ? OFFSET ?`, [...params, ...orderParams, limit, (pg - 1) * limit]);
  const items = serializeCards(rows).map((c, i) => ({ ...c, store: { slug: rows[i].store_slug, name: bi(rows[i], 'store_name') } }));
  const price = q.get(`SELECT MIN(p.price) AS min, MAX(p.price) AS max ${from}`, params);
  const fd = facetFrom(storeSlug ? ['s.slug=?'] : [], storeSlug ? [storeSlug] : []);
  // inside رجالي / حريمي / أطفال the section counts only count that audience's products (its sections + its shoes, bags…)
  const audFacet = { sql: '', params: [] };
  if (audKey) {
    const g = AUD_GROUP[audKey]; const ad = deptSubtree(AUD_DEPT[audKey] || '_none');
    audFacet.sql = ` AND (p.audience IN (${g.map(() => '?').join(',')}) OR (p.audience IS NULL AND p.department IN (${ad.map(() => '?').join(',')})))`;
    audFacet.params = [...g, ...ad];
  }
  const deptRows = q.all(`SELECT p.department AS slug, COUNT(*) AS n ${fd.sql}${audFacet.sql} AND p.department IS NOT NULL GROUP BY p.department`, [...fd.params, ...audFacet.params]);
  const deptRoll = new Map();
  for (const d of deptRows) for (const sl of [d.slug, ...deptAncestors(d.slug)]) deptRoll.set(sl, (deptRoll.get(sl) || 0) + d.n); // الأب بيعد منتجات اللي تحته
  const departments = [...deptRoll].map(([slug, n]) => ({ slug, n }));
  const fs2 = facetFrom(deptSlug ? [deptIn] : [], deptSlug ? deptList : []);
  const stores = q.all(`SELECT s.slug AS slug, s.name_ar AS name_ar, s.name_en AS name_en, COUNT(*) AS n ${fs2.sql} GROUP BY s.id ORDER BY n DESC LIMIT 12`, fs2.params)
    .map((x) => ({ slug: x.slug, name: { ar: x.name_ar, en: x.name_en }, n: x.n }));
  const audiences = q.all(`SELECT p.audience AS key, COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE ${preAud.where.join(' AND ')} AND p.audience IS NOT NULL GROUP BY p.audience ORDER BY n DESC`, preAud.params);
  const typeRows = q.all(`SELECT p.moda_key AS key, COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE ${noCat.where.join(' AND ')} AND p.moda_key IS NOT NULL GROUP BY p.moda_key ORDER BY n DESC LIMIT 16`, noCat.params);
  const typeFacet = typeRows.filter((t) => KN.items.get(t.key)).map((t) => {
    const top = q.get(`SELECT p.* FROM products p JOIN stores s ON s.id=p.store_id WHERE ${noCat.where.join(' AND ')} AND p.moda_key=? ORDER BY p.featured DESC, p.sold_count DESC LIMIT 1`, [...noCat.params, t.key]);
    const ar = String(KN.items.get(t.key).ar).replace(/\s*\(.*?\)\s*/g, '').split(' / ')[0].trim();
    return { key: t.key, name: { ar, en: ar }, n: t.n, image: top ? serializeCards([top])[0]?.image || null : null };
  });
  const catRows = q.all(`SELECT c.name_ar AS name_ar, c.name_en AS name_en, COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id JOIN categories c ON c.id=p.category_id WHERE ${noCat.where.join(' AND ')} GROUP BY ${NORM('c.name_ar')} ORDER BY n DESC LIMIT 14`, noCat.params);
  const legacyCategories = catRows.map((c) => {
    const top = q.get(`SELECT p.* FROM products p JOIN stores s ON s.id=p.store_id JOIN categories c ON c.id=p.category_id WHERE ${noCat.where.join(' AND ')} AND ${NORM('c.name_ar')}=? ORDER BY p.featured DESC, p.sold_count DESC LIMIT 1`, [...noCat.params, normText(c.name_ar)]);
    return { key: normText(c.name_ar), name: { ar: c.name_ar, en: c.name_en || c.name_ar }, n: c.n, image: top ? serializeCards([top])[0]?.image || null : null };
  });
  const categories = typeFacet.length >= 1 || typeKey ? typeFacet : legacyCategories; // أنواع المنتجات لما تكون متاحة، وإلا مجموعات المحلات القديمة
  const fromV = `FROM products p JOIN stores s ON s.id=p.store_id WHERE ${preVariant.where.join(' AND ')}`;
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'One size', 'Free size'];
  const facetSizes = q.all(`SELECT v.size AS size, CASE WHEN p.department LIKE '%shoes%' THEN 'shoes' WHEN v.size GLOB '[0-9]*' THEN 'num' ELSE 'letters' END AS grp, COUNT(DISTINCT p.id) AS n FROM variants v JOIN products p ON p.id=v.product_id JOIN stores s ON s.id=p.store_id WHERE ${preVariant.where.join(' AND ')} AND v.stock>0 AND v.size IS NOT NULL AND v.size<>'' GROUP BY v.size, grp`, preVariant.params)
    .sort((a, b) => { const ia = sizeOrder.indexOf(a.size), ib = sizeOrder.indexOf(b.size); return ia === -1 && ib === -1 ? (Number(a.size) - Number(b.size) || String(a.size).localeCompare(String(b.size))) : (ia === -1 ? 1 : ib === -1 ? -1 : ia - ib); }).slice(0, 40);
  const colorMap = new Map();
  for (const row of q.all(`SELECT p.colors_json AS cj ${fromV} LIMIT 600`, preVariant.params)) {
    for (const c of json(row.cj, [])) { const hex = String(c.hex || '').toUpperCase(); if (hex) { const e = colorMap.get(hex) || { hex, name: c.name || null, n: 0 }; e.n++; colorMap.set(hex, e); } }
  }
  const facetColors = [...colorMap.values()].sort((a, b) => b.n - a.n).slice(0, 16);
  // الخامات: عدد المنتجات لكل خامة (جوه نفس القسم والفئة) في استعلام واحد
  const matSums = MATERIALS.map((m, i) => { const c = matCond(m); return { sql: `SUM(CASE WHEN ${c.sql} THEN 1 ELSE 0 END) AS m${i}`, params: c.params }; });
  const matRow = q.get(`SELECT ${matSums.map((x) => x.sql).join(', ')} FROM products p JOIN stores s ON s.id=p.store_id WHERE ${preMat.where.join(' AND ')}`, [...matSums.flatMap((x) => x.params), ...preMat.params]) || {};
    const materials = MATERIALS.map((m, i) => ({ key: m.key, name: { ar: m.ar, en: m.en }, n: Number(matRow[`m${i}`]) || 0 })).filter((m) => m.n > 0 || matList.includes(m.key)).sort((a, b) => b.n - a.n);
  // counts per option of every department filter; each one ignores its own selection but respects the others
  const attrFacets = attrDefs.map((d) => {
    const w = [...preAttr.where]; const pr = [...preAttr.params];
    for (const o of attrDefs) if (o.key !== d.key && attrSel.has(o.key)) { const c = attrCond(o, attrSel.get(o.key)); w.push(c.sql); pr.push(...c.params); }
    const rows = q.all(`SELECT j.value AS v, COUNT(DISTINCT p.id) AS n FROM products p JOIN stores s ON s.id=p.store_id, json_each(p.attrs_json, '$.${d.key}') j WHERE ${w.join(' AND ')} AND p.attrs_json IS NOT NULL GROUP BY j.value ORDER BY n DESC LIMIT 30`, pr);
    const byV = new Map(rows.map((r) => [String(r.v), r.n]));
    const options = d.type === 'text' ? rows.map((r) => ({ v: String(r.v), ar: String(r.v), en: String(r.v), n: r.n }))
      : d.options.map((o) => ({ ...o, n: byV.get(o.v) || 0 })).filter((o) => o.n > 0 || (attrSel.get(d.key) || []).includes(o.v));
    return { key: d.key, name: { ar: d.ar, en: d.en }, type: d.type, options, selected: attrSel.get(d.key) || [] };
  }).filter((f) => f.options.length);
  if (term && !ids && pg === 1 && !department && !store && !min && !max && !sale && !isNew && !inStock && !rating && !sizes && !colors) logSearch(term, total > 0 && (!plan || plan.level <= 2)); // plain text searches only; feeds admin → تحليلات السوق
  // "did you mean": when the words didn't match as typed (nothing, or only a loose match) offer the corrected spelling if it really finds products
  let didYouMean;
  if (term && !ids && plan && (plan.level >= 3 || total === 0)) {
    const fixed = suggestCorrection(term, searchLookups().vocab);
    if (fixed && fixed !== normText(String(term))) { const p2 = searchPlan(fixed); if (p2 && p2.level <= 2 && p2.count > 0) didYouMean = fixed; }
  }
  let matchedStore = null;
  if (term && !storeSlug && pg === 1) {
    try {
      const ms = matchStore(String(term), storesForModa());
      if (ms?.store) {
        matchedStore = {
          id: ms.store.id,
          slug: ms.store.slug,
          name: { ar: ms.store.name_ar, en: ms.store.name_en || ms.store.name_ar },
          logo: ms.store.logo || null,
          address: ms.store.address_ar || '',
          city: ms.store.city || '',
          phone: ms.store.phone || '',
          whatsapp: ms.store.whatsapp || '',
          map_url: ms.store.map_url || null,
        };
      }
    } catch (_) {}
  }
  cache(res, 20);
  res.json({ items, total, didYouMean, matchedStore, match: plan ? (plan.level === 1 ? 'exact' : plan.level === 2 ? 'wide' : 'partial') : undefined, page: pg, pages: Math.max(1, Math.ceil(total / limit)), price: { min: price?.min ?? 0, max: price?.max ?? 0 }, facets: { departments, stores, sizes: facetSizes, colors: facetColors, categories, audiences, materials, attrs: attrFacets } });
}));

/* ---------------------------------------------------------- visual search: "snap it, find it in Banha" */
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const hits = new Map(); // ip -> [timestamps] (simple per-IP limit: 40 photos / hour)
r.get('/visual-search/types', h((_req, res) => res.json({ types: visualTypeOptions() })));

r.post('/visual-search', photoUpload.single('file'), h(async (req, res) => {
  const vs = visualSettings();
  if (!vs.enabled) throw new AppError(503, 'visual_disabled', 'Visual search is switched off.');
  const ip = req.ip || 'x'; const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 86400e3);
  if (recent.length >= 120 || recent.filter((t) => now - t < 3600e3).length >= 40) throw new AppError(429, 'rate_limited', 'Too many searches, try again later.');
  // free daily quota per visitor (0 = unlimited). Admin → النظام → البحث بالصورة.
  if (vs.dailyFree && recent.filter((t) => t > new Date().setHours(0, 0, 0, 0)).length >= vs.dailyFree) throw new AppError(429, 'visual_quota', 'Daily free searches used up.');
  if (!req.file) throw new AppError(422, 'validation_failed', 'Pick a photo.', { file: 'required' });
  hits.set(ip, [...recent, now]);
  const department = String(req.body?.department || '').replace(/[^a-z0-9_]/g, '');
  const type = String(req.body?.type || '').replace(/[^a-z0-9_]/g, ''); // optional: empty = detect the pieces automatically
  let found;
  let timer;
  const busy = new Promise((_, reject) => { timer = setTimeout(() => reject(new VisualProviderError('Visual search is busy, please try again in a moment.')), 25_000); timer.unref?.(); });
  try { found = await Promise.race([searchByImage(req.file.buffer, { department, type, limit: 24 }), busy]); }
  catch (e) {
    if (e instanceof VisualProviderError) throw new AppError(e.status, e.code, e.message);
    throw new AppError(422, 'invalid_image', 'This file is not a supported image.');
  } finally { clearTimeout(timer); }
  // Only genuinely similar products are returned (quality gate in searchByImage); an empty result is a valid, honest answer.
  logVisualSearch({ ip, model: found.model, department, groups: found.groups }); // demand log: what people look for and don't find
  const ids = [...new Set(found.groups.flatMap((g) => [...g.items, ...(g.similar || [])].map((x) => x.id)))];
  const byCard = new Map();
  if (ids.length) {
    const rows = q.all(
      `SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id IN (${ids.map(() => '?').join(',')})`, ids);
    const byId = new Map(rows.map((x) => [x.id, x]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    serializeCards(ordered).forEach((c, i) => byCard.set(ordered[i].id, { ...c, store: { slug: ordered[i].store_slug, name: bi(ordered[i], 'store_name') } }));
  }
  const groups = found.groups.map((g) => ({ type: g.type, label: g.label, confidence: g.confidence, items: g.items.map((x) => byCard.get(x.id)).filter(Boolean), similar: (g.similar || []).map((x) => byCard.get(x.id)).filter(Boolean) }));
  const withItems = groups.filter((g) => g.items.length);
  const first = withItems[0] || groups[0];
  res.json({ items: first?.items || [], total: withItems.reduce((n, g) => n + g.items.length, 0), groups, detected: found.detected, noMatch: withItems.length === 0 });
}));

/* Web Share Target: «Share → Twist» from Instagram / WhatsApp / the gallery (installed PWA, see manifest.webmanifest).
 * The shared photo is shrunk, kept in memory for 10 minutes and handed to /visual exactly once. Nothing is written to disk. */
const sharedPhotos = new Map(); // token -> { buf, at }
const SHARED_TTL = 600e3;
r.post('/share-target', photoUpload.single('photo'), h(async (req, res) => {
  let token = '';
  try {
    if (req.file) {
      const buf = await sharp(req.file.buffer).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      for (const [k, v] of sharedPhotos) if (Date.now() - v.at > SHARED_TTL) sharedPhotos.delete(k);
      if (sharedPhotos.size >= 20) sharedPhotos.delete(sharedPhotos.keys().next().value);
      token = crypto.randomBytes(9).toString('base64url');
      sharedPhotos.set(token, { buf, at: Date.now() });
    }
  } catch { token = ''; }
  res.redirect(303, token ? `/visual?shared=${token}` : '/visual');
}));
r.get('/visual-search/shared/:token', h((req, res) => {
  const v = sharedPhotos.get(req.params.token);
  sharedPhotos.delete(req.params.token);
  if (!v || Date.now() - v.at > SHARED_TTL) throw notFound('This shared photo has expired.');
  res.set('Cache-Control', 'no-store').type('image/jpeg').send(v.buf);
}));

/* ---------------------------------------------------------- stylist chat ("تويلا") */
const chatHits = new Map();
const brainHits = new Map();
const curatorHits = new Map();
const understandHits = new Map();
function modaCatalogRows() {
  return q.all(`SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en,
      COALESCE(c.name_ar || ' ' || c.name_en, '') AS cat_text
    FROM products p JOIN stores s ON s.id=p.store_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND (p.track_stock=0 OR p.stock>0)
    ORDER BY p.featured DESC, p.sold_count DESC, p.id DESC LIMIT 5000`);
}
function modaClientResponse(result) {
  const base = { intent: result.intent === 'brain' ? 'chat' : result.intent || (result.state === 'chat' ? 'chat' : 'shop'), state: result.state, say: result.say, tips: result.tips || [], styleTips: result.styleTips || [], questions: result.questions || [], session: result.session, remember: result.remember || {}, storeCard: result.storeCard || null };
  if (!result.blocks) return { ...base, looks: [], total: 0, weatherSource: result.weatherSource || null };
  const cards = new Map(cardsByIds(result.blocks.tabs.flatMap((tab) => tab.items.map((item) => item.id))).map((card) => [card.id, card]));
  const tabs = result.blocks.tabs.map((tab) => ({
    id: tab.id, label: tab.label, subtotal: tab.subtotal,
    items: tab.items.map((item) => ({ ...item, card: cards.get(item.id) || null })).filter((item) => item.card),
  }));
  const looks = tabs.flatMap((tab) => tab.items.map((item) => ({ label: item.label, items: [item.card], pick: 0 })));
  const missingItems = result.blocks.tabs.flatMap((tab) => tab.missing.map((item) => ({
    key: item.payload?.key || item.key, label: item.label, material: item.payload?.material,
    button: item.button, hint: item.hint, tab: tab.label,
  })));
  return {
    ...base, intent: 'shop', looks, tabs, total: result.blocks.total, budget: result.blocks.budget,
    overBudget: result.blocks.over > 0, palette: result.blocks.palette.map((color) => color.ar),
    missing: result.missing.map((item) => item.label), missingItems,
    weatherSource: result.weatherSource || null,
  };
}

r.get('/stylist/prompts', h((_req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json(getModaPrompts()); }));

r.post('/stylist', h(async (req, res) => {
  const st = stylistSettings();
  if (!st.enabled) throw new AppError(503, 'stylist_disabled', 'The stylist is switched off.');
  const body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1200) })).min(1).max(30), image: z.string().max(950000).optional(), image2: z.string().max(950000).optional(), profile: z.record(z.string(), z.string().max(500)).optional(), session: z.record(z.string(), z.any()).optional(), answers: z.record(z.string(), z.any()).optional(), startLook: z.boolean().optional(), similar: z.boolean().optional(), lang: z.enum(['ar', 'en']).optional() }).parse(req.body);
  if (body.session && JSON.stringify(body.session).length > 8000) throw new AppError(422, 'validation_failed', 'Session too large.');
  if (body.messages[body.messages.length - 1].role !== 'user') throw new AppError(422, 'validation_failed', 'Last message must be from the shopper.');
  const ip = req.ip || 'x'; const now = Date.now();
  const recent = (chatHits.get(ip) || []).filter((t) => now - t < 86400e3);
  if (recent.length >= 200 || recent.filter((t) => now - t < 3600e3).length >= 40) throw new AppError(429, 'rate_limited', 'Too many messages, try again later.');
  if (st.dailyFree && recent.filter((t) => t > new Date().setHours(0, 0, 0, 0)).length >= st.dailyFree) throw new AppError(429, 'stylist_quota', 'Daily free messages used up.');
  chatHits.set(ip, [...recent, now]);
  // a signed-in shopper's wardrobe (what she/he really bought) lets Twila build looks around it
  const me = buyerFromReq(req); let profile = body.profile;
  if (me) {
    const owned = q.all("SELECT oi.name_ar, oi.color FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.buyer_id=? AND o.status='delivered' ORDER BY o.id DESC LIMIT 8", [me.id]);
    if (owned.length) profile = { ...(profile || {}), owns: owned.map((x) => [x.name_ar, x.color].filter(Boolean).join(' ')).join('، ').slice(0, 300), ...(me.name ? { name: me.name.split(' ')[0] } : {}) };
  }
  try {
    // Photos still use the vision-capable provider. Text chat uses the local, rule-based Twila engine and live shop inventory.
    const t0 = Date.now(); const lastText = body.messages[body.messages.length - 1]?.content || '';
    if (body.image || body.image2) { const out = await runStylist(body.messages, { image: body.image, image2: body.image2, profile, session: body.session, answers: body.answers, similar: body.similar }); logStylist(lastText || '[photo]', out, Date.now() - t0, { photo: true }); return res.json(out); }
    const modaProfile = { ...(profile || {}) };
    const rows = modaCatalogRows();
    const messages = body.startLook
      ? [{ role: 'user', content: body.lang === 'en' ? 'I want a complete outfit' : 'رشحلي إطلالة كاملة' }]
      : body.messages;
    // موديل اللغة (لو متظبط) بيجاوب الأسئلة الحرة ويسأل — بحد يومي لكل عميل، وبعده المحرك بقواعده
    let brain = modaBrain();
    if (brain) {
      const cap = Number(process.env.MODA_BRAIN_DAILY ?? 40); const inner = brain;
      brain = async (a) => { const k = `${ip}`; const hits = (brainHits.get(k) || []).filter((t) => Date.now() - t < 86400e3); if (cap > 0 && hits.length >= cap) return null; brainHits.set(k, [...hits, Date.now()]); return inner(a); };
    }
    let curator = modaCurator();
    if (curator) {
      const cap = Number(process.env.MODA_CURATOR_DAILY ?? 30); const inner = curator;
      curator = async (a) => { const k = `${ip}`; const hits = (curatorHits.get(k) || []).filter((t) => Date.now() - t < 86400e3); if (cap > 0 && hits.length >= cap) return null; curatorHits.set(k, [...hits, Date.now()]); return inner(a); };
    }
    let understand = modaUnderstander();
    const verifier = modaVerifier();
    if (understand) {
      const cap = Number(process.env.MODA_UNDERSTAND_DAILY ?? 150); const inner = understand;
      understand = async (a) => { const k = `${ip}`; const hits = (understandHits.get(k) || []).filter((t) => Date.now() - t < 86400e3); if (cap > 0 && hits.length >= cap) return null; understandHits.set(k, [...hits, Date.now()]); return inner(a); };
    }
    const result = await runModa(messages, { products: rows, profile: modaProfile, session: body.session, answers: body.answers, assistantName: stylistSettings().name, brain, curator, understand, verifier, offers: liveOffersForModa, stores: storesForModa, contact: contactFromEnv(), training: stylistTrainingSettings() });
    logStylist(body.startLook ? '[start look]' : lastText, result, Date.now() - t0);
    return res.json(modaClientResponse(result));
  }
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
  const b = z.object({ title: z.string().max(80).optional(), kind: z.enum(['look', 'visual']).optional(), items: z.array(z.object({ id: z.number().int(), label: z.string().max(60).optional() })).min(1).max(12) }).parse(req.body);
  const valid = new Set(cardsByIds(b.items.map((i) => i.id)).map((c) => c.id));
  const items = b.items.filter((i) => valid.has(i.id));
  if (!items.length) throw badRequest('No valid products.');
  const token = randomBytes(6).toString('base64url');
  q.run('INSERT INTO shared_looks(token,title,items_json,kind) VALUES(?,?,?,?)', [token, (b.title || '').trim(), JSON.stringify(items), b.kind || 'look']);
  res.status(201).json({ token, url: `/look/${token}` });
}));

export function loadSharedLook(token) {
  const row = /^[\w-]{6,16}$/.test(token || '') ? q.get('SELECT * FROM shared_looks WHERE token=?', [token]) : null;
  if (!row) return null;
  let items = []; try { items = JSON.parse(row.items_json); } catch { /* empty */ }
  const cards = new Map(cardsByIds(items.map((i) => i.id)).map((c) => [c.id, c]));
  const pieces = items.map((i) => (cards.get(i.id) ? { label: i.label || '', ...cards.get(i.id) } : null)).filter(Boolean);
  return { token, title: row.title, kind: row.kind || 'look', pieces, total: pieces.reduce((s, p) => s + p.price, 0) };
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
  // a shop with no products yet (a test / just-created store) is not shown on the public pages until it has something to sell
  const where = ["s.status='active'", 's.hidden=0', "(s.show_when_empty=1 OR (SELECT COUNT(*) FROM products px WHERE px.store_id=s.id AND px.status='active') > 0)"];
  const params = [];
  if (category && category !== 'all') {
    const cl = deptSubtree(String(category).replace(/[^a-z_]/g, ''));
    // a store matches when it declared the section OR actually sells an active product filed under it
    where.push(`(${cl.map(() => 's.departments LIKE ?').join(' OR ')} OR EXISTS (SELECT 1 FROM products pd WHERE pd.store_id=s.id AND pd.status='active' AND pd.department IN (${cl.map(() => '?').join(',')})))`); params.push(...cl.map((d) => `%,${d},%`), ...cl);
  }
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
  for (const row of q.all("SELECT departments FROM stores s WHERE status='active' AND hidden=0 AND (s.show_when_empty=1 OR (SELECT COUNT(*) FROM products px WHERE px.store_id=s.id AND px.status='active') > 0)")) {
    const seen = new Set();
    for (const d of decodeDepartments(row.departments)) for (const x of [d, ...deptAncestors(d)]) if (!seen.has(x)) { seen.add(x); deptCount.set(x, (deptCount.get(x) || 0) + 1); }
  }
  // sections a store really sells in (by product), even if the owner never ticked them in settings
  for (const row of q.all("SELECT p.store_id AS sid, p.department AS d FROM products p JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND p.department IS NOT NULL GROUP BY p.store_id, p.department")) {
    const declared = new Set();
    for (const d of decodeDepartments(q.val('SELECT departments FROM stores WHERE id=?', [row.sid]) || '')) for (const x of [d, ...deptAncestors(d)]) declared.add(x);
    for (const x of [row.d, ...deptAncestors(row.d)]) if (!declared.has(x)) { declared.add(x); deptCount.set(x, (deptCount.get(x) || 0) + 1); }
  }
  const names = new Map(listDepartments().map((d) => [d.slug, d]));
  const categories = [...deptCount].filter(([id]) => names.has(id)).map(([id, count]) => ({ id, count, name: names.get(id).name })).sort((a, b) => b.count - a.count);
  const stats = {
    stores: q.val("SELECT COUNT(*) FROM stores s WHERE status='active' AND hidden=0 AND (s.show_when_empty=1 OR (SELECT COUNT(*) FROM products px WHERE px.store_id=s.id AND px.status='active') > 0)"),
    products: q.val("SELECT COUNT(*) FROM products WHERE status='active'"),
  };
  // A few trending products across stores for the marketplace home
  const trendingRows = q.all(
    `SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en FROM products p JOIN stores s ON s.id=p.store_id
     WHERE p.status='active' AND s.status='active' AND (p.track_stock=0 OR p.stock>0) ORDER BY p.sold_count DESC LIMIT 18`,
  );
  // home rails: skip sold-out items and exact repeats (same store + same name + same price), then cap the list
  const dedupe = (rows, cap) => { const seen = new Set(); const out = []; for (const r0 of rows) { const k = `${r0.store_slug}|${r0.name_ar}|${r0.price}`; if (seen.has(k)) continue; seen.add(k); out.push(r0); if (out.length >= cap) break; } return out; };
  const trendingDedup = dedupe(trendingRows, 12);
  const trending = serializeCards(trendingDedup).map((c, i) => ({ ...c, store: { slug: trendingDedup[i].store_slug, name: bi(trendingDedup[i], 'store_name') } }));
  const railRows = (sql, params = [], cap = 12) => {
    const rs0 = q.all(`SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en FROM products p JOIN stores s ON s.id=p.store_id
      WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND (p.track_stock=0 OR p.stock>0) ${sql}`, params);
    const rs = dedupe(rs0, cap);
    return serializeCards(rs).map((c, i) => ({ ...c, store: { slug: rs[i].store_slug, name: bi(rs[i], 'store_name') } }));
  };
  const newest = railRows("ORDER BY p.is_new DESC, p.created_at DESC LIMIT 30");
  const deals = railRows('AND p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price ORDER BY (p.compare_at_price - p.price) * 1.0 / p.compare_at_price DESC LIMIT 30');
  const deptCounts = q.all("SELECT p.department AS slug, COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND p.department IS NOT NULL GROUP BY p.department");
  const countBy = new Map();
  for (const d of deptCounts) for (const sl of [d.slug, ...deptAncestors(d.slug)]) countBy.set(sl, (countBy.get(sl) || 0) + d.n);
  const departments = listDepartments().map((d) => ({ slug: d.slug, name: d.name, image: d.image, parent: d.parent, products: countBy.get(d.slug) || 0 }));
  const deptRails = departments.filter((d) => !d.parent && d.products >= 3).sort((a, b) => b.products - a.products).slice(0, 4)
    .map((d) => { const sub = deptSubtree(d.slug); return { slug: d.slug, name: d.name, items: railRows(`AND p.department IN (${sub.map(() => '?').join(',')}) ORDER BY p.sold_count DESC, p.id DESC LIMIT 24`, sub, 10) }; });
  cache(res, 60);
  res.json({ stores: rows.map((s) => serializeStore(s)), categories, stats, trending, newest, deals, departments, deptRails, features: { visual: visualSettings().enabled, stylist: stylistSettings().enabled, stylistName: stylistSettings().name, stylistAvatar: stylistSettings().avatar || null } });
}));

/* ---------------------------------------------------------- storefront */

/** Which products belong to a store category: its own + its sub-categories', plus — for a platform section — every product filed under that department tree. */
function catScope(categories, c) {
  const nodes = [c, ...categories.filter((k) => k.parent_id === c.id)];
  const depts = [...new Set(nodes.filter((n) => n.system).flatMap((n) => deptSubtree(n.slug.replace(/-/g, '_'))))];
  return { ids: nodes.map((n) => n.id), depts };
}
const catWhere = (sc) => ({ sql: `(p.category_id IN (${sc.ids.map(() => '?').join(',')})${sc.depts.length ? ` OR p.department IN (${sc.depts.map(() => '?').join(',')})` : ''})`, params: [...sc.ids, ...sc.depts] });

r.get('/stores/:slug', h((req, res) => {
  const s = loadStore(req.params.slug);
  const categories = q.all('SELECT c.* FROM categories c WHERE c.store_id=? ORDER BY c.sort, c.id', [s.id]);
  for (const c of categories) {
    const w = catWhere(catScope(categories, c));
    c.count = q.val(`SELECT COUNT(*) FROM products p WHERE p.store_id=? AND p.status='active' AND ${w.sql}`, [s.id, ...w.params]);
    // no photo of its own → use the photo of the category's best product (shown, not saved), so a tile is never an empty grey box
    if (!c.media_id && c.count) {
      c.media_id = q.val(`SELECT pm.media_id FROM products p JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary=1 WHERE p.store_id=? AND p.status='active' AND ${w.sql} ORDER BY p.featured DESC, p.sold_count DESC, p.id DESC LIMIT 1`, [s.id, ...w.params]) || null;
    }
  }
  const banners = q.all('SELECT * FROM banners WHERE store_id=? AND active=1 ORDER BY position, id', [s.id]);
  const bm = mediaMap(banners.flatMap((b) => [b.media_id, b.mobile_media_id]));
  const d = new Date().toISOString().slice(0, 10);
  const offers = q.all(
    `SELECT * FROM offers WHERE store_id=? AND active=1 AND code IS NOT NULL
     AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?)
     AND (usage_limit IS NULL OR usage_count<usage_limit) ORDER BY value DESC LIMIT 3`, [s.id, d, d],
  );
  cache(res, 30);
  res.json({
    store: serializeStore(s),
    // Top-level categories carry their sub-categories (counts include them); allCategories is the flat list.
    categories: categories.filter((c) => !c.parent_id).map((c) => {
      const kids = categories.filter((k) => k.parent_id === c.id);
      return { ...serializeCategory(c), children: kids.map(serializeCategory) };
    }),
    allCategories: categories.map(serializeCategory),
    banners: banners.map((b) => serializeBanner(b, bm)),
    offers: offers.map(serializeOffer),
  });
}));

/** Adds the live offer headline to product cards (display only - the price a shopper pays always comes from the quote). */
const withBadges = (storeId, cards) => { const b = offerBadges(storeId, cards.map((c) => c.id)); return cards.map((c) => (b.has(c.id) ? { ...c, offer: b.get(c.id) } : c)); };

r.get('/stores/:slug/promotions', h((req, res) => {
  const s = loadStore(req.params.slug);
  cache(res, 20);
  const items = storeOffers(s.id);
  const media = mediaMap(items.map((o) => o.imageMediaId));
  res.json({ items: items.map(({ imageMediaId, ...o }) => ({ ...o, image: media.get(imageMediaId) || null })) });
}));

r.post('/stores/:slug/promotions/:id/view', h((req, res) => {
  const s = loadStore(req.params.slug);
  res.json({ ok: countView(s.id, Number(req.params.id) || 0, req.ip || 'unknown') });
}));

r.get('/stores/:slug/home', h((req, res) => {
  const s = loadStore(req.params.slug);
  const sec = (order, extra = '') => withBadges(s.id, serializeCards(q.all(`SELECT * FROM products WHERE store_id=? AND ${ACTIVE} ${extra} ORDER BY ${order} LIMIT 8`, [s.id])));
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
    const allCats = q.all('SELECT * FROM categories WHERE store_id=?', [s.id]);
    const cur = allCats.find((c) => c.slug === String(category));
    if (cur) { const w = catWhere(catScope(allCats, cur)); where.push(w.sql); params.push(...w.params); } else where.push('1=0');
  }
  if (term) {
    // same engine as the marketplace search, limited to this shop's products
    const plan = searchPlan(term, s.id);
    where.push(plan ? plan.where : '1=0'); if (plan) params.push(...plan.params);
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
  // department-specific filters (fabric, fit, shade, ...) for what this store sells in the current scope
  const scopeWhere = [...where]; const scopeParams = [...params];
  const scopeDepts = q.all(`SELECT p.department AS d, COUNT(*) AS n FROM products p WHERE ${scopeWhere.join(' AND ')} AND p.department IS NOT NULL GROUP BY p.department ORDER BY n DESC`, scopeParams);
  const sDefs = []; const sSeen = new Set();
  for (const { d } of scopeDepts.slice(0, 8)) for (const def of deptAttrDefs(d)) if (!sSeen.has(def.key)) { sSeen.add(def.key); sDefs.push(def); }
  const sCond = (d, vals) => ({ sql: `EXISTS (SELECT 1 FROM json_each(p.attrs_json, '$.${d.key}') j WHERE ${d.type === 'text' ? 'LOWER(j.value)' : 'j.value'} IN (${vals.map(() => '?').join(',')}))`, params: d.type === 'text' ? vals.map((v) => v.toLowerCase()) : vals });
  const sSel = new Map();
  for (const d of sDefs) {
    const allowed = d.type === 'text' ? null : new Set(d.options.map((x) => x.v));
    const vals = String(req.query[`a_${d.key}`] || '').split(',').map((x) => x.trim().slice(0, 40)).filter((x) => x && (!allowed || allowed.has(x))).slice(0, 8);
    if (vals.length) { sSel.set(d.key, vals); const c = sCond(d, vals); where.push(c.sql); params.push(...c.params); }
  }
  const order = {
    featured: `p.featured DESC, ${WEAK_PHOTO} ASC, p.sold_count DESC`,
    newest: 'p.created_at DESC',
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    best: 'p.sold_count DESC',
    discount: '(1.0*p.price/COALESCE(p.compare_at_price,p.price)) ASC',
  }[sort] || `p.featured DESC, ${WEAK_PHOTO} ASC, p.sold_count DESC`;

  const limit = clampInt(req.query.limit, 1, 48, 24);
  const page = clampInt(req.query.page, 1, 1000, 1);
  const whereSql = where.join(' AND ');
  const total = q.val(`SELECT COUNT(*) FROM products p WHERE ${whereSql}`, params);
  const rows = q.all(`SELECT p.* FROM products p WHERE ${whereSql} ORDER BY ${SOLD_OUT_LAST}, ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);

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
    items: withBadges(s.id, serializeCards(rows)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    profile: scopeDepts.length ? deptProfile(scopeDepts[0].d) : 'women',
    facets: {
      sizes: facetSizes, colors: [...colorMap.values()], price,
      attrs: sDefs.map((d) => {
        const w = [...scopeWhere]; const pr = [...scopeParams];
        for (const o of sDefs) if (o.key !== d.key && sSel.has(o.key)) { const c = sCond(o, sSel.get(o.key)); w.push(c.sql); pr.push(...c.params); }
        const rows = q.all(`SELECT j.value AS v, COUNT(DISTINCT p.id) AS n FROM products p, json_each(p.attrs_json, '$.${d.key}') j WHERE ${w.join(' AND ')} AND p.attrs_json IS NOT NULL GROUP BY j.value ORDER BY n DESC LIMIT 30`, pr);
        const byV = new Map(rows.map((r) => [String(r.v), r.n]));
        const options = d.type === 'text' ? rows.map((r) => ({ v: String(r.v), ar: String(r.v), en: String(r.v), n: r.n })) : d.options.map((o) => ({ ...o, n: byV.get(o.v) || 0 })).filter((o) => o.n > 0 || (sSel.get(d.key) || []).includes(o.v));
        return { key: d.key, name: { ar: d.ar, en: d.en }, type: d.type, options, selected: sSel.get(d.key) || [] };
      }).filter((f) => f.options.length),
    },
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
  const offers = productOffers(s.id, p.id);
  const media = mediaMap(offers.map((o) => o.imageMediaId));
  res.json({ product: serializeProductDetail(p), related: withBadges(s.id, related), offers: offers.map(({ imageMediaId, ...o }) => ({ ...o, image: media.get(imageMediaId) || null })) });
}));

/** "Similar to what you looked at": buyable products from the same sections as the given (recently viewed) products, best sellers first. */
r.get('/similar', h((req, res) => {
  const ids = [...new Set(String(req.query.ids || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 10);
  if (!ids.length) return res.json({ items: [] });
  const ph = ids.map(() => '?').join(',');
  const depts = [...new Set(q.all(`SELECT department FROM products WHERE id IN (${ph}) AND department IS NOT NULL`, ids).map((x) => x.department))];
  if (!depts.length) return res.json({ items: [] });
  const rows = q.all(`SELECT p.*, s.slug AS store_slug, s.name_ar AS store_name_ar, s.name_en AS store_name_en FROM products p JOIN stores s ON s.id=p.store_id
    WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND (p.track_stock=0 OR p.stock>0) AND p.id NOT IN (${ph}) AND p.department IN (${depts.map(() => '?').join(',')})
    ORDER BY p.featured DESC, p.sold_count DESC, p.id DESC LIMIT 12`, [...ids, ...depts]);
  cache(res, 60);
  res.json({ items: serializeCards(rows).map((c, i) => ({ ...c, store: { slug: rows[i].store_slug, name: bi(rows[i], 'store_name') } })) });
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

/* Site-wide visit beacon (one per browser session). Counts unique visitors per Cairo day without storing any IP or raw id. */
r.post('/site/visit', h((req, res) => {
  const b = z.object({ vid: z.string().min(12).max(40), src: z.string().max(20).optional(), camp: z.string().max(40).optional() }).safeParse(req.body);
  if (b.success) recordSiteVisit({ vid: b.data.vid, src: b.data.src, camp: b.data.camp, ua: req.get('user-agent') });
  res.status(204).end();
}));

r.post('/site/conversion', h((req, res) => {
  const b = z.object({ src: z.string().max(20).optional(), camp: z.string().max(40).optional() }).safeParse(req.body);
  if (b.success) recordConversion({ src: b.data.src, camp: b.data.camp, ua: req.get('user-agent') });
  res.status(204).end();
}));

r.post('/site/event', h((req, res) => {
  const b = z.object({ name: z.string().max(30) }).safeParse(req.body);
  if (b.success && !/bot|crawl|spider|headless/i.test(req.get('user-agent') || '')) trackEvent(b.data.name);
  res.status(204).end();
}));

r.post('/stores/:slug/visit', h((req, res) => {
  const s = loadStore(req.params.slug);
  const day = cairoDay();
  q.run('INSERT INTO store_visits (store_id, day, visits) VALUES (?,?,1) ON CONFLICT(store_id, day) DO UPDATE SET visits=visits+1', [s.id, day]);
  res.status(204).end();
}));

r.post('/stores/:slug/page-view', h((req, res) => {
  const s = loadStore(req.params.slug);
  const body = z.object({ path: z.string().trim().min(1).max(240) }).parse(req.body);
  const path = body.path.split(/[?#]/, 1)[0];
  const storePath = `/s/${s.slug}`;
  if ((path !== storePath && !path.startsWith(`${storePath}/`)) || path.includes('..')) throw badRequest('invalid_page', 'Invalid store page.');
  const suffix = path.slice(storePath.length) || '/';
  const pageType = suffix === '/' ? 'store' : suffix.startsWith('/p/') ? 'product' : suffix === '/categories' || suffix.startsWith('/categories/') ? 'category' : suffix === '/shop' ? 'catalog' : 'page';
  const day = cairoDay();
  q.run(`INSERT INTO store_page_views (store_id, day, path, page_type, views) VALUES (?,?,?,?,1)
    ON CONFLICT(store_id, day, path) DO UPDATE SET views=views+1`, [s.id, day, path, pageType]);
  res.status(204).end();
}));

const giftChoices = z.record(z.string(), z.coerce.number().int()).optional().nullable();
const cartItems = z.array(z.object({ productId: z.coerce.number().int(), variantId: z.coerce.number().int().nullable().optional(), qty: z.coerce.number().int().min(1).max(20) })).min(1).max(50);

/* Pieces in a basket that cannot be exchanged (the piece opted out, or the whole store accepts no exchanges), so the shopper knows before ordering. */
r.post('/marketplace/final-sale', h((req, res) => {
  const body = z.object({ items: z.array(z.object({ slug: z.string().trim().min(1).max(80), productId: z.coerce.number().int() })).min(1).max(60) }).parse(req.body);
  const seen = new Set(); const items = [];
  for (const it of body.items) {
    const key = `${it.slug}:${it.productId}`; if (seen.has(key)) continue; seen.add(key);
    const row = q.get(`SELECT p.id, p.name_ar, p.name_en, p.no_return, s.return_days FROM products p JOIN stores s ON s.id=p.store_id WHERE s.slug=? AND p.id=?`, [it.slug, it.productId]);
    if (row && (row.no_return || (row.return_days ?? 3) <= 0)) items.push({ productId: row.id, slug: it.slug, name: { ar: row.name_ar, en: row.name_en || row.name_ar } });
  }
  res.json({ items });
}));

r.post('/stores/:slug/quote', h((req, res) => {
  const s = loadStore(req.params.slug);
  const body = z.object({ items: cartItems, coupon: z.string().max(40).optional().nullable(), phone: z.string().max(20).optional().nullable(), gifts: giftChoices }).parse(req.body);
  const qt = quote(s, body.items, body.coupon, { phone: body.phone, giftChoices: body.gifts });
  const media = mediaMap(qt.lines.map((l) => l.mediaId));
  res.json({ ...qt, lines: qt.lines.map((l) => ({ ...l, image: media.get(l.mediaId) || null })) });
}));

r.post('/marketplace/delivery-fee', h((req, res) => {
  const body = z.object({ governorate: z.string().trim().min(2).max(40), city: z.string().trim().min(2).max(60), phone: z.string().max(20).optional().nullable(), stores: z.array(z.object({ slug: z.string().trim().min(1).max(80), items: cartItems, coupon: z.string().trim().max(40).optional().nullable(), gifts: giftChoices })).min(1).max(20) }).parse(req.body);
  if (new Set(body.stores.map((s) => s.slug)).size !== body.stores.length) throw badRequest('duplicate_store', 'A store can only appear once.');
  const storeQuotes = body.stores.map(({ slug, items, coupon, gifts }) => quote(loadStore(slug), items, coupon, { phone: body.phone, giftChoices: gifts }));
  const bd = computeBasketDelivery(body.stores.map((s) => s.slug), body.governorate, body.city);
  const platformFree = platformFreeApplies(storeQuotes.reduce((sum, qt) => sum + qt.subtotal - qt.discount, 0));
  const split = splitSharedDeliveryFee(bd.fee, storeQuotes.map((qt) => ({ freeShipping: platformFree || qt.shipping === 0 })));
  const needsFee = storeQuotes.some((qt) => qt.shipping > 0);
  res.json({
    platformFree,
    fee: needsFee && !platformFree ? split.customerFee : 0, feeStatus: needsFee && !platformFree && !bd.matched ? 'pending' : 'confirmed', fullRouteFee: bd.fee, storeShares: split.storeShares,
    matched: bd.matched, scope: bd.scope, pickupStops: bd.stopCount, pickupZones: bd.zones.length,
    breakdown: { zones: bd.zones.map(({ courierCost, ...z }) => z), subtotal: bd.subtotal, percent: bd.percent, discount: bd.discount, total: bd.fee },
  });
}));

r.get('/marketplace/free-shipping', h((_req, res) => res.json(getPlatformFreeShipping())));

r.get('/marketplace/delivery-areas', h((_req, res) => {
  const rows = q.all("SELECT id, governorate, city, fee, distance_km, lat, lng FROM delivery_rates WHERE city <> '*' ORDER BY id");
  res.json({
    areas: rows.map((r) => ({
      id: r.id,
      governorate: r.governorate,
      city: r.city,
      fee: r.fee,
      distanceKm: r.distance_km == null ? null : Number(r.distance_km),
      lat: r.lat == null ? null : Number(r.lat),
      lng: r.lng == null ? null : Number(r.lng),
    })),
  });
}));

/** Customer instructions: plain text only, max 500 characters. Markup is stripped (and the UI escapes on display anyway). */
export const cleanComment = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E]/g, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const commentField = z.string().max(500, 'comment_too_long').optional().default('').transform(cleanComment);

const orderSchema = z.object({
  name: z.string().trim().min(2, 'name_required').max(80),
  phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid'),
  governorate: z.string().trim().min(2, 'governorate_required').max(40),
  city: z.string().trim().min(2, 'city_required').max(60),
  address: z.string().trim().min(6, 'address_required').max(240),
  notes: commentField,                 // general order instructions
  storeNote: commentField,             // instructions for this store
  coupon: z.string().trim().max(40).optional().nullable(),
  items: cartItems,
  gifts: giftChoices,
  expectedTotal: z.number().int().min(0).max(10000000).optional(),
});

r.post('/stores/:slug/orders', h((req, res) => {
  const s = loadStore(req.params.slug);
  const body = orderSchema.parse(req.body);
  const result = tx(() => {
    const qt = quote(s, body.items, body.coupon, { phone: body.phone, giftChoices: body.gifts });
    if (body.coupon && qt.couponError) throw new AppError(409, qt.couponError, 'This coupon can no longer be applied.'); // never charge more than the customer was shown
    if (qt.hasErrors) throw new AppError(409, 'cart_changed', 'Some items in your cart are no longer available.', { lines: qt.lines });
    if (body.expectedTotal != null && body.expectedTotal !== qt.total) throw new AppError(409, 'price_changed', 'The offers or prices changed. Please review the updated total.', { total: qt.total });
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
      governorate: body.governorate, city: body.city, address: body.address, notes: body.notes, store_note: body.storeNote || null,
      status: 'pending', delivery_by: 'platform', subtotal: qt.subtotal, discount: qt.discount, promo_discount: qt.promoDiscount || 0, shipping: qt.shipping, total: qt.total,
      shipping_free: qt.shipping === 0 ? 1 : 0,
      coupon_code: qt.coupon?.code ?? null, platform_discount: qt.platformDiscount || 0, track_token: trackToken, buyer_id: buyerFromReq(req)?.id ?? null, created_at: now, updated_at: now,
    });
    recordOrderPromotions(orderId, s.id, qt, now);
    for (const l of qt.lines) {
      insert('order_items', { order_id: orderId, product_id: l.productId, variant_id: l.variantId, name_ar: l.name.ar, name_en: l.name.en, media_id: l.mediaId, color: l.color, size: l.size, price: l.price, qty: l.qty, ...promoItemCols(l) });
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
  notifyPlatformAlert(`طلب جديد من ${s.name_ar} 🛍️ ${result.number} بقيمة ${result.total} ج.م للعميل ${body.name}`);
  delete result.orderId;
  res.status(201).json({ order: result });
}));

/* ---------------------------------------------------------- "reserve & try in store"
 * The shopper holds a piece for a few hours (store setting, default 24 h), goes to the shop, tries it on and pays there.
 * Recorded as a normal order with delivery_by='pickup', no delivery fee, payment in the shop; stock is held like any order
 * and comes back automatically if the time runs out (lib/reserve.js). */
const reserveSchema = z.object({
  name: z.string().trim().min(2, 'name_required').max(80),
  phone: z.string().trim().regex(/^01[0125][0-9]{8}$/, 'phone_invalid'),
  notes: z.string().trim().max(300).optional().default(''),
  branch: z.string().trim().max(60).optional().default(''), // which branch the shopper will come to (only when the store has branches)
  items: z.array(z.object({ productId: z.coerce.number().int(), variantId: z.coerce.number().int().nullable().optional(), qty: z.coerce.number().int().min(1).max(3) })).min(1).max(3),
});

/** A named branch of the store (from stores.branches_json), or null. */
function branchOf(s, name) {
  if (!name) return null;
  try { const list = JSON.parse(s.branches_json || '[]'); return (Array.isArray(list) ? list : []).find((b) => b.name === name) || null; } catch { return null; }
}
/** Where/how to reach the shop for a pickup: the branch's own address, map link and number when it has them, else the store's. */
function pickupInfo(s, br) {
  if (!br) return { address: bi(s, 'address'), phone: s.phone || null, whatsapp: s.whatsapp || null, mapUrl: s.map_url || null, lat: s.lat ?? null, lng: s.lng ?? null };
  const addr = br.address || '';
  return { address: addr ? { ar: addr, en: addr } : bi(s, 'address'), phone: br.phone || s.phone || null, whatsapp: br.phone || s.whatsapp || null,
    mapUrl: br.map_url || (addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(/بنها|banha/i.test(addr) ? addr : `${addr} بنها`)}` : null), lat: null, lng: null };
}
const reserveHits = new Map();

r.post('/stores/:slug/reserve', h((req, res) => {
  const s = loadStore(req.params.slug);
  const hours = s.reserve_hours ?? 24;
  if (!hours) throw new AppError(409, 'reserve_off', 'This store does not take reservations.');
  const body = reserveSchema.parse(req.body);
  const branch = branchOf(s, body.branch);
  if (branch) body.notes = `الفرع: ${branch.name}${body.notes ? ` — ${body.notes}` : ''}`; // the shop sees it in the order note
  const hits = (reserveHits.get(req.ip) || []).filter((t) => Date.now() - t < 3600e3);
  if (hits.length >= 8) throw new AppError(429, 'rate_limited', 'Too many requests, try again later.');
  reserveHits.set(req.ip, [...hits, Date.now()]);
  // once WhatsApp sign-in is live, a reservation needs a number proved by a code (no fake numbers)
  if (waAuthReady()) {
    const me = buyerFromReq(req);
    if (!me || !me.phone_verified || me.phone !== body.phone) throw new AppError(401, 'verify_phone', 'Confirm your number with the WhatsApp code first.');
  }
  const record = reserveRecord(body.phone);
  if (record.blockedUntil) throw new AppError(403, 'reserve_blocked', 'Reservations are paused for this number for a while.', { until: record.blockedUntil });
  const open = q.val("SELECT COUNT(*) FROM orders WHERE store_id=? AND phone=? AND delivery_by='pickup' AND status IN ('pending','confirmed')", [s.id, body.phone]);
  if (open >= 3) throw new AppError(409, 'too_many_reservations', 'You already have reservations waiting at this store.');
  const result = tx(() => {
    const qt = quote(s, body.items, null, { phone: body.phone });
    if (qt.hasErrors) throw new AppError(409, 'cart_changed', 'This piece is no longer available.', { lines: qt.lines });
    const now = nowIso();
    const until = confirmDeadline(s).toISOString(); // first the shop confirms; the hold time starts then
    let customer = q.get('SELECT * FROM customers WHERE store_id=? AND phone=?', [s.id, body.phone]);
    if (!customer) customer = { id: insert('customers', { store_id: s.id, name: body.name, phone: body.phone, created_at: now }) };
    q.run('UPDATE customers SET name=?, orders_count=orders_count+1, total_spent=total_spent+?, last_order_at=? WHERE id=?', [body.name, qt.subtotal - (qt.promoDiscount || 0), now, customer.id]);
    const seq = q.val('SELECT COUNT(*) FROM orders WHERE store_id=?', [s.id]) + 10001;
    const number = `${s.code}-${seq}`;
    const trackToken = crypto.randomBytes(12).toString('base64url');
    const orderId = insert('orders', {
      store_id: s.id, number, customer_id: customer.id, customer_name: body.name, phone: body.phone, notes: body.notes,
      status: 'pending', delivery_by: 'pickup', payment_method: 'in_store', reserve_until: until,
      subtotal: qt.subtotal, discount: qt.promoDiscount || 0, promo_discount: qt.promoDiscount || 0, shipping: 0, total: qt.subtotal - (qt.promoDiscount || 0), shipping_free: 1,
      track_token: trackToken, buyer_id: buyerFromReq(req)?.id ?? null, created_at: now, updated_at: now,
    });
    for (const l of qt.lines) {
      insert('order_items', { order_id: orderId, product_id: l.productId, variant_id: l.variantId, name_ar: l.name.ar, name_en: l.name.en, media_id: l.mediaId, color: l.color, size: l.size, price: l.price, qty: l.qty, ...promoItemCols(l) });
      if (l.variantId) q.run('UPDATE variants SET stock=MAX(0, stock-?) WHERE id=?', [l.qty, l.variantId]);
      q.run('UPDATE products SET stock=MAX(0, stock-?), sold_count=sold_count+? WHERE id=?', [l.qty, l.qty, l.productId]);
    }
    recordOrderPromotions(orderId, s.id, qt, now);
    insert('order_events', { order_id: orderId, status: 'pending', note: 'reserve', created_at: now });
    return { number, total: qt.subtotal - (qt.promoDiscount || 0), trackToken, orderId, confirmBy: until, holdHours: hours };
  });
  notifyStore(s.id, { title: `طلب حجز للقياس 🛍️ ${result.number}`, body: `${body.name} عايز يقيس. أكّد إن القطعة موجودة خلال ساعتين`, url: `/dashboard/orders/${result.orderId}`, tag: `order-${result.orderId}` });
  notifyPlatformAlert(`حجز للقياس في ${s.name_ar} 🛍️ ${result.number} للعميل ${body.name}`);
  delete result.orderId;
  res.status(201).json({
    reservation: result,
    store: { name: bi(s, 'name'), ...pickupInfo(s, branch),
      hours: storeHours(s) },
  });
}));

const marketplaceOrderSchema = orderSchema.omit({ coupon: true, items: true, gifts: true, storeNote: true }).extend({
  stores: z.array(z.object({ slug: z.string().trim().min(1).max(80), storeNote: commentField, items: cartItems, coupon: z.string().trim().max(40).optional().nullable(), gifts: giftChoices })).min(1).max(20),
  expectedShipping: z.number().int().min(0).max(5000).optional(),
  expectedTotal: z.number().int().min(0).max(10000000).optional(),
});

// A single marketplace checkout is recorded as one independently managed order per store.
r.post('/marketplace/orders', h((req, res) => {
  const body = marketplaceOrderSchema.parse(req.body);
  if (new Set(body.stores.map((s) => s.slug)).size !== body.stores.length) throw badRequest('duplicate_store', 'A store can only appear once.');
  const result = tx(() => {
    const prepared = body.stores.map(({ slug, items, coupon, gifts, storeNote }) => {
      const store = loadStore(slug);
      const qt = quote(store, items, coupon, { phone: body.phone, giftChoices: gifts });
      if (qt.hasErrors) throw new AppError(409, 'cart_changed', 'Some items are no longer available.', { slug, lines: qt.lines });
      if (coupon && qt.couponError) throw new AppError(409, qt.couponError, 'This coupon can no longer be applied.'); // never charge more than the customer was shown
      return { store, qt, storeNote };
    });
    // A fixed-amount or free-delivery Twist code is one gift per basket, not one per store.
    if (prepared.filter(({ qt }) => qt.coupon?.source === 'platform' && qt.coupon.type !== 'percentage').length > 1) throw new AppError(409, 'coupon_one_store', 'This code applies to one store in the basket.');
    // A marketplace checkout is one customer delivery even though each shop
    // still receives and fulfils its own sub-order. Charge one platform fee.
    // Store thresholds decide whether the shared destination-based delivery fee applies.
    const needsFee = prepared.some(({ qt }) => qt.shipping > 0);
    const basketDelivery = computeBasketDelivery(prepared.map(({ store }) => store.slug), body.governorate, body.city);
    const fullRouteFee = basketDelivery.fee;
    const platformFree = platformFreeApplies(prepared.reduce((sum, { qt }) => sum + qt.subtotal - qt.discount, 0));
    // Area not on the delivery price list: place the order without a fee, customer service calls with the shipping cost.
    const pendingFee = needsFee && !platformFree && !basketDelivery.matched;
    const split = splitSharedDeliveryFee(fullRouteFee, prepared.map(({ qt }) => ({ freeShipping: platformFree || qt.shipping === 0 })));
    const marketplaceShipping = pendingFee ? 0 : split.customerFee;
    const marketplaceTotal = prepared.reduce((sum, { qt }) => sum + qt.subtotal - qt.discount, 0) + marketplaceShipping;
    if ((!pendingFee && body.expectedShipping != null && body.expectedShipping !== marketplaceShipping)
      || (body.expectedTotal != null && body.expectedTotal !== marketplaceTotal)) {
      throw new AppError(409, 'delivery_fee_changed', 'The delivery fee or order total changed. Please review the updated amount.');
    }
    const deliveryGroup = crypto.randomUUID();
    const now = nowIso();
    const orders = prepared.map(({ store, qt, storeNote }, storeIndex) => {
      // Keep the one basket fee allocated across the store sub-orders so a
      // split dispatch can see each route's correct cash amount.
      const shipping = pendingFee || split.storeShares[storeIndex]?.freeShipping ? 0 : split.storeShares[storeIndex]?.share || 0;
      let customer = q.get('SELECT * FROM customers WHERE store_id=? AND phone=?', [store.id, body.phone]);
      if (!customer) {
        const id = insert('customers', { store_id: store.id, name: body.name, phone: body.phone, governorate: body.governorate, city: body.city, address: body.address, created_at: now });
        customer = { id };
      }
      q.run('UPDATE customers SET name=?, governorate=?, city=?, address=?, orders_count=orders_count+1, total_spent=total_spent+?, last_order_at=? WHERE id=?',
        [body.name, body.governorate, body.city, body.address, qt.subtotal, now, customer.id]);
      const seq = q.val('SELECT COUNT(*) FROM orders WHERE store_id=?', [store.id]) + 10001;
      const number = `${store.code}-${seq}`;
      const trackToken = crypto.randomBytes(12).toString('base64url');
      const orderId = insert('orders', {
        store_id: store.id, number, customer_id: customer.id, customer_name: body.name, phone: body.phone,
        governorate: body.governorate, city: body.city, address: body.address, notes: body.notes, store_note: storeNote || null,
        status: 'pending', delivery_fee_status: pendingFee ? 'pending' : 'confirmed', delivery_fee_quote: null, delivery_by: 'platform', delivery_group: deliveryGroup, delivery_route_id: deliveryGroup, delivery_mode: 'pooled', subtotal: qt.subtotal, discount: qt.discount, promo_discount: qt.promoDiscount || 0, shipping, total: qt.subtotal - qt.discount + shipping,
        shipping_free: qt.shipping === 0 ? 1 : 0,
        coupon_code: qt.coupon?.code ?? null, platform_discount: qt.platformDiscount || 0, track_token: trackToken, buyer_id: buyerFromReq(req)?.id ?? null, created_at: now, updated_at: now,
      });
      if (qt.coupon) q.run(`UPDATE ${qt.coupon.source === 'platform' ? 'platform_coupons' : 'offers'} SET usage_count=usage_count+1 WHERE id=?`, [qt.coupon.id]);
      recordOrderPromotions(orderId, store.id, qt, now);
      for (const line of qt.lines) {
        insert('order_items', { order_id: orderId, product_id: line.productId, variant_id: line.variantId, name_ar: line.name.ar, name_en: line.name.en, media_id: line.mediaId, color: line.color, size: line.size, price: line.price, qty: line.qty, ...promoItemCols(line) });
        if (line.variantId) q.run('UPDATE variants SET stock=MAX(0, stock-?) WHERE id=?', [line.qty, line.variantId]);
        q.run('UPDATE products SET stock=MAX(0, stock-?), sold_count=sold_count+? WHERE id=?', [line.qty, line.qty, line.productId]);
      }
      insert('order_events', { order_id: orderId, status: 'pending', note: null, created_at: now });
      return { orderId, number, trackToken, total: qt.subtotal - qt.discount + shipping, subtotal: qt.subtotal, discount: qt.discount, shipping, deliveryFeeStatus: pendingFee ? 'pending' : 'confirmed', deliveryGroup, storeSlug: store.slug, storeWhatsapp: store.whatsapp || store.phone || null, store: { ar: store.name_ar, en: store.name_en } };
    });
    return orders;
  });
  for (const order of result) {
    const store = loadStore(order.storeSlug);
    // Store notifications are best-effort, after all sub-orders have committed atomically.
    if (store.auto_whatsapp) sendNewOrderAlert(store, order.orderId).catch((e) => console.error(`[whatsapp] ${order.number} failed: ${e.message}`));
    notifyStore(store.id, { title: `طلب جديد 🛍️ ${order.number}`, body: `${body.name} · ${order.total} ج.م`, url: `/dashboard/orders/${order.orderId}`, tag: `order-${order.orderId}` });
    notifyPlatformAlert(`طلب تويست جديد 🛍️ ${order.number} من ${store.name_ar} بقيمة ${order.total} ج.م للعميل ${body.name}${order.deliveryFeeStatus === 'pending' ? ` ⚠️ المنطقة (${body.city}) خارج جدول التوصيل: كلّموا العميل ${body.phone} بمصاريف الشحن` : ''}`);
    // Marketplace orders are always delivered by Twist, regardless of the
    // store's default delivery preference. Dispatch is notified when ready.
  }
  res.status(201).json({ orders: result.map(({ orderId, ...order }) => order) });
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
  const s = q.get('SELECT name_ar, name_en, slug, phone, address_ar, address_en, map_url, lat, lng, reserve_hours FROM stores WHERE id=?', [o.store_id]);
  const bsRow = q.get('SELECT branches_json, map_url, lat, lng, phone, whatsapp FROM stores WHERE id=?', [o.store_id]);
  const items = q.all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
  const media = mediaMap(items.map((i) => i.media_id));
  // only the fixed reservation reasons are shown to the shopper, never a store's free-text note
  const events = q.all('SELECT status, note, created_at FROM order_events WHERE order_id=? ORDER BY id', [o.id])
    .map((e) => ({ status: e.status, created_at: e.created_at, ...(['expired', 'unavailable', 'no_show', 'not_confirmed'].includes(e.note) ? { reason: e.note } : {}) }));
  const feeState = o.delivery_group ? q.get("SELECT delivery_fee_status,delivery_fee_quote FROM orders WHERE delivery_group=? AND status<>'cancelled' ORDER BY id LIMIT 1", [o.delivery_group]) : null;
  const basket = o.delivery_group ? q.get("SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total, COALESCE(SUM(subtotal-discount),0) AS items_total FROM orders WHERE delivery_group=? AND status<>'cancelled'", [o.delivery_group]) : null;
  return {
    number: o.number, token: o.track_token, status: o.status, createdAt: o.created_at, updatedAt: o.updated_at,
    notes: o.notes || null, storeNote: o.store_note || null,
    deliveryBy: o.delivery_by, reserveUntil: o.reserve_until || null, firstName: String(o.customer_name || '').split(' ')[0],
    city: o.city, governorate: o.governorate, phone: o.phone.replace(/^(\d{3})\d{5}/, '$1•••••'),
    subtotal: o.subtotal, discount: o.discount, promoDiscount: o.promo_discount || 0, promotions: orderPromotions(o.id), shipping: o.shipping, shippingFree: !!o.shipping_free, total: o.total, payment: o.payment_method,
    deliveryGroupCount: basket?.count ? basket.count : null, deliveryGroupTotal: basket?.count ? (feeState?.delivery_fee_status === 'rejected' ? basket.items_total : basket.total) : null,
    deliveryFeeStatus: feeState?.delivery_fee_status || o.delivery_fee_status || 'confirmed', deliveryFeeQuote: feeState?.delivery_fee_quote ?? o.delivery_fee_quote ?? null,
    store: { name: { ar: s?.name_ar, en: s?.name_en }, slug: s?.slug, phone: s?.phone || null, ...(o.delivery_by === 'pickup' ? (() => { const bn = /^الفرع: (.+?)(?: — |$)/.exec(o.notes || '')?.[1]; const br = bn ? branchOf(bsRow, bn) : null; const p = pickupInfo({ ...(bsRow || {}), address_ar: s?.address_ar, address_en: s?.address_en }, br); return { address: br ? p.address : { ar: s?.address_ar || '', en: s?.address_en || '' }, mapUrl: p.mapUrl, lat: p.lat, lng: p.lng, reserveHours: s?.reserve_hours || 24, ...(br && p.phone ? { phone: p.phone } : {}) }; })() : {}) },
    items: items.map((i) => ({ isGift: !!i.is_gift, promoDiscount: i.promo_discount || 0, productId: i.product_id, reviewed: i.product_id ? !!q.get('SELECT 1 AS x FROM reviews WHERE order_id=? AND product_id=?', [o.id, i.product_id]) : true, name: bi(i, 'name'), price: i.price, qty: i.qty, color: i.color, size: i.size, image: media.get(i.media_id) || null })),
    events,
  };
}

r.get('/track/:token', h((req, res) => {
  const recent = trackGuard(req);
  const o = /^[A-Za-z0-9_-]{10,40}$/.test(req.params.token) ? q.get('SELECT * FROM orders WHERE track_token=?', [req.params.token]) : null;
  if (!o) trackMiss(req, recent);
  res.json({ order: trackPayload(o) });
}));

r.post('/track/:token/delivery-fee', h((req, res) => {
  const { accepted } = z.object({ accepted: z.boolean() }).parse(req.body);
  const o = /^[A-Za-z0-9_-]{10,40}$/.test(req.params.token) ? q.get('SELECT * FROM orders WHERE track_token=?', [req.params.token]) : null;
  if (!o || !o.delivery_group) throw notFound('Order');
  const basket = q.all("SELECT id,status,delivery_fee_status FROM orders WHERE delivery_group=? AND status<>'cancelled'", [o.delivery_group]);
  if (!basket.length || basket.some((item) => item.delivery_fee_status !== 'offered')) throw new AppError(409, 'fee_not_available', 'There is no pending delivery fee offer.');
  const status = accepted ? 'confirmed' : 'rejected';
  tx(() => { for (const item of basket) q.run('UPDATE orders SET delivery_fee_status=?,updated_at=? WHERE id=?', [status, nowIso(), item.id]); });
  res.json({ ok: true, deliveryFeeStatus: status });
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
