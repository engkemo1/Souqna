import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-cleanup-${randomUUID()}.db`);
  process.env.JWT_SECRET = `cleanup-${randomUUID()}`;
  const { insert, q, db } = await import('../src/db/index.js');
  const mod = await import('../src/lib/catalog-cleanup.js');
  const owner = insert('users', { name: 'Owner', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const store = insert('stores', { owner_id: owner, slug: `cu-${randomUUID().slice(0, 6)}`, code: `C${randomUUID().slice(0, 4)}`, name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', departments: ',women,', category: 'mixed' });
  const dept = (slug, name, parent, active = 1) => q.run('INSERT OR IGNORE INTO departments (slug,name_ar,name_en,parent_slug,sort,active) VALUES (?,?,?,?,99,?)', [slug, name, name, parent, active]);
  const prod = (department) => insert('products', { store_id: store, slug: `p-${randomUUID().slice(0, 6)}`, name_en: 'P', name_ar: 'منتج', price: 10, status: 'active', department });
  return { db, q, mod, store, dept, prod };
}

test('dry-run changes nothing; apply needs a verified backup', async () => {
  const { db, q, mod, dept, prod } = await setup();
  dept('t_dress_old', 'فستان', null); dept('t_dresses', 'فساتين', 'women');
  const p = prod('t_dress_old');
  const plan = { operations: [{ op: 'move_products', from: 't_dress_old', to: 't_dresses', reason: 'explicit mapping' }] };
  const dry = mod.runCleanup(db, plan);
  assert.equal(dry.ok, true); assert.equal(dry.applied, false);
  assert.equal(q.get('SELECT department FROM products WHERE id=?', [p]).department, 't_dress_old');
  assert.equal(mod.runCleanup(db, plan, { apply: true }).ok, false);
});

test('apply moves only the explicit products, keeps ids, syncs store + mirror, and rollback restores', async () => {
  const { db, q, mod, store, dept, prod } = await setup();
  dept('t_robe', 'روب', 'women'); dept('t_velvet', 'روب قطيفة', 't_robe');
  q.run('UPDATE departments SET parent_slug=NULL WHERE slug=?', ['t_robe']);
  const a = prod('t_robe'); const b = prod('t_robe');
  const total = q.get('SELECT COUNT(*) n FROM products').n;
  const res = mod.runCleanup(db, { run_key: `r-${randomUUID().slice(0, 6)}`, operations: [{ op: 'move_products', from: 't_robe', to: 't_velvet', product_ids: [a] }] }, { apply: true, backupVerified: true });
  assert.equal(res.errors.length, 0, res.errors.join());
  assert.equal(q.get('SELECT department FROM products WHERE id=?', [a]).department, 't_velvet');
  assert.equal(q.get('SELECT department FROM products WHERE id=?', [b]).department, 't_robe'); // not guessed
  assert.equal(q.get('SELECT COUNT(*) n FROM products').n, total);
  assert.ok(q.get('SELECT departments FROM stores WHERE id=?', [store]).departments.includes(',t_velvet,'));
  assert.ok(q.get('SELECT category_id FROM products WHERE id=?', [a]).category_id);
  assert.equal(mod.rollback(db, res.rollback).ok, true);
  assert.equal(q.get('SELECT department FROM products WHERE id=?', [a]).department, 't_robe');
  assert.ok(!q.get('SELECT departments FROM stores WHERE id=?', [store]).departments.includes(',t_velvet,'));
});

test('invalid plans are refused atomically: cycles, duplicate siblings, non-leaf target, wrong product ids, deactivate with products', async () => {
  const { db, q, mod, dept, prod } = await setup();
  dept('t_p', 'أب', 'women'); dept('t_c', 'ابن', 't_p'); dept('t_x', 'ابن', 't_p'); dept('t_full', 'ممتلئ', 'women');
  const p = prod('t_full');
  for (const op of [
    { op: 'reparent', slug: 't_p', parent_slug: 't_c' },
    { op: 'rename', slug: 't_x', name_ar: 'ابن' },
    { op: 'move_products', from: 't_full', to: 't_p' },
    { op: 'move_products', from: 't_c', to: 't_x', product_ids: [p] },
    { op: 'deactivate', slug: 't_full' },
  ]) { const r = mod.runCleanup(db, { operations: [op] }, { apply: true, backupVerified: true }); assert.equal(r.ok, false, JSON.stringify(op)); }
  assert.equal(q.get('SELECT department FROM products WHERE id=?', [p]).department, 't_full');
});

test('reparent + rename keep slug/id and are idempotent for create', async () => {
  const { db, q, mod, dept } = await setup();
  dept('t_hij', 'طرح', 'women'); const id = q.get('SELECT id FROM departments WHERE slug=?', ['t_hij']).id;
  const plan = { run_key: `r-${randomUUID().slice(0, 6)}`, operations: [{ op: 'create', slug: 't_new', name_ar: 'جديد', name_en: 'New', parent_slug: 'women' }, { op: 'rename', slug: 't_hij', name_ar: 'طرح وإيشاربات', name_en: 'Hijabs & Scarves' }] };
  assert.equal(mod.runCleanup(db, plan, { apply: true, backupVerified: true }).ok, true);
  assert.equal(q.get('SELECT id, name_ar FROM departments WHERE slug=?', ['t_hij']).id, id);
  const again = mod.runCleanup(db, { run_key: plan.run_key, operations: [plan.operations[0]] }, { apply: true, backupVerified: true });
  assert.equal(again.ok, true); assert.equal(again.actions[0].skipped, 'exists');
});

test('history is recorded once, verified after commit, rerun adds no duplicates, rollback marks it', async () => {
  const { db, q, mod, dept, prod } = await setup();
  dept('t_old_ev', 'فساتين سهرة', null, 1); dept('t_ev', 'فساتين سواريه', 'women'); prod('t_ev');
  const plan = { run_key: `r-${randomUUID().slice(0, 6)}`, operations: [{ op: 'rename', slug: 't_ev', name_ar: 'فساتين سواريه ', name_en: 'Evening Dresses' }, { op: 'alias', alias: 'فساتين-سهرة', kind: 'slug_ar', to: 't_ev', reason: 'audit confirmed' }] };
  assert.equal(mod.runCleanup(db, { ...plan, run_key: '' }, { apply: true, backupVerified: true }).ok, false); // no run_key -> refused
  const r1 = mod.runCleanup(db, plan, { apply: true, backupVerified: true });
  assert.equal(r1.ok, true, r1.errors.join());
  const rows = () => q.all('SELECT * FROM category_migrations WHERE run_key=?', [plan.run_key]);
  assert.equal(rows().length, 2); assert.ok(rows().every((x) => x.status === 'verified'));
  mod.runCleanup(db, plan, { apply: true, backupVerified: true });
  assert.equal(rows().length, 2); // rerun: no duplicates
  assert.equal(mod.rollback(db, r1.rollback).ok, true);
  assert.ok(rows().every((x) => x.status === 'rolled_back'));
});

test('aliases: resolve to the canonical active section; refuse live slugs, inactive/unknown targets, conflicts; no loops', async () => {
  const { db, q, dept } = await setup();
  const al = await import('../src/lib/category-aliases.js');
  dept('t_canon', 'كوت', 'women'); dept('t_other', 'سوت', 'women'); dept('t_off', 'قديم', null, 0);
  assert.equal(al.addAlias(db, { alias: 'بالطوهات', kind: 'slug_ar', to_slug: 't_canon' }).ok, true);
  assert.equal(al.addAlias(db, { alias: 'بالطوهات', kind: 'slug_ar', to_slug: 't_canon' }).skipped, 'exists');
  assert.equal(al.addAlias(db, { alias: 'بالطوهات', kind: 'slug_ar', to_slug: 't_other' }).ok, false); // conflicting
  assert.equal(al.addAlias(db, { alias: 't_other', kind: 'slug_en', to_slug: 't_canon' }).ok, false); // equals a live slug
  assert.equal(al.addAlias(db, { alias: 'x', kind: 'slug_en', to_slug: 't_off' }).ok, false); // inactive destination
  assert.equal(al.addAlias(db, { alias: 'x', kind: 'slug_en', to_slug: 'nope' }).ok, false);
  assert.equal(al.resolveAlias(db, encodeURIComponent('بالطوهات')), 't_canon');
  q.run('UPDATE departments SET active=0 WHERE slug=?', ['t_canon']);
  assert.equal(al.resolveAlias(db, 'بالطوهات'), null); // destination deactivated -> no dangling redirect
});
