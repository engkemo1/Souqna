/**
 * "Where is the person?" for outfit photos with a busy background (street, shop floor, room) — the plain background
 * heuristic in visual-core.js (subjectBox) only works on calm studio shots. This runs a small free object detector
 * (YOLOS-tiny, ~25 MB) with transformers.js, the same way the CLIP model runs: no API key, photos stay on the server, model
 * files live in R2 (visual-model-store.js) so a redeploy never re-downloads them. It is OPTIONAL: if the package or the model
 * is unavailable, or VISUAL_PERSON_DETECT=0, detectPerson() resolves null and visual search keeps its heuristic behaviour.
 */
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { restoreModel, uploadModel } from './visual-model-store.js';

const MODEL_ID = process.env.VISUAL_PERSON_MODEL || 'Xenova/yolos-tiny';
const ENABLED = process.env.VISUAL_PERSON_DETECT !== '0';
const RETRY_AFTER_MS = 10 * 60 * 1000;
const cacheDir = process.env.MODEL_CACHE_DIR || path.join(os.tmpdir(), 'souqna-models');

let detector = null; let loading = null; let failed = null; let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

async function load() {
  const tf = await import('@huggingface/transformers');
  tf.env.cacheDir = cacheDir; tf.env.localModelPath = cacheDir; tf.env.allowLocalModels = true;
  const restored = await restoreModel(cacheDir, MODEL_ID).catch(() => null);
  const pipe = await tf.pipeline('object-detection', MODEL_ID, { dtype: restored?.dtypes?.vision || 'q8' });
  if (!restored) uploadModel(cacheDir, MODEL_ID, undefined, { dtypes: { vision: 'q8', text: 'q8' } }).catch((e) => console.error('[visual] person model upload failed:', e.message));
  return pipe;
}

async function ready() {
  if (!ENABLED) return false;
  if (detector) return true;
  if (failed && Date.now() - failed.at < RETRY_AFTER_MS) return false;
  if (!loading) {
    loading = load().then((p) => { detector = p; failed = null; console.log(`[visual] person detector ready: ${MODEL_ID}`); })
      .catch((e) => { failed = { at: Date.now() }; console.error(`[visual] person detector unavailable (${e.message}); using the background heuristic`); })
      .finally(() => { loading = null; });
  }
  await loading;
  return Boolean(detector);
}

/** Picks the person that fills the most of the frame. detections: [{ label, score, box: { xmin, ymin, xmax, ymax } }] in 0..1. */
export function pickPerson(detections, { minScore = 0.6, minArea = 0.05 } = {}) {
  let best = null;
  for (const d of detections || []) {
    if (d.label !== 'person' || d.score < minScore) continue;
    const { xmin, ymin, xmax, ymax } = d.box || {};
    if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin) continue;
    const area = (xmax - xmin) * (ymax - ymin);
    if (area < minArea) continue;
    if (!best || area * d.score > best.value) best = { value: area * d.score, box: [Math.max(0, xmin - 0.02), Math.max(0, ymin - 0.02), Math.min(1, xmax + 0.02), Math.min(1, ymax + 0.02)] };
  }
  return best ? best.box : null;
}

/** → [left, top, right, bottom] fractions of the (EXIF-rotated) photo, or null (no person / model unavailable). Never throws. */
export async function detectPerson(buffer) {
  try {
    if (!(await ready())) return null;
    const jpeg = await sharp(buffer).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
    return await serial(async () => {
      const { RawImage } = await import('@huggingface/transformers');
      const image = await RawImage.fromBlob(new Blob([jpeg], { type: 'image/jpeg' }));
      return pickPerson(await detector(image, { threshold: 0.5, percentage: true }));
    });
  } catch (e) {
    console.error('[visual] person detection failed:', e.message);
    return null;
  }
}
