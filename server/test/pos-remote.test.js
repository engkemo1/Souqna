// Phone-as-scanner: pairing, the computer's live channel, a scan and its answer, revoking, and isolation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-pos-remote-'));
process.env.DB_FILE = path.join(tmp, 'test.db');
const { q, db } = await import('../src/db/index.js');
const express = (await import('express')).default;
const { errorHandler } = await import('../src/lib/errors.js');
const { signToken } = await import('../src/lib/auth.js');
const { default: posRoutes } = await import('../src/routes/pos.js');
const { default: remoteRoutes } = await import('../src/routes/pos-remote.js');

let server; let base; let tok;
before(async () => {
  q.run("INSERT INTO users(name,email,password_hash) VALUES('Ali','a@x.com','x')");
  const store = Number(q.run("INSERT INTO stores(owner_id,slug,code,name_ar,name_en) VALUES(1,'a','A','محل أ','a')").lastInsertRowid);
  q.run("INSERT INTO app_settings(key,value) VALUES('cashier_sync_enabled','1') ON CONFLICT(key) DO UPDATE SET value='1'");
  q.run("INSERT INTO store_cashier_links(store_id,cashier_id,status) VALUES(?,'twist','active')", [store]);
  tok = signToken({ id: 1 });
  const app = express(); app.use(express.json());
  app.use('/api/pos-remote', remoteRoutes); app.use('/api/pos', posRoutes); app.use(errorHandler);
  server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const post = (p, body, auth) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body || {}) });

/** Reads the computer's event stream and calls onEvent(name, data). */
async function listen(token, onEvent) {
  const ac = new AbortController();
  const res = await fetch(`${base}/api/pos-remote/${token}/events`, { signal: ac.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  (async () => {
    const dec = new TextDecoder(); let buf = '';
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = block.match(/^event: (.+)$/m)?.[1]; const data = block.match(/^data: (.+)$/m)?.[1];
          if (ev && data) onEvent(ev, JSON.parse(data));
        }
      }
    } catch { /* aborted */ }
  })();
  return () => ac.abort();
}

test('a phone scan reaches the cashier screen and the phone gets its answer', async () => {
  const pair = await (await post('/api/pos/remote', {}, true)).json();
  assert.ok(pair.token.length >= 20);
  const seen = [];
  const stop = await listen(pair.token, async (ev, data) => {
    seen.push(ev);
    if (ev === 'scan') await post(`/api/pos-remote/${pair.token}/answer`, { id: data.id, ok: true, text: `اتضاف ${data.code}` });
  });
  await new Promise((r) => setTimeout(r, 100));
  const page = await (await fetch(`${base}/api/pos-remote/${pair.token}`)).json();
  assert.equal(page.store, 'محل أ');
  assert.equal(page.screen, true);
  const out = await (await post(`/api/pos-remote/${pair.token}/scan`, { code: '622300' })).json();
  assert.equal(out.delivered, true);
  assert.deepEqual(out.answer, { ok: true, text: 'اتضاف 622300' });
  assert.ok(seen.includes('hello') && seen.includes('phone') && seen.includes('scan'));
  stop();
});

test('with no cashier screen open the phone is told so', async () => {
  const pair = await (await post('/api/pos/remote', {}, true)).json();
  const out = await (await post(`/api/pos-remote/${pair.token}/scan`, { code: '1' })).json();
  assert.equal(out.delivered, false);
});

test('a revoked or made-up link does nothing', async () => {
  const pair = await (await post('/api/pos/remote', {}, true)).json();
  const del = await fetch(`${base}/api/pos/remote/${pair.token}`, { method: 'DELETE', headers: { authorization: `Bearer ${tok}` } });
  assert.equal(del.status, 200);
  assert.equal((await post(`/api/pos-remote/${pair.token}/scan`, { code: '1' })).status, 404);
  assert.equal((await fetch(`${base}/api/pos-remote/not-a-real-token-at-all-123`)).status, 404);
  assert.equal((await post('/api/pos/remote', {}, false)).status, 401); // only the signed-in owner can pair
});
