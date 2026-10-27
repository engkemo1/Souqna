/**
 * شجرة تصنيف المنتج (على طريقة Amazon): الفئة (لمين؟) ← المجموعة ← نوع القطعة.
 * مصدرها الوحيد قاموس تويلا (taxonomy.json)، فنفس النوع اللي صاحب المحل بيختاره هو اللي تويلا والبحث بيفهموه.
 * من النوع + الفئة بنستنتج تلقائيًا: القسم (للتوافق مع أقسام المنصة)، المقاسات المناسبة، ودرجة الرسمية المقترحة.
 */
import { loadKnowledge } from './moda/knowledge.js';

export const AUDIENCES = [
  { key: 'men', ar: 'رجالي', en: 'Men' },
  { key: 'women', ar: 'حريمي', en: 'Women' },
  { key: 'boys', ar: 'ولادي', en: 'Boys' },
  { key: 'girls', ar: 'بناتي', en: 'Girls' },
  { key: 'kids', ar: 'أطفال (ولاد وبنات)', en: 'Kids' },
  { key: 'unisex', ar: 'للجنسين', en: 'Unisex' },
];
export const AUDIENCE_KEYS = new Set(AUDIENCES.map((a) => a.key));

const WOMEN_ONLY = new Set(['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_bridal', 'dress_beach', 'jumpsuit', 'two_piece_set', 'skirt', 'blouse', 'tunic', 'top', 'womens_suit', 'abaya', 'hijab_set', 'tarha', 'long_cardigan', 'shawl', 'heels_low', 'heels_high', 'flats', 'handbag', 'clutch', 'jewelry']);
const MEN_ONLY = new Set(['suit', 'classic_set', 'tuxedo', 'waistcoat', 'tie', 'bow_tie', 'pocket_square']);
const GIRLS_OK = new Set(['dress_any', 'dress_casual', 'dress_party', 'dress_evening', 'dress_beach', 'jumpsuit', 'two_piece_set', 'skirt', 'blouse', 'tunic', 'top', 'hijab_set', 'tarha', 'flats', 'handbag', 'backpack', 'jewelry', 'cardigan', 'leggings']);
const NOT_FOR_KIDS = new Set(['womens_suit', 'abaya', 'long_cardigan', 'heels_high', 'heels_low', 'clutch', 'watch', 'perfume', 'belt', 'dress_bridal', 'dress_work', 'dress_evening', 'formal_shoes', 'tie', 'bow_tie', 'pocket_square', 'waistcoat', 'classic_set']);

/** النوع ده مناسب للفئة دي؟ */
export function typeFitsAudience(key, audience) {
  if (!audience || audience === 'unisex') return true;
  if (audience === 'men') return !WOMEN_ONLY.has(key);
  if (audience === 'women') return !MEN_ONLY.has(key);
  if (audience === 'boys') return !WOMEN_ONLY.has(key) && !NOT_FOR_KIDS.has(key);
  if (audience === 'girls') return !NOT_FOR_KIDS.has(key) && (!MEN_ONLY.has(key));
  return !NOT_FOR_KIDS.has(key) && !MEN_ONLY.has(key) && (!WOMEN_ONLY.has(key) || GIRLS_OK.has(key)); // kids
}

/** أنظمة المقاسات. */
export const SIZE_KINDS = {
  letters: { ar: 'مقاسات حروف', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  waist_men: { ar: 'مقاس الوسط (رجالي)', sizes: ['28', '30', '32', '34', '36', '38', '40', '42', '44'] },
  waist_women: { ar: 'مقاس الوسط (حريمي)', sizes: ['34', '36', '38', '40', '42', '44', '46', '48'] },
  suit: { ar: 'مقاس البدلة', sizes: ['46', '48', '50', '52', '54', '56', '58'] },
  shoes_men: { ar: 'مقاس الحذاء', sizes: ['39', '40', '41', '42', '43', '44', '45', '46'] },
  shoes_women: { ar: 'مقاس الحذاء', sizes: ['35', '36', '37', '38', '39', '40', '41', '42'] },
  shoes_kids: { ar: 'مقاس حذاء الأطفال', sizes: ['22', '24', '26', '28', '30', '32', '34', '35'] },
  kids: { ar: 'مقاس الأطفال (بالسن)', sizes: ['0-3M', '3-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y'] },
  length: { ar: 'الطول', sizes: ['50', '52', '54', '56', '58', '60'] },
  belt: { ar: 'مقاس الحزام', sizes: ['85', '90', '95', '100', '105', '110', '115'] },
  free: { ar: 'مقاس واحد', sizes: ['Free size'] },
  none: { ar: 'من غير مقاس', sizes: [] },
};

const FAMILY_SIZE = { tops: 'letters', bottoms: 'letters', dresses: 'letters', suiting: 'letters', outerwear: 'letters', modest: 'free', shoes: 'shoes', bags: 'none', accessories: 'free', sport: 'letters', underwear_sleep: 'letters' };
const TYPE_SIZE = {
  jeans: { men: 'waist_men', boys: 'kids', girls: 'kids', kids: 'kids', women: 'waist_women', unisex: 'waist_men' },
  trousers: { men: 'waist_men', boys: 'kids', girls: 'kids', kids: 'kids', women: 'waist_women', unisex: 'waist_men' },
  chinos: { men: 'waist_men', boys: 'kids', girls: 'kids', kids: 'kids', women: 'waist_women', unisex: 'waist_men' },
  suit: { men: 'suit', unisex: 'suit', boys: 'kids', kids: 'kids' }, classic_set: { men: 'suit', unisex: 'suit', boys: 'kids', kids: 'kids' }, tuxedo: { men: 'suit', unisex: 'suit', boys: 'kids', kids: 'kids' },
  abaya: 'length', jalabiya: { men: 'length', boys: 'kids', girls: 'kids', kids: 'kids', women: 'length', unisex: 'length' },
  belt: 'belt', perfume: 'none', watch: 'none', jewelry: 'none', tie: 'none', bow_tie: 'none', pocket_square: 'none', cap: 'free', socks: 'free',
  hijab_set: 'free', tarha: 'free', shawl: 'free',
};

/** نظام المقاس لنوع + فئة. */
export function sizeKindFor(key, audience, K = loadKnowledge()) {
  const kid = ['boys', 'girls', 'kids'].includes(audience);
  const t = TYPE_SIZE[key];
  let kind = typeof t === 'string' ? t : t?.[audience || 'unisex'];
  if (!kind) {
    const family = K.items.get(key)?.family;
    kind = FAMILY_SIZE[family] || 'letters';
    if (kind === 'shoes') kind = kid ? 'shoes_kids' : audience === 'women' || audience === 'girls' ? 'shoes_women' : 'shoes_men';
    else if (kid && !['free', 'none'].includes(kind)) kind = 'kids';
  }
  return kind;
}

/** درجة رسمية مقترحة (1-5) من نطاق النوع. */
export const suggestedStyle = (key, K = loadKnowledge()) => { const f = K.items.get(key)?.formality; return f ? Math.round((f[0] + f[1]) / 2) : null; };

/** القسم (بتاع أقسام المنصة) المستنتج: أولًا الأخص حسب النوع، وبعدين الفئة. بيرجع بس قسم من أقسام المحل. */
export function deriveDepartment(key, audience, storeDepartments = [], K = loadKnowledge()) {
  const mine = new Set(storeDepartments);
  const family = K.items.get(key)?.family;
  const grp = { men: ['men'], women: ['women'], boys: ['kids'], girls: ['kids'], kids: ['kids'], unisex: ['men', 'women'] }[audience] || ['women', 'men'];
  const per = (suffix) => grp.map((g) => `${g}_${suffix}`);
  const byType = {
    dress_bridal: ['women_wedding_dresses', 'women_dresses'], dress_evening: ['women_soiree_dresses', 'women_dresses'], dress_party: ['women_soiree_dresses', 'women_dresses'], dress_casual: ['women_casual_dresses', 'women_dresses'],
    tuxedo: ['men_wedding_suits', 'men_suits'], suit: ['men_formal_suits', 'men_suits'], classic_set: ['men_formal_suits', 'men_suits'], waistcoat: ['men_suits'],
    jeans: per('pants'), trousers: per('pants'), chinos: per('pants'), skirt: ['women_skirts'],
    abaya: ['women_abaya'], jalabiya: ['men_jalabiya'], hijab_set: ['women_hijab'], tarha: ['women_hijab'], sleepwear: per('underwear'),
  }[key] || [];
  const shoesLeaf = { men: ['shoes_men'], women: ['shoes_women'], boys: ['shoes_kids'], girls: ['shoes_kids'], kids: ['shoes_kids'] }[audience] || ['shoes_men', 'shoes_women'];
  const byFamily = { shoes: [...shoesLeaf, 'shoes'], bags: per('bags'), accessories: per('accessories'), sport: per('sports'), underwear_sleep: per('underwear'), tops: per('tops'), dresses: ['women_dresses'], bottoms: per('pants') }[family] || [];
  const kidsLeaf = { boys: ['kids_boys'], girls: ['kids_girls'] }[audience] || [];
  for (const d of [...byType, ...byFamily, ...kidsLeaf, ...grp]) if (mine.has(d)) return d;
  return null;
}

/** الفئة اللي المنتج بيتبع لها بالمصطلح اللي تويلا فاهمه (men|women|boys|girls|kids|unisex). */
export const audienceOrNull = (a) => (AUDIENCE_KEYS.has(a) ? a : null);

/** الشجرة اللي المحرر بيعرضها. */
export function productTypeTree(K = loadKnowledge()) {
  const families = Object.entries(K.taxonomy.families).map(([key, f]) => ({
    key, ar: f.ar,
    types: f.items.filter((i) => !i.virtual).map((i) => ({ key: i.key, ar: i.ar, audiences: AUDIENCES.filter((a) => typeFitsAudience(i.key, a.key)).map((a) => a.key), style: suggestedStyle(i.key, K), sizeKind: Object.fromEntries(AUDIENCES.map((a) => [a.key, sizeKindFor(i.key, a.key, K)])) })),
  })).filter((f) => f.types.length);
  return { audiences: AUDIENCES, families, sizeKinds: SIZE_KINDS };
}
