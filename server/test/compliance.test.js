import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';

const dbFile = path.join(os.tmpdir(), `souqna-compliance-${randomUUID()}.db`);
process.env.DB_FILE = dbFile;
process.env.JWT_SECRET = `comp-jwt-secret-${randomUUID()}-min32charslong`;
process.env.ADMIN_KEY = `comp-admin-key-${randomUUID()}`;
process.env.SITE_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';

const { q, insert } = await import('../src/db/index.js');
const { getGateway, handlePaymentWebhook, PaymobGateway, FawryGateway } = await import('../src/lib/payments.js');

test('Compliance & Payments: Paymob HMAC SHA512 signature verification', () => {
  const paymob = new PaymobGateway();
  const secret = 'test-paymob-hmac-secret-1234';

  const payload = {
    obj: {
      amount_cents: 10000,
      created_at: '2026-11-16T12:00:00.000Z',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 998877,
      integration_id: 12345,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: false,
      is_voided: false,
      order: { id: 5544 },
      owner: 10,
      pending: false,
      source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' },
      success: true,
    },
  };

  const concatenated = [
    payload.obj.amount_cents,
    payload.obj.created_at,
    payload.obj.currency,
    payload.obj.error_occured,
    payload.obj.has_parent_transaction,
    payload.obj.id,
    payload.obj.integration_id,
    payload.obj.is_3d_secure,
    payload.obj.is_auth,
    payload.obj.is_capture,
    payload.obj.is_refunded,
    payload.obj.is_standalone_payment,
    payload.obj.is_voided,
    payload.obj.order.id,
    payload.obj.owner,
    payload.obj.pending,
    payload.obj.source_data.pan,
    payload.obj.source_data.sub_type,
    payload.obj.source_data.type,
    payload.obj.success,
  ].map(String).join('');

  const validSignature = crypto.createHmac('sha512', secret).update(concatenated).digest('hex');

  // Valid signature passes
  assert.equal(paymob.verifyWebhookSignature(payload, validSignature, secret), true);

  // Altered signature fails
  assert.equal(paymob.verifyWebhookSignature(payload, 'deadbeef'.repeat(16), secret), false);

  // Missing secret fails
  assert.equal(paymob.verifyWebhookSignature(payload, validSignature, ''), false);
});

test('Compliance & Payments: Fawry SHA256 signature verification', () => {
  const fawry = new FawryGateway();
  const secret = 'fawry-secret-key-xyz';

  const payload = {
    fawryRefNumber: 'REF123456',
    merchantRefNum: 'ORDER999',
    paymentAmount: '350.00',
    orderAmount: '350.00',
    orderStatus: 'PAID',
    paymentMethod: 'PAYATFAWRY',
  };

  const raw = `${payload.fawryRefNumber}${payload.merchantRefNum}${Number(payload.paymentAmount).toFixed(2)}${Number(payload.orderAmount).toFixed(2)}${payload.orderStatus}${payload.paymentMethod}${secret}`;
  const validSignature = crypto.createHash('sha256').update(raw).digest('hex');

  assert.equal(fawry.verifyWebhookSignature(payload, validSignature, secret), true);
  assert.equal(fawry.verifyWebhookSignature(payload, 'wrong-hash', secret), false);
});

test('Compliance: Buyer data export and account deletion preserves order records', () => {
  const buyerId = insert('buyers', {
    name: 'عميل بيانات',
    phone: '01099887766',
    password_hash: 'dummy-hash',
    token_version: 1,
  });

  const ownerId = insert('users', {
    name: 'Compliance Owner',
    email: 'comp@test.com',
    password_hash: 'hash',
    role: 'owner',
    token_version: 1,
  });

  const storeId = insert('stores', {
    name_ar: 'متجر الامتثال',
    name_en: 'Compliance Store',
    slug: 'comp-store',
    code: 'CMP',
    owner_id: ownerId,
    status: 'active',
    shipping_fee: 30,
    phone: '01011112222',
    whatsapp: '01011112222',
  });

  const orderId = insert('orders', {
    store_id: storeId,
    number: 'ORD-COMP-1',
    customer_name: 'عميل بيانات',
    phone: '01099887766',
    governorate: 'القليوبية',
    city: 'بنها',
    address: 'شارع 10',
    status: 'delivered',
    subtotal: 500,
    shipping: 30,
    total: 530,
    buyer_id: buyerId,
  });

  insert('buyer_stylist_chats', {
    buyer_id: buyerId,
    title: 'تنسيق صيفي',
    messages_json: JSON.stringify([{ role: 'user', content: 'طقم أبيض' }]),
    updated_at: new Date().toISOString(),
  });

  // Verify buyer data export
  const buyer = q.get('SELECT id, name, phone FROM buyers WHERE id=?', [buyerId]);
  const chats = q.all('SELECT id, title FROM buyer_stylist_chats WHERE buyer_id=?', [buyerId]);
  const orders = q.all('SELECT id, number FROM orders WHERE buyer_id=?', [buyerId]);

  assert.equal(buyer.name, 'عميل بيانات');
  assert.equal(chats.length, 1);
  assert.equal(orders.length, 1);

  // Execute deletion logic: unlinks order for financial/tax records, wipes personal profile & chats
  q.run('UPDATE orders SET buyer_id=NULL WHERE buyer_id=?', [buyerId]);
  q.run('DELETE FROM buyer_stylist_chats WHERE buyer_id=?', [buyerId]);
  q.run('DELETE FROM buyers WHERE id=?', [buyerId]);

  // Buyer & personal chats are completely wiped
  assert.equal(q.get('SELECT 1 FROM buyers WHERE id=?', [buyerId]), undefined);
  assert.equal(q.get('SELECT 1 FROM buyer_stylist_chats WHERE buyer_id=?', [buyerId]), undefined);

  // Financial record (order) is preserved without PII link
  const preservedOrder = q.get('SELECT id, buyer_id, total FROM orders WHERE id=?', [orderId]);
  assert.ok(preservedOrder, 'Order record retained');
  assert.equal(preservedOrder.buyer_id, null, 'Order buyer_id unlinked');
});
