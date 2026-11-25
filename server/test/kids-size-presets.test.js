// Migration: kids' size presets get the finer baby/age steps, but only where the admin still has the old default list.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(os.tmpdir(), `souqna-kidpresets-${randomUUID()}.db`);
const env = { ...process.env, DB_FILE: DB, JWT_SECRET: `kp-${randomUUID()}-min32charslong-xxxxxxx`, NODE_ENV: 'test' };
const run = (code) => execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', code], { cwd: server, env, encoding: 'utf8' }).trim().split('\n').pop();
const OLD = ['0-3M', '3-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y'];

test('old default kids list is upgraded; an admin-edited list and non-age lists are left alone; re-running changes nothing', () => {
  const sizes = (slug) => `JSON.parse(q.val(\`SELECT sizes_json FROM departments WHERE slug='${slug}'\`) || 'null')`;
  run(`const { q, insert } = await import('./src/db/index.js');
    for (const [slug, parent] of [['kids_boys', 'kids'], ['kids_girls', 'kids'], ['kids_baby_acc', 'kids']]) { if (!q.get('SELECT 1 FROM departments WHERE slug=?', [slug])) insert('departments', { slug, name_ar: slug, name_en: slug, parent_slug: parent, active: 1 }); }
    q.run('UPDATE departments SET sizes_json=? WHERE slug=?', [JSON.stringify(${JSON.stringify(OLD)}), 'kids_boys']);
    q.run('UPDATE departments SET sizes_json=? WHERE slug=?', [JSON.stringify(['2Y', '4Y']), 'kids_girls']);
    q.run('UPDATE departments SET sizes_json=? WHERE slug=?', [JSON.stringify(['Free size']), 'kids_baby_acc']);
    console.log('seeded');`);
  const out = JSON.parse(run(`const { q } = await import('./src/db/index.js'); const g = (s) => JSON.parse(q.val("SELECT sizes_json FROM departments WHERE slug=?", [s]) || 'null'); console.log(JSON.stringify({ boys: g('kids_boys'), girls: g('kids_girls'), acc: g('kids_baby_acc') }));`));
  for (const s of ['6-9M', '9-12M', '12-18M', '18-24M', '5Y', '7Y']) assert.ok(out.boys.includes(s), s);
  assert.deepEqual(out.boys.filter((x) => OLD.includes(x)), OLD.filter((x) => out.boys.includes(x)), 'old sizes kept');
  assert.deepEqual(out.girls, ['2Y', '4Y']); assert.deepEqual(out.acc, ['Free size']);
  const again = JSON.parse(run(`const { q } = await import('./src/db/index.js'); console.log(JSON.stringify(JSON.parse(q.val("SELECT sizes_json FROM departments WHERE slug='kids_boys'"))));`));
  assert.deepEqual(again, out.boys);
});
