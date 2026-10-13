import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runModa } from '../src/lib/moda/engine.js';
import { parseMessage } from '../src/lib/moda/parse.js';
import { enrichAll } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { checkLabels, checkText } from '../src/lib/moda/guard.js';
import { respond } from '../src/lib/moda/respond.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures');
const catalog = JSON.parse(fs.readFileSync(path.join(DIR, 'occasion-catalog.json'), 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(path.join(DIR, 'scenarios.json'), 'utf8')).scenarios;
const K = loadKnowledge();
const rows = enrichAll(catalog.products, K);
const byId = new Map(rows.map((r) => [r.id, r]));
const HERO = new Set(['dress_party', 'dress_evening', 'dress_casual', 'dress_work', 'jumpsuit', 'two_piece_set', 'womens_suit', 'suit', 'classic_set', 'tuxedo', 'abaya', 'hijab_set']);
const QID = { audience: 'who_is_it_for', occasion: 'what_occasion', budget: 'budget', dress_kind: 'dress_kind' };

const tabFor = (res, who) => res.blocks?.tabs?.find((t) => (who === 'him' ? t.id === 'men' : ['women', 'women_hijab', 'girls'].includes(t.id)));
const allItems = (res) => (res.blocks?.tabs || []).flatMap((t) => t.items);

for (const sc of scenarios) {
  test(sc.id, async () => {
    const ex = sc.expect;
    const options = { products: rows, now: new Date(sc.now), weatherMock: sc.weather_mock || { temp_c: 21, feels_like_c: 21, rain_pct: 2 }, imageText: sc.image_stub || '' };
    let res = await runModa(sc.message, options);
    // Product-quality scenarios represent a shopper who answered Moda's needed follow-up questions.
    if (ex.state !== 'clarify') {
      for (let turn = 0; res.state === 'clarify' && turn < 4; turn += 1) {
        const id = res.questions?.[0]?.id;
        const answers = { budget: 'flexible', time_if_dressy: 'night', venue_if_dressy: 'hall', season_if_unknown: 'mid', color_preference: 'any' };
        if (!Object.hasOwn(answers, id)) break;
        res = await runModa('', { ...options, session: res.session, answers: { [id]: answers[id] } });
      }
    }
    const items = allItems(res);
    assert.equal(res.state, ex.state, `state: got ${res.state}\n${res.say}`);
    if (ex.context) assert.ok([res.parsed.context, res.parsed.contextEffective].includes(ex.context), `context ${res.parsed.context}/${res.parsed.contextEffective}`);
    if (ex.audience) { const got = new Set(res.parsed.persons); for (const a of ex.audience) assert.ok(got.has(a), `audience ${a} in ${[...got]}`); }
    if (ex.budget_total) assert.equal(res.parsed.budget?.value, ex.budget_total);
    if (ex.ask) { const ids = (res.questions || []).map((q) => q.id); for (const a of ex.ask) assert.ok(ids.includes(QID[a]), `ask ${a} in ${ids}`); }
    if (ex.tabs) assert.equal(res.blocks.tabs.length, ex.tabs.length);
    if (ex.persons) assert.equal(res.blocks.tabs.length, ex.persons);
    if (ex.must_families) for (const [who, fams] of Object.entries(ex.must_families)) {
      const tb = tabFor(res, who); assert.ok(tb, `tab ${who}`);
      for (const f of fams) assert.ok(tb.items.some((i) => f.split('|').includes(i.key)), `${who} needs ${f}; has ${tb.items.map((i) => i.key)}`);
    }
    if (ex.must_total_leq) assert.ok(res.blocks.total <= ex.must_total_leq, `total ${res.blocks.total}`);
    if (ex.must_colors) for (const c of ex.must_colors) assert.ok(items.some((i) => i.colors.includes(c)), `color ${c}`);
    if (ex.slots) assert.equal(items.length, ex.slots);
    if (ex.missing) for (const m of ex.missing) assert.ok((res.missing || []).some((x) => x.label === m), `missing ${m}`);
    if (ex.order_button) assert.ok(res.blocks.tabs.some((t) => t.missing.some((m) => m.button)));
    for (const bad of ex.must_not || []) {
      if (bad === 'near_white_for_guests' && !ex.allow_near_white) for (const i of items) if (HERO.has(i.key)) assert.ok(!K.nearWhite.has(i.colors[0]), `near-white hero ${i.name}`);
      if (bad === 'galabeya' || bad === 'jalabiya') assert.ok(!items.some((i) => i.key === 'jalabiya'));
      if (bad === 'relationship_words_in_labels' && res.blocks) assert.ok(checkLabels(res.blocks.tabs.flatMap((t) => [t.label, ...t.items.map((i) => i.label)])).ok);
      if (bad === 'sleeveless') assert.ok(!items.some((i) => byId.get(i.id)?.sleeveless));
      if (bad === 'suit' || bad === 'formal_shoes') assert.ok(!items.some((i) => i.key === bad));
      if (bad === 'wool') assert.ok(!items.some((i) => byId.get(i.id)?.materials?.has('wool')));
      if (['red', 'yellow', 'orange', 'fuchsia'].includes(bad)) assert.ok(!items.some((i) => i.colors.includes(bad)), `color ${bad}`);
      if (bad === 'exceed_silently') assert.equal(res.state, 'over_budget');
      if (bad === 'out_of_stock_item') assert.ok(items.every((i) => byId.get(i.id).inStock));
    }
    if (ex.language === 'en') assert.ok(!/[؀-ۿ]/.test(res.say), `english say: ${res.say}`);
    if (ex.daypart === 'night') assert.ok(res.parsed.daypart === 'night' || res.debug?.eventTime?.isNight);
    if (ex.honest_message) assert.ok(!res.say.includes('جهزتلك') && /مش متاح|ملقتش|مفيش/.test(res.say), res.say);
    if (ex.products === false) assert.equal(res.blocks, null);
    if (ex.advice_id) assert.equal(res.adviceId, ex.advice_id);
    if (ex.intent && res.state === 'chat') assert.equal(res.intent, ex.intent);
    if (ex.tone === 'sober') assert.deepEqual([res.questions.length, (res.tips || []).length], [0, 0]);
    if (ex.weather_note) assert.ok(/الجو|°/.test(res.say) || (res.tips || []).length);
    assert.ok(checkText(res.say).ok || ex.language === 'en', `guard: ${res.say}`);
  });
}

test('condolence never appears unless asked', async () => {
  for (const msg of ['عايز لبس لمناسبة', 'عايز لبس رسمي', 'ايه الاوكازيون', 'عايزة فستان']) {
    const res = await runModa(msg, { products: rows, now: new Date('2026-10-12T19:30:00+03:00') });
    assert.ok(!JSON.stringify(res.questions).includes('عزاء') && res.parsed.context !== 'condolence', msg);
  }
});

test('shoe slang never gets confused with jackets', () => {
  for (const word of ['كوتشي', 'كوتش']) {
    assert.deepEqual(parseMessage(word).garments.map((g) => g.key), ['sneakers'], word);
  }
  assert.deepEqual(parseMessage('جاكيت').garments.map((g) => g.key), ['jacket']);
});

test('assistant display name is used in Arabic and English greeting replies', () => {
  const assistantName = { ar: 'ليلى', en: 'Laila' };
  const arabic = Array.from({ length: 20 }, (_, i) => respond({ state: 'chat', intent: 'greeting' }, { seed: `name-ar-${i}`, lang: 'ar', assistantName }).say);
  const english = respond({ state: 'chat', intent: 'greeting' }, { seed: 'name-en', lang: 'en', assistantName }).say;
  assert.ok(arabic.some((say) => /أنا ليلى/.test(say)));
  assert.ok(arabic.every((say) => !/مودة/.test(say)));
  assert.match(english, /I'm Laila/);
  assert.doesNotMatch(english, /Moda/);
});

test('Moda uses local product ratings to change future rankings', async () => {
  const products = enrichAll([
    { id: 1001, name_ar: 'كوتشي رياضي حريمي', department: 'women', price: 500, stock: 5, track_stock: 1, sold_count: 0, rating: 0 },
    { id: 1002, name_ar: 'كوتشي رياضي حريمي', department: 'women', price: 500, stock: 5, track_stock: 1, sold_count: 0, rating: 0 },
  ]);
  const opts = { products, now: new Date('2026-10-12T19:30:00+03:00') };
  const first = await runModa('عايزة كوتشي أسود', opts);
  const firstId = first.blocks.tabs[0].items[0].id;
  const rated = await runModa('عايزة كوتشي أسود', { ...opts, profile: { dislikedProductIds: String(firstId) } });
  assert.notEqual(rated.blocks.tabs[0].items[0].id, firstId);
});

test('partial couple reply clearly separates available items and hides zero totals', () => {
  const reply = respond({
    state: 'partial', intent: 'shop', persons: ['men', 'women'], context: 'engagement_guest',
    people: [
      { aud: 'men', look: null, picks: [{ slotKey: 'shirt', product: { id: 1, key: 'shirt', name_ar: 'قميص', price: 609, colorKeys: [] }, optional: false }], missing: [], subtotal: 609 },
      { aud: 'women', look: null, picks: [{ slotKey: 'heels_low', product: { id: 2, key: 'heels_low', name_ar: 'كعب واطي', price: 0, colorKeys: [] }, optional: false }], missing: [{ base: 'clutch' }], subtotal: 0 },
    ],
    total: 609, budget: null, over: 0, dropped: [], missing: [{ base: 'heels_low' }], relaxed: [], palette: [], ask: [],
    weather: { temp: 23, fabrics_ar: ['قطن', 'كريب'], band: 'warm', notes: [] }, eventTime: {},
  });
  assert.match(reply.say, /لقيت قطع مناسبة/);
  assert.match(reply.say, /سعر القطع المتاحة حاليًا: ليك 609 جنيه/);
  assert.doesNotMatch(reply.say, /ليها:? 0 جنيه|والاتنين/);
  assert.doesNotMatch(reply.say, /23/);
  assert.ok(reply.tips.some((tip) => /23 درجة/.test(tip)));
});

test('answer buttons continue the previous request', async () => {
  const now = new Date('2026-10-12T19:30:00+03:00');
  let r = await runModa('عايز لبس', { products: rows, now });
  assert.equal(r.state, 'clarify');
  r = await runModa('', { products: rows, now, session: r.session, answers: { who_is_it_for: 'men' } });
  assert.equal(r.state, 'clarify'); assert.ok(r.questions.some((q) => q.id === 'what_occasion'));
  r = await runModa('', { products: rows, now, session: r.session, answers: { what_occasion: 'wedding_guest' } });
  assert.equal(r.state, 'clarify'); assert.equal(r.questions[0]?.id, 'budget'); assert.equal(r.blocks, null);
  r = await runModa('', { products: rows, now, session: r.session, answers: { budget: [3000, 6000] } });
  assert.equal(r.state, 'clarify'); assert.equal(r.questions[0]?.id, 'time_if_dressy'); assert.equal(r.blocks, null);
  r = await runModa('', { products: rows, now, session: r.session, answers: { time_if_dressy: 'night' } });
  assert.ok(r.blocks.total <= 6000, String(r.blocks.total));
});

test('asks all required questions before showing recommendations', async () => {
  const now = new Date('2026-10-12T19:30:00+03:00');
  const first = await runModa('أنا وخطيبتي رايحين خطوبة عايزين طقم لينا الاتنين', { products: rows, now });
  assert.equal(first.state, 'clarify');
  assert.equal(first.questions[0]?.id, 'budget');
  assert.deepEqual(first.questions.map((q) => q.id), ['budget', 'time_if_dressy']);
  assert.equal(first.blocks, null);
  assert.equal(first.say, 'ميزانيتكم الإجمالية للطقمين تقريبًا كام؟');
  assert.deepEqual(first.session.shown, []);
  assert.equal(first.session.lastTotal, null);

  const final = await runModa('', { products: rows, now, session: first.session, answers: { budget: 'flexible', time_if_dressy: 'night' } });
  assert.notEqual(final.state, 'clarify');
  assert.ok(final.blocks?.tabs?.length, 'recommendations should appear only after the final answer');
  assert.equal(final.styleTips.length, 2, 'the two outfit suggestions should appear with the final recommendation');
});

test('track and running pants cannot match formal trousers', async () => {
  const sports = enrichAll([
    { id: 2001, name_ar: 'بنطلون قماش رجالي', name_en: 'Tapered Track Pants', department: 'men', price: 609, stock: 3, track_stock: 1 },
    { id: 2002, name_ar: 'بنطلون رجالي', name_en: 'Woven Running Pants', department: 'men', price: 569, stock: 3, track_stock: 1 },
  ], K);
  assert.deepEqual(sports.map((p) => p.key), ['sport_bottom', 'sport_bottom']);
  const result = await runModa('عايز بنطلون لفرح صاحبي بالليل والميزانية ١٠٠٠ جنيه', { products: sports, now: new Date('2026-10-12T19:30:00+03:00') });
  assert.equal(result.state, 'none');
  assert.equal(allItems(result).length, 0);
});

test('store Moda type override beats misleading product names and cannot make sportswear formal', () => {
  const [product] = enrichAll([
    { id: 2003, name_ar: 'بنطلون قماش رجالي', name_en: 'Tailored Formal Chinos', moda_key: 'sport_bottom', department: 'men', style_level: 5, price: 609, stock: 3, track_stock: 1 },
  ], K);
  assert.equal(product.key, 'sport_bottom');
  assert.equal(product.formality, 1);
});

test('cheaper followup lowers total', async () => {
  const now = new Date('2026-10-12T19:30:00+03:00');
  const a = await runModa('عايز لبس فرح صاحبي بالليل وميزانيتي ٦٠٠٠ جنيه', { products: rows, now });
  const b = await runModa('ارخص', { products: rows, now, session: a.session });
  assert.ok(b.blocks.total <= a.blocks.total, `${b.blocks.total} vs ${a.blocks.total}`);
});

test('llm fallback: only vocabulary values are accepted', async () => {
  const { makeLlmExtract } = await import('../src/lib/moda/llm.js');
  const now = new Date('2026-10-12T19:30:00+03:00');
  const good = makeLlmExtract(async () => '{"persons":["men"],"context":"casual_outing","garments":["shirt"]}');
  let r = await runModa('qwerty zxcv blorp', { products: rows, now, llmExtract: good });
  if (r.state === 'clarify' && r.questions?.[0]?.id === 'color_preference') r = await runModa('', { products: rows, now, session: r.session, answers: { color_preference: 'black' } });
  assert.equal(r.state === 'chat', false); assert.ok(r.blocks, 'should use extracted intent');
  const bad = makeLlmExtract(async () => '{"persons":["aliens"],"context":"condolence","garments":["spaceship"]}');
  r = await runModa('qwerty zxcv blorp', { products: rows, now, llmExtract: bad });
  assert.equal(r.state, 'chat'); assert.equal(r.blocks, null);
  const broken = makeLlmExtract(async () => { throw new Error('down'); });
  r = await runModa('qwerty zxcv blorp', { products: rows, now, llmExtract: broken });
  assert.equal(r.state, 'chat');
});

test('owned piece phrase prevents searching for it and coach jacket infers jacket', async () => {
  const parsed = parseMessage('عندي قميص أزرق سماوي، عايز كوتشي يليق عليه');
  assert.equal(parsed.ownedPieces[0]?.key, 'shirt');
  assert.equal(parsed.ownedPieces[0]?.color, 'sky_blue');
  assert.equal(parsed.garments[0]?.key, 'sneakers');
  assert.equal(parsed.garments.length, 1);

  const [coachJacket] = enrichAll([
    { id: 21, name_ar: 'جاكيت كوتش مبطّن', name_en: 'Fleece-Lined Coach Jacket', department: 'men', price: 1479, stock: 5, track_stock: 1 },
  ], K);
  assert.equal(coachJacket.key, 'jacket');

  const res = await runModa('عندي قميص أزرق سماوي، عايز كوتشي يليق عليه', { products: [coachJacket], now: new Date('2026-10-12T19:30:00+03:00') });
  const missing = res.blocks?.tabs?.[0]?.missing || [];
  assert.ok(missing.every((m) => m.key !== 'shirt'), 'owned shirt must not be in missing');
  assert.ok(missing.some((m) => m.key === 'sneakers'), 'sneakers should be missing');
  assert.match(missing[0].hint, /طلة/);
});

