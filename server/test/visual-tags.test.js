import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichProduct } from '../src/lib/moda/products.js';
import { loadKnowledge } from '../src/lib/moda/knowledge.js';
import { reviewLook } from '../src/lib/moda/smartlook.js';
import { readFileSync } from 'node:fs';
import { inferVisualTags, visualTagsOf, visualOutfitCheck, visualGateConfig, coverageOf, CLEAR_VISUAL_REASONS } from '../src/lib/moda/visualtags.js';
import { enrichAll } from '../src/lib/moda/products.js';
import { reviewSnapshot, evaluateReviews } from '../src/lib/moda/golden.js';

const K = loadKnowledge();
let n = 100;
const P = (name, o = {}) => {
  const e = enrichProduct({ id: ++n, name_en: name, name_ar: o.name_ar || '', description_en: o.desc || '', description_ar: '', price: 500, track_stock: 0, stock: 5, colors_json: o.colors || '[]', ...(o.row || {}) }, K);
  return { ...e, gender: 'men', inStock: true, colorKeys: o.colorKeys || ['black'], formality: o.formality ?? e.formality ?? 2, ...(o.over || {}) };
};
const ctx = (o = {}) => ({ variantsOf: () => [], seasonOf: () => null, familyOf: () => null, month: 4, audience: 'men', visual: true, heroKey: 'jacket', ...o });
const trousers = () => P('Men chino trousers plain', { colorKeys: ['beige'], over: { key: 'chinos', formality: 2 } });
const shoes = () => P('Men white sneakers', { colorKeys: ['white'], over: { key: 'sneakers', formality: 2 } });
const plaidJacket = () => P('Men dark plaid workwear jacket', { colorKeys: ['black'], over: { key: 'jacket' } });
const skull = () => P('Men skull graphic streetwear sweatshirt', { colorKeys: ['black'], over: { key: 'sweater' } });
const plainTop = (c = 'olive') => P('Men plain cotton tee', { colorKeys: [c], over: { key: 'tshirt' } });
const why = (r) => r.reasons.join('|');

test('text tags: plaid jacket is plaid / smart_casual / outerwear, skull sweatshirt is graphic / high / streetwear / base', () => {
  const j = inferVisualTags(plaidJacket()); assert.equal(j.pattern, 'plaid'); assert.equal(j.styleTier, 'smart_casual'); assert.equal(j.layerRole, 'outerwear'); assert.equal(j.source, 'text');
  const s = inferVisualTags(skull()); assert.equal(s.pattern, 'graphic'); assert.equal(s.visualLoudness, 'high'); assert.equal(s.styleTier, 'streetwear'); assert.equal(s.layerRole, 'base');
});
test('the exact failure: dark plaid jacket + skull graphic sweatshirt is rejected', () => {
  const r = reviewLook([plaidJacket(), skull(), trousers(), shoes()], ctx());
  assert.equal(r.ok, false); assert.match(why(r), /plaid_graphic_conflict/); assert.match(why(r), /style_tier_mismatch/);
});
test('the sweatshirt stays a valid adult men\'s product (not reclassified as kids)', () => {
  const s = skull(); assert.equal(s.gender, 'men'); assert.notEqual(s.key, null); assert.equal(s.audienceConflict, false);
});
for (const c of ['black', 'off_white', 'beige', 'olive']) {
  test(`plaid jacket + plain ${c} top + trousers + shoes is accepted`, () => {
    const r = reviewLook([plaidJacket(), plainTop(c), trousers(), shoes()], ctx());
    assert.equal(r.ok, true, why(r));
  });
}
test('plaid jacket + subtle plain tee is accepted', () => {
  const r = reviewLook([plaidJacket(), P('Men subtle tonal print tee', { colorKeys: ['white'], over: { key: 'tshirt' } }), trousers(), shoes()], ctx());
  assert.equal(r.ok, true, why(r));
});
test('plain black streetwear jacket + graphic sweatshirt in an all-streetwear look may pass', () => {
  const jacket = P('Men plain black streetwear bomber jacket', { over: { key: 'jacket' } });
  const pants = P('Men baggy streetwear cargo trousers plain', { colorKeys: ['black'], over: { key: 'trousers' } });
  const kicks = P('Men streetwear chunky sneakers', { colorKeys: ['white'], over: { key: 'sneakers' } });
  const r = reviewLook([jacket, skull(), pants, kicks], ctx());
  assert.equal(r.ok, true, why(r));
});
test('two loud upper-body pieces are rejected', () => {
  const a = P('Men large bold graphic hoodie', { over: { key: 'hoodie' } });
  const b = P('Men skull graphic print jacket', { over: { key: 'jacket' } });
  const r = reviewLook([b, a, trousers(), shoes()], ctx());
  assert.equal(r.ok, false); assert.match(why(r), /upper_body_visual_competition/);
});
test('plaid + stripe on the upper body is a pattern conflict', () => {
  const r = reviewLook([plaidJacket(), P('Men striped long sleeve tee', { over: { key: 'tshirt' } }), trousers(), shoes()], ctx());
  assert.equal(r.ok, false); assert.match(why(r), /pattern_conflict/);
});
test('unknown visual tags on an upper-body piece: not auto-accepted', () => {
  const r = reviewLook([plaidJacket(), P('Men cotton tee', { over: { key: 'tshirt' } }), trousers(), shoes()], ctx());
  assert.equal(r.ok, false); assert.match(why(r), /visual_tags_unknown/);
});
test('without the visual flag (plain search paths / old callers) the check is not applied', () => {
  const r = reviewLook([plaidJacket(), skull(), trousers(), shoes()], ctx({ visual: false }));
  assert.doesNotMatch(why(r), /plaid_graphic|visual_tags/);
});
test('unknown bottoms and shoes do not block (only upper body needs reliable tags)', () => {
  const r = visualOutfitCheck([plaidJacket(), plainTop(), P('Men trousers', { over: { key: 'trousers' } }), P('Men shoes', { over: { key: 'sneakers' } })]);
  assert.deepEqual(r.hard, []);
});
test('admin correction overrides inferred tags and counts as reliable', () => {
  const tee = P('Men cotton tee', { over: { key: 'tshirt', vtags_json: JSON.stringify({ pattern: 'plain', visualLoudness: 'low', source: 'admin' }) } });
  const t = visualTagsOf(tee); assert.equal(t.pattern, 'plain'); assert.equal(t.source, 'admin'); assert.equal(t.confidence, 'high'); assert.equal(t.reliable, true);
  assert.equal(reviewLook([plaidJacket(), tee, trousers(), shoes()], ctx()).ok, true);
  // an admin correction can also flip a text guess: the "plain" tee is really graphic
  const fixed = P('Men plain tee', { over: { key: 'tshirt', vtags_json: JSON.stringify({ pattern: 'graphic', visualLoudness: 'high', source: 'admin' }) } });
  assert.match(why(reviewLook([plaidJacket(), fixed, trousers(), shoes()], ctx())), /plaid_graphic_conflict/);
});
test('golden fixture: the jacket + skull sweatshirt case, frozen, is a human "reject" the reviewer blocks', () => {
  const pieces = [plaidJacket(), skull(), trousers(), shoes()];
  const snap = { v: 1, month: 4, heroKey: 'jacket', audience: 'men', season: {}, family: {}, pieces: pieces.map((p) => ({ ...p, variants: [] })) };
  assert.equal(reviewSnapshot(snap).ok, false);
  const ev = evaluateReviews([{ id: 1, verdict: 'reject', reasons: ['color', 'occasion'], snapshot: snap }]);
  assert.equal(ev.trueBlock, 1); assert.equal(ev.badPass, 0);
});

// ---- rollout safety -------------------------------------------------------------------------------------------------
test('gate default rejects clear tagged clashes and observes unknown tags', () => {
  assert.deepEqual(visualGateConfig({}), { mode: 'enforce', visual: CLEAR_VISUAL_REASONS, observe: true });
  assert.equal(visualGateConfig({ VISUAL_GATE: '0' }).observe, false);
  const e = visualGateConfig({ VISUAL_GATE: '1' }); assert.equal(e.mode, 'enforce'); assert.deepEqual(e.visual, CLEAR_VISUAL_REASONS);
  assert.deepEqual(visualGateConfig({ VISUAL_GATE: '1', VISUAL_ENFORCE: 'plaid_graphic_conflict,visual_tags_unknown' }).visual, ['plaid_graphic_conflict', 'visual_tags_unknown']);
  assert.equal(visualGateConfig({ VISUAL_GATE: 'full' }).visual, true);
});
test('shadow mode: the look is NOT hidden, but the would-be rejection and the missing tags are reported', () => {
  const l = [plaidJacket(), skull(), trousers(), shoes()];
  const r = reviewLook(l, ctx({ visual: false, visualObserve: true }));
  assert.equal(r.ok, true, why(r)); assert.ok(r.visual.observed.includes('plaid_graphic_conflict')); assert.deepEqual(r.visual.enforced, []);
  const unk = reviewLook([plaidJacket(), P('Men cotton tee', { over: { key: 'tshirt' } }), trousers(), shoes()], ctx({ visual: false, visualObserve: true }));
  assert.equal(unk.ok, true); assert.ok(unk.visual.observed.includes('visual_tags_unknown')); assert.equal(unk.visual.missing.length, 1);
});
test('enforce stage 1: only the clear clashes reject; unknown tags still pass', () => {
  const cfg = visualGateConfig({ VISUAL_GATE: '1' });
  const c = (l) => reviewLook(l, ctx({ visual: cfg.visual, visualObserve: true }));
  assert.equal(c([plaidJacket(), skull(), trousers(), shoes()]).ok, false);
  assert.equal(c([plaidJacket(), P('Men cotton tee', { over: { key: 'tshirt' } }), trousers(), shoes()]).ok, true, 'unknown is not enforced yet');
});
test('REAL catalog snapshot: tag coverage of upper-body products (the number that gates enforcement)', () => {
  for (const f of ['real-catalog-snapshot.json', 'twist-live-sample.json']) {
    const rows = JSON.parse(readFileSync(new URL(`../test-fixtures/${f}`, import.meta.url), 'utf8'));
    const cov = coverageOf(enrichAll(rows, K));
    console.log(`# visual tag coverage ${f}: ${cov.reliable}/${cov.upperBody} upper-body products = ${(cov.pct * 100).toFixed(0)}% (text ${cov.fromText}, image ${cov.fromImage}, admin ${cov.fromAdmin})`);
    assert.ok(cov.upperBody >= 5); assert.equal(cov.readyForClear, cov.pct >= 0.8); assert.equal(cov.readyForUnknown, cov.pct >= 0.9);
    // enforcing "unknown" on this catalogue must hide most upper-body pieces: documented here so nobody switches it on blindly
    // the default now enforces the clear clashes (they need explicit evidence from text, image or admin), but never "unknown" while coverage is low
    if (cov.pct < 0.9) assert.ok(Array.isArray(visualGateConfig({}).visual) && !visualGateConfig({}).visual.includes('visual_tags_unknown'), 'coverage is below 90%: never enforce unknown tags by default');
  }
});
