/**
 * "Reserve & try in store". A reservation is a REQUEST until the shop confirms the piece is there; the hold time only
 * starts at that confirmation. Released on its own (order cancelled, pieces back in stock, shopper told) when the shop
 * did not confirm in time (note "not_confirmed") or the shopper did not come (note "expired"). Runs every 10 minutes.
 */
import { q, tx, insert } from '../db/index.js';
import { nowIso } from './util.js';
import { notifyOrderStatus } from './buyers.js';
import { notifyStore } from './push.js';

const CONFIRM_OPEN_MS = 2 * 3600e3; // the shop has 2 working hours to confirm the piece is there
const CONFIRM_NO_HOURS_MS = 6 * 3600e3; // shops without opening hours on file
const cairo = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Is the shop open at this moment (Cairo time)? Handles closing after midnight and the weekly day off. */
export function shopOpenAt(store, at) {
  if (!store?.opens_at || !store?.closes_at) return true;
  const p = Object.fromEntries(cairo.formatToParts(at).map((x) => [x.type, x.value]));
  const hm = `${p.hour}:${p.minute}`;
  const day = WD[p.weekday];
  const dayOff = store.day_off == null || store.day_off === '' ? null : Number(store.day_off);
  const o = store.opens_at, c = store.closes_at;
  if (o <= c) return hm >= o && hm < c && day !== dayOff;
  // open past midnight: the early-morning part belongs to the previous day
  if (hm >= o) return day !== dayOff;
  return hm < c && (day + 6) % 7 !== dayOff;
}

/** Deadline for the shop to confirm a new reservation: 2 hours of opening time from now (or from the next opening). */
export function confirmDeadline(store, now = new Date()) {
  if (!store?.opens_at || !store?.closes_at) return new Date(now.getTime() + CONFIRM_NO_HOURS_MS);
  let t = now.getTime();
  for (let i = 0; i < 7 * 96 && !shopOpenAt(store, new Date(t)); i++) t += 15 * 60e3; // walk to the next opening (15-min steps, max a week)
  return new Date(Math.max(t, now.getTime()) + CONFIRM_OPEN_MS);
}

const NO_SHOW_WINDOW = '-60 days';
const NO_SHOW_LIMIT = 2;
const BLOCK_DAYS = 14;

/**
 * A shopper's reservation record across ALL Twist shops, by phone: how often they reserved and did not come
 * (shop confirmed, time ran out / shop marked "did not come") in the last 60 days, and how often they bought.
 * Two no-shows → no new reservations for 14 days after the last one. Delivery orders are never affected.
 */
export function reserveRecord(phone) {
  const ns = q.get(`SELECT COUNT(DISTINCT o.id) AS n, MAX(e.created_at) AS last FROM orders o JOIN order_events e ON e.order_id=o.id
    WHERE o.phone=? AND o.delivery_by='pickup' AND o.status='cancelled' AND e.status='cancelled' AND e.note IN ('expired','no_show') AND e.created_at >= datetime('now', ?)`, [phone, NO_SHOW_WINDOW]);
  const bought = q.val("SELECT COUNT(*) FROM orders WHERE phone=? AND delivery_by='pickup' AND status='delivered'", [phone]) || 0;
  let blockedUntil = null;
  if ((ns?.n || 0) >= NO_SHOW_LIMIT && ns.last) {
    const until = new Date(`${ns.last.replace(' ', 'T')}Z`).getTime() + BLOCK_DAYS * 86400e3;
    if (until > Date.now()) blockedUntil = new Date(until).toISOString();
  }
  return { noShows: ns?.n || 0, bought, blockedUntil };
}

export function expireReservations(now = new Date()) {
  const due = q.all("SELECT * FROM orders WHERE delivery_by='pickup' AND status IN ('pending','confirmed') AND reserve_until IS NOT NULL AND reserve_until < ?", [now.toISOString()]);
  for (const o of due) {
    tx(() => {
      const at = nowIso();
      q.run("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?", [at, o.id]);
      insert('order_events', { order_id: o.id, status: 'cancelled', note: o.status === 'pending' ? 'not_confirmed' : 'expired', created_at: at });
      for (const i of q.all('SELECT * FROM order_items WHERE order_id=?', [o.id])) {
        if (i.variant_id) q.run('UPDATE variants SET stock=stock+? WHERE id=?', [i.qty, i.variant_id]);
        q.run('UPDATE products SET stock=stock+?, sold_count=MAX(0,sold_count-?) WHERE id=?', [i.qty, i.qty, i.product_id]);
      }
      if (o.customer_id) q.run('UPDATE customers SET orders_count=MAX(0,orders_count-1), total_spent=MAX(0,total_spent-?) WHERE id=?', [o.total, o.customer_id]);
    });
    try { notifyOrderStatus(o.id, 'cancelled'); } catch { /* best effort */ }
    try {
      notifyStore(o.store_id, o.status === 'pending'
        ? { title: `حجز اتلغى ${o.number}`, body: `ماتأكدش في الوقت، فالعميل ${o.customer_name} اتبلّغ والقطعة رجعت للبيع`, url: `/dashboard/orders/${o.id}`, tag: `order-${o.id}` }
        : { title: `انتهى وقت الحجز ${o.number}`, body: `${o.customer_name} معدّاش، والقطعة رجعت للمخزون`, url: `/dashboard/orders/${o.id}`, tag: `order-${o.id}` });
    } catch { /* best effort */ }
  }
  return due.length;
}

export function startReservationSweeper() {
  const run = () => { try { const n = expireReservations(); if (n) console.log(`[reserve] released ${n} expired reservation(s)`); } catch (e) { console.error(`[reserve] sweep failed: ${e.message}`); } };
  setTimeout(run, 30e3).unref?.();
  setInterval(run, 10 * 60e3).unref?.();
}
