/**
 * Tidies the section tree shown when a store adds a product (nothing is deleted, products are never touched).
 *  1. HIDES (visibility='hidden') sub-sections that are empty AND used by no store: the 3rd level (types under a section) and the
 *     very detailed beauty/perfume items. A section whose children are all hidden becomes a normal pick (e.g. "بناطيل وجينز").
 *     Hidden sections can be turned back on any time from the admin section editor.
 *  2. ADDS a main section "هدايا" with 4 simple sub-sections (only if it does not exist).
 *
 *   docker compose exec app sh -c "node --no-warnings /app/server/src/scripts/tidy-departments.js"            (shows the plan, changes nothing)
 *   docker compose exec app sh -c "APPLY=1 node --no-warnings /app/server/src/scripts/tidy-departments.js"     (applies)
 * Then: docker compose restart app
 */
import { q, insert } from '../db/index.js';
import { productCounts } from '../lib/departments.js';

const APPLY = !!process.env.APPLY;
const rows = q.all("SELECT id, slug, name_ar, parent_slug, active, COALESCE(visibility,'visible') AS visibility FROM departments");
const by = new Map(rows.map((r) => [r.slug, r]));
const counts = productCounts();
const levelOf = (r) => { let n = 0; for (let c = by.get(r.parent_slug), i = 0; c && i < 10; c = by.get(c.parent_slug), i++) n++; return n; };
const storesUsing = (slug) => q.val("SELECT COUNT(*) FROM stores s WHERE s.departments LIKE '%,' || ? || ',%'", [slug]) || 0;

// أنواع بتفيد تويلا والبحث حتى لو فاضية: متتخفيش
const KEEP = /(^|_)(evening|wedding|casual_dresses|sneakers|heels|formal|boots|sandals|flats|jeans|trousers|shirts|tshirts|polo|blouses|suits)(_|$)/;
// تفاصيل مكياج/عطور زيادة عن اللزوم (بتتخفي لو فاضية)
const BEAUTY_DETAIL = /^(beauty_(concealer|blush|highlighter|lipgloss|eyeliner|brows|brushes))$/; // بنسيب: فاونديشن، بودرة، روج، ماسكارا، آيشادو، أدوات، عناية

const hide = [];
for (const r of rows) {
  if (r.visibility === 'hidden') continue;
  const own = counts.get(r.slug) || 0;
  if (own > 0 || storesUsing(r.slug) > 0) continue;
  const lvl = levelOf(r);
  if ((lvl >= 2 && !KEEP.test(r.slug)) || BEAUTY_DETAIL.test(r.slug)) hide.push({ ...r, lvl });
}

const GIFTS = [['gifts', 'هدايا', 'Gifts', null], ['gift_boxes', 'بوكسات هدايا', 'Gift boxes', 'gifts'], ['gift_flowers', 'ورد وبوكيهات', 'Flowers & bouquets', 'gifts'], ['gift_sets', 'أطقم هدايا', 'Gift sets', 'gifts'], ['gift_kids', 'هدايا أطفال', 'Kids gifts', 'gifts']];
const addGifts = GIFTS.filter(([slug]) => !by.has(slug));

console.log(`Sub-sections to hide (${hide.length}):`);
for (const h of hide) console.log(`  L${h.lvl} ${h.slug}  "${h.name_ar}"`);
console.log(`Sections to add (${addGifts.length}): ${addGifts.map((g) => g[1]).join('، ') || 'none (already there)'}`);
if (!APPLY) { console.log('\nDry run — nothing changed. Run with APPLY=1 to apply.'); process.exit(0); }
for (const h of hide) q.run("UPDATE departments SET visibility='hidden' WHERE id=?", [h.id]);
let sort = q.val('SELECT COALESCE(MAX(sort),0)+1 FROM departments');
for (const [slug, ar, en, parent] of addGifts) insert('departments', { slug, name_ar: ar, name_en: en, sizes_json: '[]', sort: sort++, active: 1, parent_slug: parent, visibility: 'visible' });
console.log(`Done: ${hide.length} hidden, ${addGifts.length} added. Restart the app: docker compose restart app`);
process.exit(0);
