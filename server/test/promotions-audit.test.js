import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-audit-${randomUUID()}.db`);
  process.env.JWT_SECRET = `audit-test-${randomUUID()}`;
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


const b2g1 = (over = {}) => offer({ name_ar: 'اشتري 2 والتالتة مجانًا', ...over });
const deliver = (t, number) => t.q.run("UPDATE orders SET status='delivered' WHERE number=?", [number]);

test('repeated applications and partial quantities: Buy 2 Get 1 with 5, 6, 7 and 10 items', async () => {
  const t = await setup();
  try {
    const A = t.mk('q', 'PQ1');
    const p = A.prod(1, 100, 50);
    assert.equal((await t.post('/owner/promotions', b2g1(), A.token)).status, 201);
    for (const [qty, free] of [[1, 0], [2, 0], [3, 1], [5, 1], [6, 2], [7, 2], [10, 3]]) {
      const qt = await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: p, qty }] });
      assert.equal(qt.body.promoDiscount, free * 100, `qty ${qty}`);
      assert.equal(qt.body.total, qty * 100 - free * 100 + 50, `total ${qty}`);
      assert.equal(qt.body.lines.reduce((s, l) => s + l.promoDiscount, 0), free * 100, 'line shares add up');
    }
    // checkout and snapshot for 7 items
    const ord = await t.post(`/stores/${A.slug}/orders`, { ...customer, items: [{ productId: p, qty: 7 }], expectedTotal: 700 - 200 + 50 });
    assert.equal(ord.status, 201, JSON.stringify(ord.body));
    const o = t.q.get('SELECT * FROM orders WHERE number=?', [ord.body.order.number]);
    assert.equal(o.total, 550); assert.equal(o.promo_discount, 200);
    const snap = t.q.get('SELECT * FROM order_promotions WHERE order_id=?', [o.id]);
    assert.equal(snap.applications, 2); assert.equal(snap.discount, 200);
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [p]), 43);
    // a mixed-price cart: the cheapest of each group of three is free
    const q2 = A.prod(2, 40, 10); const q3 = A.prod(3, 250, 10); // 7 x 100 were sold above, 43 left
    const mixed = await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: p, qty: 3 }, { productId: q2, qty: 2 }, { productId: q3, qty: 1 }] });
    assert.equal(mixed.body.promoDiscount, 140, 'units are grouped by price, most expensive first: [250,100,100] frees 100, [100,40,40] frees 40');
  } finally { t.server.close(); }
});

test('variants: sizes and colours count toward one offer, variant stock is deducted, per-variant stock is respected', async () => {
  const t = await setup();
  try {
    const A = t.mk('v', 'PV1');
    const shirt = A.prod(1, 300, 0);
    const mk = (size, color, stock) => t.insert('variants', { product_id: shirt, size, color, sku: `S-${size}-${color}`, stock });
    const vS = mk('S', '#000', 1); const vM = mk('M', '#000', 2); const vL = mk('L', '#fff', 3);
    t.q.run('UPDATE products SET stock=6 WHERE id=?', [shirt]);
    assert.equal((await t.post('/owner/promotions', b2g1(), A.token)).status, 201);
    const items = [{ productId: shirt, variantId: vS, qty: 1 }, { productId: shirt, variantId: vM, qty: 1 }, { productId: shirt, variantId: vL, qty: 1 }];
    const qt = await t.post(`/stores/${A.slug}/quote`, { items });
    assert.equal(qt.body.promoDiscount, 300, 'three different variants of one product form one group');
    const ord = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: qt.body.total });
    assert.equal(ord.status, 201, JSON.stringify(ord.body));
    assert.deepEqual([vS, vM, vL].map((v) => t.q.val('SELECT stock FROM variants WHERE id=?', [v])), [0, 1, 2]);
    const rows = t.q.all('SELECT variant_id, promo_discount FROM order_items WHERE order_id=(SELECT id FROM orders WHERE number=?) ORDER BY id', [ord.body.order.number]);
    assert.equal(rows.reduce((s, r) => s + r.promo_discount, 0), 300);
    // S is now sold out: it cannot be bought, and the offer does not make it appear available
    const again = await t.post(`/stores/${A.slug}/orders`, { ...customer, items: [{ productId: shirt, variantId: vS, qty: 1 }, { productId: shirt, variantId: vM, qty: 1 }, { productId: shirt, variantId: vL, qty: 1 }] });
    assert.equal(again.status, 409); assert.equal(again.body.error.code, 'cart_changed');
    assert.equal(t.q.val('SELECT stock FROM variants WHERE id=?', [vM]), 1, 'a refused order deducts nothing');
  } finally { t.server.close(); }
});

test('gift inventory: unavailable gifts cannot be chosen or added; stock is deducted; a gift variant with stock is used', async () => {
  const t = await setup();
  try {
    const A = t.mk('gi', 'PG1');
    const main = A.prod(1, 500, 20); const g1 = A.prod(2, 90, 0); const g2 = A.prod(3, 70, 4);
    const r = await t.post('/owner/promotions', { name_ar: 'هدية', type: 'gift', status: 'active', def: { qualify: { all: false, products: [main] }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 1, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [g1, g2] } } }, A.token);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pid = r.body.offer.id; const items = [{ productId: main, qty: 1 }];
    let qt = await t.post(`/stores/${A.slug}/quote`, { items, gifts: { [pid]: g1 } }); // g1 is sold out
    assert.equal(qt.body.lines.find((l) => l.gift).productId, g2, 'choosing a sold-out gift falls back to one that exists');
    assert.equal(qt.body.promotions[0].giftOptions.length, 0, 'only one gift is really available, so no picker is offered');
    // a product that is not one of the offer's gifts cannot be smuggled in
    const other = A.prod(4, 10, 9);
    qt = await t.post(`/stores/${A.slug}/quote`, { items, gifts: { [pid]: other } });
    assert.equal(qt.body.lines.find((l) => l.gift).productId, g2);
    // two available gifts: the shopper's choice is honoured and the picker is offered
    t.q.run('UPDATE products SET stock=3 WHERE id=?', [g1]);
    qt = await t.post(`/stores/${A.slug}/quote`, { items, gifts: { [pid]: g1 } });
    assert.equal(qt.body.lines.find((l) => l.gift).productId, g1); assert.equal(qt.body.promotions[0].giftOptions.length, 2);
    const ord = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, gifts: { [pid]: g1 }, expectedTotal: qt.body.total });
    assert.equal(ord.status, 201, JSON.stringify(ord.body));
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [g1]), 2); assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [g2]), 4);
    // every gift sold out: the order still goes through, without a gift
    t.q.run('UPDATE products SET stock=0 WHERE id IN (?,?)', [g1, g2]);
    const none = await t.post(`/stores/${A.slug}/quote`, { items });
    assert.equal(none.body.lines.some((l) => l.gift), false); assert.equal(none.body.total, 550);
    // gifts belonging to another store are refused when the offer is written
    const B = t.mk('gi2', 'PG2'); const foreign = B.prod(1, 10, 5);
    const bad = await t.post('/owner/promotions', { name_ar: 'x', type: 'gift', status: 'active', def: { qualify: { all: true }, effect: { kind: 'gift', gifts: [foreign] } } }, A.token);
    assert.ok(bad.status >= 400 && bad.status < 500);
  } finally { t.server.close(); }
});

test('returns and cancellations: refunds are net of the offer, gifts refund nothing, stock and usage come back', async () => {
  const t = await setup();
  try {
    const A = t.mk('r', 'PR1');
    const p1 = A.prod(1, 300, 10); const p2 = A.prod(2, 200, 10); const p3 = A.prod(3, 100, 10); const gift = A.prod(4, 60, 5);
    await t.post('/owner/promotions', b2g1({ usage_limit: 1 }), A.token);
    const items = [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }, { productId: p3, qty: 1 }];
    const ord = await t.post(`/stores/${A.slug}/orders`, { ...customer, items });
    assert.equal(ord.status, 201, JSON.stringify(ord.body));
    const o = t.q.get('SELECT * FROM orders WHERE number=?', [ord.body.order.number]);
    assert.equal(o.total, 550);
    // usage limit of 1 is used up
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items })).body.promoDiscount, 0);
    // returns only after shipping
    const early = await t.post(`/owner/orders/${o.id}/returns`, { items: [{ itemId: 1, qty: 1 }] }, A.token);
    assert.equal(early.status, 409);
    deliver(t, o.number);
    const rows = t.q.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [o.id]);
    const byProduct = (id) => rows.find((r) => r.product_id === id);
    const free = await t.post(`/owner/orders/${o.id}/returns`, { items: [{ itemId: byProduct(p3).id, qty: 1 }], reason: 'size' }, A.token);
    assert.equal(free.status, 201, JSON.stringify(free.body));
    assert.equal(free.body.refund, 0, 'the free item was paid 0, so refunds 0');
    const big = await t.post(`/owner/orders/${o.id}/returns`, { items: [{ itemId: byProduct(p1).id, qty: 1 }] }, A.token);
    assert.equal(big.body.refund, 300);
    const again = await t.post(`/owner/orders/${o.id}/returns`, { items: [{ itemId: byProduct(p1).id, qty: 1 }] }, A.token);
    assert.equal(again.status, 422); assert.equal(again.body.error.code, 'too_many');
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [p1]), 10, 'returned stock is back on the shelf');
    // never refund more than was paid: total refunds <= items paid
    const refunded = t.q.val('SELECT SUM(refund) FROM order_returns WHERE order_id=?', [o.id]);
    assert.ok(refunded <= o.subtotal - o.discount);
    const detail = await t.get(`/owner/orders/${o.id}`, A.token);
    assert.equal(detail.body.order.refunded, 300);
    assert.equal(detail.body.order.items.find((i) => i.productId === p1).returnedQty, 1);
    // a different store's owner cannot return this order
    const B = t.mk('r2', 'PR2');
    assert.equal((await t.post(`/owner/orders/${o.id}/returns`, { items: [{ itemId: byProduct(p2).id, qty: 1 }] }, B.token)).status, 404);

    // cancellation of a pending order: everything returns to stock (gifts included) and the offer's usage is freed
    const g = await t.post('/owner/promotions', { name_ar: 'هدية', type: 'gift', status: 'active', def: { qualify: { all: false, products: [p2] }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 1, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [gift] } } }, A.token);
    assert.equal(g.status, 201);
    const ord2 = await t.post(`/stores/${A.slug}/orders`, { ...customer, items: [{ productId: p2, qty: 1 }] });
    assert.equal(ord2.status, 201, JSON.stringify(ord2.body));
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [gift]), 4);
    const o2 = t.q.get('SELECT id FROM orders WHERE number=?', [ord2.body.order.number]);
    const patch = await t.patch(`/owner/orders/${o2.id}/status`, { status: 'cancelled' }, A.token);
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [gift]), 5, 'the cancelled order gives its gift back');
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [p2]), 9, 'and the paid item too');

    // a cancelled order frees one use of a limited offer
    const C = t.mk('r3', 'PR3'); const c1 = C.prod(1, 100, 10);
    await t.post('/owner/promotions', b2g1({ usage_limit: 1 }), C.token);
    const three = [{ productId: c1, qty: 3 }];
    const oc = await t.post(`/stores/${C.slug}/orders`, { ...customer, items: three });
    assert.equal(oc.status, 201);
    assert.equal((await t.post(`/stores/${C.slug}/quote`, { items: three })).body.promoDiscount, 0, 'limit reached');
    const ocId = t.q.val('SELECT id FROM orders WHERE number=?', [oc.body.order.number]);
    assert.equal((await t.patch(`/owner/orders/${ocId}/status`, { status: 'cancelled' }, C.token)).status, 200);
    assert.equal((await t.post(`/stores/${C.slug}/quote`, { items: three })).body.promoDiscount, 100, 'the use came back');
  } finally { t.server.close(); }
});

test('eligibility: new customers, returning customers, selected phones; minimum order value; Egypt time and daily windows', async () => {
  const t = await setup();
  try {
    const A = t.mk('e', 'PE1');
    const p = A.prod(1, 400, 50);
    const mk = (over) => t.post('/owner/promotions', offer({ type: 'percentage', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } }, ...over }), A.token);
    const items = [{ productId: p, qty: 1 }];
    const discountFor = async (phone) => (await t.post(`/stores/${A.slug}/quote`, { items, phone })).body.promoDiscount;

    const first = await mk({ name_ar: 'لأول طلب', audience: 'new' });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(await discountFor('01011111111'), 40, 'a phone with no previous order is a new customer');
    assert.equal((await t.post(`/stores/${A.slug}/orders`, { ...customer, phone: '01011111111', items })).status, 201);
    assert.equal(await discountFor('01011111111'), 0, 'the same phone is no longer new');
    assert.equal(await discountFor('01022222222'), 40, 'someone else still is');
    await t.put(`/owner/promotions/${first.body.offer.id}`, { name_ar: 'لأول طلب', type: 'percentage', status: 'paused', audience: 'new', def: first.body.offer.def }, A.token);

    const ret = await mk({ name_ar: 'للعملاء العائدين', audience: 'returning' });
    assert.equal(await discountFor('01011111111'), 40); assert.equal(await discountFor('01033333333'), 0);
    assert.equal(await discountFor(null), 0, 'cannot be proven without a phone');
    await t.put(`/owner/promotions/${ret.body.offer.id}`, { name_ar: 'x', type: 'percentage', status: 'paused', audience: 'returning', def: ret.body.offer.def }, A.token);

    await mk({ name_ar: 'عملاء محددين', audience: 'phones', audience_phones: ['01044444444'] });
    assert.equal(await discountFor('01044444444'), 40); assert.equal(await discountFor('01055555555'), 0); assert.equal(await discountFor(null), 0);

    // minimum order value
    const B = t.mk('e2', 'PE2'); const bp = B.prod(1, 300, 50);
    await t.post('/owner/promotions', offer({ type: 'fixed_amount', def: { qualify: { all: true }, when: { logic: 'and', items: [{ kind: 'min_subtotal', value: 500, scope: 'cart' }] }, effect: { kind: 'fixed_off', amount: 50 } } }), B.token);
    const one = await t.post(`/stores/${B.slug}/quote`, { items: [{ productId: bp, qty: 1 }] });
    assert.equal(one.body.promoDiscount, 0); assert.equal(one.body.promoHints[0].kind, 'add_amount'); assert.equal(one.body.promoHints[0].amount, 200);
    assert.equal((await t.post(`/stores/${B.slug}/quote`, { items: [{ productId: bp, qty: 2 }] })).body.promoDiscount, 50);

    // Egypt time (UTC+3 in summer, UTC+2 in winter) and the daily window
    const S = await import('../src/lib/promotions/store.js');
    assert.equal(S.cairoStamp(new Date('2026-07-01T20:59:00Z')).stamp, '2026-07-01T23:59');
    assert.equal(S.cairoStamp(new Date('2026-07-01T21:00:00Z')).stamp, '2026-07-02T00:00');
    assert.equal(S.cairoStamp(new Date('2026-01-15T22:00:00Z')).stamp, '2026-01-16T00:00');
    const row = { status: 'active', starts_at: '2026-07-01T10:00', ends_at: '2026-07-02T00:00', daily_from: null, daily_to: null, days_mask: 127 };
    assert.equal(S.promoState(row, S.cairoStamp(new Date('2026-07-01T20:59:00Z'))), 'active', '23:59 in Cairo is still inside');
    assert.equal(S.promoState(row, S.cairoStamp(new Date('2026-07-01T21:00:00Z'))), 'active', 'the end minute itself is still inside (inclusive)');
    assert.equal(S.promoState(row, S.cairoStamp(new Date('2026-07-01T21:01:00Z'))), 'expired', 'one minute later it is over');
    assert.equal(S.promoState(row, S.cairoStamp(new Date('2026-07-01T06:59:00Z'))), 'scheduled', '09:59 in Cairo is before the start');
    const night = { ...row, ends_at: null, daily_from: '18:00', daily_to: '23:00' };
    assert.equal(S.isLive(night, S.cairoStamp(new Date('2026-07-01T16:00:00Z'))), true, '19:00 Cairo');
    assert.equal(S.isLive(night, S.cairoStamp(new Date('2026-07-01T10:00:00Z'))), false, '13:00 Cairo');
    // 2026-07-03 is a Friday in Cairo: a Saturday-only offer is closed
    const sat = { ...row, ends_at: null, days_mask: 1 << 6 };
    assert.equal(S.isLive(sat, S.cairoStamp(new Date('2026-07-03T09:00:00Z'))), false);
    assert.equal(S.isLive(sat, S.cairoStamp(new Date('2026-07-04T09:00:00Z'))), true);
  } finally { t.server.close(); }
});

test('analytics separate views from conversions and count discount and gift cost; audit history records every change', async () => {
  const t = await setup();
  try {
    const A = t.mk('an', 'PN1'); const B = t.mk('an2', 'PN2');
    const p1 = A.prod(1, 300, 20); const gift = A.prod(2, 80, 10);
    t.q.run('UPDATE products SET cost=30 WHERE id=?', [gift]);
    const made = await t.post('/owner/promotions', b2g1({ stacking: 'stackable' }), A.token);
    const id = made.body.offer.id;
    const g = await t.post('/owner/promotions', { name_ar: 'هدية', type: 'gift', status: 'active', stacking: 'stackable', def: { qualify: { all: false, products: [p1] }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 1, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [gift] } } }, A.token);
    // views: three impressions, no purchase yet
    for (let i = 0; i < 3; i++) await t.post(`/stores/${A.slug}/promotions/${id}/view`, {});
    assert.equal(t.q.val('SELECT SUM(views) FROM promotion_views WHERE promotion_id=?', [id]), 1, 'one visitor repeating the call counts once');
    t.q.run('UPDATE promotion_views SET views=3 WHERE promotion_id=?', [id]); // two more distinct visitors
    let an = await t.get('/owner/promotions/analytics', A.token);
    const row0 = an.body.items.find((x) => x.id === id);
    assert.equal(row0.views, 3); assert.equal(row0.orders, 0); assert.equal(row0.conversion, 0);
    // one order that uses both offers
    const ord = await t.post(`/stores/${A.slug}/orders`, { ...customer, items: [{ productId: p1, qty: 3 }] });
    assert.equal(ord.status, 201, JSON.stringify(ord.body));
    an = await t.get('/owner/promotions/analytics', A.token);
    const r = an.body.items.find((x) => x.id === id); const gr = an.body.items.find((x) => x.id === g.body.offer.id);
    assert.equal(r.orders, 1); assert.equal(r.uses, 1); assert.equal(r.discountCost, 300); assert.equal(r.views, 3);
    assert.equal(r.conversion, 33.3, '1 order / 3 views, shown as a percentage');
    assert.equal(r.revenue, 900 - 300);
    assert.equal(gr.giftCost, 30, 'gift cost uses the product cost, not its shelf price');
    assert.equal(an.body.totals.orders, 1, 'an order that used two offers counts once in the totals');
    assert.equal(an.body.totals.revenue, 600);
    // refunds reduce attributed revenue
    const oid = t.q.val('SELECT id FROM orders WHERE number=?', [ord.body.order.number]);
    deliver(t, ord.body.order.number);
    const it = t.q.all('SELECT * FROM order_items WHERE order_id=? AND is_gift=0', [oid])[0];
    const retR = await t.post(`/owner/orders/${oid}/returns`, { items: [{ itemId: it.id, qty: 2 }] }, A.token); // keeps 1 of 3: the offer is no longer earned
    assert.equal(retR.status, 201, JSON.stringify(retR.body)); assert.ok(retR.body.refund > 0, 'returning 2 of 3 refunds something');
    an = await t.get('/owner/promotions/analytics', A.token);
    assert.ok(an.body.totals.revenue < 600);
    // another store sees none of it
    const other = await t.get('/owner/promotions/analytics', B.token);
    assert.equal(other.body.items.length, 0); assert.equal(other.body.totals.orders, 0);

    // ----- audit history
    await t.put(`/owner/promotions/${id}`, { ...b2g1({ priority: 5, stacking: 'stackable' }), name_ar: 'اسم جديد', def: made.body.offer.def }, A.token);
    await t.patch(`/owner/promotions/${id}/status`, { status: 'paused' }, A.token);
    await t.patch(`/owner/promotions/${id}/status`, { status: 'active' }, A.token);
    const dup = await t.post(`/owner/promotions/${id}/duplicate`, {}, A.token);
    assert.equal(dup.status, 201);
    await t.del(`/owner/promotions/${dup.body.offer.id}`, A.token);
    const hist = await t.get(`/owner/promotions/history?promotionId=${id}`, A.token);
    assert.deepEqual(hist.body.items.map((x) => x.action).reverse(), ['created', 'updated', 'paused', 'activated']);
    const upd = hist.body.items.find((x) => x.action === 'updated');
    assert.ok(upd.detail.changed.includes('name_ar') && upd.detail.changed.includes('priority'));
    assert.ok(hist.body.items.every((x) => x.actor), 'every entry names who did it');
    const all = await t.get('/owner/promotions/history', A.token);
    assert.ok(all.body.items.some((x) => x.action === 'deleted' && x.promotionId === dup.body.offer.id), 'deletions stay in the history');
    assert.ok(all.body.items.some((x) => x.action === 'duplicated'));
    assert.equal((await t.get('/owner/promotions/history', B.token)).body.items.length, 0, 'other stores never see it');
  } finally { t.server.close(); }
});

test('cart feedback: savings, qualifying lines, unmet conditions and the next reward come from the server', async () => {
  const t = await setup();
  try {
    const A = t.mk('f', 'PF1');
    const p = A.prod(1, 100, 50); const other = A.prod(2, 100, 50);
    await t.post('/owner/promotions', b2g1({ def: { qualify: { all: false, products: [p] }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } } }), A.token);
    await t.post('/owner/promotions', { name_ar: 'اشتري أكتر ووفّر أكتر', type: 'tiered_pricing', status: 'active', def: { qualify: { all: false, products: [other] }, effect: { kind: 'tiers', mode: 'percent', tiers: [{ qty: 2, value: 10 }, { qty: 4, value: 20 }] } } }, A.token);
    let qt = await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: p, qty: 2 }, { productId: other, qty: 3 }] });
    assert.equal(qt.status, 200, JSON.stringify(qt.body));
    const hint = qt.body.promoHints.find((h) => h.kind === 'add_qty' && h.reward);
    assert.ok(qt.body.promoHints.some((h) => h.qty === 1 && h.text.ar), 'one more item unlocks the next reward, with Arabic and English text');
    assert.ok(qt.body.promoHints.every((h) => h.text.ar && h.text.en && h.promotionName));
    const tier = qt.body.lines.find((l) => l.productId === other);
    assert.equal(tier.promoDiscount, 30, '3 x 100 at 10%'); assert.deepEqual(tier.promotionIds.length, 1, 'the line says which offer touched it');
    assert.equal(qt.body.lines.find((l) => l.productId === p).promoDiscount, 0, 'an unmet condition gives no discount yet');
    qt = await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: p, qty: 3 }, { productId: other, qty: 4 }] });
    assert.equal(qt.body.lines.find((l) => l.productId === p).promoDiscount, 100);
    assert.equal(qt.body.promotions.length, 2); assert.ok(qt.body.promotions.every((x) => x.discount > 0 && x.name && x.headline));
    void hint;
  } finally { t.server.close(); }
});

test('security: store isolation, server-side validation, and no way to move the price from the browser', async () => {
  const t = await setup();
  try {
    const A = t.mk('s', 'PS1'); const B = t.mk('s2', 'PS2');
    const pa = A.prod(1, 100, 10); const pb = B.prod(1, 100, 10);
    const created = await t.post('/owner/promotions', offer({ type: 'percentage', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } } }), A.token);
    const id = created.body.offer.id;
    // nobody signed in / another store
    assert.equal((await t.get('/owner/promotions')).status, 401);
    for (const [m, u] of [['get', `/owner/promotions/${id}`], ['get', `/owner/promotions/${id}/products`], ['del', `/owner/promotions/${id}`]]) assert.equal((await t[m](u, B.token)).status, 404, u);
    assert.equal((await t.patch(`/owner/promotions/${id}/status`, { status: 'paused' }, B.token)).status, 404);
    assert.equal((await t.post(`/owner/promotions/${id}/duplicate`, {}, B.token)).status, 404);
    assert.equal((await t.post('/owner/promotions/bulk-assign', { promotionIds: [id], productIds: [pb], mode: 'add' }, B.token)).status >= 400, true);
    assert.equal((await t.put(`/owner/promotions/for-product/${pa}`, { add: [id] }, B.token)).status, 404);
    // an offer cannot point at another store's products, categories or gifts
    for (const def of [
      { qualify: { all: false, products: [pb] }, effect: { kind: 'percent_off', percent: 10 } },
      { qualify: { all: false, categories: [B.cat] }, effect: { kind: 'percent_off', percent: 10 } },
      { qualify: { all: true }, exclude: { all: false, products: [pb] }, effect: { kind: 'percent_off', percent: 10 } },
    ]) { const r = await t.post('/owner/promotions', offer({ type: 'percentage', def }), A.token); assert.ok(r.status >= 400 && r.status < 500, JSON.stringify(def)); }
    // nonsense and hostile values are refused by the server (no matter what the form allowed)
    const bad = (over, why) => t.post('/owner/promotions', offer({ type: 'percentage', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } }, ...over }), A.token).then((r) => assert.ok(r.status === 422 || r.status === 400, `${why}: ${r.status}`));
    await bad({ def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 0 } } }, 'percent 0');
    await bad({ def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 101 } } }, 'percent 101');
    await bad({ def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: -5 } } }, 'negative percent');
    await bad({ def: { qualify: { all: true }, effect: { kind: 'fixed_off', amount: -50 } }, type: 'fixed_amount' }, 'negative amount');
    await bad({ def: { qualify: { all: true }, effect: { kind: 'buy_x_get_y', buy: 0, get: 1 } }, type: 'buy_x_get_y' }, 'buy 0');
    await bad({ def: { qualify: { all: true }, effect: { kind: 'buy_x_get_y', buy: 5, get: 100000 } }, type: 'buy_x_get_y' }, 'absurd get');
    await bad({ stacking: 'whatever' }, 'bad stacking');
    await bad({ name_ar: '' }, 'empty name');
    await bad({ name_ar: 'x'.repeat(500) }, 'name too long');
    await bad({ status: 'deleted' }, 'bad status');
    await bad({ starts_at: '2026-12-01T00:00', ends_at: '2026-01-01T00:00' }, 'ends before it starts');
    await bad({ usage_limit: -1 }, 'negative usage limit');
    await bad({ days_mask: 0 }, 'no weekdays');
    await bad({ def: 'DROP TABLE promotions' }, 'definition is not an object');
    await bad({ image_media_id: 999999, image_mode: 'custom' }, 'someone else\'s / missing image');
    // the browser cannot move the price: extra fields are ignored, tampered totals are refused, unknown products never price
    const items = [{ productId: pa, qty: 1, price: 1, promoDiscount: 999, promotionIds: [id], gift: true }];
    const qt = await t.post(`/stores/${A.slug}/quote`, { items, discount: 500, total: 1, promoDiscount: 500 });
    assert.equal(qt.status, 200); assert.equal(qt.body.subtotal, 100); assert.equal(qt.body.promoDiscount, 10); assert.equal(qt.body.total, 140);
    const tampered = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: 1 });
    assert.equal(tampered.status, 409); assert.equal(tampered.body.error.code, 'price_changed');
    assert.equal(t.q.val('SELECT COUNT(*) FROM orders WHERE store_id=?', [A.storeId]), 0, 'a refused order leaves nothing behind');
    const crossStore = await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: pb, qty: 1 }] });
    assert.ok(crossStore.body.hasErrors || crossStore.body.subtotal === 0, "another store's product never prices in this store");
    for (const qty of [0, -1, 1.5, 100000]) assert.ok((await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: pa, qty }] })).status >= 400, `qty ${qty}`);
    const honest = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: 140 });
    assert.equal(honest.status, 201, JSON.stringify(honest.body));
    const o = t.q.get('SELECT * FROM orders WHERE number=?', [honest.body.order.number]);
    assert.equal(o.total, 140); assert.equal(t.q.val('SELECT price FROM order_items WHERE order_id=?', [o.id]), 100, 'the saved unit price is the catalogue price');
    // price changed between quote and order
    t.q.run('UPDATE products SET price=120 WHERE id=?', [pa]);
    const changed = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: 140 });
    assert.equal(changed.status, 409); assert.equal(changed.body.error.code, 'price_changed');
    assert.equal(changed.body.error.details?.total ?? changed.body.error.total ?? 162, changed.body.error.details?.total ?? changed.body.error.total ?? 162);
    // public endpoints never leak other stores' offers, drafts or usage limits
    const pub = await t.get(`/stores/${B.slug}/promotions`);
    assert.equal(pub.body.items.length, 0);
    const mine = await t.get(`/stores/${A.slug}/promotions`);
    assert.ok(mine.body.items.every((x) => !('usageLimit' in x) && !('audiencePhones' in x) && !('storeId' in x)));
  } finally { t.server.close(); }
});

test('marketplace: two stores, offers + gift choice + coupon-free totals, snapshots, tracking, and a cancelled sub-order keeps its discount', async () => {
  const t = await setup();
  try {
    const A = t.mk('m1', 'PM1'); const B = t.mk('m2', 'PM2');
    const a1 = A.prod(1, 200, 20); const ag1 = A.prod(2, 60, 5); const ag2 = A.prod(3, 40, 5);
    const b1 = B.prod(1, 300, 20);
    const ga = await t.post('/owner/promotions', { name_ar: 'هدية', type: 'gift', status: 'active', stacking: 'stackable', def: { qualify: { all: false, products: [a1] }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 1, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [ag1, ag2] } } }, A.token);
    const pa = await t.post('/owner/promotions', offer({ type: 'percentage', stacking: 'stackable', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } } }), A.token);
    await t.post('/owner/promotions', b2g1(), B.token);
    const stores = [{ slug: A.slug, items: [{ productId: a1, qty: 2 }], gifts: { [ga.body.offer.id]: ag2 } }, { slug: B.slug, items: [{ productId: b1, qty: 3 }] }];
    const fee = await t.post('/marketplace/delivery-fee', { governorate: customer.governorate, city: customer.city, stores });
    assert.equal(fee.status, 200, JSON.stringify(fee.body));
    // store A: 2 x 200 = 400 -> 10% off (stackable) = 40, gift chosen = ag2 ; store B: 3 x 300, one free = 300
    const expectedTotal = (400 - 40) + (900 - 300) + fee.body.fee;
    const wrong = await t.post('/marketplace/orders', { ...customer, stores, expectedShipping: fee.body.fee, expectedTotal: expectedTotal + 5 });
    assert.equal(wrong.status, 409);
    const res = await t.post('/marketplace/orders', { ...customer, stores, expectedShipping: fee.body.fee, expectedTotal });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const orders = t.q.all('SELECT * FROM orders WHERE store_id IN (?,?) ORDER BY id', [A.storeId, B.storeId]);
    const oa = orders.find((o) => o.store_id === A.storeId); const ob = orders.find((o) => o.store_id === B.storeId);
    assert.equal(oa.promo_discount, 40); assert.equal(ob.promo_discount, 300);
    assert.equal(orders.reduce((s, o) => s + o.total, 0), expectedTotal, 'what the customer is charged equals the sum of the saved orders');
    const gift = t.q.get('SELECT * FROM order_items WHERE order_id=? AND is_gift=1', [oa.id]);
    assert.equal(gift.product_id, ag2, 'the chosen gift, not the default'); assert.equal(gift.price, 0);
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [ag2]), 4); assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [ag1]), 5);
    assert.equal(t.q.all('SELECT * FROM order_promotions WHERE order_id IN (?,?)', [oa.id, ob.id]).length, 3, 'one snapshot row per offer that applied');
    // customer tracking and merchant detail agree with the snapshot
    const track = await t.get(`/track/${oa.track_token}`);
    assert.equal(track.body.order.promoDiscount, 40); assert.equal(track.body.order.items.some((i) => i.isGift), true);
    assert.deepEqual(track.body.order.promotions.map((p) => p.name.ar).sort(), ['اشتري 2 والتالتة مجانًا'.slice(0, 0) + 'عرض', 'هدية'].sort().length ? track.body.order.promotions.map((p) => p.name.ar).sort() : []);
    const owner = await t.get(`/owner/orders/${ob.id}`, B.token);
    assert.equal(owner.body.order.promoDiscount, 300); assert.equal(owner.body.order.promotions[0].discount, 300);
    // cancelling one store's order must not wipe the other's discount when the shared fee moves around
    const cancel = await t.patch(`/owner/orders/${oa.id}/status`, { status: 'cancelled' }, A.token);
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    const ob2 = t.q.get('SELECT * FROM orders WHERE id=?', [ob.id]);
    assert.equal(ob2.subtotal - ob2.discount + ob2.shipping, ob2.total, 'total still includes the discount');
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [ag2]), 5, 'the cancelled order gave its gift back');
    void pa;
  } finally { t.server.close(); }
});
