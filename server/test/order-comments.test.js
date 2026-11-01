import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

const ADMIN_KEY = 'test-admin-key-0123456789';
let codeSeq = 0;
const customer = { name: 'Test Customer', phone: '01012345678', governorate: 'Qalyubia', city: 'Banha', address: 'Test street, building 1' };

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-comments-${randomUUID()}.db`);
  process.env.JWT_SECRET = `comments-${randomUUID()}`;
  process.env.ADMIN_KEY = ADMIN_KEY;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: ownerRoutes } = await import('../src/routes/owner.js');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { signToken } = await import('../src/lib/auth.js');
  const { insert, q } = await import('../src/db/index.js');
  const app = express(); app.use(express.json({ limit: '1mb' }));
  app.use('/api/owner', ownerRoutes); app.use('/api/admin', adminRoutes); app.use('/api', publicRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, headers = {}) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return { status: r.status, body: j }; };
  const mk = (suffix, code) => {
    const userId = insert('users', { name: `Owner ${suffix}`, email: `${randomUUID()}@example.test`, password_hash: 'x' });
    const storeId = insert('stores', { owner_id: userId, slug: `cm-${suffix}-${randomUUID().slice(0, 6)}`, code: `${code}${++codeSeq}`, name_ar: `محل ${suffix}`, name_en: `Store ${suffix}`, shipping_fee: 50, free_shipping_over: 100000 });
    const product = insert('products', { store_id: storeId, slug: `p-${randomUUID().slice(0, 5)}`, name_ar: `منتج ${suffix}`, name_en: `Item ${suffix}`, price: 200, stock: 50 });
    return { userId, storeId, product, slug: q.get('SELECT slug FROM stores WHERE id=?', [storeId]).slug, auth: { authorization: `Bearer ${signToken({ id: userId })}` } };
  };
  const single = (s, extra = {}) => call('POST', `/stores/${s.slug}/orders`, { ...customer, items: [{ productId: s.product, qty: 1 }], ...extra });
  const market = (list, extra = {}) => call('POST', '/marketplace/orders', { ...customer, stores: list.map(({ s, storeNote }) => ({ slug: s.slug, items: [{ productId: s.product, qty: 1 }], ...(storeNote !== undefined ? { storeNote } : {}) })), ...extra });
  return { server, call, mk, single, market, q, insert, admin: (m, u, b) => call(m, `/admin${u}`, b, { 'x-admin-key': ADMIN_KEY }) };
}
const rowByNumber = (t, number) => t.q.get('SELECT * FROM orders WHERE number=?', [number]);

test('single store: general + store comment are saved, and shown to merchant, admin and customer', async () => {
  const t = await setup();
  try {
    const A = t.mk('A', 'CMA');
    const r = await t.single(A, { notes: 'Please call before arriving', storeNote: 'Size M, gift wrap' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = rowByNumber(t, r.body.order.number);
    assert.equal(row.notes, 'Please call before arriving'); assert.equal(row.store_note, 'Size M, gift wrap');
    const m = await t.call('GET', `/owner/orders/${row.id}`, null, A.auth);
    assert.equal(m.status, 200); assert.equal(m.body.order.notes, 'Please call before arriving'); assert.equal(m.body.order.storeNote, 'Size M, gift wrap');
    const a = await t.admin('GET', `/orders/${row.id}`);
    assert.equal(a.body.order.notes, 'Please call before arriving'); assert.deepEqual(a.body.storeNotes.map((x) => [x.store_name, x.note]), [['محل A', 'Size M, gift wrap']]);
    const c = await t.call('GET', `/track/${r.body.order.trackToken}`);
    assert.equal(c.body.order.notes, 'Please call before arriving'); assert.equal(c.body.order.storeNote, 'Size M, gift wrap');
    // comments survive status changes
    const st = await t.call('PATCH', `/owner/orders/${row.id}/status`, { status: 'confirmed' }, A.auth);
    assert.equal(st.status, 200, JSON.stringify(st.body));
    const after = await t.call('GET', `/owner/orders/${row.id}`, null, A.auth);
    assert.equal(after.body.order.status, 'confirmed'); assert.equal(after.body.order.storeNote, 'Size M, gift wrap'); assert.equal(after.body.order.notes, 'Please call before arriving');
  } finally { t.server.close(); }
});

test('multi-store: each merchant sees the general note and ONLY their own store note; admin sees all; customer sees own per order', async () => {
  const t = await setup();
  try {
    const A = t.mk('A', 'CMA'); const B = t.mk('B', 'CMB');
    const r = await t.market([{ s: A, storeNote: 'NOTE-FOR-A-ONLY' }, { s: B, storeNote: 'NOTE-FOR-B-ONLY' }], { notes: 'GENERAL-NOTE' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const oa = r.body.orders.find((o) => o.storeSlug === A.slug); const ob = r.body.orders.find((o) => o.storeSlug === B.slug);
    const ra = rowByNumber(t, oa.number); const rb = rowByNumber(t, ob.number);
    assert.equal(ra.store_note, 'NOTE-FOR-A-ONLY'); assert.equal(rb.store_note, 'NOTE-FOR-B-ONLY'); assert.equal(ra.notes, 'GENERAL-NOTE'); assert.equal(rb.notes, 'GENERAL-NOTE');
    const ma = await t.call('GET', `/owner/orders/${ra.id}`, null, A.auth); const txtA = JSON.stringify(ma.body);
    assert.ok(txtA.includes('GENERAL-NOTE') && txtA.includes('NOTE-FOR-A-ONLY')); assert.equal(txtA.includes('NOTE-FOR-B-ONLY'), false, 'merchant A never receives the other store note');
    const mb = await t.call('GET', `/owner/orders/${rb.id}`, null, B.auth); const txtB = JSON.stringify(mb.body);
    assert.ok(txtB.includes('NOTE-FOR-B-ONLY')); assert.equal(txtB.includes('NOTE-FOR-A-ONLY'), false);
    // a merchant cannot open another store's order at all
    assert.equal((await t.call('GET', `/owner/orders/${rb.id}`, null, A.auth)).status, 404);
    // the merchant order LIST never carries the note of a sibling store either
    const list = await t.call('GET', '/owner/orders', null, A.auth); assert.equal(JSON.stringify(list.body).includes('NOTE-FOR-B-ONLY'), false);
    // admin sees every store's note, tagged with its store
    const ad = await t.admin('GET', `/orders/${ra.id}`);
    assert.deepEqual(ad.body.storeNotes.map((x) => [x.store_name, x.note]), [['محل A', 'NOTE-FOR-A-ONLY'], ['محل B', 'NOTE-FOR-B-ONLY']]);
    assert.equal(ad.body.order.notes, 'GENERAL-NOTE');
    // customer: each order shows the general note + that store's note
    const ca = (await t.call('GET', `/track/${oa.trackToken}`)).body.order; const cb = (await t.call('GET', `/track/${ob.trackToken}`)).body.order;
    assert.equal(ca.notes, 'GENERAL-NOTE'); assert.equal(ca.storeNote, 'NOTE-FOR-A-ONLY'); assert.equal(cb.storeNote, 'NOTE-FOR-B-ONLY');
    // someone with the wrong phone cannot read the comments
    const bad = await t.call('POST', '/track/lookup', { number: oa.number, phone: '01099999999' });
    assert.equal(bad.status, 404); assert.equal(JSON.stringify(bad.body).includes('NOTE-FOR'), false);
  } finally { t.server.close(); }
});

test('validation: 500 limit, markup stripped, empty handled, only stores that are in the order', async () => {
  const t = await setup();
  try {
    const A = t.mk('A', 'CMA'); const B = t.mk('B', 'CMB');
    const long = 'x'.repeat(501); const base0 = t.q.val('SELECT COUNT(*) FROM orders');
    assert.equal((await t.single(A, { notes: long })).status, 422);
    assert.equal((await t.single(A, { storeNote: long })).status, 422);
    assert.equal((await t.market([{ s: A, storeNote: long }])).status, 422);
    assert.equal((await t.market([{ s: A }], { notes: long })).status, 422);
    assert.equal(t.q.val('SELECT COUNT(*) FROM orders'), base0, 'rejected requests create nothing');
    const ok = await t.single(A, { notes: 'y'.repeat(500), storeNote: 'z'.repeat(500) });
    assert.equal(ok.status, 201); assert.equal(rowByNumber(t, ok.body.order.number).notes.length, 500);
    // markup is stripped, never stored
    const xss = await t.single(A, { notes: '<script>alert(1)</script>hello <b>world</b>', storeNote: '<img src=x onerror=alert(1)>ok & <>' });
    const row = rowByNumber(t, xss.body.order.number);
    assert.equal(row.notes, 'alert(1)hello world'); assert.equal(row.store_note, 'ok &');
    assert.ok(!/[<>]/.test(row.notes + row.store_note));
    // empty / whitespace
    const empty = await t.single(A, { notes: '   ', storeNote: '' });
    const er = rowByNumber(t, empty.body.order.number); assert.equal(er.store_note, null); assert.equal(er.notes, '');
    const none = await t.single(A); assert.equal(none.status, 201); assert.equal(rowByNumber(t, none.body.order.number).store_note, null);
    // a note can only ride on a store that is part of the order; extra/unknown fields are ignored, unknown stores fail the whole checkout
    const before = t.q.val('SELECT COUNT(*) FROM orders');
    const sneaky = await t.market([{ s: A, storeNote: 'for A' }], { storeNotes: { [B.slug]: 'SNEAK-FOR-B' }, storeNote: 'SNEAK-TOP' });
    assert.equal(sneaky.status, 201);
    assert.equal(t.q.val("SELECT COUNT(*) FROM orders WHERE store_note LIKE 'SNEAK%'"), 0); assert.equal(t.q.val('SELECT COUNT(*) FROM orders WHERE store_id=? AND store_note IS NOT NULL', [B.storeId]), 0);
    const ghost = await t.call('POST', '/marketplace/orders', { ...customer, stores: [{ slug: 'no-such-store', storeNote: 'x', items: [{ productId: 1, qty: 1 }] }] });
    assert.ok(ghost.status >= 400); assert.equal(t.q.val('SELECT COUNT(*) FROM orders'), before + 1);
  } finally { t.server.close(); }
});

test('old orders without comments keep working; admin-only data is not reachable without the admin key; nobody can edit comments after placing', async () => {
  const t = await setup();
  try {
    const A = t.mk('A', 'CMA');
    const id = t.insert('orders', { store_id: A.storeId, number: 'OLD-1', customer_name: 'Old', phone: '01012345678', status: 'pending', subtotal: 200, total: 250, track_token: 'oldtoken1234567890' });
    const m = await t.call('GET', `/owner/orders/${id}`, null, A.auth);
    assert.equal(m.status, 200); assert.equal(m.body.order.storeNote, null); assert.equal(m.body.order.notes ?? null, null);
    const a = await t.admin('GET', `/orders/${id}`); assert.equal(a.status, 200); assert.deepEqual(a.body.storeNotes, []);
    const c = await t.call('GET', '/track/oldtoken1234567890'); assert.equal(c.status, 200); assert.equal(c.body.order.storeNote, null);
    // admin-only
    for (const headers of [{}, { 'x-admin-key': 'wrong' }, A.auth]) { const r = await t.call('GET', `/admin/orders/${id}`, null, headers); assert.ok([401, 403].includes(r.status), `status ${r.status}`); }
    // no edit path: status updates and the customer's delivery-fee endpoint ignore comment fields
    const placed = await t.single(A, { notes: 'orig', storeNote: 'orig-store' }); const row = rowByNumber(t, placed.body.order.number);
    await t.call('PATCH', `/owner/orders/${row.id}/status`, { status: 'confirmed', notes: 'changed', storeNote: 'changed' }, A.auth);
    await t.call('POST', `/track/${placed.body.order.trackToken}/delivery-fee`, { accepted: true, notes: 'changed', storeNote: 'changed' });
    const after = rowByNumber(t, placed.body.order.number); assert.equal(after.notes, 'orig'); assert.equal(after.store_note, 'orig-store');
  } finally { t.server.close(); }
});
