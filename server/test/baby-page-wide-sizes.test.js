// «رضع» is for babies: a product that also comes in sizes for children of 3+ stays in the kids shelf (and its age chips), not on the baby page.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-babywide-${randomUUID()}.db`);
process.env.JWT_SECRET = `bw-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
const { default: publicRoutes } = await import('../src/routes/public.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');
const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
test.after(() => new Promise((r) => server.close(r)));
const get = async (u) => (await fetch(`http://127.0.0.1:${server.address().port}/api${u}`)).json();

const ownerId = insert('users', { name: 'O', email: 'o@bw.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'bw-store', code: 'BW1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
for (const [slug, ar] of [['kids_baby', 'رضع'], ['kids_newborn', 'حديثي الولادة'], ['kids_sets', 'أطقم أطفال']]) if (!q.get('SELECT 1 FROM departments WHERE slug=?', [slug])) insert('departments', { slug, name_ar: ar, name_en: slug, parent_slug: 'kids', active: 1 });
const ids = {};
const add = (key, ar, dept, sizes) => { const id = insert('products', { store_id: storeId, slug: `bw-${key}`, name_en: key, name_ar: ar, price: 300, status: 'active', track_stock: 1, stock: 9, department: dept }); for (const size of sizes) insert('variants', { product_id: id, size, color: '#112233', stock: 5, sku: `W-${randomUUID().slice(0, 6)}` }); ids[key] = id; };
add('romper', 'سلوبيت', 'kids_sets', ['6-12M', '1Y', '2Y']);
add('wideSuit', 'سوت بناتي', 'kids_girls', ['2Y', '3Y', '4Y', '6Y']);
add('wideHoodie', 'هودي اولادي', 'kids_boys', ['2Y', '3Y', '4Y', '5Y']);
add('romperFree', 'سلوبيت قطيفه', 'c24_custom', ['Free size']);
add('womenRomper', 'سلوبيت حريمي', 'women', ['M']);
add('tenY', 'جاكيت اولادي', 'kids_boys', ['10Y']);
const idsOf = (r) => new Set(r.items.map((i) => i.id));

test('baby page: a real baby product is in, kids-wide size runs are out', async () => {
  const baby = idsOf(await get('/search?department=kids_baby'));
  assert.ok(baby.has(ids.romper)); assert.ok(!baby.has(ids.wideSuit)); assert.ok(!baby.has(ids.wideHoodie)); assert.ok(!baby.has(ids.tenY));
});
test('the kids shelf and the 2-4 age chip still find the wide products', async () => {
  const kids = idsOf(await get('/search?department=kids'));
  assert.ok(kids.has(ids.wideSuit) && kids.has(ids.wideHoodie) && kids.has(ids.romper));
  const chip = idsOf(await get('/search?department=kids&sizes=' + encodeURIComponent('2-4 سنين')));
  assert.ok(chip.has(ids.wideSuit) && chip.has(ids.wideHoodie));
});

test('a «سلوبيت» filed under a custom section is on the baby page; an adult one is not', async () => {
  const baby = idsOf(await get('/search?department=kids_baby'));
  assert.ok(baby.has(ids.romperFree)); assert.ok(!baby.has(ids.womenRomper));
});
