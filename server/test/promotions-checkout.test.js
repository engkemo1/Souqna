import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-promo-${randomUUID()}.db`);
  process.env.JWT_SECRET = `promo-test-${randomUUID()}`;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: ownerRoutes } = await import('../src/routes/owner.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signToken } = await import('../src/lib/auth.js');
  const dbm = await import('../src/db/index.js');
  const store = await import('../src/lib/promotions/store.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', publicRoutes);
  app.use('/api/owner', ownerRoutes);
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const { insert, q } = dbm;
  const mk = (suffix, code) => {
    const userId = insert('users', { name: `Owner ${suffix}`, email: `${randomUUID()}@example.test`, password_hash: 'x' });
    const storeId = insert('stores', { owner_id: userId, slug: `promo-${suffix}-${randomUUID().slice(0, 6)}`, code, name_ar: `محل ${suffix}`, name_en: `Store ${suffix}`, shipping_fee: 50, free_shipping_over: 100000 });
    const cat = insert('categories', { store_id: storeId, slug: 'c1', name_ar: 'قسم', name_en: 'Cat' });
    const prod = (n, price, stock = 20, category_id = cat) => insert('products', { store_id: storeId, slug: `p${n}-${randomUUID().slice(0, 5)}`, name_ar: `منتج ${n}`, name_en: `Item ${n}`, price, stock, category_id });
    return { userId, storeId, slug: q.get('SELECT slug FROM stores WHERE id=?', [storeId]).slug, cat, prod, token: signToken({ id: userId }) };
  };
  const post = async (url, body, token) => { const r = await fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const get = async (url, token) => { const r = await fetch(`${base}${url}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }); return { status: r.status, body: await r.json() }; };
  const put = async (url, body, token) => { const r = await fetch(`${base}${url}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const patch = async (url, body, token) => { const r = await fetch(`${base}${url}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const del = async (url, token) => { const r = await fetch(`${base}${url}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() }; };
  return { server, mk, post, get, put, patch, del, q, insert, store };
}

const offer = (over = {}) => ({
  name_ar: 'اشتري 2 والتالتة مجانًا', type: 'buy_x_get_y', status: 'active', stacking: 'per_product',
  def: { qualify: { all: true }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } }, ...over,
});
const customer = { name: 'Test Customer', phone: '01012345678', governorate: 'Qalyubia', city: 'Banha', address: 'Test street, building 1' };

test('Buy X Get Y flows through quote, checkout, stock and the saved order', async () => {
  const t = await setup();
  try {
    const A = t.mk('a', 'PRA');
    const p1 = A.prod(1, 300); const p2 = A.prod(2, 200); const p3 = A.prod(3, 100);
    const created = await t.post('/owner/promotions', offer(), A.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const items = [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }, { productId: p3, qty: 1 }];

    const qt = await t.post(`/stores/${A.slug}/quote`, { items });
    assert.equal(qt.status, 200);
    assert.equal(qt.body.subtotal, 600); assert.equal(qt.body.promoDiscount, 100); assert.equal(qt.body.discount, 100); assert.equal(qt.body.total, 550);
    assert.equal(qt.body.promotions.length, 1);
    assert.equal(qt.body.lines.find((l) => l.productId === p3).promoDiscount, 100);

    // a tampered total is rejected, the honest one goes through
    const bad = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: 1 });
    assert.equal(bad.status, 409); assert.equal(bad.body.error.code, 'price_changed');
    const ok = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: 550 });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.order.total, 550);
    const order = t.q.get('SELECT * FROM orders WHERE number=?', [ok.body.order.number]);
    assert.equal(order.subtotal, 600); assert.equal(order.discount, 100); assert.equal(order.promo_discount, 100); assert.equal(order.total, 550);
    const rows = t.q.all('SELECT * FROM order_promotions WHERE order_id=?', [order.id]);
    assert.equal(rows.length, 1); assert.equal(rows[0].discount, 100);
    assert.equal(t.q.val('SELECT SUM(promo_discount) FROM order_items WHERE order_id=?', [order.id]), 100);
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [p3]), 19);
  } finally { t.server.close(); }
});

test('coupons still work, combine on the discounted amount, and can be made non-combinable', async () => {
  const t = await setup();
  try {
    const A = t.mk('c', 'PRC');
    const p = A.prod(1, 1000);
    t.insert('offers', { store_id: A.storeId, type: 'percentage', code: 'SAVE10', title_ar: 'خصم', title_en: 'Off', value: 10, min_subtotal: 0, active: 1 });
    const items = [{ productId: p, qty: 1 }];
    // no promotion: legacy behaviour exactly
    let qt = await t.post(`/stores/${A.slug}/quote`, { items, coupon: 'SAVE10' });
    assert.equal(qt.body.discount, 100); assert.equal(qt.body.promoDiscount, 0); assert.equal(qt.body.total, 950);
    // add a 20% store promotion: coupon applies to what is left, nothing is discounted twice
    const c = await t.post('/owner/promotions', { name_ar: 'خصم 20', type: 'percentage', status: 'active', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 20 } } }, A.token);
    assert.equal(c.status, 201, JSON.stringify(c.body));
    qt = await t.post(`/stores/${A.slug}/quote`, { items, coupon: 'SAVE10' });
    assert.equal(qt.body.promoDiscount, 200); assert.equal(qt.body.couponDiscount, 80); assert.equal(qt.body.discount, 280); assert.equal(qt.body.total, 770);
    const order = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, coupon: 'SAVE10' });
    assert.equal(order.status, 201);
    assert.equal(t.q.get('SELECT * FROM orders WHERE number=?', [order.body.order.number]).coupon_code, 'SAVE10');
    // not combinable
    await t.put(`/owner/promotions/${c.body.offer.id}`, { name_ar: 'خصم 20', type: 'percentage', status: 'active', stack_with_coupons: false, def: c.body.offer.def }, A.token);
    qt = await t.post(`/stores/${A.slug}/quote`, { items, coupon: 'SAVE10' });
    assert.equal(qt.body.couponError, 'coupon_not_combinable'); assert.equal(qt.body.discount, 200);
  } finally { t.server.close(); }
});

test('schedule, pause, usage limits and per-customer limits are enforced server-side', async () => {
  const t = await setup();
  try {
    const A = t.mk('s', 'PRS');
    const p = A.prod(1, 100);
    const items = [{ productId: p, qty: 2 }];
    const pct = (over) => ({ name_ar: 'خصم', type: 'percentage', status: 'active', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 50 } }, ...over });
    const future = await t.post('/owner/promotions', pct({ starts_at: '2999-01-01T00:00' }), A.token);
    const past = await t.post('/owner/promotions', pct({ ends_at: '2000-01-01T00:00' }), A.token);
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items })).body.promoDiscount, 0, 'scheduled / expired offers do not apply');
    assert.equal(t.q.get('SELECT 1 AS x FROM promotions WHERE id=?', [future.body.offer.id]).x, 1);
    assert.equal((await t.get('/owner/promotions/stats', A.token)).body.counts.scheduled, 1);
    assert.equal((await t.get('/owner/promotions/stats', A.token)).body.counts.expired, 1);

    const lim = await t.post('/owner/promotions', pct({ usage_limit: 1, per_customer_limit: 1 }), A.token);
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items })).body.promoDiscount, 100);
    const o1 = await t.post(`/stores/${A.slug}/orders`, { ...customer, items });
    assert.equal(o1.status, 201);
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items })).body.promoDiscount, 0, 'total usage limit reached');
    // cancelling the order frees the use again
    t.q.run("UPDATE orders SET status='cancelled' WHERE number=?", [o1.body.order.number]);
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items })).body.promoDiscount, 100);
    // pause
    await t.patch(`/owner/promotions/${lim.body.offer.id}/status`, { status: 'paused' }, A.token);
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items })).body.promoDiscount, 0);
    void past;
  } finally { t.server.close(); }
});

test('free gift is added as a zero-price line, deducts stock and is recorded on the order', async () => {
  const t = await setup();
  try {
    const A = t.mk('g', 'PRG');
    const jacket = A.prod(1, 800); const gift = A.prod(2, 90, 5);
    const r = await t.post('/owner/promotions', { name_ar: 'هدية', type: 'gift', status: 'active', def: { qualify: { all: false, products: [jacket] }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 1, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [gift] } } }, A.token);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const items = [{ productId: jacket, qty: 1 }];
    const qt = await t.post(`/stores/${A.slug}/quote`, { items });
    assert.equal(qt.body.total, 850);
    const g = qt.body.lines.find((l) => l.gift);
    assert.ok(g); assert.equal(g.price, 0); assert.equal(g.productId, gift);
    const order = await t.post(`/stores/${A.slug}/orders`, { ...customer, items });
    assert.equal(order.status, 201);
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [gift]), 4);
    const o = t.q.get('SELECT * FROM orders WHERE number=?', [order.body.order.number]);
    assert.equal(o.total, 850);
    assert.equal(t.q.all('SELECT * FROM order_items WHERE order_id=? AND is_gift=1', [o.id]).length, 1);
  } finally { t.server.close(); }
});

test('store isolation: an owner cannot attach, read, edit or delete another store\'s offers or products', async () => {
  const t = await setup();
  try {
    const A = t.mk('x', 'PRX'); const B = t.mk('y', 'PRY');
    const bProd = B.prod(1, 100); const aProd = A.prod(1, 100);
    const own = await t.post('/owner/promotions', offer(), A.token);
    const foreign = await t.post('/owner/promotions', offer({ def: { qualify: { products: [bProd] }, effect: { kind: 'buy_x_get_y', buy: 1, get: 1 } } }), A.token);
    assert.equal(foreign.status, 422); assert.equal(foreign.body.error.fields.code, 'foreign_product');
    assert.equal((await t.get(`/owner/promotions/${own.body.offer.id}`, B.token)).status, 404);
    assert.equal((await t.put(`/owner/promotions/${own.body.offer.id}`, offer(), B.token)).status, 404);
    assert.equal((await t.del(`/owner/promotions/${own.body.offer.id}`, B.token)).status, 404);
    assert.equal((await t.get('/owner/promotions', B.token)).body.items.length, 0);
    assert.equal((await t.get(`/owner/promotions/for-product/${aProd}`, B.token)).status, 404);
    // the offer of store A never discounts a cart in store B
    const qt = await t.post(`/stores/${B.slug}/quote`, { items: [{ productId: bProd, qty: 3 }] });
    assert.equal(qt.body.promoDiscount, 0);
  } finally { t.server.close(); }
});

test('product form + bulk assignment keep unrelated products untouched', async () => {
  const t = await setup();
  try {
    const A = t.mk('b', 'PRB');
    const p1 = A.prod(1, 100); const p2 = A.prod(2, 100); const p3 = A.prod(3, 100);
    const a = await t.post('/owner/promotions', offer({ def: { qualify: { products: [p1] }, effect: { kind: 'percent_off', percent: 10 } }, type: 'percentage' }), A.token);
    const b = await t.post('/owner/promotions', offer({ name_ar: 'ثاني', def: { qualify: { products: [p3] }, effect: { kind: 'percent_off', percent: 10 } }, type: 'percentage' }), A.token);
    const bulk = await t.post('/owner/promotions/bulk-assign', { promotionIds: [a.body.offer.id], productIds: [p2], mode: 'add' }, A.token);
    assert.equal(bulk.status, 200);
    let list = await t.get(`/owner/promotions/${a.body.offer.id}/products`, A.token);
    assert.deepEqual(list.body.items.map((x) => x.id).sort(), [p1, p2].sort());
    list = await t.get(`/owner/promotions/${b.body.offer.id}/products`, A.token);
    assert.deepEqual(list.body.items.map((x) => x.id), [p3]);
    // from the product form
    const form = await t.put(`/owner/promotions/for-product/${p2}`, { remove: [a.body.offer.id], add: [b.body.offer.id] }, A.token);
    assert.deepEqual(form.body.items.map((x) => x.id), [b.body.offer.id]);
    // excluded from every offer
    await t.put(`/owner/promotions/for-product/${p3}`, { exclude: true }, A.token);
    const qt = await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: p3, qty: 1 }, { productId: p2, qty: 1 }] });
    assert.equal(qt.body.promoDiscount, 10, 'only p2 (10%) is discounted; p3 is excluded');
    // editing offer a leaves b's relationships alone
    await t.put(`/owner/promotions/${a.body.offer.id}`, offer({ def: { qualify: { products: [p1] }, effect: { kind: 'percent_off', percent: 15 } }, type: 'percentage' }), A.token);
    assert.equal((await t.get(`/owner/promotions/${b.body.offer.id}/products`, A.token)).body.total, 2);
  } finally { t.server.close(); }
});

test('rules that cannot be calculated safely are refused with a clear message', async () => {
  const t = await setup();
  try {
    const A = t.mk('v', 'PRV'); A.prod(1, 100);
    const empty = await t.post('/owner/promotions', offer({ def: { qualify: { all: false }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } } }), A.token);
    assert.equal(empty.status, 422); assert.ok(empty.body.error.fields.issues[0].ar);
    const draft = await t.post('/owner/promotions', offer({ status: 'draft', def: { qualify: { all: false }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } } }), A.token);
    assert.equal(draft.status, 201, 'drafts may be incomplete');
    const act = await t.patch(`/owner/promotions/${draft.body.offer.id}/status`, { status: 'active' }, A.token);
    assert.equal(act.status, 422, 'but cannot be activated');
    const prev = await t.post('/owner/promotions/preview', { offer: offer({ def: { qualify: { all: true }, effect: { kind: 'buy_x_get_y', buy: 10, get: 5 } } }), cart: [] }, A.token);
    assert.equal(prev.status, 200); assert.equal(prev.body.issues.length, 0);
  } finally { t.server.close(); }
});

test('marketplace checkout applies each store\'s offers and totals add up', async () => {
  const t = await setup();
  try {
    const A = t.mk('m1', 'PM1'); const B = t.mk('m2', 'PM2');
    const a = A.prod(1, 200); const b = B.prod(1, 500);
    await t.post('/owner/promotions', { name_ar: 'خصم', type: 'percentage', status: 'active', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } } }, A.token);
    const body = { ...customer, stores: [{ slug: A.slug, items: [{ productId: a, qty: 2 }] }, { slug: B.slug, items: [{ productId: b, qty: 1 }] }] };
    const fee = await t.post('/marketplace/delivery-fee', { governorate: customer.governorate, city: customer.city, stores: body.stores });
    assert.equal(fee.status, 200);
    const res = await t.post('/marketplace/orders', { ...body, expectedShipping: fee.body.fee, expectedTotal: 400 - 40 + 500 + fee.body.fee });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const orders = t.q.all('SELECT * FROM orders ORDER BY id');
    const oa = orders.find((o) => o.store_id === A.storeId);
    assert.equal(oa.promo_discount, 40); assert.equal(oa.discount, 40);
    assert.equal(orders.find((o) => o.store_id === B.storeId).promo_discount, 0);
  } finally { t.server.close(); }
});
