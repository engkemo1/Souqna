import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/lib/pos/engine.js';
import { createMemoryDb } from '../src/lib/pos/db.js';
import { receiptHtml } from '../src/lib/pos/receipt.js';

const products = [
  { id: 1, name: 'قميص قطن', sku: 'SH', barcode: '', price: 200, track: true, stock: 5, variants: [
    { id: 11, color: 'احمر', size: 'M', sku: 'SH-R-M', barcode: '6291000000001', stock: 2 },
    { id: 12, color: 'احمر', size: 'L', sku: 'SH-R-L', barcode: '6291000000002', stock: 3 }] },
  { id: 2, name: 'شنطة', sku: 'BAG-1', barcode: '6291000000099', price: 50, track: true, stock: 4, variants: [] },
  { id: 3, name: 'حزام', sku: 'BAG-1', barcode: '', price: 30, track: false, stock: 0, variants: [] },
];

test('codes: arabic digits, trailing .0, case; duplicates are ambiguous, never guessed', () => {
  const idx = E.buildIndex(products);
  assert.equal(E.lookupCode(idx, '٦٢٩١٠٠٠٠٠٠٠٠١').hit.variant.id, 11);
  assert.equal(E.lookupCode(idx, '6291000000099.0').hit.product.id, 2);
  assert.equal(E.lookupCode(idx, 'sh-r-l').hit.variant.id, 12);
  assert.equal(E.lookupCode(idx, 'bag-1').ambiguous, true);
  assert.equal(E.lookupCode(idx, 'nope'), null);
});

test('search finds by arabic name without hamza/ta-marbuta differences, by size and by code', () => {
  assert.deepEqual(E.searchProducts(products, 'شنطه').map((p) => p.id), [2]);
  assert.deepEqual(E.searchProducts(products, 'قميص M').map((p) => p.id), [1]);
  assert.deepEqual(E.searchProducts(products, '6291000000002').map((p) => p.id), [1]);
});

test('cart totals with line and invoice discounts (amount and percent), never negative', () => {
  let cart = E.addToCart([], products[0], products[0].variants[0]);
  cart = E.addToCart(cart, products[0], products[0].variants[0]);
  cart = E.addToCart(cart, products[1]);
  assert.equal(cart.length, 2); assert.equal(cart[0].qty, 2);
  assert.deepEqual(E.totals(cart), { subtotal: 450, discount: 0, total: 450, pieces: 3 });
  assert.equal(E.totals(cart, { type: 'percent', value: 10 }).total, 405);
  assert.equal(E.totals(cart, { type: 'amount', value: 9999 }).total, 0);
  cart = E.setLineDiscount(cart, cart[0].key, 40);
  assert.equal(E.totals(cart).subtotal, 410);
  assert.equal(E.setQty(cart, cart[1].key, 0).length, 1);
});

test('change only comes out of cash', () => {
  assert.deepEqual(E.settle(270, [{ method: 'cash', amount: 300 }]), { paid: 300, remaining: 0, change: 30, ok: true });
  assert.equal(E.settle(270, [{ method: 'card', amount: 300 }]).change, 0);
  assert.equal(E.settle(270, [{ method: 'card', amount: 200 }, { method: 'cash', amount: 100 }]).change, 30);
  assert.equal(E.settle(270, [{ method: 'cash', amount: 100 }]).remaining, 170);
});

test('buildSale refuses an empty cart or an underpaid invoice and shapes the server body', () => {
  const cart = E.addToCart([], products[1], null, 2);
  assert.throws(() => E.buildSale({ uuid: 'u', localNo: 'D-1', createdAt: 'x', cart: [], discount: { type: 'amount', value: 0 }, payments: [] }), /empty_cart/);
  assert.throws(() => E.buildSale({ uuid: 'u', localNo: 'D-1', createdAt: 'x', cart, discount: { type: 'amount', value: 0 }, payments: [{ method: 'cash', amount: 10 }] }), /underpaid/);
  const s = E.buildSale({ uuid: 'u-1', localNo: 'D-1', createdAt: '2026-10-20T10:00:00Z', cart, discount: { type: 'percent', value: 10 }, payments: [{ method: 'cash', amount: 100 }, { method: 'card', amount: 0 }] });
  assert.deepEqual(s.body.items, [{ productId: 2, variantId: null, qty: 2, price: 50, discount: 0 }]);
  assert.equal(s.body.discount, 10); assert.equal(s.body.payments.length, 1); assert.equal(s.receipt.change, 10);
});

test('optimistic stock lowers variants and plain products, never below zero, skips untracked', () => {
  const next = E.applyLocalStock(products, [{ productId: 1, variantId: 11, qty: 5 }, { productId: 2, variantId: null, qty: 1 }, { productId: 3, variantId: null, qty: 9 }]);
  assert.equal(next[0].variants[0].stock, 0); assert.equal(next[0].stock, 3);
  assert.equal(next[1].stock, 3); assert.equal(next[2].stock, 0);
  assert.equal(products[0].variants[0].stock, 2, 'input not mutated');
  assert.equal(E.applyLocalStock(next, [{ productId: 2, variantId: null, qty: 1 }], +1)[1].stock, 4);
});

test('queue: oldest first, success removes, a refusal is marked failed and the rest go on', async () => {
  const mk = (n, at) => ({ uuid: `s${n}`, state: 'pending', body: { uuid: `s${n}`, createdAt: at } });
  const entries = [mk(3, '2026-10-20T10:03:00Z'), mk(1, '2026-10-20T10:01:00Z'), mk(2, '2026-10-20T10:02:00Z'), { ...mk(0, '2026-10-20T09:00:00Z'), state: 'failed' }];
  const order = []; const marks = [];
  const out = await E.syncQueue({
    entries,
    send: async (b) => { order.push(b.uuid); if (b.uuid === 's2') throw { status: 422, code: 'unknown_product', message: 'gone' }; return { number: order.length }; },
    onResult: async (e, r) => marks.push([e.uuid, r.ok]),
  });
  assert.deepEqual(order, ['s1', 's2', 's3']);
  assert.deepEqual(out.done.map((d) => d.uuid), ['s1', 's3']);
  assert.deepEqual(out.failed.map((f) => f.uuid), ['s2']);
  assert.equal(out.stopped, null);
});

test('queue: a network error or a 401 stops at once and keeps the rest', async () => {
  const entries = ['a', 'b', 'c'].map((n, i) => ({ uuid: n, state: 'pending', body: { uuid: n, createdAt: `2026-10-20T10:0${i}:00Z` } }));
  let calls = 0;
  const net = await E.syncQueue({ entries, send: async () => { calls++; if (calls === 2) throw { status: 0 }; return { number: calls }; } });
  assert.deepEqual([net.done.length, net.stopped, net.left], [1, 'network', 2]);
  const auth = await E.syncQueue({ entries, send: async () => { throw { status: 401 }; } });
  assert.deepEqual([auth.done.length, auth.stopped, auth.left], [0, 'auth', 3]);
});

test('scanner buffer: fast characters + Enter = a scan; slow typing is not', () => {
  const b = E.createScanBuffer();
  let t = 1000; let out;
  for (const ch of '6291000000001') b.push(ch, (t += 10));
  out = b.push('Enter', (t += 10)); assert.equal(out, '6291000000001');
  for (const ch of '62') b.push(ch, (t += 500));
  assert.equal(b.push('Enter', (t += 10)), null);
});

test('memory db keeps sales per store only', async () => {
  const db = createMemoryDb();
  await db.putSale({ uuid: 'x', storeId: 1 }); await db.putSale({ uuid: 'y', storeId: 2 });
  assert.deepEqual((await db.sales(1)).map((s) => s.uuid), ['x']);
  await db.deleteSale('x'); assert.equal((await db.sales(1)).length, 0);
});

test('receipt escapes names, shows the temporary label until numbered', () => {
  const sale = { uuid: 'u', localNo: 'D-7', createdAt: '2026-10-20T10:00:00Z', number: null, items: [{ name: '<b>x</b>', color: '', size: 'M', price: 50, qty: 2, discount: 0 }], subtotal: 100, discount: 10, total: 90, paid: 100, change: 10, payments: [{ method: 'cash', amount: 100 }] };
  const h = receiptHtml({ storeName: 'محل', sale });
  assert.ok(!h.includes('<b>x</b>')); assert.ok(h.includes('فاتورة مؤقتة D-7')); assert.ok(h.includes('أول ما النت يرجع'));
  assert.ok(receiptHtml({ storeName: 'محل', sale: { ...sale, number: 12 } }).includes('فاتورة رقم 12'));
});
