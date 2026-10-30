import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-ret-${randomUUID()}.db`);
  process.env.JWT_SECRET = `ret-test-${randomUUID()}`;
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

const FIX = (A) => A.t.insert('offers', { store_id: A.storeId, type: 'fixed', code: 'FIX', title_ar: 'خصم', title_en: 'Off', value: 50, min_subtotal: 0, active: 1 });
const place = async (t, A, items, extra = {}) => {
  const qt = await t.post(`/stores/${A.slug}/quote`, { items, coupon: extra.coupon });
  const res = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, ...extra, expectedTotal: qt.body.total });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const o = t.q.get('SELECT * FROM orders WHERE number=?', [res.body.order.number]); deliver(t, o.number);
  return { o, rows: t.q.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [o.id]), paid: o.subtotal - o.discount };
};
const ret = (t, A, o, list, extra = {}) => t.post(`/owner/orders/${o.id}/returns`, { items: list.map(([itemId, qty]) => ({ itemId, qty })), ...extra }, A.token);
const untouched = (t, o) => { const n = t.q.get('SELECT subtotal, discount, promo_discount, shipping, total FROM orders WHERE id=?', [o.id]); assert.deepEqual(n, { subtotal: o.subtotal, discount: o.discount, promo_discount: o.promo_discount, shipping: o.shipping, total: o.total }, 'the historical order is never rewritten'); };

test('1. partial return while the offer is still earned: refund is what the returned units cost, the kept ones keep their share of the offer', async () => {
  const t = await setup();
  try {
    const A = t.mk('r1', 'RT1'); A.t = t; const p = A.prod(1, 100, 50);
    await t.post('/owner/promotions', b2g1(), A.token);
    const { o, rows, paid } = await place(t, A, [{ productId: p, qty: 6 }]);
    assert.equal(paid, 400, '6 x 100 with 2 free');
    // dry run shows the figure and changes nothing
    const dry = await ret(t, A, o, [[rows[0].id, 3]], { dryRun: true });
    assert.equal(dry.status, 200); assert.equal(dry.body.refund, 200);
    assert.equal(t.q.val('SELECT returned_qty FROM order_items WHERE id=?', [rows[0].id]), 0); assert.equal(t.q.val('SELECT COUNT(*) FROM order_returns WHERE order_id=?', [o.id]), 0);
    const r = await ret(t, A, o, [[rows[0].id, 3]]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.refund, 200, 'kept 3 units still earn 1 free: they cost 200, so 400 - 200 comes back');
    assert.equal(r.body.calculation.keptPromo, 100); assert.equal(r.body.calculation.promoLost, 0); assert.equal(r.body.calculation.mode, 'snapshot');
    const r2 = await ret(t, A, o, [[rows[0].id, 3]]);
    assert.equal(r2.body.refund, 200); // all back: 400 in total
    assert.equal(t.q.val('SELECT SUM(refund) FROM order_returns WHERE order_id=?', [o.id]), paid);
    untouched(t, o);
  } finally { t.server.close(); }
});

test('2. partial return that breaks Buy X Get Y: the free item the customer no longer earns is deducted', async () => {
  const t = await setup();
  try {
    const A = t.mk('r2', 'RT2'); A.t = t; const p1 = A.prod(1, 300, 9); const p2 = A.prod(2, 200, 9); const p3 = A.prod(3, 100, 9);
    await t.post('/owner/promotions', b2g1(), A.token);
    const { o, rows, paid } = await place(t, A, [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }, { productId: p3, qty: 1 }]);
    assert.equal(paid, 500);
    const r = await ret(t, A, o, [[rows.find((x) => x.product_id === p1).id, 1]]);
    assert.equal(r.body.refund, 200, 'returning the 300 item would refund 300, but the kept 200 + 100 no longer earn the free item (100)');
    assert.equal(r.body.calculation.keptPromo, 0); assert.equal(r.body.calculation.promoLost, 100); assert.deepEqual(r.body.calculation.promotionsAfter, []);
    const rest = await ret(t, A, o, [[rows.find((x) => x.product_id === p2).id, 1], [rows.find((x) => x.product_id === p3).id, 1]]);
    assert.equal(rest.body.refund, 300); assert.equal(200 + rest.body.refund, paid, 'in the end exactly what was paid');
    untouched(t, o);
  } finally { t.server.close(); }
});

test('3. partial return that breaks a fixed-price bundle: the customer pays full price for the pieces they keep', async () => {
  const t = await setup();
  try {
    const A = t.mk('r3', 'RT3'); A.t = t; const s1 = A.prod(1, 400, 9); const s2 = A.prod(2, 300, 9); const s3 = A.prod(3, 250, 9);
    const slot = (id) => ({ sel: { all: false, products: [id], categories: [] }, qty: 1 });
    const b = await t.post('/owner/promotions', { name_ar: 'باقة', type: 'bundle', status: 'active', def: { qualify: { all: false, products: [s1, s2, s3] }, effect: { kind: 'bundle', price: 700, slots: [slot(s1), slot(s2), slot(s3)] } } }, A.token);
    assert.equal(b.status, 201, JSON.stringify(b.body));
    const { o, rows, paid } = await place(t, A, [{ productId: s1, qty: 1 }, { productId: s2, qty: 1 }, { productId: s3, qty: 1 }]);
    assert.equal(paid, 700);
    const id = (p) => rows.find((x) => x.product_id === p).id;
    const r1 = await ret(t, A, o, [[id(s3), 1]]);
    assert.equal(r1.body.refund, 0, 'kept 400 + 300 = 700 = what was paid: nothing to refund, the bundle price is gone with the missing piece');
    assert.equal(r1.body.calculation.keptPromo, 0); assert.equal(r1.body.calculation.promoLost, r1.body.calculation.originalPromo - rows.find((x) => x.product_id === s3).promo_discount);
    const r2 = await ret(t, A, o, [[id(s1), 1]]);
    assert.equal(r2.body.refund, 400, 'now only the 300 piece is kept: 700 - 300');
    const r3 = await ret(t, A, o, [[id(s2), 1]]);
    assert.equal(r3.body.refund, 300);
    assert.equal(t.q.val('SELECT SUM(refund) FROM order_returns WHERE order_id=?', [o.id]), 700);
    untouched(t, o);
  } finally { t.server.close(); }
});

test('4. partial return with an offer AND a coupon: the coupon follows the kept goods, never more than the original amount', async () => {
  const t = await setup();
  try {
    // (a) percentage offer stays valid + percentage coupon
    const A = t.mk('r4', 'RT4'); A.t = t;
    t.insert('offers', { store_id: A.storeId, type: 'percentage', code: 'TEN', title_ar: 'خصم', title_en: 'Off', value: 10, min_subtotal: 0, active: 1 });
    const big = A.prod(1, 1000, 9); const small = A.prod(2, 500, 9);
    await t.post('/owner/promotions', offer({ type: 'percentage', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 20 } } }), A.token);
    const a = await place(t, A, [{ productId: big, qty: 1 }, { productId: small, qty: 1 }], { coupon: 'TEN' });
    assert.equal(a.o.promo_discount, 300); assert.equal(a.o.discount, 420); assert.equal(a.paid, 1080, '1500 - 300 (20%) - 120 (10% of 1200)');
    const ra = await ret(t, A, a.o, [[a.rows.find((x) => x.product_id === small).id, 1]]);
    assert.equal(ra.body.refund, 360, 'kept 1000: 20% offer 200 and 10% coupon 80 -> costs 720; 1080 - 720');
    assert.equal(ra.body.calculation.originalCoupon, 120); assert.equal(ra.body.calculation.keptCoupon, 80); assert.equal(ra.body.calculation.keptPromo, 200);

    // (b) Buy 2 Get 1 broken + fixed coupon of 50
    const B = t.mk('r4b', 'RT5'); B.t = t; FIX(B);
    const p1 = B.prod(1, 300, 9); const p2 = B.prod(2, 200, 9); const p3 = B.prod(3, 100, 9);
    await t.post('/owner/promotions', b2g1(), B.token);
    const b = await place(t, B, [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }, { productId: p3, qty: 1 }], { coupon: 'FIX' });
    assert.equal(b.o.promo_discount, 100); assert.equal(b.o.discount, 150); assert.equal(b.paid, 450);
    const rb = await ret(t, B, b.o, [[b.rows.find((x) => x.product_id === p1).id, 1]]);
    assert.equal(rb.body.calculation.keptCoupon, 30, 'the 50 coupon shrinks with the kept goods: 300/500 of it');
    assert.equal(rb.body.refund, 180, '450 - (300 kept - 0 offer - 30 coupon)');
    assert.ok(rb.body.refund <= b.paid);
    untouched(t, a.o); untouched(t, b.o);
  } finally { t.server.close(); }
});

test('5. full return refunds exactly what the customer paid for the goods (shipping is not part of it)', async () => {
  const t = await setup();
  try {
    const A = t.mk('r5', 'RT6'); A.t = t; FIX(A);
    const p1 = A.prod(1, 300, 9); const p2 = A.prod(2, 200, 9); const p3 = A.prod(3, 100, 9);
    await t.post('/owner/promotions', b2g1(), A.token);
    const { o, rows, paid } = await place(t, A, [{ productId: p1, qty: 1 }, { productId: p2, qty: 1 }, { productId: p3, qty: 1 }], { coupon: 'FIX' });
    const r = await ret(t, A, o, rows.map((x) => [x.id, 1]));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.refund, paid); assert.equal(r.body.refund, 450); assert.equal(r.body.refund, o.total - o.shipping);
    assert.equal(r.body.items.reduce((s, x) => s + x.refund, 0), r.body.refund);
    for (const id of [p1, p2, p3]) assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [id]), 9, 'everything back on the shelf');
    assert.equal((await ret(t, A, o, [[rows[0].id, 1]])).status, 422, 'nothing left to return');
    untouched(t, o);
  } finally { t.server.close(); }
});

test('6. gifts: returning the free gift refunds nothing; keeping a gift that is no longer earned is charged back', async () => {
  const t = await setup();
  try {
    const A = t.mk('r6', 'RT7'); A.t = t; const main = A.prod(1, 500, 20); const gift = A.prod(2, 80, 5);
    const g = await t.post('/owner/promotions', { name_ar: 'هدية', type: 'gift', status: 'active', def: { qualify: { all: false, products: [main] }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 1, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [gift] } } }, A.token);
    assert.equal(g.status, 201);
    // (a) only the gift comes back: 0 refund, gift restocked
    const a = await place(t, A, [{ productId: main, qty: 1 }]);
    const giftRow = a.rows.find((x) => x.is_gift);
    assert.ok(giftRow && a.paid === 500);
    const ra = await ret(t, A, a.o, [[giftRow.id, 1]]);
    assert.equal(ra.body.refund, 0); assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [gift]), 5);
    // (b) the paid item comes back, the gift is kept: the gift is no longer earned, its 80 is deducted
    const b = await place(t, A, [{ productId: main, qty: 1 }]);
    const rb = await ret(t, A, b.o, [[b.rows.find((x) => !x.is_gift).id, 1]]);
    assert.equal(rb.body.refund, 420); assert.equal(rb.body.calculation.giftClawback, 80); assert.equal(rb.body.calculation.unearnedGifts.length, 1);
    // handing the gift back afterwards releases the deduction: back to the full 500 in total
    const rb2 = await ret(t, A, b.o, [[b.rows.find((x) => x.is_gift).id, 1]]);
    assert.equal(rb2.body.refund, 80); assert.equal(420 + rb2.body.refund, b.paid);
    untouched(t, a.o); untouched(t, b.o);
  } finally { t.server.close(); }
});

test('7. rounding and reconciliation: any order of single-unit returns lands on exactly what was paid, in whole piasters, with the calculation recorded', async () => {
  const t = await setup();
  try {
    const A = t.mk('r7', 'RT8'); A.t = t;
    t.insert('offers', { store_id: A.storeId, type: 'percentage', code: 'TEN', title_ar: 'خصم', title_en: 'Off', value: 10, min_subtotal: 0, active: 1 });
    const a = A.prod(1, 333, 40); const b = A.prod(2, 177, 40); const c = A.prod(3, 91, 40);
    await t.post('/owner/promotions', offer({ type: 'percentage', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 17 } } }), A.token);
    await t.post('/owner/promotions', b2g1({ stacking: 'stackable' }), A.token);
    const orders = [[0, 1, 2, 0, 1, 0], [2, 1, 0, 0, 1, 0], [0, 0, 0, 1, 1, 2], [1, 0, 2, 1, 0, 0]];
    for (const order of orders) {
      const { o, rows, paid } = await place(t, A, [{ productId: a, qty: 3 }, { productId: b, qty: 2 }, { productId: c, qty: 1 }], { coupon: 'TEN' });
      let sum = 0;
      for (const idx of order) {
        const r = await ret(t, A, o, [[rows[idx].id, 1]]);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.ok(Number.isInteger(r.body.refund) && r.body.refund >= 0);
        assert.equal(r.body.items.reduce((s, x) => s + x.refund, 0), r.body.refund, 'line shares add up to the refund');
        sum += r.body.refund; assert.ok(sum <= paid, 'never more than was paid');
      }
      assert.equal(sum, paid, 'all six units back = everything paid for the goods');
      assert.equal(t.q.val('SELECT SUM(refund) FROM order_returns WHERE order_id=?', [o.id]), paid);
      const saved = t.q.get('SELECT calc_json FROM order_returns WHERE order_id=? ORDER BY id DESC', [o.id]);
      const calc = JSON.parse(saved.calc_json);
      assert.equal(calc.itemsPaid, paid); assert.equal(calc.refundTotalAfter, paid); assert.ok(calc.rule);
      untouched(t, o);
    }
    // the snapshot of the definition is stored on the order, so editing the offer later cannot change a refund
    const snap = t.q.get('SELECT snapshot_json FROM order_promotions LIMIT 1');
    assert.ok(JSON.parse(snap.snapshot_json).def);
    const { o: o2, rows: r2 } = await place(t, A, [{ productId: a, qty: 3 }]);
    const before = (await ret(t, A, o2, [[r2[0].id, 1]], { dryRun: true })).body.refund;
    t.q.run("UPDATE promotions SET status='paused'"); t.q.run("UPDATE promotions SET rules_json='{}'");
    assert.equal((await ret(t, A, o2, [[r2[0].id, 1]], { dryRun: true })).body.refund, before, 'refund is based on the order snapshot, not the current offer');
  } finally { t.server.close(); }
});
