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
  // مفيش سؤال «لمين؟» لقطعة للجنسين: النتايج بتظهر على طول (رجالي/حريمي) من غير أي سؤال إجباري.
  const first = await runModa('رشحلي كوتشي ابيض', opts);
  assert.notEqual(first.state, 'clarify');
  assert.ok(first.blocks?.tabs?.length, 'results appear immediately');
  assert.ok(!(first.questions || []).some((q) => q.id === 'who_is_it_for'));
  assert.doesNotMatch(first.say, /لـالمناسبة|طقم/);
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
  for (const [text, faq] of Object.entries(cases)) { const res = await runModa(text, opts); assert.equal(res.faq, faq, text); assert.ok(res.say.length > 40); assert.doesNotMatch(res.say.replace(/01206928670|201206928670/g, ''), /\d{8,}/); }
  for (const t of ['عايز اطلب جاكيت', 'عايز جزمه سودا', 'كوتشي ابيض', 'قميص ازرق', 'بدلة للفرح', 'عايز اشتري شنطه']) assert.equal(matchFaq(t), null, t);
});

test('greetings, "are you an AI / Gemini?" and a Latin brand word inside Arabic never produce an off-topic or English reply', async () => {
  for (const t of ['اي الاخبار', 'ايه الاخبار', 'عامل ايه', 'اخبارك ايه']) { const r = await runModa(t, opts); assert.equal(r.faq, 'howareyou', t); assert.match(r.say, /الحمد لله/); }
  for (const t of ['انتي GEMINI ؟', 'انت chatgpt', 'انتي بشر', 'موديل ايه انتي']) { const r = await runModa(t, opts); assert.equal(r.faq, 'about_ai', t); assert.match(r.say, /الذكاء الاصطناعي/); assert.doesNotMatch(r.say, /^I /); }
  assert.equal((await runModa('اخبار مصر ايه', opts)).faq, 'offtopic');
  assert.equal(parseMessage('عايز hoodie اسود').lang, 'ar');
  assert.equal((await runModa('انتي GEMINI ؟ طيب', opts)).say.replace(/\bTwist\b/g, '').match(/[a-z]{4,}/i), null, 'reply stays Arabic (the Twist brand name is allowed)');
});

test('مدى الميزانية: "من X ل Y" و"بين X و Y" الحد الأقصى هو الميزانية', () => {
  for (const [msg, lo, hi] of [['عايز تيشرت اسود من 200 ل 1000', 200, 1000], ['عايز تيشرت بين 500 و 1500 جنيه', 500, 1500], ['تيشرت من 300 لحد 800', 300, 800]]) {
    const b = parseMessage(msg).budget;
    assert.equal(b.value, hi, msg); assert.equal(b.min, lo, msg);
  }
  assert.equal(parseMessage('تيشرت لحد 400 جنيه').budget.value, 400);
  assert.equal(parseMessage('تيشرت لحد 400 جنيه').budget.min, undefined);
});

test('خطوبة: الكوتشي مش بديل لحذاء رسمي، واللابل بيتسمّى باسم القطعة الحقيقي', async () => {
  const { runModa } = await import('../src/lib/moda/engine.js');
  const { enrichAll } = await import('../src/lib/moda/products.js');
  const sneaker = { id: 9001, name_en: 'Desert For Men D2057/1 - Basic Lace-Up Leather Sneakers', moda_key: 'formal_shoes', price: 1000, stock: 5, gender: 'men', store_slug: 's', slug: 'x', cat_text: 'shoes' };
  const wm = { temp_c: 23, feels_like_c: 23, rain_pct: 2 };
  const res = await runModa([{ role: 'user', content: 'أنا رايح خطوبة بالليل ميزانيتي لحد 1000 جنيه' }], { products: enrichAll([sneaker]), weatherMock: wm });
  const ids = (res.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.id));
  assert.ok(!ids.includes(9001));
});

test('كوتشي أبيض/أسود ساده مقبول مع طقم كلاسيك في الخطوبة، والملون أو الرياضي لأ', async () => {
  const { runModa } = await import('../src/lib/moda/engine.js');
  const { enrichAll, isMinimalSneaker } = await import('../src/lib/moda/products.js');
  assert.equal(isMinimalSneaker('sneakers', 'Leather Sneakers', ['white']), true);
  assert.equal(isMinimalSneaker('sneakers', 'Running Sneakers', ['white']), false);
  assert.equal(isMinimalSneaker('sneakers', 'Printed Sneakers', ['black']), false);
  assert.equal(isMinimalSneaker('sneakers', 'Leather Sneakers', ['red']), false);
  const SHOES = new Set(['sneakers', 'formal_shoes', 'loafers', 'sport_shoes']);
  const fx = enrichAll(JSON.parse((await import('node:fs')).readFileSync(new URL('../test-fixtures/occasion-catalog.json', import.meta.url), 'utf8')).products).filter((p) => !SHOES.has(p.key));
  const mk = (id, name, color) => ({ id, name_en: name, moda_key: 'sneakers', price: 600, stock: 5, gender: 'men', store_slug: 's', slug: `s${id}`, cat_text: 'shoes', colors_json: JSON.stringify([{ name_en: color }]) });
  const wm = { temp_c: 23, feels_like_c: 23, rain_pct: 2 };
  const ask = [{ role: 'user', content: 'أنا رايح خطوبة بالليل، عايز طقم لحد 5000 جنيه' }];
  const shoeIds = async (extra) => { const r = await runModa(ask, { products: [...fx, ...enrichAll(extra)], weatherMock: wm }); return (r.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.id)); };
  assert.equal(enrichAll([mk(9100, 'Clean Leather Sneakers', 'white')])[0].minimalSneaker, true);
  assert.ok((await shoeIds([mk(9100, 'Clean Leather Sneakers', 'white')])).includes(9100));
  assert.ok(!(await shoeIds([mk(9101, 'Running Sneakers Neon', 'red')])).includes(9101));
});

test('لما كوتشي ساده بيتختار لمناسبة رسمية، الرد بيوضّح ليه', async () => {
  const { runModa } = await import('../src/lib/moda/engine.js');
  const { enrichAll } = await import('../src/lib/moda/products.js');
  const SHOES = new Set(['sneakers', 'formal_shoes', 'loafers', 'sport_shoes']);
  const fx = enrichAll(JSON.parse((await import('node:fs')).readFileSync(new URL('../test-fixtures/occasion-catalog.json', import.meta.url), 'utf8')).products).filter((p) => !SHOES.has(p.key));
  const sn = enrichAll([{ id: 9200, name_en: 'Clean Leather Sneakers', moda_key: 'sneakers', price: 600, stock: 5, gender: 'men', store_slug: 's', slug: 's9200', cat_text: 'shoes', colors_json: JSON.stringify([{ name_en: 'white' }]) }]);
  const r = await runModa([{ role: 'user', content: 'أنا رايح خطوبة بالليل، عايز طقم لحد 5000 جنيه' }], { products: [...fx, ...sn], weatherMock: { temp_c: 23, feels_like_c: 23, rain_pct: 2 } });
  assert.match(r.say, /مفيش جزمة رسمية متاحة/);
  assert.match(r.say, /تحب أدورلك جزمة رسمية/);
});

test('طلب قطعة (شوز/شنطة/كوتشي) بيعرض نتايج على طول: من غير سؤال مناسبة ولا لمين، ومن غير تاب فاضي', async () => {
  const shoes = await runModa('شوز رجالي', opts);
  assert.notEqual(shoes.state, 'clarify');
  assert.ok(shoes.blocks?.tabs?.[0]?.items?.length, 'shoes request shows items');
  assert.ok(!(shoes.questions || []).some((q) => ['what_occasion', 'who_is_it_for'].includes(q.id)));
  for (const msg of ['شنطة', 'جزمه', 'رشحلي كوتشي ابيض']) {
    const r = await runModa(msg, opts);
    assert.notEqual(r.state, 'clarify', msg);
    for (const tab of r.blocks?.tabs || []) assert.ok(tab.items.length || tab.missing.length, `${msg}: empty tab ${tab.label}`);
    // اللون سؤال اختياري تحت النتايج، مش شرط قبلها
    assert.ok((r.questions || []).every((q) => q.id === 'color_preference'), msg);
  }
});

test('لوك مناسبة (خطوبة/فرح) لسه بيخلّص أسئلته قبل ما يعرض ترشيح', async () => {
  const r = await runModa('أنا وخطيبتي رايحين خطوبة عايزين طقم لينا الاتنين', opts);
  assert.equal(r.state, 'clarify');
  assert.equal(r.blocks, null);
});

test('طلب بحروف لاتينية (shoes / hoodie aswad) بيرد بنص عربي سليم ومعاه النتايج، مش رسالة «مقدرتش أجهز»', async () => {
  for (const msg of ['shoes', 'hoodie aswad', 'i need a black hoodie', 'white shirt under 500']) {
    const r = await runModa(msg, opts);
    assert.ok(r.blocks?.tabs?.some((t) => t.items.length), msg);
    assert.doesNotMatch(r.say, /مقدرتش أجهز/, msg);
    assert.equal(r.guard, undefined, msg);
  }
});

test('تحيات وأسئلة خدمة عادية: مرحبا / عندكم توصيل / هل في خصم', async () => {
  assert.equal((await runModa('مرحبا', opts)).intent, 'greeting');
  assert.equal((await runModa('يا هلا', opts)).intent, 'greeting');
  assert.equal((await runModa('عندكم توصيل؟', opts)).faq, 'shipping_where');
  for (const m of ['هل في خصم', 'في عروض', 'عاوز كود خصم']) assert.equal((await runModa(m, opts)).faq, 'discounts', m);
  // لكن طلب لبس فيه كلمة «عرض» يفضل طلب لبس
  assert.equal((await runModa('عاوز تيشيرت عليه عرض', opts)).faq, undefined);
});

test('كلمات ناقصة: شوز/وشاح/سويت شيرت، و«لولد/لبنت» بتبقى لطفل مش رجالي كبير', () => {
  assert.equal(parseMessage('شوز رجالي').garments[0]?.key, 'shoes_any');
  assert.equal(parseMessage('وشاح').garments[0]?.key, 'shawl');
  assert.equal(parseMessage('سويت شيرت').garments[0]?.key, 'sweater');
  assert.deepEqual(parseMessage('عاوز تيشيرت لولد').persons, ['boys']);
  assert.deepEqual(parseMessage('فستان لبنت').persons, ['girls']);
});

test('«فستان» لوحدها بتعرض اختيارات على طول من غير سؤال دريس ولا سواريه', async () => {
  const r = await runModa('فستان', opts);
  assert.notEqual(r.state, 'clarify');
  assert.ok(r.blocks?.tabs?.[0]?.items?.length);
});

test('«ارخص» ما بتقولش «ميزانيتك» ولا بتحفظ سقف مش بتاع العميل، و«لون تاني» مابتكررش نفس القطعة من غير توضيح', async () => {
  const a = await runModa('عاوز هودي', opts);
  const b = await runModa('ارخص', { ...opts, session: a.session });
  assert.doesNotMatch(b.say, /ميزانيتك/);
  assert.equal(b.session.parsed.budget ?? null, null);
  const c = await runModa('لون تاني', { ...opts, session: b.session });
  assert.match(c.say, /مفيش بدائل|بدائل تانية|لون تاني|أنسب|اخترتلك/);
});

test('صورة فستان: بنرشح اللي يتماشى معاه (كعب/شنطة…) مش فستان تاني', async () => {
  const r = await runModa('ده لبسي، رشحلي يتماشى معاه إيه؟', { ...opts, imageText: 'فستان أسود حريمي' });
  const keys = (r.blocks?.tabs || []).flatMap((t) => t.items.map((i) => i.key));
  assert.ok(keys.length, 'has picks');
  assert.ok(!keys.some((k) => String(k).startsWith('dress')), `no second dress: ${keys}`);
});

test('مدخلات غريبة (فاضي/رموز/نص طويل/كود) ما بتكسرش المحرك', async () => {
  for (const m of ['', ' ', '؟؟؟', '😀', 'x'.repeat(5000), '<script>alert(1)</script>', "'; DROP TABLE products;--", '{}', 'null']) {
    const r = await runModa(m, opts);
    assert.ok(typeof r.say === 'string' && r.say.length, JSON.stringify(m.slice(0, 20)));
  }
});

test('advice and service questions get a real answer, not a shop/clarify reply', async () => {
  const cases = [
    ['البنطلون الجينز يتلبس مع ايه', /الجينز/],
    ['ينفع البس كوتشي مع بدلة', /كوتشي/],
    ['القميص بيتحط جوه البنطلون ولا بره', /القميص/],
    ['ازاي اغير العنوان', /الطلب/],
    ['عايز استبدل المقاس', /الاستبدال/],
    ['انتي بنت ولا ولد', /تويلا|Twila/],
    ['ازاي ابعتلكم صورة', /صورة/],
  ];
  for (const [msg, re] of cases) {
    const r = await runModa(msg, opts);
    assert.match(r.say, re, msg);
    assert.ok(!r.products?.length, msg);
  }
});

test('care answers always defer to the garment label and never invent temperatures for delicate fabrics', async () => {
  const care = K.phrases.advice.items.filter((a) => a.care);
  assert.ok(care.length >= 15);
  for (const a of care) assert.ok(/لافتة/.test(a.answer_ar), a.id);
  for (const id of ['care_wool', 'care_silk', 'care_leather', 'care_suede', 'care_velvet', 'care_suit', 'care_stain']) {
    const a = care.find((x) => x.id === id);
    assert.ok(a, id);
    assert.ok(!/\d+\s*(°|درجه|درجة)/.test(a.answer_ar), `${id} must not give a temperature`);
  }
  const cases = [
    ['ازاي اغسل الجينز', 'care_denim'], ['ازاي اغسل الصوف', 'care_wool'], ['ازاي انضف الجاكيت الجلد', 'care_leather'],
    ['ازاي اغسل القميص', 'care_cotton'], ['ازاي اغسل', 'care_general'], ['طريقة الغسيل', 'care_general'],
    ['ازاي انضف الكوتشي', 'care_sneakers'], ['القميص بيتقلص بعد الغسيل', 'care_shrink'], ['ازاي اشيل بقعة قهوة', 'care_stain'],
  ];
  for (const [msg, id] of cases) {
    const r = await runModa(msg, opts);
    assert.equal(r.adviceId, id, msg);
    assert.ok(!r.products?.length, msg);
  }
});

test('care text written by the store is shown verbatim for shown products', async () => {
  const first = await runModa('عايز هودي', opts);
  const shown = first.session?.shown || [];
  assert.ok(shown.length, 'products shown');
  const withCare = rows.map((p) => (p.id === shown[0] ? { ...p, care_ar: 'غسيل بارد 30 درجة بدون مبيض' } : p));
  const r = await runModa('ازاي اغسله', { ...opts, products: withCare, session: first.session });
  assert.match(r.say, /غسيل بارد 30 درجة بدون مبيض/);
  assert.match(r.say, /لافتة/);
});

test('offers question lists real offers and discounted items, or says honestly there are none', async () => {
  const disc = rows.map((p, i) => (i === 0 ? { ...p, compare_at_price: p.price * 2, stock: 5, track_stock: 1, store_name_ar: 'محل تجريبي' } : p));
  let r = await runModa('في عروض ايه', { ...opts, products: disc, offers: () => [{ store: 'محل الاختبار', name: 'خصم العيد', headline: 'خصم 20%', endsAt: null }] });
  assert.match(r.say, /محل الاختبار/); assert.match(r.say, /خصم 20%/); assert.match(r.say, /خصم 50%/);
  r = await runModa('في عروض ايه', { ...opts, products: rows.map((p) => ({ ...p, compare_at_price: null })), offers: () => [] });
  assert.match(r.say, /مفيش عروض/);
  r = await runModa('ازاي استخدم كود الخصم', { ...opts, offers: () => [{ store: 'س', name: '', headline: 'خصم 20%' }] });
  assert.doesNotMatch(r.say, /خصم 20%/);
});

test('remembers last budget and audience, and reuses the budget for an occasion request without one', async () => {
  const a = await runModa('عايز لبس للشغل ميزانيتي 2000', opts);
  assert.equal(a.remember?.lastBudget, '2000');
  const b = await runModa('عايز لبس للشغل', { ...opts, profile: { lastBudget: '2000' } });
  assert.ok(b.parsed.budget?.value === 2000 || b.state === 'clarify', 'budget reused or asked');
  if (b.blocks) assert.match(b.say, /ميزانيتك المعتادة/);
  const c = await runModa('عايز لبس للشغل ميزانيتي 3000', { ...opts, profile: { lastBudget: '2000' } });
  assert.equal(c.parsed.budget.value, 3000);
  assert.ok(!/ميزانيتك المعتادة/.test(c.say || ''));
});

test('care question uses the material the store wrote for the shown product', async () => {
  const first = await runModa('عايز هودي', opts);
  const shown = first.session?.shown || [];
  assert.ok(shown.length);
  const withMat = rows.map((p) => (p.id === shown[0] ? { ...p, material_ar: 'جلد طبيعي' } : p));
  const r = await runModa('ازاي اغسله', { ...opts, products: withMat, session: first.session });
  assert.match(r.say, /جلد طبيعي/);
  assert.equal(r.adviceId, 'care_leather');
  assert.match(r.say, /لافتة/);
});

test('offers asked about one garment lists only discounted pieces of that type', async () => {
  const hood = rows.find((p) => p.key === 'hoodie');
  assert.ok(hood);
  const disc = rows.map((p) => (p.id === hood.id ? { ...p, compare_at_price: p.price * 2, stock: 5, track_stock: 1 } : p));
  const r = await runModa('في عروض على الهودي', { ...opts, products: disc });
  assert.equal(r.intent, 'faq');
  assert.match(r.say, /خصم 50%/);
  assert.ok(r.say.includes(hood.name_ar));
});

const STORES = [
  { slug: 'town-style', name_ar: 'تاون ستايل', name_en: 'Town Style', tagline_ar: 'تيشيرتات وجينز', description_ar: '', address_ar: 'شارع سعد زغلول', city: 'Banha', phone: '0132222222', whatsapp: '01011112222', map_url: null, lat: 30.466, lng: 31.185, hours: { open: '10:00', close: '22:00', dayOff: 5 }, branches: [{ name: 'فرع المحطة', address: 'قدام المحطة', phone: '', map_url: 'https://maps.app.goo.gl/x' }], instagram: 'townstyle', facebook: '', tiktok: '' },
  { slug: 'bait-elmoda', name_ar: 'بيت الموضة', name_en: 'Bait El Moda', tagline_ar: '', description_ar: '', address_ar: '', city: 'Banha', phone: '', whatsapp: '', map_url: null, lat: null, lng: null, hours: null, branches: [], instagram: '', facebook: '', tiktok: '' },
];
const sopts = { ...opts, stores: () => STORES, offers: () => [{ store: 'تاون ستايل', name: 'خصم العيد', headline: 'خصم 20%', endsAt: null }] };

test('questions about Twist contact details get the real numbers and links', async () => {
  const cases = [
    ['رقمكم كام', 'contact_phone', /01206928670/], ['ايه رقم الواتس بتاعكم', 'contact_whatsapp', /wa\.me\/201206928670/], ['لينك الفيسبوك', 'contact_facebook', /facebook\.com/],
    ['فين صفحتكم على الفيس', 'contact_facebook', /facebook\.com/], ['حسابكم على انستا', 'contact_instagram', /instagram\.com/], ['تيك توك بتاعكم', 'contact_tiktok', /tiktok\.com/],
    ['ال mail بتاعكم ايه', 'contact_email', /@gmail\.com/], ['ايميلكم', 'contact_email', /@/], ['ازاي اتواصل معاكم', 'contact_all', /01206928670[\s\S]*facebook[\s\S]*instagram/],
    ['عنوانكم فين', 'contact_address', /بنها/], ['لينك الموقع', 'website', /twistegy\.com/], ['بتشتغلوا من امتى', 'contact_hours', /واتساب/],
    ['what is your phone number', 'contact_phone', /01206928670/], ['how can i contact you', 'contact_all', /Facebook/],
  ];
  for (const [msg, faq, re] of cases) { const r = await runModa(msg, opts); assert.equal(r.faq, faq, msg); assert.match(r.say, re, msg); assert.ok(!/\{[a-z_]+\}/.test(r.say), `${msg}: unfilled placeholder`); }
  const custom = await runModa('رقمكم كام', { ...opts, contact: { phone: '0100000000', whatsapp: '20100000000' } });
  assert.match(custom.say, /0100000000/);
});

test('who we are, services, and store-owner questions never invent prices or promises', async () => {
  const cases = [
    ['مين انتوا', 'about_us'], ['ايه هو تويست', 'about_us'], ['ايه الخدمات اللي بتقدموها', 'services'], ['نقدر نساعد في ايه', 'wide_help'], ['انتوا شركة ولا محل', 'about_kind'],
    ['مين صاحب الموقع', 'about_owner'], ['عندكم فروع', 'about_branches'], ['عايز افتح محل عندكم', 'seller_join'], ['بكام الاشتراك', 'merchant_price'], ['في عمولة', 'merchant_price'],
    ['ازاي اصور منتجاتي', 'merchant_photo'], ['هعرف الطلبات ازاي', 'merchant_orders'], ['ازاي اضيف منتجات', 'merchant_products'], ['هل منتجاتي هتظهر في تويلا', 'merchant_moda'],
    ['عايز اعلن عندكم', 'merchant_ads'], ['محتاج سجل تجاري', 'merchant_requirements'], ['محلي في طنطا ينفع', 'merchant_outside'], ['نسيت الباسورد بتاع لوحة المحل', 'merchant_login_help'],
    ['عايز اشتغل معاكم', 'partnership'], ['ايه مميزات الاشتراك', 'merchant_benefits'], ['عايز اشتكي', 'complaint_contact'],
  ];
  for (const [msg, faq] of cases) { const r = await runModa(msg, opts); assert.equal(r.faq, faq, msg); assert.ok(r.say.length > 40, msg); assert.ok(!r.products?.length, msg); }
  for (const id of ['merchant_price', 'merchant_requirements', 'merchant_ads']) {
    const r = await runModa(id === 'merchant_price' ? 'بكام الاشتراك' : id === 'merchant_ads' ? 'عايز اعلن عندكم' : 'محتاج سجل تجاري', opts);
    assert.doesNotMatch(r.say.replace(/01206928670|201206928670/g, ''), /\d+\s*(جنيه|ج\.م|EGP)/, `${id} must not state a price`);
  }
});

test('questions about a specific store use that store data: phone, map, address, branches, hours, social, sells, offers', async () => {
  let r = await runModa('رقم محل تاون ستايل', sopts); assert.equal(r.faq, 'store'); assert.match(r.say, /0132222222/); assert.match(r.say, /wa\.me\/201011112222/); assert.ok(r.storeCard);
  r = await runModa('لوكيشن تاون ستايل', sopts); assert.match(r.say, /google\.com\/maps/); assert.match(r.say, /سعد زغلول/); assert.equal(r.storeCard.lat, 30.466);
  r = await runModa('فروع تاون ستايل', sopts); assert.match(r.say, /فرع المحطة/);
  r = await runModa('تاون ستايل بيفتح امتي', sopts); assert.match(r.say, /من 10 ص لـ 10 م|مقفول/);
  r = await runModa('انستجرام تاون ستايل', sopts); assert.match(r.say, /instagram\.com\/townstyle/);
  r = await runModa('عروض تاون ستايل', sopts); assert.match(r.say, /خصم 20%/);
  r = await runModa('تاون ستايل بيبيع ايه', sopts); assert.match(r.say, /تيشيرتات وجينز/);
  r = await runModa('رقم بيت الموضة', sopts); assert.match(r.say, /مسجّلش رقم/); assert.ok(!/\d{7,}/.test(r.say.replace(/01206928670|201206928670/g, '')));
  r = await runModa('عنوان بيت الموضة', sopts); assert.match(r.say, /مش مسجّل/);
  r = await runModa('كل حاجة عن تاون ستايل', sopts); assert.match(r.say, /0132222222/); assert.match(r.say, /سعد زغلول/);
  r = await runModa('رقم المحل', sopts); assert.match(r.say, /تاون ستايل/); assert.match(r.say, /بيت الموضة/);
  r = await runModa('اي محل بيفتح وبيقفل امتى', sopts); assert.match(r.say, /تاون ستايل/);
  r = await runModa('عايز هودي من تاون ستايل', sopts); assert.notEqual(r.faq, 'store', 'a shopping request stays shopping');
});
