/**
 * Human wording (Arabic + English) generated from a definition, so the owner preview, product page, store page, cart and
 * order always say exactly what the engine will calculate. Nothing here influences pricing.
 */
import { effectsOf } from './definition.js';

const PICK = {
  cheapest: ['أرخص قطعة', 'the cheapest item'], second_cheapest: ['ثاني أرخص قطعة', 'the second cheapest item'],
  most_expensive: ['أغلى قطعة', 'the most expensive item'], second_most_expensive: ['ثاني أغلى قطعة', 'the second most expensive item'],
};
const pieces = (n) => (n === 1 ? 'قطعة' : n === 2 ? 'قطعتين' : n <= 10 ? `${n} قطع` : `${n} قطعة`);
const pieceEn = (n) => `${n} item${n === 1 ? '' : 's'}`;

export function describeEffect(e) {
  switch (e.kind) {
    case 'percent_off': {
      const which = e.apply_to === 'all' ? ['على المنتجات المشمولة', 'on included products'] : [`على ${PICK[e.apply_to][0]}`, `on ${PICK[e.apply_to][1]}`];
      return { ar: `خصم ${e.percent}% ${which[0]}`, en: `${e.percent}% off ${which[1]}` };
    }
    case 'fixed_off': return { ar: `خصم ${e.amount} ج.م${e.per === 'unit' ? ' على كل قطعة' : ''}`, en: `${e.amount} EGP off${e.per === 'unit' ? ' each item' : ''}` };
    case 'buy_x_get_y': {
      const free = e.reward_mode === 'percent' && e.reward_value === 100;
      const rw = free ? ['مجانًا', 'free'] : e.reward_mode === 'percent' ? [`بخصم ${e.reward_value}%`, `at ${e.reward_value}% off`] : e.reward_mode === 'fixed_off' ? [`بخصم ${e.reward_value} ج.م`, `with ${e.reward_value} EGP off`] : [`بسعر ${e.reward_value} ج.م`, `for ${e.reward_value} EGP`];
      return { ar: `اشتري ${pieces(e.buy)} واحصل على ${pieces(e.get)} ${rw[0]} (${PICK[e.reward_pick][0]})`, en: `Buy ${pieceEn(e.buy)}, get ${pieceEn(e.get)} ${rw[1]} (${PICK[e.reward_pick][1]})` };
    }
    case 'group_price': return { ar: `اشتري ${pieces(e.qty)} بسعر ${e.price} ج.م`, en: `Buy ${pieceEn(e.qty)} for ${e.price} EGP` };
    case 'tiers': {
      const t = [...e.tiers].sort((a, b) => a.qty - b.qty);
      if (e.mode === 'percent') return { ar: t.map((x) => `${pieces(x.qty)}: خصم ${x.value}%`).join(' · '), en: t.map((x) => `${x.qty}+: ${x.value}% off`).join(' · ') };
      if (e.mode === 'fixed_off') return { ar: t.map((x) => `${pieces(x.qty)}: خصم ${x.value} ج.م`).join(' · '), en: t.map((x) => `${x.qty}+: ${x.value} EGP off`).join(' · ') };
      return { ar: t.map((x) => `${pieces(x.qty)} = ${x.value} ج.م`).join(' · '), en: t.map((x) => `${x.qty} = ${x.value} EGP`).join(' · ') };
    }
    case 'bundle': return { ar: `باقة (${e.slots.reduce((s, x) => s + x.qty, 0)} قطع) بسعر ${e.price} ج.م`, en: `Bundle (${e.slots.reduce((s, x) => s + x.qty, 0)} items) for ${e.price} EGP` };
    case 'gift': return { ar: `هدية مجانية${e.gifts.length > 1 ? ' (اختار واحدة)' : ''}`, en: `Free gift${e.gifts.length > 1 ? ' (choose one)' : ''}` };
    default: return { ar: '', en: '' };
  }
}

export function describeConditions(g) {
  if (!g?.items?.length) return { ar: '', en: '' };
  const parts = g.items.map((it) => {
    if (it.items) { const d = describeConditions(it); return { ar: `(${d.ar})`, en: `(${d.en})` }; }
    if (it.kind === 'min_qty') return { ar: `عند شراء ${pieces(it.value)} أو أكثر`, en: `when buying ${pieceEn(it.value)} or more` };
    if (it.kind === 'min_subtotal') return { ar: `عند الوصول إلى ${it.value} ج.م`, en: `when reaching ${it.value} EGP` };
    return { ar: `عند شراء ${pieces(it.min_qty)} من منتجات محددة`, en: `when buying ${pieceEn(it.min_qty)} of selected products` };
  });
  const sepAr = g.logic === 'or' ? ' أو ' : ' و'; const sepEn = g.logic === 'or' ? ' or ' : ' and ';
  return { ar: parts.map((p) => p.ar).join(sepAr), en: parts.map((p) => p.en).join(sepEn) };
}

/** Customer-facing summary: { headline, conditions, details[] } in both languages. */
export function describePromotion(def) {
  const effs = effectsOf(def).map(describeEffect);
  const cond = describeConditions(def.when);
  return {
    headline: { ar: effs.map((x) => x.ar).join(' + '), en: effs.map((x) => x.en).join(' + ') },
    conditions: cond,
    ...(def.max_discount ? { cap: { ar: `الحد الأقصى للخصم ${def.max_discount} ج.م`, en: `Maximum discount ${def.max_discount} EGP` } } : {}),
  };
}

/** Progress message for the cart ("add one more and get the third free"). */
export function hintText(h, def) {
  const eff = effectsOf(def)[0];
  if (h.kind === 'add_amount') return { ar: `أنت على بعد ${h.amount} جنيه من الحصول على الخصم.`, en: `You are ${h.amount} EGP away from the offer.` };
  const more = h.qty === 1 ? ['قطعة أخرى', 'one more item'] : [`${pieces(h.qty)} إضافية`, `${h.qty} more items`];
  if (eff?.kind === 'buy_x_get_y') {
    const free = eff.reward_mode === 'percent' && eff.reward_value === 100;
    return { ar: `أضف ${more[0]} ${free ? 'واحصل على الهدية مجانًا' : 'واحصل على الخصم'}.`, en: `Add ${more[1]} ${free ? 'to get your free item' : 'to unlock the discount'}.` };
  }
  if (eff?.kind === 'group_price') return { ar: `أضف ${more[0]} واشتري ${pieces(eff.qty)} مقابل ${eff.price} جنيه.`, en: `Add ${more[1]}: ${eff.qty} items for ${eff.price} EGP.` };
  if (eff?.kind === 'tiers') return { ar: `أضف ${more[0]} لتحصل على خصم أكبر.`, en: `Add ${more[1]} for a bigger discount.` };
  return { ar: `أضف ${more[0]} للاستفادة من العرض.`, en: `Add ${more[1]} to get the offer.` };
}
