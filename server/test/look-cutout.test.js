import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { knockOutBackground } from '../src/lib/look-cutout.js';

const svg = (bg, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${bg}"/>${body}</svg>`);
const person = '<circle cx="200" cy="80" r="40" fill="#d9b49a"/><rect x="140" y="125" width="120" height="170" rx="20" fill="#ffffff"/><rect x="150" y="290" width="40" height="190" fill="#4a6a99"/><rect x="210" y="290" width="40" height="190" fill="#4a6a99"/>';
const alphaAt = async (png, x, y) => { const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }); return data[(y * info.width + x) * info.channels + 3]; };

test('look cutout: a plain grey studio background becomes transparent and a white shirt stays', async () => {
  const input = await sharp(svg('#e6e6e4', person)).jpeg({ quality: 92 }).toBuffer();
  const { buffer, removed } = await knockOutBackground(input);
  assert.ok(buffer, 'the photo should be cut');
  assert.ok(removed > 0.5 && removed < 0.9, `removed ${removed}`);
  assert.equal(await alphaAt(buffer, 5, 5), 0);
  assert.equal(await alphaAt(buffer, 395, 495), 0);
  assert.equal(await alphaAt(buffer, 200, 80), 255);   // face
  assert.equal(await alphaAt(buffer, 200, 200), 255);  // white shirt must NOT be removed
  assert.equal(await alphaAt(buffer, 170, 400), 255);  // leg
  assert.equal(await alphaAt(buffer, 120, 200), 0);    // background beside the shirt
});

test('look cutout: a busy or dark background is left alone', async () => {
  const stripes = Array.from({ length: 20 }, (_, i) => `<rect x="${i * 20}" width="10" height="500" fill="${i % 2 ? '#222' : '#c33'}"/>`).join('');
  assert.equal((await knockOutBackground(await sharp(svg('#333', stripes + person)).png().toBuffer())).buffer, null);
  assert.equal((await knockOutBackground(await sharp(svg('#202020', person)).png().toBuffer())).buffer, null);
});

test('look cutout: an empty photo (nothing to cut) is left alone', async () => {
  assert.equal((await knockOutBackground(await sharp(svg('#f4f4f4', '')).png().toBuffer())).buffer, null);
});
