import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

test('marketplace checkout creates one order per store and rolls all stores back on stock errors', async () => {
  const dbFile = path.join(os.tmpdir(), `souqna-market-cart-${randomUUID()}.db`);
  process.env.DB_FILE = dbFile;
  process.env.JWT_SECRET = `market-cart-test-${randomUUID()}`;
  const { default: routes } = await import('../src/routes/public.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { db, insert, q } = await import('../src/db/index.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', routes);
  app.use(errorHandler);
  const server = createServer(app);

  try {
    const userId = insert('users', { name: 'Marketplace Test', email: `${randomUUID()}@example.test`, password_hash: 'test' });
    const storeA = insert('stores', { owner_id: userId, slug: `test-a-${randomUUID()}`, code: 'TSTA', name_ar: 'محل أ', name_en: 'Store A', shipping_fee: 100, free_shipping_over: 300 });
    const storeB = insert('stores', { owner_id: userId, slug: `test-b-${randomUUID()}`, code: 'TSTB', name_ar: 'محل ب', name_en: 'Store B', shipping_fee: 50, free_shipping_over: 1500 });
    const productA = insert('products', { store_id: storeA, slug: 'item-a', name_ar: 'منتج أ', name_en: 'Item A', price: 400, stock: 3 });
    const productB = insert('products', { store_id: storeB, slug: 'item-b', name_ar: 'منتج ب', name_en: 'Item B', price: 500, stock: 2 });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/marketplace/orders`;
    const body = {
      name: 'Test Customer', phone: '01012345678', governorate: 'Qalyubia', city: 'Banha', address: 'Test street, building 1', notes: '',
      stores: [
        { slug: q.get('SELECT slug FROM stores WHERE id=?', [storeA]).slug, items: [{ productId: productA, qty: 1 }] },
        { slug: q.get('SELECT slug FROM stores WHERE id=?', [storeB]).slug, items: [{ productId: productB, qty: 1 }] },
      ],
    };
    const first = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(first.status, 201);
    const { orders } = await first.json();
    assert.equal(orders.length, 2);
    assert.equal(new Set(orders.map((o) => o.deliveryGroup)).size, 1);
    assert.deepEqual(orders.map((o) => o.total).sort((a, b) => a - b), [400, 525]);
    assert.equal(orders.reduce((sum, order) => sum + order.shipping, 0), 25);
    assert.equal(orders.find((o) => o.storeSlug === body.stores[0].slug).shipping, 0);
    assert.equal(orders.find((o) => o.storeSlug === body.stores[1].slug).shipping, 25);
    assert.equal(q.val("SELECT COUNT(*) FROM orders WHERE delivery_by='platform'"), 2);
    assert.equal(q.val('SELECT COUNT(*) FROM orders'), 2);
    assert.equal(q.get('SELECT stock FROM products WHERE id=?', [productA]).stock, 2);
    assert.equal(q.get('SELECT stock FROM products WHERE id=?', [productB]).stock, 1);

    const beforeA = q.get('SELECT stock FROM products WHERE id=?', [productA]).stock;
    const failed = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      ...body,
      stores: [body.stores[0], { ...body.stores[1], items: [{ productId: productB, qty: 2 }] }],
    }) });
    assert.equal(failed.status, 409);
    assert.equal(q.val('SELECT COUNT(*) FROM orders'), 2);
    assert.equal(q.get('SELECT stock FROM products WHERE id=?', [productA]).stock, beforeA);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});
