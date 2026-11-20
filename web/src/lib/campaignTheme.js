/**
 * Looks for the Twist sale campaigns. A theme is just a starting point: the admin can change both colours, the falling shapes,
 * how many fall and how fast — so the same system serves Black Friday, New Year, Ramadan, Eid, Valentine…
 */
export const THEMES = {
  blackfriday: { name: 'بلاك فرايدي', c1: '#111111', c2: '#F5B301', glyphs: ['%', '٪', '🏷️'], pct: true, emoji: '🔥' },
  newyear: { name: 'رأس السنة', c1: '#0B1B3F', c2: '#F4C95D', glyphs: ['✨', '🎉', '🎆', '⭐', '🥂'], emoji: '🎆' },
  ramadan: { name: 'رمضان', c1: '#2A1458', c2: '#E9B949', glyphs: ['🌙', '⭐', '✦', '🏮'], emoji: '🌙' },
  eid: { name: 'العيد', c1: '#0B6B4F', c2: '#F2D37A', glyphs: ['🎈', '✨', '🌙', '🎁'], emoji: '🎁' },
  valentine: { name: 'فالنتاين', c1: '#9B1C3F', c2: '#FF8FAB', glyphs: ['❤', '💖', '✨', '💝'], emoji: '💝' },
  summer: { name: 'الصيف', c1: '#0E7490', c2: '#FDBA74', glyphs: ['☀️', '🌴', '✦', '🍉'], emoji: '☀️' },
  sale: { name: 'تخفيضات عامة', c1: '#B91C1C', c2: '#FDE68A', glyphs: ['%', '🏷️', '✦'], pct: true, emoji: '🏷️' },
};
export const DENSITY = { off: 0, low: 22, medium: 38, high: 60 };
export const SPEED = { calm: 0.6, normal: 1, lively: 1.5 };
const ok = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

/** Public campaign (as /campaigns/active returns it) → everything the renderers need. */
export function look(c) {
  const t = THEMES[c?.theme] || THEMES.blackfriday;
  const custom = c?.glyphs ? [...c.glyphs].filter((g) => g.trim()) : [];
  const base = custom.length ? custom : t.glyphs;
  const glyphs = !custom.length && t.pct && c?.kind !== 'shipping' && c?.percent ? [...base, `${c.percent}%`] : base;
  return {
    c1: ok(c?.color1) ? c.color1 : t.c1, c2: ok(c?.color2) ? c.color2 : t.c2, glyphs, emoji: t.emoji,
    count: DENSITY[c?.density] ?? DENSITY.low, speed: SPEED[c?.speed] ?? SPEED.calm,
  };
}
/** Is this colour dark enough to need white text? (we always use white on c1, and c1 is checked here for the readable-accent case) */
export const luma = (hex) => { const n = parseInt((hex || '#000').slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
