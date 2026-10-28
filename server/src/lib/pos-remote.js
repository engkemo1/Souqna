/**
 * "Phone as barcode scanner" for the Twist cashier on a computer.
 * The computer creates a pairing (a long random secret shown as a QR). The phone opens the link, scans with its camera
 * and sends each code to the server, which hands it to the computer over a live connection (Server-Sent Events).
 * The computer answers with what happened (added "Shirt red L" / unknown code), and the phone shows that answer.
 * The secret only allows sending codes to that one cashier screen: no prices, no sales, no account access.
 * Pairings are kept in the database (a restart does not unpair) and can be revoked from the cashier.
 */
import crypto from 'node:crypto';
import { q } from '../db/index.js';
import { AppError } from './errors.js';

const LIFE_DAYS = 30;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

let ready = false;
function ensure() {
  if (ready) return;
  q.run(`CREATE TABLE IF NOT EXISTS pos_remote_pairs (
    token_hash TEXT PRIMARY KEY, store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL, last_scan_at TEXT)`);
  ready = true;
}

/** A new pairing for this store's cashier screen. The raw token is returned once; only its hash is stored. */
export function createPairing(storeId) {
  ensure();
  const token = crypto.randomBytes(18).toString('base64url'); // 144 bits
  const expires = new Date(Date.now() + LIFE_DAYS * 86400e3).toISOString();
  q.run('INSERT INTO pos_remote_pairs(token_hash, store_id, expires_at) VALUES(?,?,?)', [hash(token), storeId, expires]);
  q.run("DELETE FROM pos_remote_pairs WHERE expires_at < ?", [new Date().toISOString()]);
  return { token, expiresAt: expires };
}

export function revokePairing(storeId, token) {
  ensure();
  q.run('DELETE FROM pos_remote_pairs WHERE token_hash=? AND store_id=?', [hash(token), storeId]);
}

/** The pairing behind a token, or a 404 (unknown, revoked or expired). */
export function pairingFor(token) {
  ensure();
  if (typeof token !== 'string' || token.length < 20 || token.length > 64) throw new AppError(404, 'pair_not_found', 'This scanner link is not valid any more.');
  const row = q.get('SELECT p.token_hash AS id, p.store_id AS storeId, p.expires_at AS expiresAt, s.name_ar AS storeName FROM pos_remote_pairs p JOIN stores s ON s.id=p.store_id WHERE p.token_hash=?', [hash(token)]);
  if (!row || row.expiresAt < new Date().toISOString()) throw new AppError(404, 'pair_not_found', 'This scanner link is not valid any more.');
  return row;
}

/* ------------------------------------------------------------------ live channel (one process) */

const screens = new Map(); // pairing id -> Set of open computer connections (res)
const waiting = new Map(); // scan id -> { resolve, timer }
const phones = new Map(); // pairing id -> last time a phone talked to us

export function attachScreen(pairId, res) {
  if (!screens.has(pairId)) screens.set(pairId, new Set());
  screens.get(pairId).add(res);
  return () => { const set = screens.get(pairId); set?.delete(res); if (set && !set.size) screens.delete(pairId); };
}

export const screenOnline = (pairId) => (screens.get(pairId)?.size || 0) > 0;
export const phoneSeen = (pairId) => phones.get(pairId) || null;
export function notePhone(pairId) { phones.set(pairId, new Date().toISOString()); }

const send = (res, event, data) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* closed */ } };
export function pushToScreens(pairId, event, data) {
  const set = screens.get(pairId);
  if (!set?.size) return 0;
  for (const res of set) send(res, event, data);
  return set.size;
}
export { send as sendEvent };

/** Hands a code to the cashier screen and waits (briefly) for its answer, so the phone can show what happened. */
export function deliverScan(pairId, code) {
  notePhone(pairId);
  q.run("UPDATE pos_remote_pairs SET last_scan_at=datetime('now') WHERE token_hash=?", [pairId]);
  const id = crypto.randomBytes(8).toString('hex');
  const delivered = pushToScreens(pairId, 'scan', { id, code });
  if (!delivered) return Promise.resolve({ delivered: false });
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve({ delivered: true, answer: null }); }, 4000);
    waiting.set(id, { pairId, resolve: (answer) => { clearTimeout(timer); waiting.delete(id); resolve({ delivered: true, answer }); } });
  });
}

/** The cashier screen's answer for one scan. */
export function answerScan(pairId, id, answer) {
  const w = waiting.get(id);
  if (w && w.pairId === pairId) w.resolve(answer);
}

// at most a few codes a second per pairing (a held trigger or a stuck camera must not flood the cashier)
const hits = new Map();
export function allowScan(pairId) {
  const now = Date.now();
  const list = (hits.get(pairId) || []).filter((t) => now - t < 1000);
  if (list.length >= 6) return false;
  list.push(now); hits.set(pairId, list);
  return true;
}
