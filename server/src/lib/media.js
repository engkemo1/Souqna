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
import { IMAGE_SIZES } from '@souqna/shared';
import { config } from '../config.js';
import { q, insert } from '../db/index.js';
import { badRequest } from './errors.js';
import { r2Enabled, r2Put, r2Delete, r2Get } from './r2.js';

/** One WebP rendition. Settings chosen by SSIM measurement on real catalogue photos: ~-16% bytes for a <0.005 SSIM change (invisible). */
export const renderWebp = (buf, name, width) =>
  sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: name === 'thumb' ? 66 : 74, effort: 6, smartSubsample: true }).toBuffer();
const ORIGINAL_JPEG = { quality: 82, mozjpeg: true };

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
 *  - anything else (people, street, busy scenes), or style "original": near-4:5 → gentle cover crop; otherwise the whole photo is kept over a soft blurred copy of itself.
 */
async function productCanvas(data, style = 'original', analysis = null) {
  const meta = await sharp(data).metadata();
  const { width: sw, height: sh } = meta;
  const an = analysis || await analyzePhoto(data);

  if (style !== 'original' && STYLE_BG[style] && an.studio) {
    const target = STYLE_BG[style];
    const gains = an.bg.map((v, i) => Math.max(0.88, Math.min(1.17, target[i] / Math.max(v, 1))));
    const leveled = await enhance(sharp(data).linear(gains, [0, 0, 0]), an).jpeg({ quality: 95 }).toBuffer();
    let prod = leveled, pw = sw, ph = sh;
    try {
      const t = await sharp(leveled).trim({ background: hex(target), threshold: 14 }).jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
      if (t.info.width * t.info.height >= sw * sh * 0.12 && t.info.width > 40 && t.info.height > 40) { prod = t.data; pw = t.info.width; ph = t.info.height; }
    } catch { /* nothing to trim */ }
    const M = 0.07;
    const cw = Math.max(480, Math.min(CANVAS_W, Math.round(Math.max(pw / (1 - 2 * M), (ph / (1 - 2 * M)) * 0.8) / 2) * 2));
    const ch = Math.round(cw * 1.25);
    const fit = await sharp(prod).resize({ width: Math.round(cw * (1 - 2 * M)), height: Math.round(ch * (1 - 2 * M)), fit: 'inside' }).toBuffer({ resolveWithObject: true });
    const left = Math.round((cw - fit.info.width) / 2), top = Math.round((ch - fit.info.height) / 2);
    const shW = Math.round(fit.info.width * 0.72), shH = Math.max(8, Math.round(ch * 0.03));
    const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shW}" height="${shH * 3}"><defs><filter id="b" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="${(shH * 0.55).toFixed(1)}"/></filter></defs><ellipse cx="${shW / 2}" cy="${shH * 1.5}" rx="${shW / 2.1}" ry="${shH * 0.7}" fill="#000" fill-opacity="0.10" filter="url(#b)"/></svg>`);
    return sharp({ create: { width: cw, height: ch, channels: 3, background: { r: target[0], g: target[1], b: target[2] } } })
      .composite([
        { input: shadow, left: Math.round((cw - shW) / 2), top: Math.max(0, Math.min(ch - shH * 3, top + fit.info.height - Math.round(shH * 1.6))) },
        { input: fit.data, left, top },
      ])
      .jpeg(ORIGINAL_JPEG).toBuffer({ resolveWithObject: true });
  }

  const target = CANVAS_W / CANVAS_H;
  const isNear = Math.abs(sw / sh - target) / target <= 0.12;
  const cw = Math.max(480, Math.min(CANVAS_W, Math.round(Math.max(sw, sh * 0.8) / 2) * 2));
  const ch = Math.round(cw * 1.25);
  const base = await enhance(sharp(data), an).jpeg({ quality: 95 }).toBuffer();
  let pipeline;
  if (isNear) {
    pipeline = sharp(base).resize(cw, ch, { fit: 'cover', position: sharp.strategy.attention });
  } else {
    const [bg, fg] = await Promise.all([
      sharp(base).resize(cw, ch, { fit: 'cover' }).blur(40).modulate({ brightness: 1.06, saturation: 0.9 }).toBuffer(),
      sharp(base).resize({ width: cw, height: ch, fit: 'inside' }).toBuffer(),
    ]);
    pipeline = sharp(bg).composite([{ input: fg, gravity: 'centre' }]);
  }
  return pipeline.jpeg(ORIGINAL_JPEG).toBuffer({ resolveWithObject: true });
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
    const cleaned = await base.clone().flatten({ background: '#ffffff' })
      .resize({ width: MAX_ORIGINAL, height: MAX_ORIGINAL, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 }).toBuffer();
    if (fast) { // demo seeding: skip the analysis so the build stays quick
      normalised = await productCanvas(cleaned, 'original', { studio: false, bg: [128, 128, 128], imgMean: 128, imgStd: 60 });
    } else {
      const an = await analyzePhoto(cleaned);
      quality = await scoreQuality(cleaned, meta.width || 0, meta.height || 0, an);
      normalised = style === 'asis'
        ? await sharp(cleaned).jpeg(ORIGINAL_JPEG).toBuffer({ resolveWithObject: true }) // exactly as shot: only rotated + size-capped
        : await productCanvas(cleaned, style, an);
      // keep the untouched (rotated, size-capped) photo so we can always go back to it
      sourceJpeg = await sharp(cleaned).resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
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
    // never upscale; always keep the smallest rendition so cards have something light to load
    if (w > width && generated.length) continue;
    const target = Math.min(w, width);
    const webp = await renderWebp(normalised.data, name, target);
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
  });
  return getMedia(id);
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
