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
