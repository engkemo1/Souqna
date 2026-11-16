import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const dbFile = path.join(os.tmpdir(), `souqna-isolation-${randomUUID()}.db`);
process.env.DB_FILE = dbFile;
process.env.JWT_SECRET = `iso-test-jwt-secret-key-${randomUUID()}-long`;
process.env.ADMIN_KEY = `iso-admin-key-${randomUUID()}`;

const { app } = await import('../src/index.js');
const { q, insert } = await import('../src/db/index.js');
const { signToken } = await import('../src/lib/auth.js');
const { signBuyer } = await import('../src/lib/buyers.js');

const server = createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  await new Promise((r) => server.close(r));
});

async function req(method, urlPath, body, headers = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, body: json };
}

test('P0-10: Cross-store IDOR matrix — Store A cannot read or mutate Store B resources; Demo store cannot write; Buyer A cannot access Buyer B resources', async () => {
  // Setup Store A, Store B, and Demo Store
  const userA = insert('users', { name: 'Owner A', email: 'a@iso.test', password_hash: 'x', role: 'owner', token_version: 1 });
  const storeA = insert('stores', { owner_id: userA, slug: 'store-a', code: 'SA', name_ar: 'محل أ', name_en: 'Store A', departments: ',women,' });
  const tokenA = signToken({ id: userA, token_version: 1 });

  const userB = insert('users', { name: 'Owner B', email: 'b@iso.test', password_hash: 'x', role: 'owner', token_version: 1 });
  const storeB = insert('stores', { owner_id: userB, slug: 'store-b', code: 'SB', name_ar: 'محل ب', name_en: 'Store B', departments: ',men,' });

  const userDemo = insert('users', { name: 'Demo Owner', email: 'demo@iso.test', password_hash: 'x', role: 'demo', token_version: 1 });
  insert('stores', { owner_id: userDemo, slug: 'store-demo', code: 'SD', name_ar: 'محل تجريبي', name_en: 'Demo Store', departments: ',women,' });
  const tokenDemo = signToken({ id: userDemo, token_version: 1 });

  // Create Store B resources
  const catB = insert('categories', { store_id: storeB, slug: 'shirts', name_ar: 'قمصان', name_en: 'Shirts', sort: 0 });
  const prodB = insert('products', { store_id: storeB, slug: 'shirt-b', name_ar: 'قميص ب', name_en: 'Shirt B', price: 450, stock: 10, status: 'active' });
  const varB = insert('variants', { product_id: prodB, color: '#000000', size: 'L', stock: 10 });
  const mediaB = insert('media', { store_id: storeB, kind: 'product', key: 'k-b', width: 500, height: 500, sizes: '[]', original_ext: 'jpg', bytes: 100 });
  const custB = insert('customers', { store_id: storeB, name: 'Cust B', phone: '01099998888', orders_count: 1, total_spent: 450 });
  const orderB = insert('orders', { store_id: storeB, number: 'SB-10001', customer_id: custB, customer_name: 'Cust B', phone: '01099998888', status: 'pending', subtotal: 450, discount: 0, shipping: 50, total: 500 });
  const offerB = insert('offers', { store_id: storeB, type: 'percentage', code: 'B10', title_ar: 'خصم ب', title_en: 'B Off', value: 10, active: 1 });
  const bannerB = insert('banners', { store_id: storeB, media_id: mediaB, title_ar: 'بانر ب', title_en: 'Banner B', position: 0, active: 1 });

  const authA = { Authorization: `Bearer ${tokenA}` };

  // 1. Store A cannot read or mutate Store B's products or variants
  assert.equal((await req('GET', `/api/owner/products/${prodB}`, null, authA)).status, 404);
  assert.equal((await req('PATCH', `/api/owner/products/${prodB}`, { price: 10 }, authA)).status, 404);
  assert.equal((await req('DELETE', `/api/owner/products/${prodB}`, null, authA)).status, 404);
  assert.equal((await req('PATCH', `/api/owner/variants/${varB}`, { stock: 0 }, authA)).status, 404);
  assert.equal(q.val('SELECT price FROM products WHERE id=?', [prodB]), 450);

  // 2. Store A cannot read or mutate Store B's orders or customers
  assert.equal((await req('GET', `/api/owner/orders/${orderB}`, null, authA)).status, 404);
  assert.equal((await req('PATCH', `/api/owner/orders/${orderB}/status`, { status: 'confirmed' }, authA)).status, 404);
  assert.equal((await req('GET', `/api/owner/customers/${custB}`, null, authA)).status, 404);
  assert.equal(q.val('SELECT status FROM orders WHERE id=?', [orderB]), 'pending');

  // 3. Store A cannot mutate/delete Store B's categories, media, offers, or banners
  assert.equal((await req('PUT', `/api/owner/categories/${catB}`, { name_ar: 'هاك', name_en: 'Hack' }, authA)).status, 404);
  assert.equal((await req('DELETE', `/api/owner/media/${mediaB}`, null, authA)).status, 404);
  assert.equal((await req('PUT', `/api/owner/offers/${offerB}`, { type: 'percentage', code: 'B10', title_ar: 'x', title_en: 'x', value: 50 }, authA)).status, 404);
  await req('DELETE', `/api/owner/offers/${offerB}`, null, authA);
  assert.ok(q.get('SELECT id FROM offers WHERE id=?', [offerB]), 'Store B offer still exists');
  await req('DELETE', `/api/owner/banners/${bannerB}`, null, authA);
  assert.ok(q.get('SELECT id FROM banners WHERE id=?', [bannerB]), 'Store B banner still exists');

  // 4. Demo role is read-only across write routes except /store/theme/preview
  const authDemo = { Authorization: `Bearer ${tokenDemo}` };
  assert.equal((await req('GET', '/api/owner/store', null, authDemo)).status, 200);
  assert.equal((await req('POST', '/api/owner/categories', { name_ar: 'قسم', name_en: 'Cat' }, authDemo)).status, 403);
  assert.equal((await req('PUT', '/api/owner/store/same-day', { on: true }, authDemo)).status, 403);
  assert.equal((await req('POST', '/api/pos/registers/resolve', { deviceKey: 'demo-device-12345' }, authDemo)).status, 403);

  // 5. Buyer A cannot access Buyer B's chats or orders
  const buyerA = insert('buyers', { phone: '01011112222', name: 'Buyer A', password_hash: 'x', token_version: 1 });
  const buyerB = insert('buyers', { phone: '01033334444', name: 'Buyer B', password_hash: 'x', token_version: 1 });
  const chatB = insert('buyer_stylist_chats', {
    buyer_id: buyerB,
    title: 'Private Chat',
    messages_json: JSON.stringify([{ role: 'user', content: 'hi' }, { role: 'assistant', say: 'hello' }]),
    updated_at: new Date().toISOString(),
  });
  const bTokenA = signBuyer({ id: buyerA, token_version: 1 });
  assert.equal((await req('GET', `/api/buyer/chats/${chatB}`, null, { 'x-buyer-token': bTokenA })).status, 404);
  await req('DELETE', `/api/buyer/chats/${chatB}`, null, { 'x-buyer-token': bTokenA });
  assert.ok(q.get('SELECT id FROM buyer_stylist_chats WHERE id=?', [chatB]), 'Buyer B chat untouched');
});
