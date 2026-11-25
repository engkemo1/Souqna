// The size cleanup script: preview changes nothing, APPLY rewrites letter/number sizes only, skips duplicates, leaves ages alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DB = path.join(os.tmpdir(), `souqna-normsize-${randomUUID()}.db`);
process.env.DB_FILE = DB; process.env.JWT_SECRET = `ns-${randomUUID()}`;
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/scripts/normalize-sizes.js');

test('normalize-sizes: dry run is read-only; APPLY fixes letter/number sizes and keeps ages', async () => {
  const { q, insert } = await import('../src/db/index.js');
  const uid = insert('users', { name: 'o', email: 'o@x.test', password_hash: 'x', role: 'owner', token_version: 1 });
  const sid = insert('stores', { owner_id: uid, slug: 'ns', code: 'NS1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
  const pid = insert('products', { store_id: sid, slug: 'p', name_en: 'p', name_ar: 'p', price: 100, status: 'active', track_stock: 1, stock: 5, department: 'women_tops' });
  const v = (size, color = '#112233') => insert('variants', { product_id: pid, size, color, stock: 3 });
  const a = v('m'); const b = v('١٠'); const c = v('2Y'); const d = v('L'); const e = v('l'); // 'l' would collide with the existing 'L'
  const run = (apply) => execFileSync(process.execPath, ['--no-warnings', script], { env: { ...process.env, APPLY: apply ? '1' : '0' }, encoding: 'utf8' });
  const sizeOf = (id) => q.get('SELECT size FROM variants WHERE id=?', [id]).size;
  const out = run(false);
  assert.match(out, /DRY RUN/); assert.equal(sizeOf(a), 'm');
  run(true);
  assert.equal(sizeOf(a), 'M'); assert.equal(sizeOf(b), '10'); assert.equal(sizeOf(c), '2Y'); assert.equal(sizeOf(d), 'L'); assert.equal(sizeOf(e), 'l');
});
