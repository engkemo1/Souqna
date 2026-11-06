import { Router } from 'express';
import multer from 'multer';
import { h, AppError } from '../lib/errors.js';
import { saveAdImage } from '../lib/adImage.js';
import { listAdvertisers, getAdvertiser, createAdvertiser, updateAdvertiser, deleteAdvertiser, advertiserReport } from '../lib/advertisers.js';
import {
  PLACEMENTS, PLACEMENT_KEYS, listCampaigns, getCampaign, createCampaign, updateCampaign, setPaused, archiveCampaign, restoreCampaign, deleteCampaign,
  duplicateCampaign, previewCampaign, eligibleOffers, adminStores, storeTargets, allCategories, analytics,
} from '../lib/featured.js';

/** Featured Ads & Offers — platform admin only. Mounted inside the admin router, so the admin key / 2-step check has already run. */
const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const id = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n) || n <= 0) throw new AppError(404, 'not_found', 'Not found — غير موجود'); return n; };
const days = (v) => ([7, 14, 30, 90].includes(Number(v)) ? Number(v) : 30);

r.get('/featured/meta', h((_req, res) => {
  res.json({ placements: PLACEMENT_KEYS.map((key) => ({ key, ...PLACEMENTS[key] })), stores: adminStores(), categories: allCategories() });
}));
r.get('/featured/campaigns', h((req, res) => {
  const { state, type, store, placement, q: search, sort } = req.query;
  res.json(listCampaigns({ state: String(state || ''), type: String(type || ''), store: String(store || ''), placement: String(placement || ''), search: String(search || '').slice(0, 80), sort: String(sort || 'newest') }));
}));
r.get('/featured/campaigns/:id', h((req, res) => { res.json({ campaign: getCampaign(id(req)) }); }));
r.post('/featured/campaigns', h((req, res) => { res.status(201).json({ campaign: createCampaign(req.body, { publish: req.body?.publish === true }) }); }));
r.put('/featured/campaigns/:id', h((req, res) => { res.json({ campaign: updateCampaign(id(req), req.body) }); }));
r.post('/featured/campaigns/:id/pause', h((req, res) => { res.json({ campaign: setPaused(id(req), true) }); }));
r.post('/featured/campaigns/:id/resume', h((req, res) => { res.json({ campaign: setPaused(id(req), false) }); }));
r.post('/featured/campaigns/:id/archive', h((req, res) => { res.json({ campaign: archiveCampaign(id(req)) }); }));
r.post('/featured/campaigns/:id/restore', h((req, res) => { res.json({ campaign: restoreCampaign(id(req)) }); }));
r.post('/featured/campaigns/:id/duplicate', h((req, res) => { res.status(201).json({ campaign: duplicateCampaign(id(req)) }); }));
r.delete('/featured/campaigns/:id', h((req, res) => { res.json(deleteCampaign(id(req))); }));
r.post('/featured/preview', h((req, res) => { res.json(previewCampaign(req.body)); }));
r.get('/featured/stores/:id/offers', h((req, res) => { res.json(eligibleOffers(id(req))); }));
r.get('/featured/stores/:id/targets', h((req, res) => { res.json(storeTargets(id(req))); }));
r.get('/featured/analytics', h((req, res) => { res.json(analytics({ days: days(req.query.days) })); }));
r.get('/featured/campaigns/:id/analytics', h((req, res) => { const cid = id(req); getCampaign(cid); res.json(analytics({ days: days(req.query.days), id: cid })); }));
r.get('/featured/advertisers', h((req, res) => { res.json(listAdvertisers({ days: days(req.query.days) })); }));
r.post('/featured/advertisers', h(async (req, res) => { res.status(201).json({ advertiser: await createAdvertiser(req.body) }); }));
r.get('/featured/advertisers/:id', h((req, res) => { res.json({ advertiser: getAdvertiser(id(req), days(req.query.days)) }); }));
r.put('/featured/advertisers/:id', h(async (req, res) => { res.json({ advertiser: await updateAdvertiser(id(req), req.body) }); }));
r.delete('/featured/advertisers/:id', h((req, res) => { res.json(deleteAdvertiser(id(req))); }));
r.get('/featured/advertisers/:id/report', h((req, res) => { res.json(advertiserReport(id(req), [7, 14, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7)); }));
r.post('/featured/image', upload.single('file'), h(async (req, res) => {
  if (!req.file) throw new AppError(422, 'validation_failed', 'Pick an image — اختر صورة', { file: 'required' });
  res.json(await saveAdImage(req.file.buffer, req.query.kind === 'fg' ? 'fg' : 'bg'));
}));

export default r;
