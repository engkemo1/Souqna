/**
 * سؤال معلومة (مش طلب شراء): «القطن بيتكرمش؟»، «الجينز بيبهت؟»، «ايه الفرق بين السليم والريجولار».
 * قبل كده أي سؤال فيه اسم قطعة أو خامة كان بيتحوّل لبحث منتجات و«ملقتش…». دلوقتي:
 *  1) لو السؤال شكله سؤال ومفيهوش نية شراء → ما نبحثش في المنتجات خالص.
 *  2) بندوّر في كل نصايح قاعدة المعرفة (phrases.advice، 78 موضوع) بمطابقة كلمات موزونة مش مطابقة حرفية.
 *  3) لو لقينا إجابة واثقة نرد بيها، وإلا العقل (لو متاح) أو رد صادق بيوضّح اللي نعرفه ويعرض المساعدة.
 * مفيش اختراع: الإجابة إما من القاعدة أو من العقل المقيّد بالـ prompt بتاعه.
 */
import { norm } from './text.js';

const PURCHASE = /(^| )(عايز|عاوز|عايزه|عاوزه|عايزين|محتاج|محتاجه|ورني|وريني|ورينا|هات|هاتلي|جيبلي|رشحلي|رشح|رشحيلي|دورلي|دور|اديني|نفسي|اشتري|اشتريه|اطلب|عندكم|عندكوا|عندك|شوفلي|اختارلي|نسقلي|نسق|اقترحلي|ابحثلي|ابغى|لو سمحت)( |$)/;
const Q_CUE = /([?؟])|(^| )(هل|ازاي|ليه|لية|امتي|امتى|فين|يعني|الفرق|معني|معنى|ايه|اي|مين|كام|احسن|افضل|يصح|ينفع|مينفعش|لازم|ممكن)( |$)|(^| )(بيتكرمش|بيتكرمشوا|بتتكرمش|بيصغر|بيكبر|بيبهت|بيتنفس|بيحك|بيسخن|بيشف|بيتوسع|بيطلع|بتطلع|بيفضل|هيفضل|بيدوم|بتدوم|بيتغسل|بتتغسل|بيتكوي|بتتكوي|بينفع|هينفع|هيصغر|هيكبر|هيبهت|بيعمل|بتعمل)( |$)/;
const STOP = new Set(['هل', 'ايه', 'اي', 'ده', 'دي', 'دا', 'ازاي', 'ليه', 'لية', 'يعني', 'في', 'فى', 'من', 'علي', 'على', 'عن', 'مع', 'او', 'ولا', 'و', 'ان', 'انا', 'انت', 'انتي', 'هو', 'هي', 'كل', 'بس', 'لو', 'ممكن', 'يا', 'بتاع', 'بتاعت', 'كده', 'كدة', 'جدا', 'اوي', 'قوي', 'حاجه', 'حاجة', 'الي', 'اللي', 'لا', 'لأ', 'مش', 'مين', 'امتي', 'امتى', 'فين', 'كام', 'هيبقي', 'يبقي', 'تبقي', 'بيبقي', 'عند', 'عندي', 'ليا', 'لي', 'معايا']);
const strip = (w) => w.replace(/^(ال|وال|بال|لل)/, '').replace(/^[وبل](?=.{4,})/, '');
// توحيد جذور الأفعال/المصادر الشائعة (بيتغسل/اغسل/غسيل → غسل) علشان الصيغ المختلفة لنفس السؤال تتطابق
const ROOTS = [[/^(اغسل|اغسله|اغسلها|بيتغسل|بتتغسل|يتغسل|تتغسل|هتغسل|غسيل|غسله|غسلت|غسالة|غساله|بنغسل|نغسل|تغسل)$/, 'غسل'], [/^(بيتكرمش|بتتكرمش|يتكرمش|تتكرمش|هيتكرمش|كرمشه|كرمشة|بتكرمش|بيكرمش|بيتكرمشوا|منكرمش)$/, 'كرمش'], [/^(بيتكوي|بتتكوي|يتكوي|تتكوي|اكوي|اكويه|كي|مكوي|الكي|كويه)$/, 'كوي'], [/^(بيبهت|بتبهت|يبهت|تبهت|هيبهت|بهتان|بهتت|بتطلع|بيطلع)$/, 'بهت'], [/^(بيصغر|بتصغر|هيصغر|بينكمش|بتنكمش|هينكمش|بيتقلص|بتتقلص|انكماش|تنكمش|بيكش|تقلص)$/, 'نكمش'], [/^(بيتمدد|بتتمدد|هيتمدد|بيوسع|بتوسع|هيوسع|بيرجع|تمدد|توسع)$/, 'مدد'], [/^(بيضيق|بتضيق|هيضيق|يضيق)$/, 'ضيق']];
const stem = (w) => { for (const [re, r] of ROOTS) if (re.test(w)) return r; return w; };
const toks = (t) => [...new Set(norm(String(t || '')).split(/\s+/).map(strip).map(stem).filter((w) => w.length >= 2 && !STOP.has(w)))];

export function isInfoQuestion(text) {
  const n = norm(text);
  if (n.split(' ').filter(Boolean).length < 2) return false;
  if (PURCHASE.test(n)) return false;
  if (!toks(text).length) return false; // «ازاي ده؟» لوحدها مش سؤال معلومة
  return Q_CUE.test(` ${n} `) || Q_CUE.test(String(text));
}

const cache = new WeakMap();
function index(K) {
  if (cache.has(K)) return cache.get(K);
  const docs = (K.phrases?.advice?.items || []).filter((i) => i.answer_ar).map((i) => ({ id: i.id, kw: new Set((i.keywords_ar || []).flatMap(toks)), ans: new Set(toks(i.answer_ar)), item: i }));
  const df = new Map();
  for (const d of docs) for (const t of new Set([...d.kw, ...d.ans])) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t) => Math.log(1 + (docs.length + 1) / (1 + (df.get(t) || 0)));
  const out = { docs, idf, df };
  cache.set(K, out);
  return out;
}

/** أفضل موضوع نصيحة للسؤال، أو null لو مفيش تطابق واثق. */
const df_ = (K, t) => index(K).df.get(t) || 0;
export function searchAdvice(text, K) {
  const q = toks(text); if (!q.length) return null;
  const { docs, idf } = index(K);
  const mass = q.filter((t) => df_(K, t) > 0).reduce((m, t) => m + idf(t), 0) || 1;
  const scored = docs.map((d) => {
    let s = 0; let kwHits = 0; let cov = 0;
    for (const t of q) { if (d.kw.has(t)) { s += 3 * idf(t); kwHits += 1; cov += idf(t); } else if (d.ans.has(t)) { s += 0.6 * idf(t); cov += 0.3 * idf(t); } }
    s *= 0.5 + cov / mass; // نسبة كلمات السؤال (بالأهمية) اللي الموضوع بيغطيها
    return { d, s, kwHits };
  }).sort((a, b) => b.s - a.s);
  const [a, b] = scored;
  if (!a || a.kwHits < 1) return null;
  if (a.kwHits < 2 && !(q.length <= 3 && a.s >= 5)) return null; // كلمة واحدة مطابقة في سؤال طويل = صدفة
  if (a.s < 4) return null;
  const mass2 = q.filter((t) => df_(K, t) > 0).reduce((m, t) => m + idf(t), 0) || 1;
  const covKw = q.filter((t) => a.d.kw.has(t)).reduce((m, t) => m + idf(t), 0);
  if (covKw / mass2 < 0.5) return null; // الموضوع لازم يغطي نصف أهمية كلمات السؤال على الأقل
  if (b && a.s < b.s * 1.25) return null; // لخبطة بين موضوعين: الأسلم نسأل مش نرد غلط
  return a.d.item;
}

export const HONEST_FALLBACK = 'سؤال مهم، بس مش عندي إجابة مؤكدة عليه من اللي معايا وماحبّش أخمّن معلومة ممكن تضيّعلك فلوس. تقدر تسأل المحل من صفحة المنتج، أو قولي أنهي قطعة وللمناسبة إيه وأنا أدورلك على اللي يناسب من المتاح وأقولك ليه.';

/** موضوع نصيحة طابقه المحلل بالكلمات (كل كلمات عبارة من كلماته المفتاحية موجودة في السؤال) — أضمن من إجابة بمطابقة جزئية. */
export function adviceByPhrase(text, K, id) {
  const item = (K.phrases?.advice?.items || []).find((i) => i.id === id);
  if (!item) return null;
  if (item.id === 'care_suit' && /(رياض|ترين|تريننج|جيم|سبورت|تمارين)/.test(norm(text))) return null; // «طقم رياضي» مش بدلة
  const q = new Set(toks(text));
  return (item.keywords_ar || []).some((k) => { const t = toks(k); return t.length && t.every((w) => q.has(w)); }) ? item : null;
}
