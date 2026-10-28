/**
 * Product Media Pipeline
 * ------------------------------------------------------------
 * Every upload is normalised once, at write time, into a family of
 * web-optimised renditions so the storefront never ships a 5 MB
 * original to a phone:
 *
 *   thumb  160w   – dashboard lists, cart lines, gallery thumbnails
 *   sm     400w   – mobile product cards
 *   md     800w   – desktop cards, mobile gallery
 *   lg    1400w   – desktop gallery / zoom
 *   xl    2000w   – hero banners only
 *   original      – EXIF-rotated, metadata-stripped, capped at 2400px
 *
 * Renditions are WebP only (every current browser supports it); the single JPEG kept per photo is `original.jpg`,
 * which is also the fallback for ancient browsers and the og:image for shared links. (Older photos may still carry JPEG renditions.)
 * A 24px LQIP and dominant colour are stored for blur-up placeholders
 * so layouts never jump while images load.
 *
 * Storage is a plain directory tree keyed by store + content hash, so it
 * can be synced to S3/R2 and fronted by any CDN by setting MEDIA_BASE_URL.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { cutoutOnto, cutoutLayer, productBox } from './cutout.js';
import { IMAGE_SIZES } from '@souqna/shared';
import { config } from '../config.js';
import { q, insert, tx } from '../db/index.js';
import { badRequest } from './errors.js';
import { r2Enabled, r2Put, r2Delete, r2Get } from './r2.js';

/** One WebP rendition. Settings chosen by SSIM measurement on real catalogue photos: ~-16% bytes for a <0.005 SSIM change (invisible). */
/** `crisp`: product photos get a light output sharpening after downscaling (shrinking softens fine detail). */
export const renderWebp = (buf, name, width, crisp = false) => {
  let p = sharp(buf).resize({ width, withoutEnlargement: true });
  if (crisp) p = p.sharpen({ sigma: 0.5, m1: 0.3, m2: 1.0, x1: 3, y2: 4, y3: 6 });
  return p.webp({ quality: name === 'thumb' ? 66 : 74, effort: 6, smartSubsample: true }).toBuffer();
};
const ORIGINAL_JPEG = { quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }; // the master every rendition is made from: keep it clean
// Between processing steps: practically lossless and full colour resolution (re-saving with normal JPEG settings each step
// smears thin coloured lines — stripes, prints, stitching).
export const MID_JPEG = { quality: 100, chromaSubsampling: '4:4:4' };

/** Write / delete one stored file of a media row, on R2 or on the local disk. */
export async function writeMediaFile(m, file, buf) {
  if (m.remote) return r2Put(`${m.store_id}/${m.key}/${file}`, buf);
  await fs.mkdir(mediaDirFor(m.store_id, m.key), { recursive: true });
  return fs.writeFile(path.join(mediaDirFor(m.store_id, m.key), file), buf);
}
export async function deleteMediaFile(m, file) {
  if (m.remote) return r2Delete(`${m.store_id}/${m.key}/${file}`);
  return fs.rm(path.join(mediaDirFor(m.store_id, m.key), file), { force: true });
}

const fileNames = (sizes) => ['original.jpg', 'source.jpg', ...sizes.flatMap((s) => [`${s.name}.webp`, `${s.name}.jpg`])];

/** Upload a finished rendition folder to R2 and drop the local copy. */
async function publishToR2(storeId, key, dir) {
  const uploaded = [];
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      await r2Put(`${storeId}/${key}/${f}`, await fs.readFile(path.join(dir, f)));
      uploaded.push(f);
    }
  } catch (e) {
    await Promise.all(uploaded.map((f) => r2Delete(`${storeId}/${key}/${f}`).catch(() => {})));
    throw e;
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Read one stored file of a media row, from the local disk or from R2. */
export async function readMediaFile(m, file) {
  if (m.remote) return r2Get(`${m.store_id}/${m.key}/${file}`);
  return fs.readFile(path.join(mediaDirFor(m.store_id, m.key), file));
}

/** Delete every stored file of media rows (local folder and/or R2 objects). */
export async function purgeMediaFiles(m) {
  if (m.remote) {
    const sizes = typeof m.sizes === 'string' ? JSON.parse(m.sizes) : m.sizes;
    for (const f of fileNames(sizes)) { try { await r2Delete(`${m.store_id}/${m.key}/${f}`); } catch (e) { console.error('[r2 delete]', e.message); } }
  }
  await fs.rm(mediaDirFor(m.store_id, m.key), { recursive: true, force: true });
}

export { publishToR2 };

sharp.cache(false);
sharp.concurrency(2);

const SIZE_SETS = {
  product: IMAGE_SIZES,
  category: { thumb: 160, sm: 400, md: 800 },
  logo: { thumb: 160, sm: 400 },
  banner: { sm: 400, md: 800, lg: 1400, xl: 2000 },
  cover: { sm: 400, md: 800, lg: 1400 },
  review: { thumb: 160, md: 900 },
};
const MAX_ORIGINAL = 2400;
const CANVAS_W = 1600, CANVAS_H = 2000; // product photos: uniform 4:5 (max size; smaller photos get a proportionally smaller canvas)
const MIN_PRODUCT_SIDE = 100; // only truly broken files are refused; weak photos are accepted and just score low
export const PHOTO_STYLES = ['white', 'cream', 'original'];
const STYLE_BG = { white: [255, 255, 255], cream: [245, 239, 230] };
const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff', 'gif']);

export function mediaDirFor(storeId, key) {
  return path.join(config.mediaDir, String(storeId), key);
}


/** Which look a store wants for its product photos (white | cream | original). Defaults to white. */
function storePhotoStyle(storeId) {
  try { const r = q.get('SELECT photo_style FROM stores WHERE id=?', [storeId]); return PHOTO_STYLES.includes(r?.photo_style) ? r.photo_style : 'white'; } catch { return 'white'; }
}

/** Cheap look at a photo: is it a product on a plain, light backdrop (studio shot) or a busy scene? Plus exposure/contrast figures. */
async function analyzePhoto(data) {
  const { data: px, info } = await sharp(data).resize(96, 96, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  const sides = { t: [0, 0, 0, 0], b: [0, 0, 0, 0], l: [0, 0, 0, 0], r: [0, 0, 0, 0] }; // r,g,b sums + count
  const all = { sum: [0, 0, 0], sq: [0, 0, 0], n: 0 };
  let lumSum = 0, lumSq = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, R = px[i], G = px[i + 1], B = px[i + 2];
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    lumSum += lum; lumSq += lum * lum;
    const side = y < ring ? 't' : y >= h - ring ? 'b' : x < ring ? 'l' : x >= w - ring ? 'r' : null;
    if (!side) continue;
    const s = sides[side]; s[0] += R; s[1] += G; s[2] += B; s[3]++;
    [R, G, B].forEach((v, c) => { all.sum[c] += v; all.sq[c] += v * v; }); all.n++;
  }
  const mean = all.sum.map((v) => v / all.n);
  const std = all.sq.map((v, c) => Math.sqrt(Math.max(0, v / all.n - mean[c] ** 2)));
  const sideMeans = Object.values(sides).map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
  const sideSpread = Math.max(...[0, 1, 2].map((c) => Math.max(...sideMeans.map((m) => m[c])) - Math.min(...sideMeans.map((m) => m[c]))));
  const bgLum = 0.299 * mean[0] + 0.587 * mean[1] + 0.114 * mean[2];
  const neutral = Math.max(...mean) - Math.min(...mean) < 30;
  // bgLum >= 218 keeps the brightening needed to reach pure white small (<= ~17%), so product colours are not visibly shifted
  const studio = (std[0] + std[1] + std[2]) / 3 < 14 && sideSpread < 26 && bgLum >= 218 && neutral;
  const n = w * h;
  const imgMean = lumSum / n, imgStd = Math.sqrt(Math.max(0, lumSq / n - imgMean ** 2));
  return { studio, bg: mean, imgMean, imgStd };
}

/** 0–100 photo quality: resolution, sharpness, exposure and contrast. Used only for gentle hints and soft ranking — never to refuse a photo. */
async function scoreQuality(data, sw, sh, an) {
  let sharpness = 0;
  try {
    const lap = await sharp(data).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).greyscale()
      .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] }).raw().toBuffer();
    let m = 0; for (const v of lap) m += v; m /= lap.length;
    let v2 = 0; for (const v of lap) v2 += (v - m) ** 2;
    sharpness = Math.sqrt(v2 / lap.length);
  } catch { /* leave 0 */ }
  const res = Math.min(1, Math.min(sw, sh) / 1000) * 50;
  const sharp_ = Math.min(1, sharpness / 14) * 30;
  const expo = an.imgMean >= 80 && an.imgMean <= 215 ? 12 : Math.max(0, 12 - Math.min(Math.abs(an.imgMean - 148) - 67, 60) / 5);
  const contrast = Math.min(1, an.imgStd / 40) * 8;
  return Math.max(0, Math.min(100, Math.round(res + sharp_ + expo + contrast)));
}

/** How crisp a photo is (spread of the Laplacian at 512 px): ~5 very soft, ~10 soft, 20+ sharp. */
async function measureSharpness(data) {
  try {
    const lap = await sharp(data).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).greyscale()
      .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] }).raw().toBuffer();
    let m = 0; for (const v of lap) m += v; m /= lap.length;
    let v2 = 0; for (const v of lap) v2 += (v - m) ** 2;
    return Math.sqrt(v2 / lap.length);
  } catch { return 20; }
}

/**
 * Honest clarity boost for product photos — it never invents detail, so the item looks exactly like the real one:
 *  - small photos (long side < 1200 px) are enlarged with a high-quality filter after a whisper of smoothing
 *    (hides JPEG blocks so they are not sharpened into the picture);
 *  - edge-aware sharpening: flat areas (skin, plain fabric, backdrop) are barely touched, edges get the boost,
 *    with tight limits so no bright/dark halos appear; softer photos get a bit more.
 */
async function refinePhoto(data) {
  const meta = await sharp(data).metadata();
  const long = Math.max(meta.width || 0, meta.height || 0);
  if (!long) return data;
  const soft = (await measureSharpness(data)) < 10;
  const f = long < 1200 ? Math.min(2, 1200 / long) : 1;
  let p = sharp(data);
  if (f > 1) p = sharp(await p.blur(0.5).toBuffer()).resize({ width: Math.round(meta.width * f), kernel: 'lanczos3' });
  p = p.sharpen({ sigma: f > 1 ? 0.75 * f : 0.7, m1: 0.4, m2: soft ? 2.0 : 1.5, x1: 3, y2: 6, y3: 10 });
  return p.jpeg(MID_JPEG).toBuffer();
}

/**
 * Undo a coloured light (yellow bulb, bluish daylight) — judged ONLY from the light backdrop around the edges of the photo
 * (sheet, wall, floor), never from the product, so a garment that really is yellow or beige keeps its colour.
 * The bright, low-colour pixels of the outer band should be neutral; if they lean clearly one way, the whole photo is
 * shifted back by most of that amount (capped, so it can never swing colours). Nothing happens on a neutral backdrop.
 */
export async function neutralLight(data) {
  try {
    const { data: px, info } = await sharp(data).resize({ width: 512, height: 512, fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const ring = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x >= w * 0.15 && x < w * 0.85 && y >= h * 0.12 && y < h * 0.88) continue; // centre = where the product usually is
      const i = (y * w + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 120 || (mx - mn) / mx > 0.25) continue; // only light, nearly neutral surfaces
      ring.push([r, g, b, r + g + b]);
    }
    if (ring.length < w * h * 0.03) return data; // not enough backdrop to judge
    ring.sort((a, c) => c[3] - a[3]);
    const top = ring.slice(0, Math.max(50, Math.round(ring.length * 0.5))); // the brightest half: the backdrop itself, not its shadows
    const m = [0, 1, 2].map((c) => top.reduce((s2, p) => s2 + p[c], 0) / top.length);
    const avg = (m[0] + m[1] + m[2]) / 3;
    if (avg < 150 || (Math.max(...m) - Math.min(...m)) / avg < 0.05) return data; // dark backdrop or already neutral
    const gains = m.map((v) => Math.max(0.85, Math.min(1.18, 1 + 0.85 * (avg / v - 1))));
    return await sharp(data).linear(gains, [0, 0, 0]).jpeg(MID_JPEG).toBuffer();
  } catch { return data; }
}

/**
 * After levelling, a real backdrop is only *almost* the canvas colour (paper grain, JPEG noise); pasted on the exact colour it
 * would show as a faint rectangle. Pixels very close to the backdrop colour become exactly it (soft hand-over, so the
 * product's own light edges are untouched).
 */
async function snapBackdrop(buf, rgb) {
  const { data: px, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < px.length; i += 3) {
    const d = Math.max(Math.abs(px[i] - rgb[0]), Math.abs(px[i + 1] - rgb[1]), Math.abs(px[i + 2] - rgb[2]));
    if (d >= 20) continue;
    const k = d <= 8 ? 1 : (20 - d) / 12;
    px[i] = Math.round(px[i] + (rgb[0] - px[i]) * k); px[i + 1] = Math.round(px[i + 1] + (rgb[1] - px[i + 1]) * k); px[i + 2] = Math.round(px[i + 2] + (rgb[2] - px[i + 2]) * k);
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg(MID_JPEG).toBuffer();
}

/** Gentle automatic correction: lift a dark photo, add a touch of contrast to a flat one. Skipped when the photo is already fine. */
function enhance(pipeline, an) {
  if (an.imgMean < 95) pipeline = pipeline.gamma(Math.min(1.6, 1 + (95 - an.imgMean) / 120));
  if (an.imgStd < 38) pipeline = pipeline.linear(1.06, -4);
  return pipeline;
}

/**
 * Uniform product canvas (4:5), sized to the photo (smaller photos → smaller canvas, never blown up).
 *  - studio shot on a plain light backdrop (style white/cream): trim the empty margin, set the backdrop to the exact canvas colour
 *    (no visible rectangle), centre the product with an even margin and a very soft contact shadow — the marketplace "white background" look.
 *  - anything else (people, street, busy scenes), or style "original": near-4:5 → gentle cover crop; otherwise the whole photo is kept on a clean backdrop matching its own edge colours.
 */
/**
 * Crop a non-4:5 photo to a 4:5 window centred on the product (found by the cut-out model), keeping the real background.
 * null when the model is unavailable or the product (with a small margin) does not fit inside such a window.
 */
async function frameOnProduct(base) {
  const box = await productBox(base);
  if (!box) return null;
  const { width: W, height: H } = await sharp(base).metadata();
  const r = CANVAS_W / CANVAS_H;
  // roomy margin first; a tighter one only if the photo is too narrow for it; never cut into the product
  for (const share of [0.12, 0.05]) {
    const m = Math.round(Math.max(box.w, box.h) * share);
    const bx0 = Math.max(0, box.x - m), by0 = Math.max(0, box.y - m), bx1 = Math.min(W, box.x + box.w + m), by1 = Math.min(H, box.y + box.h + m);
    let rw, rh;
    if (W / H > r) { rh = H; rw = Math.min(W, Math.round(H * r)); if (bx1 - bx0 > rw) continue; } // too wide: full height, slide horizontally
    else { rw = W; rh = Math.min(H, Math.round(W / r)); if (by1 - by0 > rh) continue; } // too tall: full width, slide vertically
    const left = Math.round(Math.min(Math.max((bx0 + bx1) / 2 - rw / 2, 0), W - rw));
    const top = Math.round(Math.min(Math.max((by0 + by1) / 2 - rh / 2, 0), H - rh));
    const cw = Math.max(480, Math.min(CANVAS_W, Math.round(rw / 2) * 2));
    return sharp(base).extract({ left, top, width: rw, height: rh }).resize(cw, Math.round(cw * 1.25), { fit: 'fill' });
  }
  return null;
}

async function productCanvas(data, style = 'original', analysis = null) {
  const meta = await sharp(data).metadata();
  const { width: sw, height: sh } = meta;
  let an = analysis || await analyzePhoto(data);

  // Busy backdrop but the owner wants white/cream: cut the product out (pixels untouched) onto the plain colour,
  // then treat it like a studio shot. If the model is unavailable or unsure, the photo keeps the old treatment.
  if (style !== 'original' && STYLE_BG[style] && !an.studio) {
    const cut = await cutoutOnto(data, STYLE_BG[style]);
    if (cut) { data = cut; an = { ...an, studio: true, cut: true, bg: [...STYLE_BG[style]] }; }
  }

  if (style !== 'original' && STYLE_BG[style] && an.studio) {
    const target = STYLE_BG[style];
    const gains = an.bg.map((v, i) => Math.max(0.88, Math.min(1.17, target[i] / Math.max(v, 1))));
    let leveled = await enhance(sharp(data).linear(gains, [0, 0, 0]), an).jpeg(MID_JPEG).toBuffer();
    if (!an.cut) leveled = await snapBackdrop(leveled, target);
    let prod = leveled, pw = sw, ph = sh, offL = 0, offT = 0;
    try {
      const t = await sharp(leveled).trim({ background: hex(target), threshold: 14 }).jpeg(MID_JPEG).toBuffer({ resolveWithObject: true });
      if (t.info.width * t.info.height >= sw * sh * (an.cut ? 0.01 : 0.12) && t.info.width > 40 && t.info.height > 40) {
        prod = t.data; pw = t.info.width; ph = t.info.height;
        offL = Math.abs(t.info.trimOffsetLeft || 0); offT = Math.abs(t.info.trimOffsetTop || 0);
      }
    } catch { /* nothing to trim */ }
    // A product the photographer cut off at a border (a model framed at the thighs, a sleeve out of shot) stays flush
    // with that border; margins and the floor shadow only go where the product really ends. Floating a cut-off product looks wrong.
    // "Cut off" only when a real share of the product sits on that border, not a shadow, a floor line or a few stray pixels.
    const filled = async (side) => {
      const k = 3;
      const box = { l: { left: 0, top: 0, width: Math.min(k, pw), height: ph }, r: { left: Math.max(0, pw - k), top: 0, width: Math.min(k, pw), height: ph },
        t: { left: 0, top: 0, width: pw, height: Math.min(k, ph) }, b: { left: 0, top: Math.max(0, ph - k), width: pw, height: Math.min(k, ph) } }[side];
      const { data: px } = await sharp(prod).extract(box).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let on = 0;
      for (let i = 0; i < px.length; i += 3) if (Math.abs(px[i] - target[0]) + Math.abs(px[i + 1] - target[1]) + Math.abs(px[i + 2] - target[2]) > 60) on++;
      return on / (px.length / 3) >= 0.2;
    };
    const touch = {
      l: offL <= 2 && await filled('l'), t: offT <= 2 && await filled('t'),
      r: offL + pw >= sw - 2 && await filled('r'), b: offT + ph >= sh - 2 && await filled('b'),
    };
    const M = 0.1; // breathing room around the product (too tight looks cropped)
    const mL = touch.l ? 0 : M, mR = touch.r ? 0 : M, mT = touch.t ? 0 : M, mB = touch.b ? 0 : M;
    const cw = Math.max(480, Math.min(CANVAS_W, Math.round(Math.max(pw / (1 - mL - mR), (ph / (1 - mT - mB)) * 0.8) / 2) * 2));
    const ch = Math.round(cw * 1.25);
    const availW = Math.round(cw * (1 - mL - mR)), availH = Math.round(ch * (1 - mT - mB));
    const fit = await sharp(prod).resize({ width: availW, height: availH, fit: 'inside' }).toBuffer({ resolveWithObject: true });
    const fw = fit.info.width, fh = fit.info.height;
    const left = touch.l && !touch.r ? 0 : touch.r && !touch.l ? cw - fw : Math.round(cw * mL + (availW - fw) / 2);
    const top = touch.t && !touch.b ? 0 : touch.b && !touch.t ? ch - fh
      : Math.max(0, Math.round(ch * mT + (availH - fh) / 2 - (touch.b ? 0 : ch * 0.015))); // a touch above centre: room for the shadow
    const layers = [{ input: fit.data, left, top }];
    if (!touch.b) {
      const shW = Math.round(fw * 0.72), shH = Math.max(8, Math.round(ch * 0.03));
      const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shW}" height="${shH * 3}"><defs><filter id="b" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="${(shH * 0.55).toFixed(1)}"/></filter></defs><ellipse cx="${shW / 2}" cy="${shH * 1.5}" rx="${shW / 2.1}" ry="${shH * 0.7}" fill="#000" fill-opacity="0.10" filter="url(#b)"/></svg>`);
      layers.unshift({ input: shadow, left: Math.round(left + (fw - shW) / 2), top: Math.max(0, Math.min(ch - shH * 3, top + fh - Math.round(shH * 1.6))) });
    }
    return sharp({ create: { width: cw, height: ch, channels: 3, background: { r: target[0], g: target[1], b: target[2] } } })
      .composite(layers)
      .jpeg(ORIGINAL_JPEG).toBuffer({ resolveWithObject: true });
  }

  const target = CANVAS_W / CANVAS_H;
  const isNear = Math.abs(sw / sh - target) / target <= 0.12;
  const cw = Math.max(480, Math.min(CANVAS_W, Math.round(Math.max(sw, sh * 0.8) / 2) * 2));
  const ch = Math.round(cw * 1.25);
  const base = await enhance(sharp(data), an).jpeg(MID_JPEG).toBuffer();
  let pipeline;
  if (isNear) {
    pipeline = sharp(base).resize(cw, ch, { fit: 'cover', position: sharp.strategy.attention });
  } else if ((pipeline = await frameOnProduct(base))) {
    // Not 4:5, but the product fits in a 4:5 window of the photo: crop around it (real background, no bars)
  } else {
    // Not 4:5 and the product is too wide/tall to crop around: keep the whole photo and let its own edges run on into
    // the empty space (each edge row/column stretched outwards, then softened), so the cloth, wall or floor simply
    // continues — no flat bars, no mirrored copy, no visible frame.
    const fg = await sharp(base).resize({ width: cw, height: ch, fit: 'inside' }).toBuffer({ resolveWithObject: true });
    const fw = fg.info.width, fh = fg.info.height;
    const padT = Math.floor((ch - fh) / 2), padB = ch - fh - padT, padL = Math.floor((cw - fw) / 2), padR = cw - fw - padL;
    const stretched = await sharp(fg.data).extend({ top: padT, bottom: padB, left: padL, right: padR, extendWith: 'copy' }).toBuffer();
    const soft = await sharp(stretched).blur(Math.max(8, Math.round(Math.max(cw, ch) * 0.012))).toBuffer();
    // feather the join so the sharp photo melts into the softened extension
    const fade = Math.max(6, Math.round(Math.min(fw, fh) * 0.03));
    const vertical = fh < ch;
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${fw}" height="${fh}"><defs><linearGradient id="g" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">`
      + `<stop offset="0" stop-color="#000"/><stop offset="${(fade / (vertical ? fh : fw)).toFixed(4)}" stop-color="#fff"/><stop offset="${(1 - fade / (vertical ? fh : fw)).toFixed(4)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/>`
      + `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    const alpha = await sharp(mask).resize(fw, fh).extractChannel(0).raw().toBuffer();
    const { data: rgb } = await sharp(fg.data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = Buffer.alloc(fw * fh * 4);
    for (let i = 0; i < fw * fh; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i]; }
    const top = await sharp(rgba, { raw: { width: fw, height: fh, channels: 4 } }).png().toBuffer();
    pipeline = sharp(soft).composite([{ input: top, left: padL, top: padT }]);
  }
  return pipeline.jpeg(ORIGINAL_JPEG).toBuffer({ resolveWithObject: true });
}

/**
 * Real preview for the upload sheet: how this photo looks on white and on cream (small data URLs).
 * Busy backdrops are cut out once and laid on both colours. { white: null } when the backdrop cannot be changed.
 */
export async function previewStyles(buffer) {
  const small = await sharp(buffer, { failOn: 'error' }).rotate().toColourspace('srgb').flatten({ background: '#ffffff' })
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()
    .then(neutralLight);
  const an = await analyzePhoto(small);
  const thumb = async (img) => `data:image/jpeg;base64,${(await sharp(img.data).resize({ width: 360 }).jpeg({ quality: 78 }).toBuffer()).toString('base64')}`;
  const out = { studio: an.studio, white: null, cream: null };
  if (an.studio) {
    for (const style of ['white', 'cream']) out[style] = await thumb(await productCanvas(small, style, an));
    return out;
  }
  const cut = await cutoutLayer(small);
  if (!cut) return out;
  for (const style of ['white', 'cream']) {
    const bg = STYLE_BG[style];
    out[style] = await thumb(await productCanvas(await cut.onto(bg), style, { ...an, studio: true, cut: true, bg: [...bg] }));
  }
  return out;
}

/** Re-render an existing product image from its stored original into the uniform 4:5 canvas (used by the one-off migration). */
export async function reprocessProductMedia(m) {
  if (m.remote) return; // photos already on R2 are not re-rendered
  const dir = mediaDirFor(m.store_id, m.key);
  const src = await fs.readFile(path.join(dir, 'original.jpg'));
  const normalised = await productCanvas(src);
  const { width, height } = normalised.info;
  await fs.writeFile(path.join(dir, 'original.jpg'), normalised.data);
  const set = IMAGE_SIZES;
  const generated = [];
  let bytes = normalised.data.length;
  for (const [name, w] of Object.entries(set)) {
    if (w > width && generated.length) continue;
    const webp = await renderWebp(normalised.data, name, Math.min(w, width));
    await fs.writeFile(path.join(dir, `${name}.webp`), webp);
    bytes += webp.length;
    generated.push({ name, width: Math.min(w, width) });
  }
  const [lqipBuf, stats] = await Promise.all([
    sharp(normalised.data).resize(24).blur(1.2).webp({ quality: 40 }).toBuffer(),
    sharp(normalised.data).stats(),
  ]);
  const { r, g, b } = stats.dominant;
  q.run('UPDATE media SET width=?, height=?, sizes=?, bytes=?, color=?, lqip=? WHERE id=?', [
    width, height, JSON.stringify(generated), bytes,
    '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''),
    `data:image/webp;base64,${lqipBuf.toString('base64')}`, m.id,
  ]);
}

export async function processImage(buffer, { storeId, kind = 'product', alt = null, fast = false, style: styleOverride = null }) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw badRequest('invalid_image', 'This file is not a supported image.');
  }
  if (!ACCEPTED.has(meta.format)) throw badRequest('invalid_image', 'This file is not a supported image.');

  if (kind === 'product' && Math.min(meta.width || 0, meta.height || 0) < MIN_PRODUCT_SIDE) throw badRequest('image_too_small', 'This image is too small to use.');

  const key = crypto.createHash('sha1').update(buffer).update(String(Date.now() + Math.random())).digest('hex').slice(0, 16);
  // Stage R2-bound images on the container temp area instead of the Railway media volume.
  const dir = r2Enabled ? path.join(os.tmpdir(), 'souqna-r2-media', String(storeId), key) : mediaDirFor(storeId, key);
  await fs.mkdir(dir, { recursive: true });

  // Normalise: honour EXIF orientation, sRGB, strip metadata, cap size.
  const base = sharp(buffer).rotate().toColourspace('srgb');
  let normalised, quality = null, sourceJpeg = null;
  if (kind === 'product') {
    // Uniform look, done automatically (the owner does nothing): see productCanvas().
    // Transparent PNG cut-outs land on white; weak photos are accepted and only score low (never refused).
    const style = styleOverride || storePhotoStyle(storeId); // per-photo override: white | cream | original | asis
    // keep more pixels than the final canvas needs: the product is often only part of the frame
    const cleaned = await base.clone().flatten({ background: '#ffffff' })
      .resize({ width: 3200, height: 3200, fit: 'inside', withoutEnlargement: true })
      .jpeg(MID_JPEG).toBuffer();
    if (fast) { // demo seeding: skip the analysis so the build stays quick
      normalised = await productCanvas(cleaned, 'original', { studio: false, bg: [128, 128, 128], imgMean: 128, imgStd: 60 });
    } else {
      const lit = style === 'asis' ? cleaned : await neutralLight(cleaned); // remove a yellow/blue light cast
      const an = await analyzePhoto(lit);
      quality = await scoreQuality(cleaned, meta.width || 0, meta.height || 0, an);
      normalised = style === 'asis'
        ? await sharp(cleaned).jpeg(ORIGINAL_JPEG).toBuffer({ resolveWithObject: true }) // exactly as shot: only rotated + size-capped
        : await productCanvas(await refinePhoto(lit), style, an);
      // keep the untouched (rotated, size-capped) photo so we can always go back to it
      sourceJpeg = await sharp(cleaned).resize({ width: 2800, height: 2800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
    }
  } else {
    normalised = await base
      .resize({ width: MAX_ORIGINAL, height: MAX_ORIGINAL, fit: 'inside', withoutEnlargement: true })
      .jpeg(ORIGINAL_JPEG)
      .toBuffer({ resolveWithObject: true });
  }
  const { width, height } = normalised.info;
  await fs.writeFile(path.join(dir, 'original.jpg'), normalised.data);
  if (sourceJpeg) await fs.writeFile(path.join(dir, 'source.jpg'), sourceJpeg);

  const set = SIZE_SETS[kind] || IMAGE_SIZES;
  const generated = [];
  let bytes = normalised.data.length;
  for (const [name, w] of Object.entries(set)) {
    // never upscale; the first size above the photo's width is still made, at the photo's full width
    // (otherwise a 700 px photo would only have a 400 px file and look soft on phones)
    if (w > width && generated.some((g) => g.width >= width)) continue;
    const target = Math.min(w, width);
    const webp = await renderWebp(normalised.data, name, target, kind === 'product');
    await fs.writeFile(path.join(dir, `${name}.webp`), webp);
    bytes += webp.length;
    generated.push({ name, width: target });
  }

  const [lqipBuf, stats] = await Promise.all([
    sharp(normalised.data).resize(24).blur(1.2).webp({ quality: 40 }).toBuffer(),
    sharp(normalised.data).stats(),
  ]);
  const { r, g, b } = stats.dominant;
  const color = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

  if (r2Enabled) await publishToR2(storeId, key, dir);

  const id = insert('media', {
    store_id: storeId,
    remote: r2Enabled ? 1 : 0,
    kind,
    key,
    width,
    height,
    sizes: JSON.stringify(generated),
    original_ext: 'jpg',
    bytes: bytes + (sourceJpeg ? sourceJpeg.length : 0),
    color,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
    alt,
    quality,
    canvas_v: kind === 'product' ? 2 : null,
  });
  return getMedia(id);
}

/**
 * Re-make an older product photo that got the "picture inside a frame" look (a non-4:5 photo shown whole with bars).
 * Works from the untouched source.jpg kept since the photo upload; the row keeps its id (products, search and orders
 * still point to it) but gets a NEW key, so browsers and the CDN cannot show the old cached file.
 * Returns what happened: 'no_source' | 'fine' | 'asis' | 'studio' | 'would' (dry run) | 'done'.
 */
export async function refreshProductPhoto(m, { dry = false } = {}) {
  if (m.canvas_v >= 2) return 'fine'; // made (or already re-made) with the new framing
  let src;
  try { src = await readMediaFile(m, 'source.jpg'); } catch { return 'no_source'; }
  const meta = await sharp(src).metadata();
  const r = CANVAS_W / CANVAS_H;
  if (Math.abs(meta.width / meta.height - r) / r <= 0.12) return 'fine'; // was already ~4:5: no frame was added
  if (Math.abs(m.width / m.height - r) / r > 0.03) return 'asis'; // owner chose "exactly as shot": leave it
  if ((await analyzePhoto(src)).studio) return 'studio'; // plain light backdrop: already a clean studio canvas
  if (dry) return 'would';
  const fresh = await processImage(src, { storeId: m.store_id, kind: 'product', style: storePhotoStyle(m.store_id) });
  tx(() => {
    q.run('UPDATE media SET key=?, width=?, height=?, sizes=?, original_ext=?, bytes=?, color=?, lqip=?, remote=?, quality=?, canvas_v=2 WHERE id=?',
      [fresh.key, fresh.width, fresh.height, fresh.sizes, fresh.original_ext, fresh.bytes, fresh.color, fresh.lqip, fresh.remote, fresh.quality ?? null, m.id]);
    q.run('DELETE FROM media WHERE id=?', [fresh.id]);
  });
  await purgeMediaFiles(m); // the old key's files
  return 'done';
}

export function getMedia(id) {
  return id ? q.get('SELECT * FROM media WHERE id=?', [id]) : null;
}

/** Public shape consumed by the <SmartImage> component. */
export function serializeMedia(m) {
  if (!m) return null;
  const sizes = typeof m.sizes === 'string' ? JSON.parse(m.sizes) : m.sizes;
  return {
    id: m.id,
    w: m.width,
    h: m.height,
    color: m.color,
    lqip: m.lqip,
    alt: m.alt || '',
    q: m.quality ?? null,
    base: `${m.remote ? config.r2.publicUrl : config.mediaBaseUrl}/${m.store_id}/${m.key}`,
    sizes, // [{ name, width }]
    formats: ['webp', 'jpg'],
  };
}

/** Batch-load media rows by id (avoids N+1 queries in listings). */
export function mediaMap(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = q.all(`SELECT * FROM media WHERE id IN (${uniq.map(() => '?').join(',')})`, uniq);
  return new Map(rows.map((r) => [r.id, serializeMedia(r)]));
}

export async function deleteMedia(m) {
  if (!m) return;
  q.run('DELETE FROM media WHERE id=?', [m.id]);
  await purgeMediaFiles(m);
}
