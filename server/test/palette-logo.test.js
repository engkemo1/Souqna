import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestThemes } from '@souqna/shared';

const sw = (list) => list.map(([hex, pop]) => ({ hex, pop }));

test('a rare pale anti-aliasing tint never replaces the colour that fills the logo', () => {
  const r = suggestThemes(sw([['#FFFFFF', 0.71], ['#D81E2B', 0.277], ['#E87E85', 0.004]]));
  assert.equal(r.brand, '#D81E2B');
});

test('a gold gradient resolves to a gold, not its pale highlight', () => {
  const r = suggestThemes(sw([['#000000', 0.66], ['#B79140', 0.116], ['#D5B569', 0.099], ['#F3E3B0', 0.02]]));
  assert.notEqual(r.brand, '#F3E3B0');
});

test('a single-colour logo gets an accent in its own hue family, never neon', () => {
  const r = suggestThemes(sw([['#1E8E4E', 1]]));
  assert.ok(r.variants.every((v) => v.ok));
});
