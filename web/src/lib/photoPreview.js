// Approximate, on-device preview of how a product photo will look after the server's studio treatment.
// It mirrors the server idea (studio shot -> level background, trim, centre on 4:5 canvas) but is only an estimate.
const W = 240, H = 300;
const CANVAS = { white: [255, 255, 255], cream: [245, 239, 230] };

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

function sample(img, max = 320) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(img.naturalWidth * s));
  c.height = Math.max(8, Math.round(img.naturalHeight * s));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, c.width, c.height);
  return { c, x, data: x.getImageData(0, 0, c.width, c.height) };
}

function analyze({ data }) {
  const { width: w, height: h, data: d } = data;
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  let n = 0, r = 0, g = 0, b = 0, l = 0, l2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= band && x < w - band && y >= band && y < h - band) continue;
    const i = (y * w + x) * 4; const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    r += d[i]; g += d[i + 1]; b += d[i + 2]; l += lum; l2 += lum * lum; n++;
  }
  r /= n; g /= n; b /= n; l /= n;
  const std = Math.sqrt(Math.max(0, l2 / n - l * l));
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return { studio: std < 14 && spread < 26 && l >= 218, bg: [r, g, b] };
}

function drawOriginal(src) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const ratio = src.c.width / src.c.height;
  if (Math.abs(ratio - W / H) < 0.1) {
    const sw = ratio > W / H ? src.c.height * (W / H) : src.c.width; const sh = ratio > W / H ? src.c.height : src.c.width / (W / H);
    x.drawImage(src.c, (src.c.width - sw) / 2, (src.c.height - sh) / 2, sw, sh, 0, 0, W, H);
  } else {
    x.fillStyle = '#e5e7eb'; x.fillRect(0, 0, W, H);
    x.globalAlpha = 0.5; x.drawImage(src.c, 0, 0, W, H); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, 0, W, H);
    const k = Math.min(W / src.c.width, H / src.c.height);
    x.drawImage(src.c, (W - src.c.width * k) / 2, (H - src.c.height * k) / 2, src.c.width * k, src.c.height * k);
  }
  return c.toDataURL('image/jpeg', 0.8);
}

function drawStudio(src, an, style) {
  const [cr, cg, cb] = CANVAS[style];
  const { width: w, height: h, data: d } = src.data;
  const gain = an.bg.map((v, i) => Math.min(1.17, Math.max(0.88, [cr, cg, cb][i] / Math.max(1, v))));
  const out = new ImageData(w, h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const rr = Math.min(255, d[i] * gain[0]), gg = Math.min(255, d[i + 1] * gain[1]), bb = Math.min(255, d[i + 2] * gain[2]);
    out.data[i] = rr; out.data[i + 1] = gg; out.data[i + 2] = bb; out.data[i + 3] = 255;
    if (Math.max(Math.abs(rr - cr), Math.abs(gg - cg), Math.abs(bb - cb)) > 14) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(out, 0, 0);
  let bx = 0, by = 0, bw = w, bh = h;
  if (x1 > x0 && y1 > y0 && (x1 - x0) * (y1 - y0) >= 0.12 * w * h && x1 - x0 > 40 && y1 - y0 > 40) { bx = x0; by = y0; bw = x1 - x0 + 1; bh = y1 - y0 + 1; }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = `rgb(${cr},${cg},${cb})`; x.fillRect(0, 0, W, H);
  const mw = W * 0.86, mh = H * 0.86; const k = Math.min(mw / bw, mh / bh);
  const dw = bw * k, dh = bh * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
  const sh = x.createRadialGradient(W / 2, dy + dh, 1, W / 2, dy + dh, dw / 2);
  sh.addColorStop(0, 'rgba(0,0,0,.10)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  x.save(); x.translate(0, 0); x.scale(1, 0.18); x.fillStyle = sh; x.beginPath(); x.arc(W / 2, (dy + dh) / 0.18, dw / 2, 0, Math.PI * 2); x.fill(); x.restore();
  x.drawImage(tmp, bx, by, bw, bh, dx, dy, dw, dh);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Returns { studio, looks: { white, cream, original } } as small data URLs, or null if the file can't be decoded here. */
export async function previewLooks(file) {
  try {
    const img = await load(file);
    const src = sample(img);
    const an = analyze(src);
    const original = drawOriginal(src);
    return { studio: an.studio, looks: an.studio ? { white: drawStudio(src, an, 'white'), cream: drawStudio(src, an, 'cream'), original } : { white: original, cream: original, original } };
  } catch { return null; }
}
