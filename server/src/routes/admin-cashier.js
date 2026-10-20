import multer from 'multer';
import { z } from 'zod';
import { q } from '../db/index.js';
import { h, AppError, badRequest } from '../lib/errors.js';
import { readTable, guessMapping, FIELDS } from '../lib/cashier-table.js';
import { extendSubscription, subscriptionHistory } from '../lib/cashier-access.js';
import { refreshCatalogueCache, planImport, applyPlan, createStoreKey, revokeStoreKey, keyInfo, readLog, readLogDetails } from '../lib/cashier-sync.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const mappingSchema = z.object(Object.fromEntries(FIELDS.map((f) => [f, z.number().int().min(0).max(200).nullable().optional()])));

const storeBySlug = (slug) => {
  const s = q.get('SELECT id, slug, name_ar AS name FROM stores WHERE slug=?', [slug]);
  if (!s) throw new AppError(404, 'not_found', 'Store not found.');
  return s;
};

async function readUpload(req) {
  if (!req.file) throw badRequest('no_file', 'Choose a file first.');
  try { return await readTable(req.file.buffer, req.file.originalname); }
  catch (e) {
    if (e.code === 'xlsx_unavailable' || e.code === 'empty_file') throw badRequest(e.code, e.message);
    throw badRequest('unreadable_file', 'Could not read this file. Use .xlsx or .csv exported from your cashier.');
  }
}

function resolveMapping(req, table) {
  let given = null;
  if (req.body?.mapping) {
    try { given = mappingSchema.parse(JSON.parse(req.body.mapping)); } catch { throw badRequest('bad_mapping', 'The column choices are not valid.'); }
  }
  const mapping = { ...guessMapping(table.headers), ...(given || {}) };
  for (const f of FIELDS) if (mapping[f] === undefined) mapping[f] = null;
  if (given) for (const f of FIELDS) if (given[f] === undefined) mapping[f] = guessMapping(table.headers)[f];
  for (const f of FIELDS) if (mapping[f] !== null && mapping[f] >= table.headers.length) mapping[f] = null;
  return mapping;
}

const summarize = (plan) => {
  const reasons = {};
  for (const s of plan.skipped) reasons[s.reason] = (reasons[s.reason] || 0) + 1;
  return { total: plan.total, toUpdate: plan.changes.length, unchanged: plan.unchanged, skipped: plan.skipped.length, skippedByReason: reasons, priceDiffs: plan.priceDiffs, barcodesToLearn: plan.learn.length };
};

export function mountCashierAdmin(r) {
  r.get('/cashier-sync/stores/:slug/tools', h((req, res) => {
    const s = storeBySlug(req.params.slug);
    res.json({ key: keyInfo(s.id), log: readLog(s.id), subscription: subscriptionHistory(s.id) });
  }));

  r.get('/cashier-sync/stores/:slug/log/:id', h((req, res) => {
    const s = storeBySlug(req.params.slug);
    res.json({ details: readLogDetails(s.id, Number(req.params.id)) });
  }));

  r.post('/cashier-sync/stores/:slug/extend', h((req, res) => {
    const s = storeBySlug(req.params.slug);
    const body = z.object({ months: z.coerce.number().int().min(1).max(24), amount: z.coerce.number().int().min(0).max(1_000_000).default(0), note: z.string().trim().max(200).default('') }).parse(req.body);
    try { res.json({ endsAt: extendSubscription(s.id, body), subscription: subscriptionHistory(s.id) }); }
    catch (e) { if (e.code === 'no_link') throw badRequest('no_link', e.message); throw e; }
  }));

  r.post('/cashier-sync/stores/:slug/key', h((req, res) => {
    const s = storeBySlug(req.params.slug);
    const key = createStoreKey(s.id);
    res.json({ key, info: keyInfo(s.id) });
  }));

  r.delete('/cashier-sync/stores/:slug/key', h((req, res) => {
    const s = storeBySlug(req.params.slug);
    revokeStoreKey(s.id);
    res.json({ key: null });
  }));

  r.post('/cashier-sync/stores/:slug/import/preview', upload.single('file'), h(async (req, res) => {
    const s = storeBySlug(req.params.slug);
    const table = await readUpload(req);
    const mapping = resolveMapping(req, table);
    let plan = null; let problem = null;
    try { plan = planImport(s.id, table.rows, mapping); }
    catch (e) { if (e.code === 'no_stock_column' || e.code === 'no_key_column') problem = e.code; else throw e; }
    res.json({
      headers: table.headers, sample: table.rows.slice(0, 5), mapping, problem,
      summary: plan ? summarize(plan) : null,
      changes: plan ? plan.changes.slice(0, 40) : [], skipped: plan ? plan.skipped.slice(0, 40) : [],
    });
  }));

  r.post('/cashier-sync/stores/:slug/import/apply', upload.single('file'), h(async (req, res) => {
    const s = storeBySlug(req.params.slug);
    const table = await readUpload(req);
    const mapping = resolveMapping(req, table);
    let plan;
    try { plan = planImport(s.id, table.rows, mapping); }
    catch (e) { if (e.code === 'no_stock_column' || e.code === 'no_key_column') throw badRequest(e.code, e.message); throw e; }
    const logId = applyPlan(s.id, plan, { source: 'file', message: String(req.file.originalname || '').slice(0, 120) });
    if (plan.changes.length) await refreshCatalogueCache();
    res.json({ logId, summary: summarize(plan) });
  }));
}
