// Golden Outfit Set admin API: generate a balanced sample from a real DB, blind review, verdict rules, second reviewer, evaluation, export, visual-tag corrections.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const ADMIN_KEY = 'test-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-lookreview-${randomUUID()}.db`);
process.env.JWT_SECRET = `lr-${randomUUID()}-min32charslong-xxxxxxxx`;
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = 'test';
const { default: publicRoutes } = await import('../src/routes/public.js');
const { default: adminRoutes } = await import('../src/routes/admin.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');

const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/api/admin`;
test.after(() => new Promise((r) => server.close(r)));
const call = async (method, url, body) => { const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* csv */ } return { status: res.status, json, text }; };

const ownerId = insert('users', { name: 'O', email: 'o@lr.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'lr-store', code: 'LR1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
let n = 0;
const HEX = { white: '#FFFFFF', black: '#1C1C1E', navy: '#1F2A44', beige: '#D9C7A8' };
const add = (en, ar, key, size, color = 'black') => { n += 1; const id = insert('products', { store_id: storeId, slug: `lr-${n}`, name_en: en, name_ar: ar, description_en: 'Plain solid colour, no print.', price: 600, status: 'active', track_stock: 1, stock: 30, department: 'men', audience: 'men', moda_key: key, colors_json: JSON.stringify([{ hex: HEX[color], name_ar: color, name_en: color }]), sizes_json: JSON.stringify([size]) }); insert('variants', { product_id: id, color: HEX[color], size, sku: `LR${n}`, stock: 5 }); return id; };
for (let i = 0; i < 3; i += 1) { add(`Classic White Cotton T-Shirt ${i}`, 'تيشيرت قطن أبيض', 'tshirt', 'M', 'white'); add(`Slim Fit Navy Jeans ${i}`, 'جينز كحلي سليم', 'jeans', '32', 'navy'); add(`Minimal White Sneakers ${i}`, 'كوتشي أبيض مينيمال', 'sneakers', '42', 'white'); add(`Navy Bomber Jacket ${i}`, 'جاكيت بومبر كحلي', 'jacket', 'M', 'navy'); }

test('generate builds frozen looks; next is blind; verdict needs a reason for rejections', async () => {
  const g = await call('POST', '/look-review/generate', { count: 6 });
  assert.equal(g.status, 200, g.text); const made = Object.values(g.json.created).reduce((a, b) => a + b, 0);
  const total = q.val('SELECT COUNT(*) FROM look_reviews'); assert.equal(total, made); assert.ok(total >= 1, JSON.stringify(g.json));
  const nx = await call('GET', '/look-review/next?reviewer=ali'); assert.equal(nx.status, 200); assert.ok(nx.json.item.pieces.length >= 3);
  assert.equal(JSON.stringify(nx.json.item).includes('system'), false, 'reviewer must not see the system verdict');
  assert.equal(JSON.stringify(nx.json.item).includes('score'), false);
  const id = nx.json.item.id;
  assert.equal((await call('POST', `/look-review/${id}/verdict`, { verdict: 'reject', reviewer: 'ali' })).status, 422);
  assert.equal((await call('POST', `/look-review/${id}/verdict`, { verdict: 'reject', reasons: ['color', 'bogus'], reviewer: 'ali' })).status, 422);
  const ok = await call('POST', `/look-review/${id}/verdict`, { verdict: 'reject', reasons: ['color', 'occasion'], reviewer: 'ali' }); assert.equal(ok.status, 200);
  assert.equal((await call('POST', `/look-review/${id}/verdict`, { verdict: 'accept', reviewer: 'ali' })).status, 409, 'cannot judge twice');
  const s = (await call('GET', '/look-review/stats')).json; assert.equal(s.judged, 1); assert.equal(s.byReason.color, 1);
});
test('evaluate reports bad-pass / missed-good against the human verdicts; export has both CSV and JSON', async () => {
  for (const row of q.all('SELECT id FROM look_reviews WHERE verdict IS NULL')) await call('POST', `/look-review/${row.id}/verdict`, { verdict: 'accept', reviewer: 'sara' });
  const ev = (await call('GET', '/look-review/evaluate')).json;
  assert.ok(ev.total >= 1); assert.equal(typeof ev.badPassRate, 'number'); assert.equal(ev.enough, false); assert.ok(ev.rulesVersion);
  const csv = await call('GET', '/look-review/export'); assert.match(csv.text, /system_score_at_creation/);
  const js = await call('GET', '/look-review/export?format=json'); assert.ok(js.json.items.length >= 1); assert.ok(js.json.items[0].snapshot.pieces.length >= 3);
});
test('visual tags: list unknown, admin correction overrides and is reported as admin', async () => {
  const id = add('Cotton Henley', 'هنلي', 'tshirt', 'M');
  const bare = q.run("UPDATE products SET description_en='' WHERE id=?", [id]); void bare;
  const list = (await call('GET', '/visual-tags?filter=unknown&limit=200')).json;
  assert.ok(list.items.some((x) => x.id === id), 'no print info = unknown'); assert.ok(list.summary.unknown >= 1);
  assert.equal((await call('PUT', `/visual-tags/${id}`, { pattern: 'nonsense' })).status, 422);
  assert.equal((await call('PUT', `/visual-tags/${id}`, { pattern: 'plain', visualLoudness: 'low', updatedBy: 'ali' })).status, 200);
  const after = (await call('GET', '/visual-tags?filter=admin&limit=200')).json; const row = after.items.find((x) => x.id === id);
  assert.ok(row); assert.equal(row.source, 'admin'); assert.equal(row.reliable, true); assert.equal(row.tags.pattern, 'plain');
  assert.equal((await call('DELETE', `/visual-tags/${id}`)).status, 200);
  assert.ok((await call('GET', '/visual-tags?filter=unknown&limit=200')).json.items.some((x) => x.id === id));
});
