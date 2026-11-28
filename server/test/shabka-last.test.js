// «صنية شبكة» products always sit at the very END of search / section listings and the home rails — even when brand new.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-shabka-${randomUUID()}.db`);
process.env.JWT_SECRET = `sk-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
const { default: publicRoutes } = await import('../src/routes/public.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');

const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
test.after(() => new Promise((r) => server.close(r)));
const get = async (u) => (await fetch(`http://127.0.0.1:${server.address().port}/api${u}`)).json();

const ownerId = insert('users', { name: 'O', email: 'o@sk.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'sk-store', code: 'SK1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
const catId = insert('categories', { store_id: storeId, name_ar: 'صواني شبكة', slug: 'trays', name_en: 'trays', sort: 1 });
const add = (key, ar, extra = {}) => insert('products', { store_id: storeId, slug: `sk-${key}`, name_en: key, name_ar: ar, price: 300, status: 'active', track_stock: 0, stock: 9, sold_count: 0, featured: 0, ...extra });
// the tray is the NEWEST, the most sold and featured — and still must come last
add('tray', 'صنيه شبكه', { created_at: '2031-01-01 00:00:00', sold_count: 99, featured: 1 });
add('tray2', 'صينية شبكة فاخرة', { created_at: '2031-01-02 00:00:00', sold_count: 50 });
add('tray3', 'علبة هدايا', { created_at: '2031-01-03 00:00:00', category_id: catId }); // filed under «صواني شبكة»
add('a', 'فستان سهرة', { created_at: '2020-01-01 00:00:00', sold_count: 1 });
add('b', 'شبكة شعر', { created_at: '2020-01-02 00:00:00' }); // a hair net is NOT a shabka tray
add('c', 'صنيه تقديم', { created_at: '2020-01-03 00:00:00' }); // a serving tray is NOT a shabka tray
const SH = ['sk-tray', 'sk-tray2', 'sk-tray3'];
const slugs = (r) => r.items.map((i) => i.slug);
const endsWithTrays = (list) => { const n = list.length; assert.equal(new Set(list.slice(n - 3)).size, 3); for (const s of SH) assert.ok(list.slice(n - 3).includes(s), `${s} must be last: ${list}`); };

for (const sort of ['relevance', 'newest', 'best']) {
  test(`search sorted by ${sort}: shabka trays are last`, async () => { endsWithTrays(slugs(await get(`/search?sort=${sort}`))); });
}
test('hair net and serving tray are not pushed down', async () => {
  const l = slugs(await get('/search?sort=newest'));
  for (const s of ['sk-a', 'sk-b', 'sk-c']) assert.ok(l.indexOf(s) < l.indexOf('sk-tray'), s);
});
test('home rails: shabka trays do not appear at all (newest, deals, trending, dept rails)', async () => {
  const r = await get('/marketplace');
  const all = JSON.stringify(r);
  for (const sl of SH) assert.ok(!all.includes(`"${sl}"`), `${sl} must not be on the home page`);
  const l = r.newest.map((i) => i.slug);
  for (const s of ['sk-a', 'sk-b', 'sk-c']) assert.ok(l.includes(s), s);
});
