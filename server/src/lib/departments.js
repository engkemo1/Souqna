import { q } from '../db/index.js';
import { AppError } from './errors.js';
import { json } from '../db/index.js';

export const listDepartments = ({ all = false } = {}) =>
  q.all(`SELECT d.*, (SELECT COUNT(*) FROM stores s WHERE s.departments LIKE '%,' || d.slug || ',%') AS stores_count
         FROM departments d ${all ? '' : 'WHERE d.active=1'} ORDER BY d.sort, d.id`)
    .map((d) => ({ id: d.id, slug: d.slug, name: { ar: d.name_ar, en: d.name_en }, name_ar: d.name_ar, name_en: d.name_en, sizes: json(d.sizes_json, []), image: d.image || null, sort: d.sort, active: !!d.active, stores_count: d.stores_count }));

/** Throws a field error unless every slug is an active department. */
export function assertDepartments(list) {
  const ok = new Set(q.all('SELECT slug FROM departments WHERE active=1').map((d) => d.slug));
  if (!Array.isArray(list) || !list.length || !list.every((d) => ok.has(d))) throw new AppError(422, 'validation_failed', 'Pick at least one valid department.', { departments: 'departments_required' });
}

// Keyword hints (Arabic is matched after normalising أ/إ/آ, ة and ى). Order matters: the first department the store sells that matches wins.
const HINTS = [
  ['wedding_dress', ['فستان زفاف', 'فستان فرح', 'wedding dress', 'bridal']],
  ['wedding_suit', ['بدله زفاف', 'بدله فرح', 'tuxedo', 'wedding suit', 'groom']],
  ['shoes', ['كوتش', 'حذاء', 'جزمه', 'صندل', 'بوت', 'سليبر', 'shoe', 'sneaker', 'sandal', 'boot', 'loafer', 'slipper']],
  ['bags', ['شنطه', 'حقيبه', 'محفظه', 'bag', 'backpack', 'wallet', 'purse']],
  ['hijab', ['طرحه', 'حجاب', 'ايشارب', 'hijab', 'scarf', 'shawl']],
  ['abaya', ['عبايه', 'abaya']],
  ['jalabiya', ['جلابيه', 'جلاليب', 'galabiya', 'jalabiya', 'kaftan']],
  ['underwear', ['ملابس داخليه', 'بوكسر', 'سوتيان', 'lingerie', 'underwear', 'boxer', 'bra ']],
  ['kids', ['اطفال', 'طفل', 'ولادي', 'بناتي', 'كيدز', 'kids', 'toddler', 'baby', 'boys', 'girls']],
  ['sports', ['رياضي', 'تراك', 'جيم', 'sport', 'training', 'gym', 'jersey', 'activewear']],
  ['denim', ['جينز', 'denim', 'jeans']],
  ['women', ['حريمي', 'نسائي', 'فستان', 'بلوزه', 'تنوره', 'جيبه', 'women', 'ladies', 'dress', 'blouse', 'skirt']],
  ['men', ['رجالي', 'شبابي', 'men', 'mens', "men's", 'gents']],
];
const norm = (x) => String(x || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '');

/** Best-guess department for a product from its text, limited to the departments the store sells. Returns null when unsure. */
export function inferDepartment(text, allowed) {
  const t = norm(text);
  for (const [slug, words] of HINTS) if (allowed.includes(slug) && words.some((w) => t.includes(norm(w)))) return slug;
  return null;
}

/** Fills the department of legacy products in multi-department stores (only when a confident guess exists). */
export function backfillDepartments() {
  let n = 0;
  for (const s of q.all("SELECT id, departments FROM stores WHERE LENGTH(departments) - LENGTH(REPLACE(departments, ',', '')) > 2")) {
    const allowed = s.departments.split(',').filter(Boolean);
    for (const p of q.all('SELECT p.id, p.name_ar, p.name_en, c.name_ar AS cat_ar, c.name_en AS cat_en FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.store_id=? AND p.department IS NULL', [s.id])) {
      const d = inferDepartment(`${p.name_ar} ${p.name_en} ${p.cat_ar || ''} ${p.cat_en || ''}`, allowed);
      if (d) { q.run('UPDATE products SET department=? WHERE id=?', [d, p.id]); n++; }
    }
  }
  return n;
}

/** المنتجات القديمة (من غير نوع/فئة صريحين): نملى النوع والفئة من الاسم لما التخمين يكون واضح، عشان فلاتر البحث تشتغل عليها. المحلات بتراجعها من محرر المنتج (بيقترح نفس القيمة). */
export async function backfillProductTypes() {
  const { enrichProduct } = await import('./moda/products.js');
  const { loadKnowledge } = await import('./moda/knowledge.js');
  const K = loadKnowledge();
  let n = 0;
  const rows = q.all("SELECT p.*, (SELECT c.name_ar || char(32) || c.name_en FROM categories c WHERE c.id=p.category_id) AS cat_text FROM products p WHERE p.moda_key IS NULL AND p.audience IS NULL LIMIT 20000");
  for (const row of rows) {
    try {
      const e = enrichProduct(row, K);
      const item = e.key && K.items.get(e.key);
      if (!item || item.virtual) continue;
      q.run('UPDATE products SET moda_key=?, audience=? WHERE id=?', [e.key, e.gender || 'unisex', row.id]); n++;
    } catch { /* نكمل */ }
  }
  return n;
}
