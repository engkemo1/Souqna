/**
 * Smarter product search text handling (Arabic + English), used by /api/search, /api/search/suggest and the in-store search.
 *
 * What it fixes compared with the old "LIKE %word%" search:
 *  - spelling variants of the same thing: تيشرت / تيشيرت / تي شيرت, جاكت / جاكيت, بيجاما / بيجامه, لانجري / لانجيري
 *  - groups of words that mean the same: حديثي الولادة / مواليد / رضيع / بيبي, شبشب / صندل / سلايدر …
 *  - "ال" التعريف and plurals (الجاكيتات → جاكيت)
 *  - small typos (edit distance) against the words that really exist in the shop's product names
 *  - words match at the START of a word, not anywhere inside another word (so "حديث" no longer hits "الحديثة"…)
 *  - filler words (ملابس، لبس، عايز …) are ignored
 */

/** Characters folded the same way in JS and in SQL, so both sides always agree. */
export const FOLD_PAIRS = [['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'], ['ة', 'ه'], ['ى', 'ي'], ['ـ', ''], ['ئ', 'ي'], ['ؤ', 'و'], ['ڤ', 'ف'], ['-', ' '], ['/', ' '], ['_', ' '], ['.', ' '], ['(', ' '], [')', ' '], ['،', ' ']];
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/** Normalise free text the same way the SQL side does (plus diacritics / Arabic digits). */
export function norm(s) {
  let t = String(s ?? '').toLowerCase().replace(/[ً-ْٰ]/g, '').replace(/[٠-٩]/g, (d) => AR_DIGITS[d]);
  for (const [a, b] of FOLD_PAIRS) t = t.split(a).join(b);
  return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); // punctuation, quotes and emoji are just separators
}

/** A SQL expression that normalises a column like norm() does, then drops the Arabic article "ال" from every word and pads with spaces. */
export function sqlWords(col) {
  let e = `LOWER(COALESCE(${col},''))`;
  for (const [a, b] of FOLD_PAIRS) e = `REPLACE(${e},'${a}','${b}')`;
  return `REPLACE(' ' || ${e} || ' ',' ال',' ')`;
}

const stripAl = (w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w);
const stripAlPhrase = (p) => p.split(' ').map(stripAl).join(' ');
const wordNorm = (w) => stripAlPhrase(norm(w));

const STOP = new Set(['ملابس', 'لبس', 'هدوم', 'حاجه', 'حاجات', 'من', 'في', 'علي', 'عن', 'مع', 'ليا', 'لي', 'عايز', 'عاوز', 'عايزه', 'محتاج', 'محتاجه', 'ابغي', 'for', 'with', 'and', 'the', 'of', 'a', 'و']);

/**
 * Groups of words that mean (almost) the same thing in this shop's world. Each variant is a word or a phrase.
 * A leading "=" means "this whole word only" (so that "ولاد" does not also hit "ولادة").
 */
export const GROUPS = [
  // babies / newborns
  ['حديثي الولاده', 'حديث الولاده', 'حديثه الولاده', 'حديثي ولاده', 'مولود جديد', 'ولاده', 'مواليد', 'مولود', 'رضيع', 'رضع', 'رضاعه', 'بيبي', 'بيبيه', 'baby', 'newborn', 'new born', 'infant', 'سلوبيت', 'سليبينج', 'sleepsuit'],
  ['اطفال', 'اطفالي', 'طفل', 'طفلي', 'كيدز', 'kids', 'kid', 'children', 'صغار', 'صغير'],
  ['=ولد', '=اولاد', '=ولاد', 'ولادي', 'اولادي', 'boys', '=boy', 'ولدي'],
  ['=بنت', '=بنات', 'بناتي', 'بنتي', 'girls', '=girl', 'بناتيه'],
  ['رجالي', 'رجال', 'رجاليه', 'شبابي', 'men', 'mens', 'man'],
  ['حريمي', 'حريم', 'نسائي', 'نسايي', 'نسوي', 'ستاتي', 'women', 'womens', 'ladies', 'woman'],
  // tops
  ['تيشرت', 'تيشيرت', 'تي شيرت', 'تي-شيرت', 'تيشرتات', 'tshirt', 't shirt', 'tee', 'tees', 'tshirts'],
  ['سويت شيرت', 'سويتشيرت', 'سويشرت', 'سويتشرت', 'سوتشرت', 'سويت تيشرت', 'سويت تيشيرت', 'sweatshirt', 'sweat shirt'],
  ['هودي', 'هودى', 'هوديز', 'هوديه', 'hoodie', 'hoodies'],
  ['جاكيت', 'جاكت', 'جاكتات', 'جاكيتات', 'جكت', 'jacket', 'jackets', 'جيكت'],
  ['قميص', 'قمصان', 'قميصي', 'shirt', 'shirts'],
  ['بلوفر', 'بلوفرات', 'بلوفير', 'pullover', 'sweater', 'سويتر', 'سويترات', 'بولوفر', 'تريكو'],
  ['بلوزه', 'بلوزات', 'بلوزة', 'blouse', 'توب', 'top'],
  ['بدله', 'بدل', 'بدلات', 'بدلة', 'suit', 'suits', 'تايور'],
  ['فستان', 'فساتين', 'فستانات', 'dress', 'dresses', 'دريس', 'دريسات'],
  // bottoms
  ['بنطلون', 'بنطال', 'بنطلونات', 'بناطيل', 'بنطلونه', 'pants', 'pant', 'trouser', 'trousers', 'برمودا'],
  ['جينز', 'جنز', 'جينزات', 'دنيم', 'jeans', 'jean', 'denim', 'جينس', 'وايد ليج', 'وايت ليج'],
  ['شورت', 'شورتات', 'شورتس', 'short', 'shorts'],
  ['ترنج', 'ترينج', 'ترنجات', 'تراك', 'تراكسوت', 'tracksuit', 'sweatpants', 'سويت بانتس', 'سويتبانتس', 'جوجر', 'jogger', 'joggers'],
  ['شروال', 'سروال', 'شراويل', 'سراويل'],
  // night / home
  ['بيجامه', 'بيجاما', 'بجامه', 'بجاما', 'بيجامات', 'بيجامة', 'pijama', 'pajama', 'pyjama', 'pajamas', 'لبس نوم', 'ملابس نوم', 'قميص نوم', 'nightwear', 'sleepwear'],
  ['لانجيري', 'لانجري', 'لانجيرى', 'لنجري', 'لانجيريه', 'lingerie', 'لانجرى'],
  ['روب', 'روبات', 'روب حمام', 'robe', 'bathrobe', 'برنس'],
  // underwear / socks
  ['بوكسر', 'بوكسرات', 'بوكسرز', 'boxer', 'boxers', 'brief', 'briefs', 'سليب', 'لباس', 'كلوت'],
  ['ملابس داخليه', 'لبس داخلي', 'داخلي', 'داخليه', 'underwear', 'innerwear'],
  ['شراب', 'شرابات', 'جوارب', 'جورب', 'شرابه', 'socks', 'sock'],
  ['فانله', 'فنله', 'فانلات', 'undershirt', 'camisole', 'حماله'],
  // shoes
  ['كوتشي', 'كوتش', 'كوتشيات', 'كوتشى', 'حذاء', 'احذيه', 'جزمه', 'جزم', 'جزمات', 'حذيه', 'shoe', 'shoes', 'sneaker', 'sneakers', 'كوتشيهات'],
  ['شبشب', 'شباشب', 'صندل', 'صنادل', 'سلايدر', 'سلايد', 'slipper', 'slippers', 'sandal', 'sandals', 'slide', 'slides', 'بنوار', 'زنوبه', 'نعل'],
  ['بوت', 'بوتات', 'بوتس', 'boot', 'boots', 'هاف بوت', 'هاف'],
  ['كعب', 'كعوب', 'heel', 'heels', 'ستيليتو', 'حذاء كعب'],
  // religious / modest
  ['طرحه', 'طرح', 'حجاب', 'حجابات', 'طرحات', 'هيجاب', 'hijab', 'ايشارب', 'اسكارف', 'scarf', 'شال', 'شالات', 'وشاح'],
  ['عبايه', 'عبايات', 'عباءه', 'عباية', 'abaya'],
  ['اسدال', 'اسدالات', 'إسدال', 'اسدل', 'صلاه', 'لبس صلاه', 'ملابس صلاه', 'prayer'],
  ['جلابيه', 'جلاليب', 'جلابيات', 'جلابية', 'galabiya', 'jalabiya', 'galabeya', 'جلباب', 'قفطان', 'قفاطين', 'كفتان'],
  // bags / accessories
  ['شنطه', 'شنط', 'حقيبه', 'حقايب', 'حقائب', 'bag', 'bags', 'شنطة', 'كروس', 'باك باك', 'backpack', 'محفظه', 'wallet', 'clutch'],
  ['حزام', 'احزمه', 'حزام جلد', 'belt', 'belts'],
  ['كرافته', 'كرافت', 'كرافتات', 'ربطه عنق', 'tie', 'ties', 'papillon', 'فيونكه', 'ببيون', 'ببيوت'],
  ['ساعه', 'ساعات', 'watch', 'watches'],
  ['نظاره', 'نظارات', 'نضاره', 'عوينات', 'sunglasses', 'glasses', 'نضارات'],
  ['كاب', 'قبعه', 'طاقيه', 'طواقي', 'قبعات', 'cap', 'hat', 'hats', 'caps', 'bucket', 'بيريه'],
  ['كوفيه', 'كوفيات', 'سكارف', 'فولار', 'fular'],
  // fabrics / extras
  ['قطيفه', 'قطيفة', 'مخمل', 'velvet'],
  ['ستان', 'ساتان', 'satin', 'حرير', 'silk'],
  ['شيفون', 'chiffon', 'كريب', 'crepe'],
  ['فرو', 'فور', 'fur', 'فرو صناعي', 'مبطن فرو', 'شيربا', 'sherpa'],
  ['رقص', 'بدلة رقص', 'بدل رقص', 'دانس', 'dance', 'بدله رقص', 'حزام رقص', 'رقاصه', 'شرقي'],
  ['زفاف', 'عروسه', 'عروس', 'بريدال', 'bridal', 'wedding', 'فرح', 'خطوبه', 'كتب كتاب'],
  ['سهره', 'سواريه', 'soire', 'soiree', 'evening', 'party', 'حفله', 'مناسبات', 'خروج'],
  ['بطانيه', 'بلانكيت', 'blanket', 'دفايه', 'لحاف', 'كوفرته', 'ملايه', 'مفرش', 'منامه'],
  ['ماكياج', 'مكياج', 'makeup', 'foundation', 'فاونديشن', 'كونتور', 'روج', 'مسكره', 'نارس', 'nars'],
  ['سوت', 'سوتات', 'set', 'طقم', 'اطقم', 'اطقمه', 'تواب'],
  ['رياضي', 'رياضه', 'sport', 'sports', 'اسبورت', 'sportswear', 'جيم', 'gym'],
  ['شتوي', 'شتويه', 'شتا', 'winter', 'ثقيل', 'دافي', 'دفا', 'مبطن'],
  ['صيفي', 'صيفيه', 'صيف', 'summer', 'خفيف'],
  ['مايوه', 'مايو', 'بيكيني', 'swimsuit', 'swimwear'],
];

const prep = () => {
  const groups = GROUPS.map((g) => g.map((v) => {
    const text = wordNorm(v.startsWith('=') ? v.slice(1) : v);
    const exact = v.startsWith('=') || (text.length <= 3 && !text.includes(' ')); // very short words must match as a whole word ("كاب" is not "كابلز")
    return { text, exact };
  }).filter((v) => v.text));
  const byWord = new Map(); // single normalised word → group indexes
  const phrases = []; // multi-word variants (matched inside the query text)
  groups.forEach((g, gi) => g.forEach((v) => {
    if (v.text.includes(' ')) phrases.push({ text: v.text, gi });
    else { const set = byWord.get(v.text) || new Set(); set.add(gi); byWord.set(v.text, set); }
  }));
  phrases.sort((a, b) => b.text.length - a.text.length);
  return { groups, byWord, phrases };
};
const P = prep();

const altKey = (a) => (a.exact ? `=${a.text}` : a.text);

/** Edit distance (Damerau-Levenshtein light) with an early exit above `max`. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = []; let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] ?? 99) + 1);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2.length = 0; prev2.push(...prev); prev = cur;
  }
  return prev[b.length];
}

/** Word variants a single typed word can also be written as (final ا/ه, simple plurals). */
function spellingVariants(w) {
  const out = new Set([w]);
  if (w.length >= 4) {
    if (w.endsWith('ا')) out.add(`${w.slice(0, -1)}ه`);
    if (w.endsWith('ه')) out.add(`${w.slice(0, -1)}ا`);
  }
  if (w.length >= 5 && w.endsWith('ات')) { out.add(w.slice(0, -2)); out.add(`${w.slice(0, -2)}ه`); }
  if (w.length >= 5 && w.endsWith('ين')) out.add(w.slice(0, -2));
  if (w.length >= 5 && w.endsWith('ون')) out.add(w.slice(0, -2));
  return [...out];
}

/**
 * Turn what the customer typed into search tokens. Each token has `alts`: the typed word first, then everything that should also match.
 * `vocab` (optional) is a Map(word → count) of the words really used in product names, used to repair typos.
 */
export function buildQuery(term, { vocab = null, prefix = false } = {}) {
  let text = norm(String(term ?? '').slice(0, 80));
  if (!text) return { tokens: [], text: '' };
  text = text.split(' ').map(stripAl).join(' ');
  const tokens = [];
  // 1. multi-word phrases first ("حديثي الولاده", "تي شيرت", "لبس نوم")
  const usedGroups = new Set();
  let rest = ` ${text} `;
  for (const ph of P.phrases) {
    const needle = ` ${ph.text} `;
    if (rest.includes(needle) && !usedGroups.has(ph.gi)) {
      usedGroups.add(ph.gi);
      rest = rest.replace(needle, ' ');
      tokens.push({ raw: ph.text, group: ph.gi });
    }
  }
  const words = rest.split(' ').filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w)));
  for (const w of kept.slice(0, 6)) tokens.push({ raw: w });
  // groups from phrases and single words
  const out = [];
  const seenGroups = new Set();
  for (const tk of tokens) {
    const alts = new Map(); // key → alt
    const add = (text2, exact = false) => { if (text2) alts.set(exact ? `=${text2}` : text2, { text: text2, exact }); };
    const typedAlts = tk.group !== undefined ? [] : spellingVariants(tk.raw);
    for (const t of typedAlts) add(t, !prefix && t.length <= 3); // (while typing in the search box, a short word is just the start of a longer one) a short typed word (not in a group) also has to match as a whole word
    if (tk.group !== undefined) add(tk.raw);
    const gis = tk.group !== undefined ? new Set([tk.group]) : (P.byWord.get(tk.raw) || new Set());
    // a typed word also joins groups through its spelling variants (جاكيتات → جاكيت)
    if (tk.group === undefined) for (const t of typedAlts) for (const gi of P.byWord.get(t) || []) gis.add(gi);
    for (const gi of gis) for (const v of P.groups[gi]) add(v.text, v.exact);
    // typo repair against the real vocabulary, only for words that match nothing known
    if (vocab && tk.group === undefined && !gis.size && tk.raw.length >= 3 && /[؀-ۿa-z]/.test(tk.raw)) {
      let known = false;
      for (const w of vocab.keys()) { if (w.startsWith(tk.raw)) { known = true; break; } }
      if (!known) {
        const max = tk.raw.length <= 3 ? 0 : tk.raw.length <= 6 ? 1 : 2;
        if (max > 0) {
          const cands = [];
          for (const [w, n] of vocab) {
            if (w.length < 3 || Math.abs(w.length - tk.raw.length) > max) continue;
            const d = editDistance(tk.raw, w, max);
            if (d <= max) cands.push({ w, d, n });
          }
          cands.sort((a, b) => a.d - b.d || b.n - a.n);
          for (const c of cands.slice(0, 3)) { add(c.w); for (const gi of P.byWord.get(c.w) || []) for (const v of P.groups[gi]) add(v.text, v.exact); }
          if (cands.length) tk.fuzzy = true;
        }
      }
    }
    for (const [k, a] of [...alts]) if (!a.exact && alts.has(`=${a.text}`)) alts.delete(k); // "ولاد" must not also hit "ولادة"
    const list = [...alts.values()].slice(0, 40);
    const key = list.map(altKey).sort().join('|');
    if (tk.group !== undefined || gis.size) { if (seenGroups.has(key)) continue; seenGroups.add(key); }
    out.push({ raw: tk.raw, alts: list, fuzzy: !!tk.fuzzy, groups: [...gis] });
  }
  return { tokens: out, text, onlyFiller: !out.length && words.length > 0 && words.every((w) => STOP.has(w)) };
}

/** Words that describe a product rather than say what it is. If nothing matches them together with the type, they are dropped first. */
const SOFT_WORDS = new Set(['اسود', 'ابيض', 'احمر', 'ازرق', 'اخضر', 'اصفر', 'بيج', 'رمادي', 'بني', 'وردي', 'برتقالي', 'بنفسجي', 'كحلي', 'نبيتي', 'بمبي', 'فضي', 'دهبي', 'ذهبي', 'جلد', 'قطن', 'صوف', 'كتان', 'لينن', 'بوليستر', 'جينز مستورد', 'مستورد', 'تركي', 'جديد', 'احدث', 'شيك', 'حلو', 'جميل', 'رخيص', 'غالي', 'كبير', 'صغير', 'سايز', 'مقاس', 'مقاسات', 'black', 'white', 'red', 'blue', 'green', 'beige', 'brown', 'pink', 'yellow']);
const SOFT_GROUPS = new Set(GROUPS.map((g, i) => ({ g, i })).filter(({ g }) => g.some((v) => ['رجالي', 'حريمي', 'اطفال', '=ولد', '=بنت'].includes(v))).map(({ i }) => i));
const isSoft = (tk) => SOFT_WORDS.has(tk.raw) || (tk.groups || []).some((gi) => SOFT_GROUPS.has(gi));

/** Pre-compute the searchable text of a product row once (cached by the caller). */
export function prepareRow(r) {
  const words = (t) => ` ${norm(t).split(' ').map(stripAl).join(' ')} `;
  return {
    id: r.id, department: r.department || null, category: r.category_id ?? null, store: r.store_id ?? null,
    name: words(`${r.name_ar || ''} ${r.name_en || ''}`),
    desc: words(`${r.description_ar || ''} ${r.description_en || ''} ${r.badge_text || ''}`),
  };
}

const has = (hay, alt) => (alt.exact ? hay.includes(` ${alt.text} `) : hay.includes(` ${alt.text}`));

/**
 * Find the products matching the tokens. `lookup` = { depts, cats, stores } (arrays of {slug|id, names…}) so a word like "حذاء" also finds
 * everything filed under that section. The search starts strict and widens only when nothing matches:
 *   1 every word in a name / section / category / store · 2 …or in a description · 3 drop the "describing" words (colour, material, who it is for)
 *   · 4 at least one word.
 * Returns { level, hits: [{id, score}] } best first.
 */
export function matchProducts(tokens, rows, lookup) {
  if (!tokens.length) return { level: 1, hits: [] };
  const sets = tokens.map((tk) => tk.alts.map((alt) => {
    const nm = (list, key, cols) => new Set(list.filter((r) => cols.some((c) => r[c] && has(` ${norm(r[c]).split(' ').map(stripAl).join(' ')} `, alt))).map((r) => r[key]));
    return { alt, depts: nm(lookup.depts, 'slug', ['name_ar', 'name_en', 'slug']), cats: nm(lookup.cats, 'id', ['name_ar', 'name_en']), stores: nm(lookup.stores, 'id', ['name_ar', 'name_en']) };
  }));
  const hit = (row, ti) => { // best score of token ti on this row: [primary score, description score]
    let best = 0; let desc = 0;
    sets[ti].forEach((st, idx) => {
      if (has(row.name, st.alt)) best = Math.max(best, idx === 0 ? 13 : 10);
      else if (row.department && st.depts.has(row.department)) best = Math.max(best, 7);
      else if (row.category !== null && st.cats.has(row.category)) best = Math.max(best, 6);
      else if (row.store !== null && st.stores.has(row.store)) best = Math.max(best, 3);
      if (has(row.desc, st.alt)) desc = Math.max(desc, 2);
    });
    return [best, desc];
  };
  const scored = rows.map((row) => ({ id: row.id, per: tokens.map((_, ti) => hit(row, ti)) }));
  const total = (x) => x.per.reduce((a, [b, d]) => a + (b || d), 0);
  const run = (level) => {
    const soft = tokens.map(isSoft);
    const core = soft.some((x) => !x) ? soft.map((x) => !x) : soft.map(() => true);
    return scored.filter((x) => {
      if (level === 1) return x.per.every(([b]) => b > 0);
      if (level === 2) return x.per.every(([b, d]) => b > 0 || d > 0);
      if (level === 3) return soft.some(Boolean) && x.per.every(([b, d], i) => !core[i] || b > 0 || d > 0);
      return x.per.some(([b, d]) => b > 0 || d > 0);
    }).map((x) => ({ id: x.id, score: total(x) + (level === 4 ? 0 : 0) }));
  };
  for (let level = 1; level <= 4; level++) {
    if (level === 4 && tokens.length < 2) break;
    const hits = run(level);
    if (hits.length) return { level, hits: hits.sort((a, b) => b.score - a.score) };
  }
  return { level: 4, hits: [] };
}

/** The words (≥3 letters) used in a list of product / section names, with how often each appears. */
export function vocabFrom(texts) {
  const m = new Map();
  for (const t of texts) {
    for (const w of norm(t).split(' ')) {
      const x = stripAl(w);
      if (x.length < 3 || /^\d+$/.test(x)) continue;
      m.set(x, (m.get(x) || 0) + 1);
    }
  }
  return m;
}

/**
 * "Did you mean": for words that are not in the shop's vocabulary, the closest real word (by edit distance, most common wins ties).
 * Returns the corrected text, or null when nothing needed or nothing close was found.
 */
export function suggestCorrection(term, vocab) {
  const words = norm(String(term || '').slice(0, 80)).split(' ').filter(Boolean).slice(0, 6);
  if (!words.length || !vocab?.size) return null;
  let changed = false;
  const out = words.map((w) => {
    const x = stripAl(w);
    if (x.length < 3 || /^\d+$/.test(x) || vocab.has(x) || STOP.has(x)) return w;
    const max = x.length >= 6 ? 2 : 1;
    let best = null; let bestD = max + 1; let bestN = 0;
    for (const [cand, n] of vocab) {
      if (Math.abs(cand.length - x.length) > max) continue;
      const d = editDistance(x, cand, max);
      if (d < bestD || (d === bestD && n > bestN)) { best = cand; bestD = d; bestN = n; }
    }
    if (best && bestD <= max) { changed = true; return best; }
    return w;
  });
  return changed ? out.join(' ') : null;
}
