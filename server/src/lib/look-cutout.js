/**
 * Look photos (a person wearing the outfit) are shot on a plain light background. On the stage the models stand next to
 * each other, so a photo that keeps its background shows up as a grey rectangle. This removes that background: a flood fill
 * that starts at the border of the photo and spreads only through pixels that are close to the background colour AND smooth
 * from one pixel to the next, so a white shirt next to a grey wall is not eaten (the jump at its edge stops the fill).
 * Anything unusual (a busy background, a fill that eats almost everything or almost nothing) leaves the photo untouched.
 * LOOK_CUTOUT=0 turns it off.
 */
import sharp from 'sharp';
import { personAlpha, cutoutEnabled as mlEnabled } from './cutout.js';

const TO_BG = 44;   // how far (RGB distance) a pixel may be from the background colour to count as background
const STEP = 14;    // how much a pixel may differ from the neighbour the fill came from

export const cutoutEnabled = () => process.env.LOOK_CUTOUT !== '0';

/** @param {Buffer} input any image sharp can read. @returns {Promise<{buffer: Buffer|null, removed: number, already?: boolean}>} buffer is a PNG with alpha, or null when the photo was left alone */
async function floodKnockOut(input) {
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
  // a photo whose border is already transparent was cut before
  let clear = 0; for (let x = 0; x < w; x += 3) { if (data[x * 4 + 3] < 128) clear++; if (data[((h - 1) * w + x) * 4 + 3] < 128) clear++; }
  if (clear > w * 0.3) return { buffer: null, removed: 0, already: true };
  const lightness = (bg[0] + bg[1] + bg[2]) / 3;
  if (lightness < 150) return { buffer: null, removed: 0 }; // only light studio backgrounds
  const dist2 = (i, r, g, b) => (data[i] - r) ** 2 + (data[i + 1] - g) ** 2 + (data[i + 2] - b) ** 2;
  const farBorder = rs.reduce((c, _, k) => c + ((rs[k] - bg[0]) ** 2 + (gs[k] - bg[1]) ** 2 + (bs[k] - bg[2]) ** 2 > TO_BG * TO_BG ? 1 : 0), 0);
  if (farBorder > rs.length * 0.18) return { buffer: null, removed: 0 }; // the border is busy: not a plain background

  const T_FIRST = TO_BG;
  // Try the usual tolerance first; if the cut would take pieces of the person with it (white trousers on a light wall), try tighter ones.
  // A cut is accepted only when the person is still whole: tall enough and with no empty rows between head and feet.
  const attempt = (toBg, step) => {
    const mask = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    const push = (p) => { if (!mask[p]) { mask[p] = 1; queue[tail++] = p; } };
    const T2 = toBg * toBg, S2 = step * step;
    const seed = (x, y) => { const p = y * w + x; if (dist2(p * 4, bg[0], bg[1], bg[2]) <= T2) push(p); };
    for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
    for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
    while (head < tail) {
      const p = queue[head++]; const x = p % w; const y = (p - x) / w; const i2 = p * 4;
      const tryN = (q2) => {
        if (mask[q2]) return;
        const j2 = q2 * 4;
        if (dist2(j2, bg[0], bg[1], bg[2]) <= T2 && dist2(j2, data[i2], data[i2 + 1], data[i2 + 2]) <= S2) push(q2);
      };
      if (x > 0) tryN(p - 1); if (x < w - 1) tryN(p + 1); if (y > 0) tryN(p - w); if (y < h - 1) tryN(p + w);
    }
    const removed = tail / n;
    if (removed < 0.2 || removed > 0.93) return { ok: false, removed };
    // the person (what is kept): its height, and rows with nobody in them between the top and the bottom
    const rowCount = new Int32Array(h);
    for (let y = 0; y < h; y++) { let c = 0; const base = y * w; for (let x = 0; x < w; x++) if (!mask[base + x]) c++; rowCount[y] = c; }
    const minRow = Math.max(3, Math.round(w * 0.004));
    let top = 0; while (top < h && rowCount[top] < minRow) top++;
    let bottom = h - 1; while (bottom > top && rowCount[bottom] < minRow) bottom--;
    if (bottom - top < h * 0.7) return { ok: false, removed };
    let empty = 0; for (let y = top; y <= bottom; y++) if (rowCount[y] < minRow) empty++;
    if (empty > (bottom - top) * 0.03) return { ok: false, removed };
    return { ok: true, removed, mask };
  };
  let result = null;
  for (const [toBg, step] of [[T_FIRST, STEP], [30, 9], [20, 6]]) { result = attempt(toBg, step); if (result.ok) break; }
  if (!result.ok) return { buffer: null, removed: result.removed };
  const bgMask = result.mask; const removed = result.removed;
  // A colour fill leaks into pale clothing through thin channels (a cream hoodie next to a light wall). Opening the
  // background mask (erode, then dilate) closes those channels and hands the clothing back; real gaps are wide and survive.
  {
    const R = Math.max(2, Math.round(Math.min(w, h) * 0.006));
    const raw1 = { raw: { width: w, height: h, channels: 1 } };
    const bin = Buffer.alloc(n); for (let p = 0; p < n; p++) bin[p] = bgMask[p] ? 255 : 0;
    const blurred = async (b) => { const o = await sharp(b, raw1).blur(R).raw().toBuffer({ resolveWithObject: true }); return [o.data, o.info.channels]; };
    const [e1, c1] = await blurred(bin);
    const er = Buffer.alloc(n); for (let p = 0; p < n; p++) er[p] = e1[p * c1] > 235 ? 255 : 0;
    const [d1, c2] = await blurred(er);
    for (let p = 0; p < n; p++) if (bgMask[p] && d1[p * c2] <= 25) bgMask[p] = 0;
  }

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

/**
 * Cuts the background of a look photo. First the repo's ISNet model (it understands "a person", so pale clothing stays);
 * if it is off, missing or unsure, the colour fill above is the fallback. Either way the person must still be whole.
 */
export async function knockOutBackground(input) {
  { // a photo whose border is already transparent was cut before
    const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info; let clear = 0;
    for (let x = 0; x < w; x += 3) { if (data[x * 4 + 3] < 128) clear++; if (data[((h - 1) * w + x) * 4 + 3] < 128) clear++; }
    if (clear > w * 0.3) return { buffer: null, removed: 0, already: true };
  }
  if (mlEnabled()) {
    try {
      const m = await personAlpha(input);
      if (m) {
        const { alpha, width: w, height: h } = m;
        const n = w * h;
        const rows = new Int32Array(h); let on = 0;
        for (let y = 0; y < h; y++) { let c = 0; for (let x = 0, p = y * w; x < w; x++, p++) if (alpha[p] > 127) c++; rows[y] = c; on += c; }
        const cover = on / n, minRow = Math.max(3, Math.round(w * 0.004));
        let top = 0; while (top < h && rows[top] < minRow) top++;
        let bottom = h - 1; while (bottom > top && rows[bottom] < minRow) bottom--;
        let empty = 0; for (let y = top; y <= bottom; y++) if (rows[y] < minRow) empty++;
        const whole = cover >= 0.06 && cover <= 0.9 && bottom - top >= h * 0.7 && empty <= (bottom - top) * 0.03;
        if (whole) {
          const { data } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          const out = Buffer.from(data);
          for (let p = 0; p < n; p++) out[p * 4 + 3] = alpha[p];
          const buffer = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
          return { buffer, removed: 1 - cover, ml: true };
        }
      }
    } catch (e) { console.error(`[look-cutout] model cut skipped: ${e.message}`); }
  }
  return floodKnockOut(input);
}
