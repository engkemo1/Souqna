/**
 * Abandoned-cart reminder — signed-in shoppers only (in-app notification + web push; no WhatsApp, which needs an approved marketing template).
 * The cart itself lives in the browser; the app sends a tiny snapshot (count, subtotal, product names) after the cart changes.
 * One reminder per snapshot, 2–48 h after the last change, 10:00–21:00 Cairo, never if the shopper ordered since.
 * ABANDONED_CART=0 turns the reminders off.
 */
import { q, db } from '../db/index.js';
import { cairoNow } from './sameDay.js';
import { notifyBuyer } from './buyers.js';

db.exec(`CREATE TABLE IF NOT EXISTS cart_snapshots (
  buyer_id INTEGER PRIMARY KEY REFERENCES buyers(id) ON DELETE CASCADE,
  n INTEGER NOT NULL, subtotal INTEGER NOT NULL, names TEXT NOT NULL DEFAULT '[]',
  max_order_id INTEGER NOT NULL DEFAULT 0, updated_ms INTEGER NOT NULL, reminded_ms INTEGER
);`);

const clean = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const maxOrderId = (buyer) => q.val('SELECT COALESCE(MAX(id),0) FROM orders WHERE buyer_id=? OR (? <> \'\' AND substr(phone, -10)=?)', [buyer.id, last10(buyer.phone), last10(buyer.phone)]) || 0;

/** Stores the latest cart summary. Anything that is not a valid line is ignored. */
export function saveSnapshot(buyer, lines, nowMs = Date.now()) {
  const ok = (Array.isArray(lines) ? lines : []).slice(0, 40).filter((l) => l && Number.isInteger(l.productId) && Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 20 && Number.isFinite(l.price) && l.price >= 0);
  if (!ok.length) { q.run('DELETE FROM cart_snapshots WHERE buyer_id=?', [buyer.id]); return null; }
  const n = ok.reduce((s, l) => s + l.qty, 0);
  const subtotal = Math.min(1e8, Math.round(ok.reduce((s, l) => s + l.qty * l.price, 0)));
  const names = ok.map((l) => clean(typeof l.name === 'object' ? l.name?.ar || l.name?.en : l.name)).filter(Boolean).slice(0, 2);
  const prev = q.get('SELECT n, subtotal FROM cart_snapshots WHERE buyer_id=?', [buyer.id]);
  const same = prev && prev.n === n && prev.subtotal === subtotal; // an unchanged cart must not postpone (or re-arm) the reminder
  if (same) return { n, subtotal };
  db.prepare(`INSERT INTO cart_snapshots (buyer_id, n, subtotal, names, max_order_id, updated_ms, reminded_ms) VALUES (?,?,?,?,?,?,NULL)
    ON CONFLICT(buyer_id) DO UPDATE SET n=excluded.n, subtotal=excluded.subtotal, names=excluded.names, max_order_id=excluded.max_order_id, updated_ms=excluded.updated_ms, reminded_ms=NULL`)
    .run(buyer.id, n, subtotal, JSON.stringify(names), maxOrderId(buyer), nowMs);
  return { n, subtotal };
}
export const clearSnapshot = (buyerId) => q.run('DELETE FROM cart_snapshots WHERE buyer_id=?', [buyerId]);

export function sweepAbandoned(now = cairoNow(), nowMs = Date.now(), cap = 40) {
  if (now.hm < '10:00' || now.hm >= '21:00') return 0;
  const rows = q.all(`SELECT c.*, b.phone FROM cart_snapshots c JOIN buyers b ON b.id=c.buyer_id
    WHERE c.reminded_ms IS NULL AND c.updated_ms <= ? AND c.updated_ms >= ? ORDER BY c.updated_ms LIMIT ?`, [nowMs - 2 * 36e5, nowMs - 48 * 36e5, cap]);
  let sent = 0;
  for (const c of rows) {
    q.run('UPDATE cart_snapshots SET reminded_ms=? WHERE buyer_id=?', [nowMs, c.buyer_id]);
    const ordered = q.get('SELECT 1 AS x FROM orders WHERE id > ? AND (buyer_id=? OR substr(phone, -10)=?) LIMIT 1', [c.max_order_id, c.buyer_id, last10(c.phone)]);
    if (ordered) continue;
    const names = JSON.parse(c.names || '[]');
    const what = names.length ? `${names[0]}${c.n > 1 ? ` و${c.n - 1} حاجة تانية` : ''}` : `${c.n} منتج`;
    notifyBuyer(c.buyer_id, { kind: 'cart', title: 'سلتك مستنياك 🛍️', body: `${what} لسه في سلتك. كمّل طلبك قبل ما الكمية تخلص.`, url: '/cart' });
    sent++;
  }
  return sent;
}
