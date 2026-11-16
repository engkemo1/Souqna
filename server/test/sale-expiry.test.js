import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-sale-${randomUUID()}.db`);
  process.env.JWT_SECRET = `sale-${randomUUID()}`;
  const { insert, q } = await import('../src/db/index.js');
  const { expireSales } = await import('../src/lib/sale-expiry.js');
  const { productSchema } = await import('../src/routes/owner.js');
  const owner = insert('users', { name: 'Owner', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const store = insert('stores', { owner_id: owner, slug: `sl-${randomUUID().slice(0, 6)}`, code: `S${randomUUID().slice(0, 4)}`, name_ar: 'م', name_en: 'S', status: 'active' });
  const prod = (price, compare, ends) => insert('products', { store_id: store, slug: `p-${randomUUID().slice(0, 6)}`, name_en: 'P', name_ar: 'منتج', price, compare_at_price: compare, sale_ends_at: ends, status: 'active' });
  return { q, expireSales, productSchema, prod };
}

test('an ended timed discount puts the old price back; running and untimed ones are untouched', async () => {
  const { q, expireSales, prod } = await setup();
  const now = Date.now();
  const ended = prod(80, 100, now - 1000);
  const running = prod(80, 100, now + 3600e3);
  const untimed = prod(80, 100, null);
  const stale = prod(100, null, now - 1000);
  assert.equal(expireSales(now), 1);
  assert.deepEqual({ ...q.get('SELECT price, compare_at_price, sale_ends_at FROM products WHERE id=?', [ended]) }, { price: 100, compare_at_price: null, sale_ends_at: null });
  assert.equal(q.get('SELECT price FROM products WHERE id=?', [running]).price, 80);
  assert.equal(q.get('SELECT sale_ends_at FROM products WHERE id=?', [running]).sale_ends_at > now, true);
  assert.equal(q.get('SELECT price FROM products WHERE id=?', [untimed]).price, 80);
  assert.equal(q.get('SELECT sale_ends_at FROM products WHERE id=?', [stale]).sale_ends_at, null);
});

test('the product form only accepts an end date for a real, future discount', async () => {
  const { productSchema } = await setup();
  const base = { name_ar: 'منتج', price: 80, compare_at_price: 100, category_id: null };
  const future = Date.now() + 86400e3;
  assert.equal(productSchema.safeParse({ ...base, sale_ends_at: future }).success, true);
  assert.equal(productSchema.safeParse({ ...base, sale_ends_at: null }).success, true);
  assert.equal(productSchema.safeParse({ ...base, sale_ends_at: Date.now() - 1000 }).success, false);
  assert.equal(productSchema.safeParse({ ...base, compare_at_price: null, sale_ends_at: future }).success, false);
  assert.equal(productSchema.safeParse({ ...base, sale_ends_at: Date.now() + 500 * 86400e3 }).success, false);
});
