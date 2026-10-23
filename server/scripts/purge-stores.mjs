// Delete dummy stores with ALL their data (products, orders, reviews, visits, carts, stats...) + their demo owner users.
// Usage:  node server/scripts/purge-stores.mjs slug1,slug2,...            (dry run - changes nothing)
//         node server/scripts/purge-stores.mjs slug1,slug2,... --apply    (backup first, then delete)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const slugs = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
const apply = process.argv.includes('--apply');
if (!slugs.length) { console.error('give comma separated store slugs'); process.exit(1); }
const file = process.env.DB_FILE || '/app/data/db.sqlite';
const db = new DatabaseSync(file);
db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
const ph = slugs.map(() => '?').join(',');
const stores = db.prepare(`SELECT id, slug, name_ar, owner_id FROM stores WHERE slug IN (${ph})`).all(...slugs);
const missing = slugs.filter((s) => !stores.some((x) => x.slug === s));
if (missing.length) console.log('not found (skipped):', missing.join(', '));
if (!stores.length) { console.log('nothing to delete'); process.exit(0); }
const ids = stores.map((s) => s.id);
const idPh = ids.map(() => '?').join(',');

const count = (sql, ...p) => db.prepare(sql).get(...p).n;
const report = () => ({
  stores: count('SELECT COUNT(*) n FROM stores'),
  products: count('SELECT COUNT(*) n FROM products'),
  orders: count('SELECT COUNT(*) n FROM orders'),
  reviews: count('SELECT COUNT(*) n FROM reviews'),
  visits: count('SELECT COUNT(*) n FROM store_visits'),
  users: count('SELECT COUNT(*) n FROM users'),
});
console.log('stores to delete:', stores.map((s) => `${s.slug} (${s.name_ar})`).join(' | '));
for (const s of stores) {
  console.log(`  ${s.slug}: products=${count('SELECT COUNT(*) n FROM products WHERE store_id=?', s.id)} orders=${count('SELECT COUNT(*) n FROM orders WHERE store_id=?', s.id)} reviews=${count('SELECT COUNT(*) n FROM reviews WHERE store_id=?', s.id)} visits=${count('SELECT COUNT(*) n FROM store_visits WHERE store_id=?', s.id)}`);
}
// owners that would become orphans (never admins, never owners of a store that stays)
const ownerIds = [...new Set(stores.map((s) => s.owner_id))];
const delUsers = ownerIds.filter((uid) => {
  const u = db.prepare('SELECT id, email, role FROM users WHERE id=?').get(uid);
  if (!u || u.role === 'admin') return false;
  return count(`SELECT COUNT(*) n FROM stores WHERE owner_id=? AND id NOT IN (${idPh})`, uid, ...ids) === 0;
});
console.log('owner users to delete:', delUsers.map((uid) => db.prepare('SELECT email FROM users WHERE id=?').get(uid).email).join(', ') || '-');
console.log('before:', JSON.stringify(report()));
if (!apply) { console.log('\nDRY RUN - nothing changed. Add --apply to really delete.'); process.exit(0); }

const bak = path.join(path.dirname(file), `backup-before-purge-${Date.now()}.sqlite`);
db.exec(`VACUUM INTO '${bak.replace(/'/g, "''")}'`);
console.log('backup saved:', bak);
db.exec('BEGIN');
try {
  db.prepare(`DELETE FROM store_slug_aliases WHERE store_id IN (${idPh})`).run(...ids);
  db.prepare(`DELETE FROM stores WHERE id IN (${idPh})`).run(...ids);
  for (const uid of delUsers) db.prepare('DELETE FROM users WHERE id=?').run(uid);
  const bad = db.prepare('PRAGMA foreign_key_check').all();
  if (bad.length) throw new Error('foreign key problems: ' + JSON.stringify(bad.slice(0, 3)));
  db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); console.error('FAILED, rolled back:', e.message); process.exit(1); }
console.log('after: ', JSON.stringify(report()));
console.log('DONE');
