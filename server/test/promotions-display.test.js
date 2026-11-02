import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-display-${randomUUID()}.db`);
  process.env.JWT_SECRET = `display-test-${randomUUID()}`;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: ownerRoutes } = await import('../src/routes/owner.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signToken } = await import('../src/lib/auth.js');
  const dbm = await import('../src/db/index.js');
  const store = await import('../src/lib/promotions/store.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', publicRoutes);
  app.use('/api/owner', ownerRoutes);
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const { insert, q } = dbm;
  const mk = (suffix, code) => {
    const userId = insert('users', { name: `Owner ${suffix}`, email: `${randomUUID()}@example.test`, password_hash: 'x' });
    const storeId = insert('stores', { owner_id: userId, slug: `promo-${suffix}-${randomUUID().slice(0, 6)}`, code, name_ar: `محل ${suffix}`, name_en: `Store ${suffix}`, shipping_fee: 50, free_shipping_over: 100000 });
    const cat = insert('categories', { store_id: storeId, slug: 'c1', name_ar: 'قسم', name_en: 'Cat' });
    const prod = (n, price, stock = 20, category_id = cat) => insert('products', { store_id: storeId, slug: `p${n}-${randomUUID().slice(0, 5)}`, name_ar: `منتج ${n}`, name_en: `Item ${n}`, price, stock, category_id });
    return { userId, storeId, slug: q.get('SELECT slug FROM stores WHERE id=?', [storeId]).slug, cat, prod, token: signToken({ id: userId }) };
  };
  const post = async (url, body, token) => { const r = await fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const get = async (url, token) => { const r = await fetch(`${base}${url}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }); return { status: r.status, body: await r.json() }; };
  const put = async (url, body, token) => { const r = await fetch(`${base}${url}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const patch = async (url, body, token) => { const r = await fetch(`${base}${url}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const del = async (url, token) => { const r = await fetch(`${base}${url}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() }; };
  return { server, mk, post, get, put, patch, del, q, insert, store };
}

const offer = (over = {}) => ({ name_ar: 'اشتري 2 والتالتة مجانًا', type: 'buy_x_get_y', status: 'active', def: { qualify: { all: true }, effect: { kind: 'buy_x_get_y', buy: 2, get: 1 } }, ...over });

test('offer display settings (fit, shape, text colour, font) are saved, returned and optional', async () => {
  const t = await setup();
  try {
    const A = t.mk('d', 'DS1');
    const plain = await t.post('/owner/promotions', offer(), A.token);
    assert.equal(plain.status, 201);
    assert.equal(plain.body.offer.display, null, 'no settings = today\'s look');
    const display = { fit: 'contain', focus: 'top', ratio: 'auto', text_color: '#F5D77A', font: 'cairo' };
    const made = await t.post('/owner/promotions', offer({ name_ar: 'عرض بشكل مخصص', display }), A.token);
    assert.equal(made.status, 201);
    assert.deepEqual(made.body.offer.display, display);
    const id = made.body.offer.id;
    const edited = await t.put(`/owner/promotions/${id}`, offer({ name_ar: 'عرض بشكل مخصص', display: { ...display, fit: 'cover' } }), A.token);
    assert.equal(edited.body.offer.display.fit, 'cover');
    const noDisplayEdit = await t.put(`/owner/promotions/${id}`, offer({ name_ar: 'عرض بشكل مخصص' }), A.token);
    assert.equal(noDisplayEdit.body.offer.display.fit, 'cover', 'an edit that does not mention display keeps it');
    const bad = await t.post('/owner/promotions', offer({ display: { text_color: 'red' } }), A.token);
    assert.ok(bad.status >= 400 && bad.status < 500, 'a colour must be #RRGGBB');
  } finally { t.server.close(); }
});
