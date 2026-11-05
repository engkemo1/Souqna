import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-again-${randomUUID()}.db`);
process.env.JWT_SECRET = `again-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'again-admin-key-0123456789';

test('buy again: delivered purchases that are still buyable, newest first, own orders only', async () => {
  const { default: buyerRoutes } = await import('../src/routes/buyer.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signBuyer } = await import('../src/lib/buyers.js');
  const { insert } = await import('../src/db/index.js');
  const me = insert('buyers', { name: 'Me', phone: '01011111111', password_hash: 'x' });
  const other = insert('buyers', { name: 'Other', phone: '01022222222', password_hash: 'x' });
  const uid = insert('users', { name: 'O', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const sid = insert('stores', { owner_id: uid, slug: `ba-${randomUUID().slice(0, 6)}`, code: 'BA1', name_ar: 'محل', name_en: 'Shop', shipping_fee: 0, free_shipping_over: 1 });
  const prod = (n, over = {}) => insert('products', { store_id: sid, slug: `p-${n}`, name_ar: `منتج ${n}`, name_en: `P${n}`, price: 100, stock: 5, ...over });
  const order = (buyerId, phone, status, ...products) => {
    const oid = insert('orders', { store_id: sid, buyer_id: buyerId, number: `N${randomUUID().slice(0, 6)}`, customer_name: 'T', phone, address: 'x', status, subtotal: 100, total: 100, track_token: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    for (const p of products) insert('order_items', { order_id: oid, product_id: p, name_ar: 'x', name_en: 'x', price: 100, qty: 1 });
  };
  const a = prod('a'); const b = prod('b'); const soldOut = prod('c', { stock: 0 }); const draft = prod('d', { status: 'draft' }); const notYet = prod('e'); const theirs = prod('f'); const guest = prod('g');
  order(me, '01011111111', 'delivered', a);
  order(me, '01011111111', 'delivered', b, soldOut, draft, a); // a again: only once
  order(me, '01011111111', 'pending', notYet);                 // not delivered yet
  order(other, '01022222222', 'delivered', theirs);
  order(null, '01011111111', 'delivered', guest);              // guest order placed with the same phone
  const app = express(); app.use(express.json()); app.use('/api/buyer', buyerRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const get = (tok) => fetch(`http://127.0.0.1:${server.address().port}/api/buyer/buy-again`, { headers: tok ? { 'x-buyer-token': tok } : {} }).then(async (r) => ({ status: r.status, body: await r.json() }));
    assert.equal((await get(null)).status, 401);
    const r = await get(signBuyer({ id: me }));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items.map((p) => p.id), [guest, b, a]); // newest purchase first, sold-out/draft/undelivered/other people's excluded
    assert.equal(r.body.items[0].store.slug.startsWith('ba-'), true);
  } finally { server.close(); }
});
