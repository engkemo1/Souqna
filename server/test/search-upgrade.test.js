import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

test('marketplace search: size/colour filters + facets, relevance, suggestions, department inference', async () => {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-search-${randomUUID()}.db`);
  process.env.JWT_SECRET = `search-test-${randomUUID()}`;
  const { default: routes } = await import('../src/routes/public.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert } = await import('../src/db/index.js');
  const { inferDepartment } = await import('../src/lib/departments.js');

  assert.equal(inferDepartment('كوتشي رياضي رجالي', ['men', 'sports', 'shoes']), 'shoes');
  assert.equal(inferDepartment('Slim Jeans', ['women', 'denim']), 'denim');
  assert.equal(inferDepartment('Plain Tee', ['women', 'men']), null);
  assert.equal(inferDepartment('كوتشي', ['women', 'men']), null, 'never returns a department the store does not sell');

  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const get = async (p) => (await fetch(base + p)).json();

  try {
    const user = insert('users', { name: 'Search Test', email: `${randomUUID()}@example.test`, password_hash: 'x' });
    const store = insert('stores', { owner_id: user, slug: `srch-${randomUUID().slice(0, 8)}`, code: 'SRCH', name_ar: 'محل البحث', name_en: 'Search Store' });
    const mk = (name_ar, name_en, department, sizes, hex) => {
      const id = insert('products', { store_id: store, slug: `p-${randomUUID().slice(0, 8)}`, name_ar, name_en, price: 500, status: 'active', department, colors_json: JSON.stringify([{ hex, name_ar: 'لون', name_en: 'c' }]) });
      for (const size of sizes) insert('variants', { product_id: id, size, color: hex, stock: 5, sku: `S-${randomUUID().slice(0, 6)}` });
      return id;
    };
    mk('كوتشي جري', 'Running Shoe', 'shoes', ['40', '41'], '#112233');
    mk('جاكيت كوتش', 'Coach Jacket', 'men', ['M', 'L'], '#AA0000');
    mk('جاكيت جلد', 'Leather Jacket', 'men', ['L'], '#AA0000');

    // relevance: a shoe outranks a "coach" jacket when searching "كوتشي"
    const r = await get('/search?q=' + encodeURIComponent('كوتشي'));
    assert.equal(r.items[0].name.ar, 'كوتشي جري');
    // size filter + facets
    const m = await get('/search?sizes=M');
    assert.equal(m.total, 1);
    assert.ok(m.facets.sizes.some((s) => s.size === 'L' && s.n === 2), 'size facet ignores its own filter');
    assert.ok(m.facets.colors.some((c) => c.hex === '#AA0000'));
    // colour filter + junk values are ignored safely
    assert.equal((await get('/search?colors=%23112233')).total, 1);
    assert.equal((await get("/search?sizes=%27%20OR%201=1--")).total, 0);
    assert.equal((await get('/search?colors=zz')).total, 3);
    // sorts do not error
    for (const sort of ['best', 'discount', 'rating', 'price_asc', 'newest', 'bogus']) assert.equal((await get(`/search?sort=${sort}`)).total, 3);
    // category facet + filter (facet ignores its own filter) and new-arrivals window
    const cats = await get('/search?department=men');
    assert.ok(Array.isArray(cats.facets.categories));
    assert.equal((await get('/search?new=7')).total, 3);
    assert.equal((await get('/search?new=30')).total, 3);
    assert.equal((await get("/search?category=%27%20OR%201=1--")).total, 0);
    // suggestions
    const s = await get('/search/suggest?q=' + encodeURIComponent('جاك'));
    assert.equal(s.products.length, 2);
    assert.deepEqual(await get('/search/suggest?q=a'), { products: [], departments: [], stores: [] });
  } finally {
    await new Promise((r) => server.close(r));
  }
});
