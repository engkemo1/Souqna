/**
 * Read-only audit of the category system (never writes). Usage:
 *   DB_FILE=/app/data/db.sqlite node --no-warnings src/scripts/catalog-audit.js [--json]
 * Reports: the live tree with product/store usage, duplicate names, empty-but-assigned branches, products with unknown sections,
 * store assignments to missing/inactive/parent sections, and how many product types the dictionary knows.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.DB_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/souqna.db');
const db = new DatabaseSync(file, { readOnly: true });
const all = (sql, p = []) => db.prepare(sql).all(...p);
const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const col = (t, c) => all(`PRAGMA table_info(${t})`).some((x) => x.name === c);
const norm = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

const depts = all('SELECT * FROM departments ORDER BY sort, id');
const by = new Map(depts.map((d) => [d.slug, d]));
const kids = new Map(); for (const d of depts) kids.set(d.parent_slug || null, [...(kids.get(d.parent_slug || null) || []), d]);
const prodCount = new Map(all("SELECT department AS s, COUNT(*) n, SUM(status='active') a FROM products WHERE department IS NOT NULL GROUP BY department").map((r) => [r.s, r]));
const storeAssign = new Map();
for (const s of all("SELECT id, slug, departments FROM stores")) for (const d of String(s.departments || '').split(',').filter(Boolean)) storeAssign.set(d, [...(storeAssign.get(d) || []), s.slug]);
const level = (d) => { let n = 0; for (let c = by.get(d.parent_slug); c && n < 10; c = by.get(c.parent_slug)) n++; return n; };

const rollup = (slug) => { let p = 0, a = 0, st = new Set(storeAssign.get(slug) || []); const r = prodCount.get(slug); if (r) { p += r.n; a += r.a || 0; } for (const k of kids.get(slug) || []) { const x = rollup(k.slug); p += x.p; a += x.a; x.st.forEach((s) => st.add(s)); } return { p, a, st }; };

const report = {
  database: file,
  totals: { departments: depts.length, roots: (kids.get(null) || []).length, active: depts.filter((d) => d.active).length, products: all('SELECT COUNT(*) n FROM products')[0].n, stores: all('SELECT COUNT(*) n FROM stores')[0].n },
  tree: [], duplicates: [], emptyAssigned: [], unknownProductSections: [], storeProblems: [], notes: [],
};
const walk = (slug, depth) => {
  for (const d of kids.get(slug) || []) {
    const own = prodCount.get(d.slug); const r = rollup(d.slug);
    report.tree.push({ slug: d.slug, name_ar: d.name_ar, name_en: d.name_en, level: depth, active: !!d.active, products: own?.n || 0, products_below: r.p, stores_direct: (storeAssign.get(d.slug) || []).length, stores_below: r.st.size, children: (kids.get(d.slug) || []).length, has_image: !!(d.image || d.image_asset_id) });
    walk(d.slug, depth + 1);
  }
};
walk(null, 0);

// duplicates: same normalised Arabic or English name anywhere in the tree
for (const key of ['name_ar', 'name_en']) {
  const g = new Map(); for (const d of depts) { const k = norm(d[key]); if (k) g.set(k, [...(g.get(k) || []), d]); }
  for (const [k, list] of g) if (list.length > 1) report.duplicates.push({ by: key, name: k, sections: list.map((d) => ({ slug: d.slug, parent: d.parent_slug, products: prodCount.get(d.slug)?.n || 0, stores: (storeAssign.get(d.slug) || []).length })) });
}
for (const d of depts) { // parent and child sharing a name ("Abayas > Abayas")
  const p = by.get(d.parent_slug); if (p && (norm(p.name_ar) === norm(d.name_ar) || norm(p.name_en) === norm(d.name_en))) report.duplicates.push({ by: 'parent_child', name: norm(d.name_ar), sections: [{ slug: p.slug }, { slug: d.slug }] });
}
for (const d of depts) { const r = rollup(d.slug); if (r.p === 0 && (storeAssign.get(d.slug) || []).length) report.emptyAssigned.push({ slug: d.slug, stores: storeAssign.get(d.slug) }); }
for (const [slug, r] of prodCount) if (!by.has(slug)) report.unknownProductSections.push({ slug, products: r.n });
report.unknownProductSections.push(...[{ slug: '(null)', products: all("SELECT COUNT(*) n FROM products WHERE department IS NULL")[0].n }].filter((x) => x.products));
for (const [slug, stores] of storeAssign) {
  const d = by.get(slug);
  if (!d) report.storeProblems.push({ slug, problem: 'missing_section', stores });
  else if (!d.active) report.storeProblems.push({ slug, problem: 'inactive_section', stores });
  else if ((kids.get(slug) || []).length && level(d) > 0) report.storeProblems.push({ slug, problem: 'assigned_to_parent_not_leaf', stores });
}
if (col('products', 'audience')) report.notes.push(`products with an audience: ${all("SELECT COUNT(*) n FROM products WHERE audience IS NOT NULL AND audience<>''")[0].n}/${report.totals.products}`);
if (col('products', 'moda_key')) report.notes.push(`products with a product type (moda_key): ${all("SELECT COUNT(*) n FROM products WHERE moda_key IS NOT NULL AND moda_key<>''")[0].n}/${report.totals.products}`);
report.notes.push(`products whose department is a PARENT section (not a leaf): ${all('SELECT COUNT(*) n FROM products p WHERE p.department IN (SELECT parent_slug FROM departments WHERE parent_slug IS NOT NULL)')[0].n}`);
if (has('categories')) report.notes.push(`store-level sub-categories (per-store, separate system): ${all('SELECT COUNT(*) n FROM categories')[0].n} rows over ${all('SELECT COUNT(DISTINCT store_id) n FROM categories')[0].n} stores`);
if (has('category_requests')) report.notes.push(`category requests: ${JSON.stringify(Object.fromEntries(all('SELECT status, COUNT(*) n FROM category_requests GROUP BY status').map((r) => [r.status, r.n])))}`);
if (has('image_assets')) report.notes.push(`category images: ${all("SELECT COUNT(*) n FROM departments WHERE image_asset_id IS NOT NULL OR (image IS NOT NULL AND image<>'')")[0].n}/${depts.length} sections have an image`);
if (col('departments', 'pending') || true) report.notes.push(`owner-added sections waiting for approval: ${all("SELECT COUNT(*) n FROM departments WHERE active=0 AND slug GLOB 'c[0-9]*_*'")[0].n}`);

if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
console.log(`DB: ${file}\nSections ${report.totals.departments} (roots ${report.totals.roots}, active ${report.totals.active}) · products ${report.totals.products} · stores ${report.totals.stores}\n`);
for (const t of report.tree) console.log(`${'  '.repeat(t.level)}${t.name_ar} [${t.slug}] ${t.active ? '' : '(off) '}p=${t.products}${t.products_below !== t.products ? `/${t.products_below}` : ''} s=${t.stores_direct}${t.stores_below !== t.stores_direct ? `/${t.stores_below}` : ''}${t.has_image ? ' img' : ''}`);
const sec = (title, rows) => { console.log(`\n== ${title} (${rows.length})`); for (const r of rows.slice(0, 40)) console.log(' ', JSON.stringify(r)); };
sec('Duplicate names', report.duplicates); sec('Sections assigned to stores but with no products below', report.emptyAssigned);
sec('Products pointing at unknown / null sections', report.unknownProductSections); sec('Store assignment problems', report.storeProblems);
console.log('\n== Notes'); report.notes.forEach((n) => console.log(' ', n));
