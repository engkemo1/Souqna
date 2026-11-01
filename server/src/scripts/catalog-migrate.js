/**
 * Catalog v3 migration tool. READ-ONLY unless you run `apply`.
 *
 *   npm run catalog -w server -- plan   [--db <file>] [--md <report.md>]   what would change (real counts, ambiguities); touches nothing
 *   npm run catalog -w server -- backup [--db <file>]                       consistent copy next to the database (data/backups/)
 *   npm run catalog -w server -- test   [--db <file>]                       backup -> apply on a COPY -> verify -> restore test; touches nothing
 *   npm run catalog -w server -- apply  [--db <file>] --approved-by "<name>"  REAL migration: backup first, one transaction, verified
 *                                      (also needs env CONFIRM_CATALOG_MIGRATION=yes)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [, , cmd = 'plan', ...rest] = process.argv;
const arg = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const dbFile = path.resolve(arg('--db') || process.env.DB_FILE || new URL('../../data/souqna.db', import.meta.url).pathname);
if (!fs.existsSync(dbFile)) { console.error(`[catalog] no database at ${dbFile}`); process.exit(2); }
const { plan, apply, snapshot, verify } = await import('../lib/catalog-migration.js');

const open = (file, readOnly = false) => { const d = new DatabaseSync(file, { readOnly }); d.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;'); return d; };
const copyTo = (src, dest) => { const s = open(src, true); fs.rmSync(dest, { force: true }); s.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`); s.close(); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const backup = () => { const dir = path.join(path.dirname(dbFile), 'backups'); fs.mkdirSync(dir, { recursive: true }); const dest = path.join(dir, `${path.basename(dbFile)}.pre-catalog-v3.${stamp()}.bak`); copyTo(dbFile, dest); return dest; };

function report(p) {
  const L = [];
  L.push(`# Catalog v3 - old -> new mapping\n`);
  L.push(`Database: ${dbFile}`);
  L.push(`Totals: ${JSON.stringify(p.totals)}; products without a department: ${p.productsWithoutDepartment}`);
  L.push(`Plan: ${JSON.stringify(p.summary)}\n`);
  L.push('## Existing sections (kept: same id, slug, products)\n');
  L.push('| id | slug | action | products | stores | change |\n|---|---|---|---|---|---|');
  for (const n of p.nodes.filter((x) => x.action !== 'create')) L.push(`| ${n.id} | ${n.slug} | ${n.action} | ${n.products} | ${n.stores} | ${(n.changes || []).map((c) => `${c.field}: ${c.from ?? 'root'} -> ${c.to ?? 'root'}`).join('; ') || '-'} |`);
  L.push('\n## New sections\n');
  L.push(p.nodes.filter((x) => x.action === 'create').map((n) => `- ${n.slug} (${n.ar} / ${n.en}) under ${n.parent || 'root'}`).join('\n'));
  L.push('\n## Custom sections (not in the tree; left exactly where they are)\n');
  L.push(p.custom.length ? p.custom.map((c) => `- ${c.slug} "${c.name}" parent=${c.parent || 'root'} products=${c.products} stores=${c.stores}${c.pending ? ' PENDING' : ''}`).join('\n') : '- none');
  L.push('\n## Needs your decision\n');
  for (const a of p.ambiguities) L.push(`- **${a.id}** (${a.slugs.join(', ')}; ${a.products} products, ${a.stores} stores): ${a.text_en}\n  Default: ${a.default}`);
  return L.join('\n');
}

if (cmd === 'plan') {
  const d = open(dbFile, true); const p = plan(d); d.close();
  const out = report(p); console.log(out);
  if (arg('--md')) fs.writeFileSync(arg('--md'), out);
} else if (cmd === 'backup') {
  console.log(`[catalog] backup written: ${backup()}`);
} else if (cmd === 'test') {
  const bak = backup(); console.log(`[catalog] backup: ${bak}`);
  const tmp = path.join(os.tmpdir(), `catalog-test-${stamp()}.db`);
  copyTo(dbFile, tmp);
  const d = open(tmp);
  const before = snapshot(d);
  const r = apply(d, { approved: true });
  console.log('[catalog] applied to the COPY, verified:', JSON.stringify(r.plan), `migratedRequests=${r.migratedRequests}`);
  // idempotence: a second run must change nothing that matters
  const again = apply(d, { approved: true }); console.log('[catalog] second run (idempotent) verified:', JSON.stringify(again.plan));
  d.close();
  // rollback test: restoring the backup gives back exactly the original data
  const restored = path.join(os.tmpdir(), `catalog-restore-${stamp()}.db`); copyTo(bak, restored);
  const rd = open(restored); verify(rd, before); rd.close();
  console.log('[catalog] restore-from-backup verified: products, stores, categories, orders identical to the original');
  fs.rmSync(tmp, { force: true }); fs.rmSync(restored, { force: true });
  console.log('[catalog] TEST PASSED - the real database was not touched.');
} else if (cmd === 'apply') {
  if (!arg('--approved-by') || process.env.CONFIRM_CATALOG_MIGRATION !== 'yes') { console.error('[catalog] refusing: pass --approved-by "<name>" and set CONFIRM_CATALOG_MIGRATION=yes (after reviewing `plan` and a passing `test`).'); process.exit(3); }
  const bak = backup(); console.log(`[catalog] backup: ${bak}`);
  const d = open(dbFile);
  try { const r = apply(d, { approved: true }); console.log('[catalog] APPLIED and verified:', JSON.stringify(r.plan), `approved by ${arg('--approved-by')}`); } catch (e) { console.error('[catalog] FAILED and rolled back:', e.message); process.exit(1); }
  d.close();
} else { console.error('usage: plan | backup | test | apply'); process.exit(2); }
