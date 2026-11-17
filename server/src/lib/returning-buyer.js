/**
 * Returning buyer, no account. Typing a known mobile number fills the checkout form.
 * Privacy: anyone can type any number, so an unverified lookup only gives the FIRST name and the area
 * (governorate + city). The street address and full name are returned only with a device token that this
 * server issued when that phone placed an order from this device (a signed token, never the phone alone).
 */
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { q } from '../db/index.js';

const SECRET = `${config.jwtSecret}:returning`;
export const PHONE_RE = /^01[0125][0-9]{8}$/;

/** Token the browser keeps after an order, proving "this device ordered with this number". */
export const signReturning = (phone) => jwt.sign({ k: 'rb', p: String(phone) }, SECRET, { expiresIn: '365d' });

const tokenOk = (token, phone) => {
  if (!token || typeof token !== 'string') return false;
  try { const p = jwt.verify(token, SECRET, { algorithms: ['HS256'] }); return p.k === 'rb' && p.p === phone; } catch { return false; }
};

/** What the checkout may pre-fill for this phone. Never throws. */
export function returningFor(phone, token) {
  if (!PHONE_RE.test(String(phone || ''))) return { found: false };
  const o = q.get("SELECT customer_name, governorate, city, address FROM orders WHERE phone=? AND status<>'cancelled' ORDER BY id DESC LIMIT 1", [phone]);
  if (!o) return { found: false };
  const full = String(o.customer_name || '').trim();
  const out = { found: true, verified: false, firstName: full.split(/\s+/)[0] || '', governorate: o.governorate || null, city: o.city || null };
  if (tokenOk(token, phone)) Object.assign(out, { verified: true, name: full, address: o.address || '' });
  return out;
}
