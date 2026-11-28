import { LEGACY_DEPARTMENTS, PROFILES, DEFAULT_PROFILE, ROOT_PROFILES, effectiveAttrs } from '@souqna/shared';
import { q, insert } from '../db/index.js';
import { AppError } from './errors.js';
import { json } from '../db/index.js';
import { assetUrls } from './image-assets.js';
import { parseChildSizes } from './moda/childfit.js';

export const PENDING_RE = /^c\d+_/;
const rowToDef = (r) => ({ key: r.key, ar: r.label_ar, en: r.label_en, type: r.type, options: json(r.options_json, []), required: !!r.required, filterable: !!r.filterable, merchant_only: !!r.merchant_only, active: !!r.active, sort: r.sort });

/** Inherited profile / attribute definitions for every department, computed in memory from two queries. */
function inheritance() {
  const rows = q.all('SELECT slug, parent_slug, profile FROM departments');
  const by = new Map(rows.map((r) => [r.slug, r]));
  const own = new Map();
  for (const r of q.all('SELECT * FROM category_attributes ORDER BY sort, id')) own.set(r.department_slug, [...(own.get(r.department_slug) || []), rowToDef(r)]);
  const chain = (slug) => { const out = []; for (let c = by.get(slug), i = 0; c && i < 8; c = by.get(c.parent_slug), i++) out.push(c); return out; }; // node first, root last
  const profile = (slug) => {
    const ch = chain(slug);
    for (const c of ch) if (c.profile && PROFILES[c.profile]) return c.profile;
    const root = ch[ch.length - 1]?.slug;
    return ROOT_PROFILES[root] || DEFAULT_PROFILE; // before the catalog migration has run, the old roots still get a sensible experience
  };
  /** root -> node: a child redefining a key replaces it; active=0 in a child switches an inherited attribute off for that branch. */
  const attrs = (slug) => {
    const merged = new Map(); let any = false;
    for (const c of chain(slug).reverse()) for (const d of own.get(c.slug) || []) { any = true; if (d.active) merged.set(d.key, d); else merged.delete(d.key); }
    return any ? [...merged.values()].sort((a, b) => a.sort - b.sort) : effectiveAttrs(null, profile(slug));
  };
  return { profile, attrs, own: (slug) => own.get(slug) || [] };
}
/** Active products per department INCLUDING everything below it (a main section counts its sub-sections' products). One query + one pass. */
export function productCounts() {
  const own = new Map(q.all("SELECT p.department AS slug, COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND p.department IS NOT NULL GROUP BY p.department").map((r) => [r.slug, r.n]));
  const parent = new Map(q.all('SELECT slug, parent_slug FROM departments').map((r) => [r.slug, r.parent_slug]));
  const total = new Map();
  for (const [slug, n] of own) for (let c = slug, i = 0; c && i < 10; c = parent.get(c), i++) total.set(c, (total.get(c) || 0) + n);
  return total;
}
const levelOf = (by, slug) => { let n = 0; for (let c = by.get(slug)?.parent_slug, i = 0; c && i < 10; c = by.get(c)?.parent_slug, i++) n++; return n; };
export const listDepartments = ({ all = false } = {}) => { const eff = inheritance(); const counts = productCounts(); const assets = new Map(q.all('SELECT * FROM image_assets').map((a) => [a.id, a])); const byRow = new Map(q.all('SELECT slug, parent_slug FROM departments').map((r) => [r.slug, r])); return (
  q.all(`SELECT d.*, (SELECT COUNT(*) FROM stores s WHERE s.departments LIKE '%,' || d.slug || ',%') AS stores_count
         FROM departments d ${all ? '' : 'WHERE d.active=1'} ORDER BY d.sort, d.id`)
    .map((d) => {
      const pending = !d.active && PENDING_RE.test(d.slug); // a section an owner added; waits for the platform admin to accept it
      return { id: d.id, slug: d.slug, name: { ar: d.name_ar, en: d.name_en }, name_ar: d.name_ar, name_en: d.name_en, sizes: json(d.sizes_json, []), image: (d.image_asset_id && assetUrls(assets.get(d.image_asset_id))?.card) || d.image || null, images: d.image_asset_id ? assetUrls(assets.get(d.image_asset_id)) : null, image_asset_id: d.image_asset_id || null, level: levelOf(byRow, d.slug), product_count: counts.get(d.slug) || 0, show_empty: !!d.show_empty, seo: { title: { ar: d.seo_title_ar || '', en: d.seo_title_en || '' }, description: { ar: d.seo_desc_ar || '', en: d.seo_desc_en || '' } }, sort: d.sort, active: !!d.active, parent: d.parent_slug || null, profile: d.profile || null, profile_effective: eff.profile(d.slug), description: { ar: d.description_ar || '', en: d.description_en || '' }, icon: d.icon || null, visibility: d.visibility || 'visible', attrs: eff.own(d.slug), attrs_effective: eff.attrs(d.slug), stores_count: d.stores_count,
        ...(pending ? { pending: true, requesters: q.all('SELECT s.name_ar FROM categories c JOIN stores s ON s.id=c.store_id WHERE c.slug=?', [d.slug.replace(/_/g, '-')]).map((x) => x.name_ar) } : {}) };
    })); };

const deptRows = () => q.all('SELECT slug, name_ar, name_en, parent_slug FROM departments');
/** القسم + كل اللي تحته (قسم رئيسي ← أقسام ← أنواع). الأسماء القديمة بتتحول لمكانها الجديد. */
export function deptSubtree(slug) {
  const rows = deptRows();
  const kids = new Map();
  for (const r of rows) if (r.parent_slug) kids.set(r.parent_slug, [...(kids.get(r.parent_slug) || []), r.slug]);
  const roots = !rows.some((r) => r.slug === slug) && LEGACY_DEPARTMENTS[slug] ? LEGACY_DEPARTMENTS[slug] : [slug];
  const out = new Set();
  const walk = (s, depth = 0) => { if (out.has(s) || depth > 8) return; out.add(s); (kids.get(s) || []).forEach((k) => walk(k, depth + 1)); };
  roots.forEach((r) => walk(r));
  return [...out];
}
/** كل الأقسام اللي فوق القسم ده (الأب ثم الجد). */
export function deptAncestors(slug) {
  const by = new Map(deptRows().map((r) => [r.slug, r]));
  const out = [];
  for (let p = by.get(slug)?.parent_slug, i = 0; p && i < 8; p = by.get(p)?.parent_slug, i++) out.push(p);
  return out;
}
/** كل متجر ليه قسم (كاتيجوري) لكل قسم بيبيعه؛ صاحب المحل بيضيف أقسام فرعية جواهم. */
export function ensureDeptCategories(storeId, slugs) {
  const by = new Map(deptRows().map((r) => [r.slug, r]));
  const hidden = new Set(q.all('SELECT slug FROM store_hidden_sections WHERE store_id=?', [storeId]).map((r) => r.slug)); // the owner deleted these from his own store
  const ensure = (node, depth = 0) => {
    const catSlug = node.slug.replace(/_/g, '-');
    const ex = q.get('SELECT id FROM categories WHERE store_id=? AND slug=?', [storeId, catSlug]);
    if (ex) return ex.id;
    if (hidden.has(catSlug)) return null;
    let parentId = null;
    const parent = node.parent_slug ? by.get(node.parent_slug) : null;
    if (parent && parent.parent_slug && depth < 3) parentId = ensure(parent, depth + 1); // أب هو قسم مش قسم رئيسي (مثال: فساتين أفراح تحت فساتين)
    const sort = (q.val('SELECT COALESCE(MAX(sort),-1)+1 FROM categories WHERE store_id=?', [storeId])) || 0;
    return insert('categories', { store_id: storeId, slug: catSlug, name_ar: node.name_ar, name_en: node.name_en, parent_id: parentId, system: 1, sort });
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
  [['women_sports', 'men_sports', 'sports'], ['رياضي', 'تراك', 'جيم', 'sport', 'training', 'gym', 'jersey', 'activewear']],
  [['women_pants', 'men_pants', 'denim'], ['جينز', 'denim', 'jeans', 'بنطلون', 'بنطال', 'pants']],
  [['women_dresses', 'women_tops', 'women_skirts', 'women'], ['حريمي', 'نسائي', 'فستان', 'بلوزه', 'تنوره', 'جيبه', 'women', 'ladies', 'dress', 'blouse', 'skirt']],
  [['men_tops', 'men'], ['رجالي', 'شبابي', 'men', 'mens', "men's", 'gents']],
];
const norm = (x) => String(x || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '');

/** Best-guess department for a product from its text, limited to the departments the store sells. Returns null when unsure. */
export function inferDepartment(text, allowed) {
  const t = norm(text);
  // Prefer an age-specific baby section over the generic boys/girls section. Without this,
  // a shop that sells both baby and girls' clothes files a "2Y baby romper" under girls.
  const available = new Set(allowed);
  if ([...available].some((slug) => slug === 'kids' || slug.startsWith('kids_'))) for (const slug of ['kids_newborn', 'kids_baby']) available.add(slug);
  const babyText = t
    .replace(/baby\s*-?\s*(?:doll|blue|pink)|بيبي\s*دول|بيبي\s*(?:بلو|بينك|بنك)/g, ' ');
  const babyTokens = babyText.replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ');
  const ranges = parseChildSizes(babyText);
  const hasNewbornCue = /(^| )(?:حديثي الولاده|حديث الولاده|مواليد|مولود(?:ه| جديد)?|newborn|new born|نيو ?بورن|نيوبورن)( |$)/.test(babyTokens);
  const hasBabyCue = /(^| )(?:رضيع|رضع|رضيعه|مولوده|للبيبي|بيبي|baby|babies|infant|toddler)( |$)/.test(babyTokens);
  // A size run that also reaches older children (e.g. 0-3M ... 14Y) is a general kids product, not a baby one;
  // and an adult-audience word in the text means "baby" is just part of the wording (baby blue, baby hand...).
  const adultCue = /(^| )(?:رجالي|رجال|حريمي|نسائي|شبابي|men|mens|women|womens|ladies|gents)( |$)/.test(babyTokens);
  const olderSizes = ranges.some((r) => r.minAgeMonths >= 36);
  const babyOk = !adultCue && !olderSizes;
  const newbornAge = babyOk && ranges.length > 0 && ranges.every((r) => r.maxAgeMonths <= 3);
  const babyAge = babyOk && (ranges.some((r) => r.minAgeMonths < 36 && r.maxAgeMonths < 36)
    || /(^| )(?:سن|عمر|لعمر)\s*(?:سنه|عام|واحد|واحده|١|1|سنتين|عامين|اتنين|اثنين|٢|2)( |$)/.test(babyTokens)
    || /(^| )(?:سنتين|عامين)( |$)/.test(babyTokens));
  if ((babyOk && hasNewbornCue) || newbornAge) {
    for (const slug of ['kids_newborn', 'kids_baby', 'kids']) if (available.has(slug)) return slug;
  }
  if ((babyOk && hasBabyCue) || babyAge) {
    for (const slug of ['kids_baby', 'kids_newborn', 'kids']) if (available.has(slug)) return slug;
  }
  for (const [slugs, words] of HINTS) {
    if (!words.some((w) => babyTokens.includes(norm(w)))) continue;
    if (adultCue && slugs[0].startsWith('kids')) continue;
    const hit = slugs.find((sl) => available.has(sl));
    if (hit) return hit;
  }
  return null;
}

/** True when the text lists a child size of 3 years or more (e.g. 4Y, 10Y, 14Y): such a product is not a baby/newborn one. */
export function hasOlderChildSizes(text) {
  return parseChildSizes(norm(text)).some((r) => r.minAgeMonths >= 36);
}

/**
 * Fills missing legacy departments and corrects only strongly identified baby/newborn misfilings.
 * - moves kids products with clear baby/newborn evidence into «رضع» / «حديثي الولادة»;
 * - moves a product OUT of those two when its sizes reach 3 years or older (it stays in the kids family);
 * - never touches products filed under a non-kids section.
 * `dryRun` changes nothing; `report` (array) receives {id, name, from, to} for every product that is (or would be) moved.
 */
export function backfillDepartments({ dryRun = false, report = null } = {}) {
  let n = 0;
  for (const s of q.all('SELECT id, departments FROM stores')) {
    const allowed = String(s.departments || '').split(',').filter(Boolean);
    const sellsKids = allowed.some((d) => d === 'kids' || d.startsWith('kids_'));
    if (!allowed.length) continue;
    const candidates = sellsKids
      ? q.all(`SELECT p.id, p.name_ar, p.name_en, p.description_ar, p.description_en, p.sizes_json, p.department,
                 c.name_ar AS cat_ar, c.name_en AS cat_en, GROUP_CONCAT(v.size, ' ') AS variant_sizes
               FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN variants v ON v.product_id=p.id
               WHERE p.store_id=? AND p.status='active' AND (
                 p.department IS NULL OR p.department IN ('kids','kids_boys','kids_girls','kids_baby','kids_newborn')
                 OR lower(coalesce(p.name_ar,'') || ' ' || coalesce(p.name_en,'') || ' ' || coalesce(p.description_ar,'') || ' ' || coalesce(p.description_en,'') || ' ' || coalesce(c.name_ar,'') || ' ' || coalesce(c.name_en,'')) LIKE '%رضع%'
                 OR lower(coalesce(p.name_ar,'') || ' ' || coalesce(p.name_en,'') || ' ' || coalesce(p.description_ar,'') || ' ' || coalesce(p.description_en,'') || ' ' || coalesce(c.name_ar,'') || ' ' || coalesce(c.name_en,'')) LIKE '%بيبي%'
                 OR lower(coalesce(p.name_ar,'') || ' ' || coalesce(p.name_en,'') || ' ' || coalesce(p.description_ar,'') || ' ' || coalesce(p.description_en,'') || ' ' || coalesce(c.name_ar,'') || ' ' || coalesce(c.name_en,'')) LIKE '%مواليد%'
                 OR lower(coalesce(p.name_en,'') || ' ' || coalesce(p.description_en,'')) LIKE '%baby%'
                 OR lower(coalesce(p.sizes_json,'')) LIKE '%year%' OR lower(coalesce(p.sizes_json,'')) LIKE '%month%' OR lower(coalesce(p.sizes_json,'')) LIKE '%1y%' OR lower(coalesce(p.sizes_json,'')) LIKE '%2y%' OR lower(coalesce(p.sizes_json,'')) LIKE '%0-3m%' OR lower(coalesce(p.sizes_json,'')) LIKE '%12-18m%' OR p.sizes_json LIKE '%سنة%' OR p.sizes_json LIKE '%شهر%'
                 OR EXISTS (SELECT 1 FROM variants av WHERE av.product_id=p.id AND (
                   lower(av.size) IN ('1y','2y','1 y','2 y','0-3m','3-6m','6-12m','12m','18m','24m','12-18m','12-24m','18-24m','1-2y')
                   OR lower(av.size) LIKE '%year%' OR lower(av.size) LIKE '%month%' OR av.size LIKE '%سنة%' OR av.size LIKE '%شهر%'))
               )
               GROUP BY p.id`, [s.id])
      : q.all("SELECT p.id, p.name_ar, p.name_en, p.description_ar, p.description_en, p.sizes_json, p.department, c.name_ar AS cat_ar, c.name_en AS cat_en, '' AS variant_sizes FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.store_id=? AND p.department IS NULL AND LENGTH(?) - LENGTH(REPLACE(?, ',', '')) > 2", [s.id, s.departments, s.departments]);
    for (const p of candidates) {
      const text = `${p.name_ar || ''} ${p.name_en || ''} ${p.description_ar || ''} ${p.description_en || ''} ${p.sizes_json || ''} ${p.variant_sizes || ''} ${p.cat_ar || ''} ${p.cat_en || ''}`;
      let d = inferDepartment(text, allowed);
      const inBaby = p.department === 'kids_baby' || p.department === 'kids_newborn';
      // A product filed under «رضع» / «حديثي الولادة» whose sizes reach older children goes back to the general kids section.
      const demote = inBaby && hasOlderChildSizes(text);
      if (demote) d = allowed.includes('kids') ? 'kids' : (['kids_boys', 'kids_girls'].find((x) => allowed.includes(x)) || null);
      if (!d) continue;
      const babyDept = d === 'kids_baby' || d === 'kids_newborn';
      if (p.department && !/^kids(_|$)/.test(p.department) && p.department !== d) continue; // never pull an adult-section product into kids
      if (p.department && !babyDept && p.department !== d && !demote) continue;
      if (p.department !== d) {
        if (report) report.push({ id: p.id, name: p.name_ar || p.name_en, from: p.department || null, to: d });
        if (dryRun) { n++; continue; }
        q.run('UPDATE products SET department=? WHERE id=?', [d, p.id]); n++;
        if (babyDept && !allowed.includes(d)) {
          allowed.push(d);
          q.run('UPDATE stores SET departments=? WHERE id=?', [`,${[...new Set(allowed)].join(',')},`, s.id]);
          ensureDeptCategories(s.id, [d]);
        }
      }
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

/** Profile of a department: its own, else the nearest ancestor's, else by root section, else the default. */
export const deptProfile = (slug) => inheritance().profile(slug);
/** Attribute definitions in effect for a department (inherited root -> node, child overrides). */
export const deptAttrDefs = (slug) => inheritance().attrs(slug);

/** Sections customers may see: not hidden, and either something in them (products / shops) or the admin said "show when empty". */
export const customerDepartments = () => listDepartments().filter((d) => d.visibility !== 'hidden' && (d.product_count > 0 || d.show_empty));
