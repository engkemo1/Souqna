/**
 * Banha Outfit Storefront Theme Engine
 * ------------------------------------------------------------
 * Store owners choose colors. The engine turns those choices into
 * a full, accessible token set. Spacing, typography, radii, shadows
 * and motion are owned by the platform design system and are NOT
 * customisable — only colour tokens flow from the store.
 *
 * Every text/background pair is checked against WCAG 2.1:
 *   - body text & buttons   >= 4.5 : 1  (AA)
 *   - large/brand text      >= 3   : 1
 *   - UI component boundary >= 3   : 1  (buttons vs page)
 * When a pair fails, the engine nudges lightness in OKLab-ish space
 * (via HSL lightness steps) until it passes, and reports the fix.
 */

export const THEME_FIELDS = [
  'primary', 'secondary', 'accent', 'background', 'text', 'button', 'header', 'footer',
];

export const AA = 4.5;
export const AA_LARGE = 3;

export const THEME_PRESETS = {
  noir:       { primary: '#111111', secondary: '#F3F1EC', accent: '#C2410C', background: '#FFFFFF', text: '#141414', button: '#111111', header: '#FFFFFF', footer: '#111111' },
  ivory:      { primary: '#3F3A33', secondary: '#F4EEE4', accent: '#B4532A', background: '#FBF8F3', text: '#26221D', button: '#3F3A33', header: '#FBF8F3', footer: '#26221D' },
  rose:       { primary: '#9F3A4D', secondary: '#FBEFF1', accent: '#C2185B', background: '#FFFFFF', text: '#2A1A1E', button: '#9F3A4D', header: '#FFFFFF', footer: '#2A1A1E' },
  indigo:     { primary: '#26338C', secondary: '#EEF0FA', accent: '#E0592A', background: '#FFFFFF', text: '#151933', button: '#26338C', header: '#FFFFFF', footer: '#151933' },
  pine:       { primary: '#17483B', secondary: '#ECF3EF', accent: '#D97745', background: '#FFFFFF', text: '#13201C', button: '#17483B', header: '#FFFFFF', footer: '#0F2620' },
  midnight:   { primary: '#E9D8B4', secondary: '#1C1C21', accent: '#E9A23B', background: '#0E0E11', text: '#F4F2EE', button: '#E9D8B4', header: '#0E0E11', footer: '#060608' },
};

/* ---------------------------------------------------------- colour math */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function normalizeHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return '#' + h.toUpperCase();
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function setLightness(hex, l) {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s, clamp(l)]));
}

export const isDark = (hex) => luminance(hex) < 0.18;

const INK = '#111111';
const PAPER = '#FFFFFF';

/** Best readable foreground (near-black or white) for a background. */
export function onColor(bg) {
  return contrast(bg, PAPER) >= contrast(bg, INK) ? PAPER : INK;
}

/**
 * Move `fg` lightness away from `bg` until contrast >= ratio.
 * Preserves hue & saturation so the brand still feels like itself.
 */
export function ensureContrast(fg, bg, ratio = AA) {
  if (contrast(fg, bg) >= ratio) return fg;
  const [h, s, l0] = rgbToHsl(hexToRgb(fg));
  const goDarker = !isDark(bg);
  for (let i = 1; i <= 100; i++) {
    const l = clamp(goDarker ? l0 - i * 0.01 : l0 + i * 0.01);
    const c = rgbToHex(hslToRgb([h, s, l]));
    if (contrast(c, bg) >= ratio) return c;
    if (l === 0 || l === 1) break;
  }
  return goDarker ? INK : PAPER;
}

/**
 * Adjust a *surface* (e.g. button fill) so its best on-colour reaches `ratio`.
 * Mid-tone fills (e.g. #FFB000 yellow) can't hold white OR black text well —
 * we shift the fill itself, toward whichever direction is cheaper.
 */
export function ensureSurface(bg, ratio = AA) {
  if (contrast(bg, onColor(bg)) >= ratio) return bg;
  const [h, s, l0] = rgbToHsl(hexToRgb(bg));
  for (let i = 1; i <= 100; i++) {
    for (const dir of [-1, 1]) {
      const c = rgbToHex(hslToRgb([h, s, clamp(l0 + dir * i * 0.01)]));
      if (contrast(c, onColor(c)) >= ratio) return c;
    }
  }
  return INK;
}

const channels = (hex) => hexToRgb(hex).join(' ');

/* ---------------------------------------------------------- theme build */

/**
 * @param {Partial<Record<typeof THEME_FIELDS[number], string>>} input
 * @returns {{ colors, tokens, cssVars, report, valid }}
 */
export function buildTheme(input = {}) {
  const base = THEME_PRESETS.noir;
  const raw = {};
  const report = [];

  for (const k of THEME_FIELDS) {
    const n = normalizeHex(input[k]);
    raw[k] = n || base[k];
    if (input[k] && !n) report.push({ field: k, level: 'error', code: 'invalid_hex', from: input[k], to: base[k] });
  }

  const bg = raw.background;
  const dark = isDark(bg);
  const fix = (field, code, from, to, ratio) => {
    if (from !== to) report.push({ field, level: 'fixed', code, from, to, ratio: Math.round(ratio * 100) / 100 });
    return to;
  };

  // body text on page background
  const text = fix('text', 'text_contrast', raw.text, ensureContrast(raw.text, bg, 7), contrast(raw.text, bg));
  // muted text — still AA
  const muted = ensureContrast(mix(text, bg, 0.42), bg, AA);
  // brand colour used as text/link/price on background
  const primaryInk = ensureContrast(raw.primary, bg, AA);
  if (primaryInk !== raw.primary) {
    report.push({ field: 'primary', level: 'adjusted', code: 'primary_as_text', from: raw.primary, to: primaryInk, ratio: Math.round(contrast(raw.primary, bg) * 100) / 100 });
  }
  // button fill: must hold its label at AA, and be visible against the page at 3:1
  // (a button whose fill is close to the page colour gets an outline token instead of being recoloured)
  const button = ensureSurface(raw.button, AA);
  fix('button', 'button_contrast', raw.button, button, contrast(raw.button, onColor(raw.button)));

  const primary = ensureSurface(raw.primary, AA);
  const accent = fix('accent', 'accent_contrast', raw.accent, ensureSurface(raw.accent, AA), contrast(raw.accent, onColor(raw.accent)));
  const header = fix('header', 'header_contrast', raw.header, ensureSurface(raw.header, 7), contrast(raw.header, onColor(raw.header)));
  const footer = fix('footer', 'footer_contrast', raw.footer, ensureSurface(raw.footer, 7), contrast(raw.footer, onColor(raw.footer)));

  // secondary is a soft surface tint; keep it close to background so text stays readable
  let secondary = raw.secondary;
  if (contrast(text, secondary) < AA) {
    let candidate = mix(bg, raw.secondary, 0.12);
    if (contrast(text, candidate) < AA) candidate = mix(bg, text, 0.06);
    secondary = fix('secondary', 'secondary_contrast', raw.secondary, candidate, contrast(text, raw.secondary));
  }

  const surface = dark ? mix(bg, '#FFFFFF', 0.05) : mix(bg, '#000000', 0.025);
  const border = mix(bg, text, dark ? 0.16 : 0.1);
  const borderStrong = mix(bg, text, dark ? 0.3 : 0.22);

  const colors = {
    background: bg,
    surface,
    elevated: dark ? mix(bg, '#FFFFFF', 0.08) : '#FFFFFF',
    text,
    muted,
    border,
    borderStrong,
    primary,
    onPrimary: onColor(primary),
    primaryInk,
    secondary,
    onSecondary: ensureContrast(text, secondary, AA),
    accent,
    onAccent: onColor(accent),
    button,
    onButton: onColor(button),
    buttonOutline: contrast(button, bg) < 1.6 ? borderStrong : button,
    header,
    onHeader: onColor(header),
    footer,
    onFooter: onColor(footer),
    footerMuted: ensureContrast(mix(onColor(footer), footer, 0.38), footer, AA),
    sale: ensureContrast(dark ? '#FF6B6B' : '#C62828', bg, AA),
    success: ensureContrast(dark ? '#4ADE80' : '#15803D', bg, AA),
    ring: ensureContrast(raw.primary, bg, AA_LARGE),
  };

  const cssVars = {};
  for (const [k, v] of Object.entries(colors)) cssVars[`--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`] = channels(v);
  cssVars['color-scheme'] = dark ? 'dark' : 'light';

  return {
    input: raw,
    colors,
    cssVars,
    dark,
    report,
    valid: !report.some((r) => r.level === 'error'),
    checks: [
      { pair: 'text/background', ratio: contrast(colors.text, bg) },
      { pair: 'button', ratio: contrast(colors.button, colors.onButton) },
      { pair: 'primary/background', ratio: contrast(colors.primaryInk, bg) },
      { pair: 'accent', ratio: contrast(colors.accent, colors.onAccent) },
      { pair: 'header', ratio: contrast(colors.header, colors.onHeader) },
      { pair: 'footer', ratio: contrast(colors.footer, colors.onFooter) },
    ].map((c) => ({ ...c, ratio: Math.round(c.ratio * 100) / 100, pass: c.ratio >= AA })),
  };
}

/** Serialise to a CSS declaration block string. */
export function themeToCss(theme, selector = ':root') {
  return `${selector}{${Object.entries(theme.cssVars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}
