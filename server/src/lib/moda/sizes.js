/**
 * فهم مقاسات المنتج من أي مكان المحل كتبها فيه (خانة المقاسات، الاسم، الوصف)، ومطابقتها بمقاس العميل.
 * بيفهم:
 *  - حروف: XS…5XL، «2XL/3XL»، «اكس لارج / لارج / ميديم / سمول / اكس اكس لارج»
 *  - أرقام ومدى: «38,40,42»، «38-44»، «من 38 ل 44»، «36/38»، أرقام هندي «٤٢»
 *  - أعمار أطفال: «4Y»، «4-5Y»، «6 سنين»، «2-3 سنين»، «12-18 شهر»، «6M»
 *  - «فري سايز / مقاس واحد / one size»
 * المنتج اللي مفيهوش أي بيانات مقاسات بيفضل (مش بنخبيه)، زي ما كان.
 */
import { norm } from './text.js';

export const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL'];
const LETTER_ALIAS = { '2XL': 'XXL', '3XL': 'XXXL', XXXXL: '4XL', XXXXXL: '5XL', '2X': 'XXL', '3X': 'XXXL' };
const AR_WORDS = [
  [/اكس اكس اكس لارج|تريبل اكس|3 اكس لارج/g, ' XXXL '],
  [/اكس اكس لارج|دبل اكس لارج|دبل اكس|2 اكس لارج/g, ' XXL '],
  [/اكس لارج|اكسل/g, ' XL '],
  [/اكس سمول/g, ' XS '],
  [/(^|[\s,،/|])لارج(?=[\s,،/|]|$)/g, ' L '],
  [/(^|[\s,،/|])(ميديم|ميدم|ميديوم)(?=[\s,،/|]|$)/g, ' M '],
  [/(^|[\s,،/|])(سمول|سمال)(?=[\s,،/|]|$)/g, ' S '],
];
const FREE_RE = /(فري ?سايز|free ?size|one ?size|مقاس واحد|مقاس موحد|onesize)/i;

const toAscii = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const canonLetter = (x) => { const u = String(x).toUpperCase(); return LETTER_ALIAS[u] || (LETTERS.includes(u) ? u : null); };

/** يقرا نص مقاسات حر ويرجع { letters:Set, nums:Set, ages:[{min,max}] (بالسنين), free, any } */
export function parseSizeText(text) {
  const out = { letters: new Set(), nums: new Set(), ages: [], free: false };
  // تطبيع خفيف بيحافظ على «-» و«/» (norm بيشيلهم فالمدى «M-XXL» كان بيبوظ)
  let t = ` ${toAscii(String(text || '')).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652\u0640]/g, '').replace(/[–—]/g, '-')} `;
  if (!t.trim()) return { ...out, any: false };
  if (FREE_RE.test(t)) out.free = true;
  // أعمار: «4-5y» «4y» «6 سنين» «2-3 سنين» «12-18 شهر» «6m»
  t = t.replace(/(\d{1,2})\s*(?:-|ل|الي|الى|to)\s*(\d{1,2})\s*(y|yr|yrs|years|سنه|سنين|سنوات|سنة)(?=[\s,،/|]|$)/g, (_, a, b) => { out.ages.push({ min: +a, max: +b }); return ' '; });
  t = t.replace(/(\d{1,2})\s*(?:-|ل|الي|الى|to)\s*(\d{1,2})\s*(m|mo|months|شهر|شهور)(?=[\s,،/|]|$)/g, (_, a, b) => { out.ages.push({ min: +a / 12, max: +b / 12 }); return ' '; });
  t = t.replace(/(?:^|[\s,،/|])(\d{1,2})\s*(y|yr|yrs|years|سنه|سنين|سنوات|سنة)(?=[\s,،/|]|$)/g, (_, a) => { out.ages.push({ min: +a, max: +a }); return ' '; });
  t = t.replace(/(?:^|[\s,،/|])(\d{1,2})\s*(m|mo|months|شهر|شهور)(?=[\s,،/|]|$)/g, (_, a) => { out.ages.push({ min: +a / 12, max: +a / 12 }); return ' '; });
  // كلمات عربي → حروف
  for (const [re, rep] of AR_WORDS) t = t.replace(re, rep);
  // مدى حروف «m-xxl» «s to xl» «من m ل xxl»
  t = t.replace(/(?:من\s*)?\b(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)\s*(?:-|ل|الي|الى|to|:)\s*(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)\b/g, (_, a, b) => {
    const i = LETTERS.indexOf(canonLetter(a)); const j = LETTERS.indexOf(canonLetter(b));
    if (i >= 0 && j >= i) for (let k = i; k <= j; k++) out.letters.add(LETTERS[k]);
    return ' ';
  });
  // مدى أرقام «38-44» «من 38 ل 44» «36:44» (مش أعمار)
  t = t.replace(/(?:من\s*)?\b(\d{2})\s*(?:-|ل|الي|الى|to|:)\s*(\d{2})\b/g, (_, a, b) => {
    const x = +a; const y = +b;
    if (y > x && y - x <= 30) for (let k = x; k <= y; k += 1) out.nums.add(k); // «38-44» = كل المقاسات بينهم (جزم 38،39…)
    return ' ';
  });
  for (const tok of t.split(/[\s,،/|;+]+/)) {
    if (!tok) continue;
    const L = canonLetter(tok); if (L) { out.letters.add(L); continue; }
    if (/^\d{1,3}$/.test(tok)) { const v = +tok; if (v >= 1 && v <= 60) out.nums.add(v); }
  }
  out.any = out.free || out.letters.size > 0 || out.nums.size > 0 || out.ages.length > 0;
  return out;
}

/** مقاسات المنتج: خانة المقاسات أولًا؛ لو فاضية ندوّر في الوصف/الاسم بعد كلمة «مقاس/مقاسات/متوفر/size» بس (عشان أرقام زي السعر ماتتحسبش). */
export function productSizes(p) {
  const fromList = parseSizeText(p?.size_list || p?.sizes || '');
  if (fromList.any) return { ...fromList, source: 'size_list' };
  let sj = p?.sizes_json; if (typeof sj === 'string') { try { sj = JSON.parse(sj); } catch { /* نص عادي */ } }
  const fromJson = parseSizeText(Array.isArray(sj) ? sj.map((x) => (typeof x === 'object' ? x?.name || x?.size || x?.label || '' : x)).join(',') : (sj || ''));
  if (fromJson.any) return { ...fromJson, source: 'sizes_json' };
  const text = toAscii(`${p?.name_ar || ''} . ${p?.description_ar || ''} . ${p?.name_en || ''} ${p?.description_en || ''}`).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[–—]/g, '-');
  const segs = text.match(/(مقاسات|المقاسات|مقاس|المقاس|متوفر|متاح|size|sizes)[^.\n]{0,60}/g) || [];
  const ageSeg = text.match(/(من\s*)?\d{1,2}\s*(-|ل|الي|الى|to)\s*\d{1,2}\s*(سنه|سنين|سنوات|سنة|شهر|شهور|y|yrs|years)|(سن|عمر)\s*\d{1,2}\s*(سنه|سنين|سنوات)/g) || [];
  const free = FREE_RE.test(text);
  const parsed = parseSizeText([...segs.map((s) => s.replace(/^(مقاسات|المقاسات|مقاس|المقاس|متوفر|متاح|size|sizes)/, '')), ...ageSeg].join(' , '));
  if (free) parsed.free = true;
  parsed.any = parsed.any || free;
  return { ...parsed, source: parsed.any ? 'text' : null };
}

/** مقاس العميل بصيغة موحّدة: { letter } أو { num } أو { age } */
export function normalizeWant(want) {
  if (want == null || want === '') return null;
  if (typeof want === 'object') return want;
  const s = toAscii(String(want)).trim().toUpperCase();
  const L = canonLetter(s); if (L) return { letter: L };
  const ar = parseSizeText(s); if (ar.letters.size === 1) return { letter: [...ar.letters][0] };
  if (/^\d{1,2}$/.test(s)) return { num: +s };
  return null;
}

/**
 * هل المنتج متاح بمقاس العميل؟
 * true = متاح أكيد، false = مقاساته معروفة ومفيهاش المقاس، null = مش عارفين (مفيش بيانات أو نوع مقاس مختلف) → نسيبه.
 */
export function sizeMatch(p, want) {
  const w = normalizeWant(want); if (!w) return null;
  const s = productSizes(p); if (!s.any) return null;
  // مقاسات الأطفال بالعمر تقريبية: «6Y» بيلبسها طفل 6–7، فبنسمح بسنة فرق للمقاس الواحد ونص سنة للمدى
  if (w.age != null) return s.ages.length ? s.ages.some((a) => (a.min === a.max ? Math.abs(w.age - a.min) <= 1 : w.age >= a.min - 0.5 && w.age <= a.max + 0.5)) : null;
  if (s.free && !s.letters.size && !s.nums.size) return w.letter ? ['S', 'M', 'L', 'XL'].includes(w.letter) : null; // فري سايز: بيلبس من S لـ XL تقريبًا
  // مقاسات المنتج معروفة بس بنظام تاني (أرقام والعميل قال حرف أو العكس): مش متاح بالمقاس ده، زي السلوك القديم (مطابقة بالظبط)
  if (w.letter) return s.letters.size ? s.letters.has(w.letter) : (s.nums.size || s.ages.length ? false : null);
  if (w.num != null) return s.nums.size ? s.nums.has(w.num) : (s.letters.size || s.ages.length ? false : null);
  return null;
}

/** نص المقاسات المتاحة للعرض («S، M، L» / «38–44» / «4–8 سنين»). */
export function sizesLabel(p) {
  const s = productSizes(p); if (!s.any) return '';
  const parts = [];
  if (s.letters.size) parts.push(LETTERS.filter((x) => s.letters.has(x)).join('، '));
  if (s.nums.size) { const n = [...s.nums].sort((a, b) => a - b); parts.push(n.length > 4 && n[n.length - 1] - n[0] <= 2 * n.length ? `${n[0]}–${n[n.length - 1]}` : n.join('، ')); }
  if (s.ages.length) { const mn = Math.min(...s.ages.map((a) => a.min)); const mx = Math.max(...s.ages.map((a) => a.max)); parts.push(mn < 1 || mx < 1 ? 'مقاسات أطفال صغيرين' : `${Math.round(mn)}–${Math.round(mx)} سنين`); }
  if (s.free) parts.push('فري سايز');
  return parts.join('، ');
}

/** دليل الجمهور من المقاسات: 'kids' لو أعمار أو مقاسات جزم/هدوم أطفال واضحة، وإلا null. */
export function sizeAudience(p, key = '') {
  const s = productSizes(p); if (!s.any) return null;
  if (s.ages.length && !s.letters.size) return 'kids';
  const nums = [...s.nums];
  const SHOES = /^(sneakers|formal_shoes|loafers|heels_low|heels_high|flats|sandals|boots|slippers|sport_shoes|shoes_any)$/;
  if (nums.length && !s.letters.size) {
    if (SHOES.test(key) && Math.max(...nums) <= 34) return 'kids'; // جزم أطفال (20–34)
    if (!SHOES.test(key) && Math.max(...nums) <= 16 && nums.every((n) => n % 2 === 0) && nums.length >= 2) return 'kids'; // هدوم أطفال 2/4/6/…/16
  }
  return null;
}


/** تعارض بيانات المقاسات: خانة المقاسات (variants) أو sizes_json أو الوصف بيقولوا مقاسات مختلفة تمامًا (مفيش مقاس مشترك) → المنتج مش موثوق. */
export function sizeSourcesConflict(p) {
  const srcs = [];
  const push = (label, parsed) => { if (parsed?.any && (parsed.letters.size || parsed.nums.size || parsed.ages.length)) srcs.push({ label, parsed }); };
  push('list', parseSizeText(p?.size_list || ''));
  let sj = p?.sizes_json; if (typeof sj === 'string') { try { sj = JSON.parse(sj); } catch { /* نص عادي */ } }
  push('json', parseSizeText(Array.isArray(sj) ? sj.map((x) => (typeof x === 'object' ? x?.name || x?.size || x?.label || '' : x)).join(',') : (sj || '')));
  const text = toAscii(`${p?.name_ar || ''} . ${p?.description_ar || ''} . ${p?.description_en || ''}`).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
  const segs = text.match(/(مقاسات|المقاسات|مقاس|المقاس|size|sizes)[^.\n]{0,60}/g) || [];
  push('text', parseSizeText(segs.map((x) => x.replace(/^(مقاسات|المقاسات|مقاس|المقاس|size|sizes)/, '')).join(' , ')));
  for (let i = 0; i < srcs.length; i += 1) for (let j = i + 1; j < srcs.length; j += 1) {
    const a = srcs[i].parsed; const b = srcs[j].parsed;
    const letterBoth = a.letters.size && b.letters.size; const numBoth = a.nums.size && b.nums.size;
    if (a.ages.length && b.ages.length && !a.ages.some((x) => b.ages.some((y) => x.min <= y.max + 1 && y.min <= x.max + 1))) return `${srcs[i].label}≠${srcs[j].label}:age`;
    if (letterBoth && ![...a.letters].some((x) => b.letters.has(x))) return `${srcs[i].label}≠${srcs[j].label}`;
    if (numBoth && ![...a.nums].some((x) => b.nums.has(x))) return `${srcs[i].label}≠${srcs[j].label}`;
  }
  return null;
}

/** الفئة العمرية المختارة في خصائص المنتج (رضيع/طفل صغير…) بتتعارض مع مقاسات بأعمار كبيرة (أو العكس). */
export function ageAttrConflict(p) {
  let at = p?.attrs_json; if (typeof at === 'string') { try { at = JSON.parse(at); } catch { at = null; } }
  const a = String(at?.age || '').toLowerCase(); if (!a) return false;
  const srcs = [parseSizeText(p?.size_list || ''), parseSizeText(Array.isArray(p?.sizes_json) ? p.sizes_json.join(',') : (() => { try { return JSON.parse(p?.sizes_json || '[]').join(','); } catch { return p?.sizes_json || ''; } })())];
  const maxAge = Math.max(-1, ...srcs.flatMap((s) => s.ages.map((x) => x.max)));
  const minAge = Math.min(99, ...srcs.flatMap((s) => s.ages.map((x) => x.min)));
  if (maxAge < 0) return false;
  if (['newborn', 'baby'].includes(a)) return maxAge > 3;
  if (a === 'toddler') return maxAge > 6;
  if (['kid', 'kids', 'child'].includes(a)) return minAge > 14 || maxAge > 16;
  return false;
}
