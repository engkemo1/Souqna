// The store page's size filter shows ONE chip per real size (10Y/10y merged) and the filter finds every spelling.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-store-size-${randomUUID()}.db`);
process.env.JWT_SECRET = `store-size-${randomUUID()}`;

test('store products: merged size chips and spelling-tolerant size filter', async () => {
  const express = (await import('express')).default; const { createServer } = await import('node:http');
  const { default: routes } = await import('../src/routes/public.js'); const { errorHandler } = await import('../src/lib/errors.js');
  const { q, insert } = await import('../src/db/index.js');
  const uid = insert('users', { name: 'o', email: 'o@x.test', password_hash: 'x', role: 'owner', token_version: 1 });
  const sid = insert('stores', { owner_id: uid, slug: 'sz-store', code: 'SZ1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
  const mk = (name, sizes) => { const pid = insert('products', { store_id: sid, slug: name, name_ar: name, name_en: name, price: 100, status: 'active', track_stock: 1, department: 'women_tops', stock: 5 }); for (const s of sizes) insert('variants', { product_id: pid, size: s, color: '#112233', stock: 5 }); return pid; };
  const a = mk('a', ['M', 'm']); const b = mk('b', ['L']);
  const app = express(); app.use(express.json()); app.use('/api', routes); app.use(errorHandler);
  const srv = createServer(app); await new Promise((r) => srv.listen(0, r));
  const get = async (u) => (await fetch(`http://127.0.0.1:${srv.address().port}/api${u}`)).json();
  const all = await get('/stores/sz-store/products');
  assert.equal(all.facets.sizes.filter((s) => s === 'M').length, 1, JSON.stringify(all.facets.sizes));
  assert.ok(!all.facets.sizes.includes('m'));
  const m = await get('/stores/sz-store/products?sizes=M');
  assert.deepEqual(m.items.map((x) => x.id), [a]);
  assert.ok(q && b);
  srv.close();
});
