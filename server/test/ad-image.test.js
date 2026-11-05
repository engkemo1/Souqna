import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

process.env.MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-img-'));
process.env.DB_FILE = path.join(os.tmpdir(), `souqna-adimg-${randomUUID()}.db`);
process.env.JWT_SECRET = `adimg-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'adimg-admin-key-0123456789';

const png = (w, h, alpha = false) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 30, b: 60, alpha: alpha ? 0 : 1 } } }).png().toBuffer();

test('ad images: big backgrounds are shrunk without cropping; small ones rejected', async () => {
  const { saveAdImage } = await import('../src/lib/adImage.js');
  const big = await png(3200, 1800);
  const r = await saveAdImage(big, 'bg');
  assert.ok(r.image.endsWith('.webp'));
  assert.ok(r.bytes < r.originalBytes);
  const file = path.join(process.env.MEDIA_DIR, r.image.split('/homepage-ads/')[1] ? `homepage-ads/${r.image.split('/homepage-ads/')[1]}` : '');
  const m = await sharp(file).metadata();
  assert.equal(m.width, 2000); assert.equal(m.height, 1125); // same 16:9 ratio, not cropped
  const tiny = await png(300, 100);
  await assert.rejects(() => saveAdImage(tiny, 'bg'), (e) => e.code === 'image_too_small');
  await assert.rejects(() => saveAdImage(Buffer.from('not an image'), 'bg'), (e) => e.code === 'invalid_image');
  // portrait mobile image is accepted
  const p = await saveAdImage(await png(900, 1400), 'bg');
  assert.ok(p.image);
});

test('ad images: foreground keeps transparency and aspect ratio', async () => {
  const { saveAdImage } = await import('../src/lib/adImage.js');
  const r = await saveAdImage(await png(1500, 900, true), 'fg');
  const file = path.join(process.env.MEDIA_DIR, `homepage-ads/${r.image.split('/homepage-ads/')[1]}`);
  const m = await sharp(file).metadata();
  assert.equal(m.width, 1200); assert.equal(m.height, 720); assert.equal(m.hasAlpha, true);
});
