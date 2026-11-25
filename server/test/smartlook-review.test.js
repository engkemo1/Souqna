import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { reviewLook, variantAvailability, acceptSmartLook, MIN_SCORE, requiredLookSlots, minimumPiecesForLook, heroKeyOf, missingSlots } from '../src/lib/moda/smartlook.js';

const piece = (id, key, o = {}) => ({ id, key, formality: 2, colorKeys: ['black'], inStock: true, ...o });
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
