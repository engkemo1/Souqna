export * from './theme.js';

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
export const ORDER_FLOW = { pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
export const IMAGE_SIZES = { thumb: 160, sm: 400, md: 800, lg: 1400 };
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const GOVERNORATES = ['Qalyubia', 'Cairo', 'Giza', 'Alexandria', 'Gharbia', 'Monufia', 'Sharqia', 'Dakahlia'];

/**
 * Store departments are managed from the admin panel (DB table `departments`).
 * This list only seeds a fresh database. A store keeps its departments as a ",slug,slug," string.
 */
const S_CLOTHES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const S_SHOES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
const S_KIDS = ['0-3M', '3-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y'];
const S_LEN = ['50', '52', '54', '56', '58', '60'];
const S_JEANS = ['28', '30', '32', '34', '36', '38', '40', '42'];
const S_SUIT = ['46', '48', '50', '52', '54', '56', '58'];
const FREE = ['Free size'];
// أقسام رئيسية ← أقسام ← أنواع (على طريقة نون). الأقسام الرئيسية بس بتتضاف من لوحة الأدمن؛ صاحب المحل بيضيف أقسام فرعية جواها.
export const DEFAULT_DEPARTMENTS = [
  { slug: 'women', ar: 'حريمي', en: 'Women', sizes: S_CLOTHES },
  { slug: 'women_dresses', parent: 'women', ar: 'فساتين', en: 'Dresses', sizes: S_CLOTHES },
  { slug: 'women_wedding_dresses', parent: 'women_dresses', ar: 'فساتين أفراح', en: 'Wedding dresses', sizes: S_CLOTHES },
  { slug: 'women_soiree_dresses', parent: 'women_dresses', ar: 'فساتين سهرة', en: 'Evening dresses', sizes: S_CLOTHES },
  { slug: 'women_casual_dresses', parent: 'women_dresses', ar: 'فساتين كاجوال', en: 'Casual dresses', sizes: S_CLOTHES },
  { slug: 'women_tops', parent: 'women', ar: 'بلوزات وتيشيرتات', en: 'Tops & T-shirts', sizes: S_CLOTHES },
  { slug: 'women_pants', parent: 'women', ar: 'بناطيل وجينز', en: 'Pants & Jeans', sizes: S_JEANS },
  { slug: 'women_skirts', parent: 'women', ar: 'جيبات', en: 'Skirts', sizes: S_CLOTHES },
  { slug: 'women_abaya', parent: 'women', ar: 'عبايات', en: 'Abayas', sizes: S_LEN },
  { slug: 'women_hijab', parent: 'women', ar: 'طرح وحجاب', en: 'Hijab', sizes: FREE },
  { slug: 'women_underwear', parent: 'women', ar: 'ملابس داخلية ونوم', en: 'Underwear & Sleepwear', sizes: S_CLOTHES },
  { slug: 'women_sports', parent: 'women', ar: 'رياضي', en: 'Sportswear', sizes: S_CLOTHES },
  { slug: 'women_bags', parent: 'women', ar: 'شنط', en: 'Bags', sizes: FREE },
  { slug: 'women_accessories', parent: 'women', ar: 'إكسسوارات', en: 'Accessories', sizes: FREE },
  { slug: 'men', ar: 'رجالي', en: 'Men', sizes: S_CLOTHES },
  { slug: 'men_tops', parent: 'men', ar: 'تيشيرتات وقمصان', en: 'T-shirts & Shirts', sizes: S_CLOTHES },
  { slug: 'men_pants', parent: 'men', ar: 'بناطيل وجينز', en: 'Pants & Jeans', sizes: S_JEANS },
  { slug: 'men_suits', parent: 'men', ar: 'بدل', en: 'Suits', sizes: S_SUIT },
  { slug: 'men_wedding_suits', parent: 'men_suits', ar: 'بدل أفراح', en: 'Wedding suits', sizes: S_SUIT },
  { slug: 'men_formal_suits', parent: 'men_suits', ar: 'بدل رسمي', en: 'Formal suits', sizes: S_SUIT },
  { slug: 'men_jalabiya', parent: 'men', ar: 'جلاليب', en: 'Jalabiyas', sizes: S_LEN },
  { slug: 'men_underwear', parent: 'men', ar: 'ملابس داخلية', en: 'Underwear', sizes: S_CLOTHES },
  { slug: 'men_sports', parent: 'men', ar: 'رياضي', en: 'Sportswear', sizes: S_CLOTHES },
  { slug: 'men_bags', parent: 'men', ar: 'شنط', en: 'Bags', sizes: FREE },
  { slug: 'men_accessories', parent: 'men', ar: 'إكسسوارات', en: 'Accessories', sizes: FREE },
  { slug: 'kids', ar: 'أطفال', en: 'Kids', sizes: S_KIDS },
  { slug: 'kids_girls', parent: 'kids', ar: 'بناتي', en: 'Girls', sizes: S_KIDS },
  { slug: 'kids_boys', parent: 'kids', ar: 'ولادي', en: 'Boys', sizes: S_KIDS },
  { slug: 'kids_baby', parent: 'kids', ar: 'رضع', en: 'Baby', sizes: S_KIDS },
  { slug: 'shoes', ar: 'أحذية', en: 'Shoes', sizes: S_SHOES },
  { slug: 'shoes_men', parent: 'shoes', ar: 'أحذية رجالي', en: "Men's shoes", sizes: S_SHOES },
  { slug: 'shoes_women', parent: 'shoes', ar: 'أحذية حريمي', en: "Women's shoes", sizes: S_SHOES },
  { slug: 'shoes_kids', parent: 'shoes', ar: 'أحذية أطفال', en: "Kids' shoes", sizes: S_SHOES },
  { slug: 'perfume_makeup', ar: 'عطور ومكياج', en: 'Perfume & Makeup', sizes: FREE },
  { slug: 'care', ar: 'عنايات', en: 'Care', sizes: FREE },
];
/** الأقسام القديمة (قبل الشجرة) ← مكانها الجديد. [حريمي, رجالي] لما القسم كان مشترك. */
export const LEGACY_DEPARTMENTS = {
  bags: ['women_bags', 'men_bags'], accessories: ['women_accessories', 'men_accessories'], underwear: ['women_underwear', 'men_underwear'],
  sports: ['women_sports', 'men_sports'], denim: ['women_pants', 'men_pants'], hijab: ['women_hijab'], abaya: ['women_abaya'],
  jalabiya: ['men_jalabiya'], wedding_dress: ['women_wedding_dresses'], wedding_suit: ['men_wedding_suits'], maternity: ['women'],
};
export const DEPT_SLUG_RE = /^[a-z][a-z0-9_]{1,30}$/;
export const encodeDepartments = (list) => `,${[...new Set(list)].filter((d) => DEPT_SLUG_RE.test(d)).join(',')},`;
export const decodeDepartments = (s) => String(s || '').split(',').filter((d) => DEPT_SLUG_RE.test(d));
