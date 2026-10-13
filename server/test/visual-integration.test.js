import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

// isolated database; the colour model is used here (the CLIP model needs a download, which unit tests must not depend on)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-visual-'));
process.env.DB_FILE = path.join(dir, 'test.db');
delete process.env.VISUAL_MODEL;
const { q, insert } = await import('../src/db/index.js');
const visual = await import('../src/lib/visual.js');
const { toBlob } = await import('../src/lib/visual-core.js');

const solid = (r, g, b) => sharp({ create: { width: 96, height: 128, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const now = new Date().toISOString();

async function seed() {
  insert('users', { email: 'o@test.dev', password_hash: 'x', name: 'Owner', role: 'owner', created_at: now });
  const owner = q.get('SELECT id FROM users LIMIT 1').id;
  insert('stores', { owner_id: owner, slug: 'denim', code: 'D1', name_ar: 'دنيم هاوس', name_en: 'Denim House', status: 'active', hidden: 0 });
  const store = q.get('SELECT id FROM stores LIMIT 1').id;
  const mk = async (name, nameEn, colour) => {
    insert('products', { store_id: store, slug: nameEn.toLowerCase().replace(/ /g, '-'), name_ar: name, name_en: nameEn, price: 500, status: 'active', track_stock: 0 });
    const id = q.get('SELECT id FROM products ORDER BY id DESC LIMIT 1').id;
    const e = await visual.embedImage(await solid(...colour), 'color-v1');
    q.run('INSERT INTO visual_vectors (product_id, model, slot, media_id, vec) VALUES (?,?,?,?,?)', [id, e.model, 'm1', 1, toBlob(e.vec)]);
    return id;
  };
  return { black: await mk('بنطلون أسود سليم', 'Slim black trousers', [12, 12, 14]), pink: await mk('بنطلون وردي', 'Pink trousers', [240, 130, 170]), tee: await mk('تيشيرت أبيض', 'White t-shirt', [245, 245, 245]) };
}

test('empty catalogue → honest empty result, never a crash', async () => {
  const out = await visual.searchByImage(await solid(12, 12, 14), { type: 'bottoms' });
  assert.equal(out.groups.length, 1);
  assert.deepEqual(out.groups[0].items, []);
});

test('only genuinely similar products come back, and the chosen type filters others out', async () => {
  const ids = await seed();
  visual.invalidateVisualCache();
  const black = await visual.searchByImage(await solid(12, 12, 14), { type: 'bottoms' });
  assert.deepEqual(black.groups[0].items.map((x) => x.id), [ids.black]);
  assert.equal(black.groups[0].label, 'بناطيل وجينز');
  const tees = await visual.searchByImage(await solid(245, 245, 245), { type: 'bottoms' });
  assert.deepEqual(tees.groups[0].items, [], 'a white photo must not return pants just to fill the page');
  const white = await visual.searchByImage(await solid(245, 245, 245), { type: 'tops' });
  assert.deepEqual(white.groups[0].items.map((x) => x.id), [ids.tee]);
});

test('a photo that resembles nothing returns nothing (no filler)', async () => {
  const out = await visual.searchByImage(await solid(30, 200, 40), { type: 'bottoms' });
  assert.deepEqual(out.groups.flatMap((g) => g.items), []);
});

test('unknown type is rejected, auto mode (no type) searches everything with the colour model', async () => {
  await assert.rejects(visual.searchByImage(await solid(0, 0, 0), { type: 'nope' }), /Unknown item type/);
  const out = await visual.searchByImage(await solid(12, 12, 14));
  assert.equal(out.groups.length, 1);
  assert.equal(out.groups[0].type, '');
  assert.ok(out.groups[0].items.length >= 1);
});

test('status exposes CLIP availability and the new floor', () => {
  const s = visual.visualStatus();
  assert.ok('clip' in s.providers);
  assert.equal(typeof s.minSimilarityByModel.clip, 'number');
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
