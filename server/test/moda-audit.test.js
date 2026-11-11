// جولة فحص شاملة: حالات حقيقية كانت بتفشل.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModa } from '../src/lib/moda/engine.js';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const K = loadKnowledge();
let n = 0; const P = (name_ar, cat_text, price, x = {}) => enrichProduct({ id: ++n, name_ar, cat_text, price, stock: 5, track_stock: 1, store_slug: 's', size_list: 'M,L', ...x }, K);
const products = [
  P('قميص أبيض كلاسيك', 'قمصان', 450), P('بنطلون كلاسيك رمادي', 'بناطيل', 520), P('بدلة سوداء فورمال', 'بدل', 2200), P('بدلة كحلي سليم', 'بدل', 2500),
  P('فستان سواريه أحمر طويل', 'فساتين', 2800), P('فستان أسود قصير', 'فساتين', 1100), P('أحمر شفاه', 'مكياج', 150), P('نظارة شمس', 'إكسسوارات', 350),
  P('كوتشي أبيض', 'كوتشي', 650), P('عطر رجالي', 'عطور', 800), P('شنطة كلتش ذهبي', 'شنط', 600), P('طرحة شيفون بيج', 'طرح وحجاب', 150),
];
const run = (t, o = {}) => runModa([{ role: 'user', content: t }], { products, K, ...o });
const ids = (r) => (r.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.id));
const idOf = (name) => products.find((p) => p.name_ar === name).id;

test('«و» لوحدها مش خامة: قميص و بنطلون بيرجع نتيجة', async () => {
  const r = await run('محتاج قميص ابيض و بنطلون رمادي');
  assert.deepEqual(ids(r).sort(), [idOf('قميص أبيض كلاسيك'), idOf('بنطلون كلاسيك رمادي')].sort());
});
test('«بس مش احمر» = تجنّب الأحمر', async () => {
  const r = await run('عاوزه فستان بس مش احمر');
  assert.deepEqual(ids(r), [idOf('فستان أسود قصير')]);
});
test('مكياج ونظارة (برا قاموس اللبس) بتتلاقي بالبحث بالكلمات', async () => {
  assert.deepEqual(ids(await run('احمر شفاه')), [idOf('أحمر شفاه')]);
  assert.deepEqual(ids(await run('عندكم نظارة')), [idOf('نظارة شمس')]);
});
test('«غيرها» بعد بدلة = البدلة التانية', async () => {
  const s = (await run('عاوز بدله')).session;
  const r = await run('غيرها', { session: s });
  assert.deepEqual(ids(r), [idOf('بدلة كحلي سليم')]);
});
test('مقاس مش متاح → تقول المتاح بدل «مفيش حاجة»', async () => {
  const r = await run('عاوز كوتشي ابيض مقاس 42');
  assert.ok(r.say.includes('42') && r.say.includes('M'), r.say);
  assert.deepEqual(ids(r), [idOf('كوتشي أبيض')]);
});
test('عطر مايسألش عن اللون', async () => {
  const r = await run('عاوز عطر');
  assert.ok(!(r.questions || []).some((q) => q.id === 'color_preference'));
});
test('هدية لمراتي = للسيدة بس (مش كوبل)', async () => {
  const r = await run('عاوز هدية لمراتي');
  assert.deepEqual(r.parsed.persons, ['women']);
  assert.ok(ids(r).includes(idOf('شنطة كلتش ذهبي')));
});

test('ألوان مؤنث (سوداء/حمراء) في اسم المنتج بتتعرف', () => {
  assert.deepEqual(P('بدلة سوداء فورمال', 'بدل', 1).colorKeys, ['black']);
  assert.deepEqual(P('فستان حمراء', 'فساتين', 1).colorKeys, ['red']);
  assert.deepEqual(P('شنطة ذهبية', 'شنط', 1).colorKeys, ['gold']);
});
test('«لا اسود» بعد كحلي = بدلة سودا', async () => {
  const s1 = (await run('عاوز بدله')).session;
  const s2 = (await run('كحلي', { session: s1 })).session;
  const r = await run('لا اسود', { session: s2 });
  assert.deepEqual(ids(r), [idOf('بدلة سوداء فورمال')]);
});
test('«فستان احمر» يلاقي السواريه الأحمر (مش بس الكاجوال)', async () => {
  const r = await run('فستان احمر');
  assert.deepEqual(ids(r), [idOf('فستان سواريه أحمر طويل')]);
});
test('جلسة جاية بشكل غريب من المتصفح ماتوقعش المحرك', async () => {
  const bad = { parsed: { garments: 'oops', persons: 5 }, activeLook: { items: [{}] }, shown: 'x', lookHistory: 'y', turn: 'z' };
  const r = await run('عاوز قميص', { session: bad, answers: { which_piece: 999 } });
  assert.ok(r && r.state);
});

// ---- محل بالاسم مش بالمدينة + أسئلة عامة من بيانات الموقع ----
const stores = [{ slug: 'rose-kids-banha', name_ar: 'روز كيدز بنها', name_en: 'Rose Kids Banha', phone: '01228994038' }, { slug: 'marten', name_ar: 'مارتن', name_en: 'Marten' }];
test('«من محلات بنها» مش اسم محل: ما يرجعش كارت محل', async () => {
  const r = await run('معايا جاكيت وتر بروف عايز طقم يليق عليه من محلات بنها', { stores });
  assert.notEqual(r.faq, 'store');
  assert.ok(ids(r).length > 0);
});
test('رقم محل بالاسم لسه شغال', async () => {
  const r = await run('عاوز رقم محل روز كيدز', { stores });
  assert.equal(r.faq, 'store');
});
test('«عاوز حاجة أرخص من 300» تعرض أرخص المنتجات مباشرة', async () => {
  const r = await run('عاوز حاجه ارخص من 300');
  assert.ok(ids(r).length > 0 && ids(r).every((i) => products.find((p) => p.id === i).price <= 300));
});
test('«عندكم ماركات؟» ترد بأسماء المحلات الحقيقية', async () => {
  const r = await run('عندكم ماركات؟', { stores });
  assert.ok(r.say.includes('مارتن'));
});
test('«نسقلي طقم على جاكيت» = باقي الطقم', async () => {
  const jackets = [P('جاكيت وتر بروف', 'جاكيتات', 1400), P('بنطلون جينز أزرق', 'جينز', 600), P('كوتشي أبيض', 'كوتشي', 650), P('تيشيرت قطن', 'تيشيرتات', 120)];
  const r = await runModa([{ role: 'user', content: 'نسقلي طقم على جاكيت وتر بروف' }], { products: jackets, K });
  assert.ok(ids(r).length >= 2);
});
