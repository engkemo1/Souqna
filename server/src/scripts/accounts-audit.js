/**
 * READ-ONLY duplicate-account audit (opens the DB with readOnly:true, never writes). Usage:
 *   DB_FILE=/app/data/db.sqlite node --no-warnings src/scripts/accounts-audit.js
 *
 * Finds accounts and stores that look like the same one, using the same rules as the "add store" form:
 *   - owner emails that match after lower-casing, removing Gmail dots and +tags
 *   - stores that share a phone or WhatsApp number
 *   - stores whose names match after removing diacritics, أ/إ/آ -> ا, ة -> ه, ى -> ي and symbols
 * Each group lists the stores with their product and order counts so you can decide which one to keep.
 * It only REPORTS: nothing is merged or deleted.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/souqna.db');
const db = new DatabaseSync(file, { readOnly: true });
const all = (sql, p = []) => db.prepare(sql).all(...p);
const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

const normEmail = (e) => {
  const [local = '', domain = ''] = String(e || '').trim().toLowerCase().split('@');
  if (!domain) return String(e || '').trim().toLowerCase();
  const l = local.split('+')[0];
  return /^(gmail|googlemail)\.com$/.test(domain) ? `${l.replace(/\./g, '')}@gmail.com` : `${l}@${domain}`;
};
const normName = (n) => String(n || '').toLowerCase().normalize('NFKC').replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, '');
const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^20/, '0').replace(/^1/, '01');

const stores = all('SELECT s.id, s.slug, s.name_ar, s.name_en, s.phone, s.whatsapp, s.owner_id, u.email AS owner_email, u.name AS owner_name FROM stores s LEFT JOIN users u ON u.id = s.owner_id ORDER BY s.id');
const count = (table, col) => (has(table) ? new Map(all(`SELECT ${col} AS k, COUNT(*) AS n FROM ${table} GROUP BY ${col}`).map((r) => [r.k, r.n])) : new Map());
const products = count('products', 'store_id');
const orders = count('orders', 'store_id');
const info = (s) => ({ slug: s.slug, name: s.name_ar, owner: `${s.owner_name || ''} <${s.owner_email || ''}>`, phone: s.phone, whatsapp: s.whatsapp, products: products.get(s.id) || 0, orders: orders.get(s.id) || 0 });

const groups = [];
const group = (kind, keyOf, list = stores) => {
  const m = new Map();
  for (const s of list) { const k = keyOf(s); if (k) (m.get(k) || m.set(k, []).get(k)).push(s); }
  for (const [k, v] of m) if (v.length > 1) groups.push({ kind, key: k, stores: v.map(info) });
};
group('same owner email (normalised)', (s) => normEmail(s.owner_email));
group('same phone', (s) => normPhone(s.phone));
group('same WhatsApp', (s) => normPhone(s.whatsapp));
group('same store name', (s) => normName(s.name_ar) || normName(s.name_en));

// accounts that are not stores' owners but share an email with another user
const users = all('SELECT id, email, role FROM users');
const byEmail = new Map();
for (const u of users) { const k = normEmail(u.email); (byEmail.get(k) || byEmail.set(k, []).get(k)).push(u); }
const userDupes = [...byEmail].filter(([, v]) => v.length > 1).map(([k, v]) => ({ key: k, users: v.map((u) => `#${u.id} ${u.email} (${u.role})`) }));

if (!groups.length && !userDupes.length) console.log('No duplicate stores or accounts found.');
for (const g of groups) {
  console.log(`\n[${g.kind}] ${g.key}`);
  for (const s of g.stores) console.log(`  - ${s.slug}  "${s.name}"  ${s.owner}  phone ${s.phone}  products ${s.products}  orders ${s.orders}`);
}
for (const g of userDupes) console.log(`\n[user emails that look the same] ${g.key}\n  - ${g.users.join('\n  - ')}`);
console.log(`\n${groups.length} store groups and ${userDupes.length} user-email groups flagged. Nothing was changed.`);
