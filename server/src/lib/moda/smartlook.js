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
  if (anchor?.frenchCuff) return `معايا ${name} ${aud} نسقلي عليه بدلة وكرافتة وحذاء لحضور فرح كضيف ميزانيتي 5000`;
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
  // طبقات: هودي/تيشيرت/توب رياضي مبيتلبسش تحت بليزر/بدلة/جيليه
  if (anchorKey && CASUAL_TOPS.has(anchorKey) && typeof keyOf === 'function' && ids.some((id) => TAILORED.has(keyOf(id)))) return { ok: false, reason: 'layering' };
  // قطعة رسمية (قميص مانشت مزدوجة): لازم الطقم يبقى فيه بدلة، ومفيش جينز/هودي/سنيكرز/رياضي
  if (anchorFormal) {
    const keys = items.map((i) => i.key);
    if (!keys.some((k) => FORMAL_SUIT.has(k))) return { ok: false, reason: 'formal_needs_suit' };
    if (keys.some((k) => FORMAL_BAD.has(k))) return { ok: false, reason: 'formal_casual_piece' };
  }
  if (items.some((i) => i.repaired)) return { ok: false, reason: 'repaired' };
  if (result.blocks.over > 0) return { ok: false, reason: 'over_budget' };
  const total = Number(result.blocks.total);
  if (budget && Number.isFinite(total) && total > budget) return { ok: false, reason: 'over_budget' };
  return { ok: true, ids };
}
