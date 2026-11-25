// Children's outfit compatibility gate.
// Policy (conservative): a children's outfit is shown only when EVERY clothing and footwear piece has an explicit, parseable age/size range,
// all ranges share one common age band, and each piece has an in-stock variant inside that band. Nothing is guessed from a picture or a name.
// Ages are handled in MONTHS: a label "6 years" covers a child aged 72–83 months; "2–3 years" covers 24–47; "12–18 months" covers 12–18.

const toAscii = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const clean = (s) => toAscii(s).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '').replace(/[–—]/g, '-');
const YEAR = '(?:years?|yrs?|y|سنه|سنين|سنوات|عام)';
const MONTH = '(?:months?|mos?|m|شهر|شهور|اشهر)';
const END = '(?=$|[^a-z0-9])';
const RANGE = '(?:-|الي|الى|ل|to|~)';

export const KIDS_GENDERS = new Set(['kids', 'boys', 'girls']);
export const isKidsPiece = (p) => KIDS_GENDERS.has(p?.gender);
/** Pieces that never need an age fit: accessories and bags. Everything else (clothing + footwear) must fit. */
const EXEMPT_KEYS = new Set(['tie', 'bow_tie', 'pocket_square', 'belt', 'watch', 'jewelry', 'cap', 'socks', 'perfume', 'cufflinks', 'handbag', 'clutch', 'crossbody', 'tote', 'backpack']);
export const SHOE_KEYS = new Set(['shoes_any', 'sneakers', 'formal_shoes', 'loafers', 'heels_low', 'heels_high', 'flats', 'sandals', 'boots', 'slippers', 'sport_shoes']);
export const needsAgeFit = (key) => !!key && !EXEMPT_KEYS.has(key);

const band = (minAgeMonths, maxAgeMonths, source, confidence) => ({ minAgeMonths, maxAgeMonths, source, confidence });

/** Every explicit age range found in a text/label: [{minAgeMonths,maxAgeMonths,source,confidence}]. Plain numbers without a unit are NOT ages. */
export function parseChildSizes(value, { source = 'label', confidence = 'high' } = {}) {
  let t = ` ${clean(value)} `; const out = [];
  const push = (a, b, months) => {
    const lo = months ? a : a * 12; const hi = months ? b : b * 12 + 11;
    if (hi >= lo && lo >= 0 && hi <= 16 * 12 + 11 && a <= (months ? 191 : 16)) out.push(band(lo, hi, source, confidence));
  };
  t = t.replace(new RegExp(`(\\d{1,2})\\s*${RANGE}\\s*(\\d{1,2})\\s*${MONTH}${END}`, 'g'), (_, a, b) => { push(+a, +b, true); return ' '; });
  t = t.replace(new RegExp(`(\\d{1,2})\\s*${RANGE}\\s*(\\d{1,2})\\s*${YEAR}${END}`, 'g'), (_, a, b) => { push(+a, +b, false); return ' '; });
  t = t.replace(new RegExp(`(?:^|[^0-9])(\\d{1,2})\\s*${MONTH}${END}`, 'g'), (m, a) => { push(+a, +a, true); return ' '; });
  t = t.replace(new RegExp(`(?:^|[^0-9])(\\d{1,2})\\s*${YEAR}${END}`, 'g'), (m, a) => { push(+a, +a, false); return ' '; });
  t = t.replace(new RegExp(`(?:سن|عمر|age)\\s*(\\d{1,2})${END}`, 'g'), (_, a) => { push(+a, +a, false); return ' '; });
  return out;
}
/** parseChildSize("2-3 years" | "6 سنين" | "من 2 إلى 3 سنين" | "6y" | "12-18 months") -> { minAgeMonths, maxAgeMonths, source, confidence } | null (generic words like "أطفال" are not sizes). */
export function parseChildSize(value, opts) {
  const all = parseChildSizes(value, opts);
  if (!all.length) return null;
  return band(Math.min(...all.map((b) => b.minAgeMonths)), Math.max(...all.map((b) => b.maxAgeMonths)), all[0].source, all[0].confidence);
}

/**
 * Children's EU shoe size -> age band (months). Approximate European children's size charts, with a little overlap between neighbouring sizes.
 * Only ever applied to a piece already identified as a CHILD's shoe (gender kids/boys/girls). EU 38+ is not a child size and maps to nothing.
 */
export const CHILD_SHOE_BANDS = {
  18: [6, 12], 19: [9, 15], 20: [12, 18], 21: [15, 24], 22: [18, 30], 23: [24, 36], 24: [30, 42], 25: [36, 48], 26: [42, 54], 27: [48, 60],
  28: [54, 72], 29: [60, 78], 30: [66, 84], 31: [72, 96], 32: [84, 108], 33: [96, 120], 34: [108, 132], 35: [120, 144], 36: [132, 156], 37: [144, 168],
};
/** "32" or "32-37" (a broad range = the union, i.e. a broad older-child range) -> band | null */
export function parseChildShoeSize(value) {
  const t = clean(value).trim();
  const m = t.match(/^(?:eu\s*)?(\d{2})(?:\s*(?:-|الي|الى|to|~)\s*(?:eu\s*)?(\d{2}))?$/);
  if (!m) return null;
  const a = +m[1]; const b = m[2] ? +m[2] : a;
  if (b < a || !CHILD_SHOE_BANDS[a] || !CHILD_SHOE_BANDS[b]) return null;
  return band(CHILD_SHOE_BANDS[a][0], CHILD_SHOE_BANDS[b][1], 'shoe_size_table', 'medium');
}

const GENERIC_KID_WORD = /^(?:اطفال|طفل|اطفالي|kids?|child(?:ren)?|صغار|فري ?سايز|free ?size)$/i;
/** Never show a generic word ("أطفال") as the size. */
export const isGenericKidLabel = (s) => GENERIC_KID_WORD.test(clean(s).trim());

export function ageLabel(b) {
  if (!b) return '';
  const y0 = b.minAgeMonths / 12; const y1 = (b.maxAgeMonths + 1) / 12;
  if (b.maxAgeMonths < 24) return `${b.minAgeMonths}–${b.maxAgeMonths} شهر`;
  const a = Math.floor(y0); const z = Math.max(a, Math.ceil(y1) - 1);
  return a === z ? `${a} سنين` : `${a}–${z} سنين`;
}

const overlap = (a, b) => ({ min: Math.max(a.min, b.min), max: Math.min(a.max, b.max) });
function findCommon(sets) { // sets: [[{min,max,...cand}]] one candidate list per piece -> { min, max, picks } | null (first/widest intersection)
  let best = null;
  const walk = (i, cur, picks) => {
    if (i === sets.length) { if (!best || cur.max - cur.min > best.max - best.min) best = { ...cur, picks: [...picks] }; return; }
    for (const c of sets[i]) { const nx = i === 0 ? { min: c.min, max: c.max } : overlap(cur, c); if (nx.min <= nx.max) walk(i + 1, nx, [...picks, c]); }
  };
  if (sets.length) walk(0, { min: -Infinity, max: Infinity }, []);
  return best;
}

/** Candidate bands of one piece from its variants (explicit size labels). */
function bandsFromVariants(piece, variants, isShoe) {
  const out = [];
  for (const v of variants || []) {
    const b = isShoe ? parseChildShoeSize(v.size) : parseChildSize(v.size);
    if (b) out.push({ min: b.minAgeMonths, max: b.maxAgeMonths, variantId: v.id ?? null, size: String(v.size), stock: Number(v.stock) || 0, source: b.source, confidence: b.confidence });
  }
  return out;
}
/** Product-level explicit data (the size list the shop filled in, or an explicit age in the description) when no variant label carries an age. */
function bandsFromProduct(piece, isShoe) {
  const out = [];
  let sj = piece.sizes_json; if (typeof sj === 'string') { try { sj = JSON.parse(sj); } catch { sj = [sj]; } }
  for (const x of Array.isArray(sj) ? sj : []) {
    const label = typeof x === 'object' ? x?.name || x?.size || x?.label || '' : x;
    const b = isShoe ? parseChildShoeSize(label) : parseChildSize(label, { source: 'sizes_json', confidence: 'medium' });
    if (b) out.push({ min: b.minAgeMonths, max: b.maxAgeMonths, variantId: null, size: String(label), stock: null, source: b.source, confidence: 'medium' });
  }
  if (out.length || isShoe) return out; // a shoe's size comes only from a shoe size, never from prose
  const desc = `${piece.description_ar || ''} . ${piece.description_en || ''}`;
  for (const b of parseChildSizes(desc, { source: 'description', confidence: 'low' })) out.push({ min: b.minAgeMonths, max: b.maxAgeMonths, variantId: null, size: ageLabel(b), stock: null, source: 'description', confidence: 'low' });
  return out;
}

/**
 * Gate for a full outfit. Returns null when it is not a children's outfit (no piece is a child piece) so adult looks are untouched.
 * pieces: enriched rows { id, key, gender, sizes_json?, description_ar?, ... }; ctx.variantsOf(id) -> [{ id, color, size, stock }]
 * -> { ok, reasons[], common: {minAgeMonths,maxAgeMonths}|null, picks: [{ id, variantId, size, left }] }
 */
export function childOutfitGate(pieces, ctx = {}) {
  const list = (pieces || []).filter(Boolean);
  if (!list.some(isKidsPiece)) return null;
  const reasons = [];
  const subject = list.filter((p) => needsAgeFit(p.key));
  const all = []; const live = []; const sources = [];
  for (const p of subject) {
    if (!isKidsPiece(p)) { reasons.push(`child_age_unknown:${p.id}`); continue; } // adult / unisex piece with no explicit child fit
    const isShoe = SHOE_KEYS.has(p.key);
    const variants = ctx.variantsOf ? ctx.variantsOf(p.id) : [];
    const untracked = p.track_stock === 0 || p.track_stock === false; // stock tracking off: always available, units left unknown
    let cands = bandsFromVariants(p, variants, isShoe);
    if (!cands.length) { cands = bandsFromProduct(p, isShoe); if (cands.length && variants.length && !variants.some((v) => Number(v.stock) > 0)) cands = cands.map((c) => ({ ...c, stock: 0 })); else cands = cands.map((c) => ({ ...c, stock: variants.length ? variants.filter((v) => Number(v.stock) > 0).reduce((s, v) => s + Number(v.stock), 0) : (p.inStock === false ? 0 : null) })); }
    if (!cands.length) {
      // a child-classified shoe whose numeric sizes fall outside the documented table (EU 38+ / under 18): still rejected, but logged distinctly so older-children's shoes can be measured before the table is widened
      const numeric = isShoe && (variants || []).some((v) => /^\s*(?:eu\s*)?\d{2}(?:\s*-\s*\d{2})?\s*$/i.test(String(v.size)));
      reasons.push(numeric ? `child_shoe_size_unmapped:${p.id}` : `child_age_unknown:${p.id}`); continue;
    }
    if (untracked) cands = cands.map((c) => ({ ...c, stock: null }));
    all.push({ piece: p, isShoe, cands }); live.push({ piece: p, isShoe, cands: cands.filter((c) => c.stock == null || c.stock > 0) }); sources.push(p.id);
  }
  if (reasons.length) return { ok: false, reasons, common: null, picks: [] };
  if (!all.length) return { ok: false, reasons: ['child_age_unknown'], common: null, picks: [] };
  // 1) do the pieces fit the same child at all (ignoring stock)?
  const anyFit = findCommon(all.map((x) => x.cands));
  if (!anyFit) {
    const noShoes = all.filter((x) => !x.isShoe);
    const shoeIds = all.filter((x) => x.isShoe).map((x) => x.piece.id);
    const clothesFit = noShoes.length ? findCommon(noShoes.map((x) => x.cands)) : null;
    if (shoeIds.length && (clothesFit || !noShoes.length)) return { ok: false, reasons: shoeIds.map((id) => `child_shoe_size_mismatch:${id}`), common: null, picks: [] };
    return { ok: false, reasons: ['child_age_mismatch'], common: null, picks: [] };
  }
  // 2) is there an IN-STOCK variant of every piece inside one common band?
  const emptyLive = live.filter((x) => !x.cands.length).map((x) => x.piece.id);
  if (emptyLive.length) return { ok: false, reasons: emptyLive.map((id) => `child_size_variant_unavailable:${id}`), common: null, picks: [] };
  const fit = findCommon(live.map((x) => x.cands));
  if (!fit) return { ok: false, reasons: ['child_size_variant_unavailable'], common: null, picks: [] };
  return {
    ok: true, reasons: [], common: { minAgeMonths: fit.min, maxAgeMonths: fit.max },
    picks: fit.picks.map((c, i) => ({ id: live[i].piece.id, variantId: c.variantId, size: c.size, left: c.stock, source: c.source })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Audience gate: one outfit = exactly one audience group. Unknown or contradictory audience = no outfit (never a guess).
//   men    : men's or adult-unisex pieces only          women : women's (incl. hijab pieces) or adult-unisex only
//   boys / girls / kids : products explicitly classified for that child audience only (never any adult piece, accessories included)
// A couple / family request is answered as separate tabs (one per person); a single tab is always one audience.
const GROUPS = new Set(['men', 'women', 'boys', 'girls', 'kids', 'unisex']);
const ALLOWED = { men: new Set(['men', 'unisex']), women: new Set(['women', 'unisex']), boys: new Set(['boys', 'kids']), girls: new Set(['girls', 'kids']), kids: new Set(['kids', 'boys', 'girls']) };
const WOMEN_ONLY_KEYS = new Set(['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_bridal', 'dress_beach', 'jumpsuit', 'abaya', 'hijab_set', 'tarha', 'hijab_cap', 'skirt', 'blouse', 'heels_low', 'heels_high', 'clutch']);
/** requested: 'men' | 'women' | 'boys' | 'girls' | 'kids' | null (the audience the tab/page is for, when known). -> reasons[] */
export function audienceGate(pieces, { audience = null } = {}) {
  const list = (pieces || []).filter(Boolean); const reasons = [];
  for (const p of list) if (!GROUPS.has(p.gender)) reasons.push(`audience_unknown:${p.id}`);
  if (reasons.length) return reasons;
  const genders = list.map((p) => p.gender);
  const kids = list.some(isKidsPiece);
  const side = new Set(genders.filter((g) => g === 'men' || g === 'women'));
  if (kids) {
    for (const p of list) if (!isKidsPiece(p)) reasons.push(`audience_mismatch:${p.id}`); // a child's look contains only child products
    if (genders.includes('boys') && genders.includes('girls')) reasons.push('audience_mismatch:boys_girls');
  } else if (side.size > 1) reasons.push('audience_mismatch:men_women');
  if (audience && ALLOWED[audience]) for (const p of list) if (!ALLOWED[audience].has(p.gender) && !reasons.includes(`audience_mismatch:${p.id}`)) reasons.push(`audience_mismatch:${p.id}`);
  const menSide = side.has('men') || audience === 'men' || audience === 'boys';
  if (menSide) for (const p of list) if (WOMEN_ONLY_KEYS.has(p.key) && !reasons.includes(`audience_mismatch:${p.id}`)) reasons.push(`audience_mismatch:${p.id}`);
  return reasons;
}

// ---------------------------------------------------------------------------------------------------------------------
// Adult sizes: shirt, trouser and shoe scales are unrelated, so they are NEVER compared with each other. Each piece only needs one purchasable
// in-stock variant (checked elsewhere). When the shopper EXPLICITLY gave sizes ({ top:'L', bottom:'34', shoes:'43' }), each piece is checked against
// the size of its own category only.
const TOP_CAT = new Set(['tshirt', 'polo', 'shirt', 'blouse', 'sweater', 'hoodie', 'tunic', 'top', 'sport_top', 'jacket', 'blazer', 'coat', 'cardigan']);
const BOTTOM_CAT = new Set(['jeans', 'trousers', 'chinos', 'shorts', 'skirt', 'leggings', 'joggers', 'sport_bottom']);
export const sizeCategoryOf = (key) => (TOP_CAT.has(key) ? 'top' : BOTTOM_CAT.has(key) ? 'bottom' : SHOE_KEYS.has(key) ? 'shoes' : null);
const sizeNorm = (s) => clean(s).replace(/\s+/g, '').replace(/^eu/, '').replace(/^(2xl)$/, 'xxl').replace(/^(3xl)$/, 'xxxl');
/** wanted: { top?, bottom?, shoes? } -> reasons[] like `size_unavailable:shoes:7` */
export function wantedSizeGate(pieces, wanted, variantsOf) {
  const reasons = [];
  if (!wanted) return reasons;
  for (const p of (pieces || []).filter(Boolean)) {
    const cat = sizeCategoryOf(p.key); const w = cat && wanted[cat];
    if (!w) continue;
    const vs = variantsOf ? variantsOf(p.id) : [];
    if (!vs.length) continue; // simple product, no size data: the product-level stock decides (checked elsewhere)
    const untracked = p.track_stock === 0 || p.track_stock === false;
    if (!vs.some((v) => (untracked || Number(v.stock) > 0) && sizeNorm(v.size) === sizeNorm(w))) reasons.push(`size_unavailable:${cat}:${p.id}`);
  }
  return reasons;
}
