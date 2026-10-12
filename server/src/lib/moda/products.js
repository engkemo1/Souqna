/**
 * تحليل المنتجات: من اسم المنتج ووصفه وتصنيفه نطلع: نوع القطعة، درجة الرسمية، الفئة (رجال/ست/أطفال)،
 * الألوان، الخامة، والمخزون. كله بقواعد من ملفات المعرفة، بدون موديل.
 */
import { norm, tokenize, tokenVariants } from './text.js';
import { loadKnowledge } from './knowledge.js';
import { matchTokens } from './parse.js';

const WEAK_KEYS = new Set(['top', 'tunic', 'shoes_any', 'dress_any']);
const GENERIC_KEYS = new Set(['trousers', 'jacket', 'shirt', 'tshirt']);

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

/** نوع القطعة من النص (اسم + تصنيف): أطول alias مكتمل، مع تفضيل الأقدم موضعًا. */
export function inferKey(text, K = loadKnowledge()) {
  const tokens = tokenize(norm(text)); const set = new Set(tokens);
  const pos = new Map(); tokens.forEach((t, i) => { for (const v of tokenVariants(t)) if (!pos.has(v)) pos.set(v, i); });
  let best = null;
  for (const row of table(K).rows) {
    if (!row.tokens.every((t) => hasToken(set, t) || [...set].some((s) => tokenVariants(s).includes(t)))) continue;
    const first = Math.min(...row.tokens.map((t) => pos.get(t) ?? 99));
    const score = row.tokens.length * 10 - (WEAK_KEYS.has(row.key) ? 4 : 0) - (GENERIC_KEYS.has(row.key) ? 2 : 0) - first * 0.1;
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
  const text = `${row.name_ar || ''} ${row.name_en || ''} ${row.cat_text || ''}`;
  if (hasAny(K, text, KIDS_GIRL)) return 'girls';
  if (hasAny(K, text, KIDS_BOY)) return 'boys';
  if (hasAny(K, text, KIDS_BOTH) || row.department === 'kids') return 'kids';
  if (hasAny(K, text, MEN_WORDS)) return 'men';
  if (hasAny(K, text, WOMEN_WORDS)) return 'women';
  if (['women', 'hijab', 'abaya', 'wedding_dresses'].includes(row.department)) return 'women';
  if (['men', 'wedding_suits'].includes(row.department)) return 'men';
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
  return [...new Set(keys)];
}

/** يضيف حقول مودة لصف المنتج (بدون تعديل الأصل). */
export function enrichProduct(row, K = loadKnowledge()) {
  const name = `${row.name_ar || ''} ${row.name_en || ''}`;
  let key = inferKey(name, K);
  if (!key) key = inferKey(`${row.cat_text || ''}`, K);
  const desc = `${row.description_ar || ''}`;
  if (key === 'dress_any') {
    const f0 = inferFormality('dress_any', name, desc, K);
    key = hasAny(K, name, ['شغل', 'work', 'office']) ? 'dress_work' : f0 >= 4 ? 'dress_party' : 'dress_casual';
  }
  const owner = Number(row.style_level) >= 1 && Number(row.style_level) <= 5 ? Number(row.style_level) : null;
  const formality = owner ?? (key ? inferFormality(key, name, desc, K) : null);
  const inStock = row.track_stock === 0 || row.track_stock === false ? true : Number(row.stock ?? 1) > 0;
  const materials = fabricTokens(K, `${name} ${desc}`);
  const isSleeveless = hasAny(K, name, ['بدون اكمام', 'sleeveless', 'مكشوف', 'strapless']);
  return {
    ...row, key, formality, gender: inferGender(row, key, K), colorKeys: colorKeysOf(row, K), materials, inStock,
    sleeveless: isSleeveless, price: Number(row.price) || 0, popularity: Math.min(2.5, Number(row.sold_count || 0) / 24) + (Number(row.rating || 0) >= 4.3 ? 0.5 : 0),
  };
}

export const enrichAll = (rows, K = loadKnowledge()) => rows.map((r) => enrichProduct(r, K));
