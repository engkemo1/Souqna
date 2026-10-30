/**
 * Promotion definition: the JSON "rules" document stored with every promotion, plus validation.
 *
 * A promotion is always: WHO/WHAT counts (qualify / reward / exclude product groups) + WHEN (conditions combined with
 * AND/OR) + THEN (one effect, or several). Every offer template (Buy X Get Y, bundle, tiers, ...) is just a preset that
 * produces this document, so new offer ideas need no new code paths - only a different combination of the same pieces.
 */
import { z } from 'zod';

export const TYPES = ['buy_x_get_y', 'group_price', 'buy_more_save_more', 'percentage', 'fixed_amount', 'bundle', 'gift', 'tiered_pricing', 'category_reward', 'custom'];
export const EFFECTS = ['percent_off', 'fixed_off', 'buy_x_get_y', 'group_price', 'tiers', 'bundle', 'gift', 'multi'];
/** Which effects each template may use (custom may use anything). */
export const TYPE_EFFECTS = {
  buy_x_get_y: ['buy_x_get_y'],
  group_price: ['group_price'],
  buy_more_save_more: ['tiers'],
  percentage: ['percent_off'],
  fixed_amount: ['fixed_off'],
  bundle: ['bundle', 'group_price'],
  gift: ['gift'],
  tiered_pricing: ['tiers'],
  category_reward: ['buy_x_get_y', 'gift', 'percent_off', 'fixed_off'],
  custom: EFFECTS,
};

const int = (min, max) => z.coerce.number().int().min(min).max(max);
const ids = z.array(z.coerce.number().int().positive()).max(5000).default([]);

export const selectorSchema = z.object({
  all: z.boolean().default(false),
  products: ids,
  categories: ids,
}).default({});

const condBase = { scope: z.enum(['qualifying', 'cart']).default('qualifying') };
const condSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('min_qty'), value: int(1, 1000), ...condBase }),
  z.object({ kind: z.literal('min_subtotal'), value: int(1, 10_000_000), ...condBase }),
  z.object({ kind: z.literal('has_products'), selector: selectorSchema, min_qty: int(1, 1000).default(1) }),
]);
const groupSchema = z.lazy(() => z.object({
  logic: z.enum(['and', 'or']).default('and'),
  items: z.array(z.union([condSchema, groupSchema])).max(12).default([]),
}));

export const PICKS = ['cheapest', 'second_cheapest', 'most_expensive', 'second_most_expensive'];

const effectSchemas = {
  percent_off: z.object({ kind: z.literal('percent_off'), percent: int(1, 100), apply_to: z.enum(['all', ...PICKS]).default('all'), group_size: int(1, 100).nullable().optional() }),
  fixed_off: z.object({ kind: z.literal('fixed_off'), amount: int(1, 10_000_000), per: z.enum(['unit', 'cart']).default('cart') }),
  buy_x_get_y: z.object({
    kind: z.literal('buy_x_get_y'), buy: int(1, 1000), get: int(1, 1000),
    reward_pick: z.enum(PICKS).default('cheapest'),
    reward_mode: z.enum(['percent', 'fixed_off', 'final_price']).default('percent'),
    reward_value: int(0, 10_000_000).default(100),
  }),
  group_price: z.object({ kind: z.literal('group_price'), qty: int(2, 50), price: int(0, 10_000_000), pick: z.enum(['most_expensive', 'cheapest']).default('most_expensive') }),
  tiers: z.object({
    kind: z.literal('tiers'), mode: z.enum(['percent', 'fixed_off', 'total_price']),
    tiers: z.array(z.object({ qty: int(1, 1000), value: int(0, 10_000_000) })).min(1).max(12),
  }),
  bundle: z.object({
    kind: z.literal('bundle'), price: int(0, 10_000_000),
    slots: z.array(z.object({ sel: selectorSchema, qty: int(1, 20), label: z.string().trim().max(60).optional() })).min(2).max(8),
  }),
  gift: z.object({ kind: z.literal('gift'), gifts: z.array(z.coerce.number().int().positive()).min(1).max(20), choose: z.literal(1).default(1), qty: int(1, 5).default(1), repeat: z.boolean().default(false), every: int(1, 1000).nullable().optional() }),
};
const simpleEffect = z.discriminatedUnion('kind', [effectSchemas.percent_off, effectSchemas.fixed_off, effectSchemas.buy_x_get_y, effectSchemas.group_price, effectSchemas.tiers, effectSchemas.bundle, effectSchemas.gift]);
export const effectSchema = z.union([simpleEffect, z.object({ kind: z.literal('multi'), effects: z.array(simpleEffect).min(1).max(4) })]);

export const definitionSchema = z.object({
  v: z.literal(1).default(1),
  qualify: selectorSchema,
  reward: selectorSchema.nullable().default(null),
  exclude: selectorSchema,
  when: groupSchema.nullable().default(null),
  effect: effectSchema,
  max_applications: int(1, 1000).nullable().default(null),
  max_discount: int(1, 10_000_000).nullable().default(null),
});

const isEmptySel = (s) => !s || (!s.all && !s.products.length && !s.categories.length);
export const selectorKey = (s) => JSON.stringify([!!s?.all, [...(s?.products || [])].sort((a, b) => a - b), [...(s?.categories || [])].sort((a, b) => a - b)]);

/** Walk every selector in a definition: [role, selector] pairs. */
export function selectorsOf(def) {
  const out = [['qualify', def.qualify]];
  if (def.reward) out.push(['reward', def.reward]);
  out.push(['exclude', def.exclude]);
  const walk = (g) => { for (const it of g?.items || []) { if (it.kind === 'has_products') out.push(['qualify', it.selector]); else if (it.items) walk(it); } };
  walk(def.when);
  const eff = def.effect.kind === 'multi' ? def.effect.effects : [def.effect];
  for (const e of eff) if (e.kind === 'bundle') for (const sl of e.slots) out.push(['qualify', sl.sel]);
  return out;
}
export const giftIdsOf = (def) => (def.effect.kind === 'multi' ? def.effect.effects : [def.effect]).filter((e) => e.kind === 'gift').flatMap((e) => e.gifts);
export const effectsOf = (def) => (def.effect.kind === 'multi' ? def.effect.effects : [def.effect]);

const issue = (code, ar, en, path) => ({ code, ar, en, path });

/**
 * Semantic validation that zod cannot express. Returns a list of {code, ar, en, path}; an empty list means the rule is safe
 * to calculate. We refuse ambiguous or self-contradicting rules rather than silently computing a wrong price.
 */
export function validateDefinition(type, def, { startsAt, endsAt } = {}) {
  const out = [];
  const effects = effectsOf(def);
  const allowed = TYPE_EFFECTS[type] || EFFECTS;
  for (const e of effects) if (!allowed.includes(e.kind)) out.push(issue('effect_not_allowed', 'هذا الإجراء لا يناسب نوع العرض المختار.', 'This action does not fit the chosen offer type.', 'effect'));
  if (def.effect.kind === 'multi' && effects.filter((e) => e.kind === 'gift').length > 1) out.push(issue('multi_gift', 'مينفعش تضيف أكتر من هدية واحدة في نفس العرض.', 'An offer can include only one gift action.', 'effect'));

  const needsQualify = effects.some((e) => ['percent_off', 'fixed_off', 'buy_x_get_y', 'group_price', 'tiers'].includes(e.kind)) || (!effects.some((e) => e.kind === 'bundle'));
  if (needsQualify && isEmptySel(def.qualify)) out.push(issue('no_products', 'اختار المنتجات أو الأقسام اللي بتنطبق عليها شروط العرض.', 'Choose the products or categories this offer applies to.', 'qualify'));
  if (def.reward && isEmptySel(def.reward)) out.push(issue('empty_reward', 'اختار منتجات المكافأة أو شيل مجموعة المكافأة.', 'Choose the reward products or remove the reward group.', 'reward'));

  effects.forEach((e, i) => {
    const p = `effect${def.effect.kind === 'multi' ? `.effects.${i}` : ''}`;
    if (e.kind === 'buy_x_get_y') {
      if (e.reward_mode === 'percent' && (e.reward_value < 1 || e.reward_value > 100)) out.push(issue('bad_percent', 'نسبة خصم المكافأة لازم تكون بين 1 و 100.', 'The reward discount must be between 1 and 100%.', `${p}.reward_value`));
      if (e.reward_mode === 'fixed_off' && e.reward_value < 1) out.push(issue('bad_amount', 'اكتب مبلغ الخصم على المكافأة.', 'Enter the reward discount amount.', `${p}.reward_value`));
      if (!def.reward && (e.reward_pick === 'second_most_expensive' || e.reward_pick === 'second_cheapest') && e.buy + e.get < 2) out.push(issue('bad_pick', 'اختيار «ثاني أغلى قطعة» يحتاج مجموعة من قطعتين على الأقل.', 'Second most expensive needs a group of at least two items.', `${p}.reward_pick`));
    }
    if (e.kind === 'tiers') {
      const qs = e.tiers.map((t) => t.qty);
      if (new Set(qs).size !== qs.length) out.push(issue('dup_tier', 'في شريحتين بنفس الكمية. كل كمية لازم تتكتب مرة واحدة.', 'Two tiers share the same quantity.', `${p}.tiers`));
      if (e.mode === 'percent') {
        if (e.tiers.some((t) => t.value < 1 || t.value > 100)) out.push(issue('bad_percent', 'نسبة الخصم في كل شريحة لازم تكون بين 1 و 100.', 'Each tier discount must be between 1 and 100%.', `${p}.tiers`));
        const sorted = [...e.tiers].sort((a, b) => a.qty - b.qty);
        if (sorted.some((t, k) => k && t.value < sorted[k - 1].value)) out.push(issue('tier_order', 'الخصم لازم يزيد مع زيادة الكمية (اشتري أكتر، وفّر أكتر).', 'The discount must grow with the quantity.', `${p}.tiers`));
      }
      if (e.mode === 'total_price') {
        const sorted = [...e.tiers].sort((a, b) => a.qty - b.qty);
        if (sorted.some((t, k) => k && t.value < sorted[k - 1].value)) out.push(issue('tier_price_order', 'سعر الكمية الأكبر لا يمكن أن يكون أقل من سعر الكمية الأصغر.', 'A larger quantity cannot cost less than a smaller one.', `${p}.tiers`));
      }
    }
    if (e.kind === 'bundle') {
      const total = e.slots.reduce((s, x) => s + x.qty, 0);
      if (total < 2) out.push(issue('bundle_small', 'الباقة لازم تحتوي قطعتين على الأقل.', 'A bundle needs at least two items.', `${p}.slots`));
      e.slots.forEach((sl, k) => { if (isEmptySel(sl.sel)) out.push(issue('slot_empty', `اختار منتجات للخانة رقم ${k + 1} في الباقة.`, `Choose products for bundle slot ${k + 1}.`, `${p}.slots.${k}`)); });
    }
    if (e.kind === 'percent_off' && e.apply_to === 'second_most_expensive' && !e.group_size) out.push(issue('bad_pick', 'اختيار «ثاني أغلى قطعة» يحتاج تحديد حجم المجموعة.', 'Second most expensive needs a group size.', `${p}.apply_to`));
    if (e.kind === 'gift') {
      if (!e.gifts.length) out.push(issue('no_gift', 'اختار منتج الهدية.', 'Choose the gift product.', `${p}.gifts`));
      const hasCond = def.when?.items?.length;
      if (!hasCond) out.push(issue('gift_needs_condition', 'الهدية لازم يكون ليها شرط (كمية أو مبلغ أو منتج)، وإلا هتتوزع على كل الطلبات.', 'A gift needs a condition (quantity, amount or product), otherwise every order gets it.', 'when'));
    }
    if (e.kind === 'group_price' && e.price === 0) out.push(issue('zero_price', 'سعر المجموعة صفر. لو تقصد هدية مجانية استخدم عرض «هدية مجانية».', 'The group price is zero. Use a gift offer for free items.', `${p}.price`));
  });

  // conditions
  const checkGroup = (g, depth) => {
    if (depth > 2) { out.push(issue('too_deep', 'الشروط متداخلة أكتر من اللازم. بسّطها.', 'Conditions are nested too deeply.', 'when')); return; }
    for (const it of g.items) {
      if (it.items) checkGroup(it, depth + 1);
      else if (it.kind === 'has_products' && isEmptySel(it.selector)) out.push(issue('cond_empty', 'شرط «اشترى منتجات معينة» محتاج تختار المنتجات.', 'A product condition needs products selected.', 'when'));
    }
  };
  if (def.when) checkGroup(def.when, 1);

  if (!def.effect.kind) out.push(issue('no_effect', 'اختار المكافأة أو الخصم.', 'Choose the reward or discount.', 'effect'));
  if (startsAt && endsAt && endsAt <= startsAt) out.push(issue('dates', 'تاريخ النهاية لازم يكون بعد تاريخ البداية.', 'The end must be after the start.', 'ends_at'));
  return out;
}
