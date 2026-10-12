import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';

test('buyer Moda chat history is private, persistent, and excludes uploaded photos', async () => {
  const dbFile = path.join(os.tmpdir(), `souqna-buyer-chats-${randomUUID()}.db`);
  process.env.DB_FILE = dbFile;
  process.env.JWT_SECRET = `buyer-chat-test-${randomUUID()}`;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const { default: routes } = await import('../src/routes/buyer.js');
  const { errorHandler } = await import('../src/lib/errors.js');
  const { db } = await import('../src/db/index.js');
  app.use('/api/buyer', routes);
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/buyer`;
  const request = async (route, { method = 'GET', token, body } = {}) => fetch(`${base}${route}`, {
    method, headers: { ...(token ? { 'x-buyer-token': token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const register = async (phone) => {
    const response = await request('/register', { method: 'POST', body: { name: 'Moda Test', phone, password: 'test-password' } });
    assert.equal(response.status, 201);
    return (await response.json()).token;
  };

  try {
    const token = await register('01000000001');
    const otherToken = await register('01000000002');
    const created = await request('/chats', { method: 'POST', token, body: {
      messages: [
        { role: 'user', content: 'عايزة كوتشي', photo: 'data:image/jpeg;base64,not-to-store' },
        { role: 'assistant', say: 'لقيتلك كوتشي مناسب.', intent: 'shop', state: 'full', looks: [], tabs: [] },
      ],
      session: { turn: 1, parsed: { persons: ['women'] } },
    } });
    assert.equal(created.status, 201);
    const { id } = await created.json();

    const listed = await request('/chats', { token });
    assert.equal((await listed.json()).items[0].id, id);
    const privateRead = await request(`/chats/${id}`, { token: otherToken });
    assert.equal(privateRead.status, 404);

    const read = await request(`/chats/${id}`, { token });
    const { chat } = await read.json();
    assert.equal(chat.messages[0].content, 'عايزة كوتشي');
    assert.equal('photo' in chat.messages[0], false);
    assert.deepEqual(chat.session, { turn: 1, parsed: { persons: ['women'] } });

    const updated = await request(`/chats/${id}`, { method: 'PUT', token, body: {
      messages: [...chat.messages, { role: 'user', content: 'لون أبيض' }, { role: 'assistant', say: 'تمام.' }],
      session: { turn: 2 },
    } });
    assert.equal(updated.status, 200);
    const removed = await request(`/chats/${id}`, { method: 'DELETE', token });
    assert.equal(removed.status, 200);
    assert.deepEqual((await (await request('/chats', { token })).json()).items, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});
