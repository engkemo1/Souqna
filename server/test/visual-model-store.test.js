import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { uploadModel, restoreModel } from '../src/lib/visual-model-store.js';

const memory = () => { const m = new Map(); return { m, enabled: () => true, put: async (k, b) => { m.set(k, Buffer.from(b)); }, get: async (k) => { if (!m.has(k)) throw new Error('404'); return m.get(k); } }; };
const ID = 'Xenova/clip-test';

test('model files round-trip through R2 into a fresh (wiped) cache dir', async () => {
  const a = await fs.mkdtemp(path.join(os.tmpdir(), 'mdl-a-')); const b = await fs.mkdtemp(path.join(os.tmpdir(), 'mdl-b-'));
  await fs.mkdir(path.join(a, ID, 'onnx'), { recursive: true });
  await fs.writeFile(path.join(a, ID, 'config.json'), '{"x":1}');
  await fs.writeFile(path.join(a, ID, 'onnx', 'vision_model_quantized.onnx'), Buffer.alloc(1000, 7));
  await fs.writeFile(path.join(a, ID, 'junk.lock'), 'x');
  const store = memory();
  assert.equal(await restoreModel(b, ID, store), null, 'nothing in R2 yet → caller falls back to HuggingFace');
  assert.equal(await uploadModel(a, ID, store, { dtypes: { vision: 'q8', text: 'fp32' } }), true);
  assert.ok(store.m.has(`models/${ID}/manifest.json`) && !store.m.has(`models/${ID}/junk.lock`));
  assert.deepEqual(await restoreModel(b, ID, store), { dtypes: { vision: 'q8', text: 'fp32' } }, 'remembers which ONNX variants were saved');
  assert.deepEqual(await fs.readFile(path.join(b, ID, 'onnx', 'vision_model_quantized.onnx')), Buffer.alloc(1000, 7));
  assert.equal(await fs.readFile(path.join(b, ID, 'config.json'), 'utf8'), '{"x":1}');
});

test('disabled R2 is a no-op, and a path-traversing manifest is refused', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdl-c-'));
  assert.equal(await restoreModel(dir, ID, { enabled: () => false }), null);
  const store = memory();
  store.m.set(`models/${ID}/manifest.json`, Buffer.from(JSON.stringify({ files: [{ path: '../../evil', size: 1 }] })));
  await assert.rejects(restoreModel(dir, ID, store), /unsafe path/);
});
