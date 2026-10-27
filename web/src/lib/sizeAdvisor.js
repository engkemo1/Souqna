/** Twila's size suggestion: a transparent rule of thumb from the shopper's height/weight (or foot length), matched to the sizes the product really has. */
const LETTERS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const norm = (s) => String(s).toUpperCase().replace(/\s/g, '').replace('XXXL', '3XL').replace('2XL', 'XXL');
const WEIGHT_CUTS = { m: [58, 68, 80, 92, 104, 116], f: [50, 58, 68, 78, 90, 102] }; // upper bound of XS, S, M, L, XL, XXL

export const advisorKind = (dept, sizes = []) => {
  if (!sizes.length) return null;
  if (dept === 'shoes') return 'shoe';
  if (['kids', 'bags', 'hijab', 'accessories', 'abaya', 'jalabiya'].includes(dept)) return null;
  if (sizes.every((x) => LETTERS.includes(norm(x)))) return 'letter';
  const nums = sizes.map(Number);
  if (nums.every((n) => Number.isFinite(n))) return dept === 'denim' || nums.every((n) => n >= 26 && n <= 46) ? 'waist' : dept === 'wedding_suit' ? 'suit' : null;
  return null;
};

function letterIndex({ sex, height, weight }) {
  const cuts = WEIGHT_CUTS[sex === 'f' ? 'f' : 'm'];
  let i = cuts.findIndex((c) => weight < c); if (i < 0) i = cuts.length;
  if (height >= (sex === 'f' ? 175 : 188)) i += 1;
  else if (height <= (sex === 'f' ? 155 : 165)) i -= 1;
  return Math.max(0, Math.min(LETTERS.length - 1, i));
}

const nearest = (values, target) => values.reduce((best, v) => (best == null || Math.abs(v - target) < Math.abs(best - target) || (Math.abs(v - target) === Math.abs(best - target) && v > best) ? v : best), null);

/** → { size, alt } (alt = the size to take if the shopper likes it loose), both picked from `sizes`, or null when it cannot say. */
export function suggestSize({ kind, sizes, sex, height, weight, foot }) {
  if (kind === 'letter' || kind === 'suit') {
    if (!height || !weight) return null;
    const i = letterIndex({ sex, height, weight });
    const avail = sizes.map((s) => ({ s, idx: kind === 'suit' ? (Number(s) - 46) / 2 : LETTERS.indexOf(norm(s)) }));
    const at = (t) => { const idxs = avail.map((a) => a.idx); const n = nearest(idxs, kind === 'suit' ? Math.round(t * 0.8 + 0.4) : t); return avail.find((a) => a.idx === n)?.s ?? null; };
    return { size: at(i), alt: at(i + 1) };
  }
  if (kind === 'waist') {
    if (!weight) return null;
    const w = Math.round((30 + (weight - 60) * (sex === 'f' ? 0.17 : 0.2)) / 2) * 2;
    const nums = sizes.map(Number);
    const pick = (t) => { const n = nearest(nums, t); return sizes[nums.indexOf(n)]; };
    return { size: pick(w), alt: pick(w + 2) };
  }
  if (kind === 'shoe') {
    if (!foot) return null;
    const eu = Math.round((Number(foot) + 1.5) * 1.5);
    const nums = sizes.map(Number);
    const pick = (t) => { const n = nearest(nums, t); return sizes[nums.indexOf(n)]; };
    return { size: pick(eu), alt: pick(eu + 1) };
  }
  return null;
}
