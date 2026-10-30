import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-promo-pub-${randomUUID()}.db`);
  process.env.JWT_SECRET = `promo-pub-${randomUUID()}`;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: ownerRoutes } = await import('../src/routes/owner.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signToken } = await import('../src/lib/auth.js');
  const { insert, q } = await import('../src/db/index.js');
  const app = express();
  app.use(express.json());
  app.use('/api', publicRoutes); app.use('/api/owner', ownerRoutes); app.use(errorHandler);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, token) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  const mk = (n) => {
    const userId = insert('users', { name: `O${n}`, email: `${randomUUID()}@e.test`, password_hash: 'x' });
    const storeId = insert('stores', { owner_id: userId, slug: `pub-${n}-${randomUUID().slice(0, 6)}`, code: `PB${n}`, name_ar: 'م', name_en: 'S', shipping_fee: 50, free_shipping_over: 100000 });
    const cat = insert('categories', { store_id: storeId, slug: 'c', name_ar: 'قسم', name_en: 'Cat' });
    const prod = (i, price, category_id = cat) => insert('products', { store_id: storeId, slug: `p${i}-${randomUUID().slice(0, 5)}`, name_ar: `منتج ${i}`, name_en: `Item ${i}`, price, stock: 10, category_id });
    return { storeId, cat, prod, slug: q.get('SELECT slug FROM stores WHERE id=?', [storeId]).slug, token: signToken({ id: userId }) };
  };
  return { server, call, mk, q };
}

test('storefront sees only live, public offers - on the store, the product page and the cards', async () => {
  const t = await setup();
  try {
    const A = t.mk('a'); const B = t.mk('b');
    const p1 = A.prod(1, 300); const p2 = A.prod(2, 200);
    const mkOffer = (token, over) => t.call('POST', '/owner/promotions', { name_ar: 'عرض', type: 'percentage', status: 'active', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } }, ...over }, token);
    const live = await mkOffer(A.token, { name_ar: 'خصم 10%' });
    assert.equal(live.status, 201, JSON.stringify(live.body));
    await mkOffer(A.token, { name_ar: 'مسودة', status: 'draft' });
    await mkOffer(A.token, { name_ar: 'مستقبلي', starts_at: '2099-01-01T00:00' });
    await mkOffer(A.token, { name_ar: 'لعملاء محددين', audience: 'phones', audience_phones: ['01000000000'] });
    await mkOffer(B.token, { name_ar: 'عرض متجر آخر' });

    const list = await t.call('GET', `/stores/${A.slug}/promotions`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items.map((o) => o.name.ar), ['خصم 10%']); // draft, scheduled, targeted and other-store offers stay hidden
    assert.ok(list.body.items[0].text.headline.ar.includes('10'));

    const prods = await t.call('GET', `/stores/${A.slug}/products`);
    assert.ok(prods.body.items.every((c) => c.offer?.id === live.body.offer.id), 'cards carry the offer headline');

    const slug = t.q.get('SELECT slug FROM products WHERE id=?', [p1]).slug;
    const detail = await t.call('GET', `/stores/${A.slug}/products/${slug}`);
    assert.equal(detail.body.offers.length, 1);
    assert.ok(detail.body.related.every((c) => c.offer));

    // the displayed offer and the real price agree: the quote is what decides
    const qt = await t.call('POST', `/stores/${A.slug}/quote`, { items: [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }] });
    assert.equal(qt.body.promoDiscount, 50);

    // product excluded from offers shows no badge
    await t.call('PUT', `/owner/promotions/for-product/${p2}`, { exclude: true }, A.token);
    const again = await t.call('GET', `/stores/${A.slug}/products`);
    assert.equal(again.body.items.find((c) => c.id === p2).offer, undefined);
    assert.ok(again.body.items.find((c) => c.id === p1).offer);

    const v1 = await t.call('POST', `/stores/${A.slug}/promotions/${live.body.offer.id}/view`);
    const v2 = await t.call('POST', `/stores/${B.slug}/promotions/${live.body.offer.id}/view`); // another store's id
    assert.equal(v1.body.ok, true); assert.equal(v2.body.ok, false);
    assert.equal(t.q.val('SELECT SUM(views) FROM promotion_views WHERE promotion_id=?', [live.body.offer.id]), 1);
  } finally { t.server.close(); }
});

test('order details (owner + customer tracking) carry the promotion snapshot and gift flags', async () => {
  const t = await setup();
  try {
    const A = t.mk('c');
    const p1 = A.prod(1, 300); const p2 = A.prod(2, 200); const p3 = A.prod(3, 100);
    const created = await t.call('POST', '/owner/promotions', { name_ar: 'اشتري 2 والتالتة مجانًا', type: 'buy_x_get_y', status: 'active', def: { qualify: { all: true }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } } }, A.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const customer = { name: 'Test Customer', phone: '01012345678', governorate: 'Qalyubia', city: 'Banha', address: 'Test street, building 1' };
    const ord = await t.call('POST', `/stores/${A.slug}/orders`, { ...customer, items: [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }, { productId: p3, qty: 1 }], expectedTotal: 550 });
    assert.equal(ord.status, 201, JSON.stringify(ord.body));
    const row = t.q.get('SELECT id, track_token FROM orders WHERE number=?', [ord.body.order.number]);
    const owner = await t.call('GET', `/owner/orders/${row.id}`, null, A.token);
    assert.equal(owner.body.order.promoDiscount, 100);
    assert.equal(owner.body.order.promotions.length, 1);
    assert.equal(owner.body.order.promotions[0].discount, 100);
    assert.equal(owner.body.order.items.find((i) => i.productId === p3).promoDiscount, 100);
    const track = await t.call('GET', `/track/${row.track_token}`);
    assert.equal(track.status, 200, JSON.stringify(track.body));
    const tr = track.body.order || track.body;
    assert.equal(tr.promoDiscount, 100);
    assert.equal(tr.promotions[0].name.ar, 'اشتري 2 والتالتة مجانًا');
  } finally { t.server.close(); }
});
