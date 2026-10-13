import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { percentile, augmentedShot, evaluateModel } from '../src/lib/visual-eval.js';

/** fake model: embeds an image as its mean colour (so a re-shot of the same product stays close to it); texts as fixed axes */
const fake = {
  async embedImage(buf) { const { channels } = await sharp(buf).resize(1, 1).stats(); return Float32Array.from(channels.map((c) => c.mean)); },
  async embedTexts(texts) { return texts.map((_, i) => Float32Array.from([1, 0, 0].map((_v, k) => (k === i % 3 ? 1 : 0)))); },
};
const solid = (r, g, b) => sharp({ create: { width: 200, height: 300, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();

test('percentile', () => { assert.equal(percentile([3, 1, 2], 0), 1); assert.equal(percentile([3, 1, 2], 1), 3); assert.ok(Number.isNaN(percentile([], 0.5))); });

test('augmentedShot returns a smaller decodable jpeg', async () => {
  const out = await augmentedShot(await solid(200, 50, 50));
  const m = await sharp(out).metadata(); assert.equal(m.format, 'jpeg'); assert.ok(m.width <= 480 && m.width > 8);
});

test('evaluateModel finds distinct products with the fake model', async () => {
  const cols = [[220, 30, 30], [30, 220, 30], [30, 30, 220], [220, 220, 30], [30, 220, 220]];
  const items = []; for (let i = 0; i < cols.length; i++) items.push({ id: i, family: 'tops', buffer: await solid(...cols[i]) });
  const r = await evaluateModel(fake, items, { shots: 2 });
  assert.equal(r.n, 5); assert.equal(r.queries, 10);
  assert.ok(r.hit1 >= 0.8, `hit1 ${r.hit1}`); assert.ok(r.hit5 === 1); assert.ok(r.mrr > 0.8);
  assert.ok(Number.isFinite(r.msPerImage) && Number.isFinite(r.zeroShotAcc));
});
