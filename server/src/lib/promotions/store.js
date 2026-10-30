/**
 * Promotions persistence + eligibility: everything that touches the database or the clock.
 * The pricing maths itself lives in engine.js and never reads from here.
 */
import { q, tx, insert, update, json } from '../../db/index.js';
import { AppError } from '../errors.js';
import { nowIso } from '../util.js';
import { definitionSchema, validateDefinition, selectorsOf, giftIdsOf, selectorKey, TYPES } from './definition.js';

/* ------------------------------------------------------------------ time (Africa/Cairo, DST aware) */
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function cairoStamp(d = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, stamp: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`, dow: DOW[p.weekday] ?? 0 };
}

/** 'draft' | 'paused' | 'scheduled' | 'expired' | 'active' - what the dashboard shows. */
export function promoState(row, now = cairoStamp()) {
  if (row.status === 'draft') return 'draft';
  if (row.status === 'paused') return 'paused';
  if (row.starts_at && row.starts_at > now.stamp) return 'scheduled';
  if (row.ends_at && row.ends_at < now.stamp) return 'expired';
  return 'active';
}

/** Inside the daily window / allowed weekdays right now? (only meaningful when promoState is 'active') */
export function inDailyWindow(row, now = cairoStamp()) {
  if (!(row.days_mask & (1 << now.dow))) return false;
  const a = row.daily_from; const b = row.daily_to;
  if (!a || !b) return true;
  return a <= b ? now.hm >= a && now.hm <= b : now.hm >= a || now.hm <= b;
}
export const isLive = (row, now = cairoStamp()) => promoState(row, now) === 'active' && inDailyWindow(row, now);

/* ------------------------------------------------------------------ categories */
/** categoryId -> [id, parentId, grandparentId...] so a product in a sub-category also counts as being in its parent. */
export function categoryChains(storeId) {
  const rows = q.all('SELECT id, parent_id FROM categories WHERE store_id=?', [storeId]);
  const parent = new Map(rows.map((r) => [r.id, r.parent_id]));
  const chains = new Map();
  for (const r of rows) {
    const chain = []; let cur = r.id; const seen = new Set();
    while (cur && !seen.has(cur)) { seen.add(cur); chain.push(cur); cur = parent.get(cur); }
    chains.set(r.id, chain);
  }
  return chains;
}

/* ------------------------------------------------------------------ rows */
export function parseRow(row) {
  if (!row) return null;
  const def = definitionSchema.safeParse(json(row.rules_json, {}));
  return { ...row, def: def.success ? def.data : null, defError: def.success ? null : 'invalid_definition' };
}

/** Live promotions of a store that apply to a shopper right now (schedule, usage limits, audience). Used by cart/checkout. */
export function eligiblePromotions(storeId, { phone, now = cairoStamp() } = {}) {
  const rows = q.all("SELECT * FROM promotions WHERE store_id=? AND status='active'", [storeId]).map(parseRow);
  const ph = String(phone || '').replace(/\D/g, '');
  const out = [];
  for (const p of rows) {
    if (!p.def || !isLive(p, now)) continue;
    if (p.usage_limit && usageCount(p.id) >= p.usage_limit) continue;
    if (ph && p.per_customer_limit && customerUses(p.id, ph) >= p.per_customer_limit) continue;
    if (p.audience === 'phones') { const list = json(p.audience_phones_json, []); if (!ph || !list.includes(ph)) continue; }
    if (ph && (p.audience === 'new' || p.audience === 'returning')) {
      const prior = q.val("SELECT COUNT(*) FROM orders WHERE store_id=? AND phone=? AND status<>'cancelled'", [storeId, ph]);
      if (p.audience === 'new' && prior > 0) continue;
      if (p.audience === 'returning' && prior === 0) continue;
    }
    if (!ph && p.audience === 'returning') continue; // cannot be proven without a phone
    out.push(p);
  }
  return out;
}

export const usageCount = (promoId) => q.val("SELECT COUNT(DISTINCT op.order_id) FROM order_promotions op JOIN orders o ON o.id=op.order_id WHERE op.promotion_id=? AND o.status<>'cancelled'", [promoId]) || 0;
export const customerUses = (promoId, phone) => q.val("SELECT COUNT(DISTINCT op.order_id) FROM order_promotions op JOIN orders o ON o.id=op.order_id WHERE op.promotion_id=? AND o.phone=? AND o.status<>'cancelled'", [promoId, phone]) || 0;

/* ------------------------------------------------------------------ writing */
const bad = (code, ar, en, fields) => new AppError(422, 'promotion_invalid', en, { code, ar, en, ...fields });

/** Every product / category / gift id in the definition must belong to THIS store - the isolation boundary for offers. */
export function assertOwnership(storeId, def) {
  const pids = new Set(); const cids = new Set();
  for (const [, sel] of selectorsOf(def)) { sel.products.forEach((x) => pids.add(x)); sel.categories.forEach((x) => cids.add(x)); }
  const gifts = giftIdsOf(def); gifts.forEach((x) => pids.add(x));
  if (pids.size) {
    const have = new Set(q.all(`SELECT id FROM products WHERE store_id=? AND id IN (${[...pids].map(() => '?').join(',')})`, [storeId, ...pids]).map((r) => r.id));
    if ([...pids].some((x) => !have.has(x))) throw bad('foreign_product', 'في منتج مش تابع لمتجرك.', 'A selected product does not belong to your store.');
  }
  if (cids.size) {
    const have = new Set(q.all(`SELECT id FROM categories WHERE store_id=? AND id IN (${[...cids].map(() => '?').join(',')})`, [storeId, ...cids]).map((r) => r.id));
    if ([...cids].some((x) => !have.has(x))) throw bad('foreign_category', 'في قسم مش تابع لمتجرك.', 'A selected category does not belong to your store.');
  }
}

/** Rebuild the derived product/category index for one promotion (touches no other promotion). */
export function indexTargets(promoId, def) {
  q.run('DELETE FROM promotion_targets WHERE promotion_id=?', [promoId]);
  const put = (role, type, id) => q.run('INSERT OR IGNORE INTO promotion_targets(promotion_id, role, target_type, target_id) VALUES (?,?,?,?)', [promoId, role, type, id]);
  const walk = (role, sel) => {
    if (sel.all) put(role, 'all', 0);
    sel.products.forEach((id) => put(role, 'product', id));
    sel.categories.forEach((id) => put(role, 'category', id));
  };
  walk('qualify', def.qualify);
  if (def.reward) walk('reward', def.reward);
  walk('exclude', def.exclude);
  for (const [role, sel] of selectorsOf(def)) if (role === 'qualify') walk('qualify', sel);
  giftIdsOf(def).forEach((id) => put('gift', 'product', id));
}

/**
 * Create or update a promotion from owner input. Validates the rule semantically and refuses anything the engine
 * could not calculate safely (with a friendly Arabic/English message) instead of saving a rule that prices wrongly.
 */
export function savePromotion(storeId, input, id = null) {
  if (!TYPES.includes(input.type)) throw bad('bad_type', 'نوع العرض غير معروف.', 'Unknown offer type.');
  const def = definitionSchema.parse(input.def);
  const issues = validateDefinition(input.type, def, { startsAt: input.starts_at, endsAt: input.ends_at });
  if (issues.length && input.status === 'active') throw new AppError(422, 'promotion_invalid', issues[0].en, { issues });
  if (issues.length && input.status !== 'draft') throw new AppError(422, 'promotion_invalid', issues[0].en, { issues });
  assertOwnership(storeId, def);
  if (input.image_mode === 'custom' && !input.image_media_id) throw bad('no_custom_image', 'ارفع صورتك الخاصة أو اختار صورة من المكتبة.', 'Upload your own image or choose one from the library.');
  if (input.image_mode === 'library') {
    if (!input.image_category || !q.get('SELECT key FROM offer_image_categories WHERE key=? AND active=1', [input.image_category])) throw bad('bad_image_category', 'فئة الصورة غير معروفة.', 'Unknown image category.');
  }
  if (input.image_media_id) {
    const m = q.get('SELECT id FROM media WHERE id=? AND store_id=?', [input.image_media_id, storeId]);
    if (!m) throw bad('foreign_media', 'الصورة دي مش تابعة لمتجرك.', 'This image does not belong to your store.');
  }
  const cols = {
    name_ar: input.name_ar, name_en: input.name_en || null, description_ar: input.description_ar || null, description_en: input.description_en || null,
    type: input.type, status: input.status, priority: input.priority ?? 0, stacking: input.stacking ?? 'per_product', stack_with_coupons: input.stack_with_coupons === false ? 0 : 1,
    image_media_id: input.image_media_id ?? null, template_key: input.template_key ?? input.type, image_mode: input.image_mode ?? 'auto', image_category: input.image_mode === 'library' ? (input.image_category ?? null) : null,
    starts_at: input.starts_at || null, ends_at: input.ends_at || null, daily_from: input.daily_from || null, daily_to: input.daily_to || null,
    days_mask: input.days_mask ?? 127, usage_limit: input.usage_limit ?? null, per_customer_limit: input.per_customer_limit ?? null,
    audience: input.audience ?? 'all', audience_phones_json: JSON.stringify((input.audience_phones || []).map((p) => String(p).replace(/\D/g, '')).filter(Boolean)),
    rules_json: JSON.stringify(def), updated_at: nowIso(),
  };
  return tx(() => {
    let pid = id;
    if (pid) {
      const own = q.get('SELECT id FROM promotions WHERE id=? AND store_id=?', [pid, storeId]);
      if (!own) throw new AppError(404, 'not_found', 'Offer not found');
      update('promotions', pid, cols);
    } else pid = insert('promotions', { ...cols, store_id: storeId, created_at: nowIso() });
    indexTargets(pid, def);
    return pid;
  });
}

/** Add/remove one product to the qualifying group of an offer without touching anything else in the rule. */
export function setProductInPromotion(storeId, promoId, productId, on) {
  const row = parseRow(q.get('SELECT * FROM promotions WHERE id=? AND store_id=?', [promoId, storeId]));
  if (!row || !row.def) throw new AppError(404, 'not_found', 'Offer not found');
  const own = q.get('SELECT id FROM products WHERE id=? AND store_id=?', [productId, storeId]);
  if (!own) throw new AppError(404, 'not_found', 'Product not found');
  const def = row.def; const sel = def.qualify;
  if (sel.all) return row; // already covers everything
  const has = sel.products.includes(productId);
  if (on && !has) sel.products = [...sel.products, productId];
  if (!on && has) sel.products = sel.products.filter((x) => x !== productId);
  q.run('UPDATE promotions SET rules_json=?, updated_at=? WHERE id=?', [JSON.stringify(def), nowIso(), promoId]);
  indexTargets(promoId, def);
  return row;
}

/** Offers (non-expired) that currently include a product, for the product form and storefront. */
export function promotionsForProduct(storeId, productId, { includeAll = true } = {}) {
  const prod = q.get('SELECT id, category_id FROM products WHERE id=? AND store_id=?', [productId, storeId]);
  if (!prod) return [];
  const chain = prod.category_id ? (categoryChains(storeId).get(prod.category_id) || [prod.category_id]) : [];
  const now = cairoStamp();
  const rows = q.all(`SELECT DISTINCT p.* FROM promotions p JOIN promotion_targets t ON t.promotion_id=p.id
    WHERE p.store_id=? AND t.role IN ('qualify','reward','gift') AND (
      (t.target_type='product' AND t.target_id=?) ${chain.length ? `OR (t.target_type='category' AND t.target_id IN (${chain.map(() => '?').join(',')}))` : ''} ${includeAll ? "OR t.target_type='all'" : ''})`,
  [storeId, productId, ...chain]).map(parseRow);
  return rows.filter((p) => !(p.def && matchesExclude(p.def, prod, chain))).map((p) => ({ ...p, state: promoState(p, now) })).filter((p) => p.state !== 'expired');
}
const matchesExclude = (def, prod, chain) => def.exclude.all || def.exclude.products.includes(prod.id) || chain.some((c) => def.exclude.categories.includes(c));

export { selectorKey };

/* ------------------------------------------------------------------ reading helpers for the dashboard */

/** Ids of the store's products an offer covers (qualifying + reward + gifts, minus exclusions). */
export function resolveProductIds(storeId, def, { roles = ['qualify', 'reward', 'gift'] } = {}) {
  const chains = categoryChains(storeId);
  const prods = q.all("SELECT id, category_id FROM products WHERE store_id=? AND status<>'archived'", [storeId]);
  const chain = (p) => (p.category_id ? chains.get(p.category_id) || [p.category_id] : []);
  const hit = (sel, p) => sel && (sel.all || sel.products.includes(p.id) || chain(p).some((c) => sel.categories.includes(c)));
  const gifts = new Set(giftIdsOf(def));
  const sels = selectorsOf(def).filter(([role]) => roles.includes(role) && role !== 'exclude').map(([, s]) => s);
  return prods.filter((p) => !hit(def.exclude, p) && (sels.some((s) => hit(s, p)) || (roles.includes('gift') && gifts.has(p.id)))).map((p) => p.id);
}

export const TEMPLATE_KEYS = ['buy_x_get_y', 'group_price', 'buy_more_save_more', 'percentage', 'fixed_amount', 'bundle', 'gift', 'tiered_pricing', 'category_reward', 'custom'];
