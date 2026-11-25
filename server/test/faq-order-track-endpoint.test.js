// Through the real /stylist endpoint: tracking questions get the tracking answer, never a "store not found" lookup.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-track-${randomUUID()}.db`);
process.env.JWT_SECRET = `tr-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
const { default: publicRoutes } = await import('../src/routes/public.js');
const { errorHandler } = await import('../src/lib/errors.js');

const app = express(); app.use(express.json()); app.use('/api', publicRoutes); app.use(errorHandler);
const server = createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
test.after(() => new Promise((r) => server.close(r)));
const post = async (content) => (await fetch(`http://127.0.0.1:${server.address().port}/api/stylist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }] }) })).json();

test('tracking phrasings answer with the track-order help', async () => {
  for (const t of ['ازاي اتتبع طلبي؟', 'نسيت رقم الاوردر', 'ممكن اتابع الشحنة']) {
    const r = await post(t);
    assert.match(String(r.say), /تتبع الطلب/, t);
  }
});
