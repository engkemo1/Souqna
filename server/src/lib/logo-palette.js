/**
 * Dominant colours of a logo.
 * Down-samples, ignores transparent pixels, buckets colours (4 bits/channel) then merges close buckets,
 * so anti-aliased edges and gradients collapse into a handful of real swatches.
 */
import sharp from 'sharp';

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

export async function extractSwatches(input, { max = 6 } = {}) {
  const { data, info } = await sharp(input).resize(112, 112, { fit: 'inside', withoutEnlargement: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map();
  let visible = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    visible++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    bins.set(key, e);
  }
  if (!visible) return [];
  const items = [...bins.values()].map((e) => ({ n: e.n, c: [e.r / e.n, e.g / e.n, e.b / e.n] })).sort((a, b) => b.n - a.n);
  const clusters = [];
  for (const it of items) {
    const hit = clusters.find((k) => dist2(k.c, it.c) < 40 * 40);
    if (hit) {
      const n = hit.n + it.n;
      hit.c = hit.c.map((v, i) => (v * hit.n + it.c[i] * it.n) / n);
      hit.n = n;
    } else clusters.push({ n: it.n, c: [...it.c] });
  }
  return clusters.sort((a, b) => b.n - a.n).slice(0, max).map((k) => ({ hex: toHex(k.c), pop: Math.round((k.n / visible) * 1000) / 1000 }));
}
