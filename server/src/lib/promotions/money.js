/**
 * Money helpers for the promotions engine.
 * Prices in the catalogue are whole EGP integers. Inside the engine every amount is an integer number of piasters
 * (1 EGP = 100), so percentages and splits never touch floating point. Only integers leave this module.
 */
export const P = 100;
export const toP = (egp) => Math.round(Number(egp) * P);
/** Round piasters to whole EGP (half up). */
export const toEgp = (p) => Math.round(p / P);

/** Integer percentage of an integer amount, rounded half up (no float drift: amount*pct is an exact integer). */
export const pctOf = (amount, pct) => Math.floor((amount * pct * 2 + 100) / 200);

/**
 * Split `total` (integer) across `weights` (non-negative integers) proportionally using the largest-remainder method,
 * so the parts always add up to exactly `total` (unless every part hits its cap). `caps` (optional) limits each part;
 * a capped part is fixed at its cap and the rest is re-split among the others.
 */
export function distribute(total, weights, caps) {
  const n = weights.length;
  const out = new Array(n).fill(0);
  let rem = Math.max(0, Math.floor(total));
  const cap = (i) => (caps ? Math.max(0, caps[i]) : Infinity);
  let active = [];
  for (let i = 0; i < n; i++) if (weights[i] > 0 && cap(i) > 0) active.push(i);
  while (rem > 0 && active.length) {
    const sumW = active.reduce((s, i) => s + weights[i], 0);
    const hit = active.filter((i) => rem * weights[i] >= (cap(i) - out[i]) * sumW);
    if (hit.length) {
      for (const i of hit) { rem -= cap(i) - out[i]; out[i] = cap(i); }
      active = active.filter((i) => !hit.includes(i));
      continue;
    }
    const parts = active.map((i) => ({ i, fl: Math.floor((rem * weights[i]) / sumW), frac: (rem * weights[i]) % sumW }));
    let left = rem;
    for (const p of parts) { out[p.i] += p.fl; left -= p.fl; }
    parts.sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const p of parts) { if (left <= 0) break; if (out[p.i] < cap(p.i)) { out[p.i] += 1; left -= 1; } }
    rem = 0;
  }
  return out;
}
