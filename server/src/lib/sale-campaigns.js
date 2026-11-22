import { q } from '../db/index.js';

/**
 * Twist-wide sale campaigns (Black Friday etc.), run from the admin.
 *   kind 'discount' — a percentage off every product (optional per-department %), funded by Twist.
 *   kind 'shipping' — free delivery (all baskets, or from a minimum basket), funded by Twist.
 *
 * Money rules (so nothing else has to change):
 *   - the campaign discount is a `discount`-level line on the order (never a price edit, never `promo_discount`),
 *     so returns treat it like any discount and the STORE is paid in full: it is also written to `platform_discount`
 *     (what Twist owes the store), exactly like a Twist coupon;
 *   - free shipping is Twist's own delivery revenue given up, so it is tracked separately in `campaign_shipping`
 *     (NOT in platform_discount: the store never bears or is refunded delivery).
 *
 * Conflict with a store's own sale (products.compare_at_price > price) — `mode`:
 *   best     the customer gets whichever is bigger (campaign % off the ORIGINAL price vs the store's current price)   [default]
 *   skip     products already on a store sale are left out of the campaign
 *   override the campaign price replaces the store sale (priced like `best`, always shows the campaign badge)
 *   stack    campaign % is taken on top of the store's discounted price
 */

export const MODES = ['best', 'skip', 'override', 'stack'];
export const FALL_STYLES = ['percent', 'tags', 'coins', 'stars', 'snow'];
export const THEMES = ['blackfriday', 'newyear', 'ramadan', 'eid', 'valentine', 'summer', 'sale'];
export const DENSITY = ['off', 'low', 'medium', 'high'];
export const SPEED = ['calm', 'normal', 'lively'];
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim() : '');

const now = () => Date.now();
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const pctOf = (v) => Math.max(0, Math.min(90, int(v)));
const parse = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

let cache = { at: 0, rows: null };
export const clearCampaignCache = () => { cache = { at: 0, rows: null }; };

function hydrate(r) {
  return {
    ...r,
    deptPercent: parse(r.dept_percent_json, {}),
    storeIds: parse(r.store_ids_json, []),
    allowCoupons: !!r.allow_coupons,
    respectExcl: !!r.respect_excl,
  };
}

/** Money spent so far by a campaign (non-cancelled orders). */
export function campaignSpent(id) {
  const a = q.get("SELECT COALESCE(SUM(campaign_discount),0) AS d, COUNT(*) AS n FROM orders WHERE campaign_id=? AND status <> 'cancelled'", [id]);
  const b = q.get("SELECT COALESCE(SUM(campaign_shipping),0) AS s, COUNT(*) AS n FROM orders WHERE campaign_ship_id=? AND status <> 'cancelled'", [id]);
  return { discount: a.d, shipping: b.s, orders: Math.max(a.n, b.n), total: a.d + b.s };
}

/** Campaigns that are live right now (status active, inside their window, budget not used up). Cached ~10 s. */
export function activeCampaigns() {
  const t = now();
  if (cache.rows && t - cache.at < 10_000) return cache.rows;
  let rows = [];
  try {
    rows = q.all("SELECT * FROM sale_campaigns WHERE status='active' AND starts_at<=? AND ends_at>?", [t, t]).map(hydrate);
    rows = rows.filter((c) => {
      if (c.budget > 0 && campaignSpent(c.id).total >= c.budget) {
        q.run("UPDATE sale_campaigns SET status='ended', ended_reason='budget' WHERE id=?", [c.id]);
        return false;
      }
      return true;
    });
    // Windows that already passed: close them so the admin shows the right state.
    q.run("UPDATE sale_campaigns SET status='ended', ended_reason=COALESCE(ended_reason,'time') WHERE status='active' AND ends_at<=?", [t]);
  } catch { rows = []; }
  cache = { at: t, rows };
  return rows;
}

const discountCampaign = () => activeCampaigns().find((c) => c.kind === 'discount') || null;
const shippingCampaign = () => activeCampaigns().find((c) => c.kind === 'shipping') || null;
const inScope = (c, storeId) => !c.storeIds.length || c.storeIds.includes(storeId);

/** Pure math: how much one unit of product `p` is reduced by campaign `c` (EGP, integer, never below 1 EGP left). */
export function unitDiscount(p, c) {
  if (!c || !p) return 0;
  const pct = pctOf(c.deptPercent?.[p.department] ?? c.percent);
  if (!pct) return 0;
  if (c.respectExcl && p.exclude_from_promotions) return 0;
  const price = int(p.price);
  if (price <= 1) return 0;
  const onSale = int(p.compare_at_price) > price;
  let d = 0;
  if (c.mode === 'skip') {
    if (!onSale) d = price - Math.round(price * (1 - pct / 100));
  } else if (c.mode === 'stack') {
    d = price - Math.round(price * (1 - pct / 100));
  } else { // best / override: % off the original price, only if it beats what the customer already pays
    const orig = onSale ? int(p.compare_at_price) : price;
    const pc = Math.round(orig * (1 - pct / 100));
    if (pc < price) d = price - pc;
  }
  return Math.max(0, Math.min(d, price - 1));
}

/** Discount per unit for a product in the live discount campaign (0 when none). */
export function campaignUnit(p) {
  const c = discountCampaign();
  if (!c || !inScope(c, p.store_id)) return 0;
  return unitDiscount(p, c);
}
export const discountMode = () => discountCampaign()?.mode || null;
export const discountAllowsCoupons = () => !!discountCampaign()?.allowCoupons;
export const discountCampaignId = () => discountCampaign()?.id || null;

/**
 * SQL for "this product is on sale": the store's own sale OR it is covered by the live discount campaign (so the «عروض» filter and
 * the deals rail fill up during a campaign). Only integers/known slugs are interpolated.
 */
export function onSaleSql(a = 'p') {
  const own = `(${a}.compare_at_price IS NOT NULL AND ${a}.compare_at_price > ${a}.price)`;
  const c = discountCampaign();
  if (!c) return own;
  const parts = [];
  if (c.percent) parts.push('1=1'); else {
    const slugs = Object.keys(c.deptPercent || {}).filter((k) => /^[a-z0-9_-]{1,40}$/i.test(k));
    if (!slugs.length) return own;
    parts.push(`${a}.department IN (${slugs.map((s) => `'${s}'`).join(',')})`);
  }
  if (c.storeIds.length) parts.push(`${a}.store_id IN (${c.storeIds.map((i) => int(i)).join(',')})`);
  if (c.respectExcl) parts.push(`${a}.exclude_from_promotions=0`);
  return `(${own} OR (${parts.join(' AND ')}))`;
}

/** Card/detail pricing: what a shopper should see for product `p`. Returns null when the campaign doesn't touch it. */
export function cardPricing(p) {
  const c = discountCampaign();
  if (!c || !inScope(c, p.store_id)) return null;
  const d = unitDiscount(p, c);
  if (!d) return null;
  const onSale = int(p.compare_at_price) > int(p.price);
  const was = onSale ? int(p.compare_at_price) : int(p.price);
  const price = int(p.price) - d;
  return { price, compareAt: was, discount: Math.round((1 - price / was) * 100), endsAt: c.ends_at, id: c.id, name: c.name, mode: c.mode };
}

/** Free-shipping campaign for a basket of `net` EGP at store(s). Returns the campaign when it applies, else null. */
export function shippingCampaignFor(net, storeIds = []) {
  const c = shippingCampaign();
  if (!c) return null;
  if (c.storeIds.length && storeIds.some((id) => !c.storeIds.includes(id))) return null;
  if (net < (c.min_subtotal || 0)) return null;
  return c;
}

/** What the storefront needs (cacheable by the client for a few seconds). */
function pub(c) {
  return {
      id: c.id, kind: c.kind, name: c.name, headline: c.headline || '', sub: c.sub || '', showHype: c.show_hype == null ? true : !!c.show_hype, hype: parse(c.hype_json, {}), badge: parse(c.badge_json, {}), endsAt: c.ends_at, startsAt: c.starts_at,
      percent: c.percent, min: c.min_subtotal || 0, mode: c.mode,
      showBar: !!c.show_bar, showFall: !!c.show_fall, fallStyle: FALL_STYLES.includes(c.fall_style) ? c.fall_style : 'percent', showHero: !!c.show_hero,
      theme: c.theme || 'blackfriday', color1: c.color1 || '', color2: c.color2 || '', glyphs: c.fall_glyphs || '', density: c.fall_density || 'low', speed: c.fall_speed || 'calm',
      allowCoupons: c.allowCoupons,
      depts: Object.keys(c.deptPercent || {}).length ? c.deptPercent : null,
      scoped: c.storeIds.length > 0,
  };
}

/** Armed campaigns whose "coming soon" teaser is showing (announce time passed, start not yet). Nothing is discounted yet. */
function upcomingCampaigns() {
  const t = now();
  try {
    return q.all("SELECT * FROM sale_campaigns WHERE status='active' AND announce_at IS NOT NULL AND announce_at<=? AND starts_at>? AND ends_at>?", [t, t, t]).map(hydrate);
  } catch { return []; }
}

export function publicCampaigns() {
  const out = { serverNow: now(), discount: null, shipping: null, soon: { discount: null, shipping: null } };
  for (const c of activeCampaigns()) {
    const v = pub(c);
    if (c.kind === 'discount' && !out.discount) out.discount = v;
    if (c.kind === 'shipping' && !out.shipping) out.shipping = v;
  }
  for (const c of upcomingCampaigns()) {
    const v = { ...pub(c), phase: 'soon' };
    if (c.kind === 'discount' && !out.discount && !out.soon.discount) out.soon.discount = v;
    if (c.kind === 'shipping' && !out.shipping && !out.soon.shipping) out.soon.shipping = v;
  }
  return out;
}

/* -------------------------------------------------------------------- admin CRUD */

const COLS = ['kind', 'name', 'status', 'starts_at', 'ends_at', 'percent', 'dept_percent_json', 'mode', 'allow_coupons', 'respect_excl', 'min_subtotal', 'store_ids_json', 'budget', 'headline', 'sub', 'show_bar', 'show_fall', 'fall_style', 'show_hero', 'theme', 'color1', 'color2', 'fall_glyphs', 'fall_density', 'fall_speed', 'announce_at', 'show_hype', 'hype_json', 'badge_json'];

/** Hype-line overrides keyed by time stage (see the storefront's HYPE_STAGES); unknown keys and empty texts are dropped. */
export const HYPE_KEYS = ['s_far', 's_days', 's_day', 's_hour', 's_min', 'l_start', 'l_mid', 'l_last', 'l_hour', 'l_min'];
const hypeMap = (m) => {
  const out = {};
  if (m && typeof m === 'object') for (const k of HYPE_KEYS) { const t = String(m[k] ?? '').replace(/[<>]/g, '').trim().slice(0, 100); if (t) out[k] = t; }
  return out;
};

/** Banner badge: mode percent | all | custom | none (default 'all' = "X% on ALL products") + optional short chips. */
export const BADGE_MODES = ['all', 'percent', 'custom', 'none'];
const badgeMap = (m) => {
  const t = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
  const o = m && typeof m === 'object' ? m : {};
  return {
    mode: BADGE_MODES.includes(o.mode) ? o.mode : 'all',
    title: t(o.title, 10), sub: t(o.sub, 24),
    chips: (Array.isArray(o.chips) ? o.chips : []).map((x) => t(x, 40)).filter(Boolean).slice(0, 4),
  };
};

function clean(b, cur = {}) {
  const kind = b.kind ?? cur.kind ?? 'discount';
  const startsAt = int(b.startsAt ?? cur.starts_at, now());
  const rawAnn = b.announceAt !== undefined ? b.announceAt : cur.announce_at;
  const annN = rawAnn == null || rawAnn === '' || rawAnn === false ? 0 : int(rawAnn);
  const announceAt = annN > 0 && annN < startsAt ? annN : null; // a teaser only makes sense BEFORE the start
  const dept = {};
  for (const [k, v] of Object.entries(b.deptPercent ?? cur.deptPercent ?? {})) { const n = pctOf(v); if (n && /^[a-z0-9_-]{1,40}$/i.test(k)) dept[k] = n; }
  const ids = [...new Set((b.storeIds ?? cur.storeIds ?? []).map((x) => int(x)).filter((x) => x > 0))];
  return {
    kind: kind === 'shipping' ? 'shipping' : 'discount',
    name: String(b.name ?? cur.name ?? '').trim().slice(0, 80) || (kind === 'shipping' ? 'شحن مجاني' : 'حملة تخفيضات'),
    status: ['draft', 'active', 'ended'].includes(b.status ?? cur.status) ? (b.status ?? cur.status) : 'draft',
    starts_at: startsAt,
    announce_at: announceAt,
    ends_at: int(b.endsAt ?? cur.ends_at, now() + 24 * 3600e3),
    percent: pctOf(b.percent ?? cur.percent),
    dept_percent_json: JSON.stringify(dept),
    mode: MODES.includes(b.mode ?? cur.mode) ? (b.mode ?? cur.mode) : 'best',
    allow_coupons: (b.allowCoupons ?? cur.allowCoupons) ? 1 : 0,
    respect_excl: (b.respectExcl ?? cur.respectExcl ?? true) ? 1 : 0,
    min_subtotal: Math.max(0, int(b.minSubtotal ?? cur.min_subtotal)),
    store_ids_json: JSON.stringify(ids),
    budget: Math.max(0, int(b.budget ?? cur.budget)),
    headline: String(b.headline ?? cur.headline ?? '').trim().slice(0, 80),
    sub: String(b.sub ?? cur.sub ?? '').trim().slice(0, 140),
    show_hype: (b.showHype ?? (cur.show_hype != null ? !!cur.show_hype : true)) ? 1 : 0,
    hype_json: JSON.stringify(hypeMap(b.hype ?? parse(cur.hype_json, {}))),
    badge_json: JSON.stringify(badgeMap(b.badge ?? parse(cur.badge_json, {}))),
    show_bar: (b.showBar ?? (cur.show_bar != null ? !!cur.show_bar : true)) ? 1 : 0,
    show_fall: (b.showFall ?? (cur.show_fall != null ? !!cur.show_fall : true)) ? 1 : 0,
    fall_style: FALL_STYLES.includes(b.fallStyle ?? cur.fall_style) ? (b.fallStyle ?? cur.fall_style) : 'percent',
    show_hero: (b.showHero ?? (cur.show_hero != null ? !!cur.show_hero : true)) ? 1 : 0,
    theme: THEMES.includes(b.theme ?? cur.theme) ? (b.theme ?? cur.theme) : 'blackfriday',
    color1: hex(b.color1 ?? cur.color1), color2: hex(b.color2 ?? cur.color2),
    fall_glyphs: [...String(b.fallGlyphs ?? cur.fall_glyphs ?? '').replace(/[<>&"'`\\]/g, '').trim()].slice(0, 12).join(''),
    fall_density: DENSITY.includes(b.fallDensity ?? cur.fall_density) ? (b.fallDensity ?? cur.fall_density) : 'low',
    fall_speed: SPEED.includes(b.fallSpeed ?? cur.fall_speed) ? (b.fallSpeed ?? cur.fall_speed) : 'calm',
  };
}

export function validateCampaign(c) {
  if (c.ends_at <= c.starts_at) return 'ends_before_start';
  if (c.kind === 'discount' && !c.percent && c.dept_percent_json === '{}') return 'percent_required';
  return null;
}

/** draft | scheduled (armed, not announced yet) | soon (teaser + countdown to start is showing) | live | ended */
function phaseOf(c, t = now()) {
  if (c.status === 'ended' || (c.status === 'active' && c.ends_at <= t)) return 'ended';
  if (c.status !== 'active') return 'draft';
  if (c.starts_at <= t) return 'live';
  return c.announce_at && c.announce_at <= t ? 'soon' : 'scheduled';
}

function view(r) {
  const c = hydrate(r);
  const spent = campaignSpent(r.id);
  return {
    id: c.id, kind: c.kind, name: c.name, status: c.status, endedReason: c.ended_reason || null,
    startsAt: c.starts_at, endsAt: c.ends_at, percent: c.percent, deptPercent: c.deptPercent, mode: c.mode,
    allowCoupons: c.allowCoupons, respectExcl: c.respectExcl, minSubtotal: c.min_subtotal, storeIds: c.storeIds, budget: c.budget,
    headline: c.headline, sub: c.sub, showHype: c.show_hype == null ? true : !!c.show_hype, hype: parse(c.hype_json, {}), badge: badgeMap(parse(c.badge_json, {})), showBar: !!c.show_bar, showFall: !!c.show_fall, fallStyle: c.fall_style, showHero: !!c.show_hero,
    theme: c.theme || 'blackfriday', color1: c.color1 || '', color2: c.color2 || '', fallGlyphs: c.fall_glyphs || '', fallDensity: c.fall_density || 'low', fallSpeed: c.fall_speed || 'calm',
    announceAt: c.announce_at || null,
    live: c.status === 'active' && c.starts_at <= now() && c.ends_at > now(),
    phase: phaseOf(c),
    spent,
  };
}

export function listCampaigns() {
  return q.all('SELECT * FROM sale_campaigns ORDER BY id DESC LIMIT 100').map(view);
}
export function getCampaign(id) {
  const r = q.get('SELECT * FROM sale_campaigns WHERE id=?', [id]);
  return r ? view(r) : null;
}

/** Two live campaigns of the same kind would fight; activating one ends nothing — we refuse instead. */
function overlapping(kind, startsAt, endsAt, exceptId = 0) {
  return q.get("SELECT id, name FROM sale_campaigns WHERE kind=? AND status='active' AND id<>? AND starts_at<? AND ends_at>?", [kind, exceptId, endsAt, startsAt]);
}

export function saveCampaign(body, id = null) {
  const cur = id ? q.get('SELECT * FROM sale_campaigns WHERE id=?', [id]) : null;
  if (id && !cur) return { error: 'not_found' };
  const curH = cur ? hydrate(cur) : {};
  const c = clean(body, curH);
  const err = validateCampaign(c);
  if (err) return { error: err };
  if (c.status === 'active') {
    const o = overlapping(c.kind, c.starts_at, c.ends_at, id || 0);
    if (o) return { error: 'overlap', with: o };
  }
  if (id) {
    q.run(`UPDATE sale_campaigns SET ${COLS.map((k) => `${k}=?`).join(',')}, ended_reason=CASE WHEN ?='active' THEN NULL ELSE ended_reason END WHERE id=?`, [...COLS.map((k) => c[k]), c.status, id]);
  } else {
    id = q.run(`INSERT INTO sale_campaigns(${COLS.join(',')},created_at) VALUES(${COLS.map(() => '?').join(',')},?)`, [...COLS.map((k) => c[k]), now()]).lastInsertRowid;
  }
  clearCampaignCache();
  return { campaign: getCampaign(Number(id)) };
}

export function setCampaignStatus(id, status) {
  const r = q.get('SELECT * FROM sale_campaigns WHERE id=?', [id]);
  if (!r) return { error: 'not_found' };
  if (status === 'active') {
    if (r.ends_at <= now()) return { error: 'already_over' };
    const o = overlapping(r.kind, r.starts_at, r.ends_at, id);
    if (o) return { error: 'overlap', with: o };
  }
  q.run("UPDATE sale_campaigns SET status=?, ended_reason=CASE WHEN ?='ended' THEN 'manual' ELSE NULL END WHERE id=?", [status, status, id]);
  clearCampaignCache();
  return { campaign: getCampaign(id) };
}

export function deleteCampaign(id) {
  const used = q.val('SELECT COUNT(*) FROM orders WHERE campaign_id=? OR campaign_ship_id=?', [id, id]);
  if (used) return { error: 'has_orders' };
  q.run('DELETE FROM sale_campaigns WHERE id=?', [id]);
  clearCampaignCache();
  return { ok: true };
}

/* -------------------------------------------------------------------- loss calculator */

/**
 * "How much will this cost us?" — computed on the products that exist today (+ the last 30 days of real orders).
 * `draft` is the same shape the admin form sends. Nothing is written.
 */
export function estimate(draft = {}) {
  const c = hydrate({ ...clean(draft), id: 0 });
  const days = Math.max(0.25, (c.ends_at - c.starts_at) / 86400e3);
  const since = new Date(now() - 30 * 86400e3).toISOString();
  const stores = q.all("SELECT id, name_ar AS name, slug, shipping_fee FROM stores WHERE status='active'").filter((s) => inScope(c, s.id));
  const hist = new Map(q.all("SELECT store_id, COUNT(*) AS n, COALESCE(AVG(subtotal),0) AS avg_sub, COALESCE(AVG(shipping),0) AS avg_ship, COALESCE(SUM(CASE WHEN subtotal>=? THEN shipping ELSE 0 END),0)*1.0/COUNT(*) AS ship_elig, SUM(CASE WHEN subtotal>=? THEN 1 ELSE 0 END)*1.0/COUNT(*) AS share_elig FROM orders WHERE created_at>=? AND status<>'cancelled' GROUP BY store_id", [c.min_subtotal || 0, c.min_subtotal || 0, since]).map((r) => [r.store_id, r]));
  const prods = q.all("SELECT id, store_id, department, price, compare_at_price, track_stock, stock, exclude_from_promotions FROM products WHERE status='active'");
  const per = new Map(stores.map((s) => [s.id, { id: s.id, name: s.name, products: 0, affected: 0, stockUnits: 0, maxExposure: 0, listValue: 0, discValue: 0, ratio: 0, orders30: 0, avgBasket: 0, avgShip: 0, shipFee: s.shipping_fee || 0 }]));
  for (const p of prods) {
    const row = per.get(p.store_id);
    if (!row) continue;
    row.products += 1;
    const units = p.track_stock ? Math.max(0, p.stock) : 5;
    const d = c.kind === 'discount' ? unitDiscount(p, c) : 0;
    row.stockUnits += units;
    row.listValue += p.price * units;
    if (d) { row.affected += 1; row.maxExposure += d * units; row.discValue += d * units; }
  }
  let tot = { stores: 0, products: 0, affected: 0, maxExposure: 0, orders30: 0, base: 0, shipBase: 0 };
  const rows = [];
  for (const row of per.values()) {
    const h = hist.get(row.id);
    row.orders30 = h?.n || 0;
    row.avgBasket = Math.round(h?.avg_sub || (row.stockUnits ? row.listValue / row.stockUnits : 0)); // no orders yet → one average piece
    // free shipping only costs us on orders that qualify (basket ≥ the minimum): average over ALL orders of the shipping we would waive
    row.avgShip = Math.round(h ? (c.min_subtotal > 0 ? h.ship_elig : h.avg_ship) : (row.shipFee || 0));
    row.eligShare = h ? (c.min_subtotal > 0 ? h.share_elig : 1) : 1;
    row.ratio = row.listValue ? row.discValue / row.listValue : 0; // avg % of a basket that the campaign takes off
    // one typical order costs us: average basket × the share the campaign takes off it
    row.perOrder = Math.round(row.avgBasket * row.ratio);
    row.perOrderShip = c.kind === 'shipping' ? row.avgShip : 0;
    tot.stores += 1; tot.products += row.products; tot.affected += row.affected; tot.maxExposure += row.maxExposure;
    tot.orders30 += row.orders30; tot.base += row.orders30 * row.perOrder; tot.shipBase += row.orders30 * row.perOrderShip;
    rows.push(row);
  }
  const avgPerOrder = tot.orders30 ? (tot.base + tot.shipBase) / tot.orders30 : (rows.length ? rows.reduce((s, r) => s + r.perOrder + r.perOrderShip, 0) / rows.length : 0);
  // "if N customers buy": cost of N average orders
  const customers = [50, 100, 250, 500, 1000].map((n) => ({ orders: n, cost: Math.round(n * avgPerOrder) }));
  // "as if our normal volume × uplift": last-30-day order rate scaled to the campaign length
  const normal = (tot.base + tot.shipBase) / 30 * days;
  const uplift = [1, 2, 3, 5, 10].map((x) => ({ x, orders: Math.round(tot.orders30 / 30 * days * x), cost: Math.round(normal * x) }));
  const cap = c.budget > 0 ? c.budget : null;
  return {
    kind: c.kind, days: Math.round(days * 10) / 10,
    totals: { stores: tot.stores, products: tot.products, affected: tot.affected, orders30: tot.orders30, avgPerOrder: Math.round(avgPerOrder), maxExposure: c.kind === 'discount' ? tot.maxExposure : null },
    customers, uplift, budget: cap,
    stores: rows.sort((a, b) => b.maxExposure - a.maxExposure).slice(0, 200).map((r) => ({
      id: r.id, name: r.name, products: r.products, affected: r.affected, orders30: r.orders30, avgBasket: r.avgBasket, perOrder: r.perOrder + r.perOrderShip,
      maxExposure: r.maxExposure, ratio: Math.round(r.ratio * 1000) / 10,
    })),
    note: 'تقدير: متوسط السلة × نسبة الخصم على منتجات كل محل، وأقصى تعرّض = لو كل المخزون اتباع بالخصم.',
  };
}

export function campaignReport(id) {
  const c = getCampaign(id);
  if (!c) return null;
  const rows = q.all(`SELECT s.id, s.name_ar AS name, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN o.campaign_id=? THEN o.campaign_discount ELSE 0 END),0) AS discount, COALESCE(SUM(CASE WHEN o.campaign_ship_id=? THEN o.campaign_shipping ELSE 0 END),0) AS shipping, COALESCE(SUM(o.total),0) AS revenue
    FROM orders o JOIN stores s ON s.id=o.store_id WHERE (o.campaign_id=? OR o.campaign_ship_id=?) AND o.status<>'cancelled' GROUP BY s.id ORDER BY discount DESC`, [id, id, id, id]);
  const cancelled = q.val("SELECT COUNT(*) FROM orders WHERE (campaign_id=? OR campaign_ship_id=?) AND status='cancelled'", [id, id]);
  return { campaign: c, stores: rows, cancelled, spent: c.spent, budgetLeft: c.budget > 0 ? Math.max(0, c.budget - c.spent.total) : null };
}
