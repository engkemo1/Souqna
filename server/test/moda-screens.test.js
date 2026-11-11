import test from 'node:test';
import assert from 'node:assert/strict';
import { runModa } from '../src/lib/moda/engine.js';
import { parseMessage } from '../src/lib/moda/parse.js';
import { matchStore } from '../src/lib/moda/stores.js';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const K = loadKnowledge(); let id = 0;
const P = (n, c, pr, x = {}) => enrichProduct({ id: ++id, name_ar: n, cat_text: c, price: pr, stock: 5, track_stock: 1, store_slug: 's1', size_list: 'S,M,L,XL', color_text: x.color || '', ...x }, K);
const products = [P('قميص أبيض كلاسيك', 'قمصان', 450, { color: 'أبيض' }), P('ترنج بيتي حريمي', 'ترنجات', 300, { color: 'وردي' }), P('فستان سواريه كحلي', 'فساتين', 2300, { color: 'كحلي' }), P('بدلة سوداء', 'بدل', 2200, { color: 'أسود' })];
const stores = [{ slug: 'bonita', name_ar: 'بونيتا بوتيك', name_en: 'Bonita Boutique' }, { slug: 'volt', name_ar: 'فولت', name_en: 'Volt' }];

async function chat(turns) {
  let session = null; const msgs = []; let r;
  for (const t of turns) { msgs.push({ role: 'user', content: t }); r = await runModa(msgs, { products, K, session, stores }); session = r.session; msgs.push({ role: 'assistant', content: r.say || '' }); }
  return r;
}

test('كلمات أشخاص/ألوان مش بتطابق اسم محل', () => {
  for (const w of ['بنت', 'ولد', 'ست', 'راجل', 'واحده', 'اسمر', 'اسود', 'girl', 'black', 'woman'])
    assert.equal(matchStore(w, stores).store, null, w);
  assert.equal(matchStore('رقم بونيتا', stores).store?.slug, 'bonita');
});
test('«بنت» لوحدها مفيهاش كارت محل', async () => {
  const r = await chat(['بنت']); assert.ok(!r.storeCard); assert.ok(r.say && !/محل/.test(r.say));
});
test('«مش رياضي» بتتفهم نفي', () => {
  const p = parseMessage('لا مش رياضي ترنج بيتي حريمي'); assert.notEqual(p.context, 'sport');
});
test('عايز/عايزة/محتاج/محتاجة', () => {
  assert.deepEqual(parseMessage('عايز بدله').persons, ['men']);
  assert.deepEqual(parseMessage('عايزه بدله').persons, ['women']);
  assert.deepEqual(parseMessage('محتاجة بدله').persons, ['women']);
  assert.deepEqual(parseMessage('محتاج بدله').persons, ['men']);
  assert.equal(parseMessage('عايزه بدله').garments[0].key, 'womens_suit');
  assert.deepEqual(parseMessage('ayza fostan').persons, ['women']);
});
test('ألوان: اسمر/اسود بكل اللغات', () => {
  const c = (t) => parseMessage(t).garments[0]?.color;
  assert.equal(c('ترنج اسمر'), 'brown'); assert.equal(c('ترنج اسود'), 'black'); assert.equal(c('ترنج سمرا'), 'brown');
  assert.equal(c('shirt noir'), 'black'); assert.equal(c('camisa blanco'), 'white'); assert.equal(c('3ayez qamees abyad'), 'white');
});
test('ولادي/بناتي/للبنت', () => {
  assert.deepEqual(parseMessage('ترنج ولادي').persons, ['boys']);
  assert.deepEqual(parseMessage('فستان بناتي').persons, ['girls']);
  assert.deepEqual(parseMessage('شنطه للبنت').persons, ['girls']);
});
test('وزن وطول → مقاس بدل سؤال تاني', async () => {
  const r = await chat(['عايز قميص ابيض', 'طولي 180 ووزني 90']); assert.match(r.say, /مقاسك XL/);
});
test('«مش متأكد» من المقاس مش بتعمل لوب', async () => {
  const r = await chat(['عايز قميص ابيض', 'مش متأكد']); assert.match(r.say, /طولك ووزنك/); assert.ok(!r.questions?.length);
});
test('بنت/ست/راجل لوحدها بتسأل عايزة إيه', async () => {
  for (const w of ['ست', 'راجل', 'ولد']) { const r = await chat([w]); assert.match(r.say, /قطعة إيه/); }
});
test('محادثة طويلة جدًا (سيشن كبير) مبتكسرش', async () => {
  const turns = []; for (let i = 0; i < 25; i++) turns.push(i % 2 ? 'عايز قميص ابيض' : 'فستان سهره');
  const r = await chat(turns); assert.ok(r.state);
});
test('لون لوحده أو «لبس اسمر» بيسأل لمين مش «ملقتش»', async () => {
  for (const t of ['اسمر', 'لبس اسمر']) { const r = await chat([t]); assert.equal(r.state, 'clarify', t); }
});
test('«بدلة رقص» مبتجيبش بدلة رجالي', async () => {
  const r = await chat(['بدله رقص']); assert.ok(!r.blocks?.tabs?.length); assert.match(r.say, /رقص/);
});
test('أسئلة خدمة بتتجاوب حتى مع سؤال معلّق', async () => {
  const r = await chat(['عايزه فستان سهره', 'اكلم حد']); assert.equal(r.faq, 'support');
  assert.match((await chat(['مع السلامه'])).say, /مع السلامة/);
  assert.match((await chat(['ايه سياسة الاسترجاع'])).say, /استبدال|استرجاع/);
  assert.match((await chat(['هينكمش؟'])).say, /الخامة/);
  assert.match((await chat(['مش وصلني الاوردر'])).say, /تتبع/);
});
test('«فستان فرح» للضيفة مش فستان عروسة', () => {
  assert.equal(parseMessage('عايزه فستان فرح').garments[0].key, 'dress_party');
});
test('نصايح لون البشرة وتوافق الألوان من غير اختراع', async () => {
  assert.match((await chat(['بشرتي سمرا ايه الالوان اللي تناسبني'])).say, /الأبيض الناصع/);
  assert.match((await chat(['ينفع احمر مع بيج'])).say, /تركيبة حلوة/);
});
test('اغلى / حلو / مقاس اكبر بعد نتيجة', async () => {
  assert.notEqual((await chat(['عايز فستان', 'اغلى'])).state, 'clarify');
  assert.match((await chat(['عايز قميص ابيض', 'حلو'])).say, /للسلة/);
  assert.equal((await chat(['عايز قميص ابيض', 'عايز مقاس اكبر'])).state, 'full');
});
test('لون جديد بعد «مش عايز X» مبيقولش «غير X»', async () => {
  const r = await chat(['عايز هودي', 'مش عايز رمادي', 'اسود']); assert.doesNotMatch(r.say, /غير/);
});
test('مصطلحات الموضة', async () => {
  assert.match((await chat(['يعني ايه سموكن'])).say, /رسمية/);
  assert.match((await chat(['ايه الفرق بين سواريه وسهره'])).say, /السواريه/);
});
