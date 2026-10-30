/**
 * Offer (promotion) helpers shared by the dashboard and the storefront.
 * The image template is only a visual layer: everything drawn on top comes from the offer's real definition.
 */
export const emptySel = () => ({ all: false, products: [], categories: [] });
export const selCount = (s) => (s ? s.products.length + s.categories.length : 0);
export const selEmpty = (s) => !s || (!s.all && !s.products.length && !s.categories.length);

export const PALETTE = {
  buy_x_get_y: ['#ff5a5f', '#ffb199'], group_price: ['#6c5ce7', '#a29bfe'], buy_more_save_more: ['#00b894', '#55efc4'], percentage: ['#e17055', '#fab1a0'],
  fixed_amount: ['#0984e3', '#74b9ff'], bundle: ['#fd79a8', '#fdcb6e'], gift: ['#d63031', '#ff7675'], tiered_pricing: ['#2d3436', '#636e72'],
  category_reward: ['#00cec9', '#81ecec'], custom: ['#341f97', '#5f27cd'],
};

/** Offer types the owner can start from. `effect` is the starting configuration; every field stays editable. */
export const TYPE_LIST = [
  { key: 'buy_x_get_y', icon: 'Gift', ar: 'اشتري X واحصل على Y', en: 'Buy X Get Y', dAr: 'اكتب أي كمية: اشتري 2 واحصل على 1، اشتري 10 واحصل على 5...', dEn: 'Any quantities: buy 2 get 1, buy 10 get 5...' },
  { key: 'group_price', icon: 'Tag', ar: 'اشتري X بسعر ثابت', en: 'Buy X for a Fixed Price', dAr: '3 قطع بـ 500 جنيه...', dEn: '3 items for 500 EGP...' },
  { key: 'buy_more_save_more', icon: 'TrendingUp', ar: 'اشتري أكتر ووفّر أكتر', en: 'Buy More Save More', dAr: 'خصم يزيد مع الكمية', dEn: 'Discount grows with quantity' },
  { key: 'percentage', icon: 'Percent', ar: 'خصم بنسبة مئوية', en: 'Percentage Discount', dAr: '20% على منتجات أو قسم', dEn: '20% off products or a category' },
  { key: 'fixed_amount', icon: 'Banknote', ar: 'خصم بمبلغ ثابت', en: 'Fixed Amount Discount', dAr: '100 جنيه خصم، أو 50 عند 500', dEn: '100 EGP off, or 50 off at 500' },
  { key: 'bundle', icon: 'Package', ar: 'باقة خاصة', en: 'Special Bundle', dAr: 'تيشيرت + بنطلون + جاكيت بسعر واحد', dEn: 'T-shirt + pants + jacket for one price' },
  { key: 'gift', icon: 'PartyPopper', ar: 'هدية مجانية', en: 'Free Gift', dAr: 'هدية مع الشراء', dEn: 'A gift with purchase' },
  { key: 'tiered_pricing', icon: 'Layers', ar: 'أسعار حسب الكمية', en: 'Tiered Pricing', dAr: '1 = 200، 2 = 350، 3 = 450', dEn: '1 = 200, 2 = 350, 3 = 450' },
  { key: 'category_reward', icon: 'FolderGift', ar: 'اشتري من قسم واحصل على مكافأة', en: 'Category Reward', dAr: 'مكافأة عند الشراء من قسم', dEn: 'A reward for buying from a category' },
  { key: 'custom', icon: 'Wand2', ar: 'عرض مخصص', en: 'Custom Promotion', dAr: 'ابني عرضك بشروط ومكافآت حرة', dEn: 'Build your own conditions and rewards' },
];

const sel = emptySel;
export const DEFAULT_EFFECT = {
  buy_x_get_y: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_pick: 'cheapest', reward_mode: 'percent', reward_value: 100 },
  group_price: { kind: 'group_price', qty: 3, price: 500, pick: 'most_expensive' },
  buy_more_save_more: { kind: 'tiers', mode: 'percent', tiers: [{ qty: 2, value: 10 }, { qty: 3, value: 20 }, { qty: 5, value: 30 }] },
  percentage: { kind: 'percent_off', percent: 20, apply_to: 'all' },
  fixed_amount: { kind: 'fixed_off', amount: 100, per: 'cart' },
  bundle: { kind: 'bundle', price: 700, slots: [{ sel: sel(), qty: 1 }, { sel: sel(), qty: 1 }] },
  gift: { kind: 'gift', gifts: [], choose: 1, qty: 1, repeat: false },
  tiered_pricing: { kind: 'tiers', mode: 'total_price', tiers: [{ qty: 1, value: 200 }, { qty: 2, value: 350 }, { qty: 3, value: 450 }] },
  category_reward: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_pick: 'cheapest', reward_mode: 'percent', reward_value: 100 },
  custom: { kind: 'percent_off', percent: 10, apply_to: 'cheapest', group_size: 3 },
};

export function blankOffer(type = 'buy_x_get_y') {
  const when = type === 'gift' ? { logic: 'and', items: [{ kind: 'min_qty', value: 3, scope: 'qualifying' }] } : null;
  return {
    name_ar: '', name_en: '', description_ar: '', description_en: '', type, status: 'draft', priority: 0, stacking: 'per_product', stack_with_coupons: true,
    image_media_id: null, template_key: type, image_mode: 'auto', image_category: null, starts_at: '', ends_at: '', daily_from: '', daily_to: '', days_mask: 127,
    usage_limit: null, per_customer_limit: null, audience: 'all', audience_phones: [],
    def: { v: 1, qualify: sel(), reward: null, exclude: sel(), when, effect: structuredClone(DEFAULT_EFFECT[type] || DEFAULT_EFFECT.custom), max_applications: null, max_discount: null },
  };
}

/** Turn a saved offer (API shape) back into the editable form shape. */
export function offerToForm(o) {
  return {
    name_ar: o.name?.ar || '', name_en: o.name?.en || '', description_ar: o.description?.ar || '', description_en: o.description?.en || '', type: o.type, status: o.status,
    priority: o.priority, stacking: o.stacking, stack_with_coupons: o.stackWithCoupons, image_media_id: o.imageMediaId, template_key: o.templateKey || o.type, image_mode: o.imageMode || 'auto', image_category: o.imageCategory || null,
    starts_at: o.startsAt || '', ends_at: o.endsAt || '', daily_from: o.dailyFrom || '', daily_to: o.dailyTo || '', days_mask: o.daysMask,
    usage_limit: o.usageLimit, per_customer_limit: o.perCustomerLimit, audience: o.audience, audience_phones: o.audiencePhones || [], def: structuredClone(o.def),
  };
}

/** Body to send: empty strings become null. */
export function formToBody(f) {
  const n = (v) => (v === '' || v === undefined ? null : v);
  return { ...f, name_en: n(f.name_en), description_ar: n(f.description_ar), description_en: n(f.description_en), starts_at: n(f.starts_at), ends_at: n(f.ends_at), daily_from: n(f.daily_from), daily_to: n(f.daily_to) };
}

const effects = (def) => (def.effect.kind === 'multi' ? def.effect.effects : [def.effect]);
/** Big-number badge drawn over the template image: { kicker, big, sub } from the real definition. */
export function offerBadge(def, lang = 'ar') {
  const ar = lang === 'ar'; const e = def ? effects(def)[0] : null;
  if (!e) return { kicker: '', big: '', sub: '' };
  const cur = ar ? 'ج.م' : 'EGP';
  switch (e.kind) {
    case 'buy_x_get_y': {
      const free = e.reward_mode === 'percent' && e.reward_value === 100;
      const big = free ? (ar ? `${e.get} مجانًا` : `${e.get} FREE`) : e.reward_mode === 'percent' ? `${e.reward_value}% ${ar ? 'خصم' : 'OFF'}` : e.reward_mode === 'fixed_off' ? `-${e.reward_value} ${cur}` : `${e.reward_value} ${cur}`;
      return { kicker: ar ? `اشتري ${e.buy}` : `BUY ${e.buy}`, big, sub: ar ? `واحصل على ${e.get}` : `GET ${e.get}` };
    }
    case 'group_price': return { kicker: ar ? `اشتري ${e.qty}` : `BUY ${e.qty}`, big: `${e.price} ${cur}`, sub: ar ? 'بسعر خاص' : 'SPECIAL PRICE' };
    case 'tiers': {
      const t = [...e.tiers].sort((a, b) => a.qty - b.qty);
      if (e.mode === 'percent') return { kicker: ar ? 'اشتري أكتر' : 'BUY MORE', big: `${ar ? 'حتى' : 'UP TO'} ${t.at(-1).value}%`, sub: ar ? 'وفّر أكتر' : 'SAVE MORE' };
      if (e.mode === 'fixed_off') return { kicker: ar ? 'اشتري أكتر' : 'BUY MORE', big: `-${t.at(-1).value} ${cur}`, sub: ar ? 'وفّر أكتر' : 'SAVE MORE' };
      return { kicker: ar ? `${t.at(-1).qty} قطع` : `${t.at(-1).qty} ITEMS`, big: `${t.at(-1).value} ${cur}`, sub: ar ? 'أسعار حسب الكمية' : 'QUANTITY PRICING' };
    }
    case 'percent_off': return { kicker: ar ? 'خصم' : 'SAVE', big: `${e.percent}%`, sub: ar ? 'على المنتجات المختارة' : 'ON SELECTED ITEMS' };
    case 'fixed_off': return { kicker: ar ? 'خصم' : 'SAVE', big: `${e.amount} ${cur}`, sub: ar ? 'على مشترياتك' : 'ON YOUR ORDER' };
    case 'bundle': return { kicker: ar ? 'باقة' : 'BUNDLE', big: `${e.price} ${cur}`, sub: ar ? `${e.slots.reduce((s, x) => s + x.qty, 0)} قطع` : `${e.slots.reduce((s, x) => s + x.qty, 0)} ITEMS` };
    case 'gift': return { kicker: ar ? 'هدية' : 'FREE GIFT', big: ar ? 'مجانًا' : 'FREE', sub: ar ? 'مع مشترياتك' : 'WITH YOUR ORDER' };
    default: return { kicker: '', big: '', sub: '' };
  }
}

export const STATE_TONE = { active: 'success', scheduled: 'info', expired: 'danger', draft: 'neutral', paused: 'warning' };
export const STATE_LABEL = {
  active: ['نشط', 'Active'], scheduled: ['مجدول', 'Scheduled'], expired: ['منتهي', 'Expired'], draft: ['مسودة', 'Draft'], paused: ['متوقف', 'Paused'],
};

/** datetime-local value <-> stored Cairo wall-clock 'YYYY-MM-DDTHH:MM' (identical text format, no timezone shifting). */
export const toLocalInput = (s) => (s ? s.slice(0, 16) : '');
export const fromLocalInput = (s) => (s ? s.slice(0, 16) : '');
