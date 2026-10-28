// Regression tests for cashier bugs found in review: double-sold reservations, reservations expired before an offline
// sale arrived, late sales in a closed shift, duplicate cash movements, clock-change days, and the reprinted receipt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-pos-fixes-'));
process.env.DB_FILE = path.join(tmp, 'test.db');
const { q } = await import('../src/db/index.js');
const pos = await import('../src/lib/pos.js');
const { expireReservations, reserveRecord } = await import('../src/lib/reserve.js');

q.run("INSERT INTO users(name,email,password_hash) VALUES('Ali','a@x.com','x')");
const storeId = Number(q.run("INSERT INTO stores(owner_id,slug,code,name_ar,name_en) VALUES(1,'a','A','a','a')").lastInsertRowid);
const store = q.get('SELECT * FROM stores WHERE id=?', [storeId]);
const prod = (slug, stock, price = 100) => Number(q.run('INSERT INTO products(store_id,slug,name_ar,name_en,price,stock) VALUES(?,?,?,?,?,?)', [storeId, slug, slug, slug, price, stock]).lastInsertRowid);
const stock = (id) => q.val('SELECT stock FROM products WHERE id=?', [id]);
let on = 0;
function reserve(pid, qty, { status = 'confirmed', until = new Date(Date.now() + 3600e3).toISOString(), phone = '01000000000' } = {}) {
  let cid = q.val('SELECT id FROM customers WHERE store_id=? AND phone=?', [storeId, phone]);
  if (!cid) cid = Number(q.run('INSERT INTO customers(store_id,name,phone) VALUES(?,?,?)', [storeId, 'C', phone]).lastInsertRowid);
  const oid = Number(q.run("INSERT INTO orders(store_id,number,customer_id,customer_name,phone,status,delivery_by,payment_method,subtotal,total,reserve_until) VALUES(?,?,?,?,?,?,'pickup','in_store',?,?,?)",
    [storeId, `A-${++on}`, cid, 'C', phone, status, 100 * qty, 100 * qty, until]).lastInsertRowid);
  q.run('INSERT INTO order_items(order_id,product_id,name_ar,name_en,price,qty) VALUES(?,?,?,?,?,?)', [oid, pid, 'x', 'x', 100, qty]);
  q.run('UPDATE products SET stock=MAX(0,stock-?), sold_count=sold_count+? WHERE id=?', [qty, qty, pid]);
  return oid;
}
let u = 0;
const sale = (o = {}) => ({ uuid: `fx-${++u}`, createdAt: new Date().toISOString(), items: [], discount: 0, payments: [{ method: 'cash', amount: 100 }], ...o });

test('a reservation sold at two registers takes its piece only once', () => {
  const p = prod('two-registers', 3);
  const oid = reserve(p, 1); // 2 left on the shelf for others
  pos.saveSale(store, sale({ items: [{ productId: p, qty: 1, price: 100 }], reservationId: oid }));
  assert.equal(stock(p), 2);
  // register B had an old list and sells the same reservation again: this is a second, real piece
  const second = pos.saveSale(store, sale({ items: [{ productId: p, qty: 1, price: 100 }], reservationId: oid }));
  assert.equal(stock(p), 1);
  assert.equal(q.val('SELECT COUNT(*) FROM pos_sales WHERE order_id=?', [oid]), 1);
  assert.equal(second.reservationNumber, undefined);
});

test('a reservation marked collected on the dashboard still covers its piece at the cashier', () => {
  const p = prod('dashboard-collected', 3);
  const oid = reserve(p, 1);
  q.run("UPDATE orders SET status='delivered' WHERE id=?", [oid]);
  pos.saveSale(store, sale({ items: [{ productId: p, qty: 1, price: 100 }], reservationId: oid }));
  assert.equal(stock(p), 2);
});

test('a reservation that ran out before the offline sale arrived becomes bought, not a no-show', () => {
  const phone = '01011111111';
  const p = prod('expired-offline', 3);
  const boughtAt = new Date(Date.now() - 60e3).toISOString(); // bought offline a minute ago
  const oid = reserve(p, 1, { until: new Date(Date.now() - 30e3).toISOString(), phone });
  expireReservations(); // the sweeper cancels it ("expired") and puts the piece back
  assert.equal(q.val('SELECT status FROM orders WHERE id=?', [oid]), 'cancelled');
  assert.equal(stock(p), 3);
  pos.saveSale(store, sale({ createdAt: boughtAt, items: [{ productId: p, qty: 1, price: 100 }], reservationId: oid }));
  assert.equal(q.val('SELECT status FROM orders WHERE id=?', [oid]), 'delivered');
  assert.equal(stock(p), 2); // the piece leaves once
  assert.equal(reserveRecord(phone).noShows, 0);
});

test('a reservation cancelled before the sale happened stays cancelled', () => {
  const p = prod('cancelled-before', 3);
  const oid = reserve(p, 1);
  q.run("UPDATE orders SET status='cancelled' WHERE id=?", [oid]);
  q.run("INSERT INTO order_events(order_id,status,note,created_at) VALUES(?,?,?,?)", [oid, 'cancelled', 'unavailable', new Date(Date.now() - 3600e3).toISOString()]);
  q.run('UPDATE products SET stock=stock+1 WHERE id=?', [p]);
  pos.saveSale(store, sale({ items: [{ productId: p, qty: 1, price: 100 }], reservationId: oid }));
  assert.equal(q.val('SELECT status FROM orders WHERE id=?', [oid]), 'cancelled');
  assert.equal(stock(p), 2);
});

test('a late offline sale in a closed shift updates the stored difference', () => {
  const reg = pos.resolveRegister(storeId, 'device-key-123456').register;
  const shift = pos.openShift(storeId, reg.id, 100);
  const p = prod('shift-late', 10);
  const madeAt = new Date(Date.now() - 5000).toISOString();
  pos.saveSale(store, sale({ shiftId: shift.id, items: [{ productId: p, qty: 1, price: 100 }] }));
  const closed = pos.closeShift(storeId, shift.id, 300); // counted 300: includes an offline sale not yet sent
  assert.equal(closed.difference, 100);
  pos.saveSale(store, sale({ shiftId: shift.id, createdAt: madeAt, items: [{ productId: p, qty: 1, price: 100 }] }));
  const row = q.get('SELECT expected_cash, difference FROM pos_shifts WHERE id=?', [shift.id]);
  assert.equal(row.expected_cash, 300);
  assert.equal(row.difference, 0);
});

test('a sale made after its shift was closed elsewhere is kept (moved to the open shift, never refused)', () => {
  const reg = pos.resolveRegister(storeId, 'device-key-abcdef').register;
  const old = pos.openShift(storeId, reg.id, 0);
  pos.closeShift(storeId, old.id, 0);
  const fresh = pos.openShift(storeId, reg.id, 0);
  const p = prod('shift-moved', 5);
  const out = pos.saveSale(store, sale({ shiftId: old.id, createdAt: new Date(Date.now() + 2000).toISOString(), items: [{ productId: p, qty: 1, price: 100 }] }));
  assert.equal(out.shiftId, fresh.id);
});

test('the same cash movement sent twice is recorded once', () => {
  const reg = pos.resolveRegister(storeId, 'device-key-cashmove').register;
  const shift = pos.openShift(storeId, reg.id, 1000);
  pos.addCashMovement(storeId, shift.id, { kind: 'out', amount: 500, reason: 'مصاريف', uuid: 'mv-1-abcdef' });
  const again = pos.addCashMovement(storeId, shift.id, { kind: 'out', amount: 500, reason: 'مصاريف', uuid: 'mv-1-abcdef' });
  assert.equal(again.duplicate, true);
  assert.equal(pos.readShift(storeId, shift.id).cashOut, 500);
});

test('day reports follow Cairo clock changes (23 and 25 hour days)', () => {
  const p = prod('dst', 100);
  // 2026-10-29 23:30 Cairo, after the clock went back at midnight → still the 29th (UTC+2 by then: 21:30Z)
  const lateOctober = pos.saveSale(store, sale({ createdAt: '2026-10-29T21:30:00Z', items: [{ productId: p, qty: 1, price: 100 }] }));
  const d29 = pos.listSales(storeId, { day: '2026-10-29' }).map((s) => s.id);
  const d30 = pos.listSales(storeId, { day: '2026-10-30' }).map((s) => s.id);
  assert.ok(d29.includes(lateOctober.id));
  assert.ok(!d30.includes(lateOctober.id));
  // 2026-04-23 23:30 Cairo (UTC+2 before the clock goes forward) → only the 23rd
  const april = pos.saveSale(store, sale({ createdAt: '2026-04-23T21:30:00Z', items: [{ productId: p, qty: 1, price: 100 }] }));
  assert.ok(pos.listSales(storeId, { day: '2026-04-23' }).some((s) => s.id === april.id));
  assert.ok(!pos.listSales(storeId, { day: '2026-04-24' }).some((s) => s.id === april.id));
});

test('a reprinted receipt shows the cash handed over when the change used it all', () => {
  const p = prod('receipt', 5, 300);
  const out = pos.saveSale(store, sale({ items: [{ productId: p, qty: 1, price: 300 }], payments: [{ method: 'card', amount: 300 }, { method: 'cash', amount: 50 }] }));
  assert.equal(out.change, 50);
  assert.deepEqual(out.payments.map((x) => [x.method, x.amount]), [['card', 300], ['cash', 50]]);
  // the drawer total still only counts what stayed in it
  assert.equal(q.val("SELECT COALESCE(SUM(amount),0) FROM pos_payments WHERE sale_id=? AND method='cash'", [out.id]), 0);
});
