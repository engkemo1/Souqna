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
 * Polishes the alpha of a cut-out person photo (RGBA, raw). Fixes what the eye catches on the stage:
 *  1. floating leftovers (a white patch near the feet, a speck of wall) -> only the big shapes are kept;
 *  2. ragged / blocky outline (the model works at a small size) -> smoothed, pulled in by about a pixel;
 *  3. white fringe: pixels at the edge still carry the studio's white. Their colour is replaced by the colour of the
 *     nearest solid clothing, and near-pure-white pixels right on the rim fade out.
 * Never touches the inside of the person.
 */
async function polishRgba(data, w, h, { aggressive = false } = {}) {
  const n = w * h;
  const raw1 = { raw: { width: w, height: h, channels: 1 } };
  // 0. white leftovers of the studio wall that the cut missed (a strip along the trousers, the wedge between the legs, a patch next to a
  //    hand): near-pure-white pixels that are connected to the transparent area are background too. A white garment would be eaten
  //    the same way, so when this would remove a big part of the person it is skipped and the photo keeps the cut it came with.
  {
    const white = (i) => { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const lo = Math.min(r, g, b); return lo > 222 && Math.max(r, g, b) - lo < 30; };
    const seen = new Uint8Array(n); const st = new Int32Array(n); let sp = 0, person = 0, killed = 0;
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] >= 128) person++;
    const edge = (j) => { if (!seen[j] && data[j * 4 + 3] >= 128 && white(j)) { seen[j] = 1; st[sp++] = j; } };
    for (let i = 0; i < n; i++) {
      if (data[i * 4 + 3] >= 128) continue;
      const x = i % w; edge(x > 0 ? i - 1 : i); edge(x < w - 1 ? i + 1 : i); edge(i >= w ? i - w : i); edge(i < n - w ? i + w : i);
    }
    const hit = [];
    while (sp) {
      const i = st[--sp]; hit.push(i); killed++; const x = i % w;
      if (x > 0) edge(i - 1); if (x < w - 1) edge(i + 1); if (i >= w) edge(i - w); if (i < n - w) edge(i + w);
    }
    if (aggressive && killed <= person * 0.18) for (const i of hit) data[i * 4 + 3] = 0;
  }
  // 1. keep the large connected shapes only
  const label = new Int32Array(n); const stack = new Int32Array(n); const sizes = [0];
  let next = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (label[s0] || data[s0 * 4 + 3] < 128) continue;
    next++; let sp = 0, size = 0; stack[sp++] = s0; label[s0] = next;
    while (sp) {
      const i = stack[--sp]; size++; const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
      for (const j of nb) if (j >= 0 && !label[j] && data[j * 4 + 3] >= 128) { label[j] = next; stack[sp++] = j; }
    }
    sizes.push(size);
  }
  if (!next) return null;
  const biggest = Math.max(...sizes);
  const bin = Buffer.alloc(n);
  for (let i = 0; i < n; i++) if (label[i] && sizes[label[i]] >= biggest * 0.03) bin[i] = 255;
  // 2. smooth the outline and pull it in slightly
  const sigma = Math.max(1, Math.min(w, h) * 0.0015);
  const soft = await sharp(bin, raw1).blur(sigma).extractChannel(0).raw().toBuffer();
  const alpha = Buffer.alloc(n);
  for (let i = 0; i < n; i++) { const v = (soft[i] - 120) * (255 / 115); alpha[i] = v <= 0 ? 0 : v >= 255 ? 255 : v; }
  const rimSigma = Math.max(2, Math.min(w, h) * 0.003);
  const inside = await sharp(bin, raw1).blur(rimSigma).extractChannel(0).raw().toBuffer(); // < 235: within a few pixels of the outline
  // 3. colour: take the colour of the solid interior for every pixel that is not fully solid
  const solid = Buffer.alloc(n); const rgbSolid = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) if (alpha[i] === 255 && inside[i] > 250) { solid[i] = 255; rgbSolid[i * 3] = data[i * 4]; rgbSolid[i * 3 + 1] = data[i * 4 + 1]; rgbSolid[i * 3 + 2] = data[i * 4 + 2]; }
  const rad = Math.max(5, Math.round(Math.min(w, h) * 0.006));
  const [wMap, cMap] = await Promise.all([
    sharp(solid, raw1).blur(rad).extractChannel(0).raw().toBuffer(),
    sharp(rgbSolid, { raw: { width: w, height: h, channels: 3 } }).blur(rad).raw().toBuffer(),
  ]);
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = alpha[i];
    if (a < 255 && wMap[i] > 4) { const k = 255 / wMap[i]; r = Math.min(255, cMap[i * 3] * k); g = Math.min(255, cMap[i * 3 + 1] * k); b = Math.min(255, cMap[i * 3 + 2] * k); }
    else if (aggressive && a > 0 && inside[i] < 235) { // the rim just inside the outline: a white-ish pixel there is studio, not clothing
      const lo = Math.min(r, g, b), spread = Math.max(r, g, b) - lo;
      if (lo > 222 && spread < 26) { a = Math.max(0, a - (lo - 222) * 14); if (wMap[i] > 4) { const k = 255 / wMap[i]; r = Math.min(255, cMap[i * 3] * k); g = Math.min(255, cMap[i * 3 + 1] * k); b = Math.min(255, cMap[i * 3 + 2] * k); } }
    }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return out;
}

/** Polish an RGBA/PNG/WebP buffer that is already cut (transparent background). Returns a PNG buffer, or null when it has no person in it. */
export async function polishCutImage(input, opts = {}) {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = await polishRgba(data, info.width, info.height, opts);
  if (!out) return null;
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}


/** A person has no small see-through holes: a white label, a white print or a pale highlight the model was unsure about. Small enclosed holes (not touching the photo border) become solid; big gaps (arm against the body) stay open. */
export function fillSmallHoles(alpha, w, h, maxShare = 0.004) {
  const n = w * h; const seen = new Uint8Array(n); const stack = new Int32Array(n); let filled = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0] || alpha[s0] >= 230) continue;
    let sp = 0, size = 0, border = false; const list = []; stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const i = stack[--sp]; list.push(i); size++; const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      if (x > 0 && !seen[i - 1] && alpha[i - 1] < 230) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && !seen[i + 1] && alpha[i + 1] < 230) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && !seen[i - w] && alpha[i - w] < 230) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && !seen[i + w] && alpha[i + w] < 230) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    if (!border && size <= n * maxShare) { for (const i of list) alpha[i] = 255; filled += size; }
  }
  return filled;
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
          fillSmallHoles(alpha, w, h);
          for (let p = 0; p < n; p++) out[p * 4 + 3] = alpha[p];
          // a fresh model cut is already clean: polishing it removed white shoes and white labels, so it is used as is
          const buffer = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
          return { buffer, removed: 1 - cover, ml: true };
        }
      }
    } catch (e) { console.error(`[look-cutout] model cut skipped: ${e.message}`); }
  }
  return floodKnockOut(input);
}
