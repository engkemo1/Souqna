import test from 'node:test';
import assert from 'node:assert/strict';
import { measure, sweep, recommendFloor } from '../src/lib/visual-acceptance.js';

// stub search: a product is "found" when the case's score ≥ floor
const mk = (cases) => async (buffer, o) => {
  const c = cases.find((x) => x.buffer === buffer);
  const floor = o._floor ?? 0.8;
  if (c.kind === 'noise') return { groups: [{ items: c.score >= floor ? [{ id: 99 }] : [], similar: [] }] };
  return { groups: [{ items: c.score >= floor ? [{ id: c.expectId }] : [], similar: c.score >= 0.5 ? [{ id: c.expectId }] : [] }], diag: { best: [c.score] } };
};
const cases = [
  { kind: 'reshot', expectId: 1, buffer: 'a', score: 0.95 }, { kind: 'reshot', expectId: 2, buffer: 'b', score: 0.9 },
  { kind: 'photo', expectId: 3, buffer: 'c', score: 0.7 }, { kind: 'photo', expectId: 4, buffer: 'd', score: 0.3 },
  { kind: 'noise', buffer: 'e', score: 0.4 }, { kind: 'noise', buffer: 'f', score: 0.6 },
];

test('measure: strict recall, near recall, per kind, false matches and failures', async () => {
  const m = await measure(cases, mk(cases));
  assert.equal(m.n, 4);
  assert.equal(m.strictRecall, 0.5);
  assert.equal(m.nearRecall, 0.75);
  assert.deepEqual(m.byKind.photo, { n: 2, strict: 0, near: 1, equiv: 0 });
  assert.equal(m.noiseFalsePositive, 0);
  assert.deepEqual(m.fails.map((f) => [f.id, f.near]), [[3, true], [4, false]]);
});

test('sweep + recommendFloor: highest floor reaching the target with few false matches', async () => {
  const rows = await sweep(cases, mk(cases), [0.9, 0.8, 0.65, 0.5, 0.25]);
  assert.equal(rows.find((r) => r.floor === 0.8).strictRecall, 0.5);
  assert.equal(recommendFloor(rows, 0.75, 0.5), 0.65, 'highest floor with 3/4 recall and no false match (0.65 > noise 0.6)');
  assert.equal(recommendFloor(rows, 1, 0), null, 'nothing reaches 100% with 0 false matches');
});

import { failureReason } from '../src/lib/visual-acceptance.js';
test('failureReason: wrong family / below floor / cut off', () => {
  assert.equal(failureReason({ expect: [{ inCands: false, score: null }] }, 0.8), 'wrong_family');
  assert.equal(failureReason({ expect: [{ inCands: true, score: 0.7 }, { inCands: false }] }, 0.8), 'below_floor');
  assert.equal(failureReason({ expect: [{ inCands: true, score: 0.9, rank: 3 }] }, 0.8), 'cut_off');
  assert.equal(failureReason({}, 0.8), 'unknown');
});
test('measure counts a look-alike product as found (equivalent recall)', async () => {
  const cs = [{ kind: 'photo', expectId: 1, equiv: new Set([2]), buffer: 'x' }];
  const m = await measure(cs, async () => ({ groups: [{ items: [{ id: 2 }], similar: [] }] }));
  assert.equal(m.strictRecall, 0); assert.equal(m.equivRecall, 1); assert.equal(m.fails.length, 0);
});
