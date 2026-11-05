import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-soldout-${randomUUID()}.db`);
process.env.JWT_SECRET = `soldout-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'soldout-admin-key-0123456789';

test('sold-out products stay listed but always sort after available ones (all sort modes)', async () => {
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert } = await import('../src/db/index.js');
  const uid = insert('users', { name: 'O', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const sid = insert('stores', { owner_id: uid, slug: `so-${randomUUID().slice(0, 6)}`, code: 'SO1', name_ar: 'محل', name_en: 'Shop', shipping_fee: 50, free_shipping_over: 100000 });
  const cat = insert('categories', { store_id: sid, slug: 'c', name_ar: 'قسم', name_en: 'Cat' });
  const mk = (n, price, stock, sold, track = 1) => insert('products', { store_id: sid, slug: `p-${n}`, name_ar: `قميص ${n}`, name_en: `Shirt ${n}`, price, stock, track_stock: track, sold_count: sold, category_id: cat });
  const best = mk('best', 100, 0, 999);      // best seller, but sold out
  const cheap = mk('cheap', 50, 0, 500);     // sold out
  const a = mk('a', 300, 5, 1);
  const b = mk('b', 200, 5, 2);
  const untracked = mk('u', 400, 0, 0, 0);   // stock not tracked => always available
  const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const get = async (qs) => (await (await fetch(`http://127.0.0.1:${server.address().port}/api/search?${qs}`)).json()).items.map((p) => p.id);
    const soldOut = new Set([best, cheap]);
    for (const sort of ['relevance', 'best', 'price_asc', 'price_desc', 'newest']) {
      const ids = await get(`q=${encodeURIComponent('قميص')}&sort=${sort}`);
      assert.equal(ids.length, 5, sort);
      const firstOut = ids.findIndex((i) => soldOut.has(i));
      assert.ok(ids.slice(firstOut).every((i) => soldOut.has(i)), `${sort}: sold-out must be last, got ${ids}`);
      assert.ok(ids.includes(untracked) && !soldOut.has(untracked));
    }
    assert.deepEqual((await get(`q=${encodeURIComponent('قميص')}&in_stock=1`)).sort(), [a, b, untracked].sort()); // the filter still hides them on request
  } finally { server.close(); }
});
