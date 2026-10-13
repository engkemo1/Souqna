import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-demand-'));
process.env.DB_FILE = path.join(dir, 'test.db');
delete process.env.VISUAL_MODEL;
const { default: express } = await import('express');
const { q, insert } = await import('../src/db/index.js');
const { default: publicRoutes } = await import('../src/routes/public.js');
const { errorHandler } = await import('../src/lib/errors.js');
const { logVisualSearch, unmetDemand, demandTotals, demandForOwnersEnabled, setDemandForOwners } = await import('../src/lib/visual-demand.js');
const { dominantColor, colorDescriptor } = await import('../src/lib/visual-core.js');
const { weeklyFacts, ruleTips } = await import('../src/lib/report.js');

const solid = (r, g, b) => sharp({ create: { width: 96, height: 128, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const app = express(); app.use('/api', publicRoutes); app.use(errorHandler);
const server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
const base = `http://127.0.0.1:${server.address().port}/api`;
const post = async (buf, fields = {}) => { const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'p.jpg'); for (const [k, v] of Object.entries(fields)) fd.append(k, v); const r = await fetch(`${base}/visual-search`, { method: 'POST', body: fd }); return r.json(); };

test('dominant colour names', async () => {
  assert.equal(dominantColor(await colorDescriptor(await solid(10, 10, 10)))?.key, 'black');
  assert.equal(dominantColor(await colorDescriptor(await solid(240, 120, 170)))?.key, 'pink');
  assert.equal(dominantColor(await colorDescriptor(await solid(250, 250, 250)))?.key, 'white');
});

test('a failed photo search is logged (type + colour, no photo, no IP) and shows up as unmet demand', async () => {
  insert('users', { email: 'o@test.dev', password_hash: 'x', name: 'Owner', role: 'owner' });
  insert('stores', { owner_id: q.get('SELECT id FROM users').id, slug: 'denim', code: 'D1', name_ar: 'دنيم هاوس', name_en: 'Denim House', status: 'active', hidden: 0 });
  const sid = q.get('SELECT id FROM stores').id;
  insert('products', { store_id: sid, slug: 'p1', name_ar: 'بنطلون جينز أزرق', name_en: 'Blue jeans', price: 500, status: 'active', track_stock: 0 });
  for (let i = 0; i < 3; i++) { const out = await post(await solid(10, 10, 10), { type: 'bottoms' }); assert.equal(out.noMatch, true); }
  const rows = q.all('SELECT * FROM visual_searches');
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.family === 'bottoms' && r.color === 'black' && r.found === 0));
  assert.ok(!JSON.stringify(rows).includes('127.0.0.1'), 'raw IP must not be stored');
  const d = unmetDemand({ days: 30, storeId: sid });
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].family, d[0].label, d[0].colorLabel.ar, d[0].searches, d[0].have], ['bottoms', 'بناطيل وجينز', 'أسود', 3, 1]);
  assert.deepEqual(demandTotals({ days: 30 }), { days: 30, pieces: 3, found: 0, missed: 3, people: 1, requests: 0 });
});

test('successful searches are logged as found and excluded from unmet demand', () => {
  logVisualSearch({ ip: '1.2.3.4', model: 'color-v1', groups: [{ type: 'tops', color: 'white', best: 0.99, items: [{ id: 1 }] }] });
  assert.equal(unmetDemand({ days: 30 }).some((x) => x.family === 'tops'), false);
  assert.equal(demandTotals({ days: 30 }).found, 1);
});

test('sourcing requests that came from visual search are counted', () => {
  insert('sourcing_requests', { number: 'RQ-1', track_token: 'tok_abcdefghij', title: 'x', name: 'Ali', phone: '01000000000', address: 'Banha, street', source: 'visual', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  assert.equal(demandTotals({ days: 30 }).requests, 1);
});

test('owners see the demand report only when the platform admin switches it on (default OFF)', () => {
  const sid = q.get('SELECT id FROM stores').id;
  assert.equal(demandForOwnersEnabled(), false);
  assert.deepEqual(weeklyFacts(sid).unmet, [], 'weekly report stays quiet while it is off');
  assert.equal(setDemandForOwners(true), true);
  assert.equal(demandForOwnersEnabled(), true);
});

test('weekly report mentions unmet demand for the owner', () => {
  const sid = q.get('SELECT id FROM stores').id;
  const f = weeklyFacts(sid);
  assert.equal(f.unmet[0].item, 'بناطيل وجينز أسود');
  assert.ok(ruleTips(f).some((t) => t.includes('بناطيل وجينز أسود') && t.includes('عندك')));
});

test.after(() => { server.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
