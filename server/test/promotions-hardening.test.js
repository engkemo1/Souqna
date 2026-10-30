import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-hard-${randomUUID()}.db`);
  process.env.JWT_SECRET = `hard-test-${randomUUID()}`;
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

const live = (A, id, stackingOver = {}) => A;
const gate = (n, price = 100) => ({ productId: n, qty: 1, price });

test('conflicts: one product in two offers, priority vs best savings, coupon on top, and an offer edited or paused while it sits in a cart', async () => {
  const t = await setup();
  try {
    const A = t.mk('cf', 'CF1'); const p = A.prod(1, 100, 50);
    t.insert('offers', { store_id: A.storeId, type: 'percentage', code: 'TEN', title_ar: 'خصم', title_en: 'Off', value: 10, min_subtotal: 0, active: 1 });
    const pct = await t.post('/owner/promotions', offer({ name_ar: 'خصم 10', type: 'percentage', priority: 5, def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 10 } } }), A.token);
    const b2 = await t.post('/owner/promotions', b2g1({ priority: 1 }), A.token);
    const items = [{ productId: p, qty: 3 }];
    // best savings: 1 free item (100) beats 10% of 300 (30); the shopper never gets both on the same product
    let qt = await t.post(`/stores/${A.slug}/quote`, { items });
    assert.equal(qt.body.promoDiscount, 100); assert.equal(qt.body.promotions.length, 1);
    // priority mode: the higher-priority 10% wins even though it saves less
    assert.equal((await t.put('/owner/promotions/settings', { resolution: 'priority' }, A.token)).status, 200);
    qt = await t.post(`/stores/${A.slug}/quote`, { items });
    assert.equal(qt.body.promoDiscount, 30, 'priority 5 beats priority 1');
    // changing the priority changes the winner
    assert.equal((await t.put(`/owner/promotions/${b2.body.offer.id}`, { ...b2g1({ priority: 9 }) }, A.token)).status, 200);
    qt = await t.post(`/stores/${A.slug}/quote`, { items });
    assert.equal(qt.body.promoDiscount, 100);
    // coupon on top of the winner: applies to what is left, total reconciles, nothing is discounted twice
    qt = await t.post(`/stores/${A.slug}/quote`, { items, coupon: 'TEN' });
    assert.equal(qt.body.promoDiscount, 100); assert.equal(qt.body.couponDiscount, 20);
    assert.equal(qt.body.subtotal - qt.body.discount + qt.body.shipping, qt.body.total);
    assert.ok(qt.body.discount <= qt.body.subtotal);
    // an offer edited while it is in a cart: the stale total is refused, the new one is accepted
    const before = (await t.post(`/stores/${A.slug}/quote`, { items })).body.total;
    await t.put(`/owner/promotions/${b2.body.offer.id}`, { ...b2g1({ priority: 9, def: { qualify: { all: true }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_mode: 'percent', reward_value: 50 } } }) }, A.token);
    const stale = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: before });
    assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'price_changed');
    const fresh = (await t.post(`/stores/${A.slug}/quote`, { items })).body.total;
    assert.notEqual(fresh, before);
    // paused while in the cart
    await t.patch(`/owner/promotions/${b2.body.offer.id}/status`, { status: 'paused' }, A.token);
    await t.patch(`/owner/promotions/${pct.body.offer.id}/status`, { status: 'paused' }, A.token);
    const gone = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: fresh });
    assert.equal(gone.status, 409, 'a paused offer can no longer be honoured at the old price');
    const plain = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, expectedTotal: 350 });
    assert.equal(plain.status, 201, JSON.stringify(plain.body));
    assert.equal(t.q.get('SELECT promo_discount FROM orders WHERE number=?', [plain.body.order.number]).promo_discount, 0);
  } finally { t.server.close(); }
});

test('inventory under competition: concurrent orders never oversell a product or a gift, and stock never goes negative', async () => {
  const t = await setup();
  try {
    const A = t.mk('cc', 'CC1');
    const main = A.prod(1, 100, 3); const gift = A.prod(2, 40, 1);
    const g = await t.post('/owner/promotions', { name_ar: 'هدية', type: 'gift', status: 'active', def: { qualify: { all: false, products: [main] }, when: { logic: 'and', items: [{ kind: 'min_qty', value: 1, scope: 'qualifying' }] }, effect: { kind: 'gift', gifts: [gift] } } }, A.token);
    assert.equal(g.status, 201);
    const go = () => t.post(`/stores/${A.slug}/orders`, { ...customer, items: [{ productId: main, qty: 1 }] });
    const results = await Promise.all([go(), go(), go(), go(), go()]);
    assert.equal(results.filter((r) => r.status === 201).length, 3, 'only 3 units exist');
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [main]), 0);
    assert.equal(t.q.val('SELECT stock FROM products WHERE id=?', [gift]), 0, 'the single gift was handed out once');
    assert.equal(t.q.val('SELECT COUNT(*) FROM order_items WHERE product_id=? AND is_gift=1', [gift]), 1);
    assert.ok(t.q.val('SELECT MIN(stock) FROM products WHERE store_id=?', [A.storeId]) >= 0);
    // no eligibility, no gift: the gift product alone never comes free
    t.q.run('UPDATE products SET stock=5 WHERE id=?', [gift]);
    const solo = await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: gift, qty: 1 }] });
    assert.equal(solo.body.lines.filter((l) => l.gift).length, 0); assert.equal(solo.body.subtotal, 40);
  } finally { t.server.close(); }
});

test('refunds reconcile with the order snapshot: coupon + offer, bundles, odd rounding, and every unit returned equals what was paid', async () => {
  const t = await setup();
  try {
    const A = t.mk('rf', 'RF1');
    t.insert('offers', { store_id: A.storeId, type: 'percentage', code: 'TEN', title_ar: 'خصم', title_en: 'Off', value: 10, min_subtotal: 0, active: 1 });
    const a = A.prod(1, 333, 20); const b = A.prod(2, 177, 20); const c = A.prod(3, 91, 20);
    await t.post('/owner/promotions', offer({ type: 'percentage', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 17 } } }), A.token);
    const items = [{ productId: a, qty: 3 }, { productId: b, qty: 2 }, { productId: c, qty: 1 }];
    const qt = await t.post(`/stores/${A.slug}/quote`, { items, coupon: 'TEN' });
    const ord = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, coupon: 'TEN', expectedTotal: qt.body.total });
    assert.equal(ord.status, 201, JSON.stringify(ord.body));
    const o = t.q.get('SELECT * FROM orders WHERE number=?', [ord.body.order.number]);
    assert.equal(o.subtotal - o.discount + o.shipping, o.total);
    assert.equal(o.promo_discount + qt.body.couponDiscount, o.discount, 'promotion and coupon discounts are recorded separately');
    deliver(t, o.number);
    const rows = t.q.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [o.id]);
    let refunded = 0;
    // one unit at a time, in a mixed order, until everything is back
    for (const line of [rows[0], rows[1], rows[0], rows[2], rows[1], rows[0]]) {
      const r = await t.post(`/owner/orders/${o.id}/returns`, { items: [{ itemId: line.id, qty: 1 }] }, A.token);
      assert.equal(r.status, 201, JSON.stringify(r.body)); assert.ok(Number.isInteger(r.body.refund) && r.body.refund > 0);
      refunded += r.body.refund;
    }
    assert.equal(refunded, o.subtotal - o.discount, 'returning everything refunds exactly the items part of what was paid, coupon and offer included');
    const detail = await t.get(`/owner/orders/${o.id}`, A.token);
    assert.equal(detail.body.order.total, o.total, 'the historical order total is never rewritten');
    assert.equal(t.q.get('SELECT total, discount, promo_discount FROM orders WHERE id=?', [o.id]).discount, o.discount);

    // fixed-price bundle: returning every piece refunds exactly the bundle price
    const B = t.mk('rf2', 'RF2'); const s1 = B.prod(1, 400, 5); const s2 = B.prod(2, 300, 5); const s3 = B.prod(3, 250, 5);
    const bun = await t.post('/owner/promotions', { name_ar: 'باقة', type: 'bundle', status: 'active', def: { qualify: { all: false, products: [s1, s2, s3] }, effect: { kind: 'bundle', price: 700, slots: [{ sel: { all: false, products: [s1], categories: [] }, qty: 1 }, { sel: { all: false, products: [s2], categories: [] }, qty: 1 }, { sel: { all: false, products: [s3], categories: [] }, qty: 1 }] } } }, B.token);
    assert.equal(bun.status, 201, JSON.stringify(bun.body));
    const bi = [{ productId: s1, qty: 1 }, { productId: s2, qty: 1 }, { productId: s3, qty: 1 }];
    const bq = await t.post(`/stores/${B.slug}/quote`, { items: bi });
    assert.equal(bq.body.promoDiscount, 250);
    const bo = await t.post(`/stores/${B.slug}/orders`, { ...customer, items: bi, expectedTotal: bq.body.total });
    assert.equal(bo.status, 201);
    const border = t.q.get('SELECT * FROM orders WHERE number=?', [bo.body.order.number]); deliver(t, border.number);
    const brows = t.q.all('SELECT * FROM order_items WHERE order_id=?', [border.id]);
    const rr = await t.post(`/owner/orders/${border.id}/returns`, { items: brows.map((r) => ({ itemId: r.id, qty: 1 })) }, B.token);
    assert.equal(rr.body.refund, 700);
  } finally { t.server.close(); }
});

test('multi-store isolation across every promotion endpoint, including analytics, history, previews and images', async () => {
  const t = await setup();
  try {
    const A = t.mk('iso1', 'IS1'); const B = t.mk('iso2', 'IS2');
    const pa = A.prod(1, 100, 9); const pb = B.prod(1, 100, 9);
    const oa = await t.post('/owner/promotions', b2g1({ name_ar: 'عرض المحل أ' }), A.token);
    await t.post(`/stores/${A.slug}/orders`, { ...customer, items: [{ productId: pa, qty: 3 }] });
    await t.post(`/stores/${A.slug}/promotions/${oa.body.offer.id}/view`, {});
    // B sees none of A's numbers, names or history
    const an = await t.get('/owner/promotions/analytics?days=30', B.token);
    assert.equal(an.status, 200); assert.equal(an.body.items.length, 0); assert.equal(an.body.totals.orders, 0); assert.equal(an.body.totals.views, 0);
    const hs = await t.get(`/owner/promotions/history?promotionId=${oa.body.offer.id}`, B.token);
    assert.equal(hs.body.items.length, 0);
    assert.equal((await t.get('/owner/promotions/history', B.token)).body.items.length, 0);
    assert.equal((await t.get('/owner/promotions', B.token)).body.items.length, 0);
    assert.equal((await t.get('/owner/promotions/stats', B.token)).body.counts.total, 0);
    const search = await t.get('/owner/promotions/products/search?q=', B.token);
    assert.ok(JSON.stringify(search.body).indexOf(`"id":${pa},`) === -1, "A's product is not searchable by B");
    // B cannot price or preview with A's product
    const prev = await t.post('/owner/promotions/preview', { offer: b2g1(), cart: [{ productId: pa, qty: 3 }] }, B.token);
    assert.equal(prev.status, 200); assert.equal(prev.body.lines.length, 0); assert.equal(prev.body.discount, 0);
    // A's offer id on B's storefront does nothing and never counts
    assert.equal((await t.post(`/stores/${B.slug}/promotions/${oa.body.offer.id}/view`, {})).body.ok, false);
    // B cannot attach A's product via bulk, form, or definition; A's offer is untouched
    const ob = await t.post('/owner/promotions', b2g1({ name_ar: 'عرض المحل ب' }), B.token);
    assert.ok((await t.post('/owner/promotions/bulk-assign', { promotionIds: [ob.body.offer.id], productIds: [pa], mode: 'add' }, B.token)).status >= 400 || t.q.val('SELECT COUNT(*) FROM promotion_products WHERE promotion_id=? AND product_id=?', [ob.body.offer.id, pa]) === 0);
    assert.equal((await t.put(`/owner/promotions/for-product/${pa}`, { add: [ob.body.offer.id] }, B.token)).status, 404);
    // images: B cannot use A's uploaded media as its offer image
    const mediaA = t.insert('media', { store_id: A.storeId, kind: 'product', key: 'k-a', width: 10, height: 10, sizes: '[]', original_ext: 'webp' });
    const stolen = await t.post('/owner/promotions', b2g1({ image_mode: 'custom', image_media_id: mediaA }), B.token);
    assert.ok(stolen.status >= 400 && stolen.status < 500, `status ${stolen.status}`);
    const stolen2 = await t.post('/owner/promotions/validate', { ...b2g1({ image_mode: 'custom', image_media_id: mediaA }) }, B.token);
    assert.ok(stolen2.status >= 400 || !stolen2.body.imageResolved?.url, 'validate never reveals another store\'s image');
    // an offer's usage/price never leak across stores at checkout
    const qB = await t.post(`/stores/${B.slug}/quote`, { items: [{ productId: pb, qty: 3 }] });
    assert.equal(qB.body.promoDiscount, 100, "B uses only B's offer");
    assert.equal(qB.body.promotions.every((x) => x.id === ob.body.offer.id), true);
    // marketplace cart: each store only gets its own offers
    const fee = await t.post('/marketplace/delivery-fee', { governorate: customer.governorate, city: customer.city, stores: [{ slug: A.slug, items: [{ productId: pa, qty: 3 }] }, { slug: B.slug, items: [{ productId: pb, qty: 1 }] }] });
    assert.equal(fee.status, 200);
    const mq = await t.post('/marketplace/orders', { ...customer, stores: [{ slug: A.slug, items: [{ productId: pa, qty: 3 }] }, { slug: B.slug, items: [{ productId: pb, qty: 1 }] }], expectedShipping: fee.body.fee });
    assert.equal(mq.status, 201, JSON.stringify(mq.body));
    const sa = t.q.all('SELECT * FROM orders WHERE store_id=? ORDER BY id DESC', [A.storeId])[0]; const sb = t.q.all('SELECT * FROM orders WHERE store_id=? ORDER BY id DESC', [B.storeId])[0];
    assert.equal(sa.promo_discount, 100); assert.equal(sb.promo_discount, 0, 'B bought one item: no B2G1');
  } finally { t.server.close(); }
});

test('money: every quote and order reconciles to the piaster across random carts, offers and coupons', async () => {
  const t = await setup();
  try {
    const A = t.mk('mn', 'MN1');
    t.insert('offers', { store_id: A.storeId, type: 'fixed', code: 'FIX', title_ar: 'خصم', title_en: 'Off', value: 37, min_subtotal: 0, active: 1 });
    const prods = [33, 101, 17, 249, 59, 5].map((pr, i) => A.prod(i + 1, pr, 500));
    const o1 = await t.post('/owner/promotions', offer({ type: 'percentage', stacking: 'stackable', def: { qualify: { all: true }, effect: { kind: 'percent_off', percent: 13 } } }), A.token);
    const o2 = await t.post('/owner/promotions', b2g1({ stacking: 'stackable' }), A.token);
    const o3 = await t.post('/owner/promotions', { name_ar: 'سعر ثابت', type: 'group_price', status: 'active', stacking: 'stackable', def: { qualify: { all: true }, effect: { kind: 'group_price', qty: 3, price: 77, pick: 'most_expensive' } } }, A.token);
    assert.ok([o1, o2, o3].every((r) => r.status === 201), JSON.stringify([o1.body, o2.body, o3.body]));
    let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 40; i++) {
      const items = [...new Set(Array.from({ length: 1 + rnd(4) }, () => prods[rnd(prods.length)]))].map((productId) => ({ productId, qty: 1 + rnd(7) }));
      const coupon = rnd(2) ? 'FIX' : undefined;
      const qt = await t.post(`/stores/${A.slug}/quote`, { items, coupon });
      assert.equal(qt.status, 200, JSON.stringify(qt.body));
      const b = qt.body;
      for (const k of ['subtotal', 'discount', 'promoDiscount', 'couponDiscount', 'shipping', 'total']) assert.ok(Number.isInteger(b[k]) && b[k] >= 0, `${k}=${b[k]}`);
      assert.equal(b.promoDiscount + b.couponDiscount, b.discount);
      assert.ok(b.discount <= b.subtotal, 'never discounts more than the goods');
      assert.equal(b.subtotal - b.discount + b.shipping, b.total);
      assert.equal(b.lines.reduce((s, l) => s + (l.promoDiscount || 0), 0), b.promoDiscount, 'line shares add up exactly');
      const ord = await t.post(`/stores/${A.slug}/orders`, { ...customer, items, coupon, expectedTotal: b.total });
      assert.equal(ord.status, 201, JSON.stringify(ord.body));
      const o = t.q.get('SELECT * FROM orders WHERE number=?', [ord.body.order.number]);
      assert.equal(o.total, b.total); assert.equal(o.promo_discount, b.promoDiscount); assert.equal(o.subtotal - o.discount + o.shipping, o.total);
      assert.equal(t.q.val('SELECT COALESCE(SUM(promo_discount),0) FROM order_items WHERE order_id=?', [o.id]), o.promo_discount);
      assert.equal(t.q.val('SELECT COALESCE(SUM(discount),0) FROM order_promotions WHERE order_id=?', [o.id]), o.promo_discount);
    }
    assert.ok(t.q.val('SELECT MIN(stock) FROM products WHERE store_id=?', [A.storeId]) >= 0);
  } finally { t.server.close(); }
});

test('hostile input: mass assignment, injection strings, odd ids, and view-count inflation', async () => {
  const t = await setup();
  try {
    const A = t.mk('hx', 'HX1'); const B = t.mk('hx2', 'HX2'); const p = A.prod(1, 100, 9);
    // mass assignment: ownership, counters and ids come from the server, never from the body
    const r = await t.post('/owner/promotions', { ...offer(), store_id: B.storeId, id: 9999, created_at: '2001-01-01', usage_count: 77, promo_resolution: 'x' }, A.token);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = t.q.get('SELECT * FROM promotions WHERE id=?', [r.body.offer.id]);
    assert.equal(row.store_id, A.storeId); assert.notEqual(row.id, 9999); assert.notEqual(row.created_at, '2001-01-01');
    assert.equal((await t.get('/owner/promotions', B.token)).body.items.length, 0);
    const up = await t.put(`/owner/promotions/${row.id}`, { ...offer(), store_id: B.storeId }, A.token);
    assert.equal(t.q.val('SELECT store_id FROM promotions WHERE id=?', [row.id]), A.storeId, up.status.toString());
    // injection-looking input is treated as plain text / rejected, and nothing is dropped
    const evil = "' OR 1=1; DROP TABLE promotions; --";
    for (const u of [`/owner/promotions?q=${encodeURIComponent(evil)}`, `/owner/promotions/products/search?q=${encodeURIComponent(evil)}`, `/owner/promotions/history?promotionId=${encodeURIComponent('1 OR 1=1')}`, '/owner/promotions/analytics?days=abc', `/owner/promotions/${encodeURIComponent('1 OR 1=1')}`, '/owner/promotions/-5', '/owner/promotions/1e999']) {
      const g = await t.get(u, A.token); assert.ok(g.status < 500, `${u} -> ${g.status}`);
    }
    assert.ok(t.q.val('SELECT COUNT(*) FROM promotions') >= 1, 'table still there');
    assert.equal((await t.post('/owner/promotions', offer({ name_ar: evil }), A.token)).status, 201);
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: p, qty: 1 }], coupon: evil })).status < 500, true);
    assert.equal((await t.post(`/stores/${A.slug}/quote`, { items: [{ productId: `${p} OR 1=1`, qty: 1 }] })).status >= 400, true);
    // views: only live offers count, and one visitor cannot inflate the number by repeating the call
    const live = r.body.offer.id;
    const draft = await t.post('/owner/promotions', offer({ status: 'draft' }), A.token);
    for (let i = 0; i < 25; i++) await t.post(`/stores/${A.slug}/promotions/${live}/view`, {});
    assert.equal((await t.post(`/stores/${A.slug}/promotions/${draft.body.offer.id}/view`, {})).body.ok, false);
    assert.equal(t.q.val('SELECT COALESCE(SUM(views),0) FROM promotion_views WHERE promotion_id=?', [live]), 1);
    assert.equal(t.q.val('SELECT COALESCE(SUM(views),0) FROM promotion_views WHERE promotion_id=?', [draft.body.offer.id]), 0);
    // errors do not leak internals
    const bad = await t.post('/owner/promotions', { name_ar: 'x', def: 'nope' }, A.token);
    assert.ok(bad.status === 400 || bad.status === 422); assert.equal(JSON.stringify(bad.body).includes('node_modules'), false);
  } finally { t.server.close(); }
});
