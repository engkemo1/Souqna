// «على الفستان» بعد طلب صندل = الفستان مرجع والمطلوب صندل (مش فستان جديد). و«عليها» = السيدة بس.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModa } from '../src/lib/moda/engine.js';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';

const K = loadKnowledge();
const mk = (r) => enrichProduct({ price: 500, stock: 5, track_stock: 1, store_slug: 'a', ...r }, K);
const products = [
  mk({ id: 1, name_ar: 'بدلة سمراء فورمال', cat_text: 'بدل', price: 1850 }),
  mk({ id: 2, name_ar: 'فستان سواريه طويل', cat_text: 'فساتين', price: 2800 }),
  mk({ id: 3, name_ar: 'حذاء قرنية كلاسيك', cat_text: 'أحذية رجالي', price: 650 }),
  mk({ id: 4, name_ar: 'صندل حريمي ذهبي', cat_text: 'صنادل', price: 450 }),
];
const ids = (r) => (r.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.id));
const msg = (c) => ({ role: 'user', content: c });

test('«على الفستان» بعد طلب صندل: مايرجعش فستان ولا بدلة كاختيار جديد', async () => {
  const session = {
    turn: 2, pending: false,
    parsed: { intent: 'shop', persons: ['men', 'women'], context: 'engagement_guest', garments: [{ key: 'sandals', color: null, text: 'صندل', position: 0 }], colors: [], flags: {} },
    activeLook: { items: [
      { id: 1, name: 'بدلة سمراء فورمال', key: 'suit', slotKey: 'suit', aud: 'men' },
      { id: 2, name: 'فستان سواريه طويل', key: 'dress_evening', slotKey: 'dress_evening', aud: 'women' },
    ] }, lookHistory: [],
  };
  const r = await runModa([msg('عاوز صندل عليها'), msg('على الفستان')], { products, K, session });
  assert.ok(!(r.say || '').includes('بدلة'), r.say);
  assert.ok(!ids(r).includes(1), 'البدلة ماتتعرضش');
  assert.deepEqual(ids(r).sort(), [2, 4]); // الفستان مثبّت + الصندل المنسّق عليه
});

test('«عليها» لوحدها في طقم اتنين: السيدة بس (الفستان) مش البدلة', async () => {
  const session = {
    turn: 2, pending: false,
    parsed: { intent: 'shop', persons: ['men', 'women'], context: 'engagement_guest', garments: [], colors: [], flags: {} },
    activeLook: { items: [
      { id: 1, name: 'بدلة سمراء فورمال', key: 'suit', slotKey: 'suit', aud: 'men' },
      { id: 2, name: 'فستان سواريه طويل', key: 'dress_evening', slotKey: 'dress_evening', aud: 'women' },
    ] }, lookHistory: [],
  };
  const r = await runModa([msg('عاوز صندل عليها')], { products, K, session });
  assert.ok(!ids(r).includes(1), 'البدلة ماتتثبتش للسيدة');
  assert.ok(ids(r).includes(2));
});

// ---- لما مش فاهمة: تسأل بدل ما تخمّن ----
const couple = () => ({
  turn: 2, pending: false,
  parsed: { intent: 'shop', persons: ['men', 'women'], context: 'engagement_guest', garments: [{ key: 'sandals', color: null, text: 'صندل', position: 0 }], colors: [], flags: {} },
  activeLook: { items: [
    { id: 1, name: 'بدلة سمراء فورمال', key: 'suit', slotKey: 'suit', aud: 'men' },
    { id: 2, name: 'فستان سواريه طويل', key: 'dress_evening', slotKey: 'dress_evening', aud: 'women' },
    { id: 5, name: 'فستان كوكتيل قصير', key: 'dress_evening', slotKey: 'dress_evening', aud: 'women' },
  ] }, lookHistory: [],
});
test('«على الفستان» ولوك فيه فستانين → تسأل أنهي واحد', async () => {
  const r = await runModa([msg('على الفستان')], { products, K, session: couple() });
  assert.equal(r.state, 'clarify');
  assert.equal(r.questions[0].id, 'which_piece');
  assert.deepEqual(r.questions[0].options.map((o) => o.value), [2, 5]);
});
test('بعد ما يختار الفستان → يثبّته ويجيب الصندل', async () => {
  const s = couple();
  const r = await runModa([msg('على الفستان')], { products, K, session: s, answers: { which_piece: 2 } });
  assert.ok(ids(r).includes(2) && !ids(r).includes(1) && !ids(r).includes(5), JSON.stringify(ids(r)));
});
test('«عليهم» في طقم اتنين → تسأل ليك ولا ليها ولا الاتنين', async () => {
  const r = await runModa([msg('عاوز صندل عليهم')], { products, K, session: couple() });
  assert.equal(r.questions?.[0]?.id, 'which_person');
  assert.deepEqual(r.questions[0].options.map((o) => o.value), ['men', 'women', 'both']);
});
test('كلام مش مفهوم مع لوك قايم → تسأل تقصد إيه', async () => {
  const r = await runModa([msg('ازاي ده')], { products, K, session: couple() });
  assert.equal(r.state, 'clarify');
  assert.equal(r.questions[0].id, 'look_action');
});
test('بدّل قطعة: swap يستبعد القطعة ويدوّر على بديل', async () => {
  const r = await runModa([msg('ازاي ده')], { products, K, session: couple(), answers: { look_action: 'swap:2' } });
  assert.ok(!ids(r).includes(2));
});
