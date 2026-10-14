import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { parseMessage } from '../src/lib/moda/parse.js';
import { sanitizeUnderstanding, applyUnderstanding, rulesConfident, makeUnderstander } from '../src/lib/moda/understand.js';
import { runModa } from '../src/lib/moda/engine.js';

const K = loadKnowledge();

test('sanitize: يرفض قيم برّه القاموس ويقبل المدى المكتوب في الرسالة', () => {
  const u = sanitizeUnderstanding({ persons: ['men', 'alien'], context: 'work_formal', garments: [{ type: 'tshirt', color: 'black' }, { type: 'nope' }], budget: { max: 1000, min: 200, kind: 'total' }, daypart: 'night' }, 'عايز تيشرت اسود من 200 ل 1000', K);
  assert.deepEqual(u.persons, ['men']);
  assert.equal(u.garments.length, 1);
  assert.equal(u.garments[0].color, 'black');
  assert.deepEqual(u.budget, { value: 1000, min: 200, kind: 'total' });
});

test('sanitize: ميزانية مش مكتوبة في الرسالة بتتتجاهل', () => {
  const u = sanitizeUnderstanding({ persons: ['men'], budget: { max: 5000 } }, 'عايز بدلة لخطوبة صاحبي', K);
  assert.equal(u.budget, null);
  assert.deepEqual(u.persons, ['men']);
});

test('sanitize: أرقام عربية-هندية وكلمة ألف', () => {
  assert.equal(sanitizeUnderstanding({ budget: { max: 1500 } }, 'ميزانيتي ١٥٠٠ جنيه', K).budget.value, 1500);
  assert.equal(sanitizeUnderstanding({ budget: { max: 1000 } }, 'ميزانيتي في حدود الألف', K).budget.value, 1000);
});

test('apply: الموديل أولاً والقواعد تكمّل', () => {
  const p = parseMessage('حاجة شيك لخطوبة صاحبي بحدود الف جنيه');
  const u = sanitizeUnderstanding({ persons: ['men'], context: 'engagement_guest', garments: [], budget: { max: 1000 } }, 'حاجة شيك لخطوبة صاحبي بحدود الف جنيه', K);
  const r = applyUnderstanding(p, u);
  assert.equal(r.context, 'engagement_guest'); assert.equal(r.budget.value, 1000); assert.equal(r.intent, 'shop'); assert.equal(r.flags.understood, true);
});

test('rulesConfident: رسالة بسيطة واضحة = واثقة، مدى سعري = لا', () => {
  assert.equal(rulesConfident(parseMessage('عايز بدلة لخطوبة اخويا'), 'عايز بدلة لخطوبة اخويا'), true);
  const t = 'عايز تيشرت اسود من 200 ل 1000';
  assert.equal(rulesConfident(parseMessage(t), t), false);
});

test('engine: understand بيتنادى ويصلّح الفهم، وفشله ما بيكسرش', async () => {
  let called = 0;
  const understand = async () => { called += 1; return sanitizeUnderstanding({ persons: ['men'], garments: [{ type: 'tshirt', color: 'black' }], budget: { max: 1000, min: 200 } }, 'عايز تيشرت اسود من 200 ل 1000', K); };
  const r = await runModa([{ role: 'user', content: 'عايز تيشرت اسود من 200 ل 1000' }], { products: [], understand });
  assert.equal(called, 1);
  assert.equal(r.parsed.budget.value, 1000); assert.equal(r.parsed.budget.min, 200);
  const r2 = await runModa([{ role: 'user', content: 'عايز تيشرت اسود من 200 ل 1000' }], { products: [], understand: async () => { throw new Error('down'); } });
  assert.equal(r2.parsed.budget.value, 1000); // القواعد لوحدها بقت بتفهم المدى
});

test('makeUnderstander: JSON داخل نص + timeout', async () => {
  const ok = makeUnderstander(async () => 'هنا: {"persons":["women"],"garments":[{"type":"dress_party"}]}');
  const u = await ok({ text: 'فستان سهرة' });
  assert.deepEqual(u.persons, ['women']);
  const slow = makeUnderstander(() => new Promise(() => {}), { timeoutMs: 20 });
  await assert.rejects(slow({ text: 'فستان سهرة' }));
});
