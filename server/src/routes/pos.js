import { Router } from 'express';
import { z } from 'zod';
import { h, AppError } from '../lib/errors.js';
import { requireOwner } from '../lib/auth.js';
import { posGate, bootstrap, saveSale, saveReturn, readSale, daySummary, listSales, saleIdByNumber } from '../lib/pos.js';
import { refreshCatalogueCache } from '../lib/cashier-sync.js';
import { q } from '../db/index.js';
import { notifyOrderStatus } from '../lib/buyers.js';

/** Twist cashier API (store owner sign-in). Mounted at /api/pos. */
const r = Router();
r.use(requireOwner);

const int = z.coerce.number().int();
const uuid = z.string().trim().min(8).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

r.get('/bootstrap', h((req, res) => {
  const access = posGate(req.store.id);
  res.json({ ...bootstrap(req.store), access: { state: access.state, endsAt: access.endsAt, graceDays: access.graceDays } });
}));

const saleBody = z.object({
  uuid,
  localNo: z.string().trim().max(40).optional(),
  createdAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'bad date'),
  items: z.array(z.object({
    productId: int.positive(), variantId: int.positive().nullish(),
    qty: int.min(1).max(1000), price: int.min(0).max(10_000_000), discount: int.min(0).max(10_000_000).default(0),
  })).min(1).max(200),
  discount: int.min(0).max(10_000_000).default(0),
  payments: z.array(z.object({ method: z.enum(['cash', 'card', 'wallet']), amount: int.min(0).max(100_000_000) })).min(1).max(5),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(300).optional(),
  reservationId: int.positive().optional(), // a "reserve & try in store" request the shopper came for
});

r.post('/sales', h(async (req, res) => {
  const body = saleBody.parse(req.body);
  posGate(req.store.id, { deviceAt: body.createdAt, sync: true });
  const before = body.reservationId ? q.val('SELECT status FROM orders WHERE id=? AND store_id=?', [body.reservationId, req.store.id]) : null;
  const out = saveSale(req.store, body, req.user.name || '');
  if (!out.duplicate) await refreshCatalogueCache();
  if (!out.duplicate && body.reservationId) {
    const st = q.val('SELECT status FROM orders WHERE id=? AND store_id=?', [body.reservationId, req.store.id]);
    if (st === 'delivered' && before !== 'delivered') try { notifyOrderStatus(body.reservationId, 'delivered'); } catch { /* best effort */ }
  }
  res.json(out);
}));

r.get('/sales', h((req, res) => {
  posGate(req.store.id, { sync: true });
  const p = z.object({ day: day.optional(), before: int.optional(), limit: int.min(1).max(100).default(50) }).parse(req.query);
  res.json({ sales: listSales(req.store.id, { day: p.day, limit: p.limit, beforeId: p.before }) });
}));

r.get('/sales/number/:n', h((req, res) => {
  posGate(req.store.id, { sync: true });
  const id = saleIdByNumber(req.store.id, Number(req.params.n));
  if (!id) throw new AppError(404, 'not_found', 'Invoice not found.');
  res.json({ sale: readSale(req.store.id, id) });
}));

r.get('/sales/:id', h((req, res) => {
  posGate(req.store.id, { sync: true });
  const s = readSale(req.store.id, Number(req.params.id));
  if (!s) throw new AppError(404, 'not_found', 'Invoice not found.');
  res.json({ sale: s });
}));

r.post('/returns', h(async (req, res) => {
  posGate(req.store.id);
  const body = z.object({
    uuid, saleId: int.positive(),
    items: z.array(z.object({ saleItemId: int.positive(), qty: int.min(1).max(1000) })).min(1).max(200),
    method: z.enum(['cash', 'card', 'wallet']).default('cash'),
    reason: z.string().trim().max(200).optional(),
    restock: z.boolean().default(true),
  }).parse(req.body);
  const out = saveReturn(req.store, body, req.user.name || '');
  if (!out.duplicate) await refreshCatalogueCache();
  res.json(out);
}));

r.get('/summary', h((req, res) => {
  posGate(req.store.id, { sync: true });
  const d = z.object({ day: day.optional() }).parse(req.query).day || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  res.json(daySummary(req.store.id, d));
}));

export default r;
