/**
 * Category architecture for the marketplace.
 *
 *  - NEW_DEPARTMENTS: additional sections of the department tree (main section > section > type). Seeded once, additively
 *    (existing slugs, images and stores are never removed). The platform admin adds more from the dashboard with no code.
 *  - PROFILES: the "shopping experience" of a main section (layout, product card, navigation, filters). A department stores
 *    an optional `profile`; when empty it inherits from its parent. New departments therefore look right immediately.
 *  - PROFILE_ATTRS: default product-type filters per profile (material, fit, fabric, shade, ...). A department may override
 *    them with its own `attrs_json` (edited from the admin dashboard); products store the chosen values in `attrs_json`.
 */
const F = ['Free size'];
const CL = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const SH = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
const KD = ['0-3M', '3-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y'];
const LEN = ['50', '52', '54', '56', '58', '60'];
const S_JEANS = ['28', '30', '32', '34', '36', '38', '40', '42'];
const S_SUIT = ['46', '48', '50', '52', '54', '56', '58'];

export const PROFILE_IDS = ['women', 'men', 'modest', 'hijab', 'kids', 'sport', 'shoes', 'accessories', 'perfume', 'beauty'];

/**
 * The unified department tree (main section > section > nested section). Each node either:
 *   - exists today (`old: true`): its slug / ID / products are KEPT; only parent, sort, profile and (when it still has the original
 *     default name) display name change, or
 *   - is new (`old: false`): inserted if missing.
 * `note` marks nodes whose old meaning is wider than the new one (a merged bucket such as "tops & T-shirts"): the old node stays
 * as the general bucket and the specific sections are nested UNDER it, so no product is moved or left uncategorised.
 * Products are never moved by the migration; moving them is a separate, confirmed step (merchant or admin).
 */
export const NODE = (slug, parent, ar, en, sizes, extra = {}) => ({ slug, parent, ar, en, sizes, ...extra });
const D = (slug, parent, ar, en, sizes, extra) => NODE(slug, parent, ar, en, sizes, extra);
export const CATALOG_TREE = [
  // ============ women (kept) ============
  D('women', null, 'حريمي', 'Women', CL, { old: true, profile: 'women', icon: 'shirt' }),
  D('women_dresses', 'women', 'فساتين', 'Dresses', CL, { old: true }),
  D('women_casual_dresses', 'women_dresses', 'فساتين كاجوال', 'Casual dresses', CL, { old: true }),
  D('women_soiree_dresses', 'women_dresses', 'فساتين سهرة', 'Evening dresses', CL, { old: true }),
  D('women_wedding_dresses', 'women_dresses', 'فساتين أفراح', 'Wedding dresses', CL, { old: true }),
  D('women_summer_dresses', 'women_dresses', 'فساتين صيفي', 'Summer dresses', CL),
  D('women_winter_dresses', 'women_dresses', 'فساتين شتوي', 'Winter dresses', CL),
  D('women_long_dresses', 'women_dresses', 'فساتين طويلة', 'Long dresses', CL),
  D('women_short_dresses', 'women_dresses', 'فساتين قصيرة', 'Short dresses', CL),
  D('women_tops', 'women', 'بلوزات وتيشيرتات', 'Blouses & tops', CL, { old: true, note: 'merged' }),
  D('women_blouses', 'women_tops', 'بلوزات', 'Blouses', CL),
  D('women_shirts', 'women_tops', 'قمصان', 'Shirts', CL),
  D('women_tshirts', 'women_tops', 'تيشيرتات', 'T-shirts', CL),
  D('women_toplets', 'women_tops', 'توبات', 'Tops', CL),
  D('women_pants', 'women', 'بناطيل وجينز', 'Pants & jeans', S_JEANS, { old: true, note: 'merged' }),
  D('women_trousers', 'women_pants', 'بناطيل', 'Pants', S_JEANS),
  D('women_jeans', 'women_pants', 'جينز', 'Jeans', S_JEANS),
  D('women_skirts', 'women', 'جيبات', 'Skirts', CL, { old: true }),
  D('women_jackets', 'women', 'جاكيتات', 'Jackets', CL),
  D('women_coats', 'women', 'بالطوهات', 'Coats', CL),
  D('women_sets', 'women', 'أطقم حريمي', "Women's sets", CL),
  D('women_underwear', 'women', 'ملابس نوم وداخلية', 'Sleepwear & underwear', CL, { old: true, note: 'merged' }),
  D('women_sleepwear', 'women_underwear', 'ملابس نوم', 'Sleepwear', CL),
  D('women_lingerie', 'women_underwear', 'لانجيري', 'Lingerie', CL),
  D('women_homewear', 'women', 'ملابس بيت', 'Homewear', CL),
  D('women_occasion', 'women', 'ملابس مناسبات', 'Occasion wear', CL),
  // ============ modest fashion (new section; abayas moved in) ============
  D('modest', null, 'ملابس محجبات', 'Modest fashion', LEN, { profile: 'modest', icon: 'sparkles' }),
  D('women_abaya', 'modest', 'عبايات', 'Abayas', LEN, { old: true, moved: true }),
  D('modest_open_abayas', 'women_abaya', 'عبايات مفتوحة', 'Open abayas', LEN),
  D('modest_closed_abayas', 'women_abaya', 'عبايات مقفولة', 'Closed abayas', LEN),
  D('modest_embroidered_abayas', 'women_abaya', 'عبايات مطرزة', 'Embroidered abayas', LEN),
  D('modest_casual_abayas', 'women_abaya', 'عبايات كاجوال', 'Casual abayas', LEN),
  D('modest_occasion_abayas', 'women_abaya', 'عبايات مناسبات', 'Occasion abayas', LEN),
  D('modest_jalabiyas', 'modest', 'جلاليب', 'Jalabiyas', LEN),
  D('modest_egyptian_jalabiyas', 'modest_jalabiyas', 'جلاليب مصرية', 'Egyptian jalabiyas', LEN),
  D('modest_home_jalabiyas', 'modest_jalabiyas', 'جلاليب بيت', 'Home jalabiyas', LEN),
  D('modest_occasion_jalabiyas', 'modest_jalabiyas', 'جلاليب مناسبات', 'Occasion jalabiyas', LEN),
  D('modest_kaftans', 'modest', 'قفاطين', 'Kaftans', LEN),
  D('modest_dresses', 'modest', 'فساتين محتشمة', 'Modest dresses', CL),
  D('modest_sets', 'modest', 'أطقم محجبات', 'Modest sets', CL),
  D('modest_prayer', 'modest', 'ملابس صلاة', 'Prayer clothing', F),
  D('modest_ramadan', 'modest', 'ملابس رمضان', 'Ramadan collections', CL),
  D('modest_eid', 'modest', 'ملابس العيد', 'Eid collections', CL),
  // ============ hijabs & scarves (the old "hijab" node becomes the section itself) ============
  D('women_hijab', null, 'طرح وإيشاربات', 'Hijabs & scarves', F, { old: true, moved: true, profile: 'hijab', icon: 'flower' }),
  D('hijabs_chiffon', 'women_hijab', 'طرح شيفون', 'Chiffon hijabs', F),
  D('hijabs_cotton', 'women_hijab', 'طرح قطن', 'Cotton hijabs', F),
  D('hijabs_modal', 'women_hijab', 'طرح مودال', 'Modal hijabs', F),
  D('hijabs_turkish', 'women_hijab', 'طرح تركي', 'Turkish hijabs', F),
  D('hijabs_jersey', 'women_hijab', 'طرح جيرسي', 'Jersey hijabs', F),
  D('hijabs_under', 'women_hijab', 'باندانات وبطانة طرح', 'Underscarves', F),
  D('hijabs_shawls', 'women_hijab', 'شالات', 'Shawls', F),
  D('hijabs_accessories', 'women_hijab', 'إكسسوارات طرح', 'Hijab accessories', F),
  // ============ men (kept) ============
  D('men', null, 'رجالي', 'Men', CL, { old: true, profile: 'men', icon: 'shirt' }),
  D('men_tops', 'men', 'تيشيرتات وقمصان', 'T-shirts & shirts', CL, { old: true, note: 'merged' }),
  D('men_tshirts', 'men_tops', 'تيشيرتات', 'T-shirts', CL),
  D('men_shirts', 'men_tops', 'قمصان', 'Shirts', CL),
  D('men_polo', 'men_tops', 'بولو', 'Polo shirts', CL),
  D('men_pants', 'men', 'بناطيل وجينز', 'Pants & jeans', S_JEANS, { old: true, note: 'merged' }),
  D('men_trousers', 'men_pants', 'بناطيل', 'Pants', S_JEANS),
  D('men_jeans', 'men_pants', 'جينز', 'Jeans', S_JEANS),
  D('men_shorts', 'men', 'شورتات', 'Shorts', CL),
  D('men_suits', 'men', 'بدل', 'Suits', S_SUIT, { old: true }),
  D('men_formal_suits', 'men_suits', 'بدل رسمي', 'Formal suits & formal wear', S_SUIT, { old: true }),
  D('men_wedding_suits', 'men_suits', 'بدل أفراح', 'Wedding suits', S_SUIT, { old: true }),
  D('men_casual', 'men', 'ملابس كاجوال', 'Casual wear', CL),
  D('men_jackets', 'men', 'جاكيتات', 'Jackets', CL),
  D('men_coats', 'men', 'معاطف', 'Coats', CL),
  D('men_sets', 'men', 'أطقم رجالي', "Men's sets", CL),
  D('men_homewear', 'men', 'ملابس بيت', 'Homewear', CL),
  D('men_underwear', 'men', 'ملابس داخلية', 'Underwear', CL, { old: true }),
  D('men_jalabiya', 'men', 'جلاليب رجالي', "Men's jalabiyas", LEN, { old: true }),
  // ============ kids & baby (kept) ============
  D('kids', null, 'أطفال ورضع', 'Kids & baby', KD, { old: true, profile: 'kids', icon: 'baby' }),
  D('kids_boys', 'kids', 'ملابس أولادي', "Boys' clothing", KD, { old: true }),
  D('kids_girls', 'kids', 'ملابس بناتي', "Girls' clothing", KD, { old: true }),
  D('kids_baby', 'kids', 'ملابس رضع', 'Baby clothing', KD, { old: true }),
  D('kids_newborn', 'kids', 'حديثي الولادة', 'Newborn', KD),
  D('kids_sets', 'kids', 'أطقم أطفال', "Kids' sets", KD),
  D('kids_dresses', 'kids', 'فساتين أطفال', "Kids' dresses", KD),
  D('kids_baby_acc', 'kids', 'مستلزمات وإكسسوارات أطفال', 'Baby accessories', F),
  // ============ shoes (kept) ============
  D('shoes', null, 'أحذية', 'Shoes & footwear', SH, { old: true, profile: 'shoes', icon: 'footprints' }),
  D('shoes_women', 'shoes', 'أحذية حريمي', "Women's shoes", SH, { old: true }),
  D('shoes_men', 'shoes', 'أحذية رجالي', "Men's shoes", SH, { old: true }),
  D('shoes_kids', 'shoes', 'أحذية أطفال', "Kids' shoes", SH, { old: true }),
  D('shoes_sneakers', 'shoes', 'كوتشيات', 'Sneakers', SH),
  D('shoes_sports', 'shoes', 'أحذية رياضية', 'Sports shoes', SH),
  D('shoes_sandals', 'shoes', 'صنادل', 'Sandals', SH),
  D('shoes_boots', 'shoes', 'بوت', 'Boots', SH),
  D('shoes_heels', 'shoes', 'كعب عالي', 'Heels', SH),
  D('shoes_flats', 'shoes', 'فلات', 'Flats', SH),
  D('shoes_slippers', 'shoes', 'شباشب', 'Slippers', SH),
  D('shoes_formal', 'shoes', 'أحذية رسمية', 'Formal shoes', SH),
  // ============ accessories (new section; bags and the old accessories nodes moved in) ============
  D('accessories', null, 'إكسسوارات', 'Accessories', F, { profile: 'accessories', icon: 'watch' }),
  D('women_bags', 'accessories', 'شنط حريمي', "Women's bags", F, { old: true, moved: true }),
  D('men_bags', 'accessories', 'شنط رجالي', "Men's bags", F, { old: true, moved: true }),
  D('acc_backpacks', 'accessories', 'حقائب ظهر', 'Backpacks', F),
  D('acc_wallets', 'accessories', 'محافظ', 'Wallets', F),
  D('acc_watches', 'accessories', 'ساعات', 'Watches', F),
  D('acc_sunglasses', 'accessories', 'نظارات شمس', 'Sunglasses', F),
  D('acc_jewelry', 'accessories', 'مجوهرات', 'Jewelry', F),
  D('acc_necklaces', 'acc_jewelry', 'سلاسل', 'Necklaces', F),
  D('acc_bracelets', 'acc_jewelry', 'أساور', 'Bracelets', F),
  D('acc_earrings', 'acc_jewelry', 'حلق', 'Earrings', F),
  D('acc_rings', 'acc_jewelry', 'خواتم', 'Rings', F),
  D('acc_belts', 'accessories', 'أحزمة', 'Belts', F),
  D('acc_hair', 'accessories', 'إكسسوارات شعر', 'Hair accessories', F),
  D('women_accessories', 'accessories', 'إكسسوارات موضة حريمي', "Women's fashion accessories", F, { old: true, moved: true }),
  D('men_accessories', 'accessories', 'إكسسوارات موضة رجالي', "Men's fashion accessories", F, { old: true, moved: true }),
  // ============ makeup & beauty (new section; "care" moved in) ============
  D('beauty', null, 'مكياج وتجميل', 'Makeup & beauty', F, { profile: 'beauty', icon: 'brush' }),
  D('beauty_foundation', 'beauty', 'فاونديشن', 'Foundation', F),
  D('beauty_concealer', 'beauty', 'كونسيلر', 'Concealer', F),
  D('beauty_powder', 'beauty', 'بودرة', 'Powder', F),
  D('beauty_blush', 'beauty', 'بلاشر', 'Blush', F),
  D('beauty_highlighter', 'beauty', 'هايلايتر', 'Highlighter', F),
  D('beauty_lipstick', 'beauty', 'روج', 'Lipstick', F),
  D('beauty_lipgloss', 'beauty', 'ملمع شفاه', 'Lip gloss', F),
  D('beauty_mascara', 'beauty', 'ماسكارا', 'Mascara', F),
  D('beauty_eyeliner', 'beauty', 'آيلاينر', 'Eyeliner', F),
  D('beauty_eyeshadow', 'beauty', 'آيشادو', 'Eyeshadow', F),
  D('beauty_brows', 'beauty', 'منتجات حواجب', 'Eyebrow products', F),
  D('beauty_brushes', 'beauty', 'فرش مكياج', 'Makeup brushes', F),
  D('beauty_tools', 'beauty', 'أدوات مكياج', 'Makeup tools', F),
  D('care', 'beauty', 'عناية بالبشرة', 'Skincare', F, { old: true, moved: true }),
  D('beauty_body_care', 'beauty', 'عناية بالجسم', 'Body care', F),
  // ============ perfumes & fragrances (new section) ============
  D('perfumes', null, 'عطور', 'Perfumes & fragrances', F, { profile: 'perfume', icon: 'spray-can' }),
  D('perfume_women', 'perfumes', 'عطور حريمي', "Women's perfumes", F),
  D('perfume_men', 'perfumes', 'عطور رجالي', "Men's perfumes", F),
  D('perfume_unisex', 'perfumes', 'عطور للجنسين', 'Unisex perfumes', F),
  D('perfume_sprays', 'perfumes', 'بودي سبراي', 'Body sprays', F),
  D('perfume_mists', 'perfumes', 'بودي ميست', 'Body mists', F),
  D('perfume_sets', 'perfumes', 'أطقم عطور', 'Fragrance sets', F),
  // ============ sportswear & activewear (new section; old sports nodes moved in) ============
  D('sportswear', null, 'ملابس رياضية', 'Sportswear & activewear', CL, { profile: 'sport', icon: 'dumbbell' }),
  D('men_sports', 'sportswear', 'ملابس رياضية رجالي', "Men's sportswear", CL, { old: true, moved: true }),
  D('women_sports', 'sportswear', 'ملابس رياضية حريمي', "Women's sportswear", CL, { old: true, moved: true }),
  D('sport_gym', 'sportswear', 'ملابس جيم', 'Gym clothing', CL),
  D('sport_sets', 'sportswear', 'أطقم تدريب', 'Training sets', CL),
  D('sport_running', 'sportswear', 'ملابس جري', 'Running clothing', CL),
  D('sport_leggings', 'sportswear', 'ليجنز', 'Leggings', CL),
  D('sport_bras', 'sportswear', 'سبورت برا', 'Sports bras', CL),
  D('sport_tracksuits', 'sportswear', 'ترينج', 'Tracksuits', CL),
  D('sport_accessories', 'sportswear', 'إكسسوارات رياضية', 'Sports accessories', F),
  // ============ legacy bucket: "perfume & makeup" held both, so it cannot be mapped to one new node without guessing ============
  D('perfume_makeup', null, 'عطور ومكياج (قديم)', 'Perfume & makeup (legacy)', F, { old: true, legacy: true, profile: 'beauty', icon: 'spray-can' }),
];

/** Names the old default tree used. A rename is applied only to a node that still has its original default name (admin edits win). */
export const OLD_DEFAULT_NAMES = {
  women_tops: ['بلوزات وتيشيرتات', 'Tops & T-shirts'], women_pants: ['بناطيل وجينز', 'Pants & Jeans'], women_underwear: ['ملابس داخلية ونوم', 'Underwear & Sleepwear'],
  women_abaya: ['عبايات', 'Abayas'], women_hijab: ['طرح وحجاب', 'Hijab'], men_tops: ['تيشيرتات وقمصان', 'T-shirts & Shirts'], men_pants: ['بناطيل وجينز', 'Pants & Jeans'],
  men_jalabiya: ['جلاليب', 'Jalabiyas'], men_sports: ['رياضي', 'Sportswear'], women_sports: ['رياضي', 'Sportswear'], women_bags: ['شنط', 'Bags'], men_bags: ['شنط', 'Bags'],
  women_accessories: ['إكسسوارات', 'Accessories'], men_accessories: ['إكسسوارات', 'Accessories'], kids: ['أطفال', 'Kids'], kids_girls: ['بناتي', 'Girls'], kids_boys: ['ولادي', 'Boys'],
  kids_baby: ['رضع', 'Baby'], care: ['عنايات', 'Care'], perfume_makeup: ['عطور ومكياج', 'Perfume & Makeup'], men_suits: ['بدل', 'Suits'], men_formal_suits: ['بدل رسمي', 'Formal suits'],
  men_underwear: ['ملابس داخلية', 'Underwear'], shoes_women: ['أحذية حريمي', "Women's shoes"], shoes_men: ['أحذية رجالي', "Men's shoes"], shoes_kids: ['أحذية أطفال', "Kids' shoes"],
  women_dresses: ['فساتين', 'Dresses'], women_skirts: ['جيبات', 'Skirts'], men: ['رجالي', 'Men'], women: ['حريمي', 'Women'], shoes: ['أحذية', 'Shoes'],
};
export const NEW_DEPARTMENTS = CATALOG_TREE; // kept for callers of the earlier name

/** Profile of the existing top-level sections (a new top-level gets its own in NEW_DEPARTMENTS, or none = inherited / 'women'). */
export const ROOT_PROFILES = { women: 'women', men: 'men', kids: 'kids', shoes: 'shoes', perfume_makeup: 'beauty', women_hijab: 'hijab', modest: 'modest', accessories: 'accessories', beauty: 'beauty', perfumes: 'perfume', sportswear: 'sport' };

/** How each profile presents itself. Pure data: the storefront reads this, nothing here is a style an owner can inject. */
export const PROFILES = {
  women: { ar: 'أزياء حريمي', en: "Women's fashion", card: 'editorial', ratio: '3/4', grid: 'airy', nav: ['occasion', 'type'], hero: 'editorial', showSwatches: true, showSizes: false },
  men: { ar: 'أزياء رجالي', en: "Men's fashion", card: 'editorial', ratio: '4/5', grid: 'cozy', nav: ['type', 'style'], hero: 'split', showSwatches: true, showSizes: false },
  modest: { ar: 'أزياء محتشمة', en: 'Modest fashion', card: 'editorial', ratio: '3/4', grid: 'airy', nav: ['type', 'season'], hero: 'editorial', showSwatches: true, showSizes: false },
  hijab: { ar: 'حجاب وإيشاربات', en: 'Hijabs & scarves', card: 'swatch', ratio: '1/1', grid: 'dense', nav: ['fabric', 'color'], hero: 'color', showSwatches: true, showSizes: false },
  kids: { ar: 'أطفال وبيبي', en: 'Kids & baby', card: 'friendly', ratio: '1/1', grid: 'cozy', nav: ['age', 'type'], hero: 'playful', showSwatches: false, showSizes: true },
  sport: { ar: 'ملابس رياضية', en: 'Sportswear', card: 'performance', ratio: '4/5', grid: 'dense', nav: ['sport', 'type'], hero: 'bold', showSwatches: true, showSizes: true },
  shoes: { ar: 'أحذية', en: 'Shoes & footwear', card: 'product', ratio: '1/1', grid: 'cozy', nav: ['type', 'brand'], hero: 'bold', showSwatches: true, showSizes: true },
  accessories: { ar: 'إكسسوارات', en: 'Accessories', card: 'product', ratio: '1/1', grid: 'cozy', nav: ['type', 'collection'], hero: 'curated', showSwatches: true, showSizes: false },
  perfume: { ar: 'عطور', en: 'Perfumes', card: 'luxe', ratio: '4/5', grid: 'airy', nav: ['family', 'occasion'], hero: 'luxe', showSwatches: false, showSizes: false },
  beauty: { ar: 'مكياج وعناية', en: 'Makeup & beauty', card: 'shade', ratio: '1/1', grid: 'cozy', nav: ['type', 'brand'], hero: 'beauty', showSwatches: true, showSizes: false },
};
export const DEFAULT_PROFILE = 'women';

const o = (...pairs) => pairs.map(([v, ar, en, hex]) => ({ v, ar, en: en || ar, ...(hex ? { hex } : {}) }));
const MATERIAL_CL = o(['cotton', 'قطن', 'Cotton'], ['linen', 'كتان', 'Linen'], ['polyester', 'بوليستر', 'Polyester'], ['wool', 'صوف', 'Wool'], ['denim', 'دنيم', 'Denim'], ['satin', 'ساتان', 'Satin'], ['viscose', 'فسكوز', 'Viscose'], ['leather', 'جلد', 'Leather']);
const FIT = o(['slim', 'سليم', 'Slim'], ['regular', 'عادي', 'Regular'], ['relaxed', 'واسع', 'Relaxed'], ['oversized', 'أوفر سايز', 'Oversized']);
const brandDef = { key: 'brand', ar: 'الماركة', en: 'Brand', type: 'text' };

/**
 * Default product-type filters per profile. type: 'select' (one value) | 'multi' (several) | 'text' (free, facet by value).
 * Size and colour are NOT here: they already come from the product's variants.
 */
export const PROFILE_ATTRS = {
  women: [
    { key: 'material', ar: 'الخامة', en: 'Material', type: 'select', options: MATERIAL_CL },
    { key: 'fit', ar: 'القصّة', en: 'Fit', type: 'select', options: FIT },
    { key: 'occasion', ar: 'المناسبة', en: 'Occasion', type: 'select', options: o(['daily', 'يومي', 'Everyday'], ['work', 'شغل', 'Work'], ['evening', 'سهرة', 'Evening'], ['wedding', 'فرح', 'Wedding'], ['summer', 'صيفي', 'Summer']) },
  ],
  men: [
    { key: 'material', ar: 'الخامة', en: 'Material', type: 'select', options: MATERIAL_CL },
    { key: 'fit', ar: 'القصّة', en: 'Fit', type: 'select', options: FIT },
    { key: 'style', ar: 'الستايل', en: 'Style', type: 'select', options: o(['casual', 'كاجوال', 'Casual'], ['formal', 'رسمي', 'Formal'], ['street', 'ستريت', 'Streetwear'], ['sport', 'رياضي', 'Sport']) },
  ],
  modest: [
    { key: 'style', ar: 'الستايل', en: 'Style', type: 'select', options: o(['open', 'مفتوحة', 'Open'], ['closed', 'مقفولة', 'Closed'], ['butterfly', 'فراشة', 'Butterfly'], ['embroidered', 'مطرزة', 'Embroidered'], ['plain', 'سادة', 'Plain']) },
    { key: 'length', ar: 'الطول', en: 'Length', type: 'select', options: o(['short', 'قصير', 'Short'], ['midi', 'ميدي', 'Midi'], ['long', 'طويل', 'Long'], ['extra_long', 'طويل جدًا', 'Extra long']) },
    { key: 'fabric', ar: 'القماش', en: 'Fabric', type: 'select', options: o(['crepe', 'كريب', 'Crepe'], ['linen', 'كتان', 'Linen'], ['chiffon', 'شيفون', 'Chiffon'], ['satin', 'ساتان', 'Satin'], ['cotton', 'قطن', 'Cotton'], ['velvet', 'قطيفة', 'Velvet']) },
  ],
  hijab: [
    { key: 'fabric', ar: 'القماش', en: 'Fabric', type: 'select', options: o(['chiffon', 'شيفون', 'Chiffon'], ['cotton', 'قطن', 'Cotton'], ['modal', 'مودال', 'Modal'], ['jersey', 'جيرسيه', 'Jersey'], ['silk', 'حرير', 'Silk'], ['crepe', 'كريب', 'Crepe']) },
    { key: 'style', ar: 'النوع', en: 'Type', type: 'select', options: o(['scarf', 'إيشارب', 'Scarf'], ['instant', 'جاهز', 'Instant'], ['shawl', 'شال', 'Shawl'], ['under', 'أندر سكارف', 'Underscarf']) },
  ],
  kids: [
    { key: 'age', ar: 'الفئة العمرية', en: 'Age group', type: 'select', options: o(['newborn', 'حديث الولادة', 'Newborn'], ['baby', '٠–٢ سنة', 'Baby 0–2'], ['toddler', '٢–٤ سنوات', 'Toddler 2–4'], ['kid', '٥–٩ سنوات', 'Kids 5–9'], ['teen', '١٠–١٤ سنة', 'Pre-teen 10–14']) },
    { key: 'material', ar: 'الخامة', en: 'Material', type: 'select', options: MATERIAL_CL },
    { key: 'season', ar: 'الموسم', en: 'Season', type: 'select', options: o(['summer', 'صيفي', 'Summer'], ['winter', 'شتوي', 'Winter'], ['all', 'كل المواسم', 'All seasons']) },
  ],
  sport: [
    { key: 'sport', ar: 'الرياضة', en: 'Sport', type: 'select', options: o(['gym', 'جيم', 'Gym'], ['running', 'جري', 'Running'], ['training', 'تدريب', 'Training'], ['football', 'كرة قدم', 'Football'], ['yoga', 'يوجا', 'Yoga'], ['lifestyle', 'لايف ستايل', 'Lifestyle']) },
    { key: 'material', ar: 'الخامة', en: 'Material', type: 'select', options: o(['dryfit', 'دراي فيت', 'Dri-fit'], ['cotton', 'قطن', 'Cotton'], ['polyester', 'بوليستر', 'Polyester'], ['elastane', 'إيلاستين', 'Elastane']) },
    { key: 'fit', ar: 'القصّة', en: 'Fit', type: 'select', options: FIT },
    brandDef,
  ],
  shoes: [
    { key: 'style', ar: 'النوع', en: 'Style', type: 'select', options: o(['sneakers', 'سنيكرز', 'Sneakers'], ['sport', 'رياضي', 'Sport'], ['classic', 'كلاسيك', 'Classic'], ['sandals', 'صندل', 'Sandals'], ['boots', 'بوت', 'Boots'], ['slippers', 'شبشب', 'Slippers'], ['heels', 'كعب', 'Heels']) },
    { key: 'material', ar: 'الخامة', en: 'Material', type: 'select', options: o(['leather', 'جلد طبيعي', 'Leather'], ['synthetic', 'صناعي', 'Synthetic'], ['suede', 'شمواه', 'Suede'], ['canvas', 'قماش', 'Canvas'], ['mesh', 'شبك', 'Mesh'], ['rubber', 'مطاط', 'Rubber']) },
    { key: 'occasion', ar: 'المناسبة', en: 'Occasion', type: 'select', options: o(['daily', 'يومي', 'Everyday'], ['sport', 'رياضة', 'Sport'], ['formal', 'رسمي', 'Formal'], ['summer', 'صيفي', 'Summer']) },
    brandDef,
  ],
  accessories: [
    { key: 'type', ar: 'النوع', en: 'Type', type: 'select', options: o(['bag', 'شنطة', 'Bag'], ['watch', 'ساعة', 'Watch'], ['sunglasses', 'نظارة', 'Sunglasses'], ['jewelry', 'إكسسوار', 'Jewelry'], ['belt', 'حزام', 'Belt'], ['wallet', 'محفظة', 'Wallet'], ['hair', 'شعر', 'Hair']) },
    { key: 'material', ar: 'الخامة', en: 'Material', type: 'select', options: o(['leather', 'جلد', 'Leather'], ['metal', 'معدن', 'Metal'], ['steel', 'ستانلس', 'Stainless steel'], ['fabric', 'قماش', 'Fabric'], ['plastic', 'بلاستيك', 'Plastic'], ['gold_plated', 'مطلي ذهب', 'Gold plated']) },
    { key: 'size', ar: 'الحجم', en: 'Size', type: 'select', options: o(['small', 'صغير', 'Small'], ['medium', 'وسط', 'Medium'], ['large', 'كبير', 'Large']) },
  ],
  perfume: [
    { key: 'family', ar: 'العائلة العطرية', en: 'Fragrance family', type: 'select', options: o(['floral', 'زهري', 'Floral'], ['woody', 'خشبي', 'Woody'], ['oriental', 'شرقي', 'Oriental'], ['fresh', 'منعش', 'Fresh'], ['citrus', 'حمضي', 'Citrus'], ['sweet', 'حلو', 'Sweet'], ['musk', 'مسك', 'Musk']) },
    { key: 'occasion', ar: 'المناسبة', en: 'Occasion', type: 'select', options: o(['daily', 'يومي', 'Everyday'], ['evening', 'سهرة', 'Evening'], ['office', 'شغل', 'Office'], ['gift', 'هدية', 'Gift']) },
    { key: 'concentration', ar: 'التركيز', en: 'Concentration', type: 'select', options: o(['edp', 'أو دو بارفان', 'Eau de parfum'], ['edt', 'أو دو تواليت', 'Eau de toilette'], ['oil', 'زيت عطري', 'Perfume oil'], ['mist', 'سبراي', 'Mist']) },
    brandDef,
  ],
  beauty: [
    { key: 'brand', ar: 'الماركة', en: 'Brand', type: 'text' },
    { key: 'skin', ar: 'نوع البشرة', en: 'Skin type', type: 'select', options: o(['all', 'كل الأنواع', 'All skin types'], ['oily', 'دهنية', 'Oily'], ['dry', 'جافة', 'Dry'], ['combination', 'مختلطة', 'Combination'], ['sensitive', 'حساسة', 'Sensitive']) },
    { key: 'finish', ar: 'التشطيب', en: 'Finish', type: 'select', options: o(['matte', 'مات', 'Matte'], ['glossy', 'لامع', 'Glossy'], ['satin', 'ساتان', 'Satin'], ['dewy', 'نضِر', 'Dewy'], ['shimmer', 'شيمر', 'Shimmer']) },
  ],
};

export const ATTR_TYPES = ['text', 'select', 'multi', 'number', 'boolean'];
const KEY_RE = /^[a-z][a-z0-9_]{1,24}$/;
const cleanText = (v, n) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** The attribute list in effect when a department (and its ancestors) define none: the profile's defaults. */
export function effectiveAttrs(own, profile) {
  return Array.isArray(own) && own.length ? own : PROFILE_ATTRS[profile] || PROFILE_ATTRS[DEFAULT_PROFILE];
}

/** Validates ONE attribute definition coming from the admin (never trusts the shape). Returns null when unusable. */
export function normalizeAttrDef(d) {
  const key = cleanText(d?.key, 25).toLowerCase();
  if (!KEY_RE.test(key)) return null;
  const type = ATTR_TYPES.includes(d?.type) ? d.type : 'select';
  const ar = cleanText(d?.ar ?? d?.label_ar, 40) || key; const en = cleanText(d?.en ?? d?.label_en, 40) || ar;
  const def = { key, ar, en, type, required: !!d?.required, filterable: d?.filterable === undefined ? true : !!d.filterable, merchant_only: !!d?.merchant_only };
  if (def.merchant_only) def.filterable = false; // a merchant-only field is never shown to customers
  if (type === 'select' || type === 'multi') {
    const ov = new Set();
    def.options = (Array.isArray(d.options) ? d.options : []).slice(0, 60).map((x) => ({ v: cleanText(x?.v, 30).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, ''), ar: cleanText(x?.ar, 40), en: cleanText(x?.en, 40), ...(/^#[0-9a-f]{6}$/i.test(x?.hex || '') ? { hex: x.hex } : {}) }))
      .filter((x) => x.v && (x.ar || x.en) && !ov.has(x.v) && ov.add(x.v)).map((x) => ({ ...x, ar: x.ar || x.en, en: x.en || x.ar }));
    if (!def.options.length) return null;
  }
  if (type === 'number') { const n = (v) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : undefined); def.min = n(d.min); def.max = n(d.max); def.unit = cleanText(d.unit, 12) || undefined; }
  return def;
}
/** Validates a whole list (unique keys, max 20). */
export function normalizeAttrDefs(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.slice(0, 20).map(normalizeAttrDef).filter((d) => d && !seen.has(d.key) && seen.add(d.key));
}

/**
 * Keeps only the values a product may carry for its department's attribute list and reports missing required ones.
 * Returns { values, missing } where values is a plain { key: value | [values] } (only keys the department defines).
 */
export function sanitizeAttrValues(input, defs, { withMissing = false } = {}) {
  const out = {}; const missing = [];
  const src = input && typeof input === 'object' ? input : {};
  for (const d of defs) {
    const raw = src[d.key];
    const empty = raw == null || raw === '' || (Array.isArray(raw) && !raw.length);
    if (empty) { if (d.required) missing.push(d.key); continue; }
    if (d.type === 'text') { const t = cleanText(Array.isArray(raw) ? raw[0] : raw, 60); if (t) out[d.key] = t; else if (d.required) missing.push(d.key); continue; }
    if (d.type === 'boolean') { out[d.key] = raw === true || raw === 'true' || raw === 1 || raw === '1'; continue; }
    if (d.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n) || (d.min != null && n < d.min) || (d.max != null && n > d.max)) { if (d.required) missing.push(d.key); continue; }
      out[d.key] = n; continue;
    }
    const allowed = new Set((d.options || []).map((x) => x.v));
    const vals = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x)).filter((x) => allowed.has(x));
    if (!vals.length) { if (d.required) missing.push(d.key); continue; }
    out[d.key] = d.type === 'multi' ? [...new Set(vals)].slice(0, 12) : vals[0];
  }
  return withMissing ? { values: out, missing } : out;
}

/** Suggested storefront template per shopping profile (the store's biggest section decides). Pure data: the designer offers it, the owner decides. */
export const TEMPLATE_BY_PROFILE = { women: 'boutique', men: 'menswear', modest: 'modest', hijab: 'hijab_studio', kids: 'playground', sport: 'activewear', shoes: 'footwear', accessories: 'accessories', perfume: 'fragrance', beauty: 'beauty' };
