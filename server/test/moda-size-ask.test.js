// بوكسر/لبس داخلي/نوم: تويلا تفهمه وتسأل عن المقاس (مش المناسبة ولا اللون) وتفلتر بيه.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModa } from '../src/lib/moda/engine.js';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const K = loadKnowledge();
const rows = [
  { id: 1, name_ar: 'بوكسر قطن رجالي', price: 90, stock: 5, track_stock: 1, size_list: 'M,L', store_slug: 'a' },
  { id: 2, name_ar: 'بوكسر ستريتش', price: 80, stock: 5, track_stock: 1, size_list: 'XL', store_slug: 'a' },
];
const products = rows.map((r) => enrichProduct(r, K));
const ids = (r) => (r.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.id));

test('"عاوز بوكسر" يسأل عن المقاس بس', async () => {
  const r = await runModa([{ role: 'user', content: 'عاوز بوكسر' }], { products, K });
  assert.deepEqual((r.questions || []).map((q) => q.id), ['size_needed']);
});
test('الإجابة بزر المقاس بتفلتر', async () => {
  const s = (await runModa([{ role: 'user', content: 'عاوز بوكسر' }], { products, K })).session;
  const r = await runModa([{ role: 'user', content: 'عاوز بوكسر' }], { products, K, session: s, answers: { size_needed: 'L' } });
  assert.deepEqual(ids(r), [1]); assert.equal((r.questions || []).length, 0);
});
test('المقاس في نفس الرسالة وما يتسألش تاني', async () => {
  const r = await runModa([{ role: 'user', content: 'عاوز بوكسر مقاس XL' }], { products, K });
  assert.deepEqual(ids(r), [2]); assert.equal((r.questions || []).length, 0);
});
test('"L" لوحدها كرد على السؤال', async () => {
  const s = (await runModa([{ role: 'user', content: 'عاوز بوكسر' }], { products, K })).session;
  const r = await runModa([{ role: 'user', content: 'L' }], { products, K, session: s });
  assert.deepEqual(ids(r), [1]);
});

test('اسم بيقول بنطلون والقسم قميص → مش بيترشح (typeConflict)', () => {
  const p = enrichProduct({ name_ar: 'بنطلون كتان', cat_text: 'قمصان', price: 300, stock: 3 }, K);
  assert.equal(p.typeConflict, true);
});
test('اسم وقسم متفقين → سليم', () => {
  const p = enrichProduct({ name_ar: 'بنطلون كتان', cat_text: 'بناطيل', price: 300, stock: 3 }, K);
  assert.equal(p.typeConflict, false);
});
test('طلب بوكسر ومفيش منتج متفق → مفيش حاجة', async () => {
  const bad = [enrichProduct({ id: 9, name_ar: 'بوكسر قطن', cat_text: 'جاكيتات', price: 90, stock: 5, track_stock: 1, size_list: 'L' }, K)];
  const r = await runModa([{ role: 'user', content: 'عاوز بوكسر مقاس L' }], { products: bad, K });
  assert.deepEqual(ids(r), []);
});

test('صورة المنتج مش مطابقة (photo_mismatch=1) → مش بيترشح', () => {
  const p = enrichProduct({ name_ar: 'بوكسر قطن', cat_text: 'ملابس داخلية', price: 90, stock: 5, photo_mismatch: 1 }, K);
  assert.equal(p.typeConflict, true);
});
