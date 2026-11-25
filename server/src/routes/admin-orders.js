import { Router } from 'express';
import { z } from 'zod';
import { ORDER_STATUSES } from '@souqna/shared';
import { q, tx, insert } from '../db/index.js';
import { h, AppError } from '../lib/errors.js';
import { nowIso } from '../lib/util.js';
import { notifyBuyer, notifyOrderStatus } from '../lib/buyers.js';
import { computeReturn } from '../lib/promotions/returns.js';

/**
 * Platform-admin control over EVERY order (any store, any delivery mode). Mounted inside the admin router (admin key already checked; writes land in the audit log).
 * Rules: a cancelled order is final (stock already went back). A delivered order cannot be cancelled: record a return instead. Every change is written to the order's event log with an "@admin" note.
 */
const r = Router();
const notFound = () => new AppError(404, 'not_found', 'Order not found.');

function returnStock(o) {
  for (const i of q.all('SELECT * FROM order_items WHERE order_id=?', [o.id])) {
    if (i.variant_id) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [i.qty - (i.returned_qty || 0), i.variant_id]);
    q.run('UPDATE products SET stock=stock+?, sold_count=MAX(0,sold_count-?) WHERE id=?', [i.qty - (i.returned_qty || 0), i.qty - (i.returned_qty || 0), i.product_id]);
  }
}

/** Marketplace basket bookkeeping when one sub-order is cancelled (same rules the store owner's cancel uses). Returns true when the buyer must be told the delivery fee is being re-quoted. */
function cancelBasketEffects(o, now) {
  const feeNeedsRequote = o.delivery_group && (o.delivery_fee_status === 'offered' || o.delivery_fee_status === 'rejected' || (o.delivery_fee_status === 'confirmed' && o.delivery_fee_quote != null));
  if (o.delivery_group && (o.courier_cost != null || o.delivery_person_id != null)) {
    const nextOwner = q.get("SELECT id FROM orders WHERE delivery_group=? AND id<>? AND status<>'cancelled' ORDER BY id LIMIT 1", [o.delivery_group, o.id]);
    if (nextOwner) q.run('UPDATE orders SET courier_cost=?, delivery_person_id=? WHERE id=?', [o.courier_cost, o.delivery_person_id, nextOwner.id]);
  }
  if (o.delivery_group && feeNeedsRequote) {
    q.run("UPDATE orders SET delivery_fee_status='pending',delivery_fee_quote=NULL,shipping=0,total=subtotal-discount,updated_at=? WHERE delivery_group=? AND status<>'cancelled'", [now, o.delivery_group]);
  } else if (o.delivery_group) {
    const active = q.all("SELECT id, shipping FROM orders WHERE delivery_group=? AND status<>'cancelled' AND shipping_free=0 ORDER BY id", [o.delivery_group]);
    const fee = o.shipping || active.reduce((s, x) => s + x.shipping, 0); const feeOrderId = fee > 0 ? active[0]?.id : undefined;
    for (const it of q.all("SELECT id, subtotal, discount, total FROM orders WHERE delivery_group=? AND status<>'cancelled'", [o.delivery_group])) {
      const shipping = it.id === feeOrderId ? fee : 0; const total = it.subtotal - (it.discount || 0) + shipping;
      if (total !== it.total) q.run('UPDATE orders SET shipping=?, total=? WHERE id=?', [shipping, total, it.id]);
    }
  }
  return !!feeNeedsRequote;
}

/** One status change by an admin. Throws AppError on a refused change. */
export function adminSetStatus(id, status, note) {
  const o = q.get('SELECT * FROM orders WHERE id=?', [Number(id)]); if (!o) throw notFound();
  if (o.status === 'cancelled') throw new AppError(409, 'order_cancelled', 'A cancelled order is final: its stock already went back.');
  if (status === o.status) throw new AppError(409, 'same_status', 'The order is already in this status.');
  if (status === 'cancelled' && o.status === 'delivered') throw new AppError(409, 'use_returns', 'A delivered order cannot be cancelled. Record a return instead.');
  const now = nowIso(); let requote = false;
  tx(() => {
    q.run('UPDATE orders SET status=?, updated_at=? WHERE id=?', [status, now, o.id]);
    if (o.delivery_by === 'pickup' && status === 'confirmed') q.run('UPDATE orders SET reserve_until=? WHERE id=?', [new Date(Date.now() + (q.val('SELECT reserve_hours FROM stores WHERE id=?', [o.store_id]) || 24) * 3600e3).toISOString(), o.id]);
    insert('order_events', { order_id: o.id, status, note: `@admin${note ? `: ${note}` : ''}`.slice(0, 300), created_at: now });
    if (status === 'cancelled') {
      returnStock(o);
      if (o.customer_id) q.run('UPDATE customers SET orders_count=MAX(0,orders_count-1),total_spent=MAX(0,total_spent-?) WHERE id=?', [o.delivery_group ? o.subtotal - o.discount : o.total, o.customer_id]);
      requote = cancelBasketEffects(o, now);
    }
  });
  if (requote && status === 'cancelled') {
    const told = new Set();
    for (const it of q.all("SELECT buyer_id, track_token FROM orders WHERE delivery_group=? AND status<>'cancelled'", [o.delivery_group])) if (it.buyer_id && !told.has(it.buyer_id)) { told.add(it.buyer_id); notifyBuyer(it.buyer_id, { kind: 'order', title: 'تغيّر طلب سلة Twist', body: `الطلب ${o.number} اتلغى. هنراجع رسوم التوصيل ونبعتلك السعر من جديد.`, url: `/track/${it.track_token}` }); }
  }
  notifyOrderStatus(o.id, status);
  return { id: o.id, from: o.status, status };
}

r.patch('/orders/:id/admin-status', h((req, res) => {
  const b = z.object({ status: z.enum(ORDER_STATUSES), note: z.string().trim().max(250).optional() }).parse(req.body);
  res.json(adminSetStatus(req.params.id, b.status, b.note));
}));

/** Same change on many orders. Each order succeeds or fails on its own; the answer lists both. */
r.post('/orders/bulk', h((req, res) => {
  const b = z.object({ ids: z.array(z.coerce.number().int()).min(1).max(100), status: z.enum(ORDER_STATUSES), note: z.string().trim().max(250).optional() }).parse(req.body);
  const done = []; const failed = [];
  for (const id of [...new Set(b.ids)]) { try { done.push(adminSetStatus(id, b.status, b.note)); } catch (e) { failed.push({ id, code: e.code || 'error', message: e.message }); } }
  res.json({ done: done.length, failed, ids: done.map((x) => x.id) });
}));

const PHONE = /^[0-9+\s-]{6,20}$/;
r.patch('/orders/:id/details', h((req, res) => {
  const b = z.object({ customer_name: z.string().trim().min(1).max(80), phone: z.string().trim().regex(PHONE), governorate: z.string().trim().max(60).optional().nullable(), city: z.string().trim().max(80).optional().nullable(), address: z.string().trim().max(300).optional().nullable(), notes: z.string().trim().max(500).optional().nullable() }).partial().parse(req.body);
  const o = q.get('SELECT * FROM orders WHERE id=?', [Number(req.params.id)]); if (!o) throw notFound();
  if (o.status === 'cancelled') throw new AppError(409, 'order_cancelled', 'A cancelled order cannot be edited.');
  const changed = Object.keys(b).filter((k) => b[k] !== undefined && String(b[k] ?? '') !== String(o[k] ?? ''));
  if (!changed.length) return res.json({ id: o.id, changed: [] });
  const now = nowIso();
  tx(() => {
    q.run(`UPDATE orders SET ${changed.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`, [...changed.map((k) => b[k] ?? null), now, o.id]);
    insert('order_events', { order_id: o.id, status: o.status, note: `@edit: ${changed.join(',')}`, created_at: now });
  });
  res.json({ id: o.id, changed });
}));

/** Admin return on any order (shipped/delivered): same maths as the store owner's return, restocks by default. */
r.post('/orders/:id/returns', h((req, res) => {
  const o = q.get('SELECT * FROM orders WHERE id=?', [Number(req.params.id)]); if (!o) throw notFound();
  if (o.status === 'cancelled') throw new AppError(409, 'order_cancelled', 'A cancelled order has already been returned to stock.');
  if (!['shipped', 'delivered'].includes(o.status)) throw new AppError(409, 'order_not_returnable', 'Returns can be recorded once the order is shipped or delivered. Cancel it instead before that.');
  const b = z.object({ items: z.array(z.object({ itemId: z.coerce.number().int(), qty: z.coerce.number().int().min(1).max(1000) })).min(1).max(100), reason: z.string().trim().max(300).optional().nullable(), restock: z.boolean().default(true), dryRun: z.boolean().default(false) }).parse(req.body);
  const store = q.get('SELECT * FROM stores WHERE id=?', [o.store_id]); const now = nowIso();
  const out = tx(() => {
    const all = q.all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [o.id]); const request = new Map();
    for (const it of b.items) {
      const line = all.find((l) => l.id === it.itemId); if (!line) throw new AppError(404, 'not_found', 'Order item not found.');
      const want = (request.get(line.id) || 0) + it.qty; const left = line.qty - (line.returned_qty || 0);
      if (want > left) throw new AppError(422, 'too_many', `Only ${left} of "${line.name_ar}" can still be returned.`);
      request.set(line.id, want);
    }
    const { refund, lines, calc } = computeReturn(o, all, request, { store });
    if (b.dryRun) return { dryRun: true, refund, items: lines, calculation: calc };
    for (const ln of lines) {
      const line = all.find((l) => l.id === ln.itemId);
      q.run('UPDATE order_items SET returned_qty=? WHERE id=?', [(line.returned_qty || 0) + ln.qty, line.id]);
      if (b.restock && line.product_id) { if (line.variant_id) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [ln.qty, line.variant_id]); q.run('UPDATE products SET stock=stock+?, sold_count=MAX(0,sold_count-?) WHERE id=?', [ln.qty, ln.qty, line.product_id]); }
      insert('order_returns', { order_id: o.id, store_id: o.store_id, order_item_id: line.id, qty: ln.qty, refund: ln.refund, restocked: b.restock ? 1 : 0, reason: b.reason || null, calc_json: JSON.stringify(calc), created_at: now });
    }
    if (o.customer_id && refund) q.run('UPDATE customers SET total_spent=MAX(0,total_spent-?) WHERE id=?', [refund, o.customer_id]);
    insert('order_events', { order_id: o.id, status: o.status, note: `@admin return:${refund}`, created_at: now });
    return { refund, items: lines, calculation: calc };
  });
  res.status(out.dryRun ? 200 : 201).json(out);
}));

export default r;
