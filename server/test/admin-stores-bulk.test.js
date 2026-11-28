// Admin quick actions on many shops at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const ADMIN_KEY = 'test-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-storesbulk-${randomUUID()}.db`);
process.env.JWT_SECRET = `sb-${randomUUID()}-min32charslong-xxxxxxxx`;
process.env.ADMIN_KEY = ADMIN_KEY; process.env.NODE_ENV = 'test';
const { default: adminRoutes } = await import('../src/routes/admin.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');
const app = express(); app.use(express.json()); app.use('/api/admin', adminRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
test.after(() => new Promise((r) => server.close(r)));
const post = async (body, key = ADMIN_KEY) => { const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/stores/bulk`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: JSON.stringify(body) }); return { status: res.status, json: await res.json().catch(() => ({})) }; };
const mk = (n) => { const o = insert('users', { name: 'O', email: `o${n}@sb.test`, password_hash: 'x' }); insert('stores', { owner_id: o, slug: `sb-${n}`, code: `SB${n}`, name_ar: 'م' + n, name_en: 'S' + n, shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' }); };
[1, 2, 3].forEach(mk);
const row = (n) => q.get('SELECT status, hidden, featured, commission_rate_override AS c FROM stores WHERE slug=?', [`sb-${n}`]);

test('needs the admin key', async () => { assert.equal((await post({ slugs: ['sb-1'], action: 'hide' }, null)).status === 200, false); });
test('hide / show, suspend / activate, feature / unfeature on several shops', async () => {
  assert.equal((await post({ slugs: ['sb-1', 'sb-2', 'nope'], action: 'hide' })).json.done, 2);
  assert.equal(row(1).hidden, 1); assert.equal(row(2).hidden, 1); assert.equal(row(3).hidden, 0);
  await post({ slugs: ['sb-1', 'sb-2'], action: 'show' }); assert.equal(row(1).hidden, 0);
  await post({ slugs: ['sb-3'], action: 'suspend' }); assert.equal(row(3).status, 'suspended');
  await post({ slugs: ['sb-3'], action: 'activate' }); assert.equal(row(3).status, 'active');
  await post({ slugs: ['sb-1', 'sb-3'], action: 'feature' }); assert.equal(row(1).featured, 1); assert.equal(row(3).featured, 1);
  await post({ slugs: ['sb-1'], action: 'unfeature' }); assert.equal(row(1).featured, 0);
});
test('commission rate for many shops at once; null clears the exception', async () => {
  const r = await post({ slugs: ['sb-1', 'sb-2'], action: 'commission', rate: 5 }); assert.equal(r.json.done, 2);
  assert.equal(row(1).c, 5); assert.equal(row(2).c, 5); assert.equal(row(3).c, null);
  await post({ slugs: ['sb-1'], action: 'commission', rate: null }); assert.equal(row(1).c, null);
  assert.equal((await post({ slugs: ['sb-1'], action: 'commission' })).status, 422);
  assert.equal((await post({ slugs: ['sb-1'], action: 'commission', rate: 150 })).status, 422);
  assert.equal((await post({ slugs: ['sb-1'], action: 'delete' })).status, 422);
});
