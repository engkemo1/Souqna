import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.ADMIN_KEY = 'look-admin-key-0123456789';
test('look of the day: the back photo of an outfit travels from the admin settings to the shop (and is empty when not set)', async () => {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-look-${randomUUID()}.db`);
  process.env.JWT_SECRET = `look-back-${randomUUID()}`;
  const { insert } = await import('../src/db/index.js');
  const { saveLookOfDayAdminSettings, lookOfDayAdminSettings, lookOfDay } = await import('../src/lib/stylist.js');
  const user = insert('users', { name: 'Look', email: `${randomUUID()}@example.test`, password_hash: 'x' });
  const store = insert('stores', { owner_id: user, slug: `lk-${randomUUID().slice(0, 6)}`, code: 'LK', name_ar: 'محل اللوك', name_en: 'Look Shop' });
  const mk = (n) => insert('products', { store_id: store, slug: `p-${randomUUID().slice(0, 8)}`, name_ar: `منتج ${n}`, name_en: `Item ${n}`, price: 100 + n, status: 'active', track_stock: 0, department: null });
  const [a, b, c, d] = [1, 2, 3, 4].map(mk);
  const BACK = '/media/look-of-day/aaaaaaaaaaaaaaaaaaaaaaaa.webp';
  const RIGHT = '/media/look-of-day/cccccccccccccccccccccccc.webp';
  const LEFT = '/media/look-of-day/dddddddddddddddddddddddd.webp';
  const FRONT = '/media/look-of-day/bbbbbbbbbbbbbbbbbbbbbbbb.webp';
  const outfit = (pieces, extra = {}) => ({ audience: 'women', age: '', say: '', tips: '', occasion: 'كاجوال', coverImage: FRONT, images: [FRONT], pieces, ...extra });
  saveLookOfDayAdminSettings({ mode: 'manual', manual: { showOthers: false, coverImage: '', title: 't', description: '', badge: '', outfits: [
    outfit([{ label: 'فوق', productId: a }, { label: 'تحت', productId: b }], { backImage: BACK, rightImage: RIGHT, leftImage: LEFT }),
    outfit([{ label: 'فوق', productId: c }, { label: 'تحت', productId: d }]), // no back photo
  ] } });
  const admin = lookOfDayAdminSettings().manual.outfits;
  assert.equal(admin[0].backImage, BACK);
  assert.equal(admin[1].backImage, '');
  const { entries } = await lookOfDay();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].backImage, BACK);
  assert.equal(entries[0].rightImage, RIGHT);
  assert.equal(entries[0].leftImage, LEFT);
  assert.equal(entries[1].rightImage, '');
  assert.equal(entries[0].coverImage, FRONT);
  assert.equal(entries[1].backImage, '', 'an outfit without a back photo cannot be turned');
});

test('admin PUT /look-of-day accepts and persists backImage, and rejects a foreign image path', async () => {
  process.env.DB_FILE = process.env.DB_FILE || path.join(os.tmpdir(), `souqna-look-${randomUUID()}.db`);
  process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'look-admin-key-0123456789';
  delete process.env.ADMIN_TOTP_SECRET;
  const { default: express } = await import('express');
  const { createServer } = await import('node:http');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert } = await import('../src/db/index.js');
  const { lookOfDayAdminSettings } = await import('../src/lib/stylist.js');
  const user = insert('users', { name: 'L2', email: `${randomUUID()}@example.test`, password_hash: 'x' });
  const store = insert('stores', { owner_id: user, slug: `lk2-${randomUUID().slice(0, 6)}`, code: 'L2', name_ar: 'محل', name_en: 'Shop' });
  const mk = (n) => insert('products', { store_id: store, slug: `q-${randomUUID().slice(0, 8)}`, name_ar: `م ${n}`, name_en: `I ${n}`, price: 50, status: 'active', track_stock: 0 });
  const [a, b] = [1, 2].map(mk);
  const app = express(); app.use(express.json()); app.use('/api/admin', adminRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const put = (backImage) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/look-of-day`, {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY },
      body: JSON.stringify({ mode: 'manual', manual: { outfits: [{ audience: 'women', occasion: 'كاجوال', coverImage: '/media/look-of-day/c.webp', images: ['/media/look-of-day/c.webp'], backImage, rightImage: '/media/look-of-day/r.webp', leftImage: '/media/look-of-day/l.webp', pieces: [{ label: 'فوق', productId: a }, { label: 'تحت', productId: b }] }] } }),
    });
    const bad = await put('https://evil.example/x.webp');
    assert.equal(bad.status, 422);
    const ok = await put('/media/look-of-day/back1.webp');
    assert.equal(ok.status, 200, await ok.text());
    assert.equal(lookOfDayAdminSettings().manual.outfits[0].backImage, '/media/look-of-day/back1.webp');
    assert.equal(lookOfDayAdminSettings().manual.outfits[0].rightImage, '/media/look-of-day/r.webp');
    assert.equal(lookOfDayAdminSettings().manual.outfits[0].leftImage, '/media/look-of-day/l.webp');
  } finally { server.close(); }
});

test('a single-piece outfit (a tracksuit) is a complete look and is saved and shown', async () => {
  const { insert } = await import('../src/db/index.js');
  const { saveLookOfDayAdminSettings, lookOfDay } = await import('../src/lib/stylist.js');
  const user = insert('users', { name: 'One', email: `${randomUUID()}@example.test`, password_hash: 'x' });
  const store = insert('stores', { owner_id: user, slug: `one-${randomUUID().slice(0, 6)}`, code: 'ON', name_ar: 'محل', name_en: 'Shop' });
  const suit = insert('products', { store_id: store, slug: `t-${randomUUID().slice(0, 8)}`, name_ar: 'ترينج قطعتين', name_en: 'Tracksuit', price: 500, status: 'active', track_stock: 0 });
  saveLookOfDayAdminSettings({ mode: 'manual', manual: { showOthers: false, coverImage: '', title: '', description: '', badge: '', outfits: [
    { audience: 'men', age: '', say: '', tips: '', occasion: 'رياضي', coverImage: '/media/look-of-day/e.webp', images: ['/media/look-of-day/e.webp'], pieces: [{ label: 'ترينج', productId: suit }] },
  ] } });
  const { entries } = await lookOfDay();
  assert.ok(entries.some((e) => e.occasion === 'رياضي' && e.looks.length === 1), 'the one-piece outfit must be shown');
});
