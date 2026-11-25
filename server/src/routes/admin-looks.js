import { Router } from 'express';
import { z } from 'zod';
import { h, AppError } from '../lib/errors.js';
import { q } from '../db/index.js';
import { loadKnowledge } from '../lib/moda/knowledge.js';
import { stylistSettings, stylistTrainingSettings, liveOffersForModa, storesForModa, cardsByIds } from '../lib/stylist.js';
import { generateBatch, evaluateReviews, reviewSnapshot, REJECT_REASONS } from '../lib/moda/golden.js';
import { RULES_VERSION } from '../lib/moda/smartlook.js';
import { modaCatalogRows } from './public.js';
import { enrichAll } from '../lib/moda/products.js';
import { visualGateConfig, coverageOf, visualTagsOf, inferVisualTags, parseStoredTags, isUpperBody, layerRoleOf, PATTERNS, LOUDNESS, TIERS, SILHOUETTES, LAYER_ROLES } from '../lib/moda/visualtags.js';

/** Golden Outfit Set: staff judge real looks (accept / reject + reason). Mounted inside the admin router (admin key already checked). */
const r = Router();
const SECOND_EVERY = 5; // every 5th look is judged by a second person to measure reviewer agreement
let generating = false;

const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const reviewerName = (v) => String(v || 'admin').trim().slice(0, 40) || 'admin';
const needsSecond = (row) => row.id % SECOND_EVERY === 0;

function stats() {
  const n = (sql, p = []) => q.get(sql, p)?.n || 0;
  const total = n('SELECT COUNT(*) n FROM look_reviews'); const judged = n('SELECT COUNT(*) n FROM look_reviews WHERE verdict IS NOT NULL');
  const accept = n("SELECT COUNT(*) n FROM look_reviews WHERE verdict='accept'"); const reject = n("SELECT COUNT(*) n FROM look_reviews WHERE verdict='reject'");
  const byReason = {}; for (const x of q.all("SELECT reasons_json FROM look_reviews WHERE verdict='reject'")) for (const k of parse(x.reasons_json) || []) byReason[k] = (byReason[k] || 0) + 1;
  const both = q.all('SELECT verdict, verdict2 FROM look_reviews WHERE verdict2 IS NOT NULL AND verdict IS NOT NULL');
  const agree = both.filter((x) => x.verdict === x.verdict2).length;
  return { total, judged, pending: total - judged, accept, reject, byReason, secondPairs: both.length, secondAgreement: both.length ? agree / both.length : null, target: 300, rulesVersion: RULES_VERSION, batches: q.all('SELECT batch, COUNT(*) n, SUM(verdict IS NOT NULL) judged FROM look_reviews GROUP BY batch ORDER BY MAX(id) DESC LIMIT 10') };
}

r.get('/look-review/stats', h((_req, res) => { res.json({ ...stats(), reasons: REJECT_REASONS }); }));

r.post('/look-review/generate', h(async (req, res) => {
  const body = z.object({ count: z.coerce.number().int().min(6).max(60).optional().default(30) }).parse(req.body || {});
  if (generating) throw new AppError(409, 'busy', 'Generation already running.');
  generating = true;
  try {
    const rows = modaCatalogRows();
    const out = await generateBatch({ count: body.count, batch: `b${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`, rows, K: loadKnowledge(), offers: liveOffersForModa, stores: storesForModa, training: stylistTrainingSettings(), assistantName: stylistSettings().name });
    res.json(out);
  } finally { generating = false; }
}));

/** Blind: the reviewer never sees the system's verdict or score. */
r.get('/look-review/next', h((req, res) => {
  const me = reviewerName(req.query.reviewer);
  const row = q.get(`SELECT * FROM look_reviews WHERE verdict IS NULL ORDER BY RANDOM() LIMIT 1`)
    || q.all('SELECT * FROM look_reviews WHERE verdict IS NOT NULL AND verdict2 IS NULL AND (reviewer IS NULL OR reviewer<>?)', [me]).find(needsSecond);
  if (!row) return res.json({ item: null, stats: stats() });
  const snap = parse(row.snapshot_json); const cards = new Map(cardsByIds(snap.pieces.map((p) => p.id)).map((c) => [c.id, c]));
  const pieces = snap.pieces.map((p) => ({ id: p.id, key: p.key, gender: p.gender, name_ar: p.name_ar, price: p.price, sizes: [...new Set((p.variants || []).filter((v) => v.stock > 0 || p.track_stock === 0 || p.track_stock === false).map((v) => v.size).filter(Boolean))], card: cards.get(p.id) || null }));
  res.json({ item: { id: row.id, second: row.verdict != null, audience: snap.audience, heroKey: snap.heroKey, month: snap.month, pieces }, stats: stats() });
}));

r.post('/look-review/:id/verdict', h((req, res) => {
  const body = z.object({ verdict: z.enum(['accept', 'reject']), reasons: z.array(z.enum(REJECT_REASONS)).max(7).optional().default([]), note: z.string().trim().max(300).optional().default(''), reviewer: z.string().max(40).optional() }).parse(req.body);
  if (body.verdict === 'reject' && !body.reasons.length) throw new AppError(422, 'validation_failed', 'Choose at least one reason for a rejection.');
  const row = q.get('SELECT * FROM look_reviews WHERE id=?', [Number(req.params.id)]); if (!row) throw new AppError(404, 'not_found', 'Look not found.');
  const me = reviewerName(body.reviewer); const reasons = body.verdict === 'reject' ? [...new Set(body.reasons)] : [];
  if (row.verdict == null) q.run("UPDATE look_reviews SET verdict=?, reasons_json=?, note=?, reviewer=?, reviewed_at=datetime('now') WHERE id=?", [body.verdict, JSON.stringify(reasons), body.note, me, row.id]);
  else if (row.verdict2 == null && row.reviewer !== me && needsSecond(row)) q.run("UPDATE look_reviews SET verdict2=?, reasons2_json=?, reviewer2=?, reviewed2_at=datetime('now') WHERE id=?", [body.verdict, JSON.stringify(reasons), me, row.id]);
  else throw new AppError(409, 'already_judged', 'This look is already judged.');
  res.json({ ok: true, stats: stats() });
}));

/** Reviewer vs humans using the CURRENT rules on the frozen snapshots. Only looks with a verdict count. */
r.get('/look-review/evaluate', h((_req, res) => {
  const rows = q.all('SELECT id, verdict, reasons_json, snapshot_json, bucket FROM look_reviews WHERE verdict IS NOT NULL').map((x) => ({ id: x.id, verdict: x.verdict, reasons: parse(x.reasons_json) || [], snapshot: parse(x.snapshot_json), bucket: x.bucket }));
  const ev = evaluateReviews(rows);
  const byBucket = {}; for (const x of rows) { const b = (byBucket[x.bucket] ||= { n: 0, accept: 0 }); b.n += 1; if (x.verdict === 'accept') b.accept += 1; }
  res.json({ ...ev, byBucket, enough: ev.total >= 300, note: ev.total < 300 ? 'Fewer than 300 judgments: treat the numbers as indicative only.' : null });
}));

r.get('/look-review/export', h((req, res) => {
  const rows = q.all('SELECT * FROM look_reviews ORDER BY id').map((x) => {
    const snap = parse(x.snapshot_json); const now = snap ? reviewSnapshot(snap) : null;
    return { id: x.id, batch: x.batch, bucket: x.bucket, anchor_id: x.anchor_id, rules_version_at_creation: x.rules_version, system_score_at_creation: x.system_score, system_ok_at_creation: !!x.system_ok, system_reasons_at_creation: parse(x.system_reasons) || [], system_ok_now: now?.ok ?? null, system_score_now: now?.score ?? null, verdict: x.verdict, reasons: parse(x.reasons_json) || [], note: x.note, reviewer: x.reviewer, verdict2: x.verdict2, reasons2: parse(x.reasons2_json) || [], reviewer2: x.reviewer2, snapshot: snap };
  });
  if (req.query.format === 'json') return res.set('Content-Disposition', 'attachment; filename="golden-looks.json"').json({ rulesVersion: RULES_VERSION, items: rows });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', 'batch', 'bucket', 'anchor_id', 'pieces', 'system_ok_at_creation', 'system_score_at_creation', 'system_ok_now', 'system_score_now', 'verdict', 'reasons', 'note', 'reviewer', 'verdict2', 'reasons2', 'reviewer2'];
  const lines = rows.map((x) => [x.id, x.batch, x.bucket, x.anchor_id, (x.snapshot?.pieces || []).map((p) => `${p.key}#${p.id}`).join(' | '), x.system_ok_at_creation, x.system_score_at_creation, x.system_ok_now, x.system_score_now, x.verdict, x.reasons.join('+'), x.note, x.reviewer, x.verdict2, x.reasons2.join('+'), x.reviewer2].map(esc).join(','));
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="golden-looks.csv"').send(`﻿${head.join(',')}\n${lines.join('\n')}`);
}));

/* ---- visual tags review: see what the system believes about each upper-body product, correct it. Corrections (source 'admin') override inferred tags. ---- */
const tagView = (p) => { const t = visualTagsOf(p); return { id: p.id, name_ar: p.name_ar, name_en: p.name_en, key: p.key, store: p.store_slug, image: p.image || null, tags: { pattern: t.pattern, visualLoudness: t.visualLoudness, styleTier: t.styleTier, silhouette: t.silhouette, layerRole: t.layerRole }, source: t.source, confidence: t.confidence, evidence: t.evidence, reliable: t.reliable, text: inferVisualTags(p) }; };
r.get('/visual-tags', h((req, res) => {
  const filter = ['unknown', 'text', 'admin', 'all'].includes(req.query.filter) ? req.query.filter : 'unknown';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60)); const offset = Math.max(0, Number(req.query.offset) || 0);
  const upper = enrichAll(modaCatalogRows(), loadKnowledge()).filter((p) => p.key && !p.notFashion && isUpperBody(layerRoleOf(p.key)));
  // how often each product was the missing-tags reason behind a would-be rejection (shadow log, last 30 days): fix the most-shown first
  const hits = new Map();
  for (const ev of q.all("SELECT data_json FROM smart_look_events WHERE event='visual_would_reject' AND created_at >= datetime('now','-30 days') ORDER BY id DESC LIMIT 5000")) for (const id of parse(ev.data_json)?.missing || []) hits.set(id, (hits.get(id) || 0) + 1);
  const views = upper.map((p) => ({ ...tagView(p), hits: hits.get(p.id) || 0, sold: Number(p.sold_count) || 0 }));
  const cov = coverageOf(upper);
  const summary = { upperBodyProducts: cov.upperBody, reliable: cov.reliable, unknown: cov.unknown, fromAdmin: cov.fromAdmin, fromImage: cov.fromImage, fromText: cov.fromText, coveragePct: cov.pct, readyForClear: cov.readyForClear, readyForUnknown: cov.readyForUnknown, gate: visualGateConfig(), wouldRejectLogged30d: [...hits.values()].reduce((a, c) => a + c, 0) };
  const shown = views.filter((v) => (filter === 'all' ? true : filter === 'unknown' ? !v.reliable : filter === 'admin' ? v.source === 'admin' : v.source === 'text' && v.reliable)).sort((a, c) => c.hits - a.hits || c.sold - a.sold);
  res.json({ summary, total: shown.length, items: shown.slice(offset, offset + limit), options: { pattern: PATTERNS, visualLoudness: LOUDNESS, styleTier: TIERS, silhouette: SILHOUETTES, layerRole: LAYER_ROLES } });
}));
r.put('/visual-tags/:productId', h((req, res) => {
  const id = Number(req.params.productId); if (!q.get('SELECT id FROM products WHERE id=?', [id])) throw new AppError(404, 'not_found', 'Product not found.');
  const body = z.object({ pattern: z.enum(PATTERNS).optional(), visualLoudness: z.enum(LOUDNESS).optional(), styleTier: z.enum(TIERS).optional(), silhouette: z.enum(SILHOUETTES).optional(), layerRole: z.enum(LAYER_ROLES).optional(), updatedBy: z.string().max(40).optional() }).parse(req.body);
  const tags = parseStoredTags({ ...body, source: 'admin', confidence: 'high' });
  q.run("INSERT INTO product_visual_tags (product_id, tags_json, source, confidence, updated_by, updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(product_id) DO UPDATE SET tags_json=excluded.tags_json, source=excluded.source, confidence=excluded.confidence, updated_by=excluded.updated_by, updated_at=excluded.updated_at", [id, JSON.stringify(tags), 'admin', 'high', reviewerName(body.updatedBy)]);
  res.json({ ok: true });
}));
r.delete('/visual-tags/:productId', h((req, res) => { q.run('DELETE FROM product_visual_tags WHERE product_id=?', [Number(req.params.productId)]); res.json({ ok: true }); }));

export default r;
