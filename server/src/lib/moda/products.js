/**
 * تحليل المنتجات: من اسم المنتج ووصفه وتصنيفه نطلع: نوع القطعة، درجة الرسمية، الفئة (رجال/ست/أطفال)،
 * الألوان، الخامة، والمخزون. كله بقواعد من ملفات المعرفة، بدون موديل.
 */
import { norm, tokenize, tokenVariants } from './text.js';
import { loadKnowledge } from './knowledge.js';
import { matchTokens } from './parse.js';

const WEAK_KEYS = new Set(['top', 'tunic', 'shoes_any', 'dress_any']);
const GENERIC_KEYS = new Set(['trousers', 'jacket', 'shirt', 'tshirt']);
// "wrap" can mean a shawl, but in catalogue names like "wrap jacket" it must
// not override the explicit garment noun. Keep the alias for standalone wraps.
const AMBIGUOUS_ALIASES = new Set(['shawl:wrap', 'sneakers:كوتش', 'sneakers:coach']);
// short aliases that must match the exact word only: "روب" (robe) would otherwise also match "كروب" (crop top) through the prefix rule
const EXACT_ONLY_ALIASES = new Set(['robe:روب']);
const SHOE_KEYS = new Set(['sneakers', 'formal_shoes', 'loafers', 'heels_low', 'heels_high', 'flats', 'sandals', 'boots', 'slippers', 'sport_shoes', 'shoes_any']);
const SNEAKER_NAME_RE = /(sneaker|trainers?\b|running shoe|sport shoe|كوتش|كوتشي|حذاء رياضي|جزمه رياضه|جزمة رياضة)/i;
const OUTERWEAR_WORDS = new Set(['جاكيت', 'جاكت', 'جواكت', 'jacket', 'bomber', 'معطف', 'بالطو', 'بليزر', 'blazer']);

let aliasTable = null;
function table(K) {
  if (aliasTable && aliasTable.K === K) return aliasTable;
  const rows = [];
  let order = 0;
  for (const [key, aliases] of Object.entries(K.synonyms.garments)) {
    for (const a of aliases) { const t = tokenize(norm(a)); if (t.length) rows.push({ key, tokens: t, order: order++ }); }
  }
  aliasTable = { K, rows };
  return aliasTable;
}

const hasToken = (set, tok) => tokenVariants(tok).some((v) => set.has(v));

/** كلمات حاسمة: الاسم اللي فيه كفلينج/روب/لانجري/قميص نوم مستحيل يبقى قميص/فستان مهما كان معاه. */
const FORCE_RULES = [
  ['cufflinks', /(^|\s)(كافلينج|كفلينج|كافلينك|كفلينك|كافلنج|كفلنج|كفلينجز|ازرار اكمام|زرار قميص|ازرار قميص|زراير قميص)(\s|$)|\b(cufflinks?|cuff links?)\b/i],
  ['lingerie', /(^|\s)(لانجيري|لانجري|لينجري|لانجريه|لانجيريه|بيبي دول)(\s|$)|\b(lingerie|babydoll|baby doll)\b/i],
  ['sleepwear', /(^|\s)(قميص نوم|قمصان نوم|فستان نوم|لبس نوم|ملابس نوم|بيجامه|بيجاما|بجامه|بجاما|بيجامات)(\s|$)|\b(nightgown|nightwear|sleepwear|pajamas?|pyjamas?)\b/i],
  ['robe', /(^|\s)(روب|ارواب|رواب|برنس|برنس حمام)(\s|$)|\b(robe|bathrobe|dressing gown)\b/i],
  ['underwear', /(^|\s)(فانله|فانلة|فانلات|بوكسر|بوكسرات|سليب|ملابس داخليه|ملابس داخلية|لبس داخلي|تيشرت داخلي|تيشيرت داخلي|شورت داخلي|بنطلون داخلي|سوتيان|بدي داخلي)(\s|$)|\b(underwear|undershirt|boxers?|briefs|bra)\b/i],
];
// صفات بتتغلب على اسم القطعة الصريح لو اتساوت: بنقلل وزنها بقوة
const ALIAS_PENALTY = { 'sweater:اوفر سايز': 14, 'sweater:اوفرسايز': 14, 'sweater:oversize': 14, 'sweater:تريكو': 6, 'sweater:knit': 6, 'joggers:ميلتون': 6, 'dress_evening:سهره': 6, 'dress_evening:ماكسي': 6, 'dress_party:سواريه': 6, 'dress_party:كوكتيل': 6, 'bow_tie:فراشه': 6, 'tote:توت': 6 };
const SHORT_NEXT = new Set(['sleeve', 'sleeves', 'sleeved', 'dress', 'jacket', 'coat', 'boot', 'boots', 'top', 'shirt', 'skirt', 'cardigan', 'heel', 'heels']);

/** نوع القطعة من النص (اسم + تصنيف): أطول alias مكتمل، مع تفضيل الأقدم موضعًا. */
export function inferKey(text, K = loadKnowledge()) {
  const cleaned = norm(text || '');
  for (const [key, re] of FORCE_RULES) if (K.items.has(key) && re.test(cleaned)) return key;
  const tokens = tokenize(norm(text)); const set = new Set(tokens);
  const pos = new Map(); tokens.forEach((t, i) => { for (const v of tokenVariants(t)) if (!pos.has(v)) pos.set(v, i); });
  const hasOuterwear = [...OUTERWEAR_WORDS].some((w) => hasToken(set, w));
  let best = null;
  for (const row of table(K).rows) {
    if (hasOuterwear && SHOE_KEYS.has(row.key)) continue;
    if (EXACT_ONLY_ALIASES.has(`${row.key}:${row.tokens.join(' ')}`) && !row.tokens.every((t) => set.has(t))) continue;
    if (!row.tokens.every((t) => hasToken(set, t) || [...set].some((s) => tokenVariants(s).includes(t)))) continue;
    const first = Math.min(...row.tokens.map((t) => pos.get(t) ?? 99));
    const aliasId = `${row.key}:${row.tokens.join(' ')}`;
    if (row.key === 'shorts' && aliasId === 'shorts:short' && SHORT_NEXT.has(tokens[tokens.indexOf('short') + 1])) continue;
    const ambiguous = ALIAS_PENALTY[aliasId] ?? (AMBIGUOUS_ALIASES.has(aliasId) ? 4 : 0);
    const score = row.tokens.length * 10 - (WEAK_KEYS.has(row.key) ? 4 : 0) - (GENERIC_KEYS.has(row.key) ? 2 : 0) - ambiguous - first * 0.1;
    if (!best || score > best.score) best = { key: row.key, score };
  }
  return best?.key || null;
}

function fabricTokens(K, text) {
  const set = new Set(tokenize(norm(text)));
  const mats = new Set();
  for (const [m, aliases] of Object.entries(K.synonyms.materials)) if (m !== '_about' && aliases.some((a) => hasToken(set, norm(a)))) mats.add(m);
  return mats;
}

function hasAny(K, text, words) {
  const n = ` ${norm(text)} `;
  return words.some((w) => n.includes(` ${norm(w)} `) || tokenize(norm(text)).some((t) => tokenVariants(t).includes(norm(w))));
}

export function inferFormality(key, name, desc, K = loadKnowledge()) {
  const item = K.items.get(key); const [lo, hi] = item?.formality || [2, 3];
  const sig = K.taxonomy.formality_signals;
  const nameText = name;
  let f = null;
  for (const g of sig.name_words) if (hasAny(K, nameText, g.words)) { f = f === null ? g.formality : Math.max(f, g.formality); }
  if (f === null) f = key === 'dress_any' ? 3 : Math.ceil((lo + hi) / 2);
  const mats = `${name} ${desc || ''}`;
  if (hasAny(K, mats, sig.fabrics_up)) f += 1;
  else if (hasAny(K, mats, sig.fabrics_down)) f -= 1;
  return Math.max(lo, Math.min(hi, f));
}

const KIDS_GIRL = ['بنات', 'بنوته', 'بناتي', 'girls', 'girl'];
const KIDS_BOY = ['ولادي', 'اولاد', 'ولد', 'boys', 'boy'];
const KIDS_BOTH = ['اطفال', 'كيدز', 'kids', 'children'];
const MEN_WORDS = ['رجالي', 'للرجال', 'men', 'mens', 'man'];
const WOMEN_WORDS = ['حريمي', 'نسائي', 'للنساء', 'women', 'womens', 'woman', 'ladies'];
const WOMEN_KEYS = new Set(['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_bridal', 'dress_beach', 'jumpsuit', 'skirt', 'blouse', 'abaya', 'heels_low', 'heels_high', 'clutch', 'shawl', 'two_piece_set', 'womens_suit', 'hijab_set', 'tarha', 'long_cardigan', 'flats', 'tunic']);
const MEN_KEYS = new Set(['suit', 'tuxedo', 'tie', 'bow_tie', 'pocket_square', 'waistcoat', 'classic_set']);

/** الفئة اللي المنتج ليها: men | women | boys | girls | kids | unisex */
export function inferGender(row, key, K = loadKnowledge()) {
  if (['men', 'women', 'boys', 'girls', 'kids', 'unisex'].includes(row.audience)) return row.audience; // اختيار صاحب المحل الصريح يغلب التخمين
  const text = `${row.name_ar || ''} ${row.name_en || ''} ${row.cat_text || ''}`;
  if (hasAny(K, text, KIDS_GIRL)) return 'girls';
  if (hasAny(K, text, KIDS_BOY)) return 'boys';
  if (hasAny(K, text, KIDS_BOTH) || row.department === 'kids') return 'kids';
  if (hasAny(K, text, MEN_WORDS)) return 'men';
  if (hasAny(K, text, WOMEN_WORDS)) return 'women';
  if (['women', 'hijab', 'abaya', 'wedding_dress'].includes(row.department)) return 'women';
  if (['men', 'wedding_suit'].includes(row.department)) return 'men';
  if (row.department === 'jalabiya') return key === 'jalabiya' ? 'unisex' : 'unisex';
  if (WOMEN_KEYS.has(key)) return 'women';
  if (MEN_KEYS.has(key)) return 'men';
  return 'unisex';
}

export function colorKeysOf(row, K = loadKnowledge()) {
  let list = row.colors_json;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
  list = Array.isArray(list) ? list : [];
  const keys = [];
  for (const c of list) {
    const m = matchTokens(tokenize(norm(`${c.name_ar || ''}`)), K).flatMap((x) => x.entries).filter((e) => e.group === 'color').map((e) => e.key);
    const m2 = m.length ? m : matchTokens(tokenize(norm(`${c.name_en || ''}`)), K).flatMap((x) => x.entries).filter((e) => e.group === 'color').map((e) => e.key);
    if (m2[0]) keys.push(m2[0]);
  }
  if (!keys.length) {
    const m = matchTokens(tokenize(norm(`${row.name_ar || ''} ${row.name_en || ''}`)), K).flatMap((x) => x.entries).filter((e) => e.group === 'color').map((e) => e.key);
    keys.push(...m.slice(0, 1));
  }
  if (!keys.length) { // عبارة زي «بدلة سوداء» ممكن تاخد الكلمتين كقطعة؛ نمسح كل كلمة لوحدها عشان اللون مايضيعش
    const toks = tokenize(norm(`${row.name_ar || ''} ${row.name_en || ''}`));
    for (const t of toks) { const hit = matchTokens([t], K).flatMap((x) => x.entries).find((e) => e.group === 'color'); if (hit) { keys.push(hit.key); break; } }
  }
  return [...new Set(keys)];
}

const SPORTY_RE = /(running|runner|sport|training|trainer|jog|basket|football|hiking|air\s?max|mesh|knit|neon|chunky|print|printed|logo|pattern|camo|glitter|multi|colou?rful|metallic|platform|طباعة|مطبوع|مطبع|مزخرف|ملون|لامع|رياضي|رياضة|ركض|جري|تدريب)/i;
const MINIMAL_COLORS = new Set(['white', 'off_white', 'black', 'cream']);
/** كوتشي كلاسيك ساده (أبيض أو أسود، من غير طباعة أو لوجو كبير، مش رياضي) ينفع مع طقم كلاسيك في المناسبات. */
export function isMinimalSneaker(key, name, colorKeys) {
  return key === 'sneakers' && !SPORTY_RE.test(name || '') && Boolean(colorKeys?.length) && colorKeys.length <= 2 && colorKeys.every((c) => MINIMAL_COLORS.has(c));
}

/** يضيف حقول تويلا لصف المنتج (بدون تعديل الأصل). */
export function enrichProduct(row, K = loadKnowledge()) {
  const name = `${row.name_ar || ''} ${row.name_en || ''}`;
  const explicitItem = K.items.get(row.moda_key);
  const explicitKey = explicitItem && !explicitItem.virtual ? row.moda_key : null;
  let key = explicitKey || inferKey(name, K);
  // مطابقة مزدوجة: الاسم + النوع المحفوظ.
  // - نفس العائلة ومختلفين (مثلاً "Sneakers" متصنّف "حذاء رسمي"): الاسم هو اللي يكسب.
  // - عائلتين مختلفتين (اسم بيقول بنطلون والنوع قميص): بنعلّم typeConflict ومنسّق الذكاء الاصطناعي مش بيستخدمه.
  let typeConflict = false;
  if (explicitKey) {
    const byName = inferKey(name, K);
    if (byName && byName !== explicitKey) {
      if (FORCE_RULES.some(([k]) => k === byName)) key = byName; // الاسم حاسم (كفلينج/لانجري/روب/نوم) مهما كان النوع المحفوظ
      else if (K.items.get(byName)?.family === K.items.get(explicitKey)?.family) key = byName; else typeConflict = true;
    }
  }
  // كلمات الكوتشي في الاسم حاسمة: أي حذاء اسمه كوتشي/sneakers/running يتصنّف كوتشي مهما كان النوع المحفوظ.
  if (key && SHOE_KEYS.has(key) && key !== 'sneakers' && SNEAKER_NAME_RE.test(name)) { key = 'sneakers'; typeConflict = false; }
  if (!key) key = inferKey(`${row.cat_text || ''}`, K);
  // تأكيد ثلاثي: الاسم + القسم (+ النوع المحفوظ): لو الاسم بيقول نوع والقسم نوع من عيلة تانية خالص، المنتج مش موثوق → مايترشحش.
  if (key && !typeConflict) {
    const catKey = row.cat_text ? inferKey(String(row.cat_text), K) : null;
    const nameKey = inferKey(name, K);
    const fam = (k) => K.items.get(k)?.family || null;
    if (catKey && nameKey && !WEAK_KEYS.has(catKey) && !WEAK_KEYS.has(nameKey) && fam(catKey) && fam(nameKey) && fam(catKey) !== fam(nameKey)) typeConflict = true;
  }
  if (Number(row.photo_mismatch) === 1) typeConflict = true; // صورة المنتج (CLIP) نوعها مختلف عن اسمه/قسمه
  const desc = `${row.description_ar || ''}`;
  if (key === 'dress_any') {
    const f0 = inferFormality('dress_any', name, desc, K);
    key = hasAny(K, name, ['شغل', 'work', 'office']) ? 'dress_work' : f0 >= 4 ? 'dress_party' : 'dress_casual';
  }
  const owner = Number(row.style_level) >= 1 && Number(row.style_level) <= 5 ? Number(row.style_level) : null;
  const range = K.items.get(key)?.formality || [1, 5];
  const inferredFormality = key ? inferFormality(key, name, desc, K) : null;
  const requestedFormality = owner ?? inferredFormality;
  const formality = key && requestedFormality != null ? Math.max(range[0], Math.min(range[1], requestedFormality)) : requestedFormality;
  const inStock = row.track_stock === 0 || row.track_stock === false ? true : Number(row.stock ?? 1) > 0;
  const materials = fabricTokens(K, `${name} ${desc}`);
  const isSleeveless = hasAny(K, name, ['بدون اكمام', 'sleeveless', 'مكشوف', 'strapless']);
  return {
    ...row, key, typeConflict, minimalSneaker: isMinimalSneaker(key, name, colorKeysOf(row, K)), formality, gender: inferGender(row, key, K), colorKeys: colorKeysOf(row, K), materials, inStock,
    sleeveless: isSleeveless, price: Number(row.price) || 0, popularity: Math.min(2.5, Number(row.sold_count || 0) / 24) + (Number(row.rating || 0) >= 4.3 ? 0.5 : 0),
  };
}

// كاش بين الطلبات: نفس الصف (نفس القيم بالظبط) مايتحللش تاني. أي تعديل في المنتج بيغيّر المفتاح.
const ENRICH_CACHE = new Map(); let ENRICH_K = null;
export function enrichAll(rows, K = loadKnowledge()) {
  if (ENRICH_K !== K) { ENRICH_CACHE.clear(); ENRICH_K = K; }
  if (ENRICH_CACHE.size > 20000) ENRICH_CACHE.clear();
  return rows.map((r) => {
    let key = null;
    try { key = JSON.stringify(r); } catch { /* صف غريب: نحلله من غير كاش */ }
    if (key === null) return enrichProduct(r, K);
    const hit = ENRICH_CACHE.get(key);
    if (hit) return hit;
    const out = enrichProduct(r, K);
    ENRICH_CACHE.set(key, out);
    return out;
  });
}
