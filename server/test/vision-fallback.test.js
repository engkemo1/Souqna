// Photo understanding falls through a chain of providers: when one is out of quota/credit the next one answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-vision-${randomUUID()}.db`);
process.env.JWT_SECRET = `vf-${randomUUID()}-min32charslong-xxxxxxxx`; process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'g-test'; process.env.MISTRAL_API_KEY = 'm-test'; process.env.GROQ_API_KEY = 'q-test';
delete process.env.ANTHROPIC_API_KEY; delete process.env.CF_AI_TOKEN;
const { describePhoto, anyVisionReady, visionReady, stylistStatus } = await import('../src/lib/stylist.js');

const realFetch = globalThis.fetch; const calls = [];
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
test.afterEach(() => { globalThis.fetch = realFetch; });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('only providers with a key are in the chain', () => {
  assert.equal(anyVisionReady(), true);
  assert.equal(visionReady('gemini'), true); assert.equal(visionReady('mistral'), true); assert.equal(visionReady('groq'), true);
  assert.equal(visionReady('anthropic'), false); assert.equal(visionReady('cloudflare'), false); assert.equal(visionReady('qwen'), false);
  assert.deepEqual(stylistStatus().vision.active, ['gemini', 'mistral', 'groq']);
});

test('Gemini out of quota → Mistral describes the photo; Gemini is paused and skipped next time', async () => {
  calls.length = 0;
  globalThis.fetch = async (url) => {
    const u = String(url); calls.push(u.includes('googleapis') ? 'gemini' : u.includes('mistral') ? 'mistral' : 'other');
    if (u.includes('googleapis')) return reply(429, { error: { message: 'RESOURCE_EXHAUSTED quota exceeded' } });
    if (u.includes('mistral')) return reply(200, { choices: [{ message: { content: 'A cream hoodie, casual, unisex.' } }] });
    return reply(500, {});
  };
  assert.equal(await describePhoto(png, 'image/png'), 'A cream hoodie, casual, unisex.');
  assert.ok(calls.includes('gemini') && calls.includes('mistral'));
  calls.length = 0;
  assert.equal(await describePhoto(png, 'image/png'), 'A cream hoodie, casual, unisex.');
  assert.ok(!calls.includes('gemini'), 'a provider that just ran out of quota is skipped for a while');
});

test('Mistral also fails → Groq answers', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('mistral')) return reply(402, { error: 'insufficient credit' });
    if (u.includes('groq')) return reply(200, { choices: [{ message: { content: 'Black abaya.' } }] });
    return reply(429, {});
  };
  assert.equal(await describePhoto(png, 'image/png'), 'Black abaya.');
});

test('everything down → a clear error (never a made-up description)', async () => {
  globalThis.fetch = async () => reply(500, { error: 'down' });
  await assert.rejects(() => describePhoto(png, 'image/png'));
});
