import qrcode from './qrcode-generator.js';
import { TWIST_MARK } from './logo.js';

/** QR as an SVG string (crisp at any size, prints perfectly). `level` M survives a bit of smudging. */
export function qrSvg(text, { size = 256, margin = 2, fg = '#111111', bg = '#ffffff', level = 'M', logo = true } = {}) {
  if (logo) level = 'H'; // logo covers the centre, so use the highest error correction
  const qr = qrcode(0, level);
  qr.addData(String(text), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const total = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  // centre logo: ~19% of the code width (well under H's 30% recovery), on a white plate
  let mark = '';
  if (logo) {
    const w = Math.round(n * 0.19), pad = 1.2;
    const x = total / 2 - w / 2, y = x;
    mark = `<rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${w + pad * 2}" rx="${(w + pad * 2) * 0.22}" fill="#ffffff"/><image href="${typeof logo === 'string' ? logo : TWIST_MARK}" x="${x}" y="${y}" width="${w}" height="${w}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}"><rect width="${total}" height="${total}" fill="${bg}"/><path d="${d}" fill="${fg}" shape-rendering="crispEdges"/>${mark}</svg>`;
}

/** Rasterise the QR to a PNG data URL (for "download"). */
export function qrPng(text, px = 1024, opts = {}) {
  return new Promise((resolve, reject) => {
    const svg = qrSvg(text, { ...opts, size: px });
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = px;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, px, px);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export const storeUrl = (slug) => `${window.location.origin}/s/${slug}`;
export const productUrl = (slug, pslug) => `${window.location.origin}/s/${slug}/p/${pslug}`;
export const orderUrl = (id) => `${window.location.origin}/dashboard/orders/${id}`;
