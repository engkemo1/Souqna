/**
 * Visual search — pure building blocks (no DB, no model download), so they are cheap to unit-test.
 *  - region cropping (a full-body outfit photo is split into top / bottom / feet crops)
 *  - colour descriptor (16-bin hue + neutral histogram) used to re-rank and to veto obviously different colours
 *  - strict confidence gate: only genuinely close products are returned, never filler
 */
import sharp from 'sharp';

/** Customer-facing Arabic names for the taxonomy families (instead of "علويات / سفليات"). */
export const FRIENDLY_AR = {
  tops: 'تيشيرتات وقمصان', bottoms: 'بناطيل وجينز', dresses: 'فساتين', suiting: 'بدل وأطقم',
  outerwear: 'جاكيتات وبالطو', modest: 'عبايات وطرح وجلاليب', shoes: 'أحذية', bags: 'شنط',
  accessories: 'إكسسوارات', sport: 'ملابس رياضية', underwear_sleep: 'بيجامات وملابس داخلية',
};

export const dot = (a, b) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };
export function normalize(v) {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}
export const cosine = (a, b) => dot(a, b) / ((Math.sqrt(dot(a, a)) || 1) * (Math.sqrt(dot(b, b)) || 1));
export function softmax(logits) {
  const m = Math.max(...logits); const e = logits.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0) || 1;
  return e.map((x) => x / s);
}

/* ---------------- regions ---------------- */
// Boxes are [left, top, right, bottom] as fractions of the (EXIF-rotated) image.
export const REGION_BOXES = {
  full: [0, 0, 1, 1],
  upper: [0.08, 0.1, 0.92, 0.55],
  lower: [0.08, 0.45, 0.92, 0.88],
  feet: [0.1, 0.8, 0.9, 1],
};

/** Crops only make sense for portrait photos (a person wearing an outfit). Square/landscape = one garment. */
export function regionKeysFor(width, height) {
  return height / Math.max(1, width) >= 1.3 ? ['full', 'upper', 'lower', 'feet'] : ['full'];
}

/** Returns [{ key, buffer }] — JPEG buffers, already rotated by EXIF. */
export async function cropRegions(buffer) {
  const rotated = await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer();
  const { width, height } = await sharp(rotated).metadata();
  const out = [];
  for (const key of regionKeysFor(width, height)) {
    if (key === 'full') { out.push({ key, buffer: rotated }); continue; }
    const [l, t, r, b] = REGION_BOXES[key];
    const left = Math.round(l * width), top = Math.round(t * height);
    const w = Math.max(8, Math.round((r - l) * width)), h = Math.max(8, Math.round((b - t) * height));
    out.push({ key, buffer: await sharp(rotated).extract({ left, top, width: Math.min(w, width - left), height: Math.min(h, height - top) }).jpeg({ quality: 90 }).toBuffer() });
  }
  return out;
}

/* ---------------- colour descriptor ---------------- */
export const COLOR_BINS = 16; // 0-11 hues, 12 black, 13 dark grey, 14 light grey, 15 white

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}

/** Dominant-colour histogram of the central part of the image (the garment), L1-normalised. */
export async function colorDescriptor(buffer, centre = 0.6) {
  const N = 48;
  const { data } = await sharp(buffer).rotate().resize(N, N, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lo = Math.floor(N * (1 - centre) / 2), hi = Math.ceil(N * (1 + centre) / 2);
  const hist = new Float32Array(COLOR_BINS);
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) {
    const i = (y * N + x) * 3; const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
    if (v < 0.3) hist[12] += 1; // very dark (black, charcoal, deep navy / bottle green) reads as black to shoppers
    else if (s > 0.22) hist[Math.floor(h / 30) % 12] += 1;
    else if (v > 0.85 && s < 0.2) hist[15] += 1;
    else if (v < 0.55) hist[13] += 1;
    else hist[14] += 1;
  }
  const sum = hist.reduce((a, b) => a + b, 0) || 1;
  return hist.map((x) => x / sum);
}

/** Neighbouring hues / neighbouring greys count as partly the same (beige ≈ cream, navy ≈ black). */
function smooth(h) {
  const o = new Float32Array(COLOR_BINS);
  for (let i = 0; i < 12; i++) { o[i] += h[i] * 0.7; o[(i + 1) % 12] += h[i] * 0.15; o[(i + 11) % 12] += h[i] * 0.15; }
  const g = [12, 13, 14, 15];
  g.forEach((k, idx) => { o[k] += h[k] * 0.7; if (g[idx - 1] !== undefined) o[g[idx - 1]] += h[k] * 0.15; else o[k] += h[k] * 0.15; if (g[idx + 1] !== undefined) o[g[idx + 1]] += h[k] * 0.15; else o[k] += h[k] * 0.15; });
  return o;
}
/** Histogram intersection of the smoothed descriptors: 1 = same colours, 0 = nothing in common. */
export function colorSimilarity(a, b) {
  const x = smooth(a), y = smooth(b); let s = 0;
  for (let i = 0; i < COLOR_BINS; i++) s += Math.min(x[i], y[i]);
  return Math.max(0, Math.min(1, s));
}

/* ---------------- strict ranking ---------------- */
export const RANK = {
  colorWeight: 0.10,       // ±0.05 on the cosine score
  colorVetoBelow: 0.12,    // colours with almost nothing in common…
  colorVetoPenalty: 0.04,  // …lose extra points
  window: 0.06,            // keep only results within this distance of the best one
};

/**
 * candidates: [{ id, vec, hist? }]. Returns only confident matches, best first — possibly an empty list.
 * score = cosine + small colour adjustment; kept if score >= floor AND within `window` of the best score.
 */
export function rankConfident(queryVec, queryHist, candidates, { floor, window = RANK.window, limit = 24, useColor = true } = {}) {
  const scored = [];
  for (const c of candidates) {
    let score = dot(queryVec, c.vec);
    if (!Number.isFinite(score)) continue;
    if (useColor && queryHist && c.hist) {
      const cs = colorSimilarity(queryHist, c.hist);
      score += RANK.colorWeight * (cs - 0.5) - (cs < RANK.colorVetoBelow ? RANK.colorVetoPenalty : 0);
    }
    scored.push({ id: c.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score;
  if (best === undefined || best < floor) return [];
  return scored.filter((x) => x.score >= floor && x.score >= best - window).slice(0, limit);
}

export const toBlob = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
export const fromBlob = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
