import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatesFor, isSetName, RELATED_PENALTY, UNTYPED_PENALTY } from '../src/lib/visual-related.js';
import { rankConfident, normalize, colorSimilarity, COLOR_BINS } from '../src/lib/visual-core.js';
import { detectSet, buildTextPrototypes } from '../src/lib/visual-classify.js';

const v = (...a) => normalize(Float32Array.from(a));

test('set names are recognised (ترنج / ترينج / سوت / طقم / سلوبيت / tracksuit)', () => {
  for (const n of ['ترنج قطيفه', 'ترينج اولادي', 'سوت قطيفه', 'طقم كاجوال', 'سلوبيت قطيفه']) assert.ok(isSetName({ name_ar: n }), n);
  assert.ok(isSetName({ name_en: 'Velvet tracksuit' }));
  assert.ok(!isSetName({ name_ar: 'جلوجز حريمي' }));
  assert.ok(!isSetName({ name_ar: 'بنطلون جينز' }));
});

test('a product filed under another family or with no type is still a candidate (with a small penalty)', () => {
  const pool = [
    { id: 1, family: 'sport', vec: v(1, 0) }, { id: 2, family: 'suiting', vec: v(1, 0) },
    { id: 3, family: null, vec: v(1, 0) }, { id: 4, family: 'shoes', vec: v(1, 0) }, { id: 5, family: 'tops', vec: v(1, 0) },
  ];
  const c = candidatesFor(pool, 'sport');
  assert.deepEqual(c.map((x) => x.id).sort(), [1, 2, 3, 5]);
  assert.equal(c.find((x) => x.id === 1).penalty, undefined);
  assert.equal(c.find((x) => x.id === 2).penalty, RELATED_PENALTY);
  assert.equal(c.find((x) => x.id === 3).penalty, UNTYPED_PENALTY);
  assert.ok(!c.some((x) => x.id === 4), 'shoes never leak into clothing searches');
});

test('shoes search keeps untyped products (e.g. clogs without a recorded type) but not clothing', () => {
  const c = candidatesFor([{ id: 1, family: 'shoes', vec: v(1, 0) }, { id: 2, family: null, vec: v(1, 0) }, { id: 3, family: 'tops', vec: v(1, 0) }], 'shoes');
  assert.deepEqual(c.map((x) => x.id), [1, 2]);
});

test('the "set" family finds tracksuits however they are filed, matched by name or family', () => {
  const pool = [
    { id: 1, family: null, isSet: true, vec: v(1, 0) },      // "ترنج قطيفه", type unknown
    { id: 2, family: 'tops', isSet: true, vec: v(1, 0) },    // "سوت قطيفه" filed as a top
    { id: 3, family: 'suiting', isSet: false, vec: v(1, 0) },
    { id: 4, family: 'bottoms', isSet: false, vec: v(1, 0) },
  ];
  assert.deepEqual(candidatesFor(pool, 'set').map((x) => x.id), [1, 2, 3]);
});

test('penalty keeps an exact-family product ahead of a related one with the same raw similarity', () => {
  const q = v(1, 0);
  const pool = candidatesFor([{ id: 1, family: 'suiting', vec: v(1, 0) }, { id: 2, family: 'sport', vec: v(1, 0) }], 'sport');
  const out = rankConfident(q, null, pool, { floor: 0.5, useColor: false });
  assert.equal(out[0].id, 2);
  assert.ok(out.some((x) => x.id === 1), 'the related product is still returned (inside the window)');
});

test('the old behaviour hid it: an untyped product at 0.84 is found now (floor 0.80), a far one is still rejected', () => {
  const q = v(1, 0);
  const near = normalize(Float32Array.from([0.88, 0.47])); // cos ≈ 0.88
  const far = normalize(Float32Array.from([0.4, 0.92]));
  const pool = candidatesFor([{ id: 1, family: null, vec: near }, { id: 2, family: null, vec: far }], 'sport');
  const out = rankConfident(q, null, pool, { floor: 0.8, useColor: false });
  assert.deepEqual(out.map((x) => x.id), [1]);
});

const hist = (i) => { const h = new Float32Array(COLOR_BINS); h[i] = 1; return h; };
test('detectSet: same-colour upper+lower garments → one "set" detection using the whole-outfit vector', async () => {
  const protos = { text: await buildTextPrototypes(async (texts) => texts.map(() => v(1, 0, 0)), { tops: ['a'], bottoms: ['b'] }), centroids: new Map() };
  const regions = [
    { key: 'full', vec: v(0, 1, 0), hist: hist(8) }, { key: 'upper', vec: v(1, 0, 0), hist: hist(8) },
    { key: 'lower', vec: v(1, 0, 0), hist: hist(8) }, { key: 'feet', vec: v(0, 0, 1), hist: hist(14) },
  ];
  const s = detectSet(regions, protos);
  assert.equal(s.family, 'set');
  assert.equal(s.regionKey, 'full');
  assert.deepEqual([...s.vec], [...regions[0].vec]);
  // different colours (white tee + blue jeans) are two separate pieces, not a set
  const mixed = regions.map((r) => (r.key === 'lower' ? { ...r, hist: hist(0) } : r));
  assert.equal(detectSet(mixed, protos), null);
  assert.ok(colorSimilarity(hist(8), hist(8)) > 0.9);
});
