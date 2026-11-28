// Select several products in the shop dashboard and discount / un-discount / hide them at once. Real DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const ADMIN_KEY = 'test-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-pbulk-${randomUUID()}.db`);
process.env.JWT_SECRET = `pb-${randomUUID()}-min32charslong-xxxxxxxx`;
process.env.ADMIN_KEY = ADMIN_KEY; process.env.NODE_ENV = 'test';
const { default: adminRoutes } = await import('../src/routes/admin.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');

const app = express(); app.use(express.json()); app.use('/api/admin', adminRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
const root = `http://127.0.0.1:${server.address().port}/api/admin`;
test.after(() => new Promise((r) => server.close(r)));
const call = async (method, url, body) => { const res = await fetch(root + url, { method, headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ } return { status: res.status, json, text }; };

const ownerId = insert('users', { name: 'O', email: 'o@pb.test', password_hash: 'x' });
const mkStore = (slug) => insert('stores', { owner_id: ownerId, slug, code: slug.slice(0, 4).toUpperCase(), name_ar: slug, name_en: slug, shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
const storeA = mkStore('pb-a'); const storeB = mkStore('pb-b');
let n = 0;
const mkProd = (storeId, price, extra = {}) => { n += 1; return insert('products', { store_id: storeId, slug: `pb-p${n}`, name_en: `P${n}`, name_ar: `م${n}`, price, status: 'active', track_stock: 1, stock: 5, ...extra }); };
const bulk = (body) => call('POST', '/stores/pb-a/as/products/bulk', body);
const row = (id) => q.get('SELECT price, compare_at_price AS cmp, sale_ends_at AS ends, status FROM products WHERE id=?', [id]);

test('a % discount keeps the original as the compare-at price, with an optional end date', async () => {
  const a = mkProd(storeA, 500), b = mkProd(storeA, 199);
  const ends = Date.now() + 3 * 86400e3;
  const r = await bulk({ ids: [a, b], action: 'discount', percent: 20, endsAt: ends });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.done, 2);
  assert.deepEqual(row(a), { price: 400, cmp: 500, ends, status: 'active' });
  assert.equal(row(b).price, 159); assert.equal(row(b).cmp, 199); // 199*0.8 = 159.2 → 159
});

test('applying it again re-discounts from the ORIGINAL price, never stacks', async () => {
  const a = mkProd(storeA, 1000);
  await bulk({ ids: [a], action: 'discount', percent: 10 });
  await bulk({ ids: [a], action: 'discount', percent: 30 });
  assert.deepEqual([row(a).price, row(a).cmp], [700, 1000]);
});

test('removing the discount restores the original price; products without one are skipped', async () => {
  const a = mkProd(storeA, 600), b = mkProd(storeA, 300);
  await bulk({ ids: [a], action: 'discount', percent: 50 });
  const r = await bulk({ ids: [a, b], action: 'clear_discount' });
  assert.equal(r.json.done, 1); assert.deepEqual(r.json.skipped, [{ id: b, reason: 'no_discount' }]);
  assert.deepEqual([row(a).price, row(a).cmp, row(a).ends], [600, null, null]);
});

test('hide / show several at once', async () => {
  const a = mkProd(storeA, 100), b = mkProd(storeA, 100);
  assert.equal((await bulk({ ids: [a, b], action: 'status', status: 'draft' })).json.done, 2);
  assert.equal(row(a).status, 'draft');
  await bulk({ ids: [a, b], action: 'status', status: 'active' });
  assert.equal(row(b).status, 'active');
});

test("another shop's products are never touched; bad input is refused", async () => {
  const mine = mkProd(storeA, 100), theirs = mkProd(storeB, 100);
  const r = await bulk({ ids: [mine, theirs], action: 'discount', percent: 50 });
  assert.equal(r.json.done, 1); assert.equal(row(theirs).price, 100); assert.equal(row(theirs).cmp, null);
  assert.equal((await bulk({ ids: [mine], action: 'discount' })).status, 400);
  assert.equal((await bulk({ ids: [mine], action: 'discount', percent: 95 })).status, 422);
  assert.equal((await bulk({ ids: [mine], action: 'discount', percent: 10, endsAt: Date.now() - 1000 })).status, 422);
  assert.equal((await bulk({ ids: [], action: 'status', status: 'draft' })).status, 422);
});
