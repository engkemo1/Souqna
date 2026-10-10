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
export const DEFAULT_DEPARTMENTS = [
  { slug: 'women', ar: 'حريمي', en: 'Women', sizes: S_CLOTHES },
  { slug: 'men', ar: 'رجالي', en: 'Men', sizes: S_CLOTHES },
  { slug: 'kids', ar: 'أطفال', en: 'Kids', sizes: S_KIDS },
  { slug: 'shoes', ar: 'كوتشيات وأحذية', en: 'Shoes', sizes: S_SHOES },
  { slug: 'bags', ar: 'شنط', en: 'Bags', sizes: ['Free size'] },
  { slug: 'hijab', ar: 'طرح وحجاب', en: 'Hijab', sizes: ['Free size'] },
  { slug: 'abaya', ar: 'عبايات', en: 'Abayas', sizes: S_LEN },
  { slug: 'jalabiya', ar: 'جلاليب', en: 'Jalabiyas', sizes: S_LEN },
  { slug: 'underwear', ar: 'ملابس داخلية', en: 'Underwear', sizes: S_CLOTHES },
  { slug: 'wedding_dress', ar: 'فساتين أفراح', en: 'Wedding dresses', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { slug: 'wedding_suit', ar: 'بدل أفراح', en: 'Wedding suits', sizes: ['46', '48', '50', '52', '54', '56', '58'] },
  { slug: 'sports', ar: 'رياضي', en: 'Sportswear', sizes: S_CLOTHES },
  { slug: 'denim', ar: 'جينز', en: 'Denim', sizes: S_JEANS },
  { slug: 'accessories', ar: 'إكسسوارات', en: 'Accessories', sizes: ['Free size'] },
];
export const DEPT_SLUG_RE = /^[a-z][a-z0-9_]{1,30}$/;
export const encodeDepartments = (list) => `,${[...new Set(list)].filter((d) => DEPT_SLUG_RE.test(d)).join(',')},`;
export const decodeDepartments = (s) => String(s || '').split(',').filter((d) => DEPT_SLUG_RE.test(d));
