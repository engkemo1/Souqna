import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

process.env.ADMIN_KEY = 'look-admin-key-0123456789';
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-recut-${randomUUID()}.db`);
process.env.MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-media-'));
process.env.JWT_SECRET = `recut-${randomUUID()}`;
delete process.env.ADMIN_TOTP_SECRET;

const photo = (bg) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${bg}"/><circle cx="200" cy="80" r="40" fill="#d9b49a"/><rect x="140" y="125" width="120" height="170" rx="20" fill="#3a6b4a"/><rect x="150" y="290" width="40" height="190" fill="#4a6a99"/><rect x="210" y="290" width="40" height="190" fill="#4a6a99"/></svg>`)).jpeg({ quality: 92 }).toBuffer();
const cornerAlpha = async (file) => { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return data[3]; };

test('admin: "cut background" turns an old look photo with a background into a transparent one, keeping the settings', async () => {
  const { default: express } = await import('express');
  const { createServer } = await import('node:http');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert } = await import('../src/db/index.js');
  const { saveLookOfDayImage } = await import('../src/lib/deptImage.js');
  const { saveLookOfDayAdminSettings, lookOfDayAdminSettings } = await import('../src/lib/stylist.js');
  process.env.LOOK_CUTOUT = '0';
  const oldUrl = await saveLookOfDayImage(await photo('#e2e2e0')); // uploaded "before cutting existed"
  delete process.env.LOOK_CUTOUT;
  const oldFile = path.join(process.env.MEDIA_DIR, oldUrl.replace(/^\/media\//, ''));
  assert.ok(fs.existsSync(oldFile));
  assert.notEqual(await cornerAlpha(oldFile), 0, 'the old photo keeps its background');

  const user = insert('users', { name: 'R', email: `${randomUUID()}@example.test`, password_hash: 'x' });
  const store = insert('stores', { owner_id: user, slug: `rc-${randomUUID().slice(0, 6)}`, code: 'RC', name_ar: 'محل', name_en: 'Shop' });
  const mk = (n) => insert('products', { store_id: store, slug: `r-${randomUUID().slice(0, 8)}`, name_ar: `م ${n}`, name_en: `I ${n}`, price: 50, status: 'active', track_stock: 0 });
  const [a, b] = [1, 2].map(mk);
  saveLookOfDayAdminSettings({ mode: 'manual', manual: { showOthers: false, coverImage: '', title: 'T', description: '', badge: '', outfits: [
    { audience: 'women', age: '', say: '', tips: '', occasion: 'كاجوال', coverImage: oldUrl, images: [oldUrl], pieces: [{ label: 'فوق', productId: a }, { label: 'تحت', productId: b }] },
  ] } });

  const app = express(); app.use(express.json()); app.use('/api/admin', adminRoutes); app.use(errorHandler);
  const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const post = () => fetch(`http://127.0.0.1:${server.address().port}/api/admin/look-of-day/cut-background`, { method: 'POST', headers: { 'x-admin-key': process.env.ADMIN_KEY } });
    const res = await post();
    assert.equal(res.status, 200);
    assert.ok((await res.json()).changed >= 1);
    const s = lookOfDayAdminSettings();
    assert.equal(s.mode, 'manual');
    const o = s.manual.outfits[0];
    assert.equal(o.pieces.length, 2);
    assert.notEqual(o.images[0], oldUrl, 'the photo has a new address');
    const newFile = path.join(process.env.MEDIA_DIR, o.images[0].replace(/^\/media\//, ''));
    assert.equal(await cornerAlpha(newFile), 0, 'the new photo has a transparent background');
    assert.ok(!fs.existsSync(oldFile), 'the old file is removed');
    const again = await (await post()).json();
    assert.equal(again.changed, 0, 'a photo that was cut is not cut twice');
  } finally { server.close(); }
});
