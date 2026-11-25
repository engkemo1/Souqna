// Admin control over all orders: status override (incl. cancel with stock back), bulk, edit details, returns, filters. Real DB, real checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const ADMIN_KEY = 'test-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-adminorders-${randomUUID()}.db`);
process.env.JWT_SECRET = `ao-${randomUUID()}-min32charslong-xxxxxxxx`;
process.env.ADMIN_KEY = ADMIN_KEY; process.env.NODE_ENV = 'test';
const { default: publicRoutes } = await import('../src/routes/public.js');
const { default: storeRoutes } = await import('../src/routes/stores.js').catch(() => ({ default: null }));
const { default: adminRoutes } = await import('../src/routes/admin.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');

const app = express(); app.use(express.json()); app.use('/api', publicRoutes); if (storeRoutes) app.use('/api', storeRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
const root = `http://127.0.0.1:${server.address().port}/api`;
test.after(() => new Promise((r) => server.close(r)));
const call = async (method, url, body, admin = true) => { const res = await fetch(root + url, { method, headers: { 'content-type': 'application/json', ...(admin ? { 'x-admin-key': ADMIN_KEY } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ } return { status: res.status, json, text }; };

const ownerId = insert('users', { name: 'O', email: 'o@ao.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'ao-store', code: 'AO1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
const prodId = insert('products', { store_id: storeId, slug: 'ao-shirt', name_en: 'Shirt', name_ar: 'قميص', price: 500, status: 'active', track_stock: 1, stock: 20 });
let n = 0;
const place = async (qty = 2) => { n += 1; const r = await call('POST', '/stores/ao-store/orders', { name: 'أحمد', phone: '01012345678', governorate: 'القليوبية', city: 'بنها', address: 'شارع 1', items: [{ productId: prodId, qty }], idempotencyKey: `ao-${n}-${randomUUID()}` }, false); assert.equal(r.status, 201, r.text); return r.json.order; };
const stock = () => q.val('SELECT stock FROM products WHERE id=?', [prodId]);
const idOf = (num) => q.val('SELECT id FROM orders WHERE number=?', [num]);

test('admin can move any order forward and back; every change is in the order log', async () => {
  const o = await place(); const id = idOf(o.number);
  for (const s of ['confirmed', 'processing', 'shipped']) assert.equal((await call('PATCH', `/admin/orders/${id}/admin-status`, { status: s, note: 'اختبار' })).status, 200);
  assert.equal((await call('PATCH', `/admin/orders/${id}/admin-status`, { status: 'confirmed' })).status, 200, 'override can go back');
  assert.equal((await call('PATCH', `/admin/orders/${id}/admin-status`, { status: 'confirmed' })).status, 409, 'same status refused');
  const d = (await call('GET', `/admin/orders/${id}`)).json; assert.ok(d.events.some((e) => /^@admin/.test(e.note || '')));
});
test('cancel returns stock once; a cancelled order is final', async () => {
  const before = stock(); const o = await place(3); assert.equal(stock(), before - 3);
  const id = idOf(o.number); assert.equal((await call('PATCH', `/admin/orders/${id}/admin-status`, { status: 'cancelled', note: 'العميل طلب' })).status, 200);
  assert.equal(stock(), before, 'stock back');
  assert.equal((await call('PATCH', `/admin/orders/${id}/admin-status`, { status: 'confirmed' })).json.error.code, 'order_cancelled');
  assert.equal(stock(), before, 'no double return');
});
test('a delivered order cannot be cancelled (use a return); return restocks and records the refund', async () => {
  const o = await place(2); const id = idOf(o.number); const before = stock();
  for (const s of ['confirmed', 'processing', 'shipped', 'delivered']) await call('PATCH', `/admin/orders/${id}/admin-status`, { status: s });
  assert.equal((await call('PATCH', `/admin/orders/${id}/admin-status`, { status: 'cancelled' })).json.error.code, 'use_returns');
  const item = (await call('GET', `/admin/orders/${id}`)).json.items[0];
  const dry = await call('POST', `/admin/orders/${id}/returns`, { items: [{ itemId: item.id, qty: 1 }], dryRun: true }); assert.equal(dry.status, 200); assert.ok(dry.json.refund > 0); assert.equal(stock(), before);
  const ret = await call('POST', `/admin/orders/${id}/returns`, { items: [{ itemId: item.id, qty: 1 }], reason: 'مقاس' }); assert.equal(ret.status, 201); assert.equal(stock(), before + 1);
  assert.equal((await call('POST', `/admin/orders/${id}/returns`, { items: [{ itemId: item.id, qty: 5 }] })).status, 422, 'cannot return more than bought');
  assert.equal((await call('GET', `/admin/orders/${id}`)).json.returns.length, 1);
});
test('bulk: each order succeeds or fails on its own', async () => {
  const a = idOf((await place()).number); const b = idOf((await place()).number);
  await call('PATCH', `/admin/orders/${b}/admin-status`, { status: 'cancelled' });
  const r = (await call('POST', '/admin/orders/bulk', { ids: [a, b], status: 'confirmed' })).json;
  assert.equal(r.done, 1); assert.deepEqual(r.ids, [a]); assert.equal(r.failed.length, 1); assert.equal(r.failed[0].code, 'order_cancelled');
});
test('edit details: validated, only changed fields logged; cancelled orders locked', async () => {
  const o = await place(); const id = idOf(o.number);
  assert.equal((await call('PATCH', `/admin/orders/${id}/details`, { phone: 'abc' })).status, 422);
  const r = (await call('PATCH', `/admin/orders/${id}/details`, { phone: '01099998888', address: 'عنوان جديد' })).json; assert.deepEqual(r.changed.sort(), ['address', 'phone']);
  assert.equal(q.val('SELECT phone FROM orders WHERE id=?', [id]), '01099998888');
  assert.deepEqual((await call('PATCH', `/admin/orders/${id}/details`, { phone: '01099998888' })).json.changed, []);
  await call('PATCH', `/admin/orders/${id}/admin-status`, { status: 'cancelled' });
  assert.equal((await call('PATCH', `/admin/orders/${id}/details`, { city: 'القاهرة' })).status, 409);
});
test('filters: date range and amount; needs the admin key', async () => {
  const all = (await call('GET', '/admin/orders')).json; assert.ok(all.total >= 4);
  const big = (await call('GET', '/admin/orders?min=100000')).json; assert.equal(big.total, 0);
  const today = new Date().toISOString().slice(0, 10); assert.ok((await call('GET', `/admin/orders?from=${today}&to=${today}`)).json.total >= 1);
  assert.equal((await call('GET', '/admin/orders', null, false)).status === 200, false);
});
test('block customer from an order: flagged, refused at checkout, can be unblocked', async () => {
  const o = await place(); const id = idOf(o.number);
  assert.equal((await call('GET', `/admin/orders/${id}`)).json.customerBlocked, false);
  assert.equal((await call('PUT', '/admin/customers/01012345678', { blocked: true, reason: 'اختبار' })).status, 200);
  assert.equal((await call('GET', `/admin/orders/${id}`)).json.customerBlocked, true);
  const r = await call('POST', '/stores/ao-store/orders', { name: 'أحمد', phone: '01012345678', governorate: 'القليوبية', city: 'بنها', address: 'شارع 1', items: [{ productId: prodId, qty: 1 }], idempotencyKey: `blk-${randomUUID()}` }, false);
  assert.equal(r.status, 403); assert.equal(r.json.error.code, 'customer_blocked');
  await call('PUT', '/admin/customers/01012345678', { blocked: false });
  assert.equal((await call('GET', `/admin/orders/${id}`)).json.customerBlocked, false);
});
