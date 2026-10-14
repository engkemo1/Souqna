import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runModa } from '../src/lib/moda/engine.js';
import { parseMessage } from '../src/lib/moda/parse.js';
import { enrichAll } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { matchFaq } from '../src/lib/moda/faq.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures');
const K = loadKnowledge();
const rows = enrichAll(JSON.parse(fs.readFileSync(path.join(DIR, 'occasion-catalog.json'), 'utf8')).products, K);
const byId = new Map(rows.map((r) => [r.id, r]));
const opts = { products: rows, weatherMock: { temp_c: 21, feels_like_c: 21, rain_pct: 2 } };
const keysOf = (res) => (res.blocks?.tabs || []).flatMap((t) => t.items.map((i) => byId.get(i.id)?.key));

test('service questions get a real answer, never a product guess or "I did not understand"', async () => {
  const cases = { 'انت مين': 'identity', 'فين طلبي': 'order_track', 'عايز اغير الطلب بتاعي': 'order_change', 'كام سعر الشحن': 'shipping_cost', 'هل في توصيل لطنطا': 'shipping_where', 'طرق الدفع ايه': 'payment', 'ممكن ارجع المنتج': 'returns', 'قولي نكتة': 'smalltalk', 'اسعار الدولار كام': 'offtopic' };
  for (const [text, faq] of Object.entries(cases)) {
    const res = await runModa(text, opts);
    assert.equal(res.intent, 'faq', text); assert.equal(res.faq, faq, text); assert.equal(res.blocks, null); assert.ok(res.say.length > 20);
  }
  assert.match((await runModa('فين طلبي', opts)).say, /تتبع الطلب/);
  assert.match((await runModa('طرق الدفع ايه', opts)).say, /عند الاستلام/);
  assert.match((await runModa('انت مين', { ...opts, assistantName: 'مودة' })).say, /مودة/);
});

test('shopping requests are never mistaken for service questions', () => {
  for (const t of ['عايز جينز اسود', 'بدلة للفرح', 'عايز اشتري شنطة كاش', 'بدل الجاكيت ده', 'عايز اطلب جاكيت', 'عايز اغير لون الجاكيت', 'كام سعر الجاكيت', 'فستان للخطوبة']) assert.equal(matchFaq(t), null, t);
});

test('"أقل سعر تيشرت" is a product request (cheapest first), not a "cheaper" follow-up', async () => {
  const parsed = parseMessage('اقل سعر تيشرت عندكم');
  assert.equal(parsed.intent, 'shop'); assert.equal(parsed.followup, null); assert.equal(parsed.flags.cheapest, true);
  const res = await runModa('اقل سعر تيشرت', { ...opts, answers: { who_is_it_for: 'men' } });
  assert.equal(res.state, 'full'); assert.deepEqual(res.questions, []);
  const item = (res.blocks.tabs[0].items)[0];
  const cheapest = Math.min(...rows.filter((r) => r.key === 'tshirt' && ['men', 'unisex'].includes(r.gender) && r.inStock).map((r) => r.price));
  assert.equal(item.price, cheapest);
});

test('a single piece does not trigger an "occasion" question and the reply never says "for the occasion"', async () => {
  const ask = await runModa('رشحلي كوتشي ابيض', opts);
  assert.deepEqual(ask.questions.map((q) => q.id), ['who_is_it_for']);
  const res = await runModa('رشحلي كوتشي ابيض', { ...opts, answers: { who_is_it_for: 'men' } });
  assert.doesNotMatch(res.say, /لـالمناسبة|طقم/);
});

test('a work request never gets a beach / sport outfit from another occasion', async () => {
  const res = await runModa('انا راجل عايز اطلالة للشغل ميزانيتي 3000', opts);
  const keys = keysOf(res);
  assert.ok(keys.length >= 2);
  for (const bad of ['shorts', 'sandals', 'cap', 'tshirt', 'hoodie', 'joggers']) assert.ok(!keys.includes(bad), `work look contained ${bad}`);
});

test('an occasion with no reviewed outfit says so honestly instead of guessing', async () => {
  const res = await runModa('انا راجل عايز لبس للجيم', { ...opts, answers: { budget: 'flexible' } });
  assert.ok(['no_look', 'full', 'partial', 'alternatives'].includes(res.state));
  if (res.state === 'no_look') { assert.match(res.say, /قولي القطع/); assert.equal(res.blocks, null); }
  else for (const k of keysOf(res)) assert.ok(!['sandals', 'cap'].includes(k));
});

test('casual wording is understood as an outing occasion', () => {
  assert.equal(parseMessage('عايز اطلالة كاجوال').context, 'casual_outing');
});

test('site-help questions (how to order, seller dashboard, joining, about, safety…) get real answers, shopping stays shopping', async () => {
  const cases = { 'ازاي اطلب': 'how_order', 'ازاي استخدم الموقع': 'site_help', 'ازاي ادخل لوحة المحل': 'seller_dashboard', 'عايز افتح محل على الموقع': 'seller_join', 'انتوا مين': 'about', 'فيه محلات ايه': 'stores_list', 'عندكو كل حاجه': 'everything', 'الموقع ده امان؟': 'safety', 'عايز اكلم خدمه العملاء': 'support', 'ازاي ابحث بصوره': 'visual_search', 'مش لاقي حاجه': 'product_request', 'عاوز اسجل': 'account' };
  for (const [text, faq] of Object.entries(cases)) { const res = await runModa(text, opts); assert.equal(res.faq, faq, text); assert.ok(res.say.length > 40); assert.doesNotMatch(res.say, /\d{8,}/); }
  for (const t of ['عايز اطلب جاكيت', 'عايز جزمه سودا', 'كوتشي ابيض', 'قميص ازرق', 'بدلة للفرح', 'عايز اشتري شنطه']) assert.equal(matchFaq(t), null, t);
});

test('greetings, "are you an AI / Gemini?" and a Latin brand word inside Arabic never produce an off-topic or English reply', async () => {
  for (const t of ['اي الاخبار', 'ايه الاخبار', 'عامل ايه', 'اخبارك ايه']) { const r = await runModa(t, opts); assert.equal(r.faq, 'howareyou', t); assert.match(r.say, /الحمد لله/); }
  for (const t of ['انتي GEMINI ؟', 'انت chatgpt', 'انتي بشر', 'موديل ايه انتي']) { const r = await runModa(t, opts); assert.equal(r.faq, 'about_ai', t); assert.match(r.say, /الذكاء الاصطناعي/); assert.doesNotMatch(r.say, /^I /); }
  assert.equal((await runModa('اخبار مصر ايه', opts)).faq, 'offtopic');
  assert.equal(parseMessage('عايز hoodie اسود').lang, 'ar');
  assert.equal((await runModa('انتي GEMINI ؟ طيب', opts)).say.match(/[a-z]{4,}/i), null, 'reply stays Arabic');
});
