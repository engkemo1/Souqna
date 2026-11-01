/**
 * READ-ONLY cleanup audit (opens the DB with readOnly:true, never writes). Usage:
 *   DB_FILE=/app/data/db.sqlite node --no-warnings src/scripts/catalog-cleanup-audit.js > cleanup-audit.json
 * Lists every department with parent, active flag, product counts (total/active, per store), store assignments,
 * dependents (category_attributes, usage, requests, per-store category mirrors) and flags likely duplicates by
 * normalised name. It only REPORTS: nothing is merged or reclassified from name similarity.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/souqna.db');
const db = new DatabaseSync(file, { readOnly: true });
const all = (sql, p = []) => db.prepare(sql).all(...p);
const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const cols = (t) => (has(t) ? all(`PRAGMA table_info(${t})`).map((c) => c.name) : []);
const norm = (s) => String(s || '').normalize('NFKC').replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();

const depts = all('SELECT * FROM departments ORDER BY sort, id');
const prodCols = cols('products');
const stores = all('SELECT id, slug, departments FROM stores');
const storeSlug = new Map(stores.map((s) => [s.id, s.slug]));
const perDept = new Map();
for (const r of all(`SELECT department s, store_id, COUNT(*) n, SUM(status='active') a FROM products GROUP BY department, store_id`)) {
  const e = perDept.get(r.s) || { total: 0, active: 0, stores: {} };
  e.total += r.n; e.active += r.a || 0; e.stores[storeSlug.get(r.store_id) || r.store_id] = r.n; perDept.set(r.s, e);
}
const one = (sql, p) => all(sql, p)[0]?.n ?? 0;
const rows = depts.map((d) => {
  const e = perDept.get(d.slug) || { total: 0, active: 0, stores: {} };
  const mirrors = has('categories') ? all('SELECT c.id, c.store_id, c.parent_id, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) n FROM categories c WHERE c.slug IN (?,?)', [d.slug, d.slug.replace(/_/g, '-')]) : [];
  return {
    id: d.id, slug: d.slug, name_ar: d.name_ar, name_en: d.name_en, parent_slug: d.parent_slug || null, active: !!d.active, sort: d.sort,
    products_total: e.total, products_active: e.active, products_by_store: e.stores,
    stores_selling: stores.filter((s) => String(s.departments || '').includes(`,${d.slug},`)).map((s) => s.slug),
    children: depts.filter((x) => x.parent_slug === d.slug).map((x) => x.slug),
    attributes: has('category_attributes') ? one('SELECT COUNT(*) n FROM category_attributes WHERE department_slug=?', [d.slug]) : 0,
    usage_rows: has('merchant_category_usage') ? one('SELECT COUNT(*) n FROM merchant_category_usage WHERE department_slug=?', [d.slug]) : 0,
    requests_pointing: has('category_requests') ? one('SELECT COUNT(*) n FROM category_requests WHERE department_slug=? OR parent_slug=?', [d.slug, d.slug]) : 0,
    store_category_mirrors: mirrors,
  };
});
const groups = new Map();
for (const r of rows) { const k = norm(r.name_ar); groups.set(k, [...(groups.get(k) || []), r.slug]); }
const lookup = ['كوت', 'سوت', 'سلويت', 'سلوبيت', 'روب', 'قطيف', 'سواريه', 'سهر', 'فستان', 'فساتين', 'طرح', 'حذاء', 'هاف', 'بوت', 'اكسسوار', 'إكسسوار', 'عطور', 'مكياج', 'يونيفورم', 'مدرس', 'طبي', 'مطعم'];
const keywordMatches = rows.filter((r) => lookup.some((w) => norm(r.name_ar).includes(norm(w)))).map((r) => ({ slug: r.slug, name_ar: r.name_ar, parent: r.parent_slug, products: r.products_total, active: r.active }));
const report = {
  database: file,
  totals: { departments: depts.length, products: one('SELECT COUNT(*) n FROM products'), stores: stores.length, products_without_department: one("SELECT COUNT(*) n FROM products WHERE department IS NULL OR department=''"), products_with_unknown_department: one('SELECT COUNT(*) n FROM products p WHERE department IS NOT NULL AND department<>\'\' AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.slug=p.department)') },
  departments: rows,
  exact_duplicate_names: [...groups].filter(([, v]) => v.length > 1).map(([name, slugs]) => ({ name, slugs })),
  keyword_matches_for_review: keywordMatches,
  pending_category_requests: has('category_requests') ? one("SELECT COUNT(*) n FROM category_requests WHERE status='pending'") : 0,
  product_columns_present: prodCols.filter((c) => ['department', 'category_id', 'audience', 'attrs_json', 'name', 'name_ar', 'title'].includes(c)),
};
console.log(JSON.stringify(report, null, 2));
