import { q, tx } from '../db/index.js';
import { cashierAccess } from './cashier-access.js';
import { AppError } from './errors.js';

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
const recompute = (productId) => q.run("UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=?), updated_at=datetime('now') WHERE id=?", [productId, productId]);

/** Everything the screen needs to sell without the internet. */
export function bootstrap(store) {
  const products = q.all("SELECT id, name_ar AS name, sku, barcode, price, track_stock AS trackStock, stock, colors_json AS colors, sizes_json AS sizes FROM products WHERE store_id=? AND status='active' ORDER BY name_ar LIMIT 5000", [store.id]);
  const vs = q.all('SELECT v.id, v.product_id AS productId, v.color, v.size, v.sku, v.barcode, v.stock FROM variants v JOIN products p ON p.id=v.product_id WHERE p.store_id=?', [store.id]);
  const by = new Map();
  for (const v of vs) { if (!by.has(v.productId)) by.set(v.productId, []); by.get(v.productId).push({ id: v.id, color: v.color || '', size: v.size || '', sku: v.sku || '', barcode: v.barcode || '', stock: v.stock }); }
  const nextNumber = (q.val('SELECT COALESCE(MAX(number),0) FROM pos_sales WHERE store_id=?', [store.id]) || 0) + 1;
  return {
    store: { id: store.id, name: store.name_ar || store.name_en || '', slug: store.slug },
    products: products.map((p) => ({ id: p.id, name: p.name, sku: p.sku || '', barcode: p.barcode || '', price: p.price, track: !!p.trackStock, stock: p.stock, variants: by.get(p.id) || [] })),
    nextNumber,
    serverTime: new Date().toISOString(),
  };
}

/** Stores one sale. Safe to call again with the same uuid: the second call just returns the first invoice. */
export function saveSale(store, input, cashierName = '') {
  const existing = q.get('SELECT id, number FROM pos_sales WHERE store_id=? AND uuid=?', [store.id, input.uuid]);
  if (existing) return { duplicate: true, ...readSale(store.id, existing.id) };

  return tx(() => {
    const lines = [];
    for (const it of input.items) {
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
    const change = Math.min(paid - total, cashPaid); // change can only come out of cash

    const number = (q.val('SELECT COALESCE(MAX(number),0) FROM pos_sales WHERE store_id=?', [store.id]) || 0) + 1;
    const saleId = Number(q.run(
      `INSERT INTO pos_sales(store_id, uuid, number, local_no, subtotal, discount, total, paid, change_due, cashier_name, customer_name, customer_phone, note, device_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [store.id, input.uuid, number, input.localNo || '', subtotal, discount, total, paid, change, cashierName, input.customerName || '', input.customerPhone || '', input.note || '', sqlTime(input.createdAt)]).lastInsertRowid);

    const touched = new Set();
    for (const l of lines) {
      const target = l.v || l.p;
      const tracked = !!l.p.track;
      const over = tracked && l.qty > target.stock;
      if (tracked) {
        const next = Math.max(0, target.stock - l.qty);
        if (l.v) { q.run('UPDATE variants SET stock=? WHERE id=?', [next, l.v.id]); touched.add(l.p.id); }
        else q.run('UPDATE products SET stock=? WHERE id=?', [next, l.p.id]);
        q.run('INSERT INTO stock_movements(store_id, product_id, variant_id, delta, reason, ref) VALUES(?,?,?,?,?,?)', [store.id, l.p.id, l.v?.id ?? null, -Math.min(l.qty, target.stock), 'pos_sale', `#${number}`]);
      }
      q.run("UPDATE products SET sold_count=sold_count+?, updated_at=datetime('now') WHERE id=?", [l.qty, l.p.id]);
      q.run(
        `INSERT INTO pos_sale_items(sale_id, product_id, variant_id, name, color, size, sku, barcode, price, qty, discount, oversold) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [saleId, l.p.id, l.v?.id ?? null, l.p.name, l.v?.color || '', l.v?.size || '', l.v?.sku || l.p.sku || '', l.v?.barcode || l.p.barcode || '', l.price, l.qty, l.lineDiscount, over ? 1 : 0]);
    }
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

export function readSale(storeId, id) {
  const s = q.get(
    `SELECT id, uuid, number, local_no AS localNo, subtotal, discount, total, paid, change_due AS change, cashier_name AS cashier, customer_name AS customerName, customer_phone AS customerPhone, note, device_at AS createdAt
     FROM pos_sales WHERE id=? AND store_id=?`, [id, storeId]);
  if (!s) return null;
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
    for (const r of input.items) {
      const it = q.get('SELECT * FROM pos_sale_items WHERE id=? AND sale_id=?', [r.saleItemId, sale.id]);
      if (!it) throw new AppError(422, 'bad_item', 'This line is not on the invoice.');
      const qty = Math.floor(r.qty);
      if (qty > it.qty - it.returned_qty) throw new AppError(422, 'too_many', `Only ${it.qty - it.returned_qty} of "${it.name}" can still be returned.`);
      // the customer gets back what they paid for that piece, including their share of the invoice discount
      const lineNet = it.price * it.qty - it.discount;
      const share = sale.subtotal > 0 ? Math.round((lineNet * sale.discount) / sale.subtotal) : 0;
      const unit = Math.round((lineNet - share) / it.qty);
      const amount = unit * qty;
      rows.push({ it, qty, amount }); refund += amount;
    }
    const returnId = Number(q.run('INSERT INTO pos_returns(store_id, sale_id, uuid, refund, method, reason, cashier_name) VALUES(?,?,?,?,?,?,?)', [store.id, sale.id, input.uuid, refund, input.method, input.reason || '', cashierName]).lastInsertRowid);
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
