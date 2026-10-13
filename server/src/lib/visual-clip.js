/**
 * Free local computer-vision model for visual search: CLIP-family image + text towers running in Node via ONNX
 * (@huggingface/transformers). No API key, no per-search cost, photos never leave the server. No persistent volume: the model
 * files live in Cloudflare R2 (visual-model-store.js) and are copied to the container's temporary disk at start-up; the very
 * first run downloads them from HuggingFace and seeds R2. The package is an *optional* dependency: if it (or the model) is
 * unavailable, `clipReady()` resolves false and visual search silently keeps using the colour model.
 *
 * Any model that transformers.js can load with CLIPVisionModelWithProjection / CLIPTextModelWithProjection works:
 *   Xenova/clip-vit-base-patch32   (default: small, ~150 MB int8)
 *   Marqo/marqo-fashionCLIP        (fashion-tuned ViT-B/16, Apache-2.0)  → set VISUAL_CLIP_MODEL
 * Compare candidates on YOUR catalogue with:  npm run compare:visual -w server
 */
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { restoreModel, uploadModel } from './visual-model-store.js';

const MODEL_ID = process.env.VISUAL_CLIP_MODEL || 'Xenova/clip-vit-base-patch32';
const RETRY_AFTER_MS = 10 * 60 * 1000;
const DTYPES = ['q8', 'fp32', 'fp16']; // smallest first; each tower falls back independently (repos ship different files)

/** White-padded square so the whole garment is visible — used identically for catalogue photos and customer photos. */
const prepare = (buffer) => sharp(buffer).rotate().resize(224, 224, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();

async function fromPretrainedAny(Ctor, id, preferred) {
  const order = [...new Set([preferred, ...DTYPES].filter(Boolean))];
  let last;
  for (const dtype of order) {
    try { return { model: await Ctor.from_pretrained(id, { dtype }), dtype }; } catch (e) { last = e; }
  }
  throw last;
}

/** One CLIP model instance. `r2:false` keeps experiments (the comparison script) out of the production R2 bucket. */
export function createClip(modelId, { r2 = true, cacheDir = process.env.MODEL_CACHE_DIR || path.join(os.tmpdir(), 'souqna-models') } = {}) {
  let state = null; let loading = null; let failed = null; let queue = Promise.resolve();
  const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; }; // one inference at a time (RAM)

  async function load() {
    const tf = await import('@huggingface/transformers');
    tf.env.cacheDir = cacheDir; tf.env.localModelPath = cacheDir; tf.env.allowLocalModels = true;
    const restored = r2 ? await restoreModel(cacheDir, modelId).catch((e) => { console.error('[visual] R2 model restore failed:', e.message); return null; }) : null;
    if (restored) console.log(`[visual] ${modelId} restored from R2`);
    const [processor, tokenizer, vision, text] = await Promise.all([
      tf.AutoProcessor.from_pretrained(modelId),
      tf.AutoTokenizer.from_pretrained(modelId),
      fromPretrainedAny(tf.CLIPVisionModelWithProjection, modelId, restored?.dtypes?.vision),
      fromPretrainedAny(tf.CLIPTextModelWithProjection, modelId, restored?.dtypes?.text),
    ]);
    const dtypes = { vision: vision.dtype, text: text.dtype };
    if (r2 && !restored) uploadModel(cacheDir, modelId, undefined, { dtypes }).then((ok) => ok && console.log(`[visual] ${modelId} uploaded to R2 for the next start`)).catch((e) => console.error('[visual] R2 model upload failed:', e.message));
    return { tf, processor, vision: vision.model, text: text.model, tokenizer, dtypes };
  }

  const api = {
    modelId,
    name: `clip:${modelId}`,
    cacheDir,
    /** true when the model is loaded (loads it on first call; a failed load is not retried for 10 minutes). */
    async ready() {
      if (state) return true;
      if (failed && Date.now() - failed.at < RETRY_AFTER_MS) return false;
      if (!loading) {
        loading = load().then((s) => { state = s; failed = null; console.log(`[visual] CLIP model ready: ${modelId} (${s.dtypes.vision}/${s.dtypes.text})`); })
          .catch((e) => { failed = { at: Date.now(), message: e.message }; console.error(`[visual] ${modelId} unavailable:`, e.message); })
          .finally(() => { loading = null; });
      }
      await loading;
      return Boolean(state);
    },
    status: () => ({ model: modelId, loaded: Boolean(state), loading: Boolean(loading), error: failed?.message || null, dtypes: state?.dtypes || null }),
    /** Float32 array (not normalised) for one image. */
    async embedImage(buffer) {
      if (!(await api.ready())) throw new Error('CLIP model is not available');
      const jpeg = await prepare(buffer);
      return serial(async () => {
        const image = await state.tf.RawImage.fromBlob(new Blob([jpeg], { type: 'image/jpeg' }));
        const inputs = await state.processor(image);
        const { image_embeds } = await state.vision(inputs);
        return Float32Array.from(image_embeds.data);
      });
    },
    /** Float32 arrays for a list of texts. */
    async embedTexts(texts) {
      if (!(await api.ready())) throw new Error('CLIP model is not available');
      return serial(async () => {
        const inputs = state.tokenizer(texts, { padding: true, truncation: true });
        const { text_embeds } = await state.text(inputs);
        const dim = text_embeds.dims[1];
        return texts.map((_, i) => Float32Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim)));
      });
    },
    async dispose() { try { await state?.vision?.dispose?.(); await state?.text?.dispose?.(); } catch { /* ignore */ } state = null; },
  };
  return api;
}

/* ---- the production instance (model chosen by VISUAL_CLIP_MODEL) ---- */
const main = createClip(MODEL_ID);
export const CLIP_MODEL_NAME = main.name;
export const clipReady = () => main.ready();
export const clipStatus = () => main.status();
export const clipEmbedImage = (buffer) => main.embedImage(buffer);
export const clipEmbedTexts = (texts) => main.embedTexts(texts);
