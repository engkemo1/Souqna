import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

// isolated database + media folder; colour model only (unit tests must not download CLIP)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-vmulti-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.MEDIA_DIR = path.join(dir, 'media');
delete process.env.VISUAL_MODEL;
const { q, insert } = await import('../src/db/index.js');
const visual = await import('../src/lib/visual.js');
const { rankConfident, normalize } = await import('../src/lib/visual-core.js');

const solid = (r, g, b) => sharp({ create: { width: 96, height: 128, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const now = new Date().toISOString();

function addPhoto(storeId, productId, key, buf, primary, position) {
  const d = path.join(process.env.MEDIA_DIR, String(storeId), key); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'md.jpg'), buf);
  insert('media', { store_id: storeId, kind: 'product', key, width: 96, height: 128, sizes: '["md"]', original_ext: 'jpg', bytes: buf.length, attached: 1, created_at: now });
  const mediaId = q.get('SELECT id FROM media ORDER BY id DESC LIMIT 1').id;
  insert('product_media', { product_id: productId, media_id: mediaId, position, is_primary: primary });
  return mediaId;
}

test('rankConfident counts a product once, with its best photo', () => {
  const a = normalize(Float32Array.from([1, 0])); const b = normalize(Float32Array.from([0.8, 0.6]));
  const out = rankConfident(a, null, [{ id: 1, vec: b }, { id: 1, vec: a }, { id: 2, vec: b }], { floor: 0, useColor: false });
  assert.deepEqual(out.map((x) => x.id), [1]); // id 2 (0.8) is outside the 0.06 window of id 1's best photo (1.0)
  assert.ok(Math.abs(out[0].score - 1) < 1e-6);
});

test('every photo of a product is indexed (colour model is always kept), removed photos disappear, search finds the product via any photo', async () => {
  insert('users', { email: 'o@test.dev', password_hash: 'x', name: 'Owner', role: 'owner', created_at: now });
  insert('stores', { owner_id: q.get('SELECT id FROM users').id, slug: 'denim', code: 'D1', name_ar: 'دنيم', name_en: 'Denim', status: 'active', hidden: 0 });
  const store = q.get('SELECT id FROM stores').id;
  insert('products', { store_id: store, slug: 'pants', name_ar: 'بنطلون جينز', name_en: 'Jeans trousers', price: 500, status: 'active', track_stock: 0 });
  const pid = q.get('SELECT id FROM products').id;
  const m1 = addPhoto(store, pid, 'k1', await solid(12, 12, 14), 1, 0);   // black (primary)
  const m2 = addPhoto(store, pid, 'k2', await solid(240, 130, 170), 0, 1); // pink (second photo)

  const r = await visual.reindexPending(20);
  assert.ok(r.done >= 2);
  const rows = q.all('SELECT model, slot FROM visual_vectors WHERE product_id=? ORDER BY slot', [pid]);
  assert.deepEqual(rows.map((x) => `${x.model}:${x.slot}`), [`color-v1:m${m1}`, `color-v1:m${m2}`]);
  assert.ok(q.get('SELECT hist FROM visual_vectors WHERE product_id=? LIMIT 1', [pid]).hist, 'colour histogram stored per photo');
  assert.ok(q.get('SELECT 1 AS x FROM product_colors WHERE product_id=?', [pid]), 'primary colour histogram kept for owner reports');

  visual.invalidateVisualCache();
  const viaPrimary = await visual.searchByImage(await solid(12, 12, 14), { type: 'bottoms' });
  const viaSecond = await visual.searchByImage(await solid(240, 130, 170), { type: 'bottoms' });
  assert.deepEqual(viaPrimary.groups[0].items.map((x) => x.id), [pid]);
  assert.deepEqual(viaSecond.groups[0].items.map((x) => x.id), [pid], 'second photo finds the product, and it is listed once');

  q.run('DELETE FROM product_media WHERE product_id=? AND media_id=?', [pid, m2]);
  await visual.reindexPending(20);
  assert.equal(q.all('SELECT 1 FROM visual_vectors WHERE product_id=?', [pid]).length, 1);
});

test('CLIP selected but unavailable → searches still answered by the colour model (no empty page)', async () => {
  visual.saveVisualSettings({ model: 'clip' });
  visual.invalidateVisualCache();
  const t0 = Date.now();
  const out = await visual.searchByImage(await solid(12, 12, 14), { type: 'bottoms' });
  assert.equal(out.model, 'color-v1');
  assert.equal(out.groups[0].items.length, 1);
  assert.ok(Date.now() - t0 < 8000, 'never blocks on a model download');
  visual.saveVisualSettings({ model: 'color' });
});

test('closest alternatives: same type, below the strict floor, never repeating the exact matches; nothing when nothing is close', async () => {
  const { toBlob } = await import('../src/lib/visual-core.js');
  const store = q.get('SELECT id FROM stores').id;
  insert('products', { store_id: store, slug: 'grey-pants', name_ar: 'بنطلون رمادي', name_en: 'Grey trousers', price: 400, status: 'active', track_stock: 0 });
  const grey = q.get('SELECT id FROM products ORDER BY id DESC LIMIT 1').id;
  const e = await visual.embedImage(await solid(120, 120, 125), 'color-v1');
  q.run('INSERT INTO visual_vectors (product_id, model, slot, media_id, vec) VALUES (?,?,?,?,?)', [grey, e.model, 'm1', 1, toBlob(e.vec)]);
  insert('products', { store_id: store, slug: 'white-tee', name_ar: 'تيشيرت أبيض', name_en: 'White t-shirt', price: 200, status: 'active', track_stock: 0 });
  const tee = q.get('SELECT id FROM products ORDER BY id DESC LIMIT 1').id;
  const t = await visual.embedImage(await solid(250, 250, 250), 'color-v1');
  q.run('INSERT INTO visual_vectors (product_id, model, slot, media_id, vec) VALUES (?,?,?,?,?)', [tee, t.model, 'm1', 1, toBlob(t.vec)]);
  visual.invalidateVisualCache();

  const pantsId = q.get("SELECT id FROM products WHERE slug='pants'").id;
  const black = (await visual.searchByImage(await solid(12, 12, 14), { type: 'bottoms' })).groups[0];
  assert.deepEqual(black.items.map((x) => x.id), [pantsId]);
  assert.deepEqual(black.similar.map((x) => x.id), [grey], 'the grey trousers are the closest alternative, listed apart from the exact match');
  assert.ok(!black.similar.some((x) => x.id === tee), 'other garment types never appear as alternatives');
  assert.ok(black.similar[0].score < black.items[0].score);

  const red = (await visual.searchByImage(await solid(200, 60, 60), { type: 'bottoms' })).groups[0];
  assert.deepEqual([red.items, red.similar], [[], []], 'nothing resembles it → nothing is shown, the sourcing offer takes over');
});

test('old single-vector table is migrated into visual_vectors once on start-up', async () => {
  const { execFileSync } = await import('node:child_process');
  const file = path.join(dir, 'migrate.db');
  const run = (code) => execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', code], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, DB_FILE: file }, encoding: 'utf8' });
  // 1st start creates the schema; then simulate the old layout (a vector in product_vectors, nothing in visual_vectors)
  run(`const { q, insert, db } = await import('./src/db/index.js');
       insert('users', { email: 'm@t.dev', password_hash: 'x', name: 'M', role: 'owner' });
       insert('stores', { owner_id: 1, slug: 's', code: 'S1', name_ar: 'م', name_en: 'S', status: 'active', hidden: 0 });
       insert('products', { store_id: 1, slug: 'p', name_ar: 'م', name_en: 'P', price: 1, status: 'active' });
       db.prepare('INSERT INTO product_vectors (product_id, media_id, model, vec) VALUES (1, 7, ?, ?)').run('color-v1', Buffer.from(new Float32Array([1, 0]).buffer));
       db.prepare('INSERT INTO product_colors (product_id, media_id, hist) VALUES (1, 7, ?)').run(Buffer.from(new Float32Array([0.5, 0.5]).buffer));
       db.exec('DELETE FROM visual_vectors');`);
  // 2nd start runs the migration
  const out = run(`const { q } = await import('./src/db/index.js');
       console.log(JSON.stringify({ v: q.all('SELECT model, slot, media_id, length(hist) AS h FROM visual_vectors'), old: q.get('SELECT COUNT(*) AS c FROM product_vectors').c }));`);
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.deepEqual(r.v, [{ model: 'color-v1', slot: 'm7', media_id: 7, h: 8 }]);
  assert.equal(r.old, 0);
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
