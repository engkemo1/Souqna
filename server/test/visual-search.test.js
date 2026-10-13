import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  softmax, cosine, normalize, rankConfident, colorDescriptor, colorSimilarity, regionKeysFor, cropRegions, RANK,
} from '../src/lib/visual-core.js';
import { buildCentroids, familyProbabilities, detectItems, vectorForFamily, MIN_CENTROID_N } from '../src/lib/visual-classify.js';

const unit = (...v) => normalize(Float32Array.from(v));
const solid = (r, g, b, w = 64, h = 64) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();

test('softmax sums to 1 and keeps order', () => {
  const p = softmax([1, 3, 2]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(p[1] > p[2] && p[2] > p[0]);
});

test('portrait photos are split into regions, square photos are not', () => {
  assert.deepEqual(regionKeysFor(600, 1000), ['full', 'upper', 'lower', 'feet']);
  assert.deepEqual(regionKeysFor(800, 800), ['full']);
});

test('cropRegions returns decodable crops for an outfit photo', async () => {
  const photo = await solid(200, 100, 50, 600, 1000);
  const crops = await cropRegions(photo);
  assert.deepEqual(crops.map((c) => c.key), ['full', 'upper', 'lower', 'feet']);
  for (const c of crops) { const m = await sharp(c.buffer).metadata(); assert.ok(m.width > 8 && m.height > 8); }
});

test('colour descriptor: same colour ≈ 1, black vs pink ≈ 0, navy is close to black', async () => {
  const black = await colorDescriptor(await solid(10, 10, 10));
  const navy = await colorDescriptor(await solid(15, 20, 60));
  const pink = await colorDescriptor(await solid(240, 120, 170));
  const white = await colorDescriptor(await solid(250, 250, 250));
  assert.ok(colorSimilarity(black, black) > 0.99);
  assert.ok(colorSimilarity(black, pink) < 0.12);
  assert.ok(colorSimilarity(black, white) < 0.2);
  assert.ok(colorSimilarity(black, navy) > colorSimilarity(black, pink));
});

test('rankConfident returns NOTHING when no product is genuinely close (no filler)', () => {
  const q = unit(1, 0, 0);
  const far = [{ id: 1, vec: unit(0, 1, 0) }, { id: 2, vec: unit(0.5, 1, 0) }];
  assert.deepEqual(rankConfident(q, null, far, { floor: 0.8, useColor: false }), []);
});

test('rankConfident keeps only close products near the best one', () => {
  const q = unit(1, 0, 0);
  const c = [
    { id: 1, vec: unit(1, 0.05, 0) },   // ~0.999
    { id: 2, vec: unit(1, 0.25, 0) },   // ~0.97 — within window? best-0.06 → 0.94, yes
    { id: 3, vec: unit(1, 0.6, 0) },    // ~0.86 — above floor 0.8 but outside window
    { id: 4, vec: unit(1, 3, 0) },      // far
  ];
  assert.deepEqual(rankConfident(q, null, c, { floor: 0.8, useColor: false }).map((x) => x.id), [1, 2]);
});

test('colour mismatch pushes a lookalike below the floor', async () => {
  const q = unit(1, 0, 0);
  const hBlack = await colorDescriptor(await solid(10, 10, 10));
  const hPink = await colorDescriptor(await solid(240, 120, 170));
  const cand = [{ id: 1, vec: unit(1, 0.62, 0), hist: hPink }, { id: 2, vec: unit(1, 0.62, 0), hist: hBlack }]; // same shape score ≈ 0.85
  const out = rankConfident(q, hBlack, cand, { floor: 0.86, useColor: true });
  assert.deepEqual(out.map((x) => x.id), [2]);
});

/* ---- classifier: zero-shot text prototypes + learned catalogue centroids ---- */
const text = new Map([['tops', unit(1, 0, 0, 0)], ['bottoms', unit(0, 1, 0, 0)], ['shoes', unit(0, 0, 1, 0)]]);

test('zero-shot probabilities pick the nearest family', () => {
  const p = familyProbabilities(unit(0.9, 0.1, 0, 0), { text, centroids: new Map() });
  assert.equal(p[0].family, 'tops');
  assert.ok(Math.abs(p.reduce((a, b) => a + b.p, 0) - 1) < 1e-9);
});

test('centroids need enough examples, then correct a wrong zero-shot guess', () => {
  const few = buildCentroids([{ family: 'tops', vec: unit(1, 0, 0, 0) }]);
  assert.equal(few.size, 0);
  assert.ok(MIN_CENTROID_N >= 2);
  // local shop photos of "bottoms" actually live near the "tops" text direction in this toy space
  const rows = [];
  for (let i = 0; i < 40; i++) { rows.push({ family: 'bottoms', vec: unit(0.8, 0.2 + i * 0.002, 0, 0.1) }); rows.push({ family: 'tops', vec: unit(0.2, 0, 0, 0.9) }); }
  const centroids = buildCentroids(rows);
  const v = unit(0.8, 0.2, 0, 0.1);
  const zero = familyProbabilities(v, { text, centroids: new Map() });
  const learned = familyProbabilities(v, { text, centroids });
  const pBottoms = (arr) => arr.find((x) => x.family === 'bottoms').p;
  assert.equal(zero[0].family, 'tops');
  assert.ok(pBottoms(learned) > pBottoms(zero), 'training on the catalogue raises the right family');
});

test('detectItems finds top + bottom + shoes in one outfit photo and de-duplicates families', () => {
  const regions = [
    { key: 'full', vec: unit(0.6, 0.55, 0.1, 0) },
    { key: 'upper', vec: unit(1, 0.05, 0, 0) },
    { key: 'lower', vec: unit(0.05, 1, 0, 0) },
    { key: 'feet', vec: unit(0, 0.05, 1, 0) },
  ];
  const items = detectItems(regions, { text, centroids: new Map() });
  assert.deepEqual(new Set(items.map((i) => i.family)), new Set(['tops', 'bottoms', 'shoes']));
  assert.equal(items.find((i) => i.family === 'shoes').regionKey, 'feet');
});

test('an unsure classifier still returns one piece so the similarity gate can decide', () => {
  const items = detectItems([{ key: 'full', vec: unit(1, 1, 1, 1) }], { text, centroids: new Map() }, { minFullP: 0.99 });
  assert.equal(items.length, 1);
});

test('vectorForFamily picks the crop that looks most like the chosen type', () => {
  const regions = [{ key: 'full', vec: unit(0.5, 0.5, 0.5, 0) }, { key: 'feet', vec: unit(0, 0, 1, 0) }];
  assert.equal(vectorForFamily(regions, { text, centroids: new Map() }, 'shoes').regionKey, 'feet');
});

test('rank defaults are sane', () => { assert.ok(RANK.window > 0 && RANK.colorWeight > 0); assert.ok(cosine(unit(1, 0), unit(1, 0)) > 0.999); });
