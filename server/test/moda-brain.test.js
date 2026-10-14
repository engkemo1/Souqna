import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runModa } from '../src/lib/moda/engine.js';
import { makeBrain, sanitizeBrain, catalogDigest, brainPrompt } from '../src/lib/moda/brain.js';
import { enrichAll } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures');
const K = loadKnowledge();
const rows = enrichAll(JSON.parse(fs.readFileSync(path.join(DIR, 'occasion-catalog.json'), 'utf8')).products, K);
const base = { products: rows, weatherMock: { temp_c: 21, feels_like_c: 21, rain_pct: 2 } };
const fake = (reply) => makeBrain(async () => JSON.stringify(reply));

test('sanitize: invented prices, links and bad dictionary values are dropped', () => {
  assert.equal(sanitizeBrain({ reply: 'البدلة بـ 1500 جنيه' }).reply, '');
  assert.equal(sanitizeBrain({ reply: 'ادخل على https://x.com' }).reply, '');
  assert.equal(sanitizeBrain({ reply: 'ميزانيتك 4000 جنيه تمام' }, { userBudget: 4000 }).reply, 'ميزانيتك 4000 جنيه تمام');
  const s = sanitizeBrain({ reply: 'تمام', persons: ['men', 'alien'], context: 'wedding_guest', garments: ['suit', 'spaceship'], colors: ['navy', 'x'], budget: 4000, ready: true });
  assert.deepEqual(s.persons, ['men']); assert.deepEqual(s.garments, ['suit']); assert.deepEqual(s.colors, ['navy']); assert.equal(s.budget, 4000); assert.equal(sanitizeBrain({ budget: 5 }).budget, null);
  assert.equal(sanitizeBrain(null), null);
});

test('prompt carries the digest, hard rules and facts; history is capped', async () => {
  const d = catalogDigest(rows, K); assert.ok(d.length > 20);
  assert.match(brainPrompt({ digest: d, facts: { result: 'none' } }), /never invent|never write a price/i);
  let seen;
  const b = makeBrain(async (system, msgs) => { seen = { system, msgs }; return '{"reply":"أهلا"}'; });
  const msgs = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })); msgs.push({ role: 'user', content: 'آخر' });
  await b({ messages: msgs, rows, text: 'آخر' });
  assert.ok(seen.msgs.length <= 8); assert.equal(seen.msgs.at(-1).content, 'آخر');
});

test('timeout and bad output fall back (null) instead of throwing', async () => {
  const slow = makeBrain(() => new Promise(() => {}), { timeoutMs: 30 });
  await assert.rejects(() => slow({ messages: [{ role: 'user', content: 'x' }], rows }));
  const res = await runModa('ازاي اختار مقاس', { ...base, brain: slow });
  assert.ok(res.say.length > 5); // المحرك بقواعده
  const junk = makeBrain(async () => 'القطن خامة مريحة جدا في الصيف، لمين الهدوم؟');
  assert.ok((await junk({ messages: [{ role: 'user', content: 'x' }], rows })).reply);
});

test('unknown question: brain answers and asks one question, session stays open', async () => {
  const brain = fake({ reply: 'القطن أخف في الصيف. لمين الهدوم؟', ready: false });
  const res = await runModa('ايه الفرق بين الكتان والقطن', { ...base, brain });
  assert.equal(res.blocks, null); assert.match(res.say, /لمين/);
});

test('brain extracts slots and the engine shows real products', async () => {
  const brain = fake({ reply: 'تمام', persons: ['men'], context: 'wedding_guest', garments: [], budget: 4000, ready: true });
  const res = await runModa('كوّنلي حاجة تخليني اتشيك في فرح صاحبي', { ...base, brain });
  assert.notEqual(res.intent, 'brain'); assert.ok(res.blocks?.tabs?.length || res.questions?.length, res.state);
  const ids = new Set(rows.map((r) => r.id));
  for (const t of res.blocks?.tabs || []) for (const i of t.items) assert.ok(ids.has(i.id));
});

test('none state: brain recovery reply replaces the generic one, products stay engine-made', async () => {
  let facts;
  const brain = async (a) => { facts = a.facts; return { reply: 'مفيش دلوقتي، بس عندنا بدائل. تحب ألوان غامقة؟' }; };
  const res = await runModa('عايز بدلة فرح ببلاش', { ...base, products: rows.filter((r) => r.key !== 'suit'), brain });
  if (['none', 'no_look', 'partial'].includes(res.state)) { assert.equal(res.brainReply, true); assert.ok(facts && facts.result); }
});

test('POST /stylist with a Workers-AI-compatible endpoint: free-form question answered, daily brain cap falls back to rules', async () => {
  const os = await import('node:os'); const { createServer } = await import('node:http'); const { randomUUID } = await import('node:crypto'); const express = (await import('express')).default;
  process.env.DB_FILE = path.join(os.tmpdir(), `souqna-brain-${randomUUID()}.db`); process.env.JWT_SECRET = `brain-${randomUUID()}`;
  let calls = 0;
  const ai = createServer((req, res) => { calls += 1; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ success: true, result: { response: JSON.stringify({ reply: 'الكتان بيتنفس أكتر في الصيف. تدور على حاجة لمين؟', ready: false }) } })); });
  await new Promise((r) => ai.listen(0, r));
  process.env.CF_API_BASE = `http://127.0.0.1:${ai.address().port}`; process.env.CF_AI_TOKEN = 't'; process.env.CF_ACCOUNT_ID = 'a'; process.env.MODA_BRAIN_DAILY = '1';
  const { default: routes } = await import('../src/routes/public.js'); const { errorHandler } = await import('../src/lib/errors.js');
  const app = express(); app.use(express.json()); app.use('/api', routes); app.use(errorHandler);
  const srv = createServer(app); await new Promise((r) => srv.listen(0, r));
  const post = async (content) => (await fetch(`http://127.0.0.1:${srv.address().port}/api/stylist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }] }) })).json();
  const a = await post('ايه الفرق بين الكتان والقطن'); assert.match(a.say, /الكتان/); assert.equal(a.intent, 'chat'); assert.equal(calls, 1);
  const b = await post('ايه الفرق بين الحرير والبوليستر'); assert.equal(calls, 1); assert.ok(b.say.length > 5);
  srv.close(); ai.close();
});
