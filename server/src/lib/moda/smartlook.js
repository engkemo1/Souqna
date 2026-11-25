// «طقم كامل يكمّل القطعة دي» (اقتراح اختياري في صفحة المنتج).
// القاعدة: الطلب الأساسي أولًا، والاقتراح يظهر بس لو الطقم كامل ومتناسق بقواعد تويلا (الرسمية + الألوان + الميزانية)؛
// أي حاجة أقل من كده (قطعة ناقصة، بدائل بعيدة، طلب سؤال للعميل) = نسكت ومنقترحش حاجة.

const AUD_WORD = { men: 'رجالي', women: 'حريمي', boys: 'ولادي', girls: 'بناتي' };

const FORMAL_ACC = new Set(['bow_tie', 'tie', 'cufflinks', 'pocket_square']);
const SUIT_COLOR_AR = { black: 'سودا', navy: 'كحلي' };
/** قطعة رسمية: قميص مانشت مزدوجة أو ببيون/كرافتة/كفلينج — الطقم حواليها لازم يبقى بدلة مش كاجوال. */
export const isFormalAnchor = (a) => !!(a?.frenchCuff || FORMAL_ACC.has(a?.key));

/** نص الطلب اللي بيتبعت لمحرك تويلا: «معايا <القطعة> <الفئة> نسقلي عليه باقي الطقم». null لو الفئة مش واضحة (مش بنخمّن). */
export function smartLookText(anchor) {
  const name = String(anchor?.name_ar || anchor?.name_en || '').trim().slice(0, 80);
  const aud = AUD_WORD[anchor?.gender];
  if (!name || !aud) return null;
  // قميص مانشت مزدوجة = قطعة رسمية: نطلب طقم رسمي (بدلة/سموكن) لمناسبة، مش كاجوال
  if (FORMAL_ACC.has(anchor?.key)) {
    // ببيون/كرافتة سودا أو كحلي: البدلة بنفس الدرجة الغامقة (مش بيج)، مع قميص مانشت مزدوجة وحذاء رسمي
    const c = SUIT_COLOR_AR[anchor.colorKeys?.[0]];
    return `معايا ${name} ${aud} نسقلي عليه بدلة ${c || ''} وقميص دابل مانشت وحذاء لحضور فرح كضيف ميزانيتي 5000`.replace(/\s+/g, ' ');
  }
  if (anchor?.frenchCuff) return `معايا ${name} ${aud} نسقلي عليه بدلة سودا وببيون وحذاء لحضور فرح كضيف ميزانيتي 5000`;
  return `معايا ${name} ${aud} نسقلي عليه باقي الطقم`;
}

/** بوابة الجودة. بترجع { ok:true, ids } أو { ok:false, reason }. */
const TAILORED = new Set(['blazer', 'suit', 'tuxedo', 'womens_suit', 'classic_set', 'waistcoat']);
const CASUAL_TOPS = new Set(['hoodie', 'tshirt', 'sport_top']);

const FORMAL_BAD = new Set(['jeans', 'hoodie', 'tshirt', 'sport_top', 'sneakers', 'shorts', 'joggers', 'sport_bottom', 'polo', 'cargo', 'tracksuit']);
const FORMAL_SUIT = new Set(['suit', 'tuxedo', 'classic_set', 'blazer', 'waistcoat']);

export function acceptSmartLook(result, { anchorId = null, anchorKey = null, anchorFormal = false, keyOf = null, budget = null, minPieces = 2 } = {}) {
  if (!result?.blocks) return { ok: false, reason: 'no_look' };
  if (result.state !== 'full') return { ok: false, reason: `state_${result.state || 'none'}` }; // partial / alternatives / clarify = مش بيرفكت
  if ((result.missing || []).length > 0) return { ok: false, reason: 'missing_pieces' };
  const items = (result.blocks.tabs || []).flatMap((t) => t.items || []);
  const ids = [...new Set(items.map((i) => i.id))];
  if (ids.length < minPieces || ids.length !== items.length) return { ok: false, reason: 'too_few_or_duplicate' };
  if (anchorId != null && ids.includes(anchorId)) return { ok: false, reason: 'contains_anchor' };
  // the same kind of piece twice (two trousers, two pairs of shoes), or another piece of the anchor's own type, is not an outfit
  const keys0 = items.map((i) => i.key).filter(Boolean);
  if (new Set(keys0).size !== keys0.length) return { ok: false, reason: 'duplicate_type' };
  if (anchorKey && keys0.includes(anchorKey)) return { ok: false, reason: 'same_type_as_anchor' };
  // طبقات: هودي/تيشيرت/توب رياضي مبيتلبسش تحت بليزر/بدلة/جيليه
  if (anchorKey && CASUAL_TOPS.has(anchorKey) && typeof keyOf === 'function' && ids.some((id) => TAILORED.has(keyOf(id)))) return { ok: false, reason: 'layering' };
  // قطعة رسمية (قميص مانشت مزدوجة): لازم الطقم يبقى فيه بدلة، ومفيش جينز/هودي/سنيكرز/رياضي
  if (anchorFormal) {
    const keys = items.map((i) => i.key);
    if (!keys.some((k) => FORMAL_SUIT.has(k))) return { ok: false, reason: 'formal_needs_suit' };
    if (keys.some((k) => FORMAL_BAD.has(k))) return { ok: false, reason: 'formal_casual_piece' };
    const suit = items.find((i) => FORMAL_SUIT.has(i.key));
    const tie = items.find((i) => FORMAL_ACC.has(i.key));
    if (suit && tie) {
      const suitCol = suit.colors?.[0];
      const tieCol = tie.colors?.[0];
      if (tieCol === 'black' && suitCol && ['beige', 'white', 'cream', 'khaki'].includes(suitCol)) {
        return { ok: false, reason: 'tie_suit_color' };
      }
    }
  }
  if (items.some((i) => i.repaired)) return { ok: false, reason: 'repaired' };
  if (result.blocks.over > 0) return { ok: false, reason: 'over_budget' };
  const total = Number(result.blocks.total);
  if (budget && Number.isFinite(total) && total > budget) return { ok: false, reason: 'over_budget' };
  return { ok: true, ids };
}

// ---------------------------------------------------------------------------------------------------------------------
// Look reviewer: an independent judge of the FINAL outfit (anchor + chosen pieces). Rules and scores only, no language model.
// Hard rejections for unsafe data / unavailable stock; a 0-100 quality score for the rest. Below MIN_SCORE nothing is shown.
// "No excellent look" = no suggestion. Missing decisive information is a rejection, never a guess.
export const MIN_SCORE = 80;

// ---------------------------------------------------------------------------------------------------------------------
// What makes a look COMPLETE depends on the hero garment (slot templates), never on one global piece count.
//   dress / jumpsuit / ready-made set : footwear            (2 pieces are enough; bag / jewellery are optional and never required)
//   abaya / jalabiya                  : a hijab-scarf OR footwear
//   shirt / tee / hoodie / jacket / blazer… : a bottom + footwear
//   trousers / jeans / skirt…         : a top + footwear
//   suit / tuxedo / classic set       : a shirt + formal footwear
// A hero type with no template (shoes, bags, accessories…) keeps the legacy rule: at least 3 pieces.
const TOP_KEYS = new Set(['tshirt', 'polo', 'shirt', 'blouse', 'sweater', 'hoodie', 'tunic', 'top', 'sport_top']);
const BOTTOM_KEYS = new Set(['jeans', 'trousers', 'chinos', 'shorts', 'skirt', 'leggings', 'joggers', 'sport_bottom']);
const SHOE_KEYS = new Set(['shoes_any', 'sneakers', 'formal_shoes', 'loafers', 'heels_low', 'heels_high', 'flats', 'sandals', 'boots', 'slippers', 'sport_shoes']);
const FORMAL_SHOE_KEYS = new Set(['shoes_any', 'formal_shoes', 'loafers', 'heels_low', 'heels_high', 'flats']);
const COVER_KEYS = new Set(['hijab_set', 'tarha']);
const SHIRT_KEYS = new Set(['shirt', 'blouse']);
const SLOT = {
  top: { name: 'top', keys: TOP_KEYS },
  bottom: { name: 'bottom', keys: BOTTOM_KEYS },
  footwear: { name: 'footwear', keys: SHOE_KEYS },
  formalFootwear: { name: 'formal_footwear', keys: FORMAL_SHOE_KEYS },
  shirt: { name: 'shirt', keys: SHIRT_KEYS },
  coverOrFootwear: { name: 'hijab_or_footwear', keys: new Set([...COVER_KEYS, ...SHOE_KEYS]) },
};
const TEMPLATES = [ // order = hero priority when a look has several candidates
  { group: 'modest', heroes: new Set(['abaya', 'jalabiya']), slots: [SLOT.coverOrFootwear] },
  { group: 'dress_or_set', heroes: new Set(['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_bridal', 'dress_beach', 'jumpsuit', 'two_piece_set', 'tracksuit']), slots: [SLOT.footwear] },
  { group: 'suit', heroes: new Set(['suit', 'tuxedo', 'classic_set']), slots: [SLOT.shirt, SLOT.formalFootwear] },
  { group: 'womens_suit', heroes: new Set(['womens_suit']), slots: [SLOT.top, SLOT.formalFootwear] },
  { group: 'top_or_outer', heroes: new Set([...TOP_KEYS, 'jacket', 'blazer', 'coat', 'cardigan']), slots: [SLOT.bottom, SLOT.footwear] },
  { group: 'bottom', heroes: BOTTOM_KEYS, slots: [SLOT.top, SLOT.footwear] },
];
/** The template for a hero garment key, or null when the type has none. */
export function requiredLookSlots(heroKey) {
  const t = TEMPLATES.find((x) => x.heroes.has(heroKey));
  return t ? { group: t.group, slots: t.slots.map((s) => s.name), minPieces: t.slots.length + 1 } : null;
}
/** Smallest number of pieces (hero included) that can be a complete look for this hero. */
export const minimumPiecesForLook = (heroKey) => requiredLookSlots(heroKey)?.minPieces ?? 3;
/** The hero of a set of pieces: the preferred key when it has a template (the product page anchor), else the highest-priority garment present. */
export function heroKeyOf(pieces, preferred = null) {
  if (preferred && requiredLookSlots(preferred)) return preferred;
  const keys = (pieces || []).map((p) => p?.key).filter(Boolean);
  for (const t of TEMPLATES) { const k = keys.find((x) => t.heroes.has(x)); if (k) return k; }
  return null;
}
/** Names of the template slots no other piece fills (each slot needs its own piece; the hero never fills its own slot). */
export function missingSlots(pieces, heroKey) {
  const t = TEMPLATES.find((x) => x.heroes.has(heroKey));
  if (!t) return [];
  const rest = (pieces || []).filter(Boolean); const hi = rest.findIndex((p) => p.key === heroKey); if (hi >= 0) rest.splice(hi, 1);
  const free = rest.map((p) => p.key);
  const missing = [];
  for (const slot of t.slots) { const i = free.findIndex((k) => slot.keys.has(k)); if (i < 0) missing.push(slot.name); else free.splice(i, 1); }
  return missing;
}


const NEUTRALS = new Set(['black', 'white', 'off_white', 'cream', 'ivory', 'beige', 'grey', 'gray', 'charcoal', 'navy', 'khaki', 'brown', 'camel', 'tan', 'taupe', 'nude', 'denim', 'silver', 'stone', 'sand']);
const HUE = { red: 'red', burgundy: 'red', maroon: 'red', pink: 'pink', fuchsia: 'pink', coral: 'pink', blush: 'pink', orange: 'orange', rust: 'orange', yellow: 'yellow', mustard: 'yellow', gold: 'yellow', green: 'green', emerald: 'green', olive: 'green', mint: 'green', teal: 'green', blue: 'blue', sky_blue: 'blue', royal_blue: 'blue', purple: 'purple', lavender: 'purple', violet: 'purple' };
const CLASH = [['red', 'pink'], ['red', 'orange'], ['orange', 'pink'], ['red', 'green'], ['purple', 'orange'], ['purple', 'green'], ['yellow', 'pink']];
// pieces whose colour does not decide the outfit (the stylist never asks for their colour), and denim: a wash («Mid wash», «جينز متوسط») is a neutral, not a missing colour
const COLOR_FREE = new Set(['watch', 'jewelry', 'sunglasses', 'socks', 'cufflinks', 'perfume', 'cap', 'tie', 'bow_tie', 'pocket_square', 'underwear']);
const colorsOf = (p) => ((p.colorKeys || []).length ? p.colorKeys : p.key === 'jeans' ? ['denim'] : []);
const hueOf = (k) => (NEUTRALS.has(k) ? null : HUE[k] || k);

/** Is this piece buyable? variants: [{ color, size, stock }]. At least one colour+size variant must have stock. No variants at all = a simple product (the product-level stock decides). */
export function variantAvailability(row, variants = []) {
  if (row?.inStock === false) return { ok: false, reason: 'out_of_stock' };
  const vs = Array.isArray(variants) ? variants : [];
  if (!vs.length) return { ok: true };
  if (!vs.some((v) => Number(v.stock) > 0)) return { ok: false, reason: 'no_variant_in_stock' };
  // a shown colour with no stock is NOT a rejection: the add-to-basket sheet preselects the first colour that has stock. Only "no valid variant at all" rejects (above).
  return { ok: true };
}

const monthBand = (month) => ([12, 1, 2].includes(month) ? 'cold' : [6, 7, 8, 9].includes(month) ? 'hot' : 'mild');

/**
 * pieces: enriched product rows (the anchor first) — { id, key, formality, colorKeys, typeConflict, colorConflict, audienceConflict, sizeConflict, notFashion, photo_mismatch, inStock, ... }
 * ctx: { variantsOf(id) -> [{color,size,stock}], seasonOf(key) -> 'winter'|'summer'|null, familyOf(key) -> string|null, month (1-12) }
 * Returns { ok, score, reasons[] }; `reasons` lists every hard failure and penalty (for logs/tests).
 */
export function reviewLook(pieces, ctx = {}) {
  const reasons = []; let score = 100; let hard = false;
  const fail = (r) => { hard = true; reasons.push(r); };
  const pen = (r, n) => { score -= n; reasons.push(`${r}:-${n}`); };
  const list = (pieces || []).filter(Boolean);
  if (list.length < 2) return { ok: false, score: 0, reasons: ['too_few_pieces'] };
  // completeness is decided by the hero garment's template (requiredLookSlots), not by one global piece count; hero types with no template keep the legacy minimum of 3
  const heroKey = heroKeyOf(list, ctx.heroKey);
  const tpl = requiredLookSlots(heroKey);
  if (tpl) { for (const m of missingSlots(list, heroKey)) fail(`missing_slot:${m}`); }
  else if (list.length < 3) return { ok: false, score: 0, reasons: ['too_few_pieces'] };
  for (const p of list) {
    if (!p.key) fail(`no_type:${p.id}`);
    if (p.notFashion) fail(`not_fashion:${p.id}`);
    if (p.typeConflict) fail(`type_conflict:${p.id}`);
    if (p.colorConflict) fail(`color_conflict:${p.id}`);
    if (p.audienceConflict) fail(`audience_conflict:${p.id}`);
    if (p.sizeConflict) fail(`size_conflict:${p.id}`);
    const a = variantAvailability(p, ctx.variantsOf ? ctx.variantsOf(p.id) : []);
    if (!a.ok) fail(`${a.reason}:${p.id}`);
    // POLICY: photo_mismatch (image check, accuracy unmeasured) is already turned into `typeConflict` by enrichProduct(), and the engine drops such products
    // before any look is built. So in practice it is a HARD rejection (covered by the type_conflict rule above and by a test). The -25 below is only a defensive
    // fallback for rows that reach the reviewer un-enriched; it is not the live behaviour.
    if (Number(p.photo_mismatch) === 1) pen(`photo_mismatch:${p.id}`, 25);
    if (!colorsOf(p).length && !COLOR_FREE.has(p.key)) pen(`unknown_color:${p.id}`, 25); // missing decisive information
    if (p.formality == null) pen(`unknown_formality:${p.id}`, 25);
  }
  // one style: formality spread across the whole look
  const fs = list.map((p) => p.formality).filter((x) => x != null);
  if (fs.length) { const spread = Math.max(...fs) - Math.min(...fs); if (spread >= 3) fail(`formality_spread:${spread}`); else if (spread === 2) pen('formality_spread:2', 20); }
  // season: winter-only with summer-only is never an outfit; against the current weather it is a heavy penalty
  const seasons = list.map((p) => (ctx.seasonOf ? ctx.seasonOf(p.key) : null)).filter(Boolean);
  if (seasons.includes('winter') && seasons.includes('summer')) fail('season_clash');
  const band = monthBand(ctx.month);
  if (band === 'hot' && seasons.includes('winter')) pen('winter_piece_in_heat', 40);
  if (band === 'cold' && seasons.includes('summer')) pen('summer_piece_in_cold', 40);
  // no two pieces of one kind, no more than two accessories
  const keys = list.map((p) => p.key).filter(Boolean);
  if (new Set(keys).size !== keys.length) fail('duplicate_type');
  const acc = list.filter((p) => ctx.familyOf && ctx.familyOf(p.key) === 'accessories').length;
  if (acc > 2) pen(`too_many_accessories:${acc}`, 25);
  // colours: harmonious, not merely different
  const lead = list.map((p) => colorsOf(p)[0]).filter(Boolean);
  const hues = [...new Set(lead.map(hueOf).filter(Boolean))];
  if (hues.length >= 3) pen(`too_many_hues:${hues.length}`, 35);
  for (const [a1, b1] of CLASH) if (hues.includes(a1) && hues.includes(b1)) pen(`clash:${a1}+${b1}`, 25);
  return { ok: !hard && score >= MIN_SCORE, score: Math.max(0, score), reasons };
}
