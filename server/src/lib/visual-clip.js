/**
 * Free local computer-vision model for visual search: CLIP (image + text towers) running in Node via ONNX
 * (@huggingface/transformers, quantised int8 ≈ 150 MB on disk, ≈ 300–400 MB RAM). No API key, no per-search cost, and
 * photos never leave the server. No persistent volume: the model files live in Cloudflare R2 (visual-model-store.js) and are
 * copied to the container's temporary disk at start-up; the very first run downloads them from HuggingFace and seeds R2. The package is an *optional* dependency: if it (or the model download) is
 * unavailable, `clipReady()` resolves false and visual search silently keeps using the colour model.
 */
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { restoreModel, uploadModel } from './visual-model-store.js';

const MODEL_ID = process.env.VISUAL_CLIP_MODEL || 'Xenova/clip-vit-base-patch32';
export const CLIP_MODEL_NAME = `clip:${MODEL_ID}`;
const RETRY_AFTER_MS = 10 * 60 * 1000;

let state = null;          // { tf, processor, vision, tokenizer, text }
let loading = null;
let failed = null;         // { at, message }
let queue = Promise.resolve();

const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; }; // one inference at a time (RAM)

async function load() {
  const tf = await import('@huggingface/transformers');
  const cacheDir = process.env.MODEL_CACHE_DIR || path.join(os.tmpdir(), 'souqna-models'); // temporary disk is fine — R2 is the source of truth
  tf.env.cacheDir = cacheDir; tf.env.localModelPath = cacheDir; tf.env.allowLocalModels = true;
  const fromR2 = await restoreModel(cacheDir, MODEL_ID).catch((e) => { console.error('[visual] R2 model restore failed:', e.message); return false; });
  if (fromR2) console.log('[visual] CLIP model restored from R2');
  const opts = { dtype: 'q8' };
  const [processor, vision, tokenizer, text] = await Promise.all([
    tf.AutoProcessor.from_pretrained(MODEL_ID),
    tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, opts),
    tf.AutoTokenizer.from_pretrained(MODEL_ID),
    tf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, opts),
  ]);
  if (!fromR2) uploadModel(cacheDir, MODEL_ID).then((ok) => ok && console.log('[visual] CLIP model uploaded to R2 for the next start')).catch((e) => console.error('[visual] R2 model upload failed:', e.message));
  return { tf, processor, vision, tokenizer, text };
}

/** true when the model is loaded (loads it on first call; a failed load is not retried for 10 minutes). */
export async function clipReady() {
  if (state) return true;
  if (failed && Date.now() - failed.at < RETRY_AFTER_MS) return false;
  if (!loading) {
    loading = load().then((s) => { state = s; failed = null; console.log('[visual] CLIP model ready'); })
      .catch((e) => { failed = { at: Date.now(), message: e.message }; console.error('[visual] CLIP unavailable, using colour model:', e.message); })
      .finally(() => { loading = null; });
  }
  await loading;
  return Boolean(state);
}
export const clipStatus = () => ({ model: MODEL_ID, loaded: Boolean(state), loading: Boolean(loading), error: failed?.message || null });

/** White-padded square so the whole garment is visible — used identically for catalogue photos and customer photos. */
const prepare = (buffer) => sharp(buffer).rotate().resize(224, 224, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();

/** Float32 array (not normalised) for one image. */
export async function clipEmbedImage(buffer) {
  if (!(await clipReady())) throw new Error('CLIP model is not available');
  const jpeg = await prepare(buffer);
  return serial(async () => {
    const image = await state.tf.RawImage.fromBlob(new Blob([jpeg], { type: 'image/jpeg' }));
    const inputs = await state.processor(image);
    const { image_embeds } = await state.vision(inputs);
    return Float32Array.from(image_embeds.data);
  });
}

/** Float32 arrays for a list of texts. */
export async function clipEmbedTexts(texts) {
  if (!(await clipReady())) throw new Error('CLIP model is not available');
  return serial(async () => {
    const inputs = state.tokenizer(texts, { padding: true, truncation: true });
    const { text_embeds } = await state.text(inputs);
    const dim = text_embeds.dims[1];
    return texts.map((_, i) => Float32Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim)));
  });
}
