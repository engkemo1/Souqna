/**
 * Catalog v3 migration: old department tree -> the unified tree (shared/catalog.js CATALOG_TREE).
 *
 * Design rules (approved):
 *  - Every existing department keeps its slug and id. Only parent, sort, profile, icon and (when it still carries its original
 *    default name) its display name change. Nothing is deleted.
 *  - Products are NEVER moved or touched. A merged bucket (e.g. "T-shirts & shirts") stays the general section and the new specific
 *    sections are nested under it, so no product can become uncategorised. Reclassifying products is a separate confirmed step.
 *  - Custom departments (added by an admin or pending from an owner) are left exactly where they are and listed for review.
 *  - Everything runs in one transaction and is verified against a before-snapshot; any mismatch rolls the whole thing back.
 *
 * All functions take a node:sqlite handle so the same code runs on a copy of the database (test) and on the real one (apply).
 */
import fs from 'node:fs';
import { CATALOG_TREE, OLD_DEFAULT_NAMES, PROFILE_ATTRS } from '@souqna/shared';

const hasCol = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

/** Additive DDL only (new tables + new columns), so the tool also works on a database the new server code has never opened. */
export function ensureSchema(db) {
  const sql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const at = sql.indexOf('-- Catalog v3');
  if (at < 0) throw new Error('schema.sql has no Catalog v3 section');
  db.exec(sql.slice(at));
  if (!hasCol(db, 'products', 'attrs_json')) db.exec('ALTER TABLE products ADD COLUMN attrs_json TEXT');
}

/** Questions only the owner can answer. Counts are filled from the real database by plan(). */
export const AMBIGUITIES = [
  { id: 'merged_tops', slugs: ['women_tops', 'men_tops'], text_ar: 'القسم القديم بيجمع تيشيرتات + بلوزات + قمصان في قسم واحد. مينفعش أقسّم المنتجات تلقائيًا من غير تخمين.', text_en: 'One old section holds T-shirts + blouses + shirts together; splitting its products automatically would be a guess.', default: 'Keep the old section as the general bucket; nest the specific sections under it. Products stay put until reclassified.' },
  { id: 'merged_pants', slugs: ['women_pants', 'men_pants'], text_ar: 'القسم القديم بيجمع البناطيل والجينز.', text_en: 'One old section holds pants and jeans together.', default: 'Same: keep as the general bucket with "Pants" and "Jeans" nested under it.' },
  { id: 'merged_sleepwear', slugs: ['women_underwear'], text_ar: 'القسم القديم بيجمع ملابس النوم واللانجيري.', text_en: 'One old section holds sleepwear and lingerie.', default: 'Keep as the general bucket with "Sleepwear" and "Lingerie" nested under it; "Homewear" is a new sibling.' },
  { id: 'perfume_makeup', slugs: ['perfume_makeup'], text_ar: '«عطور ومكياج» كانوا قسم واحد: المنتجات فيه ممكن تكون عطور أو مكياج.', text_en: '"Perfume & makeup" was one section: its products may be perfumes or makeup.', default: 'Kept as a root-level LEGACY bucket (renamed "(legacy)") so its products stay valid; a suggestion list proposes the right new section per product for confirmation. Delete it only once empty.' },
  { id: 'care', slugs: ['care'], text_ar: '«عنايات» قسم عام للعناية.', text_en: '"Care" was a generic care section.', default: 'Moved under Makeup & beauty and renamed "Skincare" (a new "Body care" sits next to it).' },
  { id: 'dup_kids_shoes', slugs: ['shoes_kids'], text_ar: 'القائمة المطلوبة فيها «أحذية أطفال» تحت الأطفال وتحت الأحذية.', text_en: 'The requested list has "Kids\' shoes" under both Kids and Shoes.', default: 'ONE section (under Shoes); the Kids page shows a shortcut tile to it. No duplicated structure.' },
  { id: 'dup_body_care', slugs: ['beauty_body_care'], text_ar: '«عناية بالجسم» مذكورة تحت المكياج وتحت العطور.', text_en: '"Body care" appears under both Beauty and Perfumes.', default: 'ONE section (under Makeup & beauty); Perfumes get Body sprays / Body mists.' },
  { id: 'formal_wear', slugs: ['men_formal_suits'], text_ar: '«ملابس رسمية» في القائمة = «بدل رسمي» الموجود فعلًا.', text_en: '"Formal wear" in the list equals the existing "Formal suits".', default: 'Mapped to the existing section (renamed "Formal suits & formal wear" only if still on its default name).' },
  { id: 'extra_old', slugs: ['women_wedding_dresses', 'men_wedding_suits', 'men_jalabiya'], text_ar: 'أقسام موجودة وغير مذكورة في القائمة الجديدة (فساتين أفراح، بدل أفراح، جلاليب رجالي).', text_en: 'Existing sections not in the new list (wedding dresses, wedding suits, men\'s jalabiyas).', default: 'Kept exactly where they are (men\'s jalabiyas stay under Men; the modest section has its own women\'s jalabiyas).' },
  { id: 'accessories_gender', slugs: ['women_accessories', 'men_accessories'], text_ar: 'القائمة فيها «إكسسوارات موضة» واحد، والموجود حاليًا اتنين (حريمي/رجالي).', text_en: 'The list has one "Fashion accessories"; today there are two (women/men).', default: 'Both move under Accessories with gendered names; merge them later from the admin tree if you prefer one.' },
  { id: 'hijab_root', slugs: ['women_hijab'], text_ar: 'قسم «طرح وحجاب» القديم هيبقى هو القسم الرئيسي للطرح (بنفس الـ ID).', text_en: 'The old "Hijab" section becomes the main Hijabs & scarves section (same id).', default: 'Moved to the top level and renamed; products in it stay in it (the general hijab bucket).' },
];

const NAME_DEFAULT = (slug, row) => { const d = OLD_DEFAULT_NAMES[slug]; return !!d && row.name_ar === d[0] && row.name_en === d[1]; };

/** Read-only: what apply() would do, with real counts. */
export function plan(db) {
  const rows = new Map(db.prepare('SELECT * FROM departments').all().map((r) => [r.slug, r]));
  const prodBy = new Map(db.prepare('SELECT department AS d, COUNT(*) AS n FROM products WHERE department IS NOT NULL GROUP BY department').all().map((r) => [r.d, r.n]));
  const nullProducts = db.prepare('SELECT COUNT(*) AS n FROM products WHERE department IS NULL').get().n;
  const storeCount = (slug) => db.prepare("SELECT COUNT(*) AS n FROM stores WHERE departments LIKE ?").get(`%,${slug},%`).n;
  const treeSlugs = new Set(CATALOG_TREE.map((n) => n.slug));
  const nodes = CATALOG_TREE.map((n, i) => {
    const cur = rows.get(n.slug);
    const base = { slug: n.slug, ar: n.ar, en: n.en, parent: n.parent, order: i, note: n.note || null, products: prodBy.get(n.slug) || 0, stores: cur ? storeCount(n.slug) : 0 };
    if (!cur) return { ...base, action: 'create' };
    const changes = [];
    if ((cur.parent_slug || null) !== (n.parent || null)) changes.push({ field: 'parent', from: cur.parent_slug || null, to: n.parent || null });
    if (!NAME_DEFAULT(n.slug, cur) && (cur.name_ar !== n.ar || cur.name_en !== n.en)) changes.push({ field: 'name', from: `${cur.name_ar} / ${cur.name_en}`, to: 'kept (custom name)', kept: true });
    else if (cur.name_ar !== n.ar || cur.name_en !== n.en) changes.push({ field: 'name', from: `${cur.name_ar} / ${cur.name_en}`, to: `${n.ar} / ${n.en}` });
    return { ...base, id: cur.id, action: changes.some((c) => !c.kept) ? (changes.some((c) => c.field === 'parent') ? 'move' : 'rename') : 'keep', changes };
  });
  const custom = [...rows.values()].filter((r) => !treeSlugs.has(r.slug)).map((r) => ({ id: r.id, slug: r.slug, name: `${r.name_ar} / ${r.name_en}`, parent: r.parent_slug, active: !!r.active, products: prodBy.get(r.slug) || 0, stores: storeCount(r.slug), pending: !r.active && /^c\d+_/.test(r.slug) }));
  const missingOld = nodes.filter((n) => n.action === 'create' && CATALOG_TREE.find((x) => x.slug === n.slug).old).map((n) => n.slug);
  const totals = db.prepare('SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM stores) AS stores, (SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM departments) AS departments').get();
  return {
    totals: { ...totals }, productsWithoutDepartment: nullProducts, nodes, custom, missingOld,
    ambiguities: AMBIGUITIES.map((a) => ({ ...a, products: a.slugs.reduce((s, x) => s + (prodBy.get(x) || 0), 0), stores: a.slugs.reduce((s, x) => s + storeCount(x), 0) })),
    summary: { create: nodes.filter((n) => n.action === 'create').length, move: nodes.filter((n) => n.action === 'move').length, rename: nodes.filter((n) => n.action === 'rename').length, keep: nodes.filter((n) => n.action === 'keep').length, custom: custom.length, pendingRequests: custom.filter((c) => c.pending).length },
  };
}

/** Everything that must be identical before and after. */
export function snapshot(db) {
  const one = (sql) => db.prepare(sql).get();
  const products = db.prepare('SELECT id, store_id, department, category_id, price, status, stock FROM products ORDER BY id').all();
  const hash = (rows) => { let h = 0; for (const r of rows) for (const c of Object.values(r)) for (const ch of String(c ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  return {
    products: products.length, productsHash: hash(products),
    perStore: Object.fromEntries(db.prepare('SELECT store_id, COUNT(*) AS n FROM products GROUP BY store_id').all().map((r) => [r.store_id, r.n])),
    stores: one('SELECT COUNT(*) AS n FROM stores').n, storesHash: hash(db.prepare('SELECT id, slug, departments, owner_id FROM stores ORDER BY id').all()),
    categories: one('SELECT COUNT(*) AS n FROM categories').n, categoriesHash: hash(db.prepare('SELECT id, store_id, slug, parent_id FROM categories ORDER BY id').all()),
    orders: one('SELECT COUNT(*) AS n FROM orders').n, orderItems: one('SELECT COUNT(*) AS n FROM order_items').n,
    orderItemsHash: hash(db.prepare('SELECT id, order_id, product_id, name_ar, price, qty FROM order_items ORDER BY id').all()),
    departmentIds: Object.fromEntries(db.prepare('SELECT slug, id FROM departments').all().map((r) => [r.slug, r.id])),
  };
}

export class VerifyError extends Error {}

/** Throws VerifyError when anything that must not change did change. */
export function verify(db, before) {
  const after = snapshot(db); const problems = [];
  const same = (k) => { if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) problems.push(`${k} changed: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`); };
  for (const k of ['products', 'productsHash', 'perStore', 'stores', 'storesHash', 'categories', 'categoriesHash', 'orders', 'orderItems', 'orderItemsHash']) same(k);
  for (const [slug, id] of Object.entries(before.departmentIds)) if (after.departmentIds[slug] !== id) problems.push(`department ${slug} lost or changed id (${id} -> ${after.departmentIds[slug]})`);
  const deps = new Map(db.prepare('SELECT slug, parent_slug, active FROM departments').all().map((r) => [r.slug, r]));
  for (const d of deps.values()) {
    if (d.parent_slug && !deps.has(d.parent_slug)) problems.push(`department ${d.slug} has a missing parent ${d.parent_slug}`);
    const seen = new Set();
    for (let c = d, i = 0; c; c = deps.get(c.parent_slug), i++) { if (seen.has(c.slug) || i > 8) { problems.push(`cycle or too deep at ${d.slug}`); break; } seen.add(c.slug); }
  }
  const orphan = db.prepare('SELECT COUNT(*) AS n FROM products p WHERE p.department IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.slug=p.department)').get().n;
  if (orphan) problems.push(`${orphan} products point at a department that does not exist`);
  const lost = db.prepare('SELECT COUNT(*) AS n FROM products p WHERE p.department IS NOT NULL AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.slug=p.department AND (d.active=1 OR d.slug GLOB \'c[0-9]*_*\'))').get().n;
  if (lost) problems.push(`${lost} products sit in an inactive department`);
  if (problems.length) throw new VerifyError(problems.join('\n'));
  return after;
}

/** Applies the mapping inside ONE transaction and verifies it; rolls back on any problem. `approved` must be literally true. */
export function apply(db, { approved } = {}) {
  if (approved !== true) throw new Error('catalog migration requires explicit approval');
  ensureSchema(db);
  for (const [col, ddl] of [['profile', 'TEXT'], ['description_ar', 'TEXT'], ['description_en', 'TEXT'], ['icon', 'TEXT'], ['visibility', "TEXT NOT NULL DEFAULT 'visible'"]]) {
    if (!hasCol(db, 'departments', col)) db.exec(`ALTER TABLE departments ADD COLUMN ${col} ${ddl}`);
  }
  const before = snapshot(db);
  const p = plan(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = new Map(db.prepare('SELECT * FROM departments').all().map((r) => [r.slug, r]));
    const insert = db.prepare('INSERT INTO departments (slug, name_ar, name_en, sizes_json, sort, active, parent_slug, profile, icon) VALUES (?,?,?,?,?,1,?,?,?)');
    const update = db.prepare('UPDATE departments SET parent_slug=?, sort=?, profile=COALESCE(profile,?), icon=COALESCE(icon,?), active=1 WHERE slug=?');
    const rename = db.prepare('UPDATE departments SET name_ar=?, name_en=? WHERE slug=?');
    let order = 0;
    for (const n of CATALOG_TREE) {
      const sort = (order++) * 10; const cur = rows.get(n.slug);
      if (!cur) { insert.run(n.slug, n.ar, n.en, JSON.stringify(n.sizes), sort, n.parent || null, n.profile || null, n.icon || null); continue; }
      update.run(n.parent || null, sort, n.profile || null, n.icon || null, n.slug);
      if (NAME_DEFAULT(n.slug, cur)) rename.run(n.ar, n.en, n.slug);
    }
    // default attribute definitions, once, on every section that has a profile (admins edit/override them afterwards)
    const insAttr = db.prepare('INSERT OR IGNORE INTO category_attributes (department_slug, key, type, label_ar, label_en, options_json, required, filterable, merchant_only, sort) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const roots = CATALOG_TREE.filter((n) => n.profile);
    for (const r of roots) (PROFILE_ATTRS[r.profile] || []).forEach((a, i) => insAttr.run(r.slug, a.key, a.type, a.ar, a.en, JSON.stringify(a.options || []), a.required ? 1 : 0, a.filterable === false ? 0 : 1, a.merchant_only ? 1 : 0, i * 10));
    // owner-created sections waiting for approval become requests in the new workflow; the pending department row (and its products) stay as they are
    let migratedRequests = 0;
    const insReq = db.prepare("INSERT INTO category_requests (store_id, name_ar, name_en, parent_slug, status, department_slug, created_at) VALUES (?,?,?,?,'pending',?,datetime('now'))");
    for (const c of p.custom.filter((x) => x.pending)) {
      if (db.prepare('SELECT 1 FROM category_requests WHERE department_slug=?').get(c.slug)) continue;
      const st = db.prepare("SELECT s.id FROM categories c JOIN stores s ON s.id=c.store_id WHERE c.slug=? LIMIT 1").get(c.slug.replace(/_/g, '-'));
      const row = rows.get(c.slug);
      if (st) { insReq.run(st.id, row.name_ar, row.name_en, row.parent_slug || null, c.slug); migratedRequests++; }
    }
    const after = verify(db, before);
    db.exec('COMMIT');
    return { before, after, plan: p.summary, migratedRequests };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}
