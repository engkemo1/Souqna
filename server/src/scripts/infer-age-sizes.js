/**
 * One-off: kids' products whose variants have NO size but whose name/description names the age («مقاس 0/3 شهور») get that size on their variants,
 * so the size filter («0-3 شهور») and the baby / newborn sections can find them.
 * Safe by design: DRY RUN by default; only variants with an empty size; only when the text names exactly ONE age range (anything unclear is listed, not changed);
 * never touches products that already have any size; never touches orders.
 *
 *   node --no-warnings server/src/scripts/infer-age-sizes.js          # preview
 *   APPLY=1 node --no-warnings server/src/scripts/infer-age-sizes.js  # write (take a database backup first)
 */
import { q } from '../db/index.js';
import { ageSizeFromText } from '../lib/age-size.js';

const APPLY = process.env.APPLY === '1';
const products = q.all(`SELECT p.id, p.name_ar, p.name_en, p.description_ar, p.description_en,
    (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) AS nv,
    (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id AND v.size IS NOT NULL AND v.size<>'') AS nsized
  FROM products p WHERE p.status='active'`);
const changes = []; const unclear = [];
for (const p of products) {
  if (!p.nv || p.nsized > 0) continue; // no variants to label, or it already has sizes
  const text = `${p.name_ar || ''} ${p.name_en || ''} ${p.description_ar || ''} ${p.description_en || ''}`;
  const label = ageSizeFromText(text);
  if (label) changes.push({ id: p.id, name: p.name_ar || p.name_en, label, variants: p.nv });
  else if (/(شهر|شهور|months?|سنه|سنين|سنة)/i.test(text) && /(مقاس|size|عمر)/i.test(text)) unclear.push({ id: p.id, name: p.name_ar || p.name_en });
}
const byLabel = new Map(); for (const c of changes) byLabel.set(c.label, (byLabel.get(c.label) || 0) + 1);
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${changes.length} products get a size on their variants`);
for (const [k, n] of [...byLabel].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
for (const c of changes.slice(0, 15)) console.log(`   #${c.id} ${c.name} → ${c.label}`);
if (unclear.length) console.log(`unclear (more than one age or none readable — check by hand): ${unclear.slice(0, 25).map((u) => `#${u.id}`).join(', ')}${unclear.length > 25 ? ' …' : ''}`);
if (APPLY && changes.length) {
  q.run('BEGIN');
  try {
    for (const c of changes) q.run("UPDATE variants SET size=? WHERE product_id=? AND (size IS NULL OR size='')", [c.label, c.id]);
    q.run('COMMIT');
    console.log('done. Restart the app (the departments fill in again on start-up), then the size filter and the newborn section will list them.');
  } catch (e) { q.run('ROLLBACK'); throw e; }
}
