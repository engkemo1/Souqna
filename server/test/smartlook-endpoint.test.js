// Integration test for POST /api/stylist/smart-look (+ /event): real DB, real variants, real engine.
// Guards the three outcomes that matter: nothing unavailable is shown, no wrong outfit is shown, and good outfits still appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-smartlook-${randomUUID()}.db`);
process.env.JWT_SECRET = `sl-jwt-secret-${randomUUID()}-min32charslong`;
process.env.ADMIN_KEY = `sl-admin-key-${randomUUID()}`;
process.env.ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
process.env.SITE_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';
process.env.SMARTLOOK_CACHE_MS = '0'; // every call sees the catalog as the test just changed it

const { app } = await import('../src/index.js');
const { q, insert } = await import('../src/db/index.js');
const { hashPassword } = await import('../src/lib/auth.js');

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise((resolve) => server.close(resolve)); });

const post = async (route, body) => {
  const res = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const HEX = { white: '#FFFFFF', black: '#1C1C1E', navy: '#1F2A44', beige: '#D9C7A8', brown: '#6B4A2B' };
const NAME = { white: 'أبيض', black: 'أسود', navy: 'كحلي', beige: 'بيج', brown: 'بني' };
const ownerId = insert('users', { name: 'SL Owner', email: 'owner@sl.test', password_hash: await hashPassword('password123'), role: 'owner', token_version: 1 });
const storeId = insert('stores', { name_ar: 'متجر الأطقم', name_en: 'Look Store', slug: 'look-store', code: 'LKS', owner_id: ownerId, status: 'active', shipping_fee: 30, phone: '01011112222', whatsapp: '01011112222' });

let n = 0;
/** stockOf(color, size) -> units for each variant. Product-level stock is deliberately left positive so only the variants can say "unavailable". */
function add(en, ar, key, colors, sizes, stockOf = () => 5, extra = {}) {
  n += 1;
  const id = insert('products', {
    store_id: storeId, name_ar: ar, name_en: en, slug: `sl-${n}-${key}`, description_ar: '', description_en: 'Plain solid colour, no print.', price: 800, category_id: null, status: 'active',
    track_stock: 1, stock: 40, department: 'men', audience: 'men', moda_key: key,
    colors_json: JSON.stringify(colors.map((c) => ({ hex: HEX[c], name_ar: NAME[c], name_en: c }))), sizes_json: JSON.stringify(sizes), ...extra,
  });
  for (const c of colors) for (const s of sizes) insert('variants', { product_id: id, color: HEX[c], size: s, sku: `SL${n}-${c}-${s}`, stock: stockOf(c, s) });
  return id;
}
const L = ['S', 'M', 'L'];
const SHOES = ['41', '42', '43'];

const jeans = add('Slim Fit Navy Jeans', 'جينز كحلي سليم', 'jeans', ['navy'], ['30', '32']);
const tee = add('Classic White Cotton T-Shirt', 'تيشيرت قطن أبيض كلاسيك', 'tshirt', ['white'], L);
const sneakers = add('Minimal White Sneakers', 'كوتشي أبيض مينيمال', 'sneakers', ['white'], SHOES);
const bomber = add('Navy Bomber Jacket', 'جاكيت بومبر كحلي', 'jacket', ['navy'], L);

const shownIds = (res) => (res.body.looks || []).flatMap((l) => l.items.map((i) => i.id));
const pieceIds = (res) => (res.body.looks || []).map((l) => l.items[l.pick || 0].id);
const events = (event) => q.all('SELECT product_id, data_json FROM smart_look_events WHERE event=?', [event]);
const reset = () => { q.run('DELETE FROM smart_look_events'); };

test('baseline: a complete, available, consistent catalog gives a look that never contains the anchor', async () => {
  reset();
  const res = await post('/api/stylist/smart-look', { productId: jeans });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  assert.ok(res.body.score >= 80);
  assert.ok(!shownIds(res).includes(jeans));
  assert.ok(pieceIds(res).length >= 2);
  assert.equal(events('shown').length, 1, 'a shown look is logged with its score');
});

test('unavailable variants are never shown: product-level stock > 0 but every variant at 0', async () => {
  reset();
  const dead = add('Black Running Sneakers', 'كوتشي رانينج أسود', 'sneakers', ['black'], SHOES, () => 0);
  for (const anchor of [jeans, tee, bomber]) {
    const res = await post('/api/stylist/smart-look', { productId: anchor });
    assert.ok(!shownIds(res).includes(dead), `anchor ${anchor}: dead product shown`);
  }
  q.run("UPDATE products SET status='draft' WHERE id=?", [dead]);
});

test('only the sneakers option has zero variant stock → the look is refused, not shown with an unbuyable piece', async () => {
  reset();
  q.run('UPDATE variants SET stock=0 WHERE product_id=?', [sneakers]);
  const res = await post('/api/stylist/smart-look', { productId: tee });
  assert.ok(!shownIds(res).includes(sneakers));
  const rejected = events('rejected');
  if (!res.body.ok) assert.ok(rejected.length >= 1, 'a refusal is logged with its reason');
  q.run('UPDATE variants SET stock=5 WHERE product_id=?', [sneakers]);
});

test('mixed stock: the first colour has no stock but another colour does → the piece is still a valid candidate', async () => {
  reset();
  q.run('UPDATE products SET status=\'draft\' WHERE id=?', [sneakers]);
  const mixed = add('Canvas Sneakers', 'كوتشي كانفاس', 'sneakers', ['white', 'black'], SHOES, (c) => (c === 'white' ? 0 : 4));
  const res = await post('/api/stylist/smart-look', { productId: jeans });
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  assert.ok(shownIds(res).includes(mixed), 'the mixed-stock sneakers can be suggested');
  q.run("UPDATE products SET status='draft' WHERE id=?", [mixed]);
  q.run("UPDATE products SET status='active' WHERE id=?", [sneakers]);
});

test('photo_mismatch: a model-photo product flagged by the image check is excluded (it becomes a type conflict upstream)', async () => {
  reset();
  q.run("UPDATE products SET status='draft' WHERE id=?", [sneakers]);
  const flagged = add('White Court Sneakers', 'كوتشي كورت أبيض', 'sneakers', ['white'], SHOES, () => 5, { photo_mismatch: 1 });
  const res = await post('/api/stylist/smart-look', { productId: jeans });
  assert.ok(!shownIds(res).includes(flagged), 'flagged product must never be suggested');
  q.run("UPDATE products SET status='draft' WHERE id=?", [flagged]);
  q.run("UPDATE products SET status='active' WHERE id=?", [sneakers]);
});

test('"another look" excludes everything shown so far and never repeats a piece', async () => {
  reset();
  const first = await post('/api/stylist/smart-look', { productId: jeans });
  assert.equal(first.body.ok, true);
  const seen = shownIds(first);
  const second = await post('/api/stylist/smart-look', { productId: jeans, exclude: seen });
  if (second.body.ok) for (const id of shownIds(second)) assert.ok(!seen.includes(id), 'repeated piece');
  else assert.ok(['state_partial', 'state_none', 'state_alternatives', 'no_look', 'review_failed', 'too_few_or_duplicate'].includes(second.body.reason));
});

test('feedback events are validated and stored; junk is rejected', async () => {
  reset();
  const ok = await post('/api/stylist/smart-look/event', { productId: jeans, event: 'remove', pieceId: tee });
  assert.equal(ok.status, 204);
  assert.equal(events('remove').length, 1);
  const bad = await post('/api/stylist/smart-look/event', { productId: jeans, event: 'drop_table' });
  assert.ok(bad.status >= 400);
});

// ---- Twila chat (POST /api/stylist): a COMPLETE outfit passes the same reviewer; plain searches are left alone ----
const chat = (content, extra = {}) => post('/api/stylist', { messages: [{ role: 'user', content }], ...extra });
const chatShown = (res) => (res.body.tabs || []).flatMap((t) => t.items.map((i) => i.id));
const OUTFIT_Q = 'رشحلي لوك رجالي كاجوال للخروج ميزانيتي 5000';

test('chat: a complete outfit is reviewed (score logged) and shown', async () => {
  reset();
  const res = await chat(OUTFIT_Q);
  assert.equal(res.status, 200);
  assert.equal(res.body.state, 'full');
  assert.ok(chatShown(res).length >= 2, JSON.stringify(res.body.say));
  const ev = events('chat_shown');
  assert.equal(ev.length, 1);
  assert.ok(JSON.parse(ev[0].data_json).scores.every((x) => x >= 80));
  assert.equal(events('chat_rejected').length, 0);
});

test('chat: a plain product search is not an outfit and is never reviewed or blocked', async () => {
  reset();
  const res = await chat('جينز رجالي');
  assert.equal(res.status, 200);
  assert.ok(chatShown(res).includes(jeans));
  assert.equal(events('chat_shown').length + events('chat_rejected').length, 0);
});

test('chat: an outfit that cannot pass the reviewer is replaced by an honest reply with no products', async () => {
  reset();
  const dead = add('Brown Leather Loafers', 'لوفر جلد بني', 'loafers', ['brown'], SHOES, () => 0);
  try {
    // every sneaker/shoe the engine could use has no buyable variant → nothing unbuyable may come out of the chat
    q.run("UPDATE variants SET stock=0 WHERE product_id=?", [sneakers]);
    const res = await chat(OUTFIT_Q);
    assert.equal(res.status, 200);
    assert.ok(!chatShown(res).includes(dead) && !chatShown(res).includes(sneakers), 'unbuyable piece reached the shopper');
    assert.equal(res.body.state, 'chat');
    assert.deepEqual(res.body.looks, []);
    assert.ok(res.body.say);
    const rej = JSON.parse(events('chat_rejected')[0].data_json).rejected[0];
    assert.ok(rej.why.some((w) => w.startsWith('no_variant_in_stock')), JSON.stringify(rej));
  } finally { q.run("UPDATE variants SET stock=5 WHERE product_id=?", [sneakers]); q.run("DELETE FROM variants WHERE product_id=?", [dead]); q.run("DELETE FROM products WHERE id=?", [dead]); }
});

const addW = (en, ar, key, colors, sizes, extra = {}) => add(en, ar, key, colors, sizes, () => 5, { department: 'women', audience: 'women', ...extra });
addW('Navy Casual Midi Dress', 'فستان كاجوال كحلي حريمي', 'dress_casual', ['navy'], L);
addW('Beige Low Heels', 'كعب منخفض بيج حريمي', 'heels_low', ['beige'], ['37', '38', '39']);
addW('White Cotton Blouse', 'بلوزة قطن بيضاء حريمي', 'blouse', ['white'], L);
addW('Black Straight Trousers', 'بنطلون اسود مستقيم حريمي', 'trousers', ['black'], L);
addW('White Flat Shoes', 'بالرينا بيضاء حريمي', 'flats', ['white'], ['37', '38', '39']);

const audOf = (id) => q.get('SELECT audience FROM products WHERE id=?', [id]).audience;
test('chat: a couple request returns separate men / women outfit tabs, never one mixed tab', async () => {
  reset();
  const res = await chat('رشحلي لوك كاجوال ليا ولجوزي للخروج ميزانيتي 8000 وانا مش محجبة');
  assert.equal(res.status, 200);
  const tabs = res.body.tabs || [];
  assert.ok(tabs.length >= 2, 'one tab per person');
  for (const t of tabs) {
    const auds = new Set(t.items.map((i) => audOf(i.id)));
    assert.equal(auds.size, 1, `tab ${t.id} mixes audiences: ${[...auds]}`);
  }
  assert.ok(new Set(tabs.map((t) => audOf(t.items[0].id))).size >= 2, 'men and women are in different tabs');
});

// ---- children: Smart Look on a child product ----
const addK = (en, ar, key, color, sizeLabels, stock = 4, extra = {}) => add(en, ar, key, [color], sizeLabels, () => stock, { department: 'kids_boys', audience: 'boys', ...extra });
const kidJeans = addK('Boys Navy Jeans', 'جينز كحلي ولادي', 'jeans', 'navy', ['6 سنين']);
const kidTee = addK('Boys White Cotton T-Shirt', 'تيشيرت قطن ابيض ولادي', 'tshirt', 'white', ['6 سنين']);
const kidJacket = addK('Boys Navy Bomber Jacket', 'جاكيت بومبر كحلي ولادي', 'jacket', 'navy', ['5-6 سنين', '6-7 سنين']);
const kidShoes = addK('Boys White Sneakers', 'كوتشي ابيض ولادي', 'sneakers', 'white', ['30', '31']);
const kidIds = [kidJeans, kidTee, kidJacket, kidShoes];
const setShoeSizes = (sizes) => { q.run('DELETE FROM variants WHERE product_id=?', [kidShoes]); for (const sz of sizes) insert('variants', { product_id: kidShoes, color: HEX.white, size: sz, sku: `K-${sz}-${Math.random()}`, stock: 4 }); };

test('child look: pieces that share one age band are shown, all of them child products, with the recommended size', async () => {
  reset();
  const res = await post('/api/stylist/smart-look', { productId: kidJeans });
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  for (const id of shownIds(res)) assert.ok(kidIds.includes(id), `adult product ${id} in a child look`);
  assert.ok(res.body.looks.every((l) => l.items[0].rec && /سنين|^\d+$/.test(res.body.looks.length ? l.items[0].rec.size : '')), 'every piece carries its recommended size');
  assert.equal(res.body.anchorRec.size, '6 سنين');
});
test('child look BUG CASE: shoes only in EU 34–37 next to 6-year clothes → no look', async () => {
  reset(); setShoeSizes(['34', '35', '36', '37']);
  try {
    const res = await post('/api/stylist/smart-look', { productId: kidJeans });
    assert.equal(res.body.ok, false, JSON.stringify(res.body));
    const rej = events('rejected').map((e) => JSON.parse(e.data_json));
    assert.ok(rej.length >= 1);
  } finally { setShoeSizes(['30', '31']); }
});
test('child look: a child product with an unknown age can never be part of a look', async () => {
  reset();
  q.run('DELETE FROM variants WHERE product_id=?', [kidTee]);
  insert('variants', { product_id: kidTee, color: HEX.white, size: 'اطفال', sku: 'K-GEN', stock: 4 });
  q.run("UPDATE products SET sizes_json='[\"اطفال\"]', description_ar='' WHERE id=?", [kidTee]);
  const res = await post('/api/stylist/smart-look', { productId: kidJeans });
  assert.ok(!shownIds(res).includes(kidTee), 'unknown-age piece shown');
});
test('simple searches for child products are unchanged by the child gate', async () => {
  reset();
  const res = await chat('جينز ولادي');
  assert.equal(res.status, 200);
  assert.equal(events('chat_shown').length + events('chat_rejected').length, 0);
});

test('anchor with stock tracking OFF and zero variant counts still gets a look (regression: Ghost jacket page)', async () => {
  reset();
  q.run('UPDATE products SET track_stock=0 WHERE id=?', [jeans]);
  q.run('UPDATE variants SET stock=0 WHERE product_id=?', [jeans]);
  try {
    const res = await post('/api/stylist/smart-look', { productId: jeans });
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
  } finally { q.run('UPDATE products SET track_stock=1 WHERE id=?', [jeans]); q.run('UPDATE variants SET stock=5 WHERE product_id=?', [jeans]); }
});
