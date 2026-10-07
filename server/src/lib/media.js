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
 * Each rendition is written as WebP (primary) and JPEG (fallback).
 * A 24px LQIP and dominant colour are stored for blur-up placeholders
 * so layouts never jump while images load.
 *
 * Storage is a plain directory tree keyed by store + content hash, so it
 * can be synced to S3/R2 and fronted by any CDN by setting MEDIA_BASE_URL.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { IMAGE_SIZES } from '@souqna/shared';
import { config } from '../config.js';
import { q, insert } from '../db/index.js';
import { badRequest } from './errors.js';

sharp.cache(false);
sharp.concurrency(2);

const SIZE_SETS = {
  product: IMAGE_SIZES,
  category: { thumb: 160, sm: 400, md: 800 },
  logo: { thumb: 160, sm: 400 },
  banner: { sm: 400, md: 800, lg: 1400, xl: 2000 },
  cover: { sm: 400, md: 800, lg: 1400 },
};
const MAX_ORIGINAL = 2400;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff', 'gif']);

export function mediaDirFor(storeId, key) {
  return path.join(config.mediaDir, String(storeId), key);
}

export async function processImage(buffer, { storeId, kind = 'product', alt = null }) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw badRequest('invalid_image', 'This file is not a supported image.');
  }
  if (!ACCEPTED.has(meta.format)) throw badRequest('invalid_image', 'This file is not a supported image.');

  const key = crypto.createHash('sha1').update(buffer).update(String(Date.now() + Math.random())).digest('hex').slice(0, 16);
  const dir = mediaDirFor(storeId, key);
  await fs.mkdir(dir, { recursive: true });

  // Normalise: honour EXIF orientation, sRGB, strip metadata, cap size.
  const base = sharp(buffer).rotate().toColourspace('srgb');
  const normalised = await base
    .resize({ width: MAX_ORIGINAL, height: MAX_ORIGINAL, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = normalised.info;
  await fs.writeFile(path.join(dir, 'original.jpg'), normalised.data);

  const set = SIZE_SETS[kind] || IMAGE_SIZES;
  const generated = [];
  let bytes = normalised.data.length;
  for (const [name, w] of Object.entries(set)) {
    // never upscale; always keep the smallest rendition so cards have something light to load
    if (w > width && generated.length) continue;
    const target = Math.min(w, width);
    const pipeline = sharp(normalised.data).resize({ width: target, withoutEnlargement: true });
    const [webp, jpg] = await Promise.all([
      pipeline.clone().webp({ quality: name === 'thumb' ? 70 : 78, effort: 4 }).toBuffer(),
      pipeline.clone().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer(),
    ]);
    await Promise.all([fs.writeFile(path.join(dir, `${name}.webp`), webp), fs.writeFile(path.join(dir, `${name}.jpg`), jpg)]);
    bytes += webp.length + jpg.length;
    generated.push({ name, width: target });
  }

  const [lqipBuf, stats] = await Promise.all([
    sharp(normalised.data).resize(24).blur(1.2).webp({ quality: 40 }).toBuffer(),
    sharp(normalised.data).stats(),
  ]);
  const { r, g, b } = stats.dominant;
  const color = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

  const id = insert('media', {
    store_id: storeId,
    kind,
    key,
    width,
    height,
    sizes: JSON.stringify(generated),
    original_ext: 'jpg',
    bytes,
    color,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
    alt,
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
    base: `${config.mediaBaseUrl}/${m.store_id}/${m.key}`,
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
  await fs.rm(mediaDirFor(m.store_id, m.key), { recursive: true, force: true });
}
