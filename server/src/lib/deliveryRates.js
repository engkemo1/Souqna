import { q } from '../db/index.js';

const clean = (value) => String(value || '').trim().toLocaleLowerCase('ar-EG');

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
  const exact = rows.find((r) => clean(r.governorate) === gov && clean(r.city) === area && area);
  const governorateRate = rows.find((r) => clean(r.governorate) === gov && !clean(r.city));
  const defaultRate = rows.find((r) => clean(r.governorate) === '*' && clean(r.city) === '*');
  const match = exact || governorateRate || defaultRate;
  if (match) {
    const pricing = getDeliveryPricing();
    const distanceKm = match.distance_km == null ? null : Number(match.distance_km);
    const fee = distanceKm == null ? match.fee : deliveryFeeForDistance(distanceKm, pricing);
    return { fee, matched: true, scope: exact ? 'city' : governorateRate ? 'governorate' : 'default', distanceKm };
  }
  const slugs = [...new Set(storeSlugs.map((s) => String(s).trim()).filter(Boolean))];
  // A store's own delivery price is not a reliable marketplace quote: Twist
  // collects the whole basket in one trip. Use the admin's configured base
  // fee when the customer types an area that has no explicit rate.
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

/** Full basket delivery quote for the checkout (groups shops by pickup zone). */
export function computeBasketDelivery(storeSlugs, governorate, city) {
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
