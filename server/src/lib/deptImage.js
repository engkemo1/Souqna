/** Department photos (managed from the admin). Stored on R2 when configured, otherwise on the media volume. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest } from './errors.js';
import { r2Enabled, r2Put, r2Delete } from './r2.js';

export async function saveDeptImage(buffer, slug) {
  let webp;
  try {
    const meta = await sharp(buffer, { failOn: 'error' }).metadata();
    if (Math.min(meta.width || 0, meta.height || 0) < 200) throw badRequest('image_too_small', 'Image is too small (min 200px).');
    webp = await sharp(buffer).rotate().resize(480, 480, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 80 }).toBuffer();
  } catch (e) {
    if (e.code === 'image_too_small') throw e;
    throw badRequest('invalid_image', 'This file is not a supported image.');
  }
  const name = `departments/${slug}-${crypto.randomBytes(4).toString('hex')}.webp`;
  if (r2Enabled) { await r2Put(name, webp); return `${config.r2.publicUrl}/${name}`; }
  const file = path.join(config.mediaDir, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, webp);
  return `${config.mediaBaseUrl}/${name}`;
}

/** Best-effort removal of a previously saved department photo. */
export async function removeDeptImage(url) {
  if (!url) return;
  try {
    const name = url.slice(url.indexOf('departments/'));
    if (!name.startsWith('departments/')) return;
    if (url.startsWith(config.r2.publicUrl) && r2Enabled) await r2Delete(name);
    else await fs.rm(path.join(config.mediaDir, name), { force: true });
  } catch { /* ignore */ }
}
