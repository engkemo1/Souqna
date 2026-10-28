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

/** Alpha mask (one byte per pixel, same size as the photo), plus `risky` when the outline may have dropped part of the product. */
async function foregroundMask(buffer, width, height, { check = true } = {}) {
  let risky = false;
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
  // Rescue product parts the model dropped because they sit close to the backdrop's colours (a beige turn-up on a cream
  // sheet, a white collar on a white wall). The backdrop colour is learned only from backdrop FAR from the product (so a
  // missed piece cannot teach it its own colour), then spread over the band around the product. In that band, a pixel that
  // clearly differs from the backdrop and touches the product is product. Shadows and creases match the backdrop and stay out.
  const RING = 48;
  const raw1 = { raw: { width: SIZE, height: SIZE, channels: 1 } }, raw3 = { raw: { width: SIZE, height: SIZE, channels: 3 } };
  const binary = (thr) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) if (m[i] >= thr) b[i] = 255; return b; };
  const near = await sharp(binary(128), raw1).blur(RING / 2).extractChannel(0).raw().toBuffer();
  const bg = Buffer.alloc(n), bgRgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) if (m[i] < 20 && near[i] < 2) { bg[i] = 255; bgRgb[i * 3] = data[i * 3]; bgRgb[i * 3 + 1] = data[i * 3 + 1]; bgRgb[i * 3 + 2] = data[i * 3 + 2]; }
  const [bgW, bgC] = await Promise.all([
    sharp(bg, raw1).blur(32).extractChannel(0).raw().toBuffer(),
    sharp(bgRgb, raw3).blur(32).raw().toBuffer(),
  ]);
  const diff = new Uint8Array(n); // how far each pixel is from the backdrop around it (0 where unknown)
  const hue = new Uint8Array(n); // the same, but only the colour itself, not how light or dark it is (a shadow scores ~0)
  for (let i = 0; i < n; i++) {
    if (bgW[i] < 6) continue;
    const k = 255 / bgW[i];
    const br = bgC[i * 3] * k, bgg = bgC[i * 3 + 1] * k, bb = bgC[i * 3 + 2] * k;
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const dr = r - br, dg = g - bgg, db = b - bb;
    diff[i] = Math.min(255, Math.round(Math.sqrt(dr * dr + dg * dg + db * db)));
    const ps = r + g + b + 1, bs = br + bgg + bb + 1;
    hue[i] = Math.min(255, Math.round(255 * Math.max(Math.abs(r / ps - br / bs), Math.abs(g / ps - bgg / bs), Math.abs(b / ps - bb / bs))));
  }
  // "looks like product, not backdrop": a different colour (not just a shadow or a crease), or very much darker/lighter
  const productLike = (i, extra = 0) => (hue[i] > 10 + extra / 4 && diff[i] > 25 + extra) || diff[i] > 90 + extra;
  // Colour comparison only means something where the backdrop is plain (sheet, wall, paper). Where it is patterned (tiles,
  // a busy shelf) every pixel differs from its neighbours, so there we trust the model alone. Judged locally, so a plain
  // sheet still counts even if a shelf shows up at the far end of the photo.
  const bgDiff = Buffer.alloc(n);
  for (let i = 0; i < n; i++) if (bg[i]) bgDiff[i] = diff[i];
  const texSum = await sharp(bgDiff, raw1).blur(32).extractChannel(0).raw().toBuffer();
  const plainAt = (i) => bgW[i] >= 6 && (texSum[i] * 255) / bgW[i] < 12;
  const grow = () => {
    const st = new Int32Array(n); let top = 0, added = 0;
    for (let i = 0; i < n; i++) if (m[i] >= 128) st[top++] = i;
    while (top) {
      const i = st[--top], x = i % SIZE;
      for (const j of [x > 0 ? i - 1 : -1, x < SIZE - 1 ? i + 1 : -1, i >= SIZE ? i - SIZE : -1, i < n - SIZE ? i + SIZE : -1]) {
        if (j >= 0 && m[j] < 128 && near[j] >= 3 && plainAt(j) && productLike(j)) { m[j] = 255; st[top++] = j; added++; }
      }
    }
    return added;
  };
  const dbg = process.env.CUTOUT_DEBUG_DIR; const snap = (name) => dbg && sharp(Buffer.from(m), raw1).png().toFile(`${dbg}/${name}.png`);
  await snap('1-model');
  grow();
  await snap('2-grow');
  // close small bites along the outline (a notch at a hem, a gap in a cuff): dilate then erode the product shape
  {
    const dil = await sharp(binary(128), raw1).blur(5).extractChannel(0).raw().toBuffer();
    const d2 = Buffer.alloc(n); for (let i = 0; i < n; i++) if (dil[i] > 40) d2[i] = 255;
    const ero = await sharp(d2, raw1).blur(5).extractChannel(0).raw().toBuffer();
    for (let i = 0; i < n; i++) if (ero[i] > 215 && m[i] < 255) m[i] = 255;
  }
  await snap('3-close');
  grow();
  await snap('4-grow2');
  // Safety net: if, right outside the final outline, there is still a real share of pixels that do not look like the
  // backdrop, part of the product may have been left out. Then the backdrop is NOT replaced at all (the caller keeps the
  // photo's real background): a plain photo is better than a product with a piece missing.
  {
    const ring = await sharp(binary(128), raw1).blur(3).extractChannel(0).raw().toBuffer();
    let edge = 0, odd = 0;
    for (let i = 0; i < n; i++) {
      if (m[i] >= 128 || ring[i] < 25) continue; // a thin band just outside the outline
      if (!plainAt(i)) continue;
      edge++;
      if (productLike(i, 10)) odd++;
    }
    risky = edge > 200 && odd / edge > 0.12;
    // ... and the other way round: if a big share of the product's own outline has the backdrop's colour (a white dress
    // on a white sheet, a beige abaya on a beige wall), nobody can tell where the product really ends — don't cut.
    const inner = await sharp(binary(128).map((v) => 255 - v), raw1).blur(3).extractChannel(0).raw().toBuffer();
    let rim = 0, same = 0;
    for (let i = 0; i < n; i++) {
      if (m[i] < 128 || inner[i] < 25 || !plainAt(i)) continue; // a thin band just inside the outline, next to plain backdrop
      rim++;
      if (diff[i] < 18 && hue[i] < 6) same++;
    }
    if (rim > 200 && same / rim > 0.3) risky = true;
  }
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
  if (!risky && check) risky = await outlineSuspicious(m, data);
  const alpha = await sharp(m, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(width, height, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
  return { alpha, risky };
}

/**
 * A last, general check of the finished outline, whatever went wrong (a rack pole, a shelf, a shadow, a hand, a lost
 * sleeve). It does not guess the cause; it looks for the two traces every wrong cut leaves:
 *  1. The outline cuts THROUGH something: on a real product edge the colour changes from product to background; where the
 *     cut slices a pole, a shelf, a wall, a shadow or the fabric itself, both sides of the line look the same.
 *  2. A thin strip of "product" running into the photo's border: a rack pole, a rail, a cable. A product cut off by the
 *     frame (a model shot at the thighs, a trouser leg) meets the border along a wide stretch, not a thin one.
 * Any doubt → true, and the caller keeps the real background.
 */
async function outlineSuspicious(m, data) {
  const n = SIZE * SIZE;
  const raw1 = { raw: { width: SIZE, height: SIZE, channels: 1 } }, raw3 = { raw: { width: SIZE, height: SIZE, channels: 3 } };
  const fg = Buffer.alloc(n), fgRgb = Buffer.alloc(n * 3), bgRgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const t = m[i] >= 128 ? fgRgb : bgRgb; if (m[i] >= 128) fg[i] = 255;
    t[i * 3] = data[i * 3]; t[i * 3 + 1] = data[i * 3 + 1]; t[i * 3 + 2] = data[i * 3 + 2];
  }
  const [wF, cF, cB] = await Promise.all([
    sharp(fg, raw1).blur(3).extractChannel(0).raw().toBuffer(),
    sharp(fgRgb, raw3).blur(3).raw().toBuffer(),
    sharp(bgRgb, raw3).blur(3).raw().toBuffer(),
  ]);
  const B = 4; // the photo's own border is not an outline
  const low = new Uint8Array(n);
  let line = 0, flat = 0;
  for (let y = B; y < SIZE - B; y++) for (let x = B; x < SIZE - B; x++) {
    const i = y * SIZE + x;
    if (!fg[i] || (fg[i - 1] && fg[i + 1] && fg[i - SIZE] && fg[i + SIZE])) continue; // outline pixels only
    const a = wF[i] / 255; if (a < 0.15 || a > 0.85) continue;
    line++;
    let d = 0;
    for (let c = 0; c < 3; c++) { const f = cF[i * 3 + c] / a, g = cB[i * 3 + c] / (1 - a); d += (f - g) * (f - g); }
    if (Math.sqrt(d) < 16) { low[i] = 1; flat++; }
  }
  // the longest connected run of "same colour on both sides" (small gaps bridged)
  let longest = 0;
  const seen = new Uint8Array(n), st = new Int32Array(n);
  for (let s0 = 0; s0 < n; s0++) {
    if (!low[s0] || seen[s0]) continue;
    let top = 0, count = 0; st[top++] = s0; seen[s0] = 1;
    while (top) {
      const i = st[--top], x = i % SIZE, y = (i / SIZE) | 0; count++;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
        const j = yy * SIZE + xx; if (low[j] && !seen[j]) { seen[j] = 1; st[top++] = j; }
      }
    }
    if (count > longest) longest = count;
  }
  // thin strips reaching the border
  let thin = 0;
  for (const at of [(k) => k, (k) => (SIZE - 1) * SIZE + k, (k) => k * SIZE, (k) => k * SIZE + SIZE - 1]) {
    let run = 0;
    for (let k = 0; k <= SIZE; k++) {
      if (k < SIZE && m[at(k)] >= 128) { run++; continue; }
      if (run > 0 && run < SIZE * 0.08) thin = Math.max(thin, run);
      run = 0;
    }
  }
  const bad = longest > 60 || thin > 0;
  if (process.env.CUTOUT_DEBUG_DIR || bad) console.log(`[cutout] outline check: same-colour run ${longest}px of ${line} (${flat} flat), thin border strip ${thin}px${bad ? ' → keeping the real background' : ''}`);
  return bad;
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
      const { alpha, risky } = await foregroundMask(buffer, width, height);
      if (risky) { console.log('[cutout] outline not trustworthy: keeping the real background'); return null; }
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
      const { alpha } = await foregroundMask(buffer, width, height, { check: false }); // only where the product is, for framing
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
