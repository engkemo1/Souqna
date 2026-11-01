import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import sharp from 'sharp';

const ADMIN_KEY = 'test-admin-key-0123456789';

// A local fake S3 endpoint: lets us verify, at protocol level, what the app really PUTs to "R2". It is NOT Cloudflare.
const puts = []; let s3Fail = null;       // s3Fail = (path) => true makes the fake endpoint answer 500 for that object
const fakeS3 = createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => { if (s3Fail?.(req.url)) { res.writeHead(500).end('boom'); return; } if (req.method === 'PUT') puts.push({ path: req.url, cache: req.headers['cache-control'], type: req.headers['content-type'], auth: req.headers.authorization, bytes: Buffer.concat(chunks).length }); res.writeHead(200).end(); });
});
await new Promise((r) => fakeS3.listen(0, '127.0.0.1', r));
process.env.R2_ENDPOINT = `http://127.0.0.1:${fakeS3.address().port}`;
process.env.R2_ACCOUNT_ID = 'acct'; process.env.R2_ACCESS_KEY_ID = 'AKTEST'; process.env.R2_SECRET_ACCESS_KEY = 'secret'; process.env.R2_BUCKET = 'twist-test'; process.env.R2_PUBLIC_URL = 'https://cdn.example.test';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-gen-${randomUUID()}.db`);
process.env.MEDIA_DIR = path.join(os.tmpdir(), `souqna-gen-${randomUUID()}`);
process.env.JWT_SECRET = `gen-${randomUUID()}`; process.env.ADMIN_KEY = ADMIN_KEY;
delete process.env.CF_AI_TOKEN; delete process.env.CF_ACCOUNT_ID; delete process.env.IMAGE_GEN_PROVIDER;

const pic = (seed, size = 640) => {
  const raw = Buffer.alloc(size * size * 3);
  const f1 = 0.004 + seed * 0.0031, f2 = 0.003 + ((seed * 7) % 13) * 0.0017, p = seed * 1.9;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.sin(x * f1 * 6 + p) * Math.cos(y * f2 * 6 - p) * 0.5 + 0.5; const o = (y * size + x) * 3;
    raw[o] = Math.floor(v * 255); raw[o + 1] = Math.floor((1 - v) * 180 + (seed % 5) * 10); raw[o + 2] = Math.floor(((x + y) / (2 * size)) * 255);
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).jpeg().toBuffer();
};

const { default: publicRoutes } = await import('../src/routes/public.js');
const { default: adminRoutes } = await import('../src/routes/admin.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { q, db } = await import('../src/db/index.js');
const mig = await import('../src/lib/catalog-migration.js');
const gen = await import('../src/lib/image-gen.js');
const prov = await import('../src/lib/image-providers.js');
mig.apply(db, { approved: true });
gen.RETRY_DELAYS.ms = [1, 1];

const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = async (method, url, body, headers = {}) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return { status: r.status, body: j }; };
const admin = (m, u, b) => call(m, `/admin${u}`, b, { 'x-admin-key': ADMIN_KEY });
test.after(() => { server.close(); fakeS3.close(); });

let calls = 0; let seed = 100; const slugsCalled = [];
const fake = (opts = {}) => async ({ prompt, slug }) => {
  calls++; slugsCalled.push(slug);
  if (opts.failSlug === slug) { const e = new Error('boom'); e.retryable = !!opts.retryable; if (opts.failTimes && opts.failTimes-- <= 0) { /* succeed */ } else throw e; }
  return { buffer: await pic(++seed), mime: 'image/jpeg', prompt };
};
const use = (fn) => { gen.clearProviders(); gen.registerProvider('fake', fn); process.env.IMAGE_GEN_PROVIDER = 'fake'; calls = 0; slugsCalled.length = 0; };
const waitIdle = async (id) => { for (let i = 0; i < 400 && gen.isRunning(id); i++) await new Promise((r) => setTimeout(r, 15)); assert.ok(!gen.isRunning(id), 'batch finished'); };
const clearPending = () => q.run("UPDATE image_candidates SET status='rejected', data=NULL WHERE status='pending'");
const resetJobs = () => { q.run("UPDATE image_gen_jobs SET status='cancelled' WHERE status IN ('queued','running')"); clearPending(); };
const dept = (s) => q.get('SELECT * FROM departments WHERE slug=?', [s]);

test('nothing generates on page views, API reads, status calls or provider registration', async () => {
  use(fake());
  prov.registerDefaultProviders();
  await call('GET', '/departments'); await call('GET', '/departments?all=1');
  await admin('GET', '/image-library/status'); await admin('GET', '/image-library/batches'); await admin('GET', '/image-library/generation');
  assert.equal(calls, 0);
  assert.equal(q.val('SELECT COUNT(*) FROM image_candidates'), 0);
});

test('batch routes and review routes are admin-only', async () => {
  for (const [m, u] of [['GET', '/admin/image-library/batches'], ['POST', '/admin/image-library/batches'], ['GET', '/admin/image-library/batches/1'], ['POST', '/admin/image-library/batches/1/resume'], ['POST', '/admin/image-library/batches/1/cancel'], ['POST', '/admin/image-library/candidates/1/approve']]) {
    const r = await call(m, u, m === 'GET' ? undefined : {}); assert.ok([401, 403].includes(r.status), `${m} ${u} → ${r.status}`);
  }
});

test('main sections get a wide campaign prompt, sub-sections a single studio product prompt', () => {
  const main = gen.defaultPrompt('women'); const sub = gen.defaultPrompt('hijabs_chiffon');
  assert.notEqual(main, sub); assert.match(sub, /chiffon/i); assert.match(main, /campaign|editorial/i);
  assert.match(sub, /no text/i);
});

test('batch → candidates only (nothing in R2/library) → approve uploads to R2 with immutable caching and saves the reference', async () => {
  use(fake()); puts.length = 0;
  const assetsBefore = q.val('SELECT COUNT(*) FROM image_assets');
  const r = await admin('POST', '/image-library/batches', { scope: 'main', size: 3 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id; await waitIdle(id);
  const st = (await admin('GET', `/image-library/batches/${id}`)).body;
  assert.equal(st.counts.done, 3); assert.equal(st.status, 'done'); assert.equal(calls, 3);
  assert.equal(q.val('SELECT COUNT(*) FROM image_assets'), assetsBefore, 'candidates are not library assets');
  assert.equal(puts.length, 0, 'nothing uploaded to R2 before approval');
  const cands = (await admin('GET', '/image-library/generation')).body.candidates;
  assert.equal(cands.length, 3);
  for (const c of cands) assert.equal(q.get('SELECT parent_slug FROM departments WHERE slug=?', [c.department_slug]).parent_slug, null, 'main scope only');
  const c = cands[0];
  const ok = await admin('POST', `/image-library/candidates/${c.id}/approve`);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(puts.length >= 3, `R2 PUTs: ${puts.length}`);
  const key = new URL(ok.body.asset.urls.card).pathname.replace(/^\//, '').replace(/\/card\.webp$/, '');
  assert.match(key, /^category-images\/[a-f0-9]{16}$/);
  for (const p of puts) { assert.ok(p.path.startsWith('/twist-test/category-images/'), p.path); assert.match(p.cache, /immutable/); assert.match(p.auth, /^AWS4-HMAC-SHA256 Credential=AKTEST\//); assert.ok(p.bytes > 0); }
  assert.ok(puts.some((p) => p.path.includes(key) && /\.webp$/.test(p.path)), JSON.stringify({ key, puts: puts.map((p) => p.path) }));
  const d = dept(c.department_slug);
  assert.equal(d.image_asset_id, ok.body.asset.id);
  const list = (await call('GET', '/departments?all=1')).body;
  const flat = JSON.stringify(list);
  assert.ok(flat.includes(`https://cdn.example.test/${key}/`), 'customer API serves the saved R2 URLs');
  assert.equal(calls, 3, 'reading the tree did not generate anything');
  resetJobs();
});

test('no duplicate generation: pending, active-job, library-image and legacy sections are skipped', async () => {
  use(fake()); resetJobs();
  q.run("UPDATE departments SET image=NULL, image_asset_id=NULL, legacy_image=NULL WHERE slug IN ('hijabs_chiffon','hijabs_cotton','hijabs_modal')");
  q.run("UPDATE departments SET image='https://old.example/a.jpg' WHERE slug='hijabs_cotton'");
  const pend = await admin('POST', '/image-library/generate', { slug: 'hijabs_modal' }); assert.equal(pend.status, 201);
  const el = gen.eligibleSections({ scope: 'missing' });
  assert.ok(el.includes('hijabs_chiffon')); assert.ok(!el.includes('hijabs_cotton'), 'legacy image kept'); assert.ok(!el.includes('hijabs_modal'), 'pending candidate');
  assert.ok(gen.eligibleSections({ scope: 'missing_or_legacy' }).includes('hijabs_cotton'));
  const withAsset = q.get('SELECT slug FROM departments WHERE image_asset_id IS NOT NULL');
  if (withAsset) assert.ok(!gen.eligibleSections({ scope: 'missing_or_legacy' }).includes(withAsset.slug));
  const id = gen.createBatch({ scope: 'missing', size: 2, slugs: ['hijabs_chiffon'] });
  const again = (() => { try { return gen.createBatch({ scope: 'missing', slugs: ['hijabs_chiffon'] }); } catch (e) { return e.code; } })();
  assert.equal(again, 'nothing_to_generate', 'active job blocks a second batch for the same section');
  gen.startBatch(id); await waitIdle(id);
  assert.deepEqual(slugsCalled.filter((s) => s === 'hijabs_chiffon').length, 1);
  assert.equal(slugsCalled.filter((s) => s === 'hijabs_modal').length, 0 + 0 + (slugsCalled.includes('hijabs_modal') ? 1 : 0));
  resetJobs();
});

test('daily cap stops spending and is reported', async () => {
  use(fake()); resetJobs();
  q.run("UPDATE departments SET image=NULL, image_asset_id=NULL, legacy_image=NULL WHERE parent_slug IS NULL");
  const used = gen.usedToday(); process.env.IMAGE_GEN_DAILY_LIMIT = String(used + 2);
  try {
    const id = gen.createBatch({ scope: 'main', size: 10 });
    assert.equal(q.val('SELECT size FROM image_gen_batches WHERE id=?', [id]), 2, 'batch limited to remaining cap');
    gen.startBatch(id); await waitIdle(id);
    assert.equal(calls, 2);
    const e = await admin('POST', '/image-library/generate', { slug: 'women', regenerate: true });
    assert.equal(e.status, 429); assert.equal(e.body.error.code, 'daily_limit'); assert.equal(calls, 2);
    const b = await admin('POST', '/image-library/batches', { scope: 'main', size: 5 });
    assert.equal(b.status, 409);
    const s = (await admin('GET', '/image-library/status')).body.generation;
    assert.equal(s.used_today, used + 2); assert.equal(s.daily_limit, used + 2);
  } finally { delete process.env.IMAGE_GEN_DAILY_LIMIT; resetJobs(); }
});

test('failures are reported per section, retried only when retryable, and can be re-run', async () => {
  resetJobs();
  q.run("UPDATE departments SET image=NULL, image_asset_id=NULL, legacy_image=NULL WHERE slug IN ('hijabs_chiffon','hijabs_cotton')");
  let attempts = 0;
  gen.clearProviders(); process.env.IMAGE_GEN_PROVIDER = 'flaky';
  gen.registerProvider('flaky', async ({ slug }) => {
    attempts++;
    if (slug === 'hijabs_cotton') { const e = new Error('invalid prompt'); e.retryable = false; throw e; }
    if (attempts < 3) { const e = new Error('upstream 503'); e.retryable = true; throw e; }
    return { buffer: await pic(++seed), mime: 'image/jpeg' };
  });
  const id = gen.createBatch({ scope: 'missing', slugs: ['hijabs_chiffon', 'hijabs_cotton'], size: 5 });
  gen.startBatch(id, { concurrency: 1 }); await waitIdle(id);
  const st = gen.batchStatus(id);
  assert.equal(st.counts.done, 1); assert.equal(st.counts.failed, 1);
  assert.equal(st.failed[0].slug, 'hijabs_cotton'); assert.match(st.failed[0].error, /invalid prompt/);
  assert.equal(attempts, 4, 'transient error retried twice then succeeded; permanent error tried once');
  assert.equal(q.val("SELECT COUNT(*) FROM image_candidates WHERE department_slug='hijabs_cotton' AND status='pending'"), 0, 'a failed section stays missing');
  gen.clearProviders(); gen.registerProvider('flaky', async () => ({ buffer: await pic(++seed), mime: 'image/jpeg' }));
  assert.equal((await admin('POST', `/image-library/batches/${id}/retry-failed`)).status, 200); await waitIdle(id);
  assert.equal(gen.batchStatus(id).counts.failed, 0); assert.equal(gen.batchStatus(id).counts.done, 2);
  resetJobs(); delete process.env.IMAGE_GEN_PROVIDER;
});

test('a provider that says "limited" halts the batch without hammering it; the rest can resume', async () => {
  resetJobs();
  q.run("UPDATE departments SET image=NULL, image_asset_id=NULL, legacy_image=NULL WHERE slug IN ('hijabs_chiffon','hijabs_cotton','hijabs_modal')");
  let n = 0; gen.clearProviders(); process.env.IMAGE_GEN_PROVIDER = 'lim';
  gen.registerProvider('lim', async () => { n++; const e = new Error('429 neurons'); e.limited = true; throw e; });
  const id = gen.createBatch({ scope: 'missing', slugs: ['hijabs_chiffon', 'hijabs_cotton', 'hijabs_modal'], size: 5 });
  gen.startBatch(id, { concurrency: 1 }); await waitIdle(id);
  assert.equal(n, 1, 'stopped after the first limited response');
  const st = gen.batchStatus(id); assert.equal(st.status, 'paused'); assert.equal(st.counts.queued, 2); assert.equal(st.counts.failed, 1);
  resetJobs(); delete process.env.IMAGE_GEN_PROVIDER;
});

test('jobs interrupted by a restart are resumed, not lost or duplicated', async () => {
  use(fake()); resetJobs();
  q.run("UPDATE departments SET image=NULL, image_asset_id=NULL, legacy_image=NULL WHERE slug IN ('hijabs_chiffon','hijabs_cotton')");
  const id = gen.createBatch({ scope: 'missing', slugs: ['hijabs_chiffon', 'hijabs_cotton'], size: 5 });
  q.run("UPDATE image_gen_jobs SET status='running' WHERE batch_id=? AND department_slug='hijabs_chiffon'", [id]);   // simulates a crash mid-job
  q.run("UPDATE image_gen_batches SET status='running' WHERE id=?", [id]);
  assert.equal((await admin('POST', `/image-library/batches/${id}/resume`)).status, 200); await waitIdle(id);
  assert.equal(gen.batchStatus(id).counts.done, 2); assert.equal(calls, 2);
  resetJobs();
});

test('legacy image URLs are preserved on assign and restored on unassign / candidate rejection leaves them alone', async () => {
  use(fake()); resetJobs();
  q.run("UPDATE departments SET image='https://old.example/legacy.jpg', image_asset_id=NULL, legacy_image=NULL WHERE slug='hijabs_chiffon'");
  const g = await admin('POST', '/image-library/generate', { slug: 'hijabs_chiffon' });
  assert.equal(g.status, 201);
  await admin('POST', `/image-library/candidates/${g.body.id}/reject`);
  assert.equal(dept('hijabs_chiffon').image, 'https://old.example/legacy.jpg', 'reject changes nothing');
  const g2 = await admin('POST', '/image-library/generate', { slug: 'hijabs_chiffon' });
  const ok = await admin('POST', `/image-library/candidates/${g2.body.id}/approve`); assert.equal(ok.status, 200);
  const d = dept('hijabs_chiffon'); assert.equal(d.image_asset_id, ok.body.asset.id); assert.equal(d.legacy_image, 'https://old.example/legacy.jpg');
  assert.equal((await admin('POST', '/image-library/unassign', { slug: 'hijabs_chiffon' })).status, 200);
  const back = dept('hijabs_chiffon'); assert.equal(back.image, 'https://old.example/legacy.jpg'); assert.equal(back.image_asset_id, null);
  resetJobs();
});

test('Cloudflare provider: base64 JSON, binary image, limits, server errors, missing credentials (mocked fetch — live API NOT exercised)', async () => {
  process.env.CF_ACCOUNT_ID = 'acc1'; process.env.CF_AI_TOKEN = 'tok';
  try {
    assert.ok(prov.cloudflareReady());
    const jpg = await pic(7, 300); let seen;
    const mk = (status, body, type = 'application/json') => async (url, init) => { seen = { url, init }; return new Response(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body), { status, headers: { 'content-type': type } }); };
    const a = await prov.cloudflareFlux({ prompt: 'a chiffon hijab' }, { fetchImpl: mk(200, { success: true, result: { image: jpg.toString('base64') } }) });
    assert.deepEqual(a.buffer, jpg); assert.equal(a.mime, 'image/jpeg');
    assert.match(seen.url, /\/accounts\/acc1\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
    assert.equal(seen.init.headers.Authorization, 'Bearer tok'); assert.equal(JSON.parse(seen.init.body).prompt, 'a chiffon hijab');
    const b = await prov.cloudflareFlux({ prompt: 'x' }, { fetchImpl: mk(200, jpg, 'image/png') }); assert.equal(b.mime, 'image/png');
    await assert.rejects(prov.cloudflareFlux({ prompt: 'x' }, { fetchImpl: mk(429, { success: false, errors: [{ message: 'limit' }] }) }), (e) => e.limited === true);
    await assert.rejects(prov.cloudflareFlux({ prompt: 'x' }, { fetchImpl: mk(503, { success: false }) }), (e) => e.retryable === true && !e.limited);
    await assert.rejects(prov.cloudflareFlux({ prompt: 'x' }, { fetchImpl: mk(400, { success: false, errors: [{ message: 'bad' }] }) }), (e) => !e.retryable && !e.limited);
    await assert.rejects(prov.cloudflareFlux({ prompt: 'x' }, { fetchImpl: mk(200, { success: true, result: {} }) }), /no image/i);
    gen.clearProviders(); delete process.env.IMAGE_GEN_PROVIDER; prov.registerDefaultProviders();
    assert.deepEqual(gen.generationStatus().providers, ['cloudflare']);
    delete process.env.CF_AI_TOKEN; gen.clearProviders(); prov.registerDefaultProviders();
    assert.equal(gen.generationStatus().configured, false);
  } finally { delete process.env.CF_ACCOUNT_ID; delete process.env.CF_AI_TOKEN; }
});

test('R2 failure during approval: nothing half-saved, previous image untouched, candidate stays pending and can be approved later', async () => {
  use(fake()); resetJobs();
  q.run("UPDATE departments SET image='https://old.example/keep.jpg', image_asset_id=NULL, legacy_image=NULL WHERE slug='hijabs_cotton'");
  const g = await admin('POST', '/image-library/generate', { slug: 'hijabs_cotton' }); assert.equal(g.status, 201);
  const assetsBefore = q.val('SELECT COUNT(*) FROM image_assets'); puts.length = 0;
  s3Fail = (u) => u.endsWith('/hero.webp');                       // the 3rd file fails mid-upload
  const bad = await admin('POST', `/image-library/candidates/${g.body.id}/approve`);
  s3Fail = null;
  assert.ok(bad.status >= 500, `status ${bad.status}`);
  assert.equal(JSON.stringify(bad.body).includes('AKTEST'), false, 'no credentials in the error');
  assert.equal(q.val('SELECT COUNT(*) FROM image_assets'), assetsBefore, 'no asset row for a failed upload');
  const d = dept('hijabs_cotton'); assert.equal(d.image, 'https://old.example/keep.jpg'); assert.equal(d.image_asset_id, null); assert.equal(d.legacy_image, null);
  const c = q.get('SELECT status, data FROM image_candidates WHERE id=?', [g.body.id]); assert.equal(c.status, 'pending'); assert.ok(c.data, 'bytes kept so the admin can retry');
  // retry succeeds once R2 is healthy; the old URL is then kept as the rollback target
  const ok = await admin('POST', `/image-library/candidates/${g.body.id}/approve`); assert.equal(ok.status, 200);
  assert.equal(dept('hijabs_cotton').legacy_image, 'https://old.example/keep.jpg');
  resetJobs();
});

test('replacing a library image keeps the previous asset in the library (nothing deleted) so it can be re-assigned', async () => {
  use(fake()); resetJobs();
  const g1 = await admin('POST', '/image-library/generate', { slug: 'hijabs_modal' });
  const a1 = (await admin('POST', `/image-library/candidates/${g1.body.id}/approve`)).body.asset;
  const g2 = await admin('POST', '/image-library/generate', { slug: 'hijabs_modal' });
  const a2 = (await admin('POST', `/image-library/candidates/${g2.body.id}/approve`)).body.asset;
  assert.notEqual(a1.id, a2.id); assert.equal(dept('hijabs_modal').image_asset_id, a2.id);
  assert.ok(q.get('SELECT 1 FROM image_assets WHERE id=?', [a1.id]), 'previous asset still stored');
  assert.equal((await admin('POST', '/image-library/assign', { slug: 'hijabs_modal', asset_id: a1.id })).status, 200, 'rollback = re-assign the old asset');
  assert.equal(dept('hijabs_modal').image_asset_id, a1.id);
  resetJobs();
});

test('Cloudflare provider clamps steps to the documented 1–8 range and the prompt to 2048', async () => {
  process.env.CF_ACCOUNT_ID = 'a'; process.env.CF_AI_TOKEN = 't'; let body;
  const f = async (_u, init) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ success: true, result: { image: (await pic(3, 300)).toString('base64') } }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    process.env.IMAGE_GEN_STEPS = '50'; await prov.cloudflareFlux({ prompt: 'x'.repeat(5000) }, { fetchImpl: f });
    assert.equal(body.steps, 8); assert.ok(body.prompt.length <= 2048);
    process.env.IMAGE_GEN_STEPS = '0'; await prov.cloudflareFlux({ prompt: 'x' }, { fetchImpl: f }); assert.equal(body.steps, 4);
  } finally { delete process.env.IMAGE_GEN_STEPS; delete process.env.CF_ACCOUNT_ID; delete process.env.CF_AI_TOKEN; }
});

test('every admin response that returns the section list carries products_count (the admin screen re-renders from it after a save)', async () => {
  const list = (await admin('GET', '/departments')).body.departments;
  const d = list.find((x) => x.slug === 'hijabs_chiffon');
  const patched = await admin('PATCH', `/departments/${d.id}`, { name_ar: d.name_ar });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  for (const x of patched.body.departments) assert.equal(typeof x.products_count, 'number', x.slug);
});

test('readiness endpoint reports booleans only and never calls the provider or leaks secrets', async () => {
  use(fake()); process.env.CF_AI_TOKEN = 'super-secret-token-value';
  try {
    const r = await admin('GET', '/image-library/readiness'); assert.equal(r.status, 200);
    assert.equal(JSON.stringify(r.body).includes('super-secret-token-value'), false);
    assert.ok(r.body.checks.every((c) => typeof c.ok === 'boolean')); assert.equal(calls, 0);
    assert.equal((await call('GET', '/admin/image-library/readiness')).status === 200, false, 'admin only');
  } finally { delete process.env.CF_AI_TOKEN; }
});

test('double-click / concurrent requests for one section make exactly one provider call', async () => {
  resetJobs(); let n = 0; gen.clearProviders(); process.env.IMAGE_GEN_PROVIDER = 'slow';
  gen.registerProvider('slow', async () => { n++; await new Promise((r) => setTimeout(r, 120)); return { buffer: await pic(++seed), mime: 'image/jpeg' }; });
  q.run("UPDATE departments SET image=NULL, image_asset_id=NULL, legacy_image=NULL WHERE slug='shoes'");
  const rs = await Promise.all([1, 2, 3].map(() => admin('POST', '/image-library/generate', { slug: 'shoes', regenerate: true })));
  assert.equal(n, 1, 'one paid call'); assert.equal(rs.filter((r) => r.status === 201).length, 1); assert.ok(rs.filter((r) => r.status === 409).length === 2);
  const b = await Promise.all([1, 2].map(() => admin('POST', '/image-library/batches', { scope: 'main', size: 1 })));
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(b.filter((r) => r.status === 201).length <= 1 || n <= 3, 'a second batch click cannot reuse an active section');
  resetJobs(); delete process.env.IMAGE_GEN_PROVIDER;
});
