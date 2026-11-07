import { Router } from 'express';
import { z } from 'zod';
import { h, AppError } from '../lib/errors.js';
import { couriersReport, addSettlement, deleteSettlement, alertsReport, marketInsights, auditList, exportCsv, todayGlance } from '../lib/insights.js';
import { campaignStats } from '../lib/traffic.js';
import { growthReport } from '../lib/engage.js';
import { stylistLogReport } from '../lib/stylist-log.js';

/** Extra platform-admin endpoints. Mounted inside the admin router, so the admin key / 2-step check has already run. */
const r = Router();
const days = (v, fallback = 30, allowed = [7, 14, 30, 90]) => (allowed.includes(Number(v)) ? Number(v) : fallback);

r.get('/couriers', h((req, res) => { res.json(couriersReport(days(req.query.days, 14))); }));

r.post('/couriers/:id/settlements', h((req, res) => {
  const body = z.object({ amount: z.coerce.number().int().min(1).max(1_000_000), note: z.string().trim().max(120).optional(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.body);
  const id = addSettlement(Number(req.params.id), body.amount, body.note, body.day);
  if (!id) throw new AppError(404, 'not_found', 'Courier not found.');
  res.status(201).json({ id });
}));
r.delete('/couriers/settlements/:id', h((req, res) => {
  if (!deleteSettlement(Number(req.params.id))) throw new AppError(404, 'not_found', 'Settlement not found.');
  res.json({ ok: true });
}));

r.get('/growth', h((_req, res) => { res.json(growthReport()); }));
r.get('/today', h((_req, res) => { res.json(todayGlance()); }));
r.get('/campaigns', h((req, res) => { res.json(campaignStats(days(req.query.days, 30, [7, 30, 90]))); }));
r.get('/stylist-log', h((req, res) => { res.json(stylistLogReport(days(req.query.days, 30, [7, 30, 90]))); }));
r.get('/alerts', h((_req, res) => { res.json(alertsReport()); }));
r.get('/insights', h((req, res) => { res.json(marketInsights(days(req.query.days, 30, [7, 30, 90]))); }));
r.get('/audit', h((req, res) => { res.json({ items: auditList(Number(req.query.limit) || 300) }); }));

r.get('/export/:kind', h((req, res) => {
  const out = exportCsv(req.params.kind, days(req.query.days, 30, [7, 30, 90]));
  if (!out) throw new AppError(404, 'not_found', 'Unknown export.');
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="twist-${out.name}-${new Date().toISOString().slice(0, 10)}.csv"`).send(out.csv);
}));

export default r;
