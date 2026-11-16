import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const dbFile = path.join(os.tmpdir(), `souqna-e2e-${randomUUID()}.db`);
process.env.DB_FILE = dbFile;
process.env.JWT_SECRET = `e2e-jwt-secret-${randomUUID()}-min32charslong`;
process.env.ADMIN_KEY = `e2e-admin-key-${randomUUID()}`;
process.env.ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
process.env.SITE_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';

const { app } = await import('../src/index.js');
const { q, insert } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
const { hashPassword } = await import('../src/lib/auth.js');
const { codeAt } = await import('../src/lib/totp.js');

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(method, route, body = null, headers = {}) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, headers: res.headers, body: json, text };
}

test('E2E Journey 1: Health, readiness, and version probes', async () => {
  const health = await api('GET', '/api/health');
  assert.equal(health.status, 200, '/api/health returns 200');
  assert.equal(health.body.ok, true);

  const ready = await api('GET', '/api/ready');
  assert.equal(ready.status, 200, '/api/ready returns 200');
  assert.equal(ready.body.ok, true);
  assert.equal(ready.body.db, true);

  const version = await api('GET', '/api/version');
  assert.equal(version.status, 200, '/api/version returns 200');
  assert.ok(version.body.commit, 'version includes commit');
});

test('E2E Journey 2: Seed store & products, browse storefront via public API', async () => {
  const ownerId = insert('users', {
    name: 'E2E Owner',
    email: 'owner@e2e.test',
    password_hash: await hashPassword('password123'),
    role: 'owner',
    token_version: 1,
  });

  const storeId = insert('stores', {
    name_ar: 'متجر التجربة',
    name_en: 'E2E Store',
    slug: 'e2e-store',
    code: 'E2E',
    owner_id: ownerId,
    status: 'active',
    shipping_fee: 30,
    phone: '01011112222',
    whatsapp: '01011112222',
  });

  const prodId = insert('products', {
    store_id: storeId,
    name_ar: 'قميص أبيض كلاسيك',
    name_en: 'Classic White Shirt',
    slug: 'classic-white-shirt',
    description_ar: 'قميص قطن 100% ممتاز',
    description_en: '100% cotton premium shirt',
    price: 350,
    category_id: null,
    status: 'active',
    track_stock: 1,
    stock: 20,
    colors_json: JSON.stringify([{ name: 'أبيض', hex: '#FFFFFF' }]),
    sizes_json: JSON.stringify(['M', 'L', 'XL']),
  });

  const storeRes = await api('GET', '/api/stores/e2e-store');
  assert.equal(storeRes.status, 200);
  assert.equal(storeRes.body.store.slug, 'e2e-store');

  const productsRes = await api('GET', '/api/stores/e2e-store/products');
  assert.equal(productsRes.status, 200);
  assert.ok(productsRes.body.items.length >= 1);
  assert.equal(productsRes.body.items[0].id, prodId);
});

test('E2E Journey 3: Checkout order placement with idempotency and stock deduction', async () => {
  const store = q.get("SELECT id FROM stores WHERE slug='e2e-store'");
  const prod = q.get("SELECT id, stock FROM products WHERE slug='classic-white-shirt'");
  const initialStock = prod.stock;

  const idempotencyKey = `e2e-order-${randomUUID()}`;
  const orderPayload = {
    name: 'أحمد محمود',
    phone: '01012345678',
    governorate: 'القليوبية',
    city: 'بنها',
    address: 'شارع سعد زغلول، عمارة 5',
    items: [{ productId: prod.id, qty: 2 }],
    idempotencyKey,
  };

  const res1 = await api('POST', '/api/stores/e2e-store/orders', orderPayload);
  assert.equal(res1.status, 201, 'Order created successfully');
  assert.ok(res1.body.order, 'Order object returned');
  assert.ok(res1.body.order.number, 'Order number generated');
  const orderNumber = res1.body.order.number;

  const updatedProd = q.get('SELECT stock FROM products WHERE id=?', [prod.id]);
  assert.equal(updatedProd.stock, initialStock - 2, 'Stock deducted atomically by 2');

  // Idempotency: retry exact same request with same key
  const res2 = await api('POST', '/api/stores/e2e-store/orders', orderPayload);
  assert.equal(res2.status, 200, 'Duplicate request returns 200');
  assert.equal(res2.body.order.number, orderNumber, 'Same order number returned for duplicate');
  assert.equal(res2.body.order.duplicate, true, 'Marked as duplicate');

  const stockAfterRetry = q.get('SELECT stock FROM products WHERE id=?', [prod.id]);
  assert.equal(stockAfterRetry.stock, initialStock - 2, 'Stock is not deducted twice');
});

test('E2E Journey 4: Admin authentication with Key and TOTP, and audit log generation', async () => {
  // Step 1: Missing or bad admin key returns 401
  const badKeyRes = await api('POST', '/api/admin/login', { code: '123456' }, { 'x-admin-key': 'wrong-key' });
  assert.equal(badKeyRes.status, 401);

  // Step 2: Valid key + valid TOTP code logs in successfully
  const validTotp = codeAt(process.env.ADMIN_TOTP_SECRET);
  const successRes = await api('POST', '/api/admin/login', { code: validTotp }, { 'x-admin-key': config.adminKey });
  assert.equal(successRes.status, 200);
  assert.equal(successRes.body.twoStep, true);

  // Verify audit log entry was written
  const auditEntry = q.get("SELECT * FROM admin_audit WHERE method='POST' AND path='/login' ORDER BY id DESC LIMIT 1");
  assert.ok(auditEntry, 'Audit log contains login entry');
});

test('E2E Journey 5: Buyer registration, session token version revocation, and rate limiting', async () => {
  const phone = '01198765432';
  const regRes = await api('POST', '/api/buyer/register', {
    name: 'عميل تجريبي',
    phone,
    password: 'securePassword123',
  });
  assert.equal(regRes.status, 201);
  assert.ok(regRes.body.token);
  const buyerToken = regRes.body.token;

  // Access /me with token
  const meRes = await api('GET', '/api/buyer/me', null, { 'x-buyer-token': buyerToken });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.buyer.phone, phone);

  // Invalidate session by incrementing token_version
  q.run('UPDATE buyers SET token_version = token_version + 1 WHERE phone=?', [phone]);

  // Request with old token should now fail with 401
  const revokedRes = await api('GET', '/api/buyer/me', null, { 'x-buyer-token': buyerToken });
  assert.equal(revokedRes.status, 401, 'Revoked token version rejected');
});
