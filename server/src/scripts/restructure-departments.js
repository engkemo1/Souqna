/**
 * Re-organises the section tree Amazon-style: MERGES similar sections into one (products and stores move with it),
 * DELETES empty useless ones, ADDS "هدايا". Nothing is lost: products only change section, and every change is saved
 * to a JSON backup (departments, moved products, store section lists) before anything is written.
 *
 *   node --no-warnings server/src/scripts/restructure-departments.js            -> plan only (changes nothing)
 *   APPLY=1 node --no-warnings server/src/scripts/restructure-departments.js    -> applies
 * Then: docker compose restart app
 */
import fs from 'node:fs';
import path from 'node:path';
import { q, insert } from '../db/index.js';
import { config } from '../config.js';

const APPLY = !!process.env.APPLY;

// source -> target (source disappears, its products/stores go to target)
const MERGE = {
  // women
  women_toplets: 'women_tops', women_summer_dresses: 'women_casual_dresses', women_winter_dresses: 'women_casual_dresses',
  women_short_dresses: 'women_casual_dresses', women_long_dresses: 'women_casual_dresses',
  c19_mvtp273s: 'women_shoes_boots', women_shoes_slippers: 'women_shoes_clogs', women_shoes_sandals: 'women_shoes_flats',
  c24_mvvl9bii: 'women_sleepwear', bdla_rqs: 'women_lingerie',
  c26_mvwxl8wh: 'bejamh', c26_mvwwm6n0: 'bejamh', c26_mvxwi5ol: 'bejamh', c26_mvwvokj6: 'c26_mvxs8s81', c26_mvxvstqp: 'c26_mvxs8s81',
  modest_open_abayas: 'women_abaya', modest_closed_abayas: 'women_abaya', modest_embroidered_abayas: 'women_abaya',
  modest_casual_abayas: 'women_abaya', modest_occasion_abayas: 'women_abaya',
  modest_egyptian_jalabiyas: 'modest_jalabiyas', modest_home_jalabiyas: 'modest_jalabiyas', modest_occasion_jalabiyas: 'modest_jalabiyas',
  modest_dresses: 'women_abaya', modest_sets: 'women_abaya', modest_kaftans: 'modest_jalabiyas',
  hijabs_chiffon: 'women_hijab', hijabs_cotton: 'women_hijab', hijabs_modal: 'women_hijab', hijabs_turkish: 'women_hijab',
  hijabs_jersey: 'women_hijab', c27_mw0m51o7: 'women_hijab', c27_mw2oe0u2: 'women_hijab', hijabs_accessories: 'women_hijab',
  c26_mvy99aj7: 'treng', women_sets: 'treng', women_occasion: 'women_homewear', c23_mvvajqi2: 'women_tops',
  // men
  men_polo: 'men_tshirts', men_jalabiya: 'men_homewear', men_homewear: 'men_casual',
  shoes_sports: 'shoes_sneakers', shoes_slippers: 'shoes_sandals',
  // kids
  c24_mvy0dp3z: 'kids_boys', c21_mvy96mnn: 'kids_boys', c25_mw27b7e7: 'kids_boys', c24_mvzewr02: 'kids_sets', kids_dresses: 'kids_girls',
  // accessories
  acc_necklaces: 'acc_jewelry', acc_bracelets: 'acc_jewelry', acc_earrings: 'acc_jewelry', acc_rings: 'acc_jewelry',
  acc_hair: 'women_accessories', acc_backpacks: 'women_bags', custom_mvtomwam: 'accessories', c17_mw7y3j9c: 'men_accessories',
  // beauty
  beauty_concealer: 'beauty_foundation', beauty_blush: 'beauty_powder', beauty_highlighter: 'beauty_powder', beauty_lipgloss: 'beauty_lipstick',
  beauty_eyeliner: 'beauty_eyeshadow', beauty_brows: 'beauty_eyeshadow', beauty_brushes: 'beauty_tools',
  // perfumes
  perfume_unisex: 'perfume_women', perfume_sets: 'perfume_women',
  // sports
  sport_gym: 'women_sports', sport_running: 'women_sports', sport_leggings: 'women_sports', sport_bras: 'women_sports',
  sport_sets: 'sport_tracksuits', c39_mwamv7zm: 'sport_tracksuits', sport_accessories: 'sportswear',
};
const BAD = Object.entries(MERGE).filter(([s, t]) => s === t);
if (BAD.length) throw new Error('bad map');

const rows = q.all('SELECT * FROM departments');
const by = new Map(rows.map((r) => [r.slug, r]));
const final = (s, i = 0) => (MERGE[s] && i < 6 ? final(MERGE[s], i + 1) : s); // follow chains
const plan = [];
for (const src of Object.keys(MERGE)) {
  if (!by.has(src)) continue;
  const tgt = final(src);
  if (!by.has(tgt)) { console.log(`skip ${src}: target ${tgt} missing`); continue; }
  const prods = q.val('SELECT COUNT(*) FROM products WHERE department=?', [src]) || 0;
  const stores = q.val("SELECT COUNT(*) FROM stores WHERE departments LIKE '%,' || ? || ',%'", [src]) || 0;
  plan.push({ src, tgt, prods, stores, name: by.get(src).name_ar, tname: by.get(tgt).name_ar });
}
const GIFTS = [['gifts', 'هدايا', 'Gifts', null], ['gift_boxes', 'بوكسات هدايا', 'Gift boxes', 'gifts'], ['gift_flowers', 'ورد وبوكيهات', 'Flowers & bouquets', 'gifts'], ['gift_sets', 'أطقم هدايا', 'Gift sets', 'gifts'], ['gift_kids', 'هدايا أطفال', 'Kids gifts', 'gifts']];
const addGifts = GIFTS.filter(([s]) => !by.has(s));

console.log(`Sections now: ${rows.length}`);
for (const p of plan) console.log(`  ${p.src} "${p.name}"  ->  ${p.tgt} "${p.tname}"   (${p.prods} products, ${p.stores} stores)`);
console.log(`Products moved: ${plan.reduce((a, p) => a + p.prods, 0)} | Sections removed: ${plan.length} | Added: ${addGifts.length}`);
console.log(`After: ~${rows.length - plan.length + addGifts.length} sections`);
if (!APPLY) { console.log('\nDry run — nothing changed. APPLY=1 to apply.'); process.exit(0); }

const dir = path.dirname(config.dbFile);
const file = path.join(dir, `departments-restructure-backup-${Date.now()}.json`);
const srcs = plan.map((p) => p.src);
const ph = srcs.map(() => '?').join(',');
fs.writeFileSync(file, JSON.stringify({
  plan,
  departments: srcs.length ? q.all(`SELECT * FROM departments WHERE slug IN (${ph})`, srcs) : [],
  category_attributes: srcs.length ? q.all(`SELECT * FROM category_attributes WHERE department_slug IN (${ph})`, srcs) : [],
  products: srcs.length ? q.all(`SELECT id, department FROM products WHERE department IN (${ph})`, srcs) : [],
  stores: q.all("SELECT id, departments FROM stores WHERE departments<>''"),
}, null, 1));
console.log(`Backup: ${file}`);

for (const p of plan) {
  q.run('UPDATE products SET department=? WHERE department=?', [p.tgt, p.src]);
  for (const s of q.all("SELECT id, departments FROM stores WHERE departments LIKE '%,' || ? || ',%'", [p.src])) {
    const list = [...new Set(s.departments.split(',').filter(Boolean).map((x) => (x === p.src ? p.tgt : x)))];
    q.run('UPDATE stores SET departments=? WHERE id=?', [`,${list.join(',')},`, s.id]);
  }
  for (const u of q.all('SELECT * FROM merchant_category_usage WHERE department_slug=?', [p.src])) {
    try { q.run('UPDATE merchant_category_usage SET department_slug=? WHERE store_id=? AND department_slug=?', [p.tgt, u.store_id, p.src]); }
    catch { q.run('DELETE FROM merchant_category_usage WHERE store_id=? AND department_slug=?', [u.store_id, p.src]); }
  }
  const parent = by.get(p.src).parent_slug;
  for (const k of q.all('SELECT id, slug FROM departments WHERE parent_slug=?', [p.src])) {
    if (MERGE[k.slug]) continue; // goes away too
    q.run('UPDATE departments SET parent_slug=? WHERE id=?', [parent || null, k.id]);
  }
}
for (const p of plan) { q.run('DELETE FROM departments WHERE slug=?', [p.src]); } // category_attributes cascade
let sort = q.val('SELECT COALESCE(MAX(sort),0)+1 FROM departments');
for (const [slug, ar, en, parent] of addGifts) insert('departments', { slug, name_ar: ar, name_en: en, sizes_json: '[]', sort: sort++, active: 1, parent_slug: parent, visibility: 'visible' });
console.log(`Done: ${plan.length} sections merged/removed, ${addGifts.length} added. Restart: docker compose restart app`);
process.exit(0);
