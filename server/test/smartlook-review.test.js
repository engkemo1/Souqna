import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { parseChildSize, parseChildShoeSize, childOutfitGate } from '../src/lib/moda/childfit.js';
import { reviewLook, variantAvailability, acceptSmartLook, MIN_SCORE, requiredLookSlots, minimumPiecesForLook, heroKeyOf, missingSlots } from '../src/lib/moda/smartlook.js';

const WOMEN_KEYS = new Set(['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'jumpsuit', 'abaya', 'hijab_set', 'tarha', 'skirt', 'blouse', 'heels_low', 'heels_high', 'clutch']);
const piece = (id, key, o = {}) => ({ id, key, formality: 2, colorKeys: ['black'], inStock: true, gender: WOMEN_KEYS.has(key) ? 'women' : 'unisex', ...o });
const ok3 = () => [piece(1, 'tshirt', { colorKeys: ['white'] }), piece(2, 'jeans', { colorKeys: ['navy'] }), piece(3, 'sneakers', { colorKeys: ['white'] })];
const ctx = (o = {}) => ({ variantsOf: () => [], seasonOf: () => null, familyOf: (k) => (['watch', 'belt', 'cap'].includes(k) ? 'accessories' : 'tops'), month: 4, ...o });
const reasons = (r) => r.reasons.join('|');

test('a clean, consistent look passes with a high score', () => {
  const r = reviewLook(ok3(), ctx());
  assert.equal(r.ok, true); assert.ok(r.score >= MIN_SCORE);
});
test('fewer than three pieces (anchor + two) is never shown', () => {
  assert.equal(reviewLook(ok3().slice(0, 2), ctx()).ok, false);
});
for (const flag of ['typeConflict', 'colorConflict', 'audienceConflict', 'sizeConflict', 'notFashion']) {
  test(`${flag} is an outright rejection`, () => {
    const l = ok3(); l[1][flag] = true;
    const r = reviewLook(l, ctx()); assert.equal(r.ok, false); assert.match(reasons(r), new RegExp(flag.replace('Conflict', '_conflict').replace('notFashion', 'not_fashion')));
  });
}
test('a piece with no type is rejected', () => {
  const l = ok3(); l[0].key = null; assert.equal(reviewLook(l, ctx()).ok, false);
});
test('out of stock (product level) is rejected', () => {
  const l = ok3(); l[2].inStock = false; assert.equal(reviewLook(l, ctx()).ok, false);
});
test('variant stock: a product with variants but none in stock is rejected', () => {
  const r = reviewLook(ok3(), ctx({ variantsOf: (id) => (id === 2 ? [{ color: '#111111', size: 'M', stock: 0 }, { color: '#111111', size: 'L', stock: 0 }] : []) }));
  assert.equal(r.ok, false); assert.match(reasons(r), /no_variant_in_stock:2/);
});
test('variant stock: a shown colour without stock is fine when another colour has a size in stock', () => {
  const row = { inStock: true, colors_json: JSON.stringify([{ hex: '#AA0000' }, { hex: '#0000AA' }]) };
  assert.equal(variantAvailability(row, [{ color: '#aa0000', size: 'M', stock: 0 }, { color: '#0000aa', size: 'M', stock: 5 }]).ok, true);
  assert.equal(variantAvailability(row, [{ color: '#aa0000', size: 'M', stock: 0 }, { color: '#0000aa', size: 'L', stock: 0 }]).ok, false);
});
test('simple product without variants: product stock decides', () => {
  assert.equal(variantAvailability({ inStock: true }, []).ok, true);
  assert.equal(variantAvailability({ inStock: false }, []).ok, false);
});
test('photo_mismatch policy: the real path turns it into typeConflict (hard rejection); the -25 is only a fallback for un-enriched rows', () => {
  const row = { id: 9, name_ar: 'جينز أسود مستقيم', name_en: 'Straight Fit Black Jeans', moda_key: 'jeans', department: 'men', audience: 'men', colors_json: '[{"hex":"#1C1C1E","name_ar":"أسود","name_en":"Black"}]', price: 800, track_stock: 1, stock: 5, photo_mismatch: 1 };
  const e = enrichProduct(row, loadKnowledge());
  assert.equal(e.typeConflict, true, 'enrichProduct must flag it as a type conflict');
  const l = ok3(); l[1] = { ...l[1], typeConflict: e.typeConflict };
  assert.equal(reviewLook(l, ctx()).ok, false);
  const raw = ok3(); raw[1].photo_mismatch = 1; // un-enriched fallback only
  const r = reviewLook(raw, ctx()); assert.equal(r.ok, false); assert.equal(r.score, 75); assert.match(reasons(r), /photo_mismatch:2/);
});
test('KNOWN CASE (documented, not a rule): pink linen trousers + white sneakers + belt + puffer jacket passes at exactly the bar', () => {
  // Real finding from the local run. Left as-is on purpose: a material/layer rule could block good looks; collect more
  // examples first (smart_look_events: event=shown, score=80). If this test starts failing, a rule changed behaviour — review it.
  const l = [piece(1, 'trousers', { formality: 4, colorKeys: ['pink'] }), piece(2, 'shirt', { formality: 4, colorKeys: ['white'] }), piece(3, 'sneakers', { formality: 2, colorKeys: ['white'] }), piece(4, 'belt', { formality: 4, colorKeys: ['brown'] }), piece(5, 'jacket', { formality: 3, colorKeys: ['black'] })];
  const r = reviewLook(l, ctx({ familyOf: (k) => (k === 'belt' ? 'accessories' : 'tops'), month: 11 }));
  assert.equal(r.score, 80); assert.equal(r.ok, true);
});
test('missing colour or formality information lowers the score (never guessed)', () => {
  const l = ok3(); l[0].colorKeys = []; const r = reviewLook(l, ctx()); assert.equal(r.ok, false); assert.match(reasons(r), /unknown_color/);
  const m = ok3(); m[1].formality = null; assert.equal(reviewLook(m, ctx()).ok, false);
});
test('denim wash and colour-free accessories are not "unknown colour"', () => {
  const l = [piece(1, 'tshirt', { colorKeys: ['white'] }), piece(2, 'jeans', { colorKeys: [] }), piece(3, 'sneakers', { colorKeys: ['white'] }), piece(4, 'watch', { colorKeys: [] })];
  const r = reviewLook(l, ctx()); assert.equal(r.ok, true); assert.doesNotMatch(reasons(r), /unknown_color/);
  const t = ok3(); t[0].colorKeys = []; assert.equal(reviewLook(t, ctx()).ok, false);
});
test('formality: spread of 3+ is rejected, a spread of 2 is penalised', () => {
  const a = ok3(); a[0].formality = 5; a[1].formality = 2; assert.equal(reviewLook(a, ctx()).ok, false);
  const b = ok3(); b[0].formality = 4; b[1].formality = 2; const r = reviewLook(b, ctx()); assert.equal(r.score, 80); assert.match(reasons(r), /formality_spread:2/);
});
test('season: winter piece with a summer piece is rejected; winter piece in summer heat is penalised heavily', () => {
  const seasons = { tshirt: 'summer', jeans: null, sneakers: 'winter' };
  assert.equal(reviewLook(ok3(), ctx({ seasonOf: (k) => seasons[k] })).ok, false);
  const r = reviewLook(ok3(), ctx({ seasonOf: (k) => (k === 'jeans' ? 'winter' : null), month: 7 })); assert.equal(r.ok, false); assert.match(reasons(r), /winter_piece_in_heat/);
  assert.equal(reviewLook(ok3(), ctx({ seasonOf: (k) => (k === 'jeans' ? 'winter' : null), month: 1 })).ok, true);
});
test('duplicate type is rejected', () => {
  const l = ok3(); l[2].key = 'jeans'; assert.equal(reviewLook(l, ctx()).ok, false);
});
test('more than two accessories is penalised', () => {
  const l = [...ok3(), piece(4, 'watch'), piece(5, 'belt'), piece(6, 'cap')];
  const r = reviewLook(l, ctx()); assert.match(reasons(r), /too_many_accessories:3/); assert.equal(r.ok, false);
});
test('colours: three loud hues or a clashing pair are rejected; neutrals are fine', () => {
  const loud = [piece(1, 'tshirt', { colorKeys: ['red'] }), piece(2, 'jeans', { colorKeys: ['green'] }), piece(3, 'sneakers', { colorKeys: ['yellow'] })];
  assert.equal(reviewLook(loud, ctx()).ok, false);
  const clash = [piece(1, 'tshirt', { colorKeys: ['red'] }), piece(2, 'jeans', { colorKeys: ['pink'] }), piece(3, 'sneakers', { colorKeys: ['white'] })];
  const r = reviewLook(clash, ctx()); assert.equal(r.ok, false); assert.match(reasons(r), /clash:red\+pink/);
  const neutral = [piece(1, 'tshirt', { colorKeys: ['black'] }), piece(2, 'jeans', { colorKeys: ['navy'] }), piece(3, 'sneakers', { colorKeys: ['white'] })];
  assert.equal(reviewLook(neutral, ctx()).ok, true);
});
test('acceptSmartLook still rejects the same type twice and the anchor type', () => {
  const r = (keys) => ({ state: 'full', missing: [], blocks: { over: 0, total: 100, tabs: [{ items: keys.map((k, i) => ({ id: i + 1, key: k })) }] } });
  const o = { anchorId: 99, anchorKey: 'tshirt' };
  assert.equal(acceptSmartLook(r(['jeans', 'sneakers']), o).ok, true);
  assert.equal(acceptSmartLook(r(['jeans', 'jeans']), o).ok, false);
  assert.equal(acceptSmartLook(r(['tshirt', 'jeans']), o).ok, false);
});

// ---- slot-based completeness: the hero garment decides what a complete look needs ----
const P = (id, key, color = 'black', o = {}) => piece(id, key, { colorKeys: [color], ...o });
const why = (r) => r.reasons.join('|');
test('templates: required slots per hero, and the minimum piece count follows from them', () => {
  assert.deepEqual(requiredLookSlots('dress_party').slots, ['footwear']);
  assert.deepEqual(requiredLookSlots('abaya').slots, ['hijab_or_footwear']);
  assert.deepEqual(requiredLookSlots('hoodie').slots, ['bottom', 'footwear']);
  assert.deepEqual(requiredLookSlots('jeans').slots, ['top', 'footwear']);
  assert.deepEqual(requiredLookSlots('suit').slots, ['shirt', 'formal_footwear']);
  assert.equal(requiredLookSlots('watch'), null);
  assert.equal(minimumPiecesForLook('dress_casual'), 2);
  assert.equal(minimumPiecesForLook('shirt'), 3);
  assert.equal(minimumPiecesForLook('watch'), 3, 'no template: legacy minimum of three');
});
test('dress + shoes is a complete look (two pieces)', () => {
  const r = reviewLook([P(1, 'dress_casual', 'navy'), P(2, 'heels_low', 'beige')], ctx());
  assert.equal(r.ok, true, why(r));
});
test('dress + shoes + bag is fine too, but the bag is never required', () => {
  assert.equal(reviewLook([P(1, 'dress_party', 'black'), P(2, 'heels_high', 'black'), P(3, 'handbag', 'black')], ctx()).ok, true);
});
test('abaya + hijab/scarf is a complete look (two pieces)', () => {
  const r = reviewLook([P(1, 'abaya', 'black'), P(2, 'hijab_set', 'black')], ctx());
  assert.equal(r.ok, true, why(r));
});
test('a dress alone is not a complete look', () => {
  const r = reviewLook([P(1, 'dress_casual', 'navy')], ctx());
  assert.equal(r.ok, false);
});
test('dress + a bag only (no footwear) is rejected: accessories never replace a required slot', () => {
  const r = reviewLook([P(1, 'dress_casual', 'navy'), P(2, 'handbag', 'black')], ctx({ familyOf: (k) => (k === 'handbag' ? 'bags' : 'dresses') }));
  assert.equal(r.ok, false); assert.match(why(r), /missing_slot:footwear/);
});
test('shirt + trousers only is rejected: footwear is missing', () => {
  const r = reviewLook([P(1, 'shirt', 'white'), P(2, 'trousers', 'navy')], ctx());
  assert.equal(r.ok, false); assert.match(why(r), /missing_slot:footwear/);
});
test('trousers + top only is rejected when the trousers are the hero: footwear is missing', () => {
  const r = reviewLook([P(1, 'trousers', 'navy'), P(2, 'tshirt', 'white')], ctx({ heroKey: 'trousers' }));
  assert.equal(r.ok, false); assert.match(why(r), /missing_slot:footwear/);
});
test('hoodie + trousers + sneakers is accepted', () => {
  const r = reviewLook([P(1, 'hoodie', 'grey'), P(2, 'trousers', 'navy'), P(3, 'sneakers', 'white')], ctx());
  assert.equal(r.ok, true, why(r));
});
test('skirt hero needs a top and footwear', () => {
  assert.equal(reviewLook([P(1, 'skirt', 'navy'), P(2, 'blouse', 'white')], ctx({ heroKey: 'skirt' })).ok, false);
  assert.equal(reviewLook([P(1, 'skirt', 'navy'), P(2, 'blouse', 'white'), P(3, 'flats', 'beige')], ctx({ heroKey: 'skirt' })).ok, true);
});
test('suit + shirt + formal shoes is accepted; suit + shirt + sneakers is rejected', () => {
  const f = (shoe) => reviewLook([P(1, 'suit', 'navy', { formality: 4 }), P(2, 'shirt', 'white', { formality: 4 }), P(3, shoe, 'black', { formality: shoe === 'sneakers' ? 2 : 4 })], ctx());
  assert.equal(f('formal_shoes').ok, true, why(f('formal_shoes')));
  const bad = f('sneakers'); assert.equal(bad.ok, false); assert.match(why(bad), /missing_slot:formal_footwear/);
});
test('suit + shirt without shoes is rejected', () => {
  const r = reviewLook([P(1, 'suit', 'navy', { formality: 4 }), P(2, 'shirt', 'white', { formality: 4 })], ctx());
  assert.equal(r.ok, false); assert.match(why(r), /missing_slot:formal_footwear/);
});
test('a hero type with no template (watch) keeps the legacy three-piece minimum', () => {
  assert.equal(reviewLook([P(1, 'watch', 'black'), P(2, 'tshirt', 'white')], ctx()).ok, false);
});
test('the hero is the garment, not the accessory: a belt + top + trousers + shoes uses the top template', () => {
  assert.equal(heroKeyOf([P(1, 'belt'), P(2, 'tshirt'), P(3, 'jeans'), P(4, 'sneakers')]), 'tshirt');
  assert.deepEqual(missingSlots([P(1, 'tshirt'), P(2, 'jeans')], 'tshirt'), ['footwear']);
});
test('a smaller look still has to pass every other safety rule (stock, colour, season, duplicates)', () => {
  const dead = reviewLook([P(1, 'dress_casual', 'navy'), P(2, 'heels_low', 'beige')], ctx({ variantsOf: (id) => (id === 2 ? [{ color: '#000', size: '38', stock: 0 }] : []) }));
  assert.equal(dead.ok, false); assert.match(why(dead), /no_variant_in_stock:2/);
  const conflict = reviewLook([P(1, 'dress_casual', 'navy'), P(2, 'heels_low', 'beige', { sizeConflict: true })], ctx());
  assert.equal(conflict.ok, false);
  const twoShoes = reviewLook([P(1, 'dress_casual', 'navy'), P(2, 'heels_low', 'beige'), P(3, 'heels_low', 'black')], ctx());
  assert.equal(twoShoes.ok, false); assert.match(why(twoShoes), /duplicate_type/);
  const season = reviewLook([P(1, 'dress_casual', 'navy'), P(2, 'boots', 'black')], ctx({ seasonOf: (k) => (k === 'boots' ? 'winter' : k === 'dress_casual' ? 'summer' : null), month: 12 }));
  assert.equal(season.ok, false);
  const clash = reviewLook([P(1, 'dress_casual', 'red'), P(2, 'heels_low', 'pink')], ctx());
  assert.equal(clash.ok, false, 'colour harmony still applies to two-piece looks');
});
test('acceptSmartLook: a dress anchor needs only one other piece, a shirt anchor still needs two', () => {
  const res = (n) => ({ state: 'full', missing: [], blocks: { total: 100, over: 0, tabs: [{ items: Array.from({ length: n }, (_, i) => ({ id: 10 + i, key: ['heels_low', 'handbag', 'watch'][i] })) }] } });
  assert.equal(acceptSmartLook(res(1), { anchorId: 1, anchorKey: 'dress_casual', minPieces: minimumPiecesForLook('dress_casual') - 1 }).ok, true);
  assert.equal(acceptSmartLook(res(1), { anchorId: 1, anchorKey: 'shirt', minPieces: minimumPiecesForLook('shirt') - 1 }).ok, false);
  assert.equal(acceptSmartLook(res(2), { anchorId: 1, anchorKey: 'shirt', minPieces: minimumPiecesForLook('shirt') - 1 }).ok, true);
});

// ---- audience: one outfit = one audience; unknown or contradictory = rejected ----
const M = (id, key, color = 'black', o = {}) => piece(id, key, { colorKeys: [color], gender: 'men', ...o });
const Wm = (id, key, color = 'black', o = {}) => piece(id, key, { colorKeys: [color], gender: 'women', ...o });
const Kd = (id, key, color = 'black', o = {}) => piece(id, key, { colorKeys: [color], gender: 'boys', ...o });
test("men's shirt + men's trousers + men's shoes is accepted", () => {
  const r = reviewLook([M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), M(3, 'sneakers', 'white')], ctx({ audience: 'men' }));
  assert.equal(r.ok, true, why(r));
});
test("women's dress + women's shoes is accepted", () => {
  const r = reviewLook([Wm(1, 'dress_casual', 'navy'), Wm(2, 'heels_low', 'beige')], ctx({ audience: 'women' }));
  assert.equal(r.ok, true, why(r));
});
test("a men's outfit containing a women's product is rejected", () => {
  const r = reviewLook([M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), Wm(3, 'heels_low', 'black')], ctx({ audience: 'men' }));
  assert.equal(r.ok, false); assert.match(why(r), /audience_mismatch/);
  const noAudience = reviewLook([M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), Wm(3, 'heels_low', 'black')], ctx());
  assert.equal(noAudience.ok, false, 'the mix is caught even without a requested audience');
});
test("a women-only product labelled unisex is still kept out of a men's look", () => {
  const r = reviewLook([M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), piece(3, 'heels_low', { gender: 'unisex' })], ctx({ audience: 'men' }));
  assert.equal(r.ok, false); assert.match(why(r), /audience_mismatch:3/);
});
test("a hijab piece never joins a men's look; a hijabi women's look stays women-only", () => {
  assert.equal(reviewLook([M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), Wm(3, 'hijab_set', 'black')], ctx({ audience: 'men' })).ok, false);
  assert.equal(reviewLook([Wm(1, 'abaya', 'black'), Wm(2, 'hijab_set', 'black')], ctx({ audience: 'women' })).ok, true);
  assert.equal(reviewLook([Wm(1, 'abaya', 'black'), M(2, 'sneakers', 'white')], ctx({ audience: 'women' })).ok, false, "a men's product in a women's look");
});
test("a women's outfit containing a child product is rejected", () => {
  const r = reviewLook([Wm(1, 'dress_casual', 'navy'), Kd(2, 'sneakers', 'white')], ctx({ audience: 'women' }));
  assert.equal(r.ok, false); assert.match(why(r), /audience_mismatch/);
});
test('a child outfit containing any adult (or adult-unisex) product is rejected', () => {
  const kidsV = (id) => [{ id: id * 10, color: '#000', size: '6 سنين', stock: 3 }];
  const base = [Kd(1, 'tshirt', 'white'), Kd(2, 'jeans', 'navy')];
  const vo = (id) => kidsV(id);
  assert.equal(reviewLook([...base, Kd(3, 'sneakers', 'white', { sizes_json: '[]' })], ctx({ variantsOf: (id) => (id === 3 ? [{ id: 31, size: '30', stock: 2 }] : kidsV(id)) })).ok, true);
  const adultShoes = reviewLook([...base, M(3, 'sneakers', 'white')], ctx({ variantsOf: (id) => (id === 3 ? [{ id: 31, size: '42', stock: 2 }] : vo(id)) }));
  assert.equal(adultShoes.ok, false); assert.match(why(adultShoes), /audience_mismatch:3|child_age_unknown:3/);
  const unisexWatch = reviewLook([...base, Kd(3, 'sneakers', 'white'), piece(4, 'watch', { gender: 'unisex' })], ctx({ variantsOf: (id) => (id === 3 ? [{ id: 31, size: '30', stock: 2 }] : vo(id)) }));
  assert.equal(unisexWatch.ok, false, 'an adult-unisex accessory is not a child product');
});
test('unknown audience is rejected, never guessed', () => {
  const r = reviewLook([M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), M(3, 'sneakers', 'white', { gender: undefined })], ctx());
  assert.equal(r.ok, false); assert.match(why(r), /audience_unknown:3/);
});
test('boys and girls never share one outfit', () => {
  const vo = () => [{ id: 1, size: '6 سنين', stock: 2 }];
  assert.equal(reviewLook([Kd(1, 'tshirt'), piece(2, 'skirt', { gender: 'girls' }), Kd(3, 'sneakers')], ctx({ variantsOf: (id) => (id === 3 ? [{ id: 9, size: '30', stock: 2 }] : vo()) })).ok, false);
});

// ---- adult sizes: the shirt, trouser and shoe scales are unrelated and are never compared ----
test("adult looks: shirt L + trousers 34 + shoes 43 never conflict with each other; each piece only needs a purchasable variant", () => {
  const v = { 1: [{ id: 11, size: 'L', stock: 4 }], 2: [{ id: 21, size: '34', stock: 3 }], 3: [{ id: 31, size: '43', stock: 1 }] };
  const r = reviewLook([M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), M(3, 'sneakers', 'white')], ctx({ audience: 'men', variantsOf: (id) => v[id] }));
  assert.equal(r.ok, true, why(r)); assert.equal(r.child, undefined);
});
test('explicit shopper sizes are validated per category, independently', () => {
  const v = { 1: [{ id: 11, size: 'L', stock: 4 }, { id: 12, size: 'M', stock: 4 }], 2: [{ id: 21, size: '34', stock: 3 }], 3: [{ id: 31, size: '43', stock: 1 }, { id: 32, size: '44', stock: 0 }] };
  const look = () => [M(1, 'shirt', 'white'), M(2, 'trousers', 'navy'), M(3, 'sneakers', 'white')];
  assert.equal(reviewLook(look(), ctx({ variantsOf: (id) => v[id], wantedSizes: { top: 'L', bottom: '34', shoes: '43' } })).ok, true);
  const bad = reviewLook(look(), ctx({ variantsOf: (id) => v[id], wantedSizes: { top: 'L', bottom: '34', shoes: '44' } }));
  assert.equal(bad.ok, false); assert.match(why(bad), /size_unavailable:shoes:3/);
  const badTop = reviewLook(look(), ctx({ variantsOf: (id) => v[id], wantedSizes: { top: 'XL' } }));
  assert.equal(badTop.ok, false); assert.match(why(badTop), /size_unavailable:top:1/);
});

// ---- children's outfits: one common age band, explicit sizes, in-stock variant per piece ----
const kv = (...rows) => (id) => rows.find(([i]) => i === id)?.[1] || [];
const sv = (size, stock = 3, id = Math.floor(Math.random() * 1e6)) => ({ id, color: '#000', size, stock });
const kidLook = (vm, extra = {}) => reviewLook([Kd(1, 'jacket', 'navy', extra.j), Kd(2, 'jeans', 'navy', extra.p), Kd(3, 'sneakers', 'white', extra.s)], ctx({ variantsOf: (id) => vm[id] || [], audience: 'boys' }));
test('size parsing: explicit child ages only; "أطفال" and plain numbers are not ages', () => {
  assert.deepEqual([24, 47], [parseChildSize('2-3 years').minAgeMonths, parseChildSize('2-3 years').maxAgeMonths]);
  assert.equal(parseChildSize('2-3 سنة').minAgeMonths, 24); assert.equal(parseChildSize('من 2 إلى 3 سنين').maxAgeMonths, 47);
  assert.equal(parseChildSize('6 سنين').minAgeMonths, 72); assert.equal(parseChildSize('سن 6').minAgeMonths, 72); assert.equal(parseChildSize('٦ سنين').minAgeMonths, 72);
  assert.deepEqual([12, 18], [parseChildSize('12-18 شهر').minAgeMonths, parseChildSize('12-18 شهر').maxAgeMonths]);
  assert.equal(parseChildSize('أطفال'), null); assert.equal(parseChildSize('M'), null); assert.equal(parseChildSize('42'), null);
  assert.equal(parseChildShoeSize('42'), null, 'EU 42 is an adult shoe size, never a child band');
  assert.ok(parseChildShoeSize('32-37').minAgeMonths >= 84, 'a broad shoe range is a broad older-child range');
});
test('BUG CASE: jacket 2–3 years + jeans 6 years + EU 32–37 shoes is rejected', () => {
  const r = kidLook({ 1: [sv('2-3 سنين')], 2: [sv('6 سنين')], 3: ['32', '33', '34', '35', '36', '37'].map((x) => sv(x)) });
  assert.equal(r.ok, false); assert.match(why(r), /child_age_mismatch/);
});
test('same ages but shoes from a much older range: child_shoe_size_mismatch', () => {
  const r = kidLook({ 1: [sv('6 سنين')], 2: [sv('6 سنين')], 3: ['34', '35', '36', '37'].map((x) => sv(x)) });
  assert.equal(r.ok, false); assert.match(why(r), /child_shoe_size_mismatch:3/);
});
test('child jacket 6y + jeans 6y + compatible in-stock kids shoes is accepted, with the recommended sizes', () => {
  const r = kidLook({ 1: [sv('6 سنين', 2, 11)], 2: [sv('6 سنين', 1, 21)], 3: [sv('30', 4, 31), sv('36', 4, 32)] });
  assert.equal(r.ok, true, why(r));
  assert.deepEqual(r.child.picks.map((x) => [x.id, x.size, x.left]), [[1, '6 سنين', 2], [2, '6 سنين', 1], [3, '30', 4]]);
  assert.equal(r.child.picks[2].variantId, 31);
});
test('overlapping age ranges are accepted only when the intersection is valid', () => {
  assert.equal(kidLook({ 1: [sv('5-6 سنين')], 2: [sv('6-7 سنين')], 3: [sv('30')] }).ok, true, '5–6 and 6–7 share age 6');
  assert.equal(kidLook({ 1: [sv('2-3 سنين')], 2: [sv('4-5 سنين')], 3: [sv('26')] }).ok, false, '2–3 and 4–5 never share an age');
});
test('a child product with unknown age/size is rejected from full outfits', () => {
  const r = kidLook({ 1: [sv('أطفال')], 2: [sv('6 سنين')], 3: [sv('30')] });
  assert.equal(r.ok, false); assert.match(why(r), /child_age_unknown:1/);
});
test('explicit age in the description is used when the size label is only "أطفال" (never shown as the size)', () => {
  const r = kidLook({ 1: [sv('أطفال', 1, 11)], 2: [sv('6 سنين')], 3: [sv('30')] }, { j: { description_ar: 'اولادي اسود كتان مقاس ٦ سنه' } });
  assert.equal(r.ok, true, why(r));
  assert.equal(r.child.picks[0].size, '6 سنين'); assert.equal(r.child.picks[0].left, 1);
});
test('an adult shoe is never treated as a child shoe', () => {
  assert.equal(childOutfitGate([M(1, 'shirt'), M(2, 'trousers'), M(3, 'sneakers')], { variantsOf: () => [sv('36')] }), null, 'no child piece: the gate does not apply');
  const r = kidLook({ 1: [sv('6 سنين')], 2: [sv('6 سنين')], 3: [sv('42')] }, { s: { gender: 'men' } });
  assert.equal(r.ok, false);
});
test('only out-of-range or out-of-stock variants: rejected', () => {
  const gone = kidLook({ 1: [sv('6 سنين')], 2: [sv('6 سنين', 0), sv('2-3 سنين', 5)], 3: [sv('30')] });
  assert.equal(gone.ok, false); assert.match(why(gone), /child_size_variant_unavailable/);
  const allGone = kidLook({ 1: [sv('6 سنين')], 2: [sv('6 سنين')], 3: [sv('30', 0)] });
  assert.equal(allGone.ok, false);
});
test('a child look still fails every other safety rule (type conflict)', () => {
  const r = kidLook({ 1: [sv('6 سنين')], 2: [sv('6 سنين')], 3: [sv('30')] }, { p: { typeConflict: true } });
  assert.equal(r.ok, false); assert.match(why(r), /type_conflict:2/);
});
test('child shoes outside the documented EU table (38+) are rejected but logged as child_shoe_size_unmapped, so older-children shoes can be measured', () => {
  const r = kidLook({ 1: [sv('10 سنين')], 2: [sv('10 سنين')], 3: [sv('38'), sv('39')] });
  assert.equal(r.ok, false); assert.match(why(r), /child_shoe_size_unmapped:3/);
});
test('stock tracking OFF: variant counts of 0 do not make a product unavailable (the shop sells it without counting), exactly like the product page', () => {
  const zero = [{ id: 1, color: '#000', size: 'L', stock: 0 }, { id: 2, color: '#000', size: 'XL', stock: 0 }];
  assert.equal(variantAvailability({ inStock: true, track_stock: 0 }, zero).ok, true);
  assert.equal(variantAvailability({ inStock: true, track_stock: 1 }, zero).ok, false, 'tracked products still need a variant in stock');
  const l = [M(1, 'jacket', 'brown', { track_stock: 0 }), M(2, 'trousers', 'black'), M(3, 'sneakers', 'white')];
  const r = reviewLook(l, ctx({ audience: 'men', variantsOf: (id) => (id === 1 ? zero : []) }));
  assert.equal(r.ok, true, why(r));
  const wanted = reviewLook(l, ctx({ audience: 'men', wantedSizes: { top: 'L' }, variantsOf: (id) => (id === 1 ? zero : []) }));
  assert.equal(wanted.ok, true, 'explicit size is not blocked by an untracked 0 count');
});
