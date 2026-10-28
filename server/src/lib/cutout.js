/**
 * Background removal for product photos (self-hosted, no external service, no CDN).
 * Model: ISNet "general use" (Apache-2.0), run with onnxruntime-node (already installed with @huggingface/transformers).
 * It only decides which pixels are the product: the product pixels are copied untouched onto a plain white/cream
 * backdrop — nothing is generated or redrawn.
 * The model (~180 MB) is baked into the Docker image (BG_MODEL_FILE); if missing it is downloaded once into MODEL_CACHE_DIR, loaded on demand and released after
 * a few idle minutes to keep memory low. One photo at a time. Any failure → null, and the caller keeps the old behaviour.
 * BG_REMOVAL=0 turns it off.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

const MODEL_URL = process.env.BG_MODEL_URL || 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx';
const DIR = process.env.MODEL_CACHE_DIR || path.join(os.tmpdir(), 'souqna-models');
const CACHED = path.join(DIR, 'isnet-general-use.onnx');
const BAKED = process.env.BG_MODEL_FILE || ''; // set by the Dockerfile: the model is already inside the image
let FILE = CACHED;
const SIZE = 1024; // the model's fixed input
const IDLE_MS = 5 * 60e3;

export const cutoutEnabled = () => process.env.BG_REMOVAL !== '0';

let downloading = null;
async function ensureModel() {
  if (BAKED) { try { const st = await fsp.stat(BAKED); if (st.size > 100e6) { FILE = BAKED; return FILE; } } catch { /* not baked: download */ } }
  try { const st = await fsp.stat(CACHED); if (st.size > 100e6) { FILE = CACHED; return FILE; } } catch { /* not there yet */ }
  if (!downloading) {
    downloading = (async () => {
      await fsp.mkdir(DIR, { recursive: true });
      const tmp = `${CACHED}.${process.pid}.part`;
      const res = await fetch(MODEL_URL);
      if (!res.ok || !res.body) throw new Error(`model download ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
      const st = await fsp.stat(tmp);
      if (st.size < 100e6) { await fsp.rm(tmp, { force: true }); throw new Error('model download incomplete'); }
      await fsp.rename(tmp, CACHED);
      FILE = CACHED;
      console.log('[cutout] background model ready');
      return FILE;
    })().finally(() => { downloading = null; });
  }
  return downloading;
}

let ort = null, session = null, idle = null;
async function getSession() {
  if (!ort) { const mod = await import('onnxruntime-node'); ort = mod.default || mod; }
  if (!session) {
    await ensureModel();
    session = await ort.InferenceSession.create(FILE, { intraOpNumThreads: Math.max(1, Math.min(2, os.cpus().length)), enableCpuMemArena: false, enableMemPattern: false });
  }
  clearTimeout(idle);
  idle = setTimeout(() => { const s = session; session = null; s?.release?.().catch(() => {}); }, IDLE_MS);
  idle.unref?.();
  return session;
}

let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

/** Alpha mask (one byte per pixel, same size as the photo). */
async function foregroundMask(buffer, width, height) {
  const s = await getSession();
  const { data } = await sharp(buffer).removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const n = SIZE * SIZE;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { input[i] = data[i * 3] / 255 - 0.5; input[n + i] = data[i * 3 + 1] / 255 - 0.5; input[2 * n + i] = data[i * 3 + 2] / 255 - 0.5; }
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const pred = out[s.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const v = pred[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  const m = Buffer.alloc(n);
  // clean edges: drop faint leftovers of the background, make the solid inside fully opaque
  for (let i = 0; i < n; i++) { const a = ((pred[i] - lo) / span) * 255; m[i] = a < 20 ? 0 : a > 235 ? 255 : Math.round(((a - 20) * 255) / 215); }
  // Inside the product nothing may be see-through: the model is sometimes unsure about parts that look like the backdrop
  // (cream stripes on a cream sheet) and would let the new background shine through them. Real background is whatever
  // can be reached from the photo's border without crossing the product; everything else is product and fully opaque.
  // Only the outer edge keeps its soft, anti-aliased values.
  const outside = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const push = (i) => { if (!outside[i] && m[i] < 64) { outside[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < SIZE; x++) { push(x); push((SIZE - 1) * SIZE + x); }
  for (let y = 0; y < SIZE; y++) { push(y * SIZE); push(y * SIZE + SIZE - 1); }
  while (sp) {
    const i = stack[--sp], x = i % SIZE;
    if (x > 0) push(i - 1);
    if (x < SIZE - 1) push(i + 1);
    if (i >= SIZE) push(i - SIZE);
    if (i < n - SIZE) push(i + SIZE);
  }
  for (let i = 0; i < n; i++) if (!outside[i] && m[i] > 0) m[i] = 255; // only a gap the model is fully sure is background stays open
  return sharp(m, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(width, height, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
}

/**
 * The same photo with its background replaced by the plain colour `rgb` ([r,g,b]); same size, product pixels untouched.
 * Returns null when the model is unavailable or the result does not look like a single product (then nothing changes).
 */
export async function cutoutOnto(buffer, rgb) {
  const cut = await cutoutLayer(buffer);
  return cut ? cut.onto(rgb) : null;
}

/** Runs the model once; `onto(rgb)` then lays the untouched product on any plain colour. null when unavailable/unsure. */
export async function cutoutLayer(buffer) {
  if (!cutoutEnabled()) return null;
  try {
    return await serial(async () => {
      const { data: px, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width, height } = info;
      const alpha = await foregroundMask(buffer, width, height);
      let cover = 0;
      for (let i = 0; i < alpha.length; i++) cover += alpha[i];
      cover /= alpha.length * 255;
      if (cover < 0.03 || cover > 0.95) return null; // found nothing, or everything: leave the photo as it is
      const onto = (rgb) => {
        const out = Buffer.alloc(px.length);
        for (let i = 0, j = 0; i < alpha.length; i++, j += 3) {
          const a = alpha[i] / 255;
          out[j] = Math.round(px[j] * a + rgb[0] * (1 - a));
          out[j + 1] = Math.round(px[j + 1] * a + rgb[1] * (1 - a));
          out[j + 2] = Math.round(px[j + 2] * a + rgb[2] * (1 - a));
        }
        return sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
      };
      return { onto };
    });
  } catch (e) {
    console.error(`[cutout] skipped: ${e.message}`);
    return null;
  }
}

/** Where the product is in the photo: { x, y, w, h } in pixels, or null when the model is unavailable/unsure. */
export async function productBox(buffer) {
  if (!cutoutEnabled()) return null;
  try {
    return await serial(async () => {
      const { width, height } = await sharp(buffer).metadata();
      const alpha = await foregroundMask(buffer, width, height);
      let x0 = width, y0 = height, x1 = -1, y1 = -1, on = 0;
      for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i++) {
        if (alpha[i] < 60) continue; // low threshold: thin straps and soft edges still count as product
        on++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const cover = on / (width * height);
      if (x1 < 0 || cover < 0.03 || cover > 0.95) return null;
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    });
  } catch (e) {
    console.error(`[cutout] box skipped: ${e.message}`);
    return null;
  }
}

/** Download the model in the background shortly after start-up, so the first photo does not wait for it. */
export function prefetchCutoutModel(delayMs = 60e3) {
  if (!cutoutEnabled()) return;
  setTimeout(() => { ensureModel().catch((e) => console.error(`[cutout] model prefetch failed: ${e.message}`)); }, delayMs).unref?.();
}
