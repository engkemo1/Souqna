/** Featured-ad image processing. Keeps the original aspect ratio (the admin's zoom/focal controls do the cropping in CSS)
 *  and re-encodes to WebP, which keeps transparency for the foreground image. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest } from './errors.js';
import { r2Enabled, r2Put } from './r2.js';

const KINDS = {
  bg: { min: [600, 300], max: 2000, quality: 80 },
  fg: { min: [80, 80], max: 1200, quality: 85 },
};

export async function saveAdImage(buffer, kind = 'bg') {
  const k = KINDS[kind] || KINDS.bg;
  let webp;
  try {
    const meta = await sharp(buffer, { failOn: 'error' }).metadata();
    if (kind === 'bg' && ((meta.width || 0) < k.min[0] || (meta.height || 0) < k.min[1]) && ((meta.width || 0) < k.min[1] || (meta.height || 0) < k.min[0])) {
      throw badRequest('image_too_small', 'Image must be at least 600×300px.');
    }
    if (kind === 'fg' && Math.min(meta.width || 0, meta.height || 0) < k.min[0]) throw badRequest('image_too_small', 'Image is too small.');
    webp = await sharp(buffer).rotate()
      .resize(k.max, k.max, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: k.quality, effort: 4 }).toBuffer();
  } catch (e) {
    if (e.code === 'image_too_small') throw e;
    throw badRequest('invalid_image', 'This file is not a supported image.');
  }
  const name = `homepage-ads/${crypto.randomBytes(12).toString('hex')}.webp`;
  let url;
  if (r2Enabled) { await r2Put(name, webp); url = `${config.r2.publicUrl}/${name}`; }
  else {
    const file = path.join(config.mediaDir, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, webp);
    url = `${config.mediaBaseUrl}/${name}`;
  }
  return { image: url, bytes: webp.length, originalBytes: buffer.length };
}
