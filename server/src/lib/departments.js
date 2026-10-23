import { LEGACY_DEPARTMENTS } from '@souqna/shared';
import { q, insert } from '../db/index.js';
import { AppError } from './errors.js';
import { json } from '../db/index.js';

export const listDepartments = ({ all = false } = {}) =>
  q.all(`SELECT d.*, (SELECT COUNT(*) FROM stores s WHERE s.departments LIKE '%,' || d.slug || ',%') AS stores_count
         FROM departments d ${all ? '' : 'WHERE d.active=1'} ORDER BY d.sort, d.id`)
    .map((d) => ({ id: d.id, slug: d.slug, name: { ar: d.name_ar, en: d.name_en }, name_ar: d.name_ar, name_en: d.name_en, sizes: json(d.sizes_json, []), image: d.image || null, sort: d.sort, active: !!d.active, parent: d.parent_slug || null, stores_count: d.stores_count }));

const deptRows = () => q.all('SELECT slug, name_ar, name_en, parent_slug FROM departments');
/** القسم + كل اللي تحته (قسم رئيسي ← أقسام ← أنواع). الأسماء القديمة بتتحول لمكانها الجديد. */
export function deptSubtree(slug) {
  const rows = deptRows();
  const kids = new Map();
  for (const r of rows) if (r.parent_slug) kids.set(r.parent_slug, [...(kids.get(r.parent_slug) || []), r.slug]);
  const roots = !rows.some((r) => r.slug === slug) && LEGACY_DEPARTMENTS[slug] ? LEGACY_DEPARTMENTS[slug] : [slug];
  const out = new Set();
  const walk = (s, depth = 0) => { if (out.has(s) || depth > 4) return; out.add(s); (kids.get(s) || []).forEach((k) => walk(k, depth + 1)); };
  roots.forEach((r) => walk(r));
  return [...out];
}
/** كل الأقسام اللي فوق القسم ده (الأب ثم الجد). */
export function deptAncestors(slug) {
  const by = new Map(deptRows().map((r) => [r.slug, r]));
  const out = [];
  for (let p = by.get(slug)?.parent_slug, i = 0; p && i < 4; p = by.get(p)?.parent_slug, i++) out.push(p);
  return out;
}
/** كل متجر ليه قسم (كاتيجوري) لكل قسم بيبيعه؛ صاحب المحل بيضيف أقسام فرعية جواهم. */
export function ensureDeptCategories(storeId, slugs) {
  const by = new Map(deptRows().map((r) => [r.slug, r]));
  const ensure = (node, depth = 0) => {
    const catSlug = node.slug.replace(/_/g, '-');
    const ex = q.get('SELECT id FROM categories WHERE store_id=? AND slug=?', [storeId, catSlug]);
    if (ex) return ex.id;
    let parentId = null;
    const parent = node.parent_slug ? by.get(node.parent_slug) : null;
    if (parent && parent.parent_slug && depth < 3) parentId = ensure(parent, depth + 1); // أب هو قسم مش قسم رئيسي (مثال: فساتين أفراح تحت فساتين)
    const sort = (q.val('SELECT COALESCE(MAX(sort),-1)+1 FROM categories WHERE store_id=?', [storeId])) || 0;
    return insert('categories', { store_id: storeId, slug: catSlug, name_ar: node.name_ar, name_en: node.name_en, parent_id: parentId, sort });
  };
  for (const s of slugs) { const n = by.get(s); if (n) ensure(n); }
}

/** Throws a field error unless every slug is an active department. */
export function assertDepartments(list) {
  const ok = new Set(q.all('SELECT slug FROM departments WHERE active=1').map((d) => d.slug));
  if (!Array.isArray(list) || !list.length || !list.every((d) => ok.has(d))) throw new AppError(422, 'validation_failed', 'Pick at least one valid department.', { departments: 'departments_required' });
}

// Keyword hints (Arabic is matched after normalising أ/إ/آ, ة and ى). Order matters: the first entry whose words match and whose department the store sells wins.
const HINTS = [
  [['women_wedding_dresses', 'women_dresses', 'women'], ['فستان زفاف', 'فستان فرح', 'wedding dress', 'bridal']],
  [['men_wedding_suits', 'men_suits', 'men'], ['بدله زفاف', 'بدله فرح', 'tuxedo', 'wedding suit', 'groom']],
  [['shoes_women', 'shoes_men', 'shoes_kids', 'shoes'], ['كوتش', 'حذاء', 'جزمه', 'صندل', 'بوت', 'سليبر', 'shoe', 'sneaker', 'sandal', 'boot', 'loafer', 'slipper']],
  [['women_bags', 'men_bags'], ['شنطه', 'حقيبه', 'محفظه', 'bag', 'backpack', 'wallet', 'purse']],
  [['women_hijab', 'women'], ['طرحه', 'حجاب', 'ايشارب', 'hijab', 'scarf', 'shawl']],
  [['women_abaya', 'women'], ['عبايه', 'abaya']],
  [['men_jalabiya', 'men'], ['جلابيه', 'جلاليب', 'galabiya', 'jalabiya', 'kaftan']],
  [['women_underwear', 'men_underwear'], ['ملابس داخليه', 'بوكسر', 'سوتيان', 'lingerie', 'underwear', 'boxer', 'bra ']],
  [['kids_girls', 'kids_boys', 'kids_baby', 'kids'], ['اطفال', 'طفل', 'ولادي', 'بناتي', 'كيدز', 'kids', 'toddler', 'baby', 'boys', 'girls']],
  [['women_sports', 'men_sports'], ['رياضي', 'تراك', 'جيم', 'sport', 'training', 'gym', 'jersey', 'activewear']],
  [['women_pants', 'men_pants'], ['جينز', 'denim', 'jeans', 'بنطلون', 'بنطال', 'pants']],
  [['women_dresses', 'women_tops', 'women_skirts', 'women'], ['حريمي', 'نسائي', 'فستان', 'بلوزه', 'تنوره', 'جيبه', 'women', 'ladies', 'dress', 'blouse', 'skirt']],
  [['men_tops', 'men'], ['رجالي', 'شبابي', 'men', 'mens', "men's", 'gents']],
];
const norm = (x) => String(x || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '');

/** Best-guess department for a product from its text, limited to the departments the store sells. Returns null when unsure. */
export function inferDepartment(text, allowed) {
  const t = norm(text);
  for (const [slugs, words] of HINTS) {
    if (!words.some((w) => t.includes(norm(w)))) continue;
    const hit = slugs.find((sl) => allowed.includes(sl));
    if (hit) return hit;
  }
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
