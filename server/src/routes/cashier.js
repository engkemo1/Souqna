import { Router } from 'express';
import { z } from 'zod';
import { h, AppError } from '../lib/errors.js';
import { cashierAccess } from '../lib/cashier-access.js';
import { storeFromKey, pushStock, pushSale, refreshCatalogueCache } from '../lib/cashier-sync.js';

/**
 * Public API a store's own cashier can call with its private key.
 *   Authorization: Bearer cshr_...
 *   POST /api/cashier/v1/stock  { items: [{ sku?, barcode?, stock }] }       absolute stock levels (safe to repeat)
 *   POST /api/cashier/v1/sales  { externalId, type?: 'sale'|'return', items: [{ sku?, barcode?, qty }] }
 * Works only while the platform switch is on AND the store's link is "active" and its subscription (if it has an end date) is current or inside the grace days.
 */
const r = Router();

const hits = new Map(); // storeId -> { n, t }  (120 requests/minute per store)
function rateLimit(storeId) {
  const now = Date.now(); const e = hits.get(storeId);
  if (!e || now - e.t > 60_000) { hits.set(storeId, { n: 1, t: now }); return; }
  if (++e.n > 120) throw new AppError(429, 'rate_limited', 'Too many requests. Try again in a minute.');
}

r.use(h((req, _res, next) => {
  const header = req.headers.authorization || '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const storeId = storeFromKey(key);
  if (!storeId) throw new AppError(401, 'invalid_key', 'Invalid or revoked key.');
  const access = cashierAccess(storeId);
  if (!access.allowed) throw new AppError(403, `cashier_${access.state}`, access.state === 'expired' ? 'The cashier subscription for this store has ended. Your data is kept; contact Twist to renew.' : 'Cashier sync is not active for this store.');
  if (access.state === 'grace') _res.setHeader('X-Cashier-Subscription', `grace; ended=${access.endsAt}`);
  rateLimit(storeId);
  req.cashierStoreId = storeId;
  next();
}));

const code = z.string().trim().max(80).optional();
const hasKey = (i) => !!(i.sku || i.barcode);

r.post('/stock', h(async (req, res) => {
  const body = z.object({
    items: z.array(z.object({ sku: code, barcode: code, stock: z.coerce.number().min(-100000).max(100000) }).refine(hasKey, { message: 'sku or barcode required' })).min(1).max(1000),
  }).parse(req.body);
  const out = pushStock(req.cashierStoreId, body.items);
  if (out.updated) await refreshCatalogueCache();
  res.json(out);
}));

r.post('/sales', h(async (req, res) => {
  const body = z.object({
    externalId: z.string().trim().min(1).max(80),
    type: z.enum(['sale', 'return']).default('sale'),
    items: z.array(z.object({ sku: code, barcode: code, qty: z.coerce.number().min(1).max(1000) }).refine(hasKey, { message: 'sku or barcode required' })).min(1).max(200),
  }).parse(req.body);
  const out = pushSale(req.cashierStoreId, body);
  if (!out.duplicate) await refreshCatalogueCache();
  res.json(out);
}));

export default r;
