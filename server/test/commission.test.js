// Twist commission: 8% by default, frozen when delivered, subscribed/own rates, base after the shop's own discount and returns. Real DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const ADMIN_KEY = 'test-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-commission-${randomUUID()}.db`);
process.env.JWT_SECRET = `cm-${randomUUID()}-min32charslong-xxxxxxxx`;
process.env.ADMIN_KEY = ADMIN_KEY; process.env.NODE_ENV = 'test';
const { default: adminRoutes } = await import('../src/routes/admin.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');
const { settleCommission, rateFor } = await import('../src/lib/commission.js');

q.run("UPDATE app_settings SET value='2000-01-01' WHERE key='commission_start'"); // the launch date is 'first boot' in production; tests use fixed dates
const app = express(); app.use(express.json()); app.use('/api/admin', adminRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
const root = `http://127.0.0.1:${server.address().port}/api/admin`;
test.after(() => new Promise((r) => server.close(r)));
const call = async (method, url, body) => { const res = await fetch(root + url, { method, headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ } return { status: res.status, json, text }; };

const ownerId = insert('users', { name: 'O', email: 'o@cm.test', password_hash: 'x' });
const mkStore = (slug) => insert('stores', { owner_id: ownerId, slug, code: slug.toUpperCase().slice(0, 4), name_ar: slug, name_en: slug, shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
let n = 0;
const mkOrder = (storeId, f = {}) => { n += 1; return insert('orders', { store_id: storeId, number: `CM-${n}`, customer_name: 'a', phone: '01000000000', status: 'delivered', subtotal: 1000, discount: 0, shipping: 30, total: 1030, platform_discount: 0, created_at: '2026-12-10 10:00:00', updated_at: '2026-12-10 10:00:00', ...f }); };

test('default is 8% of the products only (delivery fee excluded), frozen on the order', () => {
  const s = mkStore('cm-a'); const o = mkOrder(s);
  assert.deepEqual(settleCommission(o), { rate: 8, amount: 80 });
  assert.equal(q.get('SELECT commission_rate r, commission_amount a FROM orders WHERE id=?', [o]).a, 80);
  assert.equal(settleCommission(o), null); // already frozen
});

test("the shop's own discount lowers the base; Twist-funded discount does not", () => {
  const s = mkStore('cm-b');
  assert.equal(settleCommission(mkOrder(s, { discount: 200 })).amount, 64); // (1000-200)*8%
  assert.equal(settleCommission(mkOrder(s, { discount: 100, platform_discount: 100 })).amount, 80); // Twist paid that 100: shop is paid in full
});

test('open orders are not settled; a later rate change does not touch frozen orders', async () => {
  const s = mkStore('cm-c'); const open = mkOrder(s, { status: 'shipped' }); const done = mkOrder(s);
  assert.equal(settleCommission(open), null);
  settleCommission(done);
  const r = await call('PUT', '/commission/settings', { defaultRate: 5 });
  assert.equal(r.status, 200); assert.equal(r.json.defaultRate, 5);
  assert.equal(q.get('SELECT commission_amount a FROM orders WHERE id=?', [done]).a, 80);
  assert.equal(settleCommission(mkOrder(s)).amount, 50);
  await call('PUT', '/commission/settings', { defaultRate: 8 });
});

test('subscribed rate applies only while the subscription is live AND a subscribed rate is set; own rate beats both', async () => {
  const s = mkStore('cm-d');
  q.run("INSERT INTO store_subscriptions(store_id,covered_through) VALUES(?,?)", [s, '2026-12-31']);
  assert.equal(rateFor(s, '2026-12-10').rate, 8); // no subscribed rate offered yet
  await call('PUT', '/commission/settings', { subscribedRate: 3 });
  assert.deepEqual(rateFor(s, '2026-12-10'), { rate: 3, source: 'subscription' });
  assert.equal(rateFor(s, '2027-01-05').rate, 8); // expired
  assert.equal((await call('PUT', '/commission/stores/cm-d', { rate: 0 })).status, 200);
  assert.deepEqual(rateFor(s, '2026-12-10'), { rate: 0, source: 'store' });
  await call('PUT', '/commission/stores/cm-d', { rate: null });
  assert.equal(rateFor(s, '2026-12-10').rate, 3);
  await call('PUT', '/commission/settings', { subscribedRate: null });
});

test('refunds lower the frozen amount at the same rate; the report totals it; rates are validated', async () => {
  const s = mkStore('cm-e'); const o = mkOrder(s); settleCommission(o);
  const item = insert('order_items', { order_id: o, name_ar: 'x', name_en: 'x', price: 1000, qty: 1 });
  insert('order_returns', { order_id: o, store_id: s, order_item_id: item, qty: 1, refund: 500, created_at: '2026-12-11 10:00:00' });
  const { refreshAfterReturn } = await import('../src/lib/commission.js'); refreshAfterReturn(o);
  assert.equal(q.get('SELECT commission_amount a FROM orders WHERE id=?', [o]).a, 40);
  const rep = await call('GET', '/commission?days=365');
  assert.equal(rep.status, 200); assert.ok(rep.json.total >= 40); assert.ok(rep.json.stores.some((x) => x.slug === 'cm-e' && x.commission === 40));
  assert.equal((await call('PUT', '/commission/settings', { defaultRate: 120 })).status, 422);
});

test('pay the shop per order: due = products - commission; marking paid freezes the amount; cancel/return afterwards shows what to claw back', async () => {
  const s = mkStore('cm-f'); const o = mkOrder(s, { status: 'confirmed' });
  let d = (await call('GET', `/orders/${o}`)).json.payout;
  assert.equal(d.due, 920); assert.equal(d.paid, 0); assert.equal(d.owedBack, 0);
  const p = await call('POST', `/orders/${o}/shop-payout`, { paid: true });
  assert.equal(p.status, 200); assert.equal(p.json.paid, 920); assert.ok(p.json.paidAt);
  // rate changes later: what was paid stays as it was
  await call('PUT', '/commission/settings', { defaultRate: 5 });
  assert.equal((await call('GET', `/orders/${o}`)).json.payout.paid, 920);
  await call('PUT', '/commission/settings', { defaultRate: 8 });
  // the order is cancelled after the shop was paid → Twist must get 920 back
  q.run("UPDATE orders SET status='cancelled' WHERE id=?", [o]);
  d = (await call('GET', `/orders/${o}`)).json.payout;
  assert.equal(d.owedBack, 920);
  const rep = await call('GET', '/commission?days=365');
  assert.ok(rep.json.clawbacks.some((x) => x.id === o && x.owedBack === 920));
  // un-marking clears it
  await call('POST', `/orders/${o}/shop-payout`, { paid: false });
  assert.equal((await call('GET', `/orders/${o}`)).json.payout.owedBack, 0);
  assert.equal((await call('POST', '/orders/999999/shop-payout', { paid: true })).status, 404);
});

test('a free-shipping coupon is not a product discount; a platform % coupon and a campaign are; base never exceeds the products', async () => {
  const s = mkStore('cm-g');
  insert('platform_coupons', { code: 'FREESHIP', type: 'free_shipping', value: 0, active: 1, title_ar: 'ش', title_en: 'S' });
  // platform_discount carries the 30 shipping fee for a free-shipping coupon; the shop's own promo discount is 100
  assert.equal(settleCommission(mkOrder(s, { discount: 100, platform_discount: 30, coupon_code: 'FREESHIP' })).amount, 72); // (1000-100)*8%
  insert('platform_coupons', { code: 'TEN', type: 'percentage', value: 10, active: 1, title_ar: 'ع', title_en: 'T' });
  assert.equal(settleCommission(mkOrder(s, { discount: 100, platform_discount: 100, coupon_code: 'TEN' })).amount, 80); // Twist paid it: shop is whole
  assert.equal(settleCommission(mkOrder(s, { discount: 190, platform_discount: 90, campaign_discount: 90 })).amount, 72);
  assert.ok(settleCommission(mkOrder(s, { discount: 50, platform_discount: 900 })).amount <= 80); // never above the products
});

test('the rate is frozen when the shop is paid; paying a cancelled order is refused; orders before the launch date are not charged', async () => {
  const s = mkStore('cm-h'); const o = mkOrder(s, { status: 'confirmed' });
  assert.equal((await call('POST', `/orders/${o}/shop-payout`, { paid: true })).json.paid, 920);
  await call('PUT', '/commission/settings', { defaultRate: 5 });
  q.run("UPDATE orders SET status='delivered' WHERE id=?", [o]);
  assert.equal(settleCommission(o).rate, 8); // delivery does not re-price what was paid
  assert.equal((await call('GET', `/orders/${o}`)).json.payout.due, 920);
  await call('PUT', '/commission/settings', { defaultRate: 8 });
  const c = mkOrder(s, { status: 'cancelled' });
  assert.equal((await call('POST', `/orders/${c}/shop-payout`, { paid: true })).status, 409);
  q.run("UPDATE app_settings SET value='2999-01-01' WHERE key='commission_start'");
  const old = mkOrder(s); const { commissionReport } = await import('../src/lib/commission.js'); commissionReport('2000-01-01');
  assert.equal(q.get('SELECT commission_amount a FROM orders WHERE id=?', [old]).a, null);
  q.run("UPDATE app_settings SET value='2000-01-01' WHERE key='commission_start'");
});

test('in-store pickup reservations carry no commission and no shop payout', async () => {
  const s = mkStore('cm-i'); const o = mkOrder(s, { delivery_by: 'pickup' });
  assert.equal(settleCommission(o), null);
  assert.equal((await call('GET', `/orders/${o}`)).json.payout.applies, false);
});
