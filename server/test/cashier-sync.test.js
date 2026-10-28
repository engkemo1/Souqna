import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-cashier-'));
process.env.DB_FILE = path.join(tmp, 'test.db');

const { q, db } = await import('../src/db/index.js');
const express = (await import('express')).default;
const { errorHandler } = await import('../src/lib/errors.js');
const { readTable, guessMapping, parseQty, normCode } = await import('../src/lib/cashier-table.js');
const sync = await import('../src/lib/cashier-sync.js');
const access = await import('../src/lib/cashier-access.js');
const { default: cashierRoutes } = await import('../src/routes/cashier.js');
const { mountCashierAdmin } = await import('../src/routes/admin-cashier.js');

let storeA; let storeB; let server; let base;

before(async () => {
  q.run("INSERT INTO users(name,email,password_hash) VALUES('o','o@x.com','x')");
  const mk = (slug) => Number(q.run('INSERT INTO stores(owner_id,slug,code,name_ar,name_en) VALUES(1,?,?,?,?)', [slug, slug, slug, slug]).lastInsertRowid);
  storeA = mk('a'); storeB = mk('b');
  const prod = (store, slug, sku, stock, barcode = null) => Number(q.run('INSERT INTO products(store_id,slug,name_ar,name_en,price,sku,stock,barcode) VALUES(?,?,?,?,100,?,?,?)', [store, slug, slug, slug, sku, stock, barcode]).lastInsertRowid);
  const variant = (pid, sku, color, size, stock, barcode = null) => Number(q.run('INSERT INTO variants(product_id,sku,color,size,stock,barcode) VALUES(?,?,?,?,?,?)', [pid, sku, color, size, stock, barcode]).lastInsertRowid);
  const shirt = prod(storeA, 'shirt', 'SH', 7);
  variant(shirt, 'SH-R-M', 'red', 'M', 3); variant(shirt, 'SH-R-L', 'red', 'L', 4, '6291000000001');
  prod(storeA, 'bag', 'BAG-1', 9, '6291000000099');
  const other = prod(storeB, 'other', 'SH', 5); variant(other, 'SH-R-M', 'red', 'M', 5); // same codes in another store must never be touched

  const app = express();
  app.use(express.json());
  app.use('/api/cashier/v1', cashierRoutes);
  const admin = express.Router(); mountCashierAdmin(admin); app.use('/admin', admin);
  app.use(errorHandler);
  server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const stockOf = (sku, store = storeA) => q.val('SELECT v.stock FROM variants v JOIN products p ON p.id=v.product_id WHERE v.sku=? AND p.store_id=?', [sku, store]);
const call = async (p, { key, body, method = 'POST' } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};

test('reads CSV with BOM, semicolons and Arabic digits, and guesses Arabic headers', async () => {
  const buf = Buffer.from('﻿كود الصنف;الباركود;الكمية\n"A-1";6291041500213;٥\n', 'utf8');
  const t = await readTable(buf, 'x.csv');
  assert.deepEqual(t.rows[0], ['A-1', '6291041500213', '٥']);
  const m = guessMapping(t.headers);
  assert.equal(m.sku, 0); assert.equal(m.barcode, 1); assert.equal(m.stock, 2);
  assert.equal(parseQty('٥'), 5); assert.equal(parseQty('1,200'), 1200); assert.equal(normCode('123.0'), '123');
});

test('reads old Arabic Windows (windows-1256) CSV', async () => {
  const ar = new Uint8Array([0xC7, 0xE1, 0xDF, 0xE3, 0xED, 0xC9]); // "الكمية" in windows-1256
  const buf = Buffer.concat([Buffer.from(ar), Buffer.from('\nSH-R-M\n')]);
  const t = await readTable(buf, 'old.csv');
  assert.equal(t.headers[0], 'الكمية');
});

test('reads .xlsx', async () => {
  let writeXlsxFile; try { ({ default: writeXlsxFile } = await import('write-excel-file/node')); } catch { return; }
  const out = await writeXlsxFile([[{ value: 'SKU' }, { value: 'Qty' }], [{ value: 'SH-R-M' }, { value: 3, type: Number }]], { buffer: true });
  const buf = Buffer.isBuffer(out) ? out : await out.toBuffer();
  const t = await readTable(buf, 'f.xlsx');
  assert.deepEqual(t.headers, ['SKU', 'Qty']); assert.deepEqual(t.rows[0], ['SH-R-M', '3']);
});

test('import plan: matches by sku/barcode, flags the rest, never touches other stores', () => {
  const rows = [
    ['SH-R-M', '', '10'],          // update variant by sku
    ['', '6291000000001', '٢'],     // update variant by barcode
    ['BAG-1', '', '4'],            // product without variants
    ['SH', '', '1'],               // product that has variants -> must choose a variant
    ['NOPE', '', '1'],             // unknown
    ['SH-R-L', '', '-3'],          // same variant as the barcode row above -> skipped, never applied twice
    ['DUP', '', '1'], ['DUP', '', '2'],
    ['BAG-X', '', 'abc'],
  ];
  const plan = sync.planImport(storeA, rows, { sku: 0, barcode: 1, stock: 2 });
  const reasons = Object.fromEntries(plan.skipped.map((s) => [s.line, s.reason]));
  assert.equal(plan.changes.find((c) => c.name === 'shirt' && c.size === 'M').to, 10);
  assert.equal(plan.changes.find((c) => c.name === 'bag').to, 4);
  assert.equal(reasons[5], 'has_variants'); assert.equal(reasons[6], 'not_found');
  assert.equal(reasons[7], 'duplicate_in_file'); // SH-R-L (sku) and its barcode row are the same variant
  assert.equal(reasons[8], 'duplicate_in_file'); assert.equal(reasons[9], 'duplicate_in_file');
  assert.equal(reasons[10], 'bad_quantity');
});

test('matching both a barcode and SKU that point to different items is rejected safely', () => {
  const otherId = Number(q.run("INSERT INTO products(store_id,slug,name_ar,name_en,price,sku,stock) VALUES(?,?,?,?,100,?,?)", [storeA, 'sku-conflict', 'conflict', 'conflict', 'CROSS-1', 3]).lastInsertRowid);
  const bagBefore = q.val("SELECT stock FROM products WHERE store_id=? AND slug='bag'", [storeA]);
  const p = sync.planImport(storeA, [['CROSS-1', '6291000000099', '1']], { sku: 0, barcode: 1, stock: 2 });
  assert.equal(p.changes.length, 0);
  assert.equal(p.skipped[0].reason, 'conflicting_codes');
  const api = sync.pushStock(storeA, [{ sku: 'CROSS-1', barcode: '6291000000099', stock: 1 }]);
  assert.equal(api.results[0].status, 'conflicting_codes');
  assert.equal(q.val('SELECT stock FROM products WHERE id=?', [otherId]), 3);
  assert.equal(q.val("SELECT stock FROM products WHERE store_id=? AND slug='bag'", [storeA]), bagBefore);
});

test('absolute stock updates cannot silently overwrite the same item twice in one request', () => {
  const body = q.get("SELECT sku, barcode FROM products WHERE store_id=? AND slug='bag'", [storeA]);
  const result = sync.pushStock(storeA, [{ sku: body.sku, stock: 2 }, { barcode: body.barcode, stock: 7 }]);
  assert.deepEqual(result.results.map((r) => r.status), ['updated', 'duplicate_in_request']);
  assert.equal(q.val("SELECT stock FROM products WHERE store_id=? AND slug='bag'", [storeA]), 2);
});

test('apply writes absolute stock, recomputes product total, logs it, and is repeatable', () => {
  const rows = [['SH-R-M', '', '10'], ['SH-R-L', '', '2'], ['BAG-1', '', '4']];
  const plan = sync.planImport(storeA, rows, { sku: 0, barcode: 1, stock: 2 });
  sync.applyPlan(storeA, plan, { source: 'file', message: 'a.csv' });
  assert.equal(stockOf('SH-R-M'), 10); assert.equal(stockOf('SH-R-L'), 2);
  assert.equal(q.val("SELECT stock FROM products WHERE slug='shirt' AND store_id=?", [storeA]), 12);
  assert.equal(q.val("SELECT stock FROM products WHERE slug='bag' AND store_id=?", [storeA]), 4);
  assert.equal(stockOf('SH-R-M', storeB), 5);
  const again = sync.planImport(storeA, rows, { sku: 0, barcode: 1, stock: 2 });
  assert.equal(again.changes.length, 0); assert.equal(again.unchanged, 3);
  assert.equal(sync.readLog(storeA)[0].updated, 3);
});

test('learns a barcode when a row matches by sku and the variant has none', () => {
  const plan = sync.planImport(storeA, [['SH-R-M', '6291000000777', '10']], { sku: 0, barcode: 1, stock: 2 });
  assert.equal(plan.learn.length, 1);
  sync.applyPlan(storeA, plan);
  assert.equal(q.val("SELECT barcode FROM variants WHERE sku='SH-R-M' AND product_id IN (SELECT id FROM products WHERE store_id=?)", [storeA]), '6291000000777');
});

test('push API is closed until the platform switch is on AND the store link is active', async () => {
  const key = sync.createStoreKey(storeA);
  assert.match(key, /^cshr_/);
  assert.equal((await call('/api/cashier/v1/stock', { body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).status, 401);
  assert.equal((await call('/api/cashier/v1/stock', { key: 'cshr_wrong', body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).status, 401);
  assert.equal((await call('/api/cashier/v1/stock', { key, body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).json.error.code, 'cashier_off');
  q.run("INSERT OR REPLACE INTO app_settings(key,value) VALUES('cashier_sync_enabled','1')");
  assert.equal((await call('/api/cashier/v1/stock', { key, body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).status, 403); // no link yet
  q.run("INSERT INTO store_cashier_links(store_id,cashier_id,status) VALUES(?,?,?)", [storeA, 'api_key', 'pending']);
  assert.equal((await call('/api/cashier/v1/stock', { key, body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).json.error.code, 'cashier_pending');
  q.run("UPDATE store_cashier_links SET status='active' WHERE store_id=?", [storeA]);
  const ok = await call('/api/cashier/v1/stock', { key, body: { items: [{ sku: 'SH-R-M', stock: 6 }, { barcode: '6291000000099', stock: 8 }, { sku: 'ZZZ', stock: 1 }] } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.results.map((r) => r.status), ['updated', 'updated', 'not_found']);
  assert.equal(stockOf('SH-R-M'), 6);
  assert.equal(stockOf('SH-R-M', storeB), 5); // other store untouched
  assert.ok(sync.keyInfo(storeA).lastUsedAt);
  const fractionalStock = await call('/api/cashier/v1/stock', { key, body: { items: [{ sku: 'SH-R-M', stock: 1.5 }] } });
  assert.equal(fractionalStock.status, 422);
  const fractionalSale = await call('/api/cashier/v1/sales', { key, body: { externalId: 'fractional-qty', items: [{ sku: 'SH-R-M', qty: 1.5 }] } });
  assert.equal(fractionalSale.status, 422);
});

test('sales are applied once even if the cashier retries; returns add stock back', async () => {
  const key = sync.createStoreKey(storeA);
  const before = stockOf('SH-R-M');
  const sale = { externalId: 'INV-1001', items: [{ sku: 'SH-R-M', qty: 2 }] };
  const a = await call('/api/cashier/v1/sales', { key, body: sale });
  const b = await call('/api/cashier/v1/sales', { key, body: sale });
  assert.equal(a.json.duplicate, false); assert.equal(b.json.duplicate, true);
  assert.deepEqual(b.json.results, a.json.results); assert.equal(b.json.applied, a.json.applied);
  assert.equal(stockOf('SH-R-M'), before - 2);
  const reused = await call('/api/cashier/v1/sales', { key, body: { ...sale, items: [{ sku: 'SH-R-M', qty: 1 }] } });
  assert.equal(reused.status, 409); assert.equal(reused.json.error.code, 'external_id_reused');
  assert.equal(q.val("SELECT sold_count FROM products WHERE slug='shirt' AND store_id=?", [storeA]), 2);
  await call('/api/cashier/v1/sales', { key, body: { externalId: 'RET-1', type: 'return', items: [{ sku: 'SH-R-M', qty: 1 }] } });
  assert.equal(stockOf('SH-R-M'), before - 1);
  const over = await call('/api/cashier/v1/sales', { key, body: { externalId: 'INV-1002', items: [{ sku: 'SH-R-L', qty: 50 }] } });
  assert.equal(over.json.results[0].status, 'applied'); assert.equal(stockOf('SH-R-L'), 0); // never negative
});

test('revoked key stops working; a rotated key invalidates the old one', async () => {
  const old = sync.createStoreKey(storeA); const fresh = sync.createStoreKey(storeA);
  assert.equal((await call('/api/cashier/v1/stock', { key: old, body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).status, 401);
  assert.equal((await call('/api/cashier/v1/stock', { key: fresh, body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).status, 200);
  sync.revokeStoreKey(storeA);
  assert.equal((await call('/api/cashier/v1/stock', { key: fresh, body: { items: [{ sku: 'SH-R-M', stock: 1 }] } })).status, 401);
  assert.equal(q.val('SELECT COUNT(*) FROM store_cashier_keys'), 0);
  assert.notEqual(q.val('SELECT key_hash FROM store_cashier_keys'), fresh); // plaintext is never stored
});

test('admin upload: preview changes nothing, apply does', async () => {
  const csv = 'Code,Barcode,Qty\nSH-R-L,,9\nBAG-1,,1\n';
  const form = () => { const f = new FormData(); f.append('file', new Blob([csv], { type: 'text/csv' }), 'stock.csv'); return f; };
  const prev = await (await fetch(`${base}/admin/cashier-sync/stores/a/import/preview`, { method: 'POST', body: form() })).json();
  assert.equal(prev.summary.toUpdate, 2); assert.equal(prev.mapping.sku, 0); assert.equal(prev.mapping.stock, 2);
  assert.equal(stockOf('SH-R-L'), 0);
  const done = await (await fetch(`${base}/admin/cashier-sync/stores/a/import/apply`, { method: 'POST', body: form() })).json();
  assert.equal(done.summary.toUpdate, 2); assert.equal(stockOf('SH-R-L'), 9);
  const none = await fetch(`${base}/admin/cashier-sync/stores/a/import/apply`, { method: 'POST', body: new FormData() });
  assert.equal(none.status, 400);
});

test('store dashboard flag is on only when the platform switch and the store link are both on', () => {
  q.run("INSERT OR REPLACE INTO app_settings(key,value) VALUES('cashier_sync_enabled','1')");
  q.run("UPDATE store_cashier_links SET status='active' WHERE store_id=?", [storeA]);
  assert.equal(access.cashierActiveFor(storeA), true);
  assert.equal(access.cashierActiveFor(storeB), false); // never linked
  q.run("UPDATE store_cashier_links SET status='paused' WHERE store_id=?", [storeA]);
  assert.equal(access.cashierActiveFor(storeA), false);
  q.run("UPDATE store_cashier_links SET status='active' WHERE store_id=?", [storeA]);
  q.run("UPDATE app_settings SET value='0' WHERE key='cashier_sync_enabled'");
  assert.equal(access.cashierActiveFor(storeA), false); // kill switch wins
});

test('subscription: active until the end date, then grace days (still works, with a header), then expired (blocked, data kept)', async () => {
  q.run("INSERT OR REPLACE INTO app_settings(key,value) VALUES('cashier_sync_enabled','1')");
  q.run("UPDATE store_cashier_links SET status='active', starts_at='2026-01-01', ends_at='2026-03-31', grace_days=7 WHERE store_id=?", [storeA]);
  const st = (d) => access.cashierAccess(storeA, d).state;
  assert.equal(st('2025-12-31'), 'pending');   // not started yet
  assert.equal(st('2026-03-31'), 'active');    // last paid day
  assert.equal(st('2026-04-07'), 'grace');     // 7th grace day
  assert.equal(st('2026-04-08'), 'expired');
  q.run("UPDATE store_cashier_links SET ends_at=NULL WHERE store_id=?", [storeA]);
  assert.equal(st('2030-01-01'), 'active');    // no end date = no expiry (manual control)
  q.run("UPDATE store_cashier_links SET status='paused' WHERE store_id=?", [storeA]);
  assert.equal(st('2026-02-01'), 'paused');
});

test('API: grace still works and says so; expired is refused with a clear code but stock is untouched', async () => {
  const key = sync.createStoreKey(storeA);
  const dayAgo = (n) => { const d = new Date(Date.now() - n * 86400000); return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); };
  q.run("UPDATE store_cashier_links SET status='active', starts_at=NULL, ends_at=?, grace_days=7 WHERE store_id=?", [dayAgo(3), storeA]);
  const before = stockOf('SH-R-M');
  const g = await fetch(`${base}/api/cashier/v1/stock`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ items: [{ sku: 'SH-R-M', stock: before + 1 }] }) });
  assert.equal(g.status, 200); assert.match(g.headers.get('x-cashier-subscription'), /^grace/);
  q.run("UPDATE store_cashier_links SET ends_at=? WHERE store_id=?", [dayAgo(30), storeA]);
  const e = await call('/api/cashier/v1/stock', { key, body: { items: [{ sku: 'SH-R-M', stock: 99 }] } });
  assert.equal(e.status, 403); assert.equal(e.json.error.code, 'cashier_expired');
  assert.equal(stockOf('SH-R-M'), before + 1);
});

test('extend: records the payment, moves the end date from the later of today/old end, activates a pending store', () => {
  q.run("UPDATE store_cashier_links SET status='pending', starts_at=NULL, ends_at=NULL WHERE store_id=?", [storeA]);
  const end1 = access.extendSubscription(storeA, { months: 1, amount: 300, note: 'cash' }, '2026-01-31');
  assert.equal(end1, '2026-02-28');                         // Jan 31 + 1 month clamps to month end
  assert.equal(q.get('SELECT status, starts_at AS s FROM store_cashier_links WHERE store_id=?', [storeA]).status, 'active');
  const end2 = access.extendSubscription(storeA, { months: 3, amount: 900 }, '2026-02-10'); // still paid up -> extends from the old end
  assert.equal(end2, '2026-05-28');
  const end3 = access.extendSubscription(storeA, { months: 1 }, '2026-09-01');              // lapsed -> counts from today
  assert.equal(end3, '2026-10-01');
  assert.equal(access.subscriptionHistory(storeA).length, 3);
  assert.equal(access.subscriptionHistory(storeA)[2].amount, 300);
  assert.throws(() => access.extendSubscription(storeB, { months: 1 }), { code: 'no_link' });
  assert.equal(access.addMonths('2024-01-31', 1), '2024-02-29'); // leap year
});

test('admin: extend endpoint and tools list', async () => {
  q.run("UPDATE store_cashier_links SET status='active' WHERE store_id=?", [storeA]);
  const r = await fetch(`${base}/admin/cashier-sync/stores/a/extend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ months: 2, amount: 600 }) });
  assert.equal(r.status, 200); assert.ok((await r.json()).endsAt);
  assert.equal((await fetch(`${base}/admin/cashier-sync/stores/a/extend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ months: 0 }) })).status, 422);
  assert.equal((await fetch(`${base}/admin/cashier-sync/stores/b/extend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ months: 1 }) })).status, 400); // no link
  const tools = await (await fetch(`${base}/admin/cashier-sync/stores/a/tools`)).json();
  assert.ok(tools.subscription.length >= 4);
});
