/**
 * Look photos (a person wearing the outfit) are shot on a plain light background. On the stage the models stand next to
 * each other, so a photo that keeps its background shows up as a grey rectangle. This removes that background: a flood fill
 * that starts at the border of the photo and spreads only through pixels that are close to the background colour AND smooth
 * from one pixel to the next, so a white shirt next to a grey wall is not eaten (the jump at its edge stops the fill).
 * Anything unusual (a busy background, a fill that eats almost everything or almost nothing) leaves the photo untouched.
 * LOOK_CUTOUT=0 turns it off.
 */
import sharp from 'sharp';

const TO_BG = 44;   // how far (RGB distance) a pixel may be from the background colour to count as background
const STEP = 14;    // how much a pixel may differ from the neighbour the fill came from

export const cutoutEnabled = () => process.env.LOOK_CUTOUT !== '0';

/** @param {Buffer} input any image sharp can read. @returns {Promise<{buffer: Buffer|null, removed: number}>} buffer is a PNG with alpha, or null when the photo was left alone */
export async function knockOutBackground(input) {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  // the background colour = the median colour of the photo's border
  const rs = [], gs = [], bs = [];
  const border = (x, y) => { const i = (y * w + x) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); };
  for (let x = 0; x < w; x += 3) { border(x, 0); border(x, h - 1); }
  for (let y = 0; y < h; y += 3) { border(0, y); border(w - 1, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const bg = [med(rs), med(gs), med(bs)];
  const lightness = (bg[0] + bg[1] + bg[2]) / 3;
  if (lightness < 150) return { buffer: null, removed: 0 }; // only light studio backgrounds
  const dist2 = (i, r, g, b) => (data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2;
  const farBorder = rs.reduce((c, _, k) => c + ((rs[k] - bg[0]) ** 2 + (gs[k] - bg[1]) ** 2 + (bs[k] - bg[2]) ** 2 > TO_BG * TO_BG ? 1 : 0), 0);
  if (farBorder > rs.length * 0.18) return { buffer: null, removed: 0 }; // the border is busy: not a plain background

  const bgMask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (p) => { if (!bgMask[p]) { bgMask[p] = 1; queue[tail++] = p; } };
  const T2 = TO_BG * TO_BG, S2 = STEP * STEP;
  const seed = (x, y) => { const p = y * w + x; if (dist2(p * 4, bg[0], bg[1], bg[2]) <= T2) push(p); };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (head < tail) {
    const p = queue[head++]; const x = p % w; const y = (p - x) / w; const i = p * 4;
    const tryN = (q) => {
      if (bgMask[q]) return;
      const j = q * 4;
      if (dist2(j, bg[0], bg[1], bg[2]) <= T2 && dist2(j, data[i], data[i + 1], data[i + 2]) <= S2) push(q);
    };
    if (x > 0) tryN(p - 1); if (x < w - 1) tryN(p + 1); if (y > 0) tryN(p - w); if (y < h - 1) tryN(p + w);
  }
  const removed = tail / n;
  if (removed < 0.2 || removed > 0.93) return { buffer: null, removed }; // nothing to cut, or it would eat the person

  // alpha = 0 on the background, 255 on the person; soften the edge by one pixel so the outline is not jagged
  const alpha = Buffer.alloc(n);
  for (let p = 0; p < n; p++) alpha[p] = bgMask[p] ? 0 : 255;
  const { data: soft, info: softInfo } = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(0.9).raw().toBuffer({ resolveWithObject: true });
  const sc = softInfo.channels; // sharp may hand back more than one channel
  const out = Buffer.from(data);
  for (let p = 0; p < n; p++) out[p * 4 + 3] = soft[p * sc];
  const buffer = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return { buffer, removed };
}
