import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-cart-${randomUUID()}.db`);
process.env.JWT_SECRET = `cart-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'cart-admin-key-0123456789';

test('abandoned cart: validation, one reminder, quiet hours, ordered since, empty cart cancels', async () => {
  const { default: buyerRoutes } = await import('../src/routes/buyer.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signBuyer } = await import('../src/lib/buyers.js');
  const { q, insert } = await import('../src/db/index.js');
  const { sweepAbandoned } = await import('../src/lib/abandoned.js');
  const bid = insert('buyers', { name: 'Test', phone: '01000000001', password_hash: 'x' });
  const token = signBuyer({ id: bid });
  const app = express(); app.use(express.json()); app.use('/api/buyer', buyerRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/buyer`;
  const call = (method, body, tok = token) => fetch(`${base}/cart-snapshot`, { method, headers: { 'content-type': 'application/json', ...(tok ? { 'x-buyer-token': tok } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const day = { hm: '12:00', date: '2026-11-05' };
  const notes = () => q.val("SELECT COUNT(*) FROM buyer_notifications WHERE buyer_id=? AND kind='cart'", [bid]);
  try {
    assert.equal((await call('PUT', { lines: [] }, null)).status, 401);
    const lines = [{ productId: 1, qty: 2, price: 150, name: { ar: '<b>قميص</b>', en: 'Shirt' } }, { productId: 2, qty: 1, price: 100, name: 'Jeans' }, { productId: 'x', qty: 1, price: 5 }, { productId: 3, qty: 99, price: 5 }];
    assert.equal((await call('PUT', { lines })).body.saved, true);
    const snap = q.get('SELECT * FROM cart_snapshots WHERE buyer_id=?', [bid]);
    assert.equal(snap.n, 3); assert.equal(snap.subtotal, 400); assert.deepEqual(JSON.parse(snap.names), ['قميص', 'Jeans']); // junk lines dropped, tags stripped
    const t0 = snap.updated_ms;
    assert.equal(sweepAbandoned(day, t0 + 3600e3), 0); // too early (1 h)
    assert.equal(sweepAbandoned({ hm: '23:00', date: day.date }, t0 + 3 * 3600e3), 0); // quiet hours
    assert.equal(sweepAbandoned(day, t0 + 60 * 3600e3), 0); // too old (stale cart)
    assert.equal(sweepAbandoned(day, t0 + 3 * 3600e3), 1);
    assert.equal(notes(), 1);
    assert.equal(sweepAbandoned(day, t0 + 4 * 3600e3), 0); // only one reminder per cart
    await call('PUT', { lines });                           // same cart again does not re-arm it
    assert.equal(sweepAbandoned(day, t0 + 5 * 3600e3), 0);
    await call('PUT', { lines: [{ productId: 1, qty: 1, price: 150, name: 'Shirt' }] }); // a changed cart re-arms
    const t1 = q.get('SELECT updated_ms FROM cart_snapshots WHERE buyer_id=?', [bid]).updated_ms;
    const uid = insert('users', { name: 'O', email: `${randomUUID()}@e.test`, password_hash: 'x' });
    const sid = insert('stores', { owner_id: uid, slug: `c-${randomUUID().slice(0, 6)}`, code: 'C1', name_ar: 'م', name_en: 'S', shipping_fee: 0, free_shipping_over: 1 });
    insert('orders', { store_id: sid, buyer_id: bid, number: 'T1', customer_name: 'T', phone: '01000000001', address: 'x', status: 'pending', subtotal: 150, total: 150, track_token: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    assert.equal(sweepAbandoned(day, t1 + 3 * 3600e3), 0); // ordered since -> no reminder
    assert.equal(notes(), 1);
    await call('PUT', { lines: [{ productId: 1, qty: 1, price: 150, name: 'Shirt' }, { productId: 2, qty: 1, price: 1, name: 'x' }] });
    assert.equal((await call('PUT', { lines: [] })).body.saved, false); // empty cart removes the snapshot
    assert.equal(q.val('SELECT COUNT(*) FROM cart_snapshots WHERE buyer_id=?', [bid]), 0);
  } finally { server.close(); }
});
