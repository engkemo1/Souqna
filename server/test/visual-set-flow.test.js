import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

// Colour-driven fake CLIP: image vector = mean RGB of the picture (+bias); text vectors = one direction per family.
const meanRgb = async (buf) => { const { data } = await sharp(buf).resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const m = [0, 0, 0]; for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) m[k] += data[i + k] / 255 / (data.length / 3); return m; };
const GARMENT = [0.15, 0.3, 0.7, 1], SHOE = [0.5, 0.35, 0.2, 0.2];

const rows = []; // products in the fake catalogue
mock.module('../src/db/index.js', { namedExports: { q: { all: (sql) => (/FROM visual_vectors/.test(sql) ? rows.map((r) => ({ ...r, vec: Buffer.from(r.vec.buffer), hist: null })) : []), get: () => null, run: () => {} }, insert: () => {} } });
mock.module('../src/lib/media.js', { namedExports: { readMediaFile: async () => { throw new Error('n/a'); } } });
mock.module('../src/lib/visual-person.js', { namedExports: { detectPerson: async () => null } });
mock.module('../src/lib/visual-taxonomy.js', { namedExports: {
  visualTypeOptions: () => [{ key: 'sport' }, { key: 'shoes' }, { key: 'tops' }],
  visualProductFamily: (r) => ({ tops: 'tops', dresses: 'dresses', shoes: 'shoes' })[r.department] || null,
} });
mock.module('../src/lib/visual-clip.js', { namedExports: {
  CLIP_MODEL_NAME: 'fake-clip', clipReady: async () => true, clipStatus: () => ({ loaded: true }),
  clipEmbedImage: async (buf) => { const m = await meanRgb(buf); return [...m, 0.5]; },
  clipEmbedTexts: async (texts) => texts.map((t) => (/sneaker|shoe|boot|sandal|loafer/.test(t) ? SHOE : GARMENT)),
} });
const visual = await import('../src/lib/visual.js');
const { toBlob, normalize } = await import('../src/lib/visual-core.js');

const outfit = () => sharp({ create: { width: 400, height: 800, channels: 3, background: { r: 38, g: 77, b: 179 } } })
  .composite([{ input: { create: { width: 400, height: 150, channels: 3, background: { r: 128, g: 90, b: 52 } } }, top: 650, left: 0 }]).jpeg().toBuffer();
const vecOf = (rgb) => normalize([...rgb, 0.5]);
const add = (id, name, department, rgb) => rows.push({ id, slot: `m${id}`, vec: vecOf(rgb), is_primary: 1, name_ar: name, name_en: '', department, cat_text: '' });

test('a velvet tracksuit that exists in the catalogue (no recorded type) is found from an outfit photo', async () => {
  add(1, 'ترنج قطيفه', 'x', [0.17, 0.32, 0.68]);   // blue velvet set, type unknown
  add(2, 'سوت قطيفه', 'tops', [0.15, 0.3, 0.72]);  // filed as a top
  add(3, 'فستان احمر', 'dresses', [0.8, 0.1, 0.1]);
  add(4, 'جلوجز حريمي', 'x', [0.5, 0.36, 0.2]);    // clogs, type unknown
  visual.invalidateVisualCache();
  const out = await visual.searchByImage(await outfit(), { _model: 'fake-clip' });
  const found = out.groups.flatMap((g) => g.items.map((x) => x.id));
  console.log(JSON.stringify({ detected: out.detected, diag: out.diag, groups: out.groups.map((g) => [g.type, g.items.map((x) => x.id), g.similar.map((x) => x.id)]) }));
  assert.ok(found.includes(1), 'ترنج قطيفه found');
  assert.ok(found.includes(2), 'سوت قطيفه found');
  assert.ok(!found.includes(3), 'red dress is not returned');
  assert.ok(!out.groups.some((g) => g.type === 'sport' || g.type === 'tops'), 'per-garment duplicates of the set are folded away');
  assert.ok(out.groups.some((g) => g.type === 'shoes'), 'shoes are still searched separately');
});

test('a same-colour top + bottom that is NOT a set still searches the pieces (no regression)', async () => {
  rows.length = 0;
  add(5, 'تيشيرت', 'tops', [0.05, 0.05, 0.05]);
  visual.invalidateVisualCache();
  const black = await sharp({ create: { width: 400, height: 800, channels: 3, background: { r: 13, g: 13, b: 13 } } }).jpeg().toBuffer();
  const out = await visual.searchByImage(black, { _model: 'fake-clip' });
  assert.ok(out.groups.flatMap((g) => g.items.map((x) => x.id)).includes(5), 'the typed top is still found');
});
