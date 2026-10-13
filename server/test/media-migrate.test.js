import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-mm-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.MEDIA_DIR = path.join(dir, 'media');
const { q, insert } = await import('../src/db/index.js');
const { moveLocalMediaToR2 } = await import('../src/lib/media-migrate.js');
const now = new Date().toISOString();

test('photos are uploaded to R2 first, then removed locally, then marked remote; interrupted ones are recovered; R2 off → nothing happens', async () => {
  insert('users', { email: 'o@test.dev', password_hash: 'x', name: 'O', role: 'owner', created_at: now });
  insert('stores', { owner_id: 1, slug: 's', code: 'S1', name_ar: 'م', name_en: 'S', status: 'active', hidden: 0 });
  const mk = (key, withLocal) => {
    if (withLocal) { const d = path.join(process.env.MEDIA_DIR, '1', key); fs.mkdirSync(d, { recursive: true }); for (const f of ['original.jpg', 'md.webp', 'md.jpg']) fs.writeFileSync(path.join(d, f), 'x'); }
    insert('media', { store_id: 1, kind: 'product', key, width: 1, height: 1, sizes: '["md"]', original_ext: 'jpg', bytes: 1, attached: 1, created_at: now });
    return q.get('SELECT id FROM media ORDER BY id DESC LIMIT 1').id;
  };
  const a = mk('aaa', true); const b = mk('bbb', false) /* local copy already gone */; const c = mk('ccc', false) /* gone everywhere */;

  assert.deepEqual(await moveLocalMediaToR2({ enabled: false }), { skipped: true, moved: 0, recovered: 0, missing: 0, stuck: 0 });

  const stored = new Map(); const order = [];
  const put = async (k, buf) => { stored.set(k, buf); order.push(`put ${k}`); };
  const get = async (k) => { if (!stored.has(k) && !k.startsWith('1/bbb/')) throw new Error('404'); return Buffer.from('x'); };
  const r = await moveLocalMediaToR2({ enabled: true, put, get, log: () => {} });
  assert.deepEqual(r, { skipped: false, moved: 1, recovered: 1, missing: 1, stuck: 0 });
  assert.deepEqual([...stored.keys()].sort(), ['1/aaa/md.jpg', '1/aaa/md.webp', '1/aaa/original.jpg']);
  assert.ok(!fs.existsSync(path.join(process.env.MEDIA_DIR, '1', 'aaa')), 'local copy removed after upload');
  assert.equal(q.get('SELECT remote FROM media WHERE id=?', [a]).remote, 1);
  assert.equal(q.get('SELECT remote FROM media WHERE id=?', [b]).remote, 1, 'interrupted photo re-marked');
  assert.equal(q.get('SELECT remote FROM media WHERE id=?', [c]).remote, 0, 'photo missing everywhere is left alone');
});

test('a failing upload never deletes the local copy', async () => {
  const d = path.join(process.env.MEDIA_DIR, '1', 'ddd'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'original.jpg'), 'x');
  insert('media', { store_id: 1, kind: 'product', key: 'ddd', width: 1, height: 1, sizes: '["md"]', original_ext: 'jpg', bytes: 1, attached: 1, created_at: now });
  await assert.rejects(moveLocalMediaToR2({ enabled: true, put: async () => { throw new Error('R2 down'); }, get: async () => { throw new Error('404'); }, log: () => {} }), /R2 down/);
  assert.ok(fs.existsSync(path.join(d, 'original.jpg')));
  assert.equal(q.get("SELECT remote FROM media WHERE key='ddd'").remote, 0);
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
