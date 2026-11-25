// Kids ages + messy size spellings: one filter per real size, ages by bucket, and «رضع» shows every baby product (not just the 3 filed under it).
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-kidsizes-${randomUUID()}.db`);
process.env.JWT_SECRET = `ks-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
const { default: publicRoutes } = await import('../src/routes/public.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');

const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
test.after(() => new Promise((r) => server.close(r)));
const get = async (u) => (await fetch(`http://127.0.0.1:${server.address().port}/api${u}`)).json();

const ownerId = insert('users', { name: 'O', email: 'o@ks.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'ks-store', code: 'KS1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
for (const [slug, ar] of [['kids_baby', 'رضع'], ['kids_newborn', 'حديثي الولادة'], ['kids_sets', 'أطقم أطفال'], ['c25_mw27b7e7', 'سوت اولادي'], ['men_pants', 'بناطيل'], ['men_shirts', 'قمصان']]) {
  if (!q.get('SELECT 1 FROM departments WHERE slug=?', [slug])) insert('departments', { slug, name_ar: ar, name_en: slug, parent_slug: slug.startsWith('men_') ? 'men' : 'kids', active: 1 });
}
const ids = {};
const add = (key, ar, dept, sizes) => { const id = insert('products', { store_id: storeId, slug: `ks-${key}`, name_en: key, name_ar: ar, price: 300, status: 'active', track_stock: 1, stock: 9, department: dept }); for (const size of sizes) insert('variants', { product_id: id, size, color: '#112233', stock: 5, sku: `K-${randomUUID().slice(0, 6)}` }); ids[key] = id; };
add('romper1', 'سلوبيت قطيفة', 'kids_sets', ['1Y']);                 // baby, filed under sets
add('romper2', 'أوفرول شيك', 'kids_boys', ['12-18 شهور', '18-24 شهور']);  // baby, months
add('newbornTiny', 'بدي مولود', 'kids_newborn', ['0-3M']);          // filed under newborn
add('named', 'طقم بيبي ولادي', 'kids_boys', ['M']);                 // baby by name only
add('ten1', 'جاكيت اولادي', 'kids_boys', ['10Y']);
add('ten2', 'هودي بناتي', 'kids_girls', ['10y']);
add('ten3', 'سوت اولادي', 'c25_mw27b7e7', ['١٠']);
add('teen', 'بنطلون اولادي', 'kids_boys', ['14Y']);
add('adult', 'بنطلون رجالي', 'men_pants', ['32', 'M']);
add('adult2', 'قميص رجالي', 'men_shirts', ['M', 'L']);
const got = (r) => r.items.map((i) => i.slug || i.id);
const idsOf = (r) => r.items.map((i) => i.id);

test('«رضع» shows products through age 2, even when they are filed in another kids section', async () => {
  const r = await get('/search?department=kids_baby');
  const found = new Set(idsOf(r));
  for (const k of ['romper1', 'romper2', 'newbornTiny', 'named']) assert.ok(found.has(ids[k]), `${k} missing from kids_baby`);
  for (const k of ['ten1', 'teen', 'adult']) assert.ok(!found.has(ids[k]), `${k} must not be in kids_baby`);
});
test('«حديثي الولادة» is limited to newborn evidence or sizes through 3 months', async () => {
  const found = new Set(idsOf(await get('/search?department=kids_newborn')));
  assert.ok(found.has(ids.newbornTiny), 'newborn product missing');
  for (const k of ['romper1', 'romper2', 'named', 'ten1', 'teen', 'adult']) assert.ok(!found.has(ids[k]), `${k} must not be in kids_newborn`);
});
test('size facet: 10Y / 10y / ١٠ are ONE filter and kids ages are buckets', async () => {
  const r = await get('/search?department=kids');
  const labels = r.facets.sizes.map((x) => x.size);
  assert.ok(!labels.some((l) => ['10', '10Y', '10y', '١٠'].includes(l)), labels.join('|'));
  const ten = r.facets.sizes.find((x) => x.size === '10-12 سنة'); assert.equal(ten.n, 3); assert.equal(ten.grp, 'age');
  assert.equal(r.facets.sizes.find((x) => x.size === 'سنة لسنتين').n, 2);
});
test('filtering by an age bucket finds every spelling; the old raw value still works', async () => {
  const ten = await get('/search?department=kids&sizes=' + encodeURIComponent('10-12 سنة'));
  assert.deepEqual(new Set(idsOf(ten)), new Set([ids.ten1, ids.ten2, ids.ten3]));
  const babies = await get('/search?sizes=' + encodeURIComponent('سنة لسنتين'));
  assert.deepEqual(new Set(idsOf(babies)), new Set([ids.romper1, ids.romper2]));
  const raw = await get('/search?sizes=10Y'); assert.ok([ids.ten1, ids.ten2, ids.ten3].every((i) => idsOf(raw).includes(i)));
});
test('adult sizes unaffected: M finds adult and kids letter sizes, 32 finds the adult pair', async () => {
  const m = new Set(idsOf(await get('/search?sizes=M'))); assert.ok(m.has(ids.adult) && m.has(ids.adult2) && m.has(ids.named));
  const t = new Set(idsOf(await get('/search?sizes=32'))); assert.deepEqual([...t], [ids.adult]);
});
