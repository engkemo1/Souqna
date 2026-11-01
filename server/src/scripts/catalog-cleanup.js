/**
 * Category cleanup runner. Dry-run by default.
 *   DB_FILE=... node --no-warnings src/scripts/catalog-cleanup.js --plan plan.json                       (report only)
 *   DB_FILE=... node --no-warnings src/scripts/catalog-cleanup.js --plan plan.json --apply --backup-verified --out rollback.json
 *   DB_FILE=... node --no-warnings src/scripts/catalog-cleanup.js --rollback rollback.json --apply
 * --apply refuses to run without --backup-verified (you confirm a real, restorable production backup exists).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { runCleanup, rollback } from '../lib/catalog-cleanup.js';

const a = process.argv.slice(2); const flag = (n) => a.includes(`--${n}`); const val = (n) => (a.includes(`--${n}`) ? a[a.indexOf(`--${n}`) + 1] : null);
const file = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/souqna.db');
const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys=ON');
if (val('rollback')) {
  if (!flag('apply')) { console.log('add --apply to restore from', val('rollback')); process.exit(0); }
  console.log(JSON.stringify(rollback(db, JSON.parse(fs.readFileSync(val('rollback'), 'utf8'))), null, 2)); process.exit(0);
}
const res = runCleanup(db, JSON.parse(fs.readFileSync(val('plan'), 'utf8')), { apply: flag('apply'), backupVerified: flag('backup-verified') });
if (res.rollback && val('out')) fs.writeFileSync(val('out'), JSON.stringify(res.rollback, null, 2));
const { rollback: _r, ...print } = res; console.log(JSON.stringify(print, null, 2));
process.exit(res.ok ? 0 : 1);
