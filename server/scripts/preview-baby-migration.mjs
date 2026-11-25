// Preview the baby/newborn department migration on a COPY of a database. Changes nothing in the original.
// Usage:  node scripts/preview-baby-migration.mjs path/to/souqna.db
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('Usage: node scripts/preview-baby-migration.mjs <database-file>'); process.exit(1); }
const copy = path.join(os.tmpdir(), `preview-baby-${Date.now()}.db`);
fs.copyFileSync(src, copy);
for (const ext of ['-wal', '-shm']) if (fs.existsSync(src + ext)) fs.copyFileSync(src + ext, copy + ext);
process.env.DB_FILE = copy; process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'preview-only-secret-xxxxxxxxxxxxxxxxxxxxxxxx';

const { backfillDepartments } = await import('../src/lib/departments.js');
const report = [];
const n = backfillDepartments({ dryRun: true, report });
console.log(`\n${n} product(s) would move (nothing was written).\n`);
const pairs = {};
for (const r of report) { const k = `${r.from || '(none)'} -> ${r.to}`; (pairs[k] ||= []).push(r); }
for (const [k, rows] of Object.entries(pairs)) {
  console.log(`${k}: ${rows.length}`);
  for (const r of rows.slice(0, 15)) console.log(`   #${r.id}  ${r.name}`);
  if (rows.length > 15) console.log(`   ... +${rows.length - 15} more`);
}
fs.rmSync(copy, { force: true });
