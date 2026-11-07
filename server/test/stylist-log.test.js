import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-stylist-log-${randomUUID()}.db`);
process.env.JWT_SECRET = `stylist-log-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'stylist-log-admin-key-0123456789';

test('stylist log: cleans personal numbers, classifies answers, and reports unanswered questions and latency', async () => {
  const { cleanLogText, kindOf, logStylist, stylistLogReport } = await import('../src/lib/stylist-log.js');
  assert.equal(cleanLogText('كلمني على 01012345678 او a@b.com او https://x.y/z'), 'كلمني على # او # او #');
  assert.equal(kindOf({ faq: 'contact_phone' }), 'faq');
  assert.equal(kindOf({ adviceId: 'care_denim' }), 'advice');
  assert.equal(kindOf({ state: 'none' }), 'none');
  assert.equal(kindOf({ state: 'chat', intent: 'unknown' }), 'fallback');
  assert.equal(kindOf({ blocks: { tabs: [{ items: [{}] }] } }), 'shop');
  assert.equal(kindOf(null, { photo: true }), 'photo');
  logStylist('رقمكم كام', { faq: 'contact_phone' }, 120);
  logStylist('ازاي اغسل الجينز', { adviceId: 'care_denim' }, 80);
  logStylist('كلام مش مفهوم', { state: 'chat', intent: 'unknown' }, 4000);
  logStylist('كلام مش مفهوم', { state: 'chat', intent: 'unknown' }, 300);
  logStylist('عايز شبشب', { state: 'none' }, 200);
  logStylist('', { faq: 'x' }, 10); // empty text is skipped
  const r = stylistLogReport(30);
  assert.equal(r.total, 5);
  assert.equal(r.kinds.faq, 1); assert.equal(r.kinds.fallback, 2);
  assert.equal(r.answeredRate, 40);
  assert.equal(r.lost[0].text, 'كلام مش مفهوم'); assert.equal(r.lost[0].n, 2);
  assert.equal(r.latency.max, 4000); assert.equal(r.slow[0].ms, 4000);
});

test('care and material fields are stored on the product and exposed by the public serializer; stores feed Twila', async () => {
  const { insert, q } = await import('../src/db/index.js');
  const { serializeProductDetail } = await import('../src/lib/serialize.js');
  const { storesForModa } = await import('../src/lib/stylist.js');
  const uid = insert('users', { name: 'O', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const sid = insert('stores', { owner_id: uid, slug: `sl-${randomUUID().slice(0, 5)}`, code: 'SL1', name_ar: 'محل السجل', name_en: 'Log Store', shipping_fee: 0, free_shipping_over: 1, phone: '0132222222', address_ar: 'شارع التحرير', instagram: 'logstore' });
  const pid = insert('products', { store_id: sid, slug: `p-${randomUUID().slice(0, 4)}`, name_ar: 'هودي', name_en: 'Hoodie', price: 100, stock: 5, department: 'men', care_ar: 'غسيل بارد بدون مبيض', material_ar: 'قطن 100%' });
  const detail = serializeProductDetail(q.get('SELECT * FROM products WHERE id=?', [pid]));
  assert.equal(detail.care, 'غسيل بارد بدون مبيض'); assert.equal(detail.material, 'قطن 100%');
  const none = serializeProductDetail(q.get('SELECT * FROM products WHERE id=?', [insert('products', { store_id: sid, slug: `q-${randomUUID().slice(0, 4)}`, name_ar: 'تيشيرت', name_en: 'Tee', price: 50, stock: 5, department: 'men' })]));
  assert.equal(none.care, null); assert.equal(none.material, null);
  const s = storesForModa().find((x) => x.slug.startsWith('sl-'));
  assert.ok(s); assert.equal(s.phone, '0132222222'); assert.equal(s.address_ar, 'شارع التحرير'); assert.equal(s.instagram, 'logstore'); assert.deepEqual(s.branches, []);
});
