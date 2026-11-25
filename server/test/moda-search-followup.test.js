// A budget follow-up after a skincare search applies to THAT search (not the whole catalogue); search results are the best 3 only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModa } from '../src/lib/moda/engine.js';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const K = loadKnowledge(); let id = 0;
const P = (en, ar, price, x = {}) => enrichProduct({ id: ++id, name_en: en, name_ar: ar, price, stock: 5, track_stock: 1, store_slug: 's1', sold_count: 0, size_list: '', ...x }, K);
const skin = { department: 'care', dept_parent: 'beauty' };
const products = [
  P('Centella Tone Brightening Serum', 'سيروم سنتيلا', 1275, { ...skin, sold_count: 9 }), P('Dark Spot Correcting Serum', 'سيروم البقع الداكنة', 1000, { ...skin, sold_count: 8 }),
  P('Vitamin C Serum', 'سيروم فيتامين سي', 600, { ...skin, sold_count: 7 }), P('Hydrating Face Cream', 'كريم مرطب للوجه', 450, { ...skin, sold_count: 6 }),
  P('Gentle Face Cleanser', 'غسول للوجه', 300, { ...skin, sold_count: 5 }), P('Sunscreen SPF50', 'واقي شمس', 700, { ...skin, sold_count: 4 }),
  P('Flamingo razor blades', 'شفرات فلامنجو', 10, { department: 'beauty_body_care', dept_parent: 'beauty' }),
  P('Leather belt', 'حزام جلد', 250, { department: 'accessories' }),
];
async function chat(turns) {
  let session = null; const msgs = []; let r; const out = [];
  for (const t of turns) { msgs.push({ role: 'user', content: t }); r = await runModa(msgs, { products, K, session }); session = r.session; msgs.push({ role: 'assistant', content: r.say || '' }); out.push(r); }
  return out;
}
const ids = (r) => (r.blocks?.tabs?.[0]?.items || []).map((i) => i.id);

test('skincare search shows the best 3 only', async () => {
  const [r] = await chat(['عايزة حاجة للبشرة']);
  assert.equal(r.state, 'full'); assert.equal(ids(r).length, 3);
});
test('"اقل من 1000" after a skincare search stays in skincare and respects the budget', async () => {
  const [, r] = await chat(['عايزة حاجة للبشرة', 'عاوز اقل من 1000']);
  const got = ids(r); assert.ok(got.length >= 1 && got.length <= 3);
  for (const i of got) { const p = products.find((x) => x.id === i); assert.equal(p.department, 'care'); assert.ok(p.price <= 1000); }
  assert.ok(!got.includes(products[6].id) && !got.includes(products[7].id), 'no razor blades / belts');
});
test('budget so low nothing fits: honest reply, no unrelated products', async () => {
  const [, r] = await chat(['عايزة حاجة للبشرة', 'اقل من 100']);
  assert.equal(r.blocks, null); assert.match(r.say, /مفيش/);
});
test('a budget in the first message also filters', async () => {
  const [r] = await chat(['عايزة سيروم للبشرة بأقل من 1000']);
  for (const i of ids(r)) assert.ok(products.find((x) => x.id === i).price <= 1000);
});

test('ranking: asked word first, then closest to the budget, then demand (a famous but less relevant product does not win)', async () => {
  const mk = (en, ar, price, x) => P(en, ar, price, { ...skin, ...x });
  products.push(mk('Rose Hydrating Cream', 'كريم ورد', 950, { sold_count: 500 }), mk('Snail Serum', 'سيروم القوقع', 400, { sold_count: 1 }), mk('Peptide Serum', 'سيروم ببتيد', 900, { sold_count: 2 }));
  const [r] = await chat(['عايزة سيروم تحت 1000']);
  const got = ids(r).map((i) => products.find((x) => x.id === i).name_en);
  assert.ok(got.slice(0, 2).every((n) => /Serum/.test(n)), `serums first even though a cream sells 500: ${got}`);
  assert.deepEqual(got.slice(0, 2), ['Dark Spot Correcting Serum', 'Peptide Serum'], 'closest to the budget first (1000, then 900, before 600/400)');
  products.length -= 3;
});
test('ranking is applied on the budget follow-up too', async () => {
  const [, r] = await chat(['عايزة حاجة للبشرة', 'تحت 650']);
  const prices = ids(r).map((i) => products.find((x) => x.id === i).price); assert.ok(prices.every((p) => p <= 650)); assert.deepEqual([...prices], [...prices].sort((a, b) => b - a), 'closest to the budget first');
});

test('skin-tone colour advice ("بشرتي سمرا ايه الالوان…") is styling advice, not a skincare product search', async () => {
  const [r] = await chat(['بشرتي سمرا ايه الالوان اللي تناسبني']);
  assert.match(r.say, /الأبيض الناصع/); assert.equal(r.blocks, null);
  const [s] = await chat(['عايزة سيروم تفتيح لبشرتي السمرا']);
  assert.equal(s.state, 'full'); assert.ok(ids(s).length >= 1, 'a real skincare request about dark skin still searches products');
});
