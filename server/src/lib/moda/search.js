/**
 * بحث بالكلمات في المنتجات الحقيقية: شبكة أمان لأي حاجة مش في قاموس اللبس (مكياج، عطور، نظارات، بيجامات، إكسسوارات غريبة…).
 * بيرجّع بس منتجات اسمها/قسمها بيحتوي فعلًا على كلمات العميل، ومنتجات متأكد منها (مفيش تعارض نوع، ولا صورة مش مطابقة).
 */
import { norm } from './text.js';

const STOP = new Set(['هدوم', 'عاوز', 'عايز', 'عاوزه', 'عايزه', 'محتاج', 'محتاجه', 'عندكم', 'عندك', 'فيه', 'في', 'هاتلي', 'جيبلي', 'ممكن', 'اشوف', 'شوف', 'ورينى', 'ورني', 'ورينا', 'لو', 'سمحت', 'من', 'فضلك', 'ايه', 'اي', 'ده', 'دي', 'بس', 'كمان', 'بكام', 'كام', 'سعر', 'اسعار', 'لي', 'لينا', 'مع', 'على', 'علي', 'عن', 'الى', 'الي', 'ابغى', 'ابي', 'دور', 'ادور', 'بدور', 'عليه', 'عليها', 'لمراتي', 'لجوزي', 'ليا', 'انا', 'احنا', 'هو', 'هي', 'الله', 'يخليك', 'شكرا', 'تمام', 'اتفرج', 'نوع', 'حاجه', 'حاجات', 'حاجة', 'منتج', 'منتجات']);
// كلمة العميل → كل الصيغ الممكنة في أسماء المنتجات
const ALIASES = [
  ['شفاه', 'روج', 'ليب', 'lipstick', 'lip'], ['مكياج', 'ميك اب', 'makeup', 'ماسكارا', 'كحل', 'ايلاينر', 'فاونديشن', 'بودره', 'ظلال', 'احمر خدود', 'بلاشر'],
  ['نظاره', 'نضاره', 'نظارات', 'sunglasses', 'glasses'], ['بيجامه', 'نوم', 'هدوم نوم', 'لبس نوم', 'قميص نوم', 'بجامه', 'بيجامات', 'pajama', 'pyjama'],
  ['عطر', 'برفان', 'perfume', 'parfum', 'بخاخ'], ['كريم', 'لوشن', 'مرطب', 'سيروم', 'عنايه', 'بشره'], ['شامبو', 'بلسم', 'شعر', 'زيت'],
  ['شنطه', 'حقيبه', 'bag'], ['شبشب', 'شباشب', 'سليبر'], ['حلق', 'خاتم', 'سلسله', 'اسوره', 'دبله', 'jewelry'], ['اكسسوار', 'اكسسوارات', 'accessory'],
  ['بوكس', 'علبه', 'هديه', 'gift'], ['وشاح', 'اسكارف', 'شال', 'طرحه'], ['مايوه', 'برمودا', 'بكيني'], ['اندر', 'داخلي', 'بوكسر', 'سوتيان'],
];
const stem = (w) => { let x = String(w).replace(/^ال/, ''); if (x.length > 4 && /ات$/.test(x)) x = x.replace(/ات$/, 'ه'); return x.replace(/[ةه]$/, 'ه'); };
const toks = (s) => norm(s).split(' ').map((w) => stem(w)).filter((w) => w.length >= 3);

export function keywordSearch(text, products, { limit = 6 } = {}) {
  const raw = norm(text).split(' ').filter(Boolean);
  const q = raw.filter((w) => !STOP.has(w) && !STOP.has(w.replace(/^ال/, '')) && w.length >= 3).map(stem);
  if (!q.length) return [];
  const variants = q.map((w) => { const g = ALIASES.find((a) => a.some((x) => stem(norm(x)) === w || w.includes(stem(norm(x))) && stem(norm(x)).length >= 3)); return g ? g.map((x) => stem(norm(x))) : [w]; });
  const out = [];
  for (const p of products || []) {
    if (!p || p.typeConflict || Number(p.photo_mismatch) === 1 || p.inStock === false) continue;
    const hay = ` ${norm(`${p.name_ar || ''} ${p.name_en || ''} ${p.cat_text || ''}`)} `;
    const hayStems = new Set(toks(hay));
    let hit = 0;
    for (const vs of variants) if (vs.some((v) => hayStems.has(v) || (v.length >= 4 && hay.includes(` ${v}`)) || [...hayStems].some((h) => h.startsWith(v) && v.length >= 4))) hit += 1;
    const need = variants.length <= 2 ? variants.length : Math.ceil(variants.length * 0.6);
    if (hit >= need) out.push({ p, s: hit * 10 - (Number(p.price) || 0) / 1e6 });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p);
}
