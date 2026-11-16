// «طقم كامل يكمّل القطعة دي» (اقتراح اختياري في صفحة المنتج).
// القاعدة: الطلب الأساسي أولًا، والاقتراح يظهر بس لو الطقم كامل ومتناسق بقواعد تويلا (الرسمية + الألوان + الميزانية)؛
// أي حاجة أقل من كده (قطعة ناقصة، بدائل بعيدة، طلب سؤال للعميل) = نسكت ومنقترحش حاجة.

const AUD_WORD = { men: 'رجالي', women: 'حريمي', boys: 'ولادي', girls: 'بناتي' };

/** نص الطلب اللي بيتبعت لمحرك تويلا: «معايا <القطعة> <الفئة> نسقلي عليه باقي الطقم». null لو الفئة مش واضحة (مش بنخمّن). */
export function smartLookText(anchor) {
  const name = String(anchor?.name_ar || anchor?.name_en || '').trim().slice(0, 80);
  const aud = AUD_WORD[anchor?.gender];
  if (!name || !aud) return null;
  return `معايا ${name} ${aud} نسقلي عليه باقي الطقم`;
}

/** بوابة الجودة. بترجع { ok:true, ids } أو { ok:false, reason }. */
const TAILORED = new Set(['blazer', 'suit', 'tuxedo', 'womens_suit', 'classic_set', 'waistcoat']);
const CASUAL_TOPS = new Set(['hoodie', 'tshirt', 'sport_top']);

export function acceptSmartLook(result, { anchorId = null, anchorKey = null, keyOf = null, budget = null, minPieces = 2 } = {}) {
  if (!result?.blocks) return { ok: false, reason: 'no_look' };
  if (result.state !== 'full') return { ok: false, reason: `state_${result.state || 'none'}` }; // partial / alternatives / clarify = مش بيرفكت
  if ((result.missing || []).length > 0) return { ok: false, reason: 'missing_pieces' };
  const items = (result.blocks.tabs || []).flatMap((t) => t.items || []);
  const ids = [...new Set(items.map((i) => i.id))];
  if (ids.length < minPieces || ids.length !== items.length) return { ok: false, reason: 'too_few_or_duplicate' };
  if (anchorId != null && ids.includes(anchorId)) return { ok: false, reason: 'contains_anchor' };
  // طبقات: هودي/تيشيرت/توب رياضي مبيتلبسش تحت بليزر/بدلة/جيليه
  if (anchorKey && CASUAL_TOPS.has(anchorKey) && typeof keyOf === 'function' && ids.some((id) => TAILORED.has(keyOf(id)))) return { ok: false, reason: 'layering' };
  if (items.some((i) => i.repaired)) return { ok: false, reason: 'repaired' };
  if (result.blocks.over > 0) return { ok: false, reason: 'over_budget' };
  const total = Number(result.blocks.total);
  if (budget && Number.isFinite(total) && total > budget) return { ok: false, reason: 'over_budget' };
  return { ok: true, ids };
}
