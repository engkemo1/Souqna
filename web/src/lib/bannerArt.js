/**
 * Ready-made banner backgrounds, drawn with plain canvas 2D (no AI, no network, no images). Everything is proportional to
 * the canvas, so the same template renders for desktop (2400x1000) and mobile (4:5). The art sits on the END side in RTL
 * (left), leaving the START side calm for the store's own text, which the storefront draws on top of the image.
 */
const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const grad = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const fill = (ctx, w, h, stops, a = [0, 0, 1, 1]) => { ctx.fillStyle = grad(ctx, a[0] * w, a[1] * h, a[2] * w, a[3] * h, stops); ctx.fillRect(0, 0, w, h); };
const circle = (ctx, x, y, r, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; };
const ring = (ctx, x, y, r, c, lw, a = 1) => { ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; };
const star = (ctx, x, y, r, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.22 : r; const t = (Math.PI / 4) * i - Math.PI / 2; ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); } ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; };
const poly = (ctx, pts, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; };
const arch = (ctx, cx, bottom, hw, hh, c, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx - hw, bottom); ctx.lineTo(cx - hw, bottom - hh + hw); ctx.arc(cx, bottom - hh + hw, hw, Math.PI, 0); ctx.lineTo(cx + hw, bottom); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; };

const hex2rgb = (h) => { const v = String(h || '#1B3A6B').replace('#', ''); const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v.padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
/** Mix a colour with white (amt>0) or black (amt<0): amt 0..1. */
export const mix = (hex, amt) => { const [r, g, b] = hex2rgb(hex); const t = amt >= 0 ? 255 : 0; const k = Math.abs(amt); return rgb2hex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k); };

export const BANNER_TEMPLATES = [
  { id: 'rose_arches', ar: 'أقواس وردي', tone: 'light', group: 'women', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#FCEFEA'], [1, '#F6D3CB']]);
    [[0.18, 0.95, '#EDB1A7'], [0.13, 0.78, '#F4C7BF'], [0.085, 0.6, '#FBE0DA']].forEach(([hw, hh, c], i) => arch(ctx, w * (0.2 + i * 0.0), h, w * hw, h * hh, c, 1));
    arch(ctx, w * 0.36, h, w * 0.07, h * 0.62, '#E59C92'); arch(ctx, w * 0.07, h, w * 0.06, h * 0.5, '#F0BBB2');
    circle(ctx, w * 0.3, h * 0.2, h * 0.07, '#FFFFFF', 0.8); circle(ctx, w * 0.1, h * 0.25, h * 0.03, '#FFFFFF', 0.7);
  } },
  { id: 'noir_gold', ar: 'أسود وذهبي', tone: 'dark', group: 'luxury', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#0A0A0C'], [1, '#1E1810']]);
    ring(ctx, w * 0.2, h * 0.5, h * 0.62, '#C9A24A', h * 0.012, 0.9); ring(ctx, w * 0.2, h * 0.5, h * 0.48, '#C9A24A', h * 0.006, 0.6); ring(ctx, w * 0.2, h * 0.5, h * 0.34, '#E7C873', h * 0.004, 0.5);
    ctx.strokeStyle = '#C9A24A'; ctx.globalAlpha = 0.35; ctx.lineWidth = h * 0.004; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(w * (0.02 + i * 0.045), h); ctx.lineTo(w * (0.2 + i * 0.045), 0); ctx.stroke(); } ctx.globalAlpha = 1;
    star(ctx, w * 0.33, h * 0.25, h * 0.07, '#E7C873'); star(ctx, w * 0.1, h * 0.7, h * 0.045, '#C9A24A'); star(ctx, w * 0.24, h * 0.8, h * 0.03, '#E7C873', 0.8);
  } },
  { id: 'navy_diagonal', ar: 'كحلي مائل', tone: 'dark', group: 'men', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#0D1A31'], [1, '#1E3F73']], [1, 0, 0, 1]);
    poly(ctx, [[w * 0.42, 0], [w * 0.62, 0], [w * 0.38, h], [w * 0.18, h]], '#FFFFFF', 0.06);
    poly(ctx, [[w * 0.28, 0], [w * 0.36, 0], [w * 0.12, h], [w * 0.04, h]], '#7FA7E6', 0.25);
    poly(ctx, [[w * 0.18, 0], [w * 0.2, 0], [w * -0.04, h], [w * -0.06, h]], '#FFFFFF', 0.35);
    ctx.strokeStyle = '#FFFFFF'; ctx.globalAlpha = 0.05; ctx.lineWidth = 1; for (let x = 0; x < w * 0.5; x += h * 0.08) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += h * 0.08) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w * 0.5, y); ctx.stroke(); } ctx.globalAlpha = 1;
  } },
  { id: 'charcoal_stripes', ar: 'رمادي بخطوط', tone: 'dark', group: 'men', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#1B1D21'], [1, '#2E3238']]);
    const widths = [0.012, 0.03, 0.008, 0.05, 0.012, 0.02, 0.07, 0.01, 0.03]; let x = w * 0.02;
    widths.forEach((k, i) => { ctx.fillStyle = i % 2 ? '#C9A27A' : '#8C6F52'; ctx.globalAlpha = 0.95 - i * 0.07; ctx.fillRect(x, 0, w * k, h); x += w * k + w * 0.02; }); ctx.globalAlpha = 1;
    circle(ctx, w * 0.36, h * 0.82, h * 0.22, '#C9A27A', 0.12);
  } },
  { id: 'kids_confetti', ar: 'ألوان أطفال', tone: 'light', group: 'kids', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#FFF4CF'], [1, '#FFDDEE']]);
    const r = rng(7); const cols = ['#FF6B8B', '#4DB6FF', '#FFC83D', '#5CD6A0', '#A78BFA', '#FF9A3D'];
    for (let i = 0; i < 70; i++) { const x = r() * w * 0.58, y = r() * h, s = h * (0.02 + r() * 0.05), c = cols[i % cols.length]; const k = i % 4;
      if (k === 0) circle(ctx, x, y, s, c, 0.95); else if (k === 1) star(ctx, x, y, s * 1.3, c); else if (k === 2) poly(ctx, [[x, y - s], [x + s, y + s], [x - s, y + s]], c); else ring(ctx, x, y, s, c, h * 0.012); }
    circle(ctx, w * 0.2, h * 0.78, h * 0.2, '#FFFFFF', 0.55); circle(ctx, w * 0.3, h * 0.8, h * 0.15, '#FFFFFF', 0.55);
  } },
  { id: 'sneaker_blocks', ar: 'برتقالي حاد', tone: 'dark', group: 'shoes', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#FF7A1F'], [1, '#E5400B']], [0, 0, 1, 1]);
    poly(ctx, [[w * 0.5, 0], [w * 0.3, h], [w * 0, h], [w * 0, 0]], '#111111', 0.92);
    poly(ctx, [[w * 0.56, 0], [w * 0.52, 0], [w * 0.32, h], [w * 0.36, h]], '#FFFFFF', 0.9);
    poly(ctx, [[w * 0.6, 0], [w * 0.58, 0], [w * 0.38, h], [w * 0.4, h]], '#FFFFFF', 0.45);
    circle(ctx, w * 0.12, h * 0.3, h * 0.14, '#FF7A1F', 0.9); ring(ctx, w * 0.12, h * 0.3, h * 0.2, '#FFFFFF', h * 0.01, 0.6);
  } },
  { id: 'sport_neon', ar: 'رياضي نيون', tone: 'dark', group: 'sport', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#070B10'], [1, '#101A24']]);
    [[0.3, '#B6FF3C', 1], [0.17, '#22E6FF', 0.9], [0.08, '#FFFFFF', 0.5]].forEach(([x, c, a], i) => poly(ctx, [[w * (x + 0.22), 0], [w * (x + 0.12), 0], [w * (x - 0.1), h], [w * (x), h]], c, a * (i === 2 ? 1 : 0.95)));
    ctx.strokeStyle = '#B6FF3C'; ctx.globalAlpha = 0.5; ctx.lineWidth = h * 0.008; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(w * 0.42, h * (0.2 + i * 0.12)); ctx.lineTo(w * 0.6, h * (0.2 + i * 0.12) - h * 0.04); ctx.stroke(); } ctx.globalAlpha = 1;
  } },
  { id: 'emerald_gold', ar: 'زمردي مناسبات', tone: 'dark', group: 'occasion', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#05362D'], [1, '#0D6A55']], [1, 0, 0, 1]);
    arch(ctx, w * 0.2, h * 1.02, w * 0.12, h * 0.9, '#C9A24A', 0.95); arch(ctx, w * 0.2, h * 1.02, w * 0.105, h * 0.84, '#08463A'); arch(ctx, w * 0.2, h * 1.02, w * 0.075, h * 0.7, '#0D6A55');
    star(ctx, w * 0.4, h * 0.22, h * 0.06, '#E7C873'); star(ctx, w * 0.06, h * 0.3, h * 0.04, '#E7C873', 0.9); star(ctx, w * 0.35, h * 0.72, h * 0.035, '#C9A24A'); star(ctx, w * 0.2, h * 0.4, h * 0.05, '#E7C873');
  } },
  { id: 'minimal_cream', ar: 'كريمي بسيط', tone: 'light', group: 'minimal', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#F8F4EC'], [1, '#EFE7DA']]);
    circle(ctx, w * 0.22, h * 0.52, h * 0.55, '#E9DFCE'); circle(ctx, w * 0.3, h * 0.45, h * 0.38, '#DCCDB4'); circle(ctx, w * 0.12, h * 0.7, h * 0.22, '#C9B392');
    ring(ctx, w * 0.3, h * 0.45, h * 0.46, '#B79C74', h * 0.004, 0.7);
  } },
  { id: 'sale_burst', ar: 'عروض أحمر', tone: 'dark', group: 'sale', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#E0182D'], [1, '#98091B']], [1, 0, 0, 1]);
    const cx = w * 0.2, cy = h * 0.5; ctx.fillStyle = '#FFD23F'; ctx.globalAlpha = 0.22; for (let i = 0; i < 20; i++) { const a0 = (Math.PI * 2 * i) / 20, a1 = a0 + Math.PI / 20; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w); ctx.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * w); ctx.closePath(); ctx.fill(); } ctx.globalAlpha = 1;
    circle(ctx, cx, cy, h * 0.3, '#FFD23F'); circle(ctx, cx, cy, h * 0.24, '#FFB300'); star(ctx, cx, cy, h * 0.18, '#FFFFFF');
  } },
  { id: 'sage_waves', ar: 'أخضر هادئ', tone: 'light', group: 'modest', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#EAF2E8'], [1, '#D3E3D7']]);
    [['#B8D1BF', 0.72, 0.07], ['#9FC0AB', 0.82, 0.06], ['#CFC8E8', 0.92, 0.04]].forEach(([c, y, amp], i) => { ctx.fillStyle = c; ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * y + Math.sin(x / (w * 0.07) + i) * h * amp); ctx.lineTo(w, h); ctx.closePath(); ctx.fill(); }); ctx.globalAlpha = 1;
    circle(ctx, w * 0.2, h * 0.3, h * 0.1, '#FFFFFF', 0.7);
  } },
  { id: 'terracotta_sun', ar: 'تيراكوتا', tone: 'dark', group: 'autumn', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#C0602F'], [1, '#7B2D14']], [1, 0, 0, 1]);
    [0.62, 0.5, 0.38].forEach((k, i) => ring(ctx, w * 0.2, h * 1.05, h * k * 1.5, '#F2D9B8', h * 0.012, 0.8 - i * 0.2)); circle(ctx, w * 0.2, h * 1.05, h * 0.42, '#F2D9B8', 0.95); circle(ctx, w * 0.2, h * 1.05, h * 0.3, '#E8A064');
    circle(ctx, w * 0.42, h * 0.2, h * 0.04, '#F2D9B8', 0.7); circle(ctx, w * 0.06, h * 0.25, h * 0.025, '#F2D9B8', 0.7);
  } },
  { id: 'lavender_soft', ar: 'بنفسجي ناعم', tone: 'light', group: 'women', draw(ctx, w, h) {
    fill(ctx, w, h, [[0, '#F4EEFB'], [1, '#E3D7F5']]);
    circle(ctx, w * 0.12, h * 0.3, h * 0.42, '#D6C4F0', 0.9); circle(ctx, w * 0.3, h * 0.7, h * 0.36, '#C7B0EA', 0.8); circle(ctx, w * 0.38, h * 0.22, h * 0.12, '#FFFFFF', 0.8);
    star(ctx, w * 0.22, h * 0.52, h * 0.07, '#FFFFFF', 0.9); star(ctx, w * 0.06, h * 0.78, h * 0.04, '#FFFFFF', 0.8);
  } },
  { id: 'brand_arches', ar: 'ألوان محلك — أقواس', tone: 'light', group: 'brand', brand: true, draw(ctx, w, h, o) {
    const c = o.color; fill(ctx, w, h, [[0, mix(c, 0.92)], [1, mix(c, 0.78)]]);
    arch(ctx, w * 0.2, h, w * 0.17, h * 0.95, mix(c, 0.45)); arch(ctx, w * 0.2, h, w * 0.125, h * 0.76, mix(c, 0.65)); arch(ctx, w * 0.2, h, w * 0.08, h * 0.58, mix(c, 0.85));
    arch(ctx, w * 0.37, h, w * 0.06, h * 0.6, c); circle(ctx, w * 0.3, h * 0.2, h * 0.07, '#FFFFFF', 0.8);
  } },
  { id: 'brand_bold', ar: 'ألوان محلك — غامق', tone: 'dark', group: 'brand', brand: true, draw(ctx, w, h, o) {
    const c = o.color; fill(ctx, w, h, [[0, mix(c, -0.45)], [1, mix(c, -0.05)]], [1, 0, 0, 1]);
    poly(ctx, [[w * 0.42, 0], [w * 0.6, 0], [w * 0.36, h], [w * 0.18, h]], '#FFFFFF', 0.07); poly(ctx, [[w * 0.28, 0], [w * 0.35, 0], [w * 0.11, h], [w * 0.04, h]], mix(c, 0.5), 0.5);
    ring(ctx, w * 0.2, h * 0.5, h * 0.42, '#FFFFFF', h * 0.006, 0.4); circle(ctx, w * 0.2, h * 0.5, h * 0.3, '#FFFFFF', 0.08); star(ctx, w * 0.33, h * 0.24, h * 0.06, '#FFFFFF', 0.85);
  } },
  { id: 'brand_circles', ar: 'ألوان محلك — دوائر', tone: 'light', group: 'brand', brand: true, draw(ctx, w, h, o) {
    const c = o.color; fill(ctx, w, h, [[0, '#FFFFFF'], [1, mix(c, 0.9)]]);
    circle(ctx, w * 0.2, h * 0.5, h * 0.55, mix(c, 0.8)); circle(ctx, w * 0.28, h * 0.45, h * 0.38, mix(c, 0.55)); circle(ctx, w * 0.12, h * 0.72, h * 0.2, c); ring(ctx, w * 0.28, h * 0.45, h * 0.47, c, h * 0.004, 0.6);
  } },
];

const loadImg = (url) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
/** URL of a stored media at a reasonable size (smallest one that is at least `min` px wide). */
export const mediaUrl = (m, min = 480) => { if (!m?.base) return null; const sz = [...(m.sizes || [])].sort((x, y) => x.width - y.width); const pick = sz.find((x) => x.width >= min) || sz[sz.length - 1]; return pick ? `${m.base}/${pick.name}.webp` : null; };
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
const cover = (ctx, img, x, y, w, h) => { const k = Math.max(w / img.width, h / img.height); const sw = w / k, sh = h / k; ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h); };

/**
 * Draws a banner background and, optionally, the store's own logo and its real product photos.
 * opts: { color, logo: media|null, products: media[] }. Landscape art is drawn on the END side for LTR (set mirror_rtl on the
 * banner so Arabic shows it mirrored); portrait (mobile) puts the art at the top and leaves the lower part plain for text.
 * Returns { canvas, usedPhotos } — photos that fail to load (e.g. a CDN without CORS) are skipped, never faked.
 */
export async function composeBanner(canvas, id, w, h, opts = {}) {
  const t = BANNER_TEMPLATES.find((x) => x.id === id) || BANNER_TEMPLATES[0];
  const o = { color: opts.color || '#1B3A6B' };
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const portrait = h / w >= 0.9;
  if (!portrait) { ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); t.draw(ctx, w, h, o); ctx.restore(); }
  else {
    const art = document.createElement('canvas'); art.width = w; art.height = Math.round(w * 0.95);
    t.draw(art.getContext('2d'), art.width, art.height, o);
    ctx.drawImage(art, 0, art.height - 2, w, 2, 0, 0, w, h); // lower part = the template's own background colour
    ctx.drawImage(art, 0, 0);
  }
  let usedPhotos = 0;
  const photos = (await Promise.all((opts.products || []).slice(0, 3).map((m) => loadImg(mediaUrl(m))))).filter(Boolean);
  if (photos.length) {
    const ch = portrait ? w * 0.52 : h * 0.6, cw = ch * 0.8, step = cw * (portrait ? 0.7 : 0.66);
    const total = cw + step * (photos.length - 1);
    const x0 = portrait ? (w - total) / 2 : w * 0.965 - total, y0 = portrait ? w * 0.1 : (h - ch) / 2;
    photos.forEach((img, i) => {
      const x = x0 + i * step, y = y0 + (i % 2 ? ch * 0.06 : 0);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = h * 0.04; ctx.shadowOffsetY = h * 0.015; ctx.fillStyle = '#fff'; rr(ctx, x, y, cw, ch, cw * 0.07); ctx.fill(); ctx.restore();
      ctx.save(); rr(ctx, x + cw * 0.04, y + cw * 0.04, cw * 0.92, ch - cw * 0.08, cw * 0.05); ctx.clip(); cover(ctx, img, x + cw * 0.04, y + cw * 0.04, cw * 0.92, ch - cw * 0.08); ctx.restore();
    });
    usedPhotos = photos.length;
  }
  if (opts.logo) {
    const li = await loadImg(mediaUrl(opts.logo, 200));
    if (li) {
      const d = portrait ? w * 0.16 : h * 0.17, x = portrait ? w * 0.06 : w * 0.04, y = portrait ? w * 0.06 : h * 0.1;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = d * 0.2; circle(ctx, x + d / 2, y + d / 2, d / 2, '#FFFFFF'); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2 - d * 0.06, 0, Math.PI * 2); ctx.clip(); cover(ctx, li, x + d * 0.06, y + d * 0.06, d * 0.88, d * 0.88); ctx.restore();
    }
  }
  return { canvas, usedPhotos };
}

/** Plain art only (used by the template gallery thumbnails). */
export function drawBanner(canvas, id, w, h, color) { const t = BANNER_TEMPLATES.find((x) => x.id === id) || BANNER_TEMPLATES[0]; canvas.width = w; canvas.height = h; t.draw(canvas.getContext('2d'), w, h, { color: color || '#1B3A6B' }); return canvas; }

/* ---------- Photo-first layouts (editorial / split / bold / grid) — the store's own product photos lead ---------- */
export const PHOTO_LAYOUTS = [
  { id: 'ph_editorial', name: 'تحريري هادئ', needs: 1 },
  { id: 'ph_split', name: 'كتلة لون + صور', needs: 2 },
  { id: 'ph_bold', name: 'جريء داكن', needs: 1 },
  { id: 'ph_grid', name: 'شبكة منتجات', needs: 3 },
  { id: 'ph_center', name: 'صورة كاملة + نص في النص', needs: 1 },
  { id: 'ph_triptych', name: 'ثلاث لقطات', needs: 3 },
  { id: 'ph_arch', name: 'قوس أنيق', needs: 1 },
  { id: 'ph_deal', name: 'عروض (شريط لون)', needs: 3 },
];
const placeholder = (ctx, x, y, w, h, c) => { ctx.fillStyle = mix(c, 0.78); ctx.fillRect(x, y, w, h); ctx.fillStyle = mix(c, 0.6); ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.42, Math.min(w, h) * 0.18, 0, Math.PI * 2); ctx.fill(); };

export async function composePhotoBanner(canvas, id, w, h, opts = {}) {
  const c = opts.color || '#1B3A6B';
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const portrait = h / w >= 0.9;
  const imgs = (await Promise.all((opts.products || []).slice(0, 4).map((m) => loadImg(mediaUrl(m, 720))))).filter(Boolean);
  const pic = (i, x, y, ww, hh) => { const im = imgs[i % Math.max(imgs.length, 1)]; if (imgs.length) cover(ctx, im, x, y, ww, hh); else placeholder(ctx, x, y, ww, hh, c); };
  const clip = (x, y, ww, hh, r, fn) => { ctx.save(); rr(ctx, x, y, ww, hh, r); ctx.clip(); fn(); ctx.restore(); };
  if (id === 'ph_editorial') { // light off-white, one big full-height photo at the end, text area stays clean (Zara-like)
    ctx.fillStyle = '#F4F1EC'; ctx.fillRect(0, 0, w, h);
    if (portrait) { pic(0, 0, 0, w, h * 0.5); }
    else { const pw = w * 0.5; pic(0, w - pw, 0, pw, h); }
  } else if (id === 'ph_split') { // solid brand block + two photos (H&M-like)
    ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    if (portrait) { const ph = h * 0.5, pw = w / 2; pic(0, 0, 0, pw - 2, ph); pic(1, pw + 2, 0, pw - 2, ph); }
    else { const pw = w * 0.2; const x0 = w - pw * 2 - 6; pic(0, x0, 0, pw, h); pic(1, x0 + pw + 6, 0, pw, h); }
  } else if (id === 'ph_bold') { // near-black, big photo fading into the dark text side (Nike-like)
    ctx.fillStyle = '#0E0E0E'; ctx.fillRect(0, 0, w, h);
    const pw = portrait ? w : w * 0.62, ph = portrait ? h * 0.56 : h, px = portrait ? 0 : w - pw;
    pic(0, px, 0, pw, ph);
    const g = portrait ? ctx.createLinearGradient(0, ph * 0.55, 0, ph) : ctx.createLinearGradient(px, 0, px + pw * 0.5, 0);
    g.addColorStop(0, 'rgba(14,14,14,1)'); g.addColorStop(1, 'rgba(14,14,14,0)');
    if (portrait) { const g2 = ctx.createLinearGradient(0, ph * 0.55, 0, ph); g2.addColorStop(0, 'rgba(14,14,14,0)'); g2.addColorStop(1, 'rgba(14,14,14,1)'); ctx.fillStyle = g2; ctx.fillRect(0, ph * 0.55, w, ph * 0.45); }
    else { ctx.fillStyle = g; ctx.fillRect(px, 0, pw * 0.5, h); }
    ctx.fillStyle = c; ctx.fillRect(0, h - h * 0.025, w, h * 0.025);
  } else if (id === 'ph_center') { // full-bleed photo, dark veil, text centred (ASOS / campaign-like)
    pic(0, 0, 0, w, h); ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fillRect(0, 0, w, h);
  } else if (id === 'ph_triptych') { // three tall photos side by side with thin gaps (Zara-like lookbook)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const g = Math.round(w * 0.006);
    if (portrait) { const ph = h * 0.52, tw = (w - g * 2) / 3; for (let i = 0; i < 3; i++) pic(i, i * (tw + g), 0, tw, ph); }
    else { const area = w * 0.62, tw = (area - g * 2) / 3; for (let i = 0; i < 3; i++) pic(i, w - area + i * (tw + g), 0, tw, h); }
  } else if (id === 'ph_arch') { // soft tinted background with an arch-shaped photo
    ctx.fillStyle = mix(c, 0.86); ctx.fillRect(0, 0, w, h);
    const aw = portrait ? w * 0.62 : h * 0.72, ah = portrait ? h * 0.48 : h * 0.86, ax = portrait ? (w - aw) / 2 : w * 0.82 - aw / 2, ay = portrait ? h * 0.03 : h * 0.07;
    ctx.fillStyle = mix(c, 0.6); ctx.beginPath(); ctx.arc(ax + aw / 2, ay + ah * 0.5, aw * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.moveTo(ax, ay + ah); ctx.lineTo(ax, ay + aw / 2); ctx.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0); ctx.lineTo(ax + aw, ay + ah); ctx.closePath(); ctx.clip(); pic(0, ax, ay, aw, ah); ctx.restore();
  } else if (id === 'ph_deal') { // saturated brand band + product tiles with white frames (Amazon-deal-like)
    ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    const n = 3, gap = (portrait ? w : h) * 0.03;
    if (portrait) { const tw = (w - gap * 4) / 3, th = h * 0.2; for (let i = 0; i < n; i++) { const x = gap + i * (tw + gap), y = h * 0.03; ctx.fillStyle = '#fff'; rr(ctx, x, y, tw, th, tw * 0.08); ctx.fill(); clip(x + tw * 0.05, y + tw * 0.05, tw * 0.9, th - tw * 0.1, tw * 0.05, () => pic(i, x + tw * 0.05, y + tw * 0.05, tw * 0.9, th - tw * 0.1)); } }
    else { const area = w * 0.48, tw = (area - gap * (n + 1)) / n, th = h * 0.8, y = (h - th) / 2; for (let i = 0; i < n; i++) { const x = w - area + gap + i * (tw + gap); ctx.fillStyle = '#fff'; rr(ctx, x, y, tw, th, tw * 0.07); ctx.fill(); clip(x + tw * 0.05, y + tw * 0.05, tw * 0.9, th - tw * 0.1, tw * 0.05, () => pic(i, x + tw * 0.05, y + tw * 0.05, tw * 0.9, th - tw * 0.1)); } }
  } else { // ph_grid: soft background + product tiles (Amazon-like)
    ctx.fillStyle = mix(c, 0.9); ctx.fillRect(0, 0, w, h);
    const n = 4, gap = (portrait ? w : h) * 0.025;
    if (portrait) { const tw = (w - gap * 3) / 2, th = h * 0.21; for (let i = 0; i < 4; i++) { const x = gap + (i % 2) * (tw + gap), y = gap + Math.floor(i / 2) * (th + gap); clip(x, y, tw, th, tw * 0.05, () => pic(i, x, y, tw, th)); } }
    else { const area = w * 0.54, tw = (area - gap * (n + 1)) / n, th = h * 0.78, y = (h - th) / 2; for (let i = 0; i < n; i++) { const x = w - area + gap + i * (tw + gap); clip(x, y, tw, th, tw * 0.06, () => pic(i, x, y, tw, th)); } }
  }
  if (opts.logo) {
    const li = await loadImg(mediaUrl(opts.logo, 200));
    if (li) { const d = portrait ? w * 0.13 : h * 0.15, x = portrait ? w * 0.05 : w * 0.04, y = portrait ? h * 0.52 : h * 0.08; ctx.save(); ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip(); cover(ctx, li, x + d * 0.06, y + d * 0.06, d * 0.88, d * 0.88); ctx.restore(); }
  }
  return { canvas, usedPhotos: imgs.length };
}
