/**
 * One-off cleanup: write sizes in their canonical spelling (m → M, ١٠ → 10, one size → One size) so the same size is never stored two ways.
 * Safe by design: DRY RUN by default (prints what would change); changes only letter / number sizes (kids' ages and anything unclear are left
 * alone); skips a row when the same product already has that canonical size in the same colour; never touches orders (they keep their own copy).
 *
 *   node --no-warnings server/src/scripts/normalize-sizes.js          # preview
 *   APPLY=1 node --no-warnings server/src/scripts/normalize-sizes.js  # write (take a database backup first)
 */
import { q } from '../db/index.js';
import { canonSize } from '../lib/size-normalize.js';

const APPLY = process.env.APPLY === '1';
const rows = q.all("SELECT v.id, v.product_id, v.size, v.color FROM variants v WHERE v.size IS NOT NULL AND v.size<>''");
const key = (pid, size, color) => `${pid}|${size}|${String(color || '').toUpperCase()}`;
const have = new Set(rows.map((r) => key(r.product_id, r.size, r.color)));
const changes = []; const skipped = [];
for (const r of rows) {
  const c = canonSize(r.size);
  if (!c.label || c.months || (c.grp !== 'letters' && c.grp !== 'num')) continue; // ages and unclear sizes stay as they are
  if (c.label === r.size) continue;
  if (have.has(key(r.product_id, c.label, r.color))) { skipped.push({ ...r, to: c.label }); continue; }
  changes.push({ ...r, to: c.label });
  have.add(key(r.product_id, c.label, r.color));
}
const byPair = new Map();
for (const c of changes) byPair.set(`${c.size} → ${c.to}`, (byPair.get(`${c.size} → ${c.to}`) || 0) + 1);
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${changes.length} sizes to rewrite, ${skipped.length} skipped (the product already has that size in that colour)`);
for (const [k, n] of [...byPair].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`  ${String(n).padStart(5)}  ${k}`);
if (skipped.length) console.log('skipped (check by hand):', skipped.slice(0, 20).map((s) => `#${s.product_id} ${s.size}→${s.to}`).join(', '));
if (APPLY && changes.length) {
  q.run('BEGIN');
  try { for (const c of changes) q.run('UPDATE variants SET size=? WHERE id=?', [c.to, c.id]); q.run('COMMIT'); console.log('done.'); } catch (e) { q.run('ROLLBACK'); throw e; }
}
