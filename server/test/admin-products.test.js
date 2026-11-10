import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { randomUUID } from 'node:crypto';
import express from 'express';

const KEY = 'admin-products-key-0123456789';

let shared = null;

async function setup() {
  if (shared) return shared;
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-admin-prod-${randomUUID()}.db`);
  process.env.JWT_SECRET = `admin-prod-${randomUUID()}-0123456789`;
  process.env.ADMIN_KEY = KEY;
  delete process.env.ADMIN_TOTP_SECRET;

  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert, q } = await import('../src/db/index.js');

  const app = express();
  app.use('/api/admin', adminRoutes);
  app.use(errorHandler);

  const call = (method, url, body) => new Promise((resolve, reject) => {
    const sock = new Duplex({ read() {}, write(_c, _e, cb) { cb(); } });
    sock.remoteAddress = '127.0.0.1';
    const req = new IncomingMessage(sock);
    req.method = method;
    req.url = '/api' + url;
    req.headers = { 'content-type': 'application/json', 'x-admin-key': KEY };
    req.body = body || {};

    const res = new ServerResponse(req);
    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    res.write = (chunk, enc, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
      return origWrite(chunk, enc, cb);
    };
    res.end = (chunk, enc, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
      origEnd(chunk, enc, cb);
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch {}
      resolve({ status: res.statusCode, body: parsed });
    };
    res.on('error', reject);
    app.handle(req, res, reject);
  });

  shared = { call, insert, q };
  return shared;
}

test('admin products: detects unclear names, missing departments, department mismatches, and weak/missing photos', async () => {
  const { call, insert } = await setup();

  const u1 = insert('users', { name: 'أحمد صاحب المحل', email: `u1-${randomUUID()}@test.com`, password_hash: 'x' });
  const s1 = insert('stores', {
    owner_id: u1,
    slug: 'ahmed-store',
    code: 'AH',
    name_ar: 'أتيليه أحمد',
    name_en: 'Ahmed Atelier',
    departments: ',women_dresses,men,',
  });
  const c1 = insert('categories', { store_id: s1, slug: 'women-dresses', name_ar: 'فساتين', name_en: 'Dresses', system: 1 });

  // Product 1: Unclear name ("123"), no department, no photo
  const pUnclear = insert('products', {
    store_id: s1,
    slug: 'p-unclear',
    name_ar: '123',
    name_en: '123',
    price: 450,
    stock: 5,
    department: null,
    category_id: null,
  });

  // Product 2: Department mismatch (Men's sneakers placed in women_dresses) + weak photo
  const pMismatch = insert('products', {
    store_id: s1,
    slug: 'p-mismatch',
    name_ar: 'كوتشي رجالي نايك أبيض',
    name_en: 'Nike Men White Sneakers',
    description_ar: 'كوتشي رجالي مريح للمشي والجري خامة ممتازة',
    price: 950,
    stock: 8,
    department: 'women_dresses',
    category_id: c1,
    sizes_json: '["41","42","43"]',
  });
  const mWeak = insert('media', {
    store_id: s1,
    kind: 'product',
    key: 'weak-key',
    width: 400,
    height: 500,
    sizes: '["sm","md"]',
    original_ext: 'jpg',
    quality: 32,
    attached: 1,
  });
  insert('product_media', { product_id: pMismatch, media_id: mWeak, position: 0, is_primary: 1 });

  // List all products via /admin/products
  const res = await call('GET', '/admin/products?store=ahmed-store');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 2);

  const row1 = res.body.items.find((x) => x.id === pUnclear);
  assert.ok(row1.moderation.issues.some((i) => i.code === 'unclear_name'), 'should flag unclear_name');
  assert.ok(row1.moderation.issues.some((i) => i.code === 'no_department'), 'should flag no_department');
  assert.ok(row1.moderation.issues.some((i) => i.code === 'no_photo'), 'should flag no_photo');

  const row2 = res.body.items.find((x) => x.id === pMismatch);
  assert.ok(row2.moderation.issues.some((i) => i.code === 'dept_mismatch'), 'should flag dept_mismatch for sneakers in dresses');
  assert.ok(row2.moderation.issues.some((i) => i.code === 'weak_photo'), 'should flag weak_photo for quality 32');
  assert.ok(row2.moderation.suggestedDepartment, 'should suggest a shoes department');

  // Filter by specific issue
  const mismatchFilter = await call('GET', '/admin/products?issue=dept_mismatch');
  assert.equal(mismatchFilter.status, 200);
  assert.ok(mismatchFilter.body.items.some((x) => x.id === pMismatch));
  assert.ok(!mismatchFilter.body.items.some((x) => x.id === pUnclear));

  // Edit from Twist Admin: fix name, apply suggested department, flag irrelevant photo, then approve
  const flagRes = await call('PATCH', `/admin/products/${pUnclear}`, {
    name_ar: 'فستان سهرة ستان كحلي طويل',
    department: 'women_dresses',
    price: 1200,
    review_status: 'flagged',
    admin_flags: ['irrelevant_photo'],
    review_note: 'الصورة المرفوعة ملهاش علاقة بالفستان',
  });
  assert.equal(flagRes.status, 200);
  assert.equal(flagRes.body.product.name_ar, 'فستان سهرة ستان كحلي طويل');
  assert.equal(flagRes.body.product.department, 'women_dresses');
  assert.equal(flagRes.body.product.moderation.reviewStatus, 'flagged');
  assert.ok(flagRes.body.product.moderation.issues.some((i) => i.code === 'irrelevant_photo'));

  // Bulk apply suggested department & bulk approve
  const bulkDept = await call('POST', '/admin/products/bulk', {
    ids: [pMismatch],
    action: 'apply_suggested_department',
  });
  assert.equal(bulkDept.status, 200);
  assert.equal(bulkDept.body.updated, 1);

  const bulkApprove = await call('POST', '/admin/products/bulk', {
    ids: [pUnclear, pMismatch],
    action: 'approve',
  });
  assert.equal(bulkApprove.status, 200);
  assert.equal(bulkApprove.body.updated, 2);

  const afterApprove = await call('GET', `/admin/products/${pUnclear}`);
  assert.equal(afterApprove.status, 200);
  assert.equal(afterApprove.body.product.moderation.reviewStatus, 'approved');

  // Test removing a bad photo via PATCH /admin/products/:id
  const removePhotoRes = await call('PATCH', `/admin/products/${pMismatch}`, {
    remove_media_ids: [mWeak],
  });
  assert.equal(removePhotoRes.status, 200);
  assert.equal(removePhotoRes.body.product.photo_count, 0);

  // Test search by #id and owner name
  const searchById = await call('GET', `/admin/products?q=${encodeURIComponent('#' + pUnclear)}`);
  assert.equal(searchById.status, 200);
  assert.equal(searchById.body.items.length, 1);
  assert.equal(searchById.body.items[0].id, pUnclear);

  // Test notifications endpoint includes productsIssues count
  const notifRes = await call('GET', '/admin/notifications');
  assert.equal(notifRes.status, 200);
  assert.equal(typeof notifRes.body.productsIssues, 'number');

  // Test DELETE /admin/products/:id
  const delRes = await call('DELETE', `/admin/products/${pUnclear}`);
  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.deleted, true);
});
