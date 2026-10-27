/**
 * أدوات النص لتويلا: توحيد العربي/الإنجليزي/الفرانكو، التقطيع، استخراج الأرقام.
 * كله دوال نقية (pure) علشان تتختبر بسهولة.
 */

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXT_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** توحيد النص: همزات، تاء مربوطة، ياء، تشكيل، أرقام هندية، حروف مكررة، رموز. */
export function norm(input) {
  let s = String(input ?? '').toLowerCase();
  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXT_INDIC.indexOf(d)))
    .replace(/٫/g, '.').replace(/٬/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/(\p{L})\1{2,}/gu, '$1')          // بدلللة → بدلة ، fostaaaan → fostan
    .replace(/(\d)\s*[,،]\s*(\d{3})(?!\d)/g, '$1$2') // 6,000 → 6000
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return s;
}

export const tokenize = (normalized) => (normalized ? normalized.split(' ') : []);

const AR_RE = /[؀-ۿ]/;
const LAT_RE = /[a-z]/;
export const hasArabic = (s) => AR_RE.test(s);
export const isLatinToken = (t) => LAT_RE.test(t) && !AR_RE.test(t);

/** لغة الرسالة: ar لو فيها أي عربي، en لو لاتيني بالكامل ومش فرانكو، franco لو لاتيني + أرقام فرانكو. */
export function detectLanguage(raw) {
  const s = String(raw || '');
  const ar = (s.match(/[؀-ۿ]/g) || []).length;
  const lat = (s.match(/[a-zA-Z]/g) || []).length;
  if (ar === 0 && lat === 0) return 'ar';
  if (ar >= lat || (ar >= 3 && lat <= ar * 3)) return 'ar'; // كلمة إنجليزي واحدة (اسم موديل/براند) جوه جملة عربي ما تقلبش اللغة
  if (lat > 0 && /[a-z][2356789]|[2356789][a-z]/i.test(s)) return 'franco';
  return 'en';
}

/** هيكل الحروف الساكنة للاتيني: khotoba/khotouba → khtb. بيساعد في تهجئة الفرانكو المتغيرة. */
export function skeleton(token) {
  const t = String(token).replace(/[aeiouy]/g, '');
  return t.replace(/(.)\1+/g, '$1');
}
export const skeletonPhrase = (phrase) => phrase.split(' ').map(skeleton).join(' ');

/** تجريد بادئات الجر والعطف العربية: للخطوبه، والبدله، بالليل، فالفرح */
const PREFIXES = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف', 'ك'];
export function tokenVariants(token) {
  const out = [token];
  if (!hasArabic(token)) return out;
  for (const p of PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 3) {
      const rest = token.slice(p.length);
      out.push(rest);
      if (p === 'لل') out.push(`ال${rest}`);
      if (p === 'ل' || p === 'ب') out.push(`ال${rest}`);
    }
  }
  return [...new Set(out)];
}

const NUM_RE = /^\d+(?:\.\d+)?$/;
export const isNumberToken = (t) => NUM_RE.test(t);

/**
 * استخراج الميزانية والأعمار من التوكنز.
 * - عمر: رقم ≤ 18 وبعده وحدة سن (سنين/سنة/years…)
 * - ميزانية: رقم ≥ 100، أو رقم صغير + (ألف/الاف/k)، أو 'ألف' لوحدها، 'ألفين'، 'تلات آلاف'
 */
export function extractNumbers(tokens, { ageUnits = [], multipliers = {}, currency = [] } = {}) {
  const ages = []; const amounts = [];
  const ageSet = new Set(ageUnits.map(norm));
  const thousand = new Set(['الف', 'الاف', 'k', 'ألف']);
  const wordNums = { واحد: 1, اتنين: 2, تلات: 3, تلاته: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, تمن: 8, تمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10 };
  const mult = Object.fromEntries(Object.entries(multipliers).map(([k, v]) => [norm(k), v]));
  const curSet = new Set(currency.map(norm));
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]; const next = tokens[i + 1]; const prev = tokens[i - 1];
    // أعمار
    if (isNumberToken(t) && next && ageSet.has(next)) { const n = Number(t); if (n <= 18) { ages.push(n); continue; } }
    // أرقام + ألف
    if (isNumberToken(t)) {
      let v = Number(t);
      let used = false;
      if (next && thousand.has(next)) { v *= 1000; used = true; }
      else if (next && /^\d*k$/.test(next) === false && /^(الف|الاف)$/.test(next)) { v *= 1000; used = true; }
      if (/k$/.test(String(t))) { /* مغطى تحت */ }
      if (used || v >= 100) amounts.push({ value: v, index: i, currencyNear: curSet.has(next) || curSet.has(prev) });
      continue;
    }
    // 5k
    const km = /^(\d+(?:\.\d+)?)k$/.exec(t);
    if (km) { amounts.push({ value: Number(km[1]) * 1000, index: i, currencyNear: false }); continue; }
    // كلمات: ألفين، ألف ونص، تلات آلاف
    if (mult[t] && mult[t] >= 1000 && t !== 'الف' && t !== 'الاف') { amounts.push({ value: mult[t], index: i, currencyNear: false }); continue; }
    if (t === 'الف' && !(prev && (wordNums[prev] || isNumberToken(prev)))) {
      let v = 1000;
      if (tokens[i + 1] === 'ونص') v = 1500;
      amounts.push({ value: v, index: i, currencyNear: curSet.has(next) }); continue;
    }
    if ((t === 'الاف') && prev && wordNums[prev]) { amounts.push({ value: wordNums[prev] * 1000, index: i, currencyNear: curSet.has(next) }); }
  }
  return { ages, amounts };
}
