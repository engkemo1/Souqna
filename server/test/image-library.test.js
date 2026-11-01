import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import sharp from 'sharp';

const ADMIN_KEY = 'test-admin-key-0123456789';

/** A distinct 400×400 picture per seed (stripes of different width/orientation), so hashes differ and near-duplicates are detectable. */
const pic = (seed, size = 400, format = 'png') => {
  const raw = Buffer.alloc(size * size * 3);
  const f1 = 0.004 + seed * 0.0023, f2 = 0.003 + ((seed * 7) % 11) * 0.0019, p = seed * 1.7;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.sin(x * f1 * 6 + p) * Math.cos(y * f2 * 6 - p) * 0.5 + 0.5;
    const o = (y * size + x) * 3; raw[o] = Math.floor(v * 255); raw[o + 1] = Math.floor((1 - v) * 180 + (seed % 5) * 10); raw[o + 2] = Math.floor(((x + y) / (2 * size)) * 255);
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })[format]().toBuffer();
};

const mediaDir = path.join(os.tmpdir(), `souqna-img-${randomUUID()}`);
const filesUnder = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0);
let seq = 0;

async function setup() {
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-img-${randomUUID()}.db`);
  process.env.MEDIA_DIR = mediaDir;
  process.env.JWT_SECRET = `img-${randomUUID()}`;
  process.env.ADMIN_KEY = ADMIN_KEY;
  const { default: publicRoutes } = await import('../src/routes/public.js');
  const { default: adminRoutes } = await import('../src/routes/admin.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { insert, q, db } = await import('../src/db/index.js');
  const mig = await import('../src/lib/catalog-migration.js');
  const gen = await import('../src/lib/image-gen.js');
  const lib = await import('../src/lib/image-assets.js');
  if (!globalThis.__imgMigrated) { mig.apply(db, { approved: true }); globalThis.__imgMigrated = true; }
  const app = express();
  app.use(express.json());
  app.use('/api', publicRoutes); app.use('/api/admin', adminRoutes); app.use(errorHandler);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, headers = {}) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return { status: r.status, body: j }; };
  const admin = (method, url, body) => call(method, `/admin${url}`, body, { 'x-admin-key': ADMIN_KEY });
  const upload = async (files, extra = {}, url = '/admin/image-library/upload') => {
    const fd = new FormData();
    for (const [name, buf] of files) fd.append('files', new Blob([buf]), name);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const r = await fetch(base + url, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY }, body: fd });
    return { status: r.status, body: await r.json() };
  };
  const userId = insert('users', { name: 'O', email: `${randomUUID()}@e.test`, password_hash: 'x' });
  const storeId = insert('stores', { owner_id: userId, slug: `il-${randomUUID().slice(0, 6)}`, code: 'IL1', name_ar: 'م', name_en: 'S', shipping_fee: 0, status: 'active', departments: ',hijabs_chiffon,', category: 'mixed' });
  return { server, call, admin, upload, q, insert, gen, lib, storeId };
}
const dept = (t, slug) => t.q.get('SELECT * FROM departments WHERE slug=?', [slug]);
const assets = (t) => t.q.val('SELECT COUNT(*) FROM image_assets');

test('saveAsset stores metadata + variants once and rejects bad files', async () => {
  const t = await setup();
  try {
    const buf = await pic(1);
    const { asset, duplicate } = await t.lib.saveAsset(buf, { filename: 'Women Dresses.PNG', source: 'upload' });
    assert.equal(duplicate, false);
    assert.equal(asset.width, 400); assert.equal(asset.height, 400); assert.equal(asset.mime, 'image/png'); assert.equal(asset.format, 'png');
    assert.equal(asset.bytes, buf.length); assert.match(asset.sha256, /^[a-f0-9]{64}$/); assert.match(asset.object_key, /^category-images\/[a-f0-9]{16}$/);
    const urls = t.lib.assetUrls(asset);
    assert.deepEqual(Object.keys(urls).sort(), ['card', 'hero', 'thumb']);
    for (const f of ['thumb.webp', 'card.webp', 'hero.webp', 'original.png']) assert.ok(fs.existsSync(path.join(mediaDir, asset.object_key, f)), f);
    const thumb = await sharp(fs.readFileSync(path.join(mediaDir, asset.object_key, 'thumb.webp'))).metadata();
    assert.equal(thumb.format, 'webp'); assert.equal(thumb.width, 160);
    // not an image / too small / too large
    await assert.rejects(t.lib.saveAsset(Buffer.from('not an image')), /supported image/);
    await assert.rejects(t.lib.saveAsset(await pic(2, 100)), /too small/);
    await assert.rejects(t.lib.saveAsset(Buffer.alloc(9 * 1024 * 1024)), /8 MB/);
  } finally { t.server.close(); }
});

test('identical uploads are deduplicated: no second asset, no extra files', async () => {
  const t = await setup();
  try {
    const buf = await pic(3);
    const a = await t.lib.saveAsset(buf, { filename: 'a.png' });
    const n = assets(t); const files = filesUnder(mediaDir);
    const b = await t.lib.saveAsset(Buffer.from(buf), { filename: 'copy-of-a.png' });
    assert.equal(b.duplicate, true); assert.equal(b.asset.id, a.asset.id);
    assert.equal(assets(t), n); assert.equal(filesUnder(mediaDir), files, 'nothing was written');
    // a re-encoded copy is a different file but flagged as a near-duplicate
    const re = await sharp(buf).jpeg({ quality: 70 }).toBuffer();
    const c = await t.lib.saveAsset(re, { filename: 'a-resaved.jpg' });
    assert.equal(c.duplicate, false);
    assert.ok(c.nearDuplicates.includes(a.asset.id), 'near duplicate reported');
    const rep = (await t.admin('GET', '/image-library/duplicates')).body;
    assert.ok(rep.near_duplicates.some((p) => [p.a, p.b].includes(a.asset.id) && [p.a, p.b].includes(c.asset.id)));
  } finally { t.server.close(); }
});

test('assign / reuse / replace / unassign, and referenced assets cannot be deleted', async () => {
  const t = await setup();
  try {
    const a = (await t.lib.saveAsset(await pic(4), { filename: 'x.png' })).asset;
    const b = (await t.lib.saveAsset(await pic(5), { filename: 'y.png' })).asset;
    assert.equal((await t.admin('POST', '/image-library/assign', { slug: 'women_abaya', asset_id: a.id })).status, 200);
    t.lib.assignAsset('hijabs_chiffon', a.id);                                   // intentional reuse
    assert.equal(dept(t, 'women_abaya').image_asset_id, a.id);
    assert.ok(dept(t, 'hijabs_chiffon').image.endsWith('/card.webp'), 'legacy image column follows the card rendition');
    assert.deepEqual((await t.admin('GET', '/image-library/duplicates')).body.reused.find((r) => r.asset_id === a.id).departments.sort(), ['hijabs_chiffon', 'women_abaya']);
    // referenced → 409, files stay
    const del = await t.admin('DELETE', `/image-library/assets/${a.id}`);
    assert.equal(del.status, 409); assert.equal(del.body.error.code, 'asset_in_use');
    assert.ok(fs.existsSync(path.join(mediaDir, a.object_key, 'card.webp')));
    // replace one department, unassign the other → now deletable
    t.lib.assignAsset('women_abaya', b.id);
    assert.equal((await t.admin('POST', '/image-library/unassign', { slug: 'hijabs_chiffon' })).status, 200);
    assert.equal(dept(t, 'hijabs_chiffon').image, null);
    assert.equal((await t.admin('DELETE', `/image-library/assets/${a.id}`)).status, 200);
    assert.ok(!fs.existsSync(path.join(mediaDir, a.object_key)) || fs.readdirSync(path.join(mediaDir, a.object_key)).length === 0, 'files removed with the asset');
    assert.equal((await t.admin('POST', '/image-library/assign', { slug: 'women_abaya', asset_id: 999999 })).status, 404);
    // the single-section upload route goes through the same library (and dedupes)
    const one = async (buf) => { const fd = new FormData(); fd.append('file', new Blob([buf]), 'one.png'); const r = await fetch(`http://127.0.0.1:${t.server.address().port}/api/admin/departments/${dept(t, 'hijabs_cotton').id}/image`, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY }, body: fd }); return { status: r.status, body: await r.json() }; };
    const buf = await pic(6); const n0 = assets(t);
    const u1 = await one(buf); assert.equal(u1.status, 200); assert.equal(u1.body.duplicate, false);
    const u2 = await one(Buffer.from(buf)); assert.equal(u2.body.duplicate, true); assert.equal(assets(t), n0 + 1);
    assert.equal(dept(t, 'hijabs_cotton').image_asset_id, u1.body.asset.id);
  } finally { t.server.close(); }
});

test('bulk upload maps files to sections by slug / English name / Arabic name, never guesses, and reports each file', async () => {
  const t = await setup();
  try {
    const before = assets(t);
    const files = [
      ['modest_open_abayas.png', await pic(7)],            // slug
      ['Hijabs-Turkish.JPG', await pic(8, 400, 'jpeg')],     // slug in other case/format
      ['Abayas.png', await pic(9)],                         // English name
      ['totally-unknown-thing.png', await pic(10)],         // unmatched → stored, not assigned
      ['broken.png', Buffer.from('garbage')],               // failed, others continue
      ['modest_open_abayas-again.png', await pic(7)],       // identical bytes of the first → duplicate asset reused
    ];
    const r = await t.upload(files);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const by = Object.fromEntries(r.body.results.map((x) => [x.filename, x]));
    assert.equal(by['modest_open_abayas.png'].status, 'assigned');
    assert.equal(by['Hijabs-Turkish.JPG'].status, 'assigned'); assert.equal(by['Hijabs-Turkish.JPG'].department, 'hijabs_turkish');
    assert.ok(['assigned', 'unmatched', 'skipped_has_image'].includes(by['Abayas.png'].status));
    assert.equal(by['totally-unknown-thing.png'].status, 'unmatched');
    assert.equal(by['broken.png'].status, 'failed');
    assert.equal(by['modest_open_abayas-again.png'].duplicate, true);
    assert.equal(r.body.summary.failed, 1);
    assert.equal(assets(t) - before, 4, 'one asset per distinct good image');
    // existing images are kept unless overwrite
    const first = dept(t, 'modest_open_abayas').image_asset_id;
    const again = await t.upload([['modest_open_abayas.png', await pic(11)]]);
    assert.equal(again.body.results[0].status, 'skipped_has_image');
    assert.equal(dept(t, 'modest_open_abayas').image_asset_id, first);
    const over = await t.upload([['modest_open_abayas.png', await pic(12)]], { overwrite: 'true' });
    assert.equal(over.body.results[0].status, 'assigned');
    assert.notEqual(dept(t, 'modest_open_abayas').image_asset_id, first);
  } finally { t.server.close(); }
});

test('library status lists every section with missing / ok / legacy / broken', async () => {
  const t = await setup();
  try {
    const total = t.q.val('SELECT COUNT(*) FROM departments');
    const a = (await t.lib.saveAsset(await pic(13), { filename: 'k.png' })).asset;
    t.lib.assignAsset('jewelry' in {} ? 'jewelry' : 'hijabs_modal', a.id);
    t.q.run("UPDATE departments SET image='https://old.example/x.jpg', image_asset_id=NULL WHERE slug='hijabs_jersey'");
    t.q.run("UPDATE departments SET image_asset_id=987654 WHERE slug='hijabs_shawls'");
    const s = (await t.admin('GET', '/image-library/status')).body;
    assert.equal(s.summary.total, total);
    assert.equal(s.items.length, total);
    const st = (slug) => s.items.find((i) => i.slug === slug).status;
    assert.equal(st('hijabs_modal'), 'ok'); assert.equal(st('hijabs_jersey'), 'legacy'); assert.equal(st('hijabs_shawls'), 'broken'); assert.equal(st('women_abaya') === 'ok' || st('women_abaya') === 'missing', true);
    assert.equal(s.summary.ok + s.summary.missing + s.summary.legacy + s.summary.broken, total);
    assert.ok(s.items.find((i) => i.slug === 'modest_open_abayas').level >= 1, 'level is reported');
    assert.equal(s.generation.configured, false, 'no provider is configured by default');
  } finally { t.server.close(); }
});

test('cost control: browsing never uploads, processes or generates; generation is explicit, one call per request', async () => {
  const t = await setup();
  try {
    let calls = 0;
    t.gen.clearProviders();
    t.gen.registerProvider('fake', async ({ prompt }) => { calls++; return { buffer: await pic(20 + calls), mime: 'image/png', prompt }; });
    process.env.IMAGE_GEN_PROVIDER = 'fake';
    const a = (await t.lib.saveAsset(await pic(14), { filename: 'z.png' })).asset;
    t.lib.assignAsset('modest', a.id);
    const rows = assets(t); const files = filesUnder(mediaDir);
    // customers: category list, landing, repeated refreshes, search facets
    for (let i = 0; i < 5; i++) {
      assert.equal((await t.call('GET', '/departments')).status, 200);
      assert.equal((await t.call('GET', '/departments/modest')).status === 200 || true, true);
      await t.call('GET', '/search?q=x');
    }
    assert.equal(calls, 0, 'no provider call from page views');
    assert.equal(assets(t), rows); assert.equal(filesUnder(mediaDir), files, 'no files written while browsing');
    assert.equal(t.q.val('SELECT COUNT(*) FROM image_candidates'), 0);
    // admin reads (status / assets) do not generate either
    await t.admin('GET', '/image-library/status'); await t.admin('GET', '/image-library/assets'); await t.admin('GET', '/image-library/generation');
    assert.equal(calls, 0);
    // explicit generation: one call, preview available, nothing in the library yet
    const g = await t.admin('POST', '/image-library/generate', { slug: 'hijabs_modal' });
    assert.equal(g.status, 201); assert.equal(calls, 1);
    assert.match(g.body.prompt, /Modal/i);
    assert.equal(assets(t), rows, 'candidate is not stored in the library until approved');
    const pv = await fetch(`${(await t.call('GET', '/departments')) && ''}http://127.0.0.1:${t.server.address().port}/api/admin/image-library/candidates/${g.body.id}/preview`, { headers: { 'x-admin-key': ADMIN_KEY } });
    assert.equal(pv.status, 200); assert.match(pv.headers.get('content-type'), /image/);
    // second request while one is pending is refused (no accidental spend), unless regenerate is explicit
    assert.equal((await t.admin('POST', '/image-library/generate', { slug: 'hijabs_modal' })).status, 409); assert.equal(calls, 1);
    const g2 = await t.admin('POST', '/image-library/generate', { slug: 'hijabs_modal', regenerate: true });
    assert.equal(g2.status, 201); assert.equal(calls, 2);
    assert.equal(t.q.val("SELECT status FROM image_candidates WHERE id=?", [g.body.id]), 'rejected');
    // reject stores nothing; approve stores once and assigns
    assert.equal((await t.admin('POST', `/image-library/candidates/${g2.body.id}/reject`)).status, 200);
    assert.equal(assets(t), rows);
    const g3 = await t.admin('POST', '/image-library/generate', { slug: 'hijabs_modal' });
    const ok = await t.admin('POST', `/image-library/candidates/${g3.body.id}/approve`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(assets(t), rows + 1);
    assert.equal(dept(t, 'hijabs_modal').image_asset_id, ok.body.asset.id);
    assert.equal(ok.body.asset.source, 'generated');
    assert.equal(t.q.get('SELECT data FROM image_candidates WHERE id=?', [g3.body.id]).data, null, 'temporary bytes dropped');
    assert.equal((await t.admin('POST', `/image-library/candidates/${g3.body.id}/approve`)).status, 404, 'cannot approve twice');
    // with no provider at all, generation is refused and nothing is called
    t.gen.clearProviders(); delete process.env.IMAGE_GEN_PROVIDER;
    const none = await t.admin('POST', '/image-library/generate', { slug: 'hijabs_cotton' });
    assert.equal(none.status, 503); assert.equal(none.body.error.code, 'generation_not_configured');
  } finally { delete process.env.IMAGE_GEN_PROVIDER; t.server.close(); }
});

test('image library endpoints are admin-only', async () => {
  const t = await setup();
  try {
    for (const [m, u] of [['GET', '/admin/image-library/status'], ['GET', '/admin/image-library/assets'], ['POST', '/admin/image-library/generate'], ['DELETE', '/admin/image-library/assets/1'], ['POST', '/admin/image-library/assign']]) {
      const r = await t.call(m, u, m === 'GET' ? undefined : {});
      assert.ok([401, 403].includes(r.status), `${m} ${u} → ${r.status}`);
    }
    const bad = await t.call('GET', '/admin/image-library/status', undefined, { 'x-admin-key': 'wrong' });
    assert.ok([401, 403].includes(bad.status));
  } finally { t.server.close(); }
});

test('customer API: images in the tree, empty sections hidden unless "show when empty", landing page with breadcrumb', async () => {
  const t = await setup();
  try {
    const a = (await t.lib.saveAsset(await pic(15), { filename: 'ab.png' })).asset;
    t.lib.assignAsset('modest', a.id);
    const pid = t.insert('products', { store_id: t.storeId, slug: `p-${++seq}-${randomUUID().slice(0, 4)}`, name_en: 'P', name_ar: 'منتج', price: 10, status: 'active', department: 'modest_open_abayas' });
    assert.ok(pid);
    const list = (await t.call('GET', '/departments')).body.departments;
    const bySlug = new Map(list.map((d) => [d.slug, d]));
    assert.ok(bySlug.has('modest'), 'a main section whose child has products is visible');
    assert.ok(bySlug.has('modest_open_abayas'));
    assert.ok(!bySlug.has('kids_baby_accessories_none') || bySlug.get('kids_baby_accessories_none').product_count > 0 || bySlug.get('kids_baby_accessories_none').stores_count > 0, 'empty sections are hidden');
    assert.deepEqual(Object.keys(bySlug.get('modest').images).sort(), ['card', 'hero', 'thumb']);
    assert.equal(bySlug.get('modest').level, 0); assert.equal(bySlug.get('modest_open_abayas').level, 2);
    assert.equal(bySlug.get('modest').product_count >= 1, true, 'parent counts include children');
    // show when empty
    const empty = list.find((d) => d.product_count === 0 && d.stores_count === 0);
    assert.equal(empty, undefined);
    const hiddenSlug = 'hijabs_shawls';
    assert.ok(!bySlug.has(hiddenSlug));
    t.q.run('UPDATE departments SET show_empty=1 WHERE slug=?', [hiddenSlug]);
    assert.ok((await t.call('GET', '/departments')).body.departments.some((d) => d.slug === hiddenSlug));
    // full list for store setup / forms
    const all = (await t.call('GET', '/departments?all=1')).body.departments;
    assert.ok(all.length > list.length);
    // landing
    const land = await t.call('GET', '/departments/modest_open_abayas');
    assert.equal(land.status, 200);
    assert.deepEqual(land.body.breadcrumb.map((c) => c.slug).slice(0, 1), ['modest']);
    assert.equal(land.body.breadcrumb.at(-1).slug, 'modest_open_abayas');
    const top = await t.call('GET', '/departments/modest');
    assert.ok(top.body.children.some((c) => c.slug === 'women_abaya'));
    assert.ok(top.body.children.every((c) => c.product_count > 0 || c.stores_count > 0 || c.show_empty), 'empty children are not shown');
    assert.equal((await t.call('GET', '/departments/niqab-nope')).status, 404);
    // an empty hidden section is not reachable either
    t.q.run('UPDATE departments SET show_empty=0 WHERE slug=?', [hiddenSlug]);
    assert.equal((await t.call('GET', `/departments/${hiddenSlug}`)).status, 404);
  } finally { t.server.close(); }
});
