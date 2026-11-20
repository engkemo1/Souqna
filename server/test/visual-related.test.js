import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatesFor, isSetName, RELATED_PENALTY, UNTYPED_PENALTY, OTHER_PENALTY } from '../src/lib/visual-related.js';
import { rankConfident, rankStandout, normalize, colorSimilarity, COLOR_BINS } from '../src/lib/visual-core.js';
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
  const c = candidatesFor(pool, 'sport', { strict: true });
  assert.deepEqual(c.map((x) => x.id).sort(), [1, 2, 3, 5]);
  assert.equal(c.find((x) => x.id === 1).penalty, undefined);
  assert.equal(c.find((x) => x.id === 2).penalty, RELATED_PENALTY);
  assert.equal(c.find((x) => x.id === 3).penalty, UNTYPED_PENALTY);
  assert.ok(!c.some((x) => x.id === 4), 'shoes never leak into clothing searches');
});

test('shoes search keeps untyped products (e.g. clogs without a recorded type) but not clothing', () => {
  const c = candidatesFor([{ id: 1, family: 'shoes', vec: v(1, 0) }, { id: 2, family: null, vec: v(1, 0) }, { id: 3, family: 'tops', vec: v(1, 0) }], 'shoes', { strict: true });
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
  const pool = candidatesFor([{ id: 1, family: 'suiting', vec: v(1, 0) }, { id: 2, family: 'sport', vec: v(1, 0) }], 'sport', { strict: true });
  const out = rankConfident(q, null, pool, { floor: 0.5, useColor: false });
  assert.equal(out[0].id, 2);
  assert.ok(out.some((x) => x.id === 1), 'the related product is still returned (inside the window)');
});

test('the old behaviour hid it: an untyped product at 0.84 is found now (floor 0.80), a far one is still rejected', () => {
  const q = v(1, 0);
  const near = normalize(Float32Array.from([0.88, 0.47])); // cos ≈ 0.88
  const far = normalize(Float32Array.from([0.4, 0.92]));
  const pool = candidatesFor([{ id: 1, family: null, vec: near }, { id: 2, family: null, vec: far }], 'sport', { strict: true });
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

// deterministic pseudo-random vectors
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const noise = (rnd, dim = 128) => normalize(Float32Array.from({ length: dim }, () => rnd() - 0.5));

test('rankStandout: a product that clearly stands out from the pool is accepted even below the absolute floor', () => {
  const rnd = rng(7); const target = noise(rnd);
  const pool = Array.from({ length: 80 }, (_, i) => ({ id: i + 10, vec: noise(rnd) }));
  // worn-photo query: related to the product (cos ≈ 0.7) but far below a strict 0.8 floor
  const query = normalize(target.map((x, i) => 0.7 * x + 0.714 * noise(rng(99))[i]));
  pool.push({ id: 1, vec: target });
  assert.deepEqual(rankConfident(query, null, pool, { floor: 0.8, useColor: false }), [], 'strict gate alone finds nothing');
  const out = rankStandout(query, null, pool, { minScore: 0.5, useColor: false });
  assert.equal(out[0]?.id, 1);
});

test('rankStandout: unrelated query, a tiny pool or a too-low score → nothing (no filler)', () => {
  const rnd = rng(3);
  const pool = Array.from({ length: 80 }, (_, i) => ({ id: i, vec: noise(rnd) }));
  assert.deepEqual(rankStandout(noise(rng(1234)), null, pool, { minScore: 0.5, useColor: false }), [], 'no outlier → nothing');
  assert.deepEqual(rankStandout(pool[0].vec, null, pool.slice(0, 10), { minScore: 0.5, useColor: false }), [], 'too few candidates for statistics');
  assert.deepEqual(rankStandout(pool[0].vec, null, pool, { minScore: 1.1, useColor: false }), [], 'score floor respected');
});

test('auto-detected family is only a soft prior: a wrongly guessed family (jacket read as "bottoms") still finds the jacket', () => {
  const pool = [{ id: 1, family: 'outerwear', vec: v(1, 0) }, { id: 2, family: 'bottoms', vec: v(0, 1) }];
  const soft = candidatesFor(pool, 'bottoms');                       // photo guessed as bottoms
  assert.deepEqual(soft.map((x) => x.id).sort(), [1, 2]);
  const jacket = soft.find((x) => x.id === 1);
  assert.equal(jacket.penalty, OTHER_PENALTY); assert.equal(jacket.soft, true);
  assert.deepEqual(candidatesFor(pool, 'bottoms', { strict: true }).map((x) => x.id), [2], 'a type the shopper chose is a hard filter');
  const out = rankConfident(v(1, 0), null, soft, { floor: 0.8, useColor: false });
  assert.deepEqual(out.map((x) => x.id), [1], 'near-identical photo beats the family guess (1 - 0.07 = 0.93 ≥ floor)');
});

test('rankConfident scores a product by the best of several views of the photo (garment crop vs whole photo)', () => {
  const crop = v(1, 0); const whole = v(0, 1);
  const pool = [{ id: 1, vec: v(0, 1) }, { id: 2, vec: v(1, 0.2) }];
  assert.deepEqual(rankConfident(crop, null, pool, { floor: 0.9, useColor: false }).map((x) => x.id), [2], 'crop only: product 1 is missed');
  const both = rankConfident(crop, null, pool, { floor: 0.9, useColor: false, extraQueries: [{ vec: whole, hist: null }], window: 1 });
  assert.deepEqual(both.map((x) => x.id).sort(), [1, 2], 'with the whole photo as a second view product 1 is found too');
});
