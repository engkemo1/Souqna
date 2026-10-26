/**
 * Brand palette from a logo
 * ------------------------------------------------------------
 * Pure functions (no I/O) so the same code runs on the server and in tests.
 * Input : swatches  [{ hex, pop }]   — dominant colours of the logo, pop = share of visible pixels (0..1)
 * Output: two complete theme inputs (light + dark) for the Theme Engine, plus a recommendation.
 * Every variant is finally pushed through buildTheme(), so contrast (WCAG AA) is guaranteed
 * and the owner sees exactly what will be applied.
 */
import { buildTheme, normalizeHex, hexToRgb, rgbToHex } from './theme.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function toHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function fromHsl({ h, s, l }) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s); l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Split swatches into brand colours (chromatic) and neutrals (white / black / grey backgrounds). */
export function classify(swatches = []) {
  const list = swatches
    .map((s) => ({ hex: normalizeHex(s.hex), pop: Number(s.pop) || 0 }))
    .filter((s) => s.hex && s.pop > 0)
    .map((s) => ({ ...s, ...toHsl(s.hex) }));
  const total = list.reduce((a, s) => a + s.pop, 0) || 1;
  list.forEach((s) => { s.pop /= total; });
  const tones = list.filter((s) => s.s >= 0.2 && s.l >= 0.1 && s.l <= 0.93 && s.pop >= 0.004);
  const neutrals = list.filter((s) => !tones.includes(s));
  // Group tones of one hue (a gold or silver gradient is one brand colour, not five).
  const families = [];
  for (const t of [...tones].sort((x, y) => y.pop - x.pop)) {
    const fam = families.find((f) => hueGap(f.h, t.h) < 22);
    if (fam) { fam.members.push(t); fam.pop += t.pop; } else families.push({ h: t.h, pop: t.pop, members: [t] });
  }
  // The family's representative is its most "alive" tone: saturated, and light enough to read as the colour
  // (so a gold gradient picks the gold, not the near-black shadow of it).
  const rep = (f) => [...f.members].sort((x, y) => y.s * (0.5 + Math.min(y.l, 0.7)) - x.s * (0.5 + Math.min(x.l, 0.7)))[0];
  const chromatic = families.map((f) => ({ ...rep(f), pop: f.pop }));
  const score = (c) => Math.sqrt(c.pop) * c.s * (1 - Math.abs(c.l - 0.5) * 0.7);
  chromatic.sort((x, y) => score(y) - score(x));
  return { list, chromatic, neutrals, score };
}

export function suggestThemes(swatches) {
  const { list, chromatic, neutrals, score } = classify(swatches);
  const biggest = [...list].sort((a, b) => b.pop - a.pop)[0];
  const monochrome = chromatic.length === 0;

  // brand + accent -----------------------------------------------------------
  let brand, accent;
  if (monochrome) {
    brand = { h: 0, s: 0, l: 0.08 };
    accent = null; // keep the platform default accent
  } else {
    const b = chromatic[0];
    brand = { h: b.h, s: b.s, l: b.l };
    const second = chromatic.slice(1).find((s) => hueGap(s.h, b.h) >= 35 && score(s) >= score(b) * 0.2);
    // single-colour logo: a richer sibling of the brand (same hue, never drifting into olive / lime)
    accent = second ? { h: second.h, s: second.s, l: second.l } : { h: b.h, s: clamp(b.s + 0.2, 0.55, 0.92), l: 0.5 };
  }
  const brandHex = monochrome ? '#111111' : fromHsl(brand);

  // light variant ---------------------------------------------------------------
  const deep = monochrome ? '#111111' : fromHsl({ h: brand.h, s: clamp(brand.s, 0.3, 0.9), l: clamp(brand.l, 0.22, 0.42) });
  const lightInput = {
    primary: deep,
    secondary: monochrome ? '#F3F1EC' : fromHsl({ h: brand.h, s: clamp(brand.s, 0.2, 0.6), l: 0.95 }),
    accent: accent ? fromHsl({ h: accent.h, s: clamp(accent.s, 0.45, 0.9), l: clamp(accent.l, 0.38, 0.52) }) : '#C2410C',
    background: '#FFFFFF',
    text: monochrome ? '#141414' : fromHsl({ h: brand.h, s: 0.25, l: 0.09 }),
    button: deep,
    header: '#FFFFFF',
    footer: monochrome ? '#111111' : fromHsl({ h: brand.h, s: clamp(brand.s, 0.25, 0.6), l: 0.11 }),
  };

  // dark variant ----------------------------------------------------------------
  const tint = monochrome ? { h: 40, s: 0.06 } : { h: brand.h, s: clamp(brand.s, 0, 0.32) };
  const bright = monochrome ? '#E9D8B4' : fromHsl({ h: brand.h, s: clamp(brand.s, 0.4, 0.9), l: clamp(Math.max(brand.l, 0.62), 0.62, 0.74) });
  const darkInput = {
    primary: bright,
    secondary: fromHsl({ ...tint, l: 0.115 }),
    accent: accent ? fromHsl({ h: accent.h, s: clamp(accent.s, 0.5, 0.9), l: clamp(Math.max(accent.l, 0.58), 0.58, 0.7) }) : (monochrome ? '#E9A23B' : bright),
    background: fromHsl({ ...tint, l: 0.065 }),
    text: '#F4F2EE',
    button: bright,
    header: fromHsl({ ...tint, l: 0.065 }),
    footer: fromHsl({ ...tint, l: 0.035 }),
  };

  const variants = [
    { id: 'light', input: lightInput },
    { id: 'dark', input: darkInput },
  ].map((v) => {
    const t = buildTheme(v.input);
    return { id: v.id, input: t.input, cssVars: t.cssVars, dark: t.dark, checks: t.checks, report: t.report, ok: t.checks.every((c) => c.pass) };
  });

  // recommendation: a logo that sits on a dark field looks best on a dark store, otherwise light
  const recommended = biggest && biggest.l < 0.2 && biggest.pop > 0.3 && !monochrome ? 'dark' : biggest && biggest.l < 0.2 && biggest.pop > 0.5 ? 'dark' : 'light';

  return {
    brand: brandHex,
    accent: accent ? fromHsl(accent) : null,
    monochrome,
    recommended,
    variants,
    swatches: list.slice(0, 6).map((s) => ({ hex: s.hex, pop: Math.round(s.pop * 1000) / 1000 })),
    neutralCount: neutrals.length,
  };
}
