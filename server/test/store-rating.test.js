import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-rating-${randomUUID()}.db`);
  process.env.JWT_SECRET = `rating-${randomUUID()}`;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert, q } = await import('../src/db/index.js');
  const app = express(); app.use(express.json());
  app.use('/api', publicRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const get = async (u) => (await fetch(base + u)).json();
  const mk = (tag, stored) => {
    const userId = insert('users', { name: tag, email: `${randomUUID()}@example.test`, password_hash: 'x' });
    const storeId = insert('stores', { owner_id: userId, slug: `rt-${tag}-${randomUUID().slice(0, 6)}`, code: `RT${tag}${randomUUID().slice(0, 3)}`, name_ar: `محل ${tag}`, name_en: `Store ${tag}`, rating: stored.rating, rating_count: stored.count });
    const product = insert('products', { store_id: storeId, slug: `p-${randomUUID().slice(0, 5)}`, name_ar: 'منتج', name_en: 'Item', price: 100, stock: 5 });
    return { storeId, product, slug: q.get('SELECT slug FROM stores WHERE id=?', [storeId]).slug };
  };
  return { server, get, mk, insert, q };
}

test('store rating is hidden without real reviews, even when stored/seed values exist', async () => {
  const t = await setup();
  try {
    const seeded = t.mk('seed', { rating: 4.8, count: 412 }); // fake stored rating, no reviews
    const zero = t.mk('zero', { rating: 0, count: 0 });
    for (const s of [seeded, zero]) {
      const r = await t.get(`/stores/${s.slug}`);
      assert.equal(r.store.rating, null); assert.equal(r.store.ratingCount, 0);
    }
  } finally { t.server.close(); }
});

test('store rating shows the real average and count of published reviews only', async () => {
  const t = await setup();
  try {
    const s = t.mk('real', { rating: 5, count: 999 });
    const add = (rating, status = 'published') => t.insert('reviews', { store_id: s.storeId, product_id: s.product, name: 'x', rating, status });
    add(5); add(4); add(1, 'hidden');
    const r = await t.get(`/stores/${s.slug}`);
    assert.equal(r.store.rating, 4.5); assert.equal(r.store.ratingCount, 2);
    const list = await t.get('/marketplace');
    const row = (list.stores || []).find((x) => x.slug === s.slug);
    if (row) { assert.equal(row.rating, 4.5); assert.equal(row.ratingCount, 2); }
  } finally { t.server.close(); }
});
