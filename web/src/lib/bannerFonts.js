/**
 * Fonts a merchant can pick for banner text. Self-hosted (@fontsource) and loaded on demand, so a store that never picks one
 * downloads nothing extra. `key` is what the server stores; '' = the site's normal font.
 */
export const BANNER_FONTS = [
  { key: '', ar: 'الخط الأساسي', family: null, weights: [] },
  { key: 'cairo', ar: 'Cairo — عصري واضح', family: '"Cairo"', load: () => Promise.all([import('@fontsource/cairo/arabic-700.css'), import('@fontsource/cairo/latin-700.css')]) },
  { key: 'tajawal', ar: 'Tajawal — هادي ونظيف', family: '"Tajawal"', load: () => Promise.all([import('@fontsource/tajawal/arabic-700.css'), import('@fontsource/tajawal/latin-700.css')]) },
  { key: 'almarai', ar: 'Almarai — بسيط', family: '"Almarai"', load: () => Promise.all([import('@fontsource/almarai/arabic-700.css'), import('@fontsource/almarai/latin-700.css')]) },
  { key: 'el_messiri', ar: 'El Messiri — فخم', family: '"El Messiri"', load: () => Promise.all([import('@fontsource/el-messiri/arabic-700.css'), import('@fontsource/el-messiri/latin-700.css')]) },
  { key: 'reem_kufi', ar: 'Reem Kufi — كوفي', family: '"Reem Kufi"', load: () => Promise.all([import('@fontsource/reem-kufi/arabic-700.css'), import('@fontsource/reem-kufi/latin-700.css')]) },
  { key: 'lalezar', ar: 'Lalezar — عناوين عريضة', family: '"Lalezar"', load: () => Promise.all([import('@fontsource/lalezar/arabic-400.css'), import('@fontsource/lalezar/latin-400.css')]) },
];
export const BANNER_FONT_KEYS = BANNER_FONTS.map((f) => f.key).filter(Boolean);
const done = new Set();
/** Starts loading the font for a banner (no-op for the default font or when already loaded). */
export function loadBannerFont(key) {
  const f = BANNER_FONTS.find((x) => x.key === key);
  if (!f?.load || done.has(key)) return;
  done.add(key);
  f.load().catch(() => done.delete(key));
}
export const bannerFontFamily = (key) => {
  const f = BANNER_FONTS.find((x) => x.key === key);
  return f?.family ? `${f.family}, "IBM Plex Sans Arabic", system-ui, sans-serif` : undefined;
};
/** Black or white text for a button painted with `hex`. */
export const readableOn = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#111111';
  const n = parseInt(m[1], 16); const y = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return y > 165 ? '#111111' : '#FFFFFF';
};
