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

test('look cutout: white trousers on a light wall are never eaten (the cut is skipped or the legs stay)', async () => {
  const body = '<circle cx="200" cy="80" r="40" fill="#d9b49a"/><rect x="140" y="125" width="120" height="150" rx="20" fill="#2f2f33"/><rect x="150" y="270" width="40" height="190" fill="#fbfbf9"/><rect x="210" y="270" width="40" height="190" fill="#fbfbf9"/><rect x="145" y="455" width="50" height="25" fill="#ffffff"/><rect x="205" y="455" width="50" height="25" fill="#ffffff"/>';
  const input = await sharp(await sharp(svg('#eeeeec', body)).blur(1.6).png().toBuffer()).jpeg({ quality: 88 }).toBuffer();
  const { buffer } = await knockOutBackground(input);
  if (buffer) {
    assert.equal(await alphaAt(buffer, 170, 380), 255, 'the white trousers must stay');
    assert.equal(await alphaAt(buffer, 170, 468), 255, 'the white shoes must stay');
    assert.equal(await alphaAt(buffer, 10, 10), 0);
  } // otherwise the photo was left alone, which is also fine
});

test('look cutout (colour fallback): a cream hoodie next to a light wall keeps its middle even when a thin gap lets the fill in', async () => {
  // a dark outline around the hoodie with a 2px gap on the left: the fill leaks through it into the cream
  const body = '<circle cx="200" cy="80" r="40" fill="#d9b49a"/>'
    + '<rect x="130" y="125" width="140" height="170" rx="18" fill="#ece6d6" stroke="#8a8478" stroke-width="3"/>'
    + '<rect x="127" y="200" width="6" height="2" fill="#ece6d6"/>'
    + '<rect x="150" y="290" width="40" height="190" fill="#4a6a99"/><rect x="210" y="290" width="40" height="190" fill="#4a6a99"/>';
  const input = await sharp(svg('#f2f2f2', body)).png().toBuffer();
  const prev = process.env.BG_REMOVAL; process.env.BG_REMOVAL = '0'; // the colour fill, not the model
  let res; try { res = await knockOutBackground(input); } finally { if (prev === undefined) delete process.env.BG_REMOVAL; else process.env.BG_REMOVAL = prev; }
  if (res.buffer) {
    assert.equal(await alphaAt(res.buffer, 200, 210), 255, 'the hoodie centre must stay opaque');
    assert.equal(await alphaAt(res.buffer, 150, 150), 255);
    assert.equal(await alphaAt(res.buffer, 20, 20), 0);
  }
});
