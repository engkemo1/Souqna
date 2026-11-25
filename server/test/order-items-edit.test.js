// The shop trims an order before it ships: lower a quantity or remove a line; stock and totals follow; locked once processing. Real DB, real checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const ADMIN_KEY = 'test-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-orderitems-${randomUUID()}.db`);
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

const ownerId = insert('users', { name: 'O', email: 'o@oi.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'oi-store', code: 'OI1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
const prodId = insert('products', { store_id: storeId, slug: 'oi-shirt', name_en: 'Shirt', name_ar: 'قميص', price: 500, status: 'active', track_stock: 1, stock: 20 });
let n = 0;
const place = async (qty = 2) => { n += 1; const r = await call('POST', '/stores/oi-store/orders', { name: 'أحمد', phone: '01012345678', governorate: 'القليوبية', city: 'بنها', address: 'شارع 1', items: [{ productId: prodId, qty }], idempotencyKey: `ao-${n}-${randomUUID()}` }, false); assert.equal(r.status, 201, r.text); return r.json.order; };
const stock = () => q.val('SELECT stock FROM products WHERE id=?', [prodId]);
const idOf = (num) => q.val('SELECT id FROM orders WHERE number=?', [num]);

const asStore = (method, url, b) => call(method, `/admin/stores/oi-store/as${url}`, b);
test('shop lowers a quantity: stock goes back, totals follow, history and buyer see it', async () => {
  const before = stock(); const o = await place(3); const id = idOf(o.number); assert.equal(stock(), before - 3);
  const line = q.get('SELECT * FROM order_items WHERE order_id=?', [id]);
  const r = await asStore('PATCH', `/orders/${id}/items`, { items: [{ id: line.id, qty: 1 }] });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.changed, true);
  assert.equal(stock(), before - 1);
  assert.equal(q.get('SELECT qty FROM order_items WHERE id=?', [line.id]).qty, 1);
  const ord = q.get('SELECT subtotal,total,discount,shipping FROM orders WHERE id=?', [id]);
  assert.equal(ord.subtotal, 500); assert.equal(ord.total, 500 - ord.discount + ord.shipping);
  assert.ok(q.all('SELECT note FROM order_events WHERE order_id=?', [id]).some((e) => /تعديل من المحل/.test(e.note || '')));
});
test('raising a quantity, an unknown line, emptying the order and a processed order are all refused', async () => {
  const o = await place(2); const id = idOf(o.number); const line = q.get('SELECT * FROM order_items WHERE order_id=?', [id]);
  assert.equal((await asStore('PATCH', `/orders/${id}/items`, { items: [{ id: line.id, qty: 5 }] })).status, 400, 'cannot raise');
  assert.equal((await asStore('PATCH', `/orders/${id}/items`, { items: [{ id: 999999, qty: 1 }] })).status, 400, 'unknown line');
  assert.equal((await asStore('PATCH', `/orders/${id}/items`, { items: [{ id: line.id, qty: 0 }] })).status, 400, 'removing everything = cancel');
  await asStore('PATCH', `/orders/${id}/status`, { status: 'confirmed' }); await asStore('PATCH', `/orders/${id}/status`, { status: 'processing' });
  assert.equal((await asStore('PATCH', `/orders/${id}/items`, { items: [{ id: line.id, qty: 1 }] })).status, 400, 'locked after processing');
  assert.equal(q.get('SELECT qty FROM order_items WHERE id=?', [line.id]).qty, 2);
});
