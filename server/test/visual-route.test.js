import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

// HTTP-level check of POST /api/visual-search (colour model; CLIP needs a model download so it is not used in unit tests)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-visual-route-'));
process.env.DB_FILE = path.join(dir, 'test.db');
delete process.env.VISUAL_MODEL;
const { default: express } = await import('express');
const { q, insert } = await import('../src/db/index.js');
const { default: publicRoutes } = await import('../src/routes/public.js');
const { errorHandler } = await import('../src/lib/errors.js');
const visual = await import('../src/lib/visual.js');
const { toBlob } = await import('../src/lib/visual-core.js');

const solid = (r, g, b) => sharp({ create: { width: 96, height: 128, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
const server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
const base = `http://127.0.0.1:${server.address().port}/api`;

async function post(buf, fields = {}) {
  const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'p.jpg');
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${base}/visual-search`, { method: 'POST', body: fd });
  return { status: res.status, body: await res.json() };
}

test('route returns an honest noMatch for an empty catalogue', async () => {
  const { status, body } = await post(await solid(12, 12, 14), { type: 'bottoms' });
  assert.equal(status, 200);
  assert.equal(body.noMatch, true);
  assert.deepEqual(body.items, []);
});

test('route returns grouped, serialised product cards for a close match and noMatch for a far one', async () => {
  insert('users', { email: 'o@test.dev', password_hash: 'x', name: 'Owner', role: 'owner' });
  insert('stores', { owner_id: q.get('SELECT id FROM users').id, slug: 'denim', code: 'D1', name_ar: 'دنيم هاوس', name_en: 'Denim House', status: 'active', hidden: 0 });
  insert('products', { store_id: q.get('SELECT id FROM stores').id, slug: 'black', name_ar: 'بنطلون أسود سليم', name_en: 'Slim black trousers', price: 829, status: 'active', track_stock: 0 });
  const pid = q.get('SELECT id FROM products').id;
  const e = await visual.embedImage(await solid(12, 12, 14), 'color-v1');
  q.run('INSERT INTO visual_vectors (product_id, model, slot, media_id, vec) VALUES (?,?,?,?,?)', [pid, e.model, 'm1', 1, toBlob(e.vec)]);
  visual.invalidateVisualCache();

  const hit = await post(await solid(12, 12, 14), { type: 'bottoms' });
  assert.equal(hit.status, 200);
  assert.equal(hit.body.noMatch, false);
  assert.equal(hit.body.groups[0].items[0].id, pid);
  assert.equal(hit.body.groups[0].items[0].store.slug, 'denim');
  assert.equal(hit.body.total, 1);

  const miss = await post(await solid(30, 200, 40), { type: 'bottoms' });
  assert.equal(miss.body.noMatch, true);
  assert.deepEqual(miss.body.items, []);
});

test('Share-target: a photo shared from another app is handed to /visual exactly once', async () => {
  const fd = new FormData(); fd.append('photo', new Blob([await solid(12, 12, 14)], { type: 'image/jpeg' }), 'shared.jpg');
  const res = await fetch(`${base}/share-target`, { method: 'POST', body: fd, redirect: 'manual' });
  assert.equal(res.status, 303);
  const loc = res.headers.get('location');
  assert.match(loc, /^\/visual\?shared=[\w-]{10,}$/);
  const token = loc.split('=')[1];
  const first = await fetch(`${base}/visual-search/shared/${token}`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/jpeg');
  assert.ok((await first.arrayBuffer()).byteLength > 100);
  assert.equal((await fetch(`${base}/visual-search/shared/${token}`)).status, 404, 'one-time pickup');
  // no file / not an image → still a clean redirect, never an error page
  const empty = await fetch(`${base}/share-target`, { method: 'POST', body: new FormData(), redirect: 'manual' });
  assert.equal(empty.status, 303); assert.equal(empty.headers.get('location'), '/visual');
  const bad = new FormData(); bad.append('photo', new Blob(['not an image'], { type: 'image/jpeg' }), 'x.jpg');
  assert.equal((await fetch(`${base}/share-target`, { method: 'POST', body: bad, redirect: 'manual' })).headers.get('location'), '/visual');
});

test('Sharing the results creates a visual look link that the share page can load', async () => {
  const pid = q.get('SELECT id FROM products').id;
  const res = await fetch(`${base}/look-share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'لقيت دول في محلات بنها', kind: 'visual', items: [{ id: pid, label: 'بناطيل وجينز' }, { id: 999999 }] }) });
  assert.equal(res.status, 201);
  const { token, url } = await res.json();
  assert.equal(url, `/look/${token}`);
  const look = await (await fetch(`${base}/look-share/${token}`)).json();
  assert.equal(look.kind, 'visual');
  assert.deepEqual(look.pieces.map((p) => [p.id, p.label]), [[pid, 'بناطيل وجينز']], 'unknown products are dropped');
});

test('type is optional now, and a bad type is a 422', async () => {
  const auto = await post(await solid(12, 12, 14));
  assert.equal(auto.status, 200);
  const bad = await post(await solid(12, 12, 14), { type: 'zzz' });
  assert.equal(bad.status, 422);
});

test.after(() => { server.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
