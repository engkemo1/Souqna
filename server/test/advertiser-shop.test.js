import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import sharp from 'sharp';

const KEY = 'advshop-admin-key-0123456789';
process.env.MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-shop-'));
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-advshop-${randomUUID()}.db`);
process.env.JWT_SECRET = `advshop-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = KEY;
delete process.env.ADMIN_TOTP_SECRET;

let ctx = null;
test.after(() => ctx?.server.close());
async function setup() {
  if (ctx) return ctx;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const app = express(); app.use(express.json());
  app.use('/api', publicRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(url.startsWith('/admin') ? { 'x-admin-key': KEY } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  ctx = { server, call };
  return ctx;
}
const photo = async () => {
  const { saveAdImage } = await import('../src/lib/adImage.js');
  const png = await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
  return (await saveAdImage(png, 'fg')).image;
};
const adv = (gallery, over = {}) => ({ name_ar: 'ورشة النور', name_en: 'Al Nour', whatsapp: '01012345678', phone: '01012345678', address_ar: 'شارع سعد زغلول', consent: true, twist_orders: true, gallery, ...over });

test('shop-through-Twist: needs a sellable photo; creates a hidden platform-delivered shop with real products', async () => {
  const { call } = await setup();
  const { q } = await import('../src/db/index.js');
  const a = await photo(); const b = await photo();
  const none = await call('POST', '/admin/featured/advertisers', adv([{ src: a, name: '', price: '' }], { slug: 'shop-none' }));
  assert.equal(none.status, 422); assert.ok(none.body.error.fields.twist_orders);

  const r = await call('POST', '/admin/featured/advertisers', adv([{ src: a, name: 'جاكيت جلد', price: '1250' }, { src: b, name: '', price: '' }, { src: '/img/c.jpg', name: 'شنطة', price: '300' }], { slug: 'shop-a' }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const A = r.body.advertiser;
  assert.equal(A.twistOrders, true); assert.ok(A.shopSlug.startsWith('adv-shop-a'));
  const store = q.get('SELECT * FROM stores WHERE slug=?', [A.shopSlug]);
  assert.equal(store.hidden, 1); assert.equal(store.delivery_mode, 'platform'); assert.equal(store.status, 'active');
  const prods = q.all("SELECT * FROM products WHERE store_id=? ORDER BY id", [store.id]);
  assert.equal(prods.length, 2); // the photo without name/price is display-only
  assert.deepEqual(prods.map((p) => [p.name_ar, p.price, p.status, p.track_stock]), [['جاكيت جلد', 1250, 'active', 0], ['شنطة', 300, 'active', 0]]);
  assert.equal(q.val('SELECT COUNT(*) FROM product_media WHERE product_id=?', [prods[0].id]), 1); // our own stored photo became the product image
  assert.equal(q.val('SELECT COUNT(*) FROM product_media WHERE product_id=?', [prods[1].id]), 0); // an unknown URL is never fetched

  // the public page offers the basket for sellable photos only
  const pub = (await call('GET', '/advertiser/shop-a')).body.advertiser;
  assert.equal(pub.gallery[0].cart.productId, prods[0].id);
  assert.equal(pub.gallery[0].cart.storeSlug, A.shopSlug);
  assert.ok(pub.gallery[0].cart.image.base);
  assert.equal(pub.gallery[1].cart, null);

  // the existing quote engine prices the line from the database, as for any shop
  const { quote } = await import('../src/lib/cart.js');
  const qt = quote(store, [{ productId: prods[0].id, qty: 2 }]);
  assert.equal(qt.hasErrors, false); assert.equal(qt.subtotal, 2500);

  // the shadow shop stays out of every public listing / search
  const search = await call('GET', '/search?q=%D8%AC%D8%A7%D9%83%D9%8A%D8%AA');
  assert.ok(!JSON.stringify(search.body).includes('shop-a'));
  const stores = await call('GET', '/stores');
  assert.ok(!JSON.stringify(stores.body).includes(A.shopSlug));
});

test('shop-through-Twist: edits, hiding and turning it off retire products without deleting them; orders block deletion', async () => {
  const { call } = await setup();
  const { q } = await import('../src/db/index.js');
  const a = await photo();
  const A = (await call('POST', '/admin/featured/advertisers', adv([{ src: a, name: 'قميص', price: '400' }], { slug: 'shop-b', name_ar: 'ب', name_en: 'B' }))).body.advertiser;
  const sid = q.get('SELECT id FROM stores WHERE slug=?', [A.shopSlug]).id;
  const pid = q.get('SELECT id FROM products WHERE store_id=?', [sid]).id;

  // price change updates the same product
  await call('PUT', `/admin/featured/advertisers/${A.id}`, adv([{ src: a, name: 'قميص', price: '450' }], { slug: 'shop-b', name_ar: 'ب', name_en: 'B' }));
  assert.equal(q.get('SELECT price FROM products WHERE id=?', [pid]).price, 450);
  assert.equal(q.val('SELECT COUNT(*) FROM products WHERE store_id=?', [sid]), 1);

  // hiding the advertiser makes the product unbuyable (draft), the row stays
  await call('PUT', `/admin/featured/advertisers/${A.id}`, adv([{ src: a, name: 'قميص', price: '450' }], { slug: 'shop-b', name_ar: 'ب', name_en: 'B', status: 'hidden' }));
  assert.equal(q.get('SELECT status FROM products WHERE id=?', [pid]).status, 'draft');
  const { quote } = await import('../src/lib/cart.js');
  assert.equal(quote(q.get('SELECT * FROM stores WHERE id=?', [sid]), [{ productId: pid, qty: 1 }]).hasErrors, true);

  // showing it again reuses the same product
  await call('PUT', `/admin/featured/advertisers/${A.id}`, adv([{ src: a, name: 'قميص', price: '450' }], { slug: 'shop-b', name_ar: 'ب', name_en: 'B' }));
  assert.equal(q.get('SELECT status FROM products WHERE id=?', [pid]).status, 'active');

  // turning the option off: no basket data, product retired
  await call('PUT', `/admin/featured/advertisers/${A.id}`, adv([{ src: a, name: 'قميص', price: '450' }], { slug: 'shop-b', name_ar: 'ب', name_en: 'B', twist_orders: false }));
  assert.equal(q.get('SELECT status FROM products WHERE id=?', [pid]).status, 'draft');
  assert.equal((await call('GET', '/advertiser/shop-b')).body.advertiser.gallery[0].cart, null);

  // removing the price retires just that product
  await call('PUT', `/admin/featured/advertisers/${A.id}`, adv([{ src: a, name: 'قميص', price: '450' }, { src: await photo(), name: 'حزام', price: '90' }], { slug: 'shop-b', name_ar: 'ب', name_en: 'B' }));
  await call('PUT', `/admin/featured/advertisers/${A.id}`, adv([{ src: a, name: 'قميص', price: '' }, { src: await photo(), name: 'حزام', price: '90' }], { slug: 'shop-b', name_ar: 'ب', name_en: 'B' }));
  assert.equal(q.get('SELECT status FROM products WHERE id=?', [pid]).status, 'draft');

  // an advertiser whose shop has orders cannot be deleted; one without can
  q.run("INSERT INTO orders (store_id, number, customer_name, phone, governorate, city, address, status, subtotal, total, created_at, updated_at) VALUES (?, 'AD-1', 'x', '0100', 'Qalyubia', 'Banha', 'x', 'pending', 450, 450, datetime('now'), datetime('now'))", [sid]);
  assert.equal((await call('DELETE', `/admin/featured/advertisers/${A.id}`)).status, 409);
  const C = (await call('POST', '/admin/featured/advertisers', adv([{ src: a, name: 'م', price: '10' }], { slug: 'shop-c', name_ar: 'ج', name_en: 'C' }))).body.advertiser;
  assert.equal((await call('DELETE', `/admin/featured/advertisers/${C.id}`)).status, 200);
  assert.equal(q.get('SELECT id FROM stores WHERE slug=?', [C.shopSlug]), undefined);
});

test('shop-through-Twist: a real Twist checkout of an advertiser item creates a normal platform-delivered order', async () => {
  const { call } = await setup();
  const { q } = await import('../src/db/index.js');
  const a = await photo();
  const A = (await call('POST', '/admin/featured/advertisers', adv([{ src: a, name: 'سماعة', price: '600' }], { slug: 'shop-e2e', name_ar: 'إي', name_en: 'E2E' }))).body.advertiser;
  const pub = (await call('GET', '/advertiser/shop-e2e')).body.advertiser;
  const line = pub.gallery[0].cart;
  const order = await call('POST', '/marketplace/orders', {
    name: 'عميل تجربة', phone: '01012345678', governorate: 'Qalyubia', city: 'Banha', address: 'شارع التجربة ١٢ بنها',
    stores: [{ slug: line.storeSlug, items: [{ productId: line.productId, qty: 2 }] }],
  });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const num = order.body.orders[0].number;
  const row = q.get('SELECT * FROM orders WHERE number=?', [num]);
  const sid = q.get('SELECT id FROM stores WHERE slug=?', [A.shopSlug]).id;
  assert.equal(row.store_id, sid); assert.equal(row.delivery_by, 'platform'); assert.equal(row.subtotal, 1200);
  const items = q.all('SELECT * FROM order_items WHERE order_id=?', [row.id]);
  assert.equal(items.length, 1); assert.equal(items[0].qty, 2); assert.ok(items[0].media_id); // the picture travels with the order
  // the platform admin sees it in the normal order list, under the advertiser's name
  const list = await call('GET', '/admin/orders');
  assert.equal(list.status, 200);
  assert.ok(JSON.stringify(list.body).includes(num));
  // and after the item is pulled, the same basket line is refused
  await call('PUT', `/admin/featured/advertisers/${A.id}`, adv([{ src: a, name: 'سماعة', price: '600' }], { slug: 'shop-e2e', name_ar: 'إي', name_en: 'E2E', status: 'hidden' }));
  const refused = await call('POST', '/marketplace/orders', {
    name: 'عميل تجربة', phone: '01012345678', governorate: 'Qalyubia', city: 'Banha', address: 'شارع التجربة ١٢ بنها',
    stores: [{ slug: line.storeSlug, items: [{ productId: line.productId, qty: 1 }] }],
  });
  assert.equal(refused.status, 409);
});

test('colours & sizes per photo: normalised, shown publicly, and become variants so the choice reaches the order', async () => {
  const { call } = await setup();
  const { q } = await import('../src/db/index.js');
  const a = await photo(); const b = await photo();
  const bad = await call('POST', '/admin/featured/advertisers', adv([{ src: a, name: 'تيشيرت', price: '200', colors: ['x'.repeat(21)] }], { slug: 'opt-bad', twist_orders: false }));
  assert.equal(bad.status, 422); assert.ok(bad.body.error.fields.gallery);

  const r = await call('POST', '/admin/featured/advertisers', adv([
    { src: a, name: 'تيشيرت', price: '200', colors: 'أسود، بيج,أسود', sizes: ['M', 'L', ' m '] },
    { src: b, name: 'حزام', price: '90' },
  ], { slug: 'opt-ok' }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const pub = (await call('GET', '/advertiser/opt-ok')).body.advertiser;
  assert.deepEqual(pub.gallery[0].colors, ['أسود', 'بيج']);
  assert.deepEqual(pub.gallery[0].sizes, ['M', 'L']);
  assert.deepEqual(pub.gallery[1].colors, []);
  const vs = pub.gallery[0].cart.variants;
  assert.equal(vs.length, 4); // 2 colours x 2 sizes
  assert.deepEqual(pub.gallery[1].cart.variants, []);

  // the variant carries colour + size into the quote (and so into the order line)
  const { quote } = await import('../src/lib/cart.js');
  const store = q.get('SELECT * FROM stores WHERE slug=?', [r.body.advertiser.shopSlug]);
  const v = vs.find((x) => x.color === 'بيج' && x.size === 'L');
  const qt = quote(store, [{ productId: pub.gallery[0].cart.productId, variantId: v.id, qty: 1 }]);
  assert.equal(qt.hasErrors, false);
  assert.equal(qt.lines[0].color, 'بيج'); assert.equal(qt.lines[0].size, 'L');

  // removing an option drops its variants again
  const upd = await call('PUT', `/admin/featured/advertisers/${r.body.advertiser.id}`, adv([{ src: a, name: 'تيشيرت', price: '200', colors: ['أسود'] }, { src: b, name: 'حزام', price: '90' }], { slug: 'opt-ok' }));
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(q.val('SELECT COUNT(*) FROM variants WHERE product_id=?', [pub.gallery[0].cart.productId]), 1);
});

test('map location: saved as coordinates, becomes the directions link, validated', async () => {
  const { call } = await setup();
  const bad = await call('POST', '/admin/featured/advertisers', adv([], { slug: 'loc-bad', twist_orders: false, lat: 95, lng: 31 }));
  assert.equal(bad.status, 422); assert.ok(bad.body.error.fields.lat);
  const half = await call('POST', '/admin/featured/advertisers', adv([], { slug: 'loc-half', twist_orders: false, lat: 30.46 }));
  assert.equal(half.status, 422);
  const ok = await call('POST', '/admin/featured/advertisers', adv([], { slug: 'loc-ok', twist_orders: false, lat: '30.466123', lng: '31.185432' }));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const pub = (await call('GET', '/advertiser/loc-ok')).body.advertiser;
  assert.equal(pub.lat, 30.466123); assert.equal(pub.lng, 31.185432);
  assert.equal(pub.mapsUrl, 'https://www.google.com/maps/search/?api=1&query=30.466123,31.185432');
  // an explicit link still wins; clearing the pin clears the derived link
  const upd = await call('PUT', `/admin/featured/advertisers/${ok.body.advertiser.id}`, adv([], { slug: 'loc-ok', twist_orders: false, lat: '', lng: '' }));
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal((await call('GET', '/advertiser/loc-ok')).body.advertiser.mapsUrl, null);
});

test('public page carries the brand colour computed from the advertiser logo', async () => {
  const { call } = await setup();
  const { saveAdImage } = await import('../src/lib/adImage.js');
  const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 245, g: 130, b: 20 } } }).png().toBuffer();
  const logo = (await saveAdImage(png, 'fg')).image;
  const r = await call('POST', '/admin/featured/advertisers', adv([], { slug: 'brand-ok', twist_orders: false, logo }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const b = (await call('GET', '/advertiser/brand-ok')).body.advertiser.brand;
  assert.ok(b && /^#[0-9a-f]{6}$/.test(b.c), JSON.stringify(b));
  assert.ok(parseInt(b.c.slice(1, 3), 16) > 200); // orange: strong red channel
  assert.equal((await call('GET', '/advertiser/shop-a')).body.advertiser.brand ?? null, null); // no logo -> null, page falls back
});
