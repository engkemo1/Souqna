import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-codes-'));
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.MEDIA_DIR = path.join(tmp, 'media');

const { q, db } = await import('../src/db/index.js');
const express = (await import('express')).default;
const { errorHandler } = await import('../src/lib/errors.js');
const { signToken } = await import('../src/lib/auth.js');
const { default: ownerRoutes } = await import('../src/routes/owner.js');
const { normalizeProductDescription } = await import('../src/lib/stylist.js');

let server; let base; let tokenA; let tokenB;
before(async () => {
  const mk = (n) => {
    const uid = Number(q.run("INSERT INTO users(name,email,password_hash) VALUES(?,?,'x')", [n, `${n}@x.com`]).lastInsertRowid);
    q.run('INSERT INTO stores(owner_id,slug,code,name_ar,name_en,departments) VALUES(?,?,?,?,?,?)', [uid, n, n, n, n, ',women,']);
    return signToken({ id: uid });
  };
  tokenA = mk('a'); tokenB = mk('b');
  const app = express(); app.use(express.json()); app.use('/api/owner', ownerRoutes); app.use(errorHandler);
  server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const call = async (token, method, p, body) => {
  const res = await fetch(base + '/api/owner' + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};
test('owner can check whether the product photo assistant is configured without exposing credentials', async () => {
  const r = await call(tokenA, 'GET', '/ai/product/status');
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.configured, 'boolean');
  assert.ok(['anthropic', 'cloudflare'].includes(r.json.provider));
  assert.ok(Array.isArray(r.json.departments));
  assert.ok(r.json.departments.every((d) => d.slug === 'women'));
  assert.equal('apiKey' in r.json, false);
});
test('photo assistant output is bounded and cannot invent colors, departments, or size kinds', () => {
  const result = normalizeProductDescription({
    name_ar: `فستان\n${'طويل'.repeat(30)}`,
    description_ar: `${'وصف '.repeat(200)}`,
    colors: ['Black', 'Black', 'Invisible Neon', 'Red', 'Blue', 'Green'],
    department: 'administrator', size_kind: 'invented',
  }, ['women', 'men']);
  assert.equal(result.name_ar.includes('\n'), false);
  assert.equal(result.name_ar.length, 60);
  assert.equal(result.description_ar.length, 600);
  assert.deepEqual(result.colors, ['Black', 'Red', 'Blue']);
  assert.equal(result.department, null);
  assert.equal(result.size_kind, null);
});
test('product photo corrections become private, bounded examples only for the correcting store', async () => {
  const suggested = { name_ar: 'حذاء', description_ar: 'حذاء مميز.' };
  const corrected = { name_ar: 'سنيكرز أبيض', description_ar: 'سنيكرز أبيض بتصميم بسيط.' };
  const learned = await call(tokenA, 'POST', '/ai/product/learn', { suggested, corrected });
  assert.deepEqual(learned.json, { learned: true });
  assert.equal(q.val('SELECT COUNT(*) FROM pos_ai_product_lessons WHERE store_id=1'), 1);
  assert.equal(q.val('SELECT COUNT(*) FROM pos_ai_product_lessons WHERE store_id=2'), 0);
  const noChange = await call(tokenA, 'POST', '/ai/product/learn', { suggested: corrected, corrected });
  assert.deepEqual(noChange.json, { learned: false });
  assert.equal(q.val('SELECT COUNT(*) FROM pos_ai_product_lessons WHERE store_id=1'), 1);
  const partial = await call(tokenA, 'POST', '/ai/product/learn', { suggested: { description_ar: 'وصف مقترح' }, corrected: { name_ar: 'اسم كتبه صاحب المحل', description_ar: 'وصف مقترح' } });
  assert.deepEqual(partial.json, { learned: false }, 'pre-existing manual fields are not mistaken for AI corrections');
  assert.equal(q.val('SELECT COUNT(*) FROM pos_ai_product_lessons WHERE store_id=1'), 1);
});
const red = { name_ar: 'أحمر', name_en: 'Red', hex: '#FF0000' };
const base_ = (extra) => ({ name_ar: 'قميص', name_en: 'Shirt', price: 100, status: 'active', colors: [red], sizes: ['M', 'L'], track_stock: true, ...extra });
const variantRows = (pid) => q.all('SELECT id,size,sku,barcode,stock FROM variants WHERE product_id=? ORDER BY id', [pid]);

test('variant codes and product barcode are saved and returned', async () => {
  const r = await call(tokenA, 'POST', '/products', base_({ barcode: '6291000000100', variants: [
    { color: red.hex, size: 'M', stock: 3, sku: 'SH-M', barcode: '6291000000101' },
    { color: red.hex, size: 'L', stock: 4, sku: 'SH-L', barcode: '' }] }));
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.product.barcode, '6291000000100');
  const v = r.json.product.variants;
  assert.deepEqual(v.map((x) => [x.sku, x.barcode]), [['SH-M', '6291000000101'], ['SH-L', null]]);
});

test('an editor that does not send variant codes must NOT wipe them (was a real bug)', async () => {
  const pid = q.val("SELECT id FROM products WHERE slug='shirt'");
  const rows = variantRows(pid);
  const put = await call(tokenA, 'PUT', `/products/${pid}`, base_({ variants: rows.map((v) => ({ id: v.id, color: red.hex, size: v.size, stock: 9 })) })); // no sku / barcode keys, like the old editor
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const after_ = variantRows(pid);
  assert.deepEqual(after_.map((v) => [v.sku, v.barcode, v.stock]), [['SH-M', '6291000000101', 9], ['SH-L', null, 9]]);
  assert.equal(q.val('SELECT barcode FROM products WHERE id=?', [pid]), '6291000000100'); // product barcode untouched too
});

test('sending an empty code clears it; sending a value changes it', async () => {
  const pid = q.val("SELECT id FROM products WHERE slug='shirt'");
  const rows = variantRows(pid);
  const put = await call(tokenA, 'PUT', `/products/${pid}`, base_({ barcode: '', variants: [
    { id: rows[0].id, color: red.hex, size: 'M', stock: 9, sku: 'NEW-M', barcode: '' },
    { id: rows[1].id, color: red.hex, size: 'L', stock: 9, sku: 'SH-L', barcode: '6291000000102' }] }));
  assert.equal(put.status, 200);
  assert.deepEqual(variantRows(pid).map((v) => [v.sku, v.barcode]), [['NEW-M', null], ['SH-L', '6291000000102']]);
  assert.equal(q.val('SELECT barcode FROM products WHERE id=?', [pid]), null);
});

test('a barcode can belong to only one product/variant in a store, but other stores may reuse it', async () => {
  const dupInOther = await call(tokenA, 'POST', '/products', base_({ name_en: 'Dress', name_ar: 'فستان', colors: [], sizes: [], variants: [], barcode: '6291000000102' }));
  assert.equal(dupInOther.status, 409); assert.equal(dupInOther.json.error.code, 'barcode_in_use');
  const twice = await call(tokenA, 'POST', '/products', base_({ name_en: 'Hat', name_ar: 'قبعة', colors: [], sizes: [], variants: [], barcode: '777', }));
  assert.equal(twice.status, 201);
  const samePayload = await call(tokenA, 'POST', '/products', base_({ name_en: 'Scarf', name_ar: 'وشاح', variants: [{ color: red.hex, size: 'M', stock: 1, barcode: '55' }, { color: red.hex, size: 'L', stock: 1, barcode: '55.0' }] }));
  assert.equal(samePayload.status, 409);
  const other = await call(tokenB, 'POST', '/products', base_({ name_en: 'Hat', name_ar: 'قبعة', colors: [], sizes: [], variants: [], barcode: '6291000000102' }));
  assert.equal(other.status, 201); // different store
});

test('editing a product does not collide with its own barcode', async () => {
  const pid = q.val("SELECT id FROM products WHERE slug='hat' AND store_id=(SELECT id FROM stores WHERE slug='a')");
  const put = await call(tokenA, 'PUT', `/products/${pid}`, base_({ name_en: 'Hat', name_ar: 'قبعة', colors: [], sizes: [], variants: [], barcode: '777', price: 120 }));
  assert.equal(put.status, 200, JSON.stringify(put.json));
});
