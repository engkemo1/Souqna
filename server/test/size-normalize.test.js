import test from 'node:test';
import assert from 'node:assert/strict';
import { canonSize, sizeFacets, sizeFilterSets, babySizes, AGE_BUCKETS } from '../src/lib/size-normalize.js';

test('every spelling of the same kids age is one size', () => {
  const l = (x, kid = true) => canonSize(x, { kid }).label;
  assert.equal(l('10Y'), l('10y')); assert.equal(l('10Y'), l('10')); assert.equal(l('10Y'), l('١٠')); assert.equal(l('10Y'), '10 سنين');
  assert.equal(l('1Y'), 'سنة'); assert.equal(l('2'), 'سنتين');
  assert.equal(l('12Y'), l('12y'));
});
test('typed-backwards ranges and months', () => {
  assert.equal(canonSize('٥:٢', { kid: true }).label, '2-5 سنين');
  assert.equal(canonSize('١٢:١١', { kid: true }).label, '11-12 سنين');
  assert.deepEqual(canonSize('0-3M').months, [0, 3]);
  assert.deepEqual(canonSize('١٢-١٨ شهور').months, [12, 18]);
  assert.equal(canonSize('M').grp, 'letters'); assert.equal(canonSize('M').label, 'M'); assert.equal(canonSize('M').months, null);
});
test('adult numeric sizes and volumes are left alone', () => {
  assert.equal(canonSize('32', { kid: false }).label, '32'); assert.equal(canonSize('32', { kid: false }).grp, 'num');
  assert.equal(canonSize('100 مل').months, null);
  assert.equal(canonSize('XL').label, 'XL'); assert.equal(canonSize('free size').label, 'Free size');
});
const rows = [
  { size: '1Y', pid: 1, kid: 1, shoe: 0 }, { size: '12-18 شهور', pid: 2, kid: 1, shoe: 0 }, { size: '٢', pid: 3, kid: 1, shoe: 0 }, { size: '0-3M', pid: 4, kid: 1, shoe: 0 },
  { size: '10Y', pid: 5, kid: 1, shoe: 0 }, { size: '10y', pid: 5, kid: 1, shoe: 0 }, { size: '10', pid: 6, kid: 1, shoe: 0 }, { size: '32', pid: 7, kid: 0, shoe: 0 }, { size: 'M', pid: 8, kid: 0, shoe: 0 }, { size: '40', pid: 9, kid: 0, shoe: 1 },
];
test('facets: kids ages become buckets; a product is counted once; adult sizes stay', () => {
  const f = sizeFacets(rows); const by = (s) => f.find((x) => x.size === s);
  assert.equal(by('سنة لسنتين').n, 2);          // 1Y and 12-18 شهور
  assert.equal(by('2-4 سنين').n, 1);            // ٢ = 2 years
  assert.equal(by('0-3 شهور (حديث الولادة)').n, 1);
  assert.equal(by('8-10 سنين'), undefined);
  assert.equal(by('10-12 سنة').n, 2);           // 10Y + 10y (same product 5) + 10 (product 6) = products 5 and 6
  assert.equal(by('32').grp, 'num'); assert.equal(by('M').grp, 'letters'); assert.equal(by('40').grp, 'shoes');
  assert.ok(!f.some((x) => /^(10|10Y|10y)$/.test(x.size)), 'no raw duplicates');
  assert.deepEqual(f.filter((x) => x.grp === 'age').map((x) => x.size), AGE_BUCKETS.filter((b) => f.some((x) => x.size === b.label)).map((b) => b.label), 'buckets stay in age order');
});
test('filter: a bucket (or an old raw value like 1Y) finds every spelling inside it; adult sizes match any product', () => {
  const dist = rows.map((r) => ({ size: r.size, kid: r.kid }));
  const a = sizeFilterSets(['سنة لسنتين'], dist); assert.deepEqual(a.kidSizes.sort(), ['1Y', '12-18 شهور'].sort()); assert.deepEqual(a.anySizes, []);
  const raw = sizeFilterSets(['1Y'], dist); assert.deepEqual(raw.kidSizes.sort(), ['1Y', '12-18 شهور'].sort()); // «سنة» also finds 12-18 months
  const m = sizeFilterSets(['M', '32'], dist); assert.deepEqual(m.anySizes.sort(), ['32', 'M']);
  const ten = sizeFilterSets(['10-12 سنة'], dist); assert.deepEqual(ten.kidSizes.sort(), ['10', '10Y', '10y'].sort());
});
test('baby sizes = up to the end of the 2nd year', () => {
  assert.deepEqual(babySizes(rows.map((r) => ({ size: r.size, kid: r.kid }))).sort(), ['0-3M', '12-18 شهور', '1Y', '٢'].sort());
});
test('facet order: ages, shoes, numbers, then letters S < M < L < XL', () => {
  const f = sizeFacets([{ size: 'XL', pid: 1 }, { size: 'S', pid: 2 }, { size: 'L', pid: 3 }, { size: 'M', pid: 4 }, { size: '32', pid: 5 }, { size: '1Y', pid: 6, kid: 1 }]);
  assert.deepEqual(f.map((x) => x.size), ['سنة لسنتين', '32', 'S', 'M', 'L', 'XL']);
});

test('filter uses the same boundary rule as the facet: «0-3 شهور» is not in «3-6 شهور»', async () => {
  const { sizeFilterSets } = await import('../src/lib/size-normalize.js');
  const rows = [{ size: '0-3 شهور', kid: 1 }, { size: '3-6 شهور', kid: 1 }, { size: '6-12 شهور', kid: 1 }];
  const f36 = sizeFilterSets(['3-6 شهور'], rows).kidSizes;
  assert.ok(f36.includes('3-6 شهور')); assert.ok(!f36.includes('0-3 شهور')); assert.ok(!f36.includes('6-12 شهور'));
  const f03 = sizeFilterSets(['0-3 شهور (حديث الولادة)'], rows).kidSizes;
  assert.deepEqual(f03, ['0-3 شهور']);
});
