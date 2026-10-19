import qrcode from './qrcode-generator.js';

/** QR as an SVG string (crisp at any size, prints perfectly). `level` M survives a bit of smudging. */
export function qrSvg(text, { size = 256, margin = 2, fg = '#111111', bg = '#ffffff', level = 'M' } = {}) {
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
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
