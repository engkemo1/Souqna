import { q, tx } from '../db/index.js';
import { cashierAccess } from './cashier-access.js';
import { AppError } from './errors.js';
import { mediaMap } from './media.js';

/**
 * The Twist cashier. Sales are made on the device (possibly offline) and arrive later, one by one, with a uuid.
 * The server is the only place that assigns the official invoice number and changes stock.
 */

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const cairoDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

/** May this store use the Twist cashier? `deviceAt` lets sales made before the subscription ended still arrive after it. */
export function posGate(storeId, { deviceAt = null, sync = false } = {}) {
  const link = q.get('SELECT cashier_id AS cashierId FROM store_cashier_links WHERE store_id=?', [storeId]);
  const a = cashierAccess(storeId);
  if (link && link.cashierId !== 'twist' && a.state !== 'off') throw new AppError(403, 'pos_not_twist', 'This store uses another cashier program.');
  if (a.allowed) return a;
  // Offline sales made before the end date (+ grace) are real money and must not be lost.
  if (sync && a.state === 'expired' && a.endsAt && deviceAt) {
    const last = addDays(a.endsAt, a.graceDays);
    if (cairoDay(deviceAt) <= last) return a;
  }
  throw new AppError(403, `cashier_${a.state}`, a.state === 'expired' ? 'The cashier subscription has ended. Contact Twist to renew.' : 'The cashier is not active for this store.');
}

const sqlTime = (iso) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
const isoTime = (t) => (t ? `${String(t).replace(' ', 'T')}Z` : t);
const money = (n) => Math.round(Number(n) || 0);
const key = (productId, variantId) => `${productId}:${variantId || 0}`;

/* ------------------------------------------------------------------ register and shift cash control */

function shiftTotals(storeId, shift) {
  const cashSales = q.val("SELECT COALESCE(SUM(pp.amount),0) FROM pos_payments pp JOIN pos_sales s ON s.id=pp.sale_id WHERE s.store_id=? AND s.shift_id=? AND pp.method='cash'", [storeId, shift.id]) || 0;
  const cashRefunds = q.val("SELECT COALESCE(SUM(refund),0) FROM pos_returns WHERE store_id=? AND shift_id=? AND method='cash'", [storeId, shift.id]) || 0;
  const cashIn = q.val("SELECT COALESCE(SUM(amount),0) FROM pos_cash_movements WHERE store_id=? AND shift_id=? AND kind='in'", [storeId, shift.id]) || 0;
  const cashOut = q.val("SELECT COALESCE(SUM(amount),0) FROM pos_cash_movements WHERE store_id=? AND shift_id=? AND kind='out'", [storeId, shift.id]) || 0;
  const expectedCash = shift.opening_cash + cashSales - cashRefunds + cashIn - cashOut;
  return { openingCash: shift.opening_cash, cashSales, cashRefunds, cashIn, cashOut, expectedCash };
}

export function resolveRegister(storeId, deviceKey, name = 'الكاشير الرئيسي') {
  q.run('INSERT OR IGNORE INTO pos_registers(store_id,device_key,name) VALUES(?,?,?)', [storeId, deviceKey, name]);
  const register = q.get('SELECT id, name FROM pos_registers WHERE store_id=? AND device_key=?', [storeId, deviceKey]);
  q.run("UPDATE pos_registers SET last_seen_at=datetime('now') WHERE id=?", [register.id]);
  const shift = q.get("SELECT * FROM pos_shifts WHERE store_id=? AND register_id=? AND state='open' ORDER BY id DESC LIMIT 1", [storeId, register.id]);
  const lastShift = q.get('SELECT * FROM pos_shifts WHERE store_id=? AND register_id=? ORDER BY id DESC LIMIT 1', [storeId, register.id]);
  return { register, shift: shift ? { id: shift.id, state: shift.state, openedAt: isoTime(shift.opened_at), openedBy: shift.opened_by, ...shiftTotals(storeId, shift) } : null, lastShift: lastShift ? readShift(storeId, lastShift.id) : null };
}

export function openShift(storeId, registerId, openingCash, cashierName = '') {
  const register = q.get('SELECT id FROM pos_registers WHERE id=? AND store_id=?', [registerId, storeId]);
  if (!register) throw new AppError(404, 'register_not_found', 'Cashier device not found.');
  if (q.get("SELECT id FROM pos_shifts WHERE register_id=? AND state='open'", [registerId])) throw new AppError(409, 'shift_already_open', 'This register already has an open shift.');
  const id = Number(q.run('INSERT INTO pos_shifts(store_id,register_id,opening_cash,opened_by) VALUES(?,?,?,?)', [storeId, registerId, openingCash, cashierName]).lastInsertRowid);
  const shift = q.get('SELECT * FROM pos_shifts WHERE id=?', [id]);
  return { id, state: 'open', openedAt: isoTime(shift.opened_at), openedBy: shift.opened_by, ...shiftTotals(storeId, shift) };
}

function openShiftRow(storeId, shiftId) {
  const shift = q.get("SELECT * FROM pos_shifts WHERE id=? AND store_id=? AND state='open'", [shiftId, storeId]);
  if (!shift) throw new AppError(409, 'shift_not_open', 'افتح وردية جديدة قبل تسجيل حركة نقدية.');
  return shift;
}

export function addCashMovement(storeId, shiftId, { kind, amount, reason }, cashierName = '') {
  openShiftRow(storeId, shiftId);
  const id = Number(q.run('INSERT INTO pos_cash_movements(store_id,shift_id,kind,amount,reason,created_by) VALUES(?,?,?,?,?,?)', [storeId, shiftId, kind, amount, reason, cashierName]).lastInsertRowid);
  return { id, kind, amount, reason, createdBy: cashierName, createdAt: new Date().toISOString() };
}

export function closeShift(storeId, shiftId, countedCash, cashierName = '', note = '') {
  const shift = openShiftRow(storeId, shiftId);
  const totals = shiftTotals(storeId, shift);
  const difference = countedCash - totals.expectedCash;
  q.run("UPDATE pos_shifts SET state='closed',closed_by=?,closed_at=datetime('now'),counted_cash=?,expected_cash=?,difference=?,note=? WHERE id=? AND state='open'",
    [cashierName, countedCash, totals.expectedCash, difference, note, shiftId]);
  const closed = q.get('SELECT closed_at FROM pos_shifts WHERE id=?', [shiftId]);
  return { ...shift, state: 'closed', closedBy: cashierName, closedAt: isoTime(closed.closed_at), countedCash, difference, note, ...totals };
}

export function readShift(storeId, shiftId) {
  const shift = q.get('SELECT * FROM pos_shifts WHERE id=? AND store_id=?', [shiftId, storeId]);
  if (!shift) return null;
  const movements = q.all('SELECT id,kind,amount,reason,created_by AS createdBy,created_at AS createdAt FROM pos_cash_movements WHERE shift_id=? ORDER BY id', [shiftId]);
  return { id: shift.id, state: shift.state, openedAt: isoTime(shift.opened_at), closedAt: isoTime(shift.closed_at), openedBy: shift.opened_by, closedBy: shift.closed_by, countedCash: shift.counted_cash, difference: shift.difference, note: shift.note, movements, ...shiftTotals(storeId, shift) };
}

/** Receive new stock at the register and leave an auditable movement. */
export function receiveStock(storeId, { uuid, productId, variantId = null, quantity, note = '' }) {
  return tx(() => {
    const existing = q.get('SELECT product_id AS productId, variant_id AS variantId, quantity, note FROM pos_stock_receipts WHERE store_id=? AND uuid=?', [storeId, uuid]);
    if (existing) {
      if (existing.productId !== productId || existing.variantId !== variantId || existing.quantity !== quantity || existing.note !== note) throw new AppError(409, 'stock_receipt_key_reused', 'رقم عملية الاستلام اتستخدم قبل كده لبيانات مختلفة.');
      return { productId, variantId, quantity, duplicate: true };
    }
    const product = q.get('SELECT id, track_stock AS track FROM products WHERE id=? AND store_id=?', [productId, storeId]);
    if (!product) throw new AppError(404, 'product_not_found', 'الصنف مش موجود في المحل.');
    if (!product.track) throw new AppError(409, 'stock_untracked', 'الصنف ده مش بيتابع رصيد المخزون.');
    const hasVariants = q.val('SELECT COUNT(*) FROM variants WHERE product_id=?', [productId]) > 0;
    if (hasVariants && !variantId) throw new AppError(422, 'variant_required', 'اختار اللون أو المقاس الأول.');
    if (!hasVariants && variantId) throw new AppError(422, 'invalid_variant', 'الصنف ده ملوش ألوان أو مقاسات.');
    if (variantId && !q.get('SELECT id FROM variants WHERE id=? AND product_id=?', [variantId, productId])) throw new AppError(404, 'variant_not_found', 'اللون أو المقاس مش موجود.');
    if (variantId) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [quantity, variantId]);
    else q.run('UPDATE products SET stock=stock+? WHERE id=?', [quantity, productId]);
    if (hasVariants) recompute(productId);
    q.run('INSERT INTO pos_stock_receipts(store_id,uuid,product_id,variant_id,quantity,note) VALUES(?,?,?,?,?,?)', [storeId, uuid, productId, variantId, quantity, note]);
    q.run("INSERT INTO stock_movements(store_id,product_id,variant_id,delta,reason,ref) VALUES(?,?,?,?,?,?)", [storeId, productId, variantId, quantity, 'pos_receive', uuid]);
    return { productId, variantId, quantity };
  });
}

/** Open "reserve & try in store" requests: the pieces are already taken out of stock and wait in the shop for the shopper. */
export function openReservations(storeId) {
  const orders = q.all("SELECT id, number, customer_name AS name, phone, status, reserve_until AS until, total FROM orders WHERE store_id=? AND delivery_by='pickup' AND status IN ('pending','confirmed') ORDER BY created_at LIMIT 200", [storeId]);
  for (const o of orders) {
    o.items = q.all('SELECT product_id AS productId, variant_id AS variantId, name_ar AS name, color, size, price, qty FROM order_items WHERE order_id=? ORDER BY id', [o.id])
      .map((i) => ({ ...i, color: i.color || '', size: i.size || '' }));
  }
  return orders;
}

const recompute = (productId) => q.run("UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=?), updated_at=datetime('now') WHERE id=?", [productId, productId]);

/** Everything the screen needs to sell without the internet. */
export function bootstrap(store) {
  const products = q.all(`SELECT p.id, p.name_ar AS name, p.sku, p.barcode, p.price, p.track_stock AS trackStock, p.stock, p.low_stock_at AS lowStockAt,
      p.sold_count AS sold, c.name_ar AS category,
      (SELECT media_id FROM product_media pm WHERE pm.product_id=p.id ORDER BY pm.is_primary DESC, pm.position LIMIT 1) AS mediaId
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.store_id=? AND p.status='active' ORDER BY p.name_ar LIMIT 5000`, [store.id]);
  const photos = mediaMap(products.map((p) => p.mediaId));
  const vs = q.all('SELECT v.id, v.product_id AS productId, v.color, v.size, v.sku, v.barcode, v.stock FROM variants v JOIN products p ON p.id=v.product_id WHERE p.store_id=?', [store.id]);
  const by = new Map();
  for (const v of vs) { if (!by.has(v.productId)) by.set(v.productId, []); by.get(v.productId).push({ id: v.id, color: v.color || '', size: v.size || '', sku: v.sku || '', barcode: v.barcode || '', stock: v.stock }); }
  const nextNumber = (q.val('SELECT COALESCE(MAX(number),0) FROM pos_sales WHERE store_id=?', [store.id]) || 0) + 1;
  const reservations = openReservations(store.id);
  const held = new Map(); // how many pieces of each item are waiting for a reservation
  const hold = (k, n) => held.set(k, (held.get(k) || 0) + n);
  for (const o of reservations) for (const i of o.items) { hold(key(i.productId, i.variantId), i.qty); if (i.variantId) hold(key(i.productId, null), i.qty); }
  const withHeld = (x, pid, vid) => { const n = held.get(key(pid, vid)); return n ? { ...x, held: n } : x; };
  return {
    store: { id: store.id, name: store.name_ar || store.name_en || '', slug: store.slug },
    products: products.map((p) => withHeld({ id: p.id, name: p.name, sku: p.sku || '', barcode: p.barcode || '', price: p.price, track: !!p.trackStock, stock: p.stock, lowStockAt: p.lowStockAt, sold: p.sold || 0, category: p.category || '', image: photos.get(p.mediaId) || null, variants: (by.get(p.id) || []).map((v) => withHeld(v, p.id, v.id)) }, p.id, null)),
    reservations,
    nextNumber,
    serverTime: new Date().toISOString(),
  };
}

/** Stores one sale. Safe to call again with the same uuid: the second call just returns the first invoice. */
export function saveSale(store, input, cashierName = '') {
  const existing = q.get('SELECT id, number FROM pos_sales WHERE store_id=? AND uuid=?', [store.id, input.uuid]);
  if (existing) return { duplicate: true, ...readSale(store.id, existing.id) };
  const shiftId = input.shiftId ?? null;
  if (shiftId) {
    const shift = q.get('SELECT id,state,closed_at,register_id FROM pos_shifts WHERE id=? AND store_id=?', [shiftId, store.id]);
    if (!shift) throw new AppError(422, 'invalid_shift', 'الوردية المرتبطة بالفاتورة مش موجودة.');
    const beforeClose = shift.state === 'closed' && shift.closed_at && Date.parse(input.createdAt) <= Date.parse(`${shift.closed_at.replace(' ', 'T')}Z`);
    if (shift.state !== 'open' && !beforeClose) throw new AppError(409, 'shift_closed', 'الوردية اتقفلت قبل وقت البيع ده.');
  }

  return tx(() => {
    const lines = [];
    const seenLines = new Set();
    for (const it of input.items) {
      const lineKey = key(it.productId, it.variantId);
      if (seenLines.has(lineKey)) throw new AppError(422, 'duplicate_sale_line', 'الصنف أو المقاس مكرر في الفاتورة. اجمع الكمية في سطر واحد.');
      seenLines.add(lineKey);
      const p = q.get('SELECT id, name_ar AS name, sku, barcode, track_stock AS track, stock FROM products WHERE id=? AND store_id=?', [it.productId, store.id]);
      if (!p) throw new AppError(422, 'unknown_product', `A product in this sale no longer exists (#${it.productId}).`);
      const hasVariants = q.val('SELECT COUNT(*) FROM variants WHERE product_id=?', [p.id]) > 0;
      let v = null;
      if (it.variantId) {
        v = q.get('SELECT id, color, size, sku, barcode, stock FROM variants WHERE id=? AND product_id=?', [it.variantId, p.id]);
        if (!v) throw new AppError(422, 'unknown_variant', `A size/colour in this sale no longer exists (#${it.variantId}).`);
      } else if (hasVariants) {
        throw new AppError(422, 'variant_required', `Choose a size/colour for "${p.name}".`);
      }
      const qty = Math.floor(it.qty);
      const gross = money(it.price) * qty;
      const lineDiscount = Math.min(money(it.discount), gross);
      lines.push({ p, v, qty, price: money(it.price), lineDiscount, net: gross - lineDiscount });
    }
    const subtotal = lines.reduce((s, l) => s + l.net, 0);
    const discount = Math.min(money(input.discount), subtotal);
    const total = subtotal - discount;
    const paid = input.payments.reduce((s, p) => s + money(p.amount), 0);
    if (paid < total) throw new AppError(422, 'underpaid', 'The paid amount is less than the invoice total.');
    const cashPaid = input.payments.filter((p) => p.method === 'cash').reduce((s, p) => s + money(p.amount), 0);
    if (paid - total > cashPaid) throw new AppError(422, 'change_requires_cash', 'The change exceeds the cash tendered; card and wallet overpayments cannot be refunded as cash.');
    const change = Math.min(paid - total, cashPaid); // change can only come out of cash

    const number = (q.val('SELECT COALESCE(MAX(number),0) FROM pos_sales WHERE store_id=?', [store.id]) || 0) + 1;

    // A shopper who reserved online came to the shop. Those pieces already left the stock when they reserved,
    // so they must not be taken out a second time. A reservation that was cancelled meanwhile gave its pieces back:
    // then the sale takes them out normally.
    const order = input.reservationId ? q.get("SELECT * FROM orders WHERE id=? AND store_id=? AND delivery_by='pickup'", [input.reservationId, store.id]) : null;
    const reserved = new Map();
    const orderItems = order && ['pending', 'confirmed', 'delivered'].includes(order.status) ? q.all('SELECT * FROM order_items WHERE order_id=?', [order.id]) : [];
    for (const i of orderItems) reserved.set(key(i.product_id, i.variant_id), (reserved.get(key(i.product_id, i.variant_id)) || 0) + i.qty);
    for (const l of lines) {
      const k = key(l.p.id, l.v?.id);
      l.covered = Math.min(l.qty, reserved.get(k) || 0);
      if (l.covered) reserved.set(k, reserved.get(k) - l.covered);
    }

    const saleId = Number(q.run(
      `INSERT INTO pos_sales(store_id, uuid, number, local_no, subtotal, discount, total, paid, change_due, cashier_name, customer_name, customer_phone, note, device_at, order_id, shift_id)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [store.id, input.uuid, number, input.localNo || '', subtotal, discount, total, paid, change, cashierName, input.customerName || order?.customer_name || '', input.customerPhone || order?.phone || '', input.note || '', sqlTime(input.createdAt), order?.id ?? null, shiftId]).lastInsertRowid);

    const touched = new Set();
    for (const l of lines) {
      const target = l.v || l.p;
      const tracked = !!l.p.track;
      const fresh = l.qty - l.covered; // pieces that were not waiting for this reservation
      const over = tracked && fresh > target.stock;
      if (tracked && fresh > 0) {
        const next = Math.max(0, target.stock - fresh);
        if (l.v) { q.run('UPDATE variants SET stock=? WHERE id=?', [next, l.v.id]); touched.add(l.p.id); }
        else q.run('UPDATE products SET stock=? WHERE id=?', [next, l.p.id]);
        q.run('INSERT INTO stock_movements(store_id, product_id, variant_id, delta, reason, ref) VALUES(?,?,?,?,?,?)', [store.id, l.p.id, l.v?.id ?? null, -Math.min(fresh, target.stock), 'pos_sale', `#${number}`]);
      }
      if (fresh > 0) q.run("UPDATE products SET sold_count=sold_count+?, updated_at=datetime('now') WHERE id=?", [fresh, l.p.id]);
      q.run(
        `INSERT INTO pos_sale_items(sale_id, product_id, variant_id, name, color, size, sku, barcode, price, qty, discount, oversold) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [saleId, l.p.id, l.v?.id ?? null, l.p.name, l.v?.color || '', l.v?.size || '', l.v?.sku || l.p.sku || '', l.v?.barcode || l.p.barcode || '', l.price, l.qty, l.lineDiscount, over ? 1 : 0]);
    }
    if (order && ['pending', 'confirmed'].includes(order.status)) closeReservation(store, order, orderItems, reserved, number);
    for (const id of touched) recompute(id);
    // change is taken out of the cash line so the day's cash total is what really sits in the drawer
    let giveBack = change;
    for (const p of input.payments) {
      let amt = money(p.amount);
      if (p.method === 'cash' && giveBack > 0) { const cut = Math.min(giveBack, amt); amt -= cut; giveBack -= cut; }
      if (amt > 0) q.run('INSERT INTO pos_payments(sale_id, method, amount) VALUES(?,?,?)', [saleId, p.method, amt]);
    }
    return { duplicate: false, ...readSale(store.id, saleId) };
  });
}

/**
 * The reservation ends as "bought in the shop". Pieces the shopper tried and left go back on sale, and the order keeps
 * only what was really bought, so the shop's online reports and the shopper's page tell the truth.
 */
function closeReservation(store, order, orderItems, left, number) {
  const now = new Date().toISOString();
  let subtotal = 0;
  for (const i of orderItems) {
    const k = key(i.product_id, i.variant_id);
    const back = Math.min(i.qty, left.get(k) || 0);
    if (back) left.set(k, left.get(k) - back);
    if (back) {
      if (i.variant_id) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [back, i.variant_id]);
      q.run('UPDATE products SET stock=stock+?, sold_count=MAX(0,sold_count-?) WHERE id=?', [back, back, i.product_id]);
      if (i.variant_id) recompute(i.product_id);
      if (back === i.qty) q.run('DELETE FROM order_items WHERE id=?', [i.id]);
      else q.run('UPDATE order_items SET qty=? WHERE id=?', [i.qty - back, i.id]);
    }
    subtotal += i.price * (i.qty - back);
  }
  if (!subtotal) {
    // nothing of the reservation was bought (they took something else): it simply ends, without counting as a no-show
    q.run("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?", [now, order.id]);
    q.run('INSERT INTO order_events(order_id, status, note, created_at) VALUES(?,?,?,?)', [order.id, 'cancelled', `pos #${number}`, now]);
    if (order.customer_id) q.run('UPDATE customers SET orders_count=MAX(0,orders_count-1), total_spent=MAX(0,total_spent-?) WHERE id=?', [order.total, order.customer_id]);
    return;
  }
  q.run("UPDATE orders SET status='delivered', subtotal=?, total=?, updated_at=? WHERE id=?", [subtotal, subtotal, now, order.id]);
  q.run('INSERT INTO order_events(order_id, status, note, created_at) VALUES(?,?,?,?)', [order.id, 'delivered', `pos #${number}`, now]);
  if (order.customer_id && subtotal !== order.total) q.run('UPDATE customers SET total_spent=MAX(0,total_spent-?) WHERE id=?', [order.total - subtotal, order.customer_id]);
}

export function readSale(storeId, id) {
  const s = q.get(
    `SELECT id, uuid, number, local_no AS localNo, subtotal, discount, total, paid, change_due AS change, cashier_name AS cashier, customer_name AS customerName, customer_phone AS customerPhone, note, device_at AS createdAt, shift_id AS shiftId,
       (SELECT o.number FROM orders o WHERE o.id=pos_sales.order_id) AS reservationNumber
     FROM pos_sales WHERE id=? AND store_id=?`, [id, storeId]);
  if (!s) return null;
  if (!s.reservationNumber) delete s.reservationNumber;
  s.createdAt = isoTime(s.createdAt);
  s.items = q.all('SELECT id, product_id AS productId, variant_id AS variantId, name, color, size, sku, barcode, price, qty, discount, returned_qty AS returnedQty, oversold FROM pos_sale_items WHERE sale_id=? ORDER BY id', [id]);
  s.payments = q.all('SELECT method, amount FROM pos_payments WHERE sale_id=? ORDER BY id', [id]);
  s.returns = q.all('SELECT id, refund, method, reason, created_at AS createdAt FROM pos_returns WHERE sale_id=? ORDER BY id', [id]).map((r) => ({ ...r, createdAt: isoTime(r.createdAt) }));
  return s;
}

export const saleIdByNumber = (storeId, number) => q.val('SELECT id FROM pos_sales WHERE store_id=? AND number=?', [storeId, number]);

/** Return some or all of a sale. Online only. Quantities are checked against what was sold minus what already came back. */
export function saveReturn(store, input, cashierName = '') {
  const dup = q.get('SELECT id, sale_id AS saleId, refund FROM pos_returns WHERE store_id=? AND uuid=?', [store.id, input.uuid]);
  if (dup) return { duplicate: true, refund: dup.refund, sale: readSale(store.id, dup.saleId) };
  const sale = q.get('SELECT id, number, subtotal, discount FROM pos_sales WHERE id=? AND store_id=?', [input.saleId, store.id]);
  if (!sale) throw new AppError(404, 'not_found', 'Invoice not found.');
  return tx(() => {
    let refund = 0; const touched = new Set(); const rows = [];
    const seenItems = new Set();
    const allItems = q.all('SELECT id, price, qty, discount FROM pos_sale_items WHERE sale_id=? ORDER BY id', [sale.id]);
    const baseSubtotal = allItems.reduce((sum, item) => sum + item.price * item.qty - item.discount, 0);
    const discountBudget = Math.min(sale.discount, baseSubtotal);
    const allocations = allItems.map((item) => {
      const net = item.price * item.qty - item.discount;
      const exact = baseSubtotal > 0 ? (net * discountBudget) / baseSubtotal : 0;
      const floor = Math.floor(exact);
      return { id: item.id, net, share: floor, remainder: exact - floor };
    });
    let undistributed = discountBudget - allocations.reduce((sum, item) => sum + item.share, 0);
    for (const item of [...allocations].sort((a, b) => b.remainder - a.remainder || a.id - b.id).slice(0, undistributed)) item.share++;
    const discountByLine = new Map(allocations.map((item) => [item.id, item.share]));
    for (const r of input.items) {
      if (seenItems.has(r.saleItemId)) throw new AppError(422, 'duplicate_return_item', 'سطر الفاتورة مكرر في المرتجع. اجمع الكمية في سطر واحد.');
      seenItems.add(r.saleItemId);
      const it = q.get('SELECT * FROM pos_sale_items WHERE id=? AND sale_id=?', [r.saleItemId, sale.id]);
      if (!it) throw new AppError(422, 'bad_item', 'This line is not on the invoice.');
      const qty = Math.floor(r.qty);
      if (qty > it.qty - it.returned_qty) throw new AppError(422, 'too_many', `Only ${it.qty - it.returned_qty} of "${it.name}" can still be returned.`);
      // the customer gets back what they paid for that piece, including their share of the invoice discount
      const lineNet = it.price * it.qty - it.discount;
      // Allocate integer-pound rounding cumulatively so several partial returns can never refund more than this line's net.
      const refundable = Math.max(0, lineNet - (discountByLine.get(it.id) || 0));
      const before = it.returned_qty;
      const after = before + qty;
      const amount = Math.round((refundable * after) / it.qty) - Math.round((refundable * before) / it.qty);
      rows.push({ it, qty, amount }); refund += amount;
    }
    const shiftId = input.shiftId ?? null;
    if (shiftId) openShiftRow(store.id, shiftId);
    const returnId = Number(q.run('INSERT INTO pos_returns(store_id, sale_id, uuid, refund, method, reason, cashier_name, shift_id) VALUES(?,?,?,?,?,?,?,?)', [store.id, sale.id, input.uuid, refund, input.method, input.reason || '', cashierName, shiftId]).lastInsertRowid);
    for (const { it, qty, amount } of rows) {
      q.run('UPDATE pos_sale_items SET returned_qty=returned_qty+? WHERE id=?', [qty, it.id]);
      q.run('INSERT INTO pos_return_items(return_id, sale_item_id, qty, amount) VALUES(?,?,?,?)', [returnId, it.id, qty, amount]);
      const p = it.product_id ? q.get('SELECT id, track_stock AS track FROM products WHERE id=? AND store_id=?', [it.product_id, store.id]) : null;
      if (p) {
        if (p.track && input.restock) {
          if (it.variant_id) { q.run('UPDATE variants SET stock=stock+? WHERE id=?', [qty, it.variant_id]); touched.add(p.id); }
          else q.run('UPDATE products SET stock=stock+? WHERE id=?', [qty, p.id]);
          q.run('INSERT INTO stock_movements(store_id, product_id, variant_id, delta, reason, ref) VALUES(?,?,?,?,?,?)', [store.id, p.id, it.variant_id, qty, 'pos_return', `#${sale.number}`]);
        }
        q.run("UPDATE products SET sold_count=MAX(0, sold_count-?), updated_at=datetime('now') WHERE id=?", [qty, p.id]);
      }
    }
    for (const id of touched) recompute(id);
    return { duplicate: false, refund, sale: readSale(store.id, sale.id) };
  });
}

/** Day totals by payment method. Returns are subtracted on the day they happened. */
export function daySummary(storeId, day) {
  const sales = q.all('SELECT id, total, discount FROM pos_sales WHERE store_id=? AND device_at >= ? AND device_at < ?', [storeId, ...range(day)]);
  const byMethod = { cash: 0, card: 0, wallet: 0 };
  for (const p of q.all(`SELECT p.method, SUM(p.amount) AS amt FROM pos_payments p JOIN pos_sales s ON s.id=p.sale_id WHERE s.store_id=? AND s.device_at >= ? AND s.device_at < ? GROUP BY p.method`, [storeId, ...range(day)])) byMethod[p.method] = p.amt;
  const ret = q.all('SELECT refund, method FROM pos_returns WHERE store_id=? AND created_at >= ? AND created_at < ?', [storeId, ...range(day)]);
  const refunds = ret.reduce((s, r) => s + r.refund, 0);
  for (const r of ret) if (byMethod[r.method] !== undefined) byMethod[r.method] -= r.refund;
  const pieces = q.val('SELECT COALESCE(SUM(i.qty),0) FROM pos_sale_items i JOIN pos_sales s ON s.id=i.sale_id WHERE s.store_id=? AND s.device_at >= ? AND s.device_at < ?', [storeId, ...range(day)]) || 0;
  return { day, invoices: sales.length, pieces, gross: sales.reduce((s, x) => s + x.total, 0), discounts: sales.reduce((s, x) => s + x.discount, 0), refunds, net: sales.reduce((s, x) => s + x.total, 0) - refunds, byMethod };
}
// a Cairo calendar day as UTC bounds (Egypt is UTC+2/+3; we widen by using the offset for that date)
function range(day) {
  const probe = new Date(`${day}T12:00:00Z`);
  const off = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'shortOffset' }).formatToParts(probe).find((x) => x.type === 'timeZoneName').value.replace('GMT', '').replace('+', '') || 2);
  const start = new Date(`${day}T00:00:00Z`).getTime() - off * 3600_000;
  const iso = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
  return [iso(start), iso(start + 86400_000)];
}

export function listSales(storeId, { day = null, limit = 50, beforeId = null }) {
  const [a, b] = day ? range(day) : ['0000', '9999'];
  return q.all(
    `SELECT id, number, local_no AS localNo, total, device_at AS createdAt, customer_name AS customerName,
       (SELECT COUNT(*) FROM pos_returns r WHERE r.sale_id=pos_sales.id) AS returns
     FROM pos_sales WHERE store_id=? AND device_at >= ? AND device_at < ? ${beforeId ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`,
    beforeId ? [storeId, a, b, beforeId, limit] : [storeId, a, b, limit]).map((r) => ({ ...r, createdAt: isoTime(r.createdAt) }));
}
