import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-daily-${randomUUID()}.db`);
process.env.JWT_SECRET = `daily-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'daily-admin-key-0123456789';

test('platform daily report: yesterday only (Cairo day), sent once, only from 09:00', async () => {
  const { insert } = await import('../src/db/index.js');
  const { buildReport, sweepPlatformDaily } = await import('../src/lib/platform-daily.js');
  const uid = insert('users', { name: 'O', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const mkStore = (n) => insert('stores', { owner_id: uid, slug: `d-${n}-${randomUUID().slice(0, 5)}`, code: `D${n}`, name_ar: `محل ${n}`, name_en: `S${n}`, shipping_fee: 0, free_shipping_over: 1, created_at: '2026-11-04 10:00:00' });
  const a = mkStore('a'); const b = mkStore('b');
  const order = (storeId, total, at, status = 'delivered') => insert('orders', { store_id: storeId, number: `N${randomUUID().slice(0, 6)}`, customer_name: 'T', phone: '01000000009', address: 'x', status, subtotal: total, total, track_token: randomUUID(), created_at: at, updated_at: at });
  order(a, 300, '2026-11-04 08:00:00'); order(a, 200, '2026-11-04 12:00:00'); order(b, 100, '2026-11-04 12:00:00'); order(b, 999, '2026-11-04 12:00:00', 'cancelled');
  order(a, 5000, '2026-11-03 12:00:00'); order(a, 7000, '2026-11-05 12:00:00'); // other days are excluded
  insert('buyers', { name: 'B', phone: '01000000010', password_hash: 'x', created_at: '2026-11-04 09:00:00' });
  const r = buildReport('2026-11-04', 2);
  assert.equal(r.orders, 3); assert.equal(r.sales, 600);
  assert.match(r.text, /الطلبات: 3 \(ملغي 1\)/); assert.match(r.text, /600/); assert.match(r.text, /محل a/); assert.match(r.text, /محلات جديدة: 2 · عملاء جدد: 1/);
  const sent = [];
  const send = (t) => sent.push(t);
  assert.equal(sweepPlatformDaily({ date: '2026-11-05', hm: '08:30' }, send), false); // too early
  assert.equal(sweepPlatformDaily({ date: '2026-11-05', hm: '09:10' }, send), true);
  assert.equal(sweepPlatformDaily({ date: '2026-11-05', hm: '09:40' }, send), false); // already sent today
  assert.equal(sent.length, 1); assert.match(sent[0], /2026-11-04/);
  assert.equal(sweepPlatformDaily({ date: '2026-11-06', hm: '10:00' }, send), true);   // next day sends again
});
