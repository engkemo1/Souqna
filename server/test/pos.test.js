import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-pos-'));
process.env.DB_FILE = path.join(tmp, 'test.db');

const { q, db } = await import('../src/db/index.js');
const express = (await import('express')).default;
const { errorHandler } = await import('../src/lib/errors.js');
const { signToken } = await import('../src/lib/auth.js');
const access = await import('../src/lib/cashier-access.js');
const { default: posRoutes } = await import('../src/routes/pos.js');

let storeA; let storeB; let server; let base; let tokA; let tokB; let shirt; let bag; let m; let l;

before(async () => {
  q.run("INSERT INTO users(name,email,password_hash) VALUES('Ali','a@x.com','x')");
  q.run("INSERT INTO users(name,email,password_hash) VALUES('Bob','b@x.com','x')");
  const mk = (owner, slug) => Number(q.run('INSERT INTO stores(owner_id,slug,code,name_ar,name_en) VALUES(?,?,?,?,?)', [owner, slug, slug, slug, slug]).lastInsertRowid);
  storeA = mk(1, 'a'); storeB = mk(2, 'b');
  const prod = (store, slug, stock, price = 100) => Number(q.run('INSERT INTO products(store_id,slug,name_ar,name_en,price,stock) VALUES(?,?,?,?,?,?)', [store, slug, slug, slug, price, stock]).lastInsertRowid);
  const variant = (pid, color, size, stock) => Number(q.run('INSERT INTO variants(product_id,color,size,stock) VALUES(?,?,?,?)', [pid, color, size, stock]).lastInsertRowid);
  shirt = prod(storeA, 'shirt', 5, 200); m = variant(shirt, 'red', 'M', 2); l = variant(shirt, 'red', 'L', 3);
  bag = prod(storeA, 'bag', 4, 50);
  prod(storeB, 'other', 9);
  tokA = signToken({ id: 1 }); tokB = signToken({ id: 2 });
  q.run("INSERT INTO app_settings(key,value) VALUES('cashier_sync_enabled','1') ON CONFLICT(key) DO UPDATE SET value='1'");
  q.run("INSERT INTO store_cashier_links(store_id,cashier_id,status) VALUES(?,'twist','active')", [storeA]);
  q.run("INSERT INTO store_cashier_links(store_id,cashier_id,status) VALUES(?,'loyverse','active')", [storeB]);
  const app = express(); app.use(express.json()); app.use('/api/pos', posRoutes); app.use(errorHandler);
  server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const call = async (p, { tok = tokA, body, method } = {}) => {
  const res = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};
const now = () => new Date().toISOString();
let n = 0;
const sale = (over = {}) => ({ uuid: `u-${++n}-${Math.random().toString(36).slice(2)}`, createdAt: now(), items: [{ productId: bag, qty: 1, price: 50 }], payments: [{ method: 'cash', amount: 50 }], ...over });
const stockOf = (id, t = 'variants') => q.val(`SELECT stock FROM ${t} WHERE id=?`, [id]);

test('bootstrap lists products with variants and the next number', async () => {
  const { status, json } = await call('/api/pos/bootstrap');
  assert.equal(status, 200);
  assert.equal(json.nextNumber, 1);
  const s = json.products.find((p) => p.id === shirt);
  assert.equal(s.variants.length, 2);
  assert.equal(json.products.length, 2); // store B's product never leaks
});

test('a sale deducts stock, numbers the invoice, and a retry with the same uuid does nothing', async () => {
  const body = sale({ items: [{ productId: shirt, variantId: m, qty: 1, price: 200 }, { productId: bag, qty: 2, price: 50 }], discount: 30, payments: [{ method: 'cash', amount: 300 }], localNo: 'L-1' });
  const a = await call('/api/pos/sales', { body });
  assert.equal(a.status, 200);
  assert.equal(a.json.number, 1);
  assert.equal(a.json.subtotal, 300); assert.equal(a.json.total, 270); assert.equal(a.json.change, 30);
  assert.equal(stockOf(m), 1); assert.equal(stockOf(bag, 'products'), 2); assert.equal(stockOf(shirt, 'products'), 4);
  const again = await call('/api/pos/sales', { body });
  assert.equal(again.json.duplicate, true); assert.equal(again.json.number, 1);
  assert.equal(stockOf(m), 1); // not deducted twice
  assert.equal(q.val('SELECT COUNT(*) FROM pos_sales WHERE store_id=?', [storeA]), 1);
});

test('stock receipt adds inventory once and rejects reusing its id with changed data', async () => {
  const before = stockOf(bag, 'products');
  const body = { uuid: 'receive-stock-001', productId: bag, quantity: 3, note: 'توريد صباحي' };
  const first = await call('/api/pos/stock/receive', { body });
  assert.equal(first.status, 201);
  assert.equal(stockOf(bag, 'products'), before + 3);
  const retry = await call('/api/pos/stock/receive', { body });
  assert.equal(retry.status, 201);
  assert.equal(retry.json.movement.duplicate, true);
  assert.equal(stockOf(bag, 'products'), before + 3);
  const conflict = await call('/api/pos/stock/receive', { body: { ...body, quantity: 4 } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, 'stock_receipt_key_reused');
  assert.equal(stockOf(bag, 'products'), before + 3);
});

test('payments record only what stayed in the drawer (change is taken out of cash)', async () => {
  const sum = q.val('SELECT SUM(amount) FROM pos_payments');
  assert.equal(sum, 270);
});

test('overselling never makes stock negative and is flagged', async () => {
  const r = await call('/api/pos/sales', { body: sale({ items: [{ productId: shirt, variantId: m, qty: 5, price: 200 }], payments: [{ method: 'cash', amount: 1000 }] }) });
  assert.equal(r.status, 200);
  assert.equal(stockOf(m), 0);
  assert.equal(r.json.items[0].oversold, 1);
});

test('rules: variant required, unknown product, underpaid, other store product', async () => {
  assert.equal((await call('/api/pos/sales', { body: sale({ items: [{ productId: shirt, qty: 1, price: 200 }], payments: [{ method: 'cash', amount: 200 }] }) })).json.error.code, 'variant_required');
  assert.equal((await call('/api/pos/sales', { body: sale({ items: [{ productId: 99999, qty: 1, price: 1 }] }) })).json.error.code, 'unknown_product');
  assert.equal((await call('/api/pos/sales', { body: sale({ payments: [{ method: 'cash', amount: 10 }] }) })).json.error.code, 'underpaid');
});

test('a failed sale leaves no half-saved invoice or stock change', async () => {
  const before = stockOf(bag, 'products');
  const r = await call('/api/pos/sales', { body: sale({ items: [{ productId: bag, qty: 1, price: 50 }, { productId: 99999, qty: 1, price: 1 }] }) });
  assert.equal(r.status, 422);
  assert.equal(stockOf(bag, 'products'), before);
});

test('a sale cannot repeat the same product variant in multiple lines', async () => {
  const before = stockOf(bag, 'products');
  const r = await call('/api/pos/sales', { body: sale({ items: [{ productId: bag, qty: 1, price: 50 }, { productId: bag, qty: 1, price: 50 }] }) });
  assert.equal(r.status, 422);
  assert.equal(r.json.error.code, 'duplicate_sale_line');
  assert.equal(stockOf(bag, 'products'), before);
});

test('a fully discounted invoice can be saved without a payment method', async () => {
  const r = await call('/api/pos/sales', { body: sale({ discount: 50, payments: [] }) });
  assert.equal(r.status, 200);
  assert.equal(r.json.total, 0);
  assert.equal(r.json.paid, 0);
  assert.deepEqual(r.json.payments, []);
});

test('returns: restock, share of discount refunded, cannot exceed what was sold', async () => {
  const s = (await call('/api/pos/sales', { body: sale({ items: [{ productId: bag, qty: 2, price: 50 }], discount: 10, payments: [{ method: 'cash', amount: 90 }] }) })).json;
  const before = stockOf(bag, 'products');
  const item = s.items[0].id;
  const ret = await call('/api/pos/returns', { body: { uuid: 'return-uuid-1', saleId: s.id, items: [{ saleItemId: item, qty: 1 }], method: 'cash' } });
  assert.equal(ret.status, 200, JSON.stringify(ret.json));
  assert.equal(ret.json.refund, 45); // 50 minus half of the 10 discount
  assert.equal(stockOf(bag, 'products'), before + 1);
  const dup = await call('/api/pos/returns', { body: { uuid: 'return-uuid-1', saleId: s.id, items: [{ saleItemId: item, qty: 1 }] } });
  assert.equal(dup.json.duplicate, true); assert.equal(stockOf(bag, 'products'), before + 1);
  const tooMany = await call('/api/pos/returns', { body: { uuid: 'return-uuid-2', saleId: s.id, items: [{ saleItemId: item, qty: 2 }] } });
  assert.equal(tooMany.json.error.code, 'too_many');
  const duplicateLine = await call('/api/pos/returns', { body: { uuid: 'return-uuid-3', saleId: s.id, items: [{ saleItemId: item, qty: 1 }, { saleItemId: item, qty: 1 }] } });
  assert.equal(duplicateLine.status, 422);
  assert.equal(duplicateLine.json.error.code, 'duplicate_return_item');
  assert.equal(stockOf(bag, 'products'), before + 1);
});

test('return policy is saved on the invoice and defective items bypass it without restocking', async () => {
  q.run('UPDATE stores SET return_days=0 WHERE id=?', [storeA]);
  q.run('UPDATE products SET no_return=1 WHERE id=?', [bag]);
  const s = (await call('/api/pos/sales', { body: sale() })).json;
  q.run('UPDATE stores SET return_days=3 WHERE id=?', [storeA]);
  q.run('UPDATE products SET no_return=0 WHERE id=?', [bag]);
  assert.equal(s.items[0].noReturn, 1);
  assert.equal(s.items[0].returnUntil, new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(s.createdAt)));
  const before = stockOf(bag, 'products');
  const rejected = await call('/api/pos/returns', { body: { uuid: 'policy-denied-1', saleId: s.id, items: [{ saleItemId: s.items[0].id, qty: 1 }] } });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.json.error.code, 'item_not_returnable');
  const defective = await call('/api/pos/returns', { body: { uuid: 'policy-defective-1', saleId: s.id, items: [{ saleItemId: s.items[0].id, qty: 1, defective: true }] } });
  assert.equal(defective.status, 200);
  assert.equal(stockOf(bag, 'products'), before, 'defective items are never added back to stock');
  assert.equal(defective.json.sale.returns.at(-1).items[0].defective, 1, 'the exception is recorded for audit');
});

test('partial returns distribute pound rounding without refunding more than the sale line', async () => {
  const s = (await call('/api/pos/sales', { body: sale({ items: [{ productId: bag, qty: 3, price: 10, discount: 1 }], payments: [{ method: 'cash', amount: 29 }] }) })).json;
  const item = s.items[0].id;
  const first = await call('/api/pos/returns', { body: { uuid: 'round-return-1', saleId: s.id, items: [{ saleItemId: item, qty: 2 }] } });
  const second = await call('/api/pos/returns', { body: { uuid: 'round-return-2', saleId: s.id, items: [{ saleItemId: item, qty: 1 }] } });
  assert.equal(first.json.refund, 19);
  assert.equal(second.json.refund, 10);
  assert.equal(first.json.refund + second.json.refund, 29);
});

test('invoice discounts are allocated across lines without losing or inventing pounds', async () => {
  const s = (await call('/api/pos/sales', { body: sale({ items: [{ productId: bag, qty: 1, price: 1 }, { productId: shirt, variantId: l, qty: 1, price: 1 }], discount: 1, payments: [{ method: 'cash', amount: 1 }] }) })).json;
  const first = await call('/api/pos/returns', { body: { uuid: 'split-return-1', saleId: s.id, items: [{ saleItemId: s.items[0].id, qty: 1 }] } });
  const second = await call('/api/pos/returns', { body: { uuid: 'split-return-2', saleId: s.id, items: [{ saleItemId: s.items[1].id, qty: 1 }] } });
  assert.equal(first.json.refund + second.json.refund, 1);
});

test("a store cannot see or return another store's invoice", async () => {
  const list = (await call('/api/pos/sales')).json.sales;
  assert.ok(list.length > 0);
  const r = await call(`/api/pos/sales/${list[0].id}`, { tok: tokB });
  assert.equal(r.status, 403); // store B uses another cashier program
  q.run("UPDATE store_cashier_links SET cashier_id='twist' WHERE store_id=?", [storeB]);
  assert.equal((await call(`/api/pos/sales/${list[0].id}`, { tok: tokB })).status, 404);
  q.run("UPDATE store_cashier_links SET cashier_id='loyverse' WHERE store_id=?", [storeB]);
});

test('an invoice can be found by its number, only inside its own store', async () => {
  const r = await call('/api/pos/sales/number/1');
  assert.equal(r.status, 200); assert.equal(r.json.sale.number, 1);
  assert.equal((await call('/api/pos/sales/number/9999')).status, 404);
});

test('day summary adds payments by method and subtracts refunds', async () => {
  const d = (await call('/api/pos/summary')).json;
  assert.ok(d.invoices >= 3);
  const refunds = q.val('SELECT SUM(refund) FROM pos_returns WHERE store_id=?', [storeA]) || 0;
  assert.equal(d.refunds, refunds);
  assert.equal(d.byMethod.cash, q.val("SELECT SUM(amount) FROM pos_payments WHERE method='cash'") - refunds);
  assert.equal((await call('/api/pos/summary?day=2026-99-99')).status, 422);
});

test('expired subscription blocks selling but still accepts offline sales made before the cut-off', async () => {
  const today = access.todayCairo();
  q.run("UPDATE store_cashier_links SET starts_at='2026-01-01', ends_at=?, grace_days=3 WHERE store_id=?", ['2026-01-10', storeA]);
  assert.equal((await call('/api/pos/bootstrap')).json.error.code, 'cashier_expired');
  assert.equal((await call('/api/pos/returns', { body: { uuid: 'return-uuid-x', saleId: 1, items: [{ saleItemId: 1, qty: 1 }] } })).json.error.code, 'cashier_expired');
  const early = await call('/api/pos/sales', { body: sale({ createdAt: '2026-01-11T10:00:00Z' }) });
  assert.equal(early.status, 200, 'made during grace -> accepted');
  const late = await call('/api/pos/sales', { body: sale({ createdAt: '2026-01-20T10:00:00Z' }) });
  assert.equal(late.json.error.code, 'cashier_expired');
  q.run('UPDATE store_cashier_links SET ends_at=NULL WHERE store_id=?', [storeA]);
  assert.ok(today);
});

test('platform switch off blocks everything', async () => {
  q.run("UPDATE app_settings SET value='0' WHERE key='cashier_sync_enabled'");
  assert.equal((await call('/api/pos/bootstrap')).json.error.code, 'cashier_off');
  q.run("UPDATE app_settings SET value='1' WHERE key='cashier_sync_enabled'");
});
