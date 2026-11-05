import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-similar-${randomUUID()}.db`);
process.env.JWT_SECRET = `similar-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'similar-admin-key-0123456789';

test('similar: same sections as the viewed products, buyable only, never the viewed ones; weak stores listed', async () => {
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert } = await import('../src/db/index.js');
  const { growthReport } = await import('../src/lib/engage.js');
  const uid = insert('users', { name: 'O', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const mkStore = (n, over = {}) => insert('stores', { owner_id: uid, slug: `sm-${n}-${randomUUID().slice(0, 5)}`, code: `SM${n}`, name_ar: `محل ${n}`, name_en: `S${n}`, shipping_fee: 0, free_shipping_over: 1, ...over });
  const s1 = mkStore('1', { rating: 2.1, rating_count: 5 }); const s2 = mkStore('2', { rating: 4.8, rating_count: 20 }); mkStore('3', { rating: 1.0, rating_count: 2 });
  const prod = (store, n, over = {}) => insert('products', { store_id: store, slug: `p-${n}-${randomUUID().slice(0, 4)}`, name_ar: `م${n}`, name_en: `P${n}`, price: 100, stock: 5, department: 'men', ...over });
  const viewed = prod(s1, 'v'); const same = prod(s2, 's', { sold_count: 9 }); const sameLow = prod(s1, 'l', { sold_count: 1 });
  const other = prod(s1, 'o', { department: 'women' }); const out = prod(s1, 'x', { stock: 0 }); const draft = prod(s1, 'd', { status: 'draft' });
  const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const get = (qs) => fetch(`http://127.0.0.1:${server.address().port}/api/similar${qs}`).then((r) => r.json());
    assert.deepEqual((await get('')).items, []);
    assert.deepEqual((await get('?ids=abc,-1')).items, []);
    assert.deepEqual((await get(`?ids=${viewed}`)).items.map((p) => p.id), [same, sameLow]); // same section, best seller first

  } finally { server.close(); }
  const g = growthReport();
  assert.deepEqual(g.weakStores.map((s) => s.name), ['محل 1', 'محل 2']); // lowest first, stores with fewer than 3 ratings left out
});
