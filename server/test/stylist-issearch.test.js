// The live chat endpoint must tell the client when a reply is a plain product search (not a look), so it renders the compact row without a total.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-issearch-${randomUUID()}.db`);
process.env.JWT_SECRET = `is-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
const { default: publicRoutes } = await import('../src/routes/public.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { insert, q } = await import('../src/db/index.js');

const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
test.after(() => new Promise((r) => server.close(r)));
const post = async (messages) => (await fetch(`http://127.0.0.1:${server.address().port}/api/stylist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) })).json();

const ownerId = insert('users', { name: 'O', email: 'o@is.test', password_hash: 'x' });
const storeId = insert('stores', { owner_id: ownerId, slug: 'is-store', code: 'IS1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', phone: '01011112222', whatsapp: '01011112222' });
for (const [n, ar, price] of [['Hydrating Face Cream', 'كريم مرطب للوجه', 450], ['Vitamin C Serum', 'سيروم فيتامين سي', 600], ['Gentle Face Cleanser', 'غسول للوجه', 300], ['Sunscreen SPF50', 'واقي شمس', 700]]) {
  insert('products', { store_id: storeId, slug: `is-${randomUUID().slice(0, 6)}`, name_en: n, name_ar: ar, price, status: 'active', track_stock: 1, stock: 9 });
}
try { q.run("UPDATE products SET department='care'"); } catch { /* columns may differ */ }

test('a skincare search comes back flagged isSearch with at most 3 items and no total', async () => {
  const r = await post([{ role: 'user', content: 'عايزة حاجة للبشرة' }]);
  assert.equal(r.isSearch, true, JSON.stringify({ say: r.say, tabs: r.tabs, intent: r.intent }).slice(0, 400));
  assert.ok(r.tabs.length === 1 && r.tabs[0].items.length <= 3);
  assert.equal(r.total, 0);
});
test('a normal outfit reply is not flagged', async () => {
  const r = await post([{ role: 'user', content: 'سلام' }]);
  assert.notEqual(r.isSearch, true);
});
