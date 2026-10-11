/**
 * Visual search ("صوّرها ولاقيها في بنها").
 * Each product's primary photo is turned into a small vector; a customer's photo is turned into the same kind of
 * vector and compared (cosine similarity) with every active product. Nothing leaves the server and it costs nothing.
 *
 * Embedder 'color-v1' (built in, no model download): a weighted colour/layout fingerprint — finds items that look alike
 * in colour, tone and shape. A neural embedder (CLIP) can be plugged in later by adding another `EMBEDDERS` entry;
 * vectors from a different model are never mixed, they are re-indexed in the background.
 */
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { q } from '../db/index.js';
import { readMediaFile } from './media.js';

const GRID_W = 6, GRID_H = 8, HUE_BINS = 12;

/** weight cells near the centre more (the garment), ignore the borders (background / blurred padding) */
const CELL_W = Array.from({ length: GRID_H }, (_, y) => Array.from({ length: GRID_W }, (_, x) => {
  const dx = (x + 0.5) / GRID_W - 0.5, dy = (y + 0.5) / GRID_H - 0.5;
  return 0.35 + 0.65 * Math.exp(-(dx * dx * 5 + dy * dy * 4));
})).flat();

function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}

async function colorEmbed(buffer) {
  const { data } = await sharp(buffer).rotate().resize(GRID_W * 4, GRID_H * 4, { fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = GRID_W * 4, grid = new Float32Array(GRID_W * GRID_H * 3), cnt = new Float32Array(GRID_W * GRID_H);
  const hue = new Float32Array(HUE_BINS);
  for (let y = 0; y < GRID_H * 4; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, c = Math.floor(y / 4) * GRID_W + Math.floor(x / 4);
    grid[c * 3] += data[i]; grid[c * 3 + 1] += data[i + 1]; grid[c * 3 + 2] += data[i + 2]; cnt[c]++;
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s > 0.18 && v > 0.15) hue[Math.floor(h / 360 * HUE_BINS) % HUE_BINS] += CELL_W[c] * s;
  }
  const out = [];
  for (let c = 0; c < GRID_W * GRID_H; c++) for (let k = 0; k < 3; k++) out.push(((grid[c * 3 + k] / cnt[c]) - 128) / 128 * CELL_W[c]);
  const hs = hue.reduce((a, b) => a + b, 0) || 1;
  for (let k = 0; k < HUE_BINS; k++) out.push((hue[k] / hs) * 3); // hue profile counts as much as a few cells
  return out;
}

/* ---------------- CLIP (neural) — enabled with VISUAL_MODEL=clip; falls back to colour-v1 if it cannot load ---------------- */
const CLIP_ID = 'Xenova/clip-vit-base-patch32';
let clipPromise = null, clipFailed = false, clipQueue = Promise.resolve();
async function loadClip() {
  if (!clipPromise) {
    clipPromise = (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = process.env.MODEL_CACHE_DIR || path.join(os.tmpdir(), 'banha-models');
      tf.env.allowLocalModels = false;
      const [processor, model] = await Promise.all([
        tf.AutoProcessor.from_pretrained(CLIP_ID),
        tf.CLIPVisionModelWithProjection.from_pretrained(CLIP_ID, { dtype: 'q8' }),
      ]);
      console.log('[visual] CLIP model ready');
      return { tf, processor, model };
    })();
    clipPromise.catch(() => {});
  }
  return clipPromise;
}
async function clipEmbed(buffer) {
  const { tf, processor, model } = await loadClip();
  // one image at a time keeps memory flat on a small server
  const run = clipQueue.then(async () => {
    const img = await tf.RawImage.fromBlob(new Blob([await sharp(buffer).rotate().resize(448, 448, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer()], { type: 'image/jpeg' }));
    const { image_embeds } = await model(await processor(img));
    return Array.from(image_embeds.data);
  });
  clipQueue = run.catch(() => {});
  return run;
}

const EMBEDDERS = { 'color-v1': colorEmbed, 'clip-b32': clipEmbed };
const WANT_CLIP = String(process.env.VISUAL_MODEL || '').toLowerCase() === 'clip';
/** The model new vectors are made with right now (CLIP when enabled and loadable, otherwise the built-in colour model). */
export async function activeModel() {
  if (WANT_CLIP && !clipFailed) {
    try { await loadClip(); return 'clip-b32'; } catch (e) { clipFailed = true; console.error('[visual] CLIP unavailable, using colour model:', e.message); }
  }
  return 'color-v1';
}

function normalise(v) {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}
export async function embedImage(buffer, model) {
  const m = model || await activeModel();
  try { return { model: m, vec: normalise(await EMBEDDERS[m](buffer)) }; }
  catch (e) { if (m === 'color-v1') throw e; clipFailed = true; console.error('[visual] CLIP failed, using colour model:', e.message); return { model: 'color-v1', vec: normalise(await colorEmbed(buffer)) }; }
}
const toBlob = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
const fromBlob = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Index products whose primary photo has no vector for the active model yet (or whose photo changed). */
export async function reindexPending(limit = 200) {
  const ACTIVE_MODEL = await activeModel();
  const rows = q.all(
    `SELECT p.id AS product_id, m.* FROM products p
       JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary=1
       JOIN media m ON m.id=pm.media_id
       LEFT JOIN product_vectors v ON v.product_id=p.id
      WHERE p.status='active' AND (v.product_id IS NULL OR v.media_id!=m.id OR v.model!=?) LIMIT ?`, [ACTIVE_MODEL, limit]);
  let done = 0;
  for (const m of rows) {
    try {
      let buf = null;
      for (const f of ['md.jpg', 'sm.jpg', 'original.jpg']) { try { buf = await readMediaFile(m, f); break; } catch { /* try next */ } }
      if (!buf) continue;
      const e = await embedImage(buf, ACTIVE_MODEL);
      q.run('INSERT INTO product_vectors (product_id, media_id, model, vec) VALUES (?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET media_id=excluded.media_id, model=excluded.model, vec=excluded.vec', [m.product_id, m.id, e.model, toBlob(e.vec)]);
      done++;
    } catch (e) { console.error('[visual] index failed for product', m.product_id, e.message); }
  }
  return { done, remaining: rows.length === limit };
}

let timer = null, running = false;
/** Debounced background indexing — call after a product is saved. */
export function triggerReindex(delay = 4000) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (running) return triggerReindex(10000);
    running = true;
    try { let r; do { r = await reindexPending(100); } while (r.remaining); } catch (e) { console.error('[visual]', e.message); }
    running = false;
  }, delay);
  timer.unref?.();
}
export function startVisualIndexer() {
  triggerReindex(3000);
  setInterval(() => triggerReindex(0), 10 * 60 * 1000).unref?.();
}

/** Top-N active products most similar to the customer's photo. */
export async function searchByImage(buffer, { department = '', limit = 24 } = {}) {
  const { vec: qv, model } = await embedImage(buffer);
  const rows = q.all(
    `SELECT v.product_id, v.vec FROM product_vectors v JOIN products p ON p.id=v.product_id JOIN stores s ON s.id=p.store_id
      WHERE v.model=? AND p.status='active' AND s.status='active' AND s.hidden=0 ${department ? 'AND p.department=?' : ''}`,
    department ? [model, department] : [model]);
  return rows.map((r) => ({ id: r.product_id, score: dot(qv, fromBlob(r.vec)) })).sort((a, b) => b.score - a.score).slice(0, limit);
}
