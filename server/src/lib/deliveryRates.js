import { q } from '../db/index.js';

const clean = (value) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('ar-EG')
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[,\-،_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function getDeliveryPricing() {
  const values = Object.fromEntries(q.all("SELECT key, value FROM app_settings WHERE key IN ('delivery_base_fee','delivery_included_km','delivery_per_km','delivery_extra_pickup_stop_fee','delivery_extra_pickup_zone_fee')").map((r) => [r.key, Number(r.value)]));
  return {
    baseFee: Number.isFinite(values.delivery_base_fee) ? values.delivery_base_fee : 50,
    includedKm: Number.isFinite(values.delivery_included_km) ? values.delivery_included_km : 2,
    perKm: Number.isFinite(values.delivery_per_km) ? values.delivery_per_km : 10,
    extraPickupStopFee: Number.isFinite(values.delivery_extra_pickup_stop_fee) ? values.delivery_extra_pickup_stop_fee : 0,
    extraPickupZoneFee: Number.isFinite(values.delivery_extra_pickup_zone_fee) ? values.delivery_extra_pickup_zone_fee : 0,
  };
}

/** Add admin-configured pickup handling costs to the single customer-facing basket fee. */
export function addMarketplacePickupFees(baseFee, storeSlugs, pricing = getDeliveryPricing()) {
  const slugs = [...new Set(storeSlugs.map((s) => String(s || '').trim()).filter(Boolean))];
  if (!slugs.length) return { fee: baseFee, pickupStops: 0, pickupZones: 0 };
  const placeholders = slugs.map(() => '?').join(',');
  const stores = q.all(`SELECT id,delivery_zone FROM stores WHERE slug IN (${placeholders})`, slugs);
  const zones = new Set(stores.map((s) => clean(s.delivery_zone) || `store:${s.id}`));
  const stopSurcharge = Math.max(0, stores.length - 1) * pricing.extraPickupStopFee;
  const zoneSurcharge = Math.max(0, zones.size - 1) * pricing.extraPickupZoneFee;
  return { fee: Math.min(5000, baseFee + stopSurcharge + zoneSurcharge), pickupStops: stores.length, pickupZones: zones.size, stopSurcharge, zoneSurcharge };
}

export function deliveryFeeForDistance(distanceKm, pricing = getDeliveryPricing()) {
  return Math.min(5000, pricing.baseFee + Math.ceil(Math.max(0, distanceKm - pricing.includedKm)) * pricing.perKm);
}

/** One pooled courier fare, split by pickup stop: the customer pays only the
 * shares for stores that did not promise free shipping; qualifying stores
 * sponsor their own shares. The checkout still shows one combined fee. */
export function splitSharedDeliveryFee(fee, stores) {
  const count = stores.length;
  if (!count) return { customerFee: 0, storeShares: [] };
  const base = Math.floor(fee / count);
  let remainder = fee % count;
  const storeShares = stores.map(({ freeShipping }) => {
    const share = base + (remainder-- > 0 ? 1 : 0);
    return { freeShipping: Boolean(freeShipping), share };
  });
  return { customerFee: storeShares.reduce((sum, x) => sum + (x.freeShipping ? 0 : x.share), 0), storeShares };
}

/** Twist-wide free delivery: when on, customers pay no delivery fee (Twist absorbs it) on baskets of at least `over` EGP (0 = every basket). */
export function getPlatformFreeShipping() {
  const v = Object.fromEntries(q.all("SELECT key, value FROM app_settings WHERE key IN ('platform_free_shipping_enabled','platform_free_shipping_over')").map((r) => [r.key, r.value]));
  return { enabled: v.platform_free_shipping_enabled === '1', over: Math.max(0, Math.round(Number(v.platform_free_shipping_over) || 0)) };
}
export function savePlatformFreeShipping({ enabled, over }) {
  for (const [k, val] of [['platform_free_shipping_enabled', enabled ? '1' : '0'], ['platform_free_shipping_over', String(Math.max(0, Math.round(Number(over) || 0)))]]) {
    q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, val]);
  }
  return getPlatformFreeShipping();
}
export function platformFreeApplies(basketSubtotal) {
  const p = getPlatformFreeShipping();
  return p.enabled && basketSubtotal >= p.over;
}

export function saveDeliveryPricing(pricing) {
  for (const [key, value] of [['delivery_base_fee', pricing.baseFee], ['delivery_included_km', pricing.includedKm], ['delivery_per_km', pricing.perKm], ['delivery_extra_pickup_stop_fee', pricing.extraPickupStopFee], ['delivery_extra_pickup_zone_fee', pricing.extraPickupZoneFee]]) {
    q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
  }
  return getDeliveryPricing();
}

export function resolveDeliveryRate(governorate, city, storeSlugs = []) {
  const gov = clean(governorate);
  const area = clean(city);
  const rows = q.all('SELECT governorate, city, fee, distance_km FROM delivery_rates ORDER BY id');

  // 1. Try exact city match in same governorate
  let cityMatch = area ? rows.find((r) => (clean(r.governorate) === gov || clean(r.governorate) === '*') && clean(r.city) === area) : null;

  // 2. Try flexible/substring match (e.g. "شبرا" matching "شبرا الخيمة" or vice versa)
  // (whole words only, longest listed area wins: "الفلل بنها" -> الفلل, but "بنها" alone never matches "كفر الشيخ بنها")
  if (!cityMatch && area && area.length >= 2) {
    const padded = ` ${area} `;
    let best = null;
    for (const r of rows) {
      if (clean(r.governorate) !== gov && clean(r.governorate) !== '*') continue;
      const rateCity = clean(r.city);
      if (!rateCity || rateCity === '*' || rateCity.length < 3) continue;
      if (padded.includes(` ${rateCity} `) && (!best || rateCity.length > clean(best.city).length)) best = r;
    }
    cityMatch = best;
  }

  const governorateRate = rows.find((r) => clean(r.governorate) === gov && (!clean(r.city) || clean(r.city) === '*'));
  const defaultRate = rows.find((r) => clean(r.governorate) === '*' && (!clean(r.city) || clean(r.city) === '*'));
  const match = cityMatch || governorateRate || defaultRate;

  if (match) {
    const pricing = getDeliveryPricing();
    const distanceKm = match.distance_km == null ? null : Number(match.distance_km);
    const fee = distanceKm == null ? match.fee : deliveryFeeForDistance(distanceKm, pricing);
    return { fee, matched: true, scope: cityMatch ? 'city' : governorateRate ? 'governorate' : 'default', distanceKm };
  }
  const slugs = [...new Set(storeSlugs.map((s) => String(s).trim()).filter(Boolean))];
  return { fee: getDeliveryPricing().baseFee, matched: false, scope: 'fallback' };
}

/* ------------------------------------------------------------------
 * Pickup-zone pricing (marketplace baskets)
 * Every pickup zone has a customer price and (optionally) our real courier cost.
 * Shops in one zone = one stop = one price. A basket from several zones pays the sum of the
 * zone prices minus an admin-set % discount for that many zones - but never below what the
 * combined trip really costs us (+ minimum margin), so a discount can't lose money.
 * ------------------------------------------------------------------ */
export const zoneKey = (zone, storeId) => clean(zone) || `store:${storeId}`;

export function getZonePolicy() {
  const rows = Object.fromEntries(q.all("SELECT key, value FROM app_settings WHERE key IN ('delivery_multizone_discount','delivery_extra_stop_cost','delivery_min_margin')").map((r) => [r.key, r.value]));
  let tiers = {};
  try { tiers = JSON.parse(rows.delivery_multizone_discount || '{}'); } catch { tiers = {}; }
  const clamp = (v) => Math.max(0, Math.min(90, Math.round(Number(v) || 0)));
  const tierList = Object.entries(tiers).map(([n, pct]) => ({ zones: Number(n), percent: clamp(pct) })).filter((t) => t.zones >= 2).sort((a, b) => a.zones - b.zones);
  return { tiers: tierList, extraStopCost: Math.max(0, Math.round(Number(rows.delivery_extra_stop_cost) || 0)), minMargin: Math.max(0, Math.round(Number(rows.delivery_min_margin) || 0)) };
}

export function saveZonePolicy({ tiers = [], extraStopCost = 0, minMargin = 0 }) {
  const obj = {};
  for (const t of tiers) if (t.zones >= 2 && t.zones <= 10) obj[t.zones] = Math.max(0, Math.min(90, Math.round(Number(t.percent) || 0)));
  for (const [k, v] of [['delivery_multizone_discount', JSON.stringify(obj)], ['delivery_extra_stop_cost', String(Math.max(0, Math.round(Number(extraStopCost) || 0)))], ['delivery_min_margin', String(Math.max(0, Math.round(Number(minMargin) || 0)))]]) {
    q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
  }
  return getZonePolicy();
}

/** The discount % that applies to a basket spanning `n` zones (highest tier not above n). */
export function discountPercentFor(n, policy = getZonePolicy()) {
  let pct = 0;
  for (const t of policy.tiers) if (t.zones <= n) pct = t.percent;
  return pct;
}

/** Pure maths (no DB): zones = [{key,name,fee,courierCost}] -> price breakdown. */
export function priceZones(zones, policy) {
  const n = zones.length;
  const subtotal = zones.reduce((s, z) => s + z.fee, 0);
  if (n < 2) return { subtotal, percent: 0, discount: 0, fee: Math.min(5000, subtotal), capped: false, tripCost: null };
  const percent = discountPercentFor(n, policy);
  let fee = Math.round(subtotal * (1 - percent / 100));
  const costs = zones.map((z) => z.courierCost);
  const known = costs.every((c) => c > 0);
  const tripCost = known ? Math.max(...costs) + (n - 1) * policy.extraStopCost : null;
  let capped = false;
  if (tripCost != null) {
    const floor = Math.min(subtotal, tripCost + policy.minMargin);
    if (fee < floor) { fee = floor; capped = true; }
  }
  fee = Math.min(5000, fee);
  return { subtotal, percent: capped ? Math.round(((subtotal - fee) / subtotal) * 100) : percent, discount: subtotal - fee, fee, capped, tripCost };
}

const BANHA_CENTER = { lat: 30.4666, lng: 31.1836 }; // downtown Banha: the reference point for "far"
const kmBetween = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const hasCoords = (s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)) && !(Number(s.lat) === 0 && Number(s.lng) === 0);
const readNum = (key, fallback) => { const raw = q.val('SELECT value FROM app_settings WHERE key=?', [key]); const v = raw == null || raw === '' ? NaN : Number(raw); return Number.isFinite(v) && v >= 0 ? v : fallback; };

/** Multi-store basket rule (editable in the admin "رسوم التوصيل" page). */
export function getMultiStoreRule() {
  return {
    extraFee: readNum('delivery_extra_pickup_stop_fee', 5),     // +EGP per extra pickup zone
    farExtraFee: readNum('delivery_far_extra_fee', 10),         // +EGP for a zone far from downtown
    sameZoneKm: readNum('delivery_same_zone_km', 0.8),          // stores closer than this = one zone
    farKm: readNum('delivery_far_km', 4),                       // "far" = more than this from downtown Banha
  };
}
export function saveMultiStoreRule(r) {
  const clamp = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
  for (const [k, val] of [['delivery_extra_pickup_stop_fee', Math.round(clamp(r.extraFee, 500))], ['delivery_far_extra_fee', Math.round(clamp(r.farExtraFee, 500))], ['delivery_same_zone_km', clamp(r.sameZoneKm, 20)], ['delivery_far_km', clamp(r.farKm, 200)]]) {
    q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(val)]);
  }
  return getMultiStoreRule();
}

/**
 * Basket delivery quote (price-sheet rule):
 *  - the price of the destination area, once. Stores in the SAME pickup zone are one stop = no extra.
 *    A store's zone is the "pickup zone" text the admin set, or, when that is empty, its map location:
 *    stores within delivery_same_zone_km (0.8 km) of each other are one zone.
 *  - + an extra for every other pickup zone: the admin's per-zone extra if set, otherwise 5 EGP
 *    (extraPickupStopFee) or 10 EGP (delivery_far_extra_fee) when the zone is more than delivery_far_km (4 km)
 *    from downtown Banha. The zone nearest downtown is the base and is never charged.
 *  - destination not on the price list -> no price (matched=false): customer service quotes it later.
 */
export function computeBasketDelivery(storeSlugs, governorate, city) {
  const slugs = [...new Set(storeSlugs.map((s) => String(s || '').trim()).filter(Boolean))];
  const stores = slugs.length ? q.all(`SELECT id, slug, name_ar, name_en, delivery_zone, lat, lng FROM stores WHERE slug IN (${slugs.map(() => '?').join(',')})`, slugs) : [];
  const dest = resolveDeliveryRate(governorate, city, slugs);
  const matched = dest.matched && dest.scope === 'city';
  const rule = getMultiStoreRule();
  const defaultExtra = rule.extraFee; const sameKm = rule.sameZoneKm; const farKm = rule.farKm; const farExtra = rule.farExtraFee;
  const savedExtra = new Map(q.all('SELECT key, extra_fee FROM pickup_zones').map((z) => [z.key, z.extra_fee]));

  // 1) stores with a named zone first, then the ones without (they can join a group by location)
  const groups = new Map();
  const pt = (s) => ({ lat: Number(s.lat), lng: Number(s.lng) });
  const ordered = [...stores].sort((x, y) => (String(y.delivery_zone || '').trim() ? 1 : 0) - (String(x.delivery_zone || '').trim() ? 1 : 0));
  for (const s of ordered) {
    const named = String(s.delivery_zone || '').trim();
    let key = null;
    if (named) key = zoneKey(named, s.id);
    else if (hasCoords(s)) {
      for (const g of groups.values()) if (g.stores.some((o) => hasCoords(o) && kmBetween(pt(o), pt(s)) <= sameKm)) { key = g.key; break; }
      if (!key) key = `loc:${s.id}`;
    } else key = `store:${s.id}`;
    if (!groups.has(key)) groups.set(key, { key, name: named || s.name_ar, explicit: savedExtra.get(key) ?? null, stores: [] });
    groups.get(key).stores.push(s);
  }
  const list = [...groups.values()].map((g) => {
    const withPos = g.stores.filter(hasCoords);
    g.center = withPos.length ? { lat: withPos.reduce((n, x) => n + Number(x.lat), 0) / withPos.length, lng: withPos.reduce((n, x) => n + Number(x.lng), 0) / withPos.length } : null;
    g.fromCenter = g.center ? kmBetween(g.center, BANHA_CENTER) : null;
    return g;
  });
  // 2) each zone's extra; the cheapest / closest-to-downtown zone is the base and is never charged
  for (const g of list) g.extra = g.explicit != null ? g.explicit : (g.fromCenter != null && g.fromCenter > farKm ? farExtra : defaultExtra);
  list.sort((a, b) => a.extra - b.extra || (a.fromCenter ?? 0) - (b.fromCenter ?? 0));
  const zones = list.map((g, i) => ({ key: g.key, name: g.name, fee: i === 0 ? dest.fee : g.extra, courierCost: 0, custom: false, stores: g.stores.map((s) => ({ slug: s.slug, name_ar: s.name_ar, name_en: s.name_en, lat: s.lat, lng: s.lng })) }));
  const subtotal = zones.reduce((sum, z) => sum + z.fee, 0);
  return { zones, subtotal, percent: 0, discount: 0, fee: matched ? Math.min(5000, subtotal) : 0, capped: false, tripCost: null, matched, scope: dest.scope, stopCount: stores.length };
}

/** @deprecated old pickup-zone pricing (groups shops by pickup zone). */
export function computeBasketDeliveryByZones(storeSlugs, governorate, city) {
  const slugs = [...new Set(storeSlugs.map((s) => String(s || '').trim()).filter(Boolean))];
  const stores = slugs.length ? q.all(`SELECT id, slug, name_ar, name_en, delivery_zone, lat, lng FROM stores WHERE slug IN (${slugs.map(() => '?').join(',')})`, slugs) : [];
  const dest = resolveDeliveryRate(governorate, city, slugs); // fallback price for a zone that has none
  const saved = new Map(q.all('SELECT key, name, fee, courier_cost FROM pickup_zones').map((z) => [z.key, z]));
  const groups = new Map();
  for (const s of stores) {
    const key = zoneKey(s.delivery_zone, s.id);
    if (!groups.has(key)) {
      const row = saved.get(key);
      groups.set(key, { key, name: String(s.delivery_zone || '').trim() || s.name_ar, fee: row && row.fee > 0 ? row.fee : dest.fee, courierCost: row?.courier_cost || 0, custom: Boolean(row && row.fee > 0), stores: [] });
    }
    groups.get(key).stores.push({ slug: s.slug, name_ar: s.name_ar, name_en: s.name_en, lat: s.lat, lng: s.lng });
  }
  const zones = [...groups.values()];
  const policy = getZonePolicy();
  const price = priceZones(zones, policy);
  return { zones, ...price, matched: dest.matched, scope: dest.scope, stopCount: stores.length };
}
