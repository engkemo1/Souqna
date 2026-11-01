/**
 * Admin-controlled category image generation.
 * Nothing here runs on page views, API reads, startup or deploys. Generation happens only through:
 *   - POST /api/admin/image-library/generate            one section, one provider call
 *   - POST /api/admin/image-library/batches (+ resume)  a controlled batch started by an admin
 * Every result is a *candidate* (temporary bytes in the DB). It becomes a library asset on R2 only when the admin approves it.
 *
 * Provider contract:  async ({ prompt, slug, level }) -> { buffer: Buffer, mime }
 */
import sharp from 'sharp';
import { q, insert, update, tx } from '../db/index.js';
import { AppError } from './errors.js';
import { saveAsset, assignAsset, hamming } from './image-assets.js';

const providers = new Map();
export const registerProvider = (name, fn) => providers.set(name, fn);
export const clearProviders = () => providers.clear();
const selected = () => process.env.IMAGE_GEN_PROVIDER || [...providers.keys()][0] || null;
export const dailyLimit = () => Number(process.env.IMAGE_GEN_DAILY_LIMIT) || 160;       // hard cap on provider calls per UTC day
export const usedToday = () => q.val("SELECT COUNT(*) FROM image_candidates WHERE date(created_at)=date('now')");

export const generationStatus = () => {
  const name = selected(); const ok = !!(name && providers.has(name));
  return { configured: ok, provider: ok ? name : null, providers: [...providers.keys()], daily_limit: dailyLimit(), used_today: usedToday() };
};

/* ---------------------------------------------------------------- prompts */
const STYLE = 'Professional e-commerce photography, soft studio lighting, clean modern composition, high resolution, consistent premium look, no text, no logos, no watermarks, no brand marks.';
const rows = () => new Map(q.all('SELECT slug, name_en, parent_slug, profile FROM departments').map((r) => [r.slug, r]));
const pathOf = (by, slug) => { const out = []; for (let c = by.get(slug), i = 0; c && i < 8; c = by.get(c.parent_slug), i++) out.unshift(c); return out; };
/** What must NOT appear, by shopping profile, so a shoe section never gets a dress and a perfume never gets makeup. */
const NEGATIVE = { footwear: 'Only footwear is visible; no clothing items, no bags.', bags: 'Only bags; no clothing, no shoes.', fragrance: 'Only perfume bottles; no makeup, no clothing.', beauty: 'Only makeup/beauty products; no perfume bottles, no clothing.', accessories: 'Only the accessory; no full outfits.', hijab: 'Hijabs / scarves only.' };

/**
 * Category-specific prompt. A main section gets an editorial campaign image (larger card); a sub-section / type gets one clean product
 * photo of exactly that item, so "Half boots" shows ankle boots and "Abayas" shows an abaya.
 */
export function defaultPrompt(slug) {
  const by = rows(); const path = pathOf(by, slug);
  const node = path[path.length - 1]; if (!node) return `${STYLE}`;
  const level = path.length - 1;
  const name = node.name_en;
  const parents = path.slice(0, -1).map((p) => p.name_en);
  const profile = (path.map((p) => p.profile).reverse().find(Boolean)) || '';
  const neg = NEGATIVE[profile] ? ` ${NEGATIVE[profile]}` : '';
  const ctx = parents.length ? ` (category: ${parents.join(' > ')})` : '';
  if (level === 0) return `Editorial fashion campaign photograph representing the "${name}" department of a premium international fashion marketplace. Elegant, aspirational, portrait composition with the subject centered. ${STYLE}${neg}`;
  return `Studio product photograph of ${name}${ctx}. The product itself is the single clear subject, centered on a neutral light background, shown in a way that unmistakably identifies this exact product type. ${STYLE}${neg}`;
}
export const levelOf = (slug) => pathOf(rows(), slug).length - 1;

/* ------------------------------------------------------------ candidates */
async function inspectGenerated(buffer) {
  try { const m = await sharp(buffer, { failOn: 'error' }).metadata(); if (!m.width || !m.height) throw new Error('empty'); return m; }
  catch { throw new AppError(502, 'generation_failed', 'The provider returned something that is not an image.'); }
}
async function hashOf(buffer) {
  const px = await sharp(buffer).rotate().resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  const avg = px.reduce((a, b) => a + b, 0) / px.length; let bits = ''; for (const v of px) bits += v >= avg ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

const inflight = new Set();               // sections with a provider call in progress (double-click / concurrent-request guard)
/** One provider call → one stored candidate. Enforces the daily cap and one pending candidate per section. */
export async function makeCandidate(slug, { prompt, regenerate = false, by = null } = {}) {
  const st = generationStatus();
  if (!st.configured) throw new AppError(503, 'generation_not_configured', 'No image-generation provider is configured. Upload images instead.');
  if (!q.get('SELECT 1 FROM departments WHERE slug=?', [slug])) throw new AppError(404, 'not_found', 'Department not found.');
  const open = q.get("SELECT id FROM image_candidates WHERE department_slug=? AND status='pending'", [slug]);
  if (open && !regenerate) throw new AppError(409, 'candidate_pending', 'A generated image is already waiting for your decision.', { candidate_id: open.id });
  if (st.used_today >= st.daily_limit) throw new AppError(429, 'daily_limit', `Daily generation limit reached (${st.daily_limit}). Raise IMAGE_GEN_DAILY_LIMIT or continue tomorrow.`);
  if (inflight.has(slug)) throw new AppError(409, 'generation_in_progress', 'This section is already being generated.');
  const text = String(prompt || '').trim().slice(0, 1500) || defaultPrompt(slug);
  inflight.add(slug);
  let out;
  try { out = await providers.get(st.provider)({ prompt: text, slug, level: levelOf(slug) }); }   // the only paid call
  finally { inflight.delete(slug); }
  if (!out?.buffer?.length) throw new AppError(502, 'generation_failed', 'The provider returned no image.');
  const meta = await inspectGenerated(out.buffer);
  const phash = await hashOf(out.buffer);
  const near = [
    ...q.all('SELECT id, phash FROM image_assets WHERE phash IS NOT NULL').filter((r) => hamming(phash, r.phash) <= 5).map((r) => ({ asset: r.id })),
    ...q.all("SELECT id, phash FROM image_candidates WHERE status='pending' AND phash IS NOT NULL AND department_slug<>?", [slug]).filter((r) => hamming(phash, r.phash) <= 5).map((r) => ({ candidate: r.id })),
  ];
  return tx(() => {
    if (open) update('image_candidates', open.id, { status: 'rejected', data: null, decided_at: new Date().toISOString() });
    const id = insert('image_candidates', { department_slug: slug, prompt: text, provider: st.provider, data: out.buffer, mime: out.mime || `image/${meta.format}`, width: meta.width, height: meta.height, phash, near_json: JSON.stringify(near), requested_by: by ? String(by).slice(0, 80) : null });
    return { id, prompt: text, provider: st.provider, near };
  });
}
export const requestCandidate = makeCandidate;

export const candidateRow = (id) => q.get('SELECT * FROM image_candidates WHERE id=?', [id]);
export const listCandidates = () => q.all("SELECT id, department_slug, prompt, provider, width, height, near_json, created_at FROM image_candidates WHERE status='pending' ORDER BY id DESC")
  .map((c) => ({ ...c, near: JSON.parse(c.near_json || '[]'), near_json: undefined }));

/** Approve → stored once in the library (deduplicated, R2), assigned to the section, temporary bytes dropped. */
export async function approveCandidate(id, { by = null } = {}) {
  const c = candidateRow(id);
  if (!c || c.status !== 'pending') throw new AppError(404, 'not_found', 'No pending image with this id.');
  const { asset, duplicate } = await saveAsset(Buffer.from(c.data), { filename: `${c.department_slug}-generated`, source: 'generated', createdBy: by });
  assignAsset(c.department_slug, asset.id);
  update('image_candidates', id, { status: 'approved', asset_id: asset.id, data: null, decided_at: new Date().toISOString() });
  return { asset, duplicate };
}
export function rejectCandidate(id) {
  const c = candidateRow(id);
  if (!c || c.status !== 'pending') throw new AppError(404, 'not_found', 'No pending image with this id.');
  update('image_candidates', id, { status: 'rejected', data: null, decided_at: new Date().toISOString() });
}

/* --------------------------------------------------------------- batches */
const running = new Map();                    // batchId -> { stop: bool }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const RETRY_DELAYS = { ms: [1500, 5000] };

/** Sections that can be generated now: active, no library image, no legacy image (unless asked), no pending candidate, no active job. */
export function eligibleSections({ scope = 'missing', slugs = null } = {}) {
  const by = rows();
  const base = q.all(`SELECT d.slug, d.sort, d.image, d.image_asset_id FROM departments d WHERE d.active=1 ORDER BY d.sort, d.id`);
  const busy = new Set([...q.all("SELECT department_slug s FROM image_candidates WHERE status='pending'"), ...q.all("SELECT department_slug s FROM image_gen_jobs WHERE status IN ('queued','running')")].map((r) => r.s));
  return base.filter((d) => {
    if (slugs && !slugs.includes(d.slug)) return false;
    if (busy.has(d.slug)) return false;
    if (d.image_asset_id) return false;                                   // already has a library image: never regenerate silently
    if (d.image && scope !== 'missing_or_legacy' && !slugs) return false; // a legacy picture is kept unless the admin chose to replace those
    if (scope === 'main' && by.get(d.slug)?.parent_slug) return false;
    return true;
  }).map((d) => d.slug);
}

export function createBatch({ scope = 'missing', size = 12, slugs = null, by = null } = {}) {
  const st = generationStatus();
  if (!st.configured) throw new AppError(503, 'generation_not_configured', 'No image-generation provider is configured. Upload images instead.');
  const n = Math.max(1, Math.min(30, Number(size) || 12));
  const room = Math.max(0, st.daily_limit - st.used_today);
  const pick = eligibleSections({ scope, slugs }).slice(0, Math.min(n, room));
  if (!pick.length) throw new AppError(409, 'nothing_to_generate', room ? 'No section needs an image right now.' : 'Daily generation limit reached.');
  return tx(() => {
    const id = insert('image_gen_batches', { scope, size: pick.length, created_by: by ? String(by).slice(0, 80) : null });
    for (const slug of pick) insert('image_gen_jobs', { batch_id: id, department_slug: slug, prompt: defaultPrompt(slug) });
    return id;
  });
}

async function runJob(job, by) {
  update('image_gen_jobs', job.id, { status: 'running', attempts: job.attempts + 1 });
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS.ms.length; attempt++) {
    try {
      const c = await makeCandidate(job.department_slug, { prompt: job.prompt, by });
      update('image_gen_jobs', job.id, { status: 'done', candidate_id: c.id, error: null, finished_at: new Date().toISOString() });
      return { ok: true };
    } catch (e) {
      lastErr = e;
      if (e.code === 'candidate_pending') { update('image_gen_jobs', job.id, { status: 'cancelled', error: 'already has a candidate', finished_at: new Date().toISOString() }); return { ok: true }; }
      if (e.limited || e.code === 'daily_limit') break;                        // never hammer a provider that said stop
      if (!(e.retryable) || attempt === RETRY_DELAYS.ms.length) break;
      await sleep(RETRY_DELAYS.ms[attempt]);
    }
  }
  update('image_gen_jobs', job.id, { status: 'failed', error: String(lastErr?.message || lastErr).slice(0, 300), finished_at: new Date().toISOString() });
  return { ok: false, stop: !!(lastErr?.limited || lastErr?.code === 'daily_limit') };
}

/** Runs queued jobs of one batch, 2 at a time. Fire-and-forget; progress is read from the DB. Only an admin action starts it. */
export function startBatch(batchId, { by = null, concurrency = 2 } = {}) {
  if (running.has(batchId)) return false;
  const ctl = { stop: false }; running.set(batchId, ctl);
  q.run("UPDATE image_gen_batches SET status='running' WHERE id=? AND status IN ('paused','running')", [batchId]);
  q.run("UPDATE image_gen_jobs SET status='queued' WHERE batch_id=? AND status='running'", [batchId]);   // a job interrupted by a restart is retried
  (async () => {
    try {
      let halt = false;
      const worker = async () => {
        while (!ctl.stop && !halt) {
          const job = tx(() => { const j = q.get("SELECT * FROM image_gen_jobs WHERE batch_id=? AND status='queued' ORDER BY id LIMIT 1", [batchId]); if (j) update('image_gen_jobs', j.id, { status: 'running' }); return j; });
          if (!job) return;
          const r = await runJob(job, by);
          if (r.stop) halt = true;
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      const left = q.val("SELECT COUNT(*) FROM image_gen_jobs WHERE batch_id=? AND status='queued'", [batchId]);
      q.run("UPDATE image_gen_batches SET status=?, finished_at=CASE WHEN ?=0 THEN datetime('now') END WHERE id=? AND status='running'", [left ? 'paused' : 'done', left, batchId]);
    } finally { running.delete(batchId); }
  })().catch(() => {});
  return true;
}
export function pauseBatch(batchId) { const c = running.get(batchId); if (c) c.stop = true; q.run("UPDATE image_gen_batches SET status='paused' WHERE id=? AND status='running'", [batchId]); }
export function cancelBatch(batchId) {
  const c = running.get(batchId); if (c) c.stop = true;
  q.run("UPDATE image_gen_jobs SET status='cancelled', finished_at=datetime('now') WHERE batch_id=? AND status='queued'", [batchId]);
  q.run("UPDATE image_gen_batches SET status='cancelled', finished_at=datetime('now') WHERE id=? AND status IN ('running','paused')", [batchId]);
}
export function retryFailed(batchId) { q.run("UPDATE image_gen_jobs SET status='queued', error=NULL WHERE batch_id=? AND status='failed'", [batchId]); q.run("UPDATE image_gen_batches SET status='paused', finished_at=NULL WHERE id=?", [batchId]); }
export const isRunning = (batchId) => running.has(batchId);

export function batchStatus(batchId) {
  const b = q.get('SELECT * FROM image_gen_batches WHERE id=?', [batchId]);
  if (!b) throw new AppError(404, 'not_found', 'Batch not found.');
  const counts = Object.fromEntries(['queued', 'running', 'done', 'failed', 'cancelled'].map((s) => [s, q.val('SELECT COUNT(*) FROM image_gen_jobs WHERE batch_id=? AND status=?', [batchId, s])]));
  return { ...b, active: running.has(batchId), counts, total: Object.values(counts).reduce((a, x) => a + x, 0),
    failed: q.all("SELECT department_slug AS slug, error, attempts FROM image_gen_jobs WHERE batch_id=? AND status='failed' ORDER BY id", [batchId]) };
}
export const listBatches = () => q.all('SELECT id, scope, size, status, created_at FROM image_gen_batches ORDER BY id DESC LIMIT 10').map((b) => batchStatus(b.id));
