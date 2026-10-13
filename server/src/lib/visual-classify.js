/**
 * Garment-family detection for visual search — free, runs on the same CLIP vectors, no extra API.
 *
 *  1. Zero-shot: each family has a few text prompts; the image vector is compared with their (ensembled) text vector.
 *  2. Learned: Banha's own catalogue is the training data. The mean image vector of every family (built from products
 *     whose name/category already say what they are) becomes a second classifier. The more products stores add,
 *     the more this part is trusted (weight n/(n+40), capped), so it adapts to how local shops actually photograph.
 *  3. Outfit photos are cropped (top / bottom / feet) so one photo can yield several detected pieces.
 */
import { cosine, softmax, normalize } from './visual-core.js';

const TEMPLATES = ['a photo of {x}', 'a product photo of {x}', 'a person wearing {x}'];
export const FAMILY_PROMPTS = {
  tops: ['a t-shirt', 'a shirt', 'a blouse', 'a sweater', 'a hoodie', 'a polo shirt'],
  bottoms: ['jeans', 'trousers', 'pants', 'shorts', 'a skirt', 'leggings'],
  dresses: ['a dress', 'an evening dress', 'a wedding dress', 'a jumpsuit'],
  suiting: ['a men\'s suit', 'a blazer', 'a tuxedo', 'a waistcoat'],
  outerwear: ['a jacket', 'a coat', 'a cardigan', 'a shawl'],
  modest: ['an abaya', 'a long jalabiya robe', 'a hijab headscarf', 'a long modest cardigan'],
  shoes: ['sneakers', 'high heel shoes', 'boots', 'sandals', 'formal leather shoes', 'loafers'],
  bags: ['a handbag', 'a backpack', 'a clutch bag', 'a tote bag'],
  accessories: ['a wrist watch', 'jewelry', 'a belt', 'a cap', 'a necktie'],
  sport: ['sportswear', 'a tracksuit', 'a sports t-shirt', 'running shoes'],
  underwear_sleep: ['pajamas', 'underwear', 'a nightgown'],
};

export const MIN_CENTROID_N = 3;
const T_TEXT = 100;     // CLIP's own logit scale
const T_CENTROID = 40;  // image↔image cosines are squeezed into a narrower range
const MAX_LEARNED_WEIGHT = 0.6;

/** One normalised text vector per family (mean over prompts × templates). embedTexts(strings) → Float32Array[] */
export async function buildTextPrototypes(embedTexts, prompts = FAMILY_PROMPTS) {
  const out = new Map();
  for (const [family, items] of Object.entries(prompts)) {
    const texts = items.flatMap((x) => TEMPLATES.map((t) => t.replace('{x}', x)));
    const vecs = await embedTexts(texts);
    const mean = new Float32Array(vecs[0].length);
    for (const v of vecs) for (let i = 0; i < mean.length; i++) mean[i] += v[i] / vecs.length;
    out.set(family, normalize(mean));
  }
  return out;
}

/** rows: [{ family, vec }] → Map(family → { vec, n }). Families with fewer than MIN_CENTROID_N examples are skipped. */
export function buildCentroids(rows) {
  const acc = new Map();
  for (const { family, vec } of rows) {
    if (!family) continue;
    const a = acc.get(family) || { sum: new Float32Array(vec.length), n: 0 };
    for (let i = 0; i < vec.length; i++) a.sum[i] += vec[i];
    a.n++; acc.set(family, a);
  }
  const out = new Map();
  for (const [family, a] of acc) if (a.n >= MIN_CENTROID_N) out.set(family, { vec: normalize(a.sum), n: a.n });
  return out;
}

/** → [{ family, p }] sorted by probability. protos = { text: Map, centroids: Map } */
export function familyProbabilities(vec, protos) {
  const fams = [...protos.text.keys()];
  const pt = softmax(fams.map((f) => T_TEXT * cosine(vec, protos.text.get(f))));
  const withC = fams.filter((f) => protos.centroids?.get(f));
  let weight = 0; let pc = null;
  if (withC.length >= 2) {
    const total = withC.reduce((s, f) => s + protos.centroids.get(f).n, 0);
    weight = Math.min(MAX_LEARNED_WEIGHT, total / (total + 40));
    const sc = softmax(withC.map((f) => T_CENTROID * cosine(vec, protos.centroids.get(f).vec)));
    pc = new Map(withC.map((f, i) => [f, sc[i]]));
  }
  const mixed = fams.map((f, i) => (pc ? (1 - weight) * pt[i] + weight * (pc.get(f) ?? pt[i]) : pt[i]));
  const sum = mixed.reduce((a, b) => a + b, 0) || 1;
  return fams.map((f, i) => ({ family: f, p: mixed[i] / sum })).sort((a, b) => b.p - a.p);
}

/**
 * regions: [{ key, vec }]. Returns up to `max` detected pieces: [{ family, p, regionKey, vec }].
 * The piece's vec is the crop that matched best, so "shoes" is searched with the shoe crop, not the whole outfit.
 */
export function detectItems(regions, protos, { minP = 0.4, minFullP = 0.3, max = 3 } = {}) {
  const best = new Map();
  let firstFull = null;
  for (const r of regions) {
    const probs = familyProbabilities(r.vec, protos);
    if (r.key === 'full') firstFull = { ...probs[0], regionKey: 'full', vec: r.vec };
    for (const { family, p } of probs.slice(0, 2)) {
      if (p < (r.key === 'full' ? minFullP : minP)) continue;
      const prev = best.get(family);
      if (!prev || p > prev.p) best.set(family, { family, p, regionKey: r.key, vec: r.vec });
    }
  }
  const items = [...best.values()].sort((a, b) => b.p - a.p).slice(0, max);
  // an unsure classifier must not block the search — the similarity gate decides what is actually shown
  if (!items.length && firstFull) items.push(firstFull);
  return items;
}

/** The crop that looks most like `family` — used when the customer picks the type themselves. */
export function vectorForFamily(regions, protos, family) {
  let pick = { vec: regions[0].vec, p: -1, regionKey: regions[0].key };
  for (const r of regions) {
    const p = familyProbabilities(r.vec, protos).find((x) => x.family === family)?.p ?? 0;
    if (p > pick.p) pick = { vec: r.vec, p, regionKey: r.key };
  }
  return pick;
}
