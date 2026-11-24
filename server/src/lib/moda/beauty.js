/**
 * تجميل وعناية: بشرة، مكياج، شعر، جسم، عطور.
 * منتجات التجميل أسماءها غالبًا إنجليزي (Serum, Hair mask, Concealer…) ومفيهاش تصنيف لبس، فمحرك اللبس مكانش بيفهم «عايزة حاجة للبشرة».
 * هنا بنفهم الطلب من كلمات العميل ونرجّع منتجات من أقسام التجميل الحقيقية (بالقسم أو بالاسم)، ومفيش حاجة بتتألّف.
 */
import { norm } from './text.js';

const T = {
  skin: { say: 'دي اللي عندنا للعناية بالبشرة:', none: 'مفيش دلوقتي منتجات عناية بالبشرة متاحة في المحلات.',
    ask: ['سكن كير','سكين كير','skincare','skin care','skin','تفتح','تفتيح','تفتيحها','تبييض','تبيض','مسام','هالات','بشره','بشرتي','بشرتك','بشرتها','سيروم','serum','مرطب','ترطيب','moisturizer','moisturizing','غسول','cleanser','cleansing','تونر','toner','واقي شمس','سن سكرين','sunscreen','spf','حبوب','acne','تفتيح','تصبغات','كلف','ampoule','امبول','فيتامين سي','vitamin c','كريم','لوشن','lotion','مقشر','exfoliator','ماسك وش','face mask','وش','وجه','glow','نضاره'],
    dept: /^(care)$/, name: /(serum|سيروم|ampoule|امبول|cream|كريم|moistur|مرطب|cleans|غسول|toner|تونر|sunscreen|واقي|vitamin|فيتامين|lotion|centella|clinique|dark spot|brighten|glow)/i },
  hair: { say: 'دي اللي عندنا للعناية بالشعر:', none: 'مفيش دلوقتي منتجات للعناية بالشعر متاحة في المحلات.',
    ask: ['هير كير','hair care','haircare','شعر','شعري','شعره','شعرها','شامبو','shampoo','بلسم','conditioner','hair','تساقط','تقصف','كيراتين','بروتين شعر','زيت شعر','ماسك شعر'],
    dept: /^(hair_care)$/, name: /(hair|شعر|shampoo|شامبو|conditioner|بلسم|keratin|كيراتين|k18)/i },
  makeup: { say: 'دي اللي عندنا من المكياج:', none: 'مفيش دلوقتي منتجات مكياج متاحة في المحلات.',
    ask: ['مكياج','ميك اب','makeup','make up','روج','lipstick','ليب','lip','ايشادو','eyeshadow','ظلال','كونسيلر','concealer','فاونديشن','foundation','بودره','powder','ماسكارا','mascara','كحل','ايلاينر','eyeliner','بلاشر','blush','هايلايتر','highlighter','برايمر','primer','احمر شفاه'],
    dept: /^(makeup|beauty_(concealer|eyeshadow|foundation|lipstick|powder|blush|mascara|eyeliner|primer|nails))$/, name: /(lip|روج|concealer|كونسيلر|foundation|فاونديشن|powder|بودر|eyeshadow|ايشادو|mascara|ماسكارا|blush|بلاشر|makeup|مكياج|nars|huda)/i },
  body: { say: 'دي اللي عندنا للعناية بالجسم والاستحمام:', none: 'مفيش دلوقتي منتجات عناية بالجسم متاحة في المحلات.',
    ask: ['جسم','body','استحمام','شاور','shower','مزيل عرق','deodorant','بديكير','مانيكير','اظافر','املاح','bath','سكراب','scrub'],
    dept: /^(beauty_body_care|beauty_personal_care)$/, name: /(body|جسم|bath|shower|scrub|سكراب|املاح|بديكير)/i },
  perfume: { say: 'دي العطور المتاحة:', none: 'مفيش دلوقتي عطور متاحة في المحلات.',
    ask: ['عطر','عطور','برفان','بارفان','perfume','parfum','fragrance','بودي ميست','body mist','ميست','mist','بخاخ'],
    dept: /^(perfumes|perfume_.+)$/, name: /(perfume|parfum|عطر|برفان|mist|ميست|eau de|edp)/i },
  generic: { say: 'دي منتجات التجميل والعناية المتاحة:', none: 'مفيش دلوقتي منتجات تجميل متاحة في المحلات.',
    ask: ['تجميل','مستحضرات','جمال','beauty','cosmetic','عنايه','skincare','skin care','هدايا تجميل'], dept: null, name: null },
};
const PRE = /^(?:بال|لل|وال|ال|ل|ب|و)/;
/** كلمة قصيرة (أقل من 4 حروف) لازم تتطابق بالظبط؛ الأطول بتتطابق كبداية كلمة («بشر» → «البشرة») */
const hasTerm = (n, terms) => { const toks = n.trim().split(' '); const j = ` ${n.trim()} `; return terms.some((t) => (t.includes(' ') ? j.includes(` ${t} `) || j.includes(` ${t}`) : toks.some((w) => { const x = w.replace(PRE, ''); return w === t || x === t || (t.length >= 4 && (w.startsWith(t) || x.startsWith(t))); }))); };
// كلمة العميل → صيغها في أسماء المنتجات (عربي/إنجليزي)
const SYN = [['تفتح', 'تفتيح', 'تبييض', 'تبيض', 'brightening', 'brighten', 'whitening', 'glow', 'dark spot', 'vitamin'], ['هالات', 'eye'], ['روج', 'lipstick', 'lip', 'ليب', 'احمر شفاه'], ['كونسيلر', 'concealer'], ['فاونديشن', 'foundation', 'كريم اساس'], ['بودره', 'powder'], ['ايشادو', 'eyeshadow', 'ظلال'], ['ماسكارا', 'mascara'], ['كحل', 'eyeliner', 'ايلاينر'],
  ['سيروم', 'serum', 'ampoule', 'امبول', 'booster'], ['ماسك', 'mask'], ['شامبو', 'shampoo'], ['بلسم', 'conditioner'], ['كريم', 'cream', 'lotion', 'moisturizing', 'مرطب'], ['لوشن', 'lotion'], ['مرطب', 'moisturizing', 'moisturizer', 'lotion', 'cream'], ['غسول', 'cleansing', 'cleanser', 'cleansing oil'], ['عطر', 'perfume', 'parfum'], ['ميست', 'mist']];
const ORDER = ['makeup', 'hair', 'perfume', 'skin', 'body', 'generic'];
const FASHION = /(فستان|بنطلون|جاكيت|قميص|بلوزه|تيشيرت|عبايه|جزمه|حذاء|كوتشي|شنطه|طرحه|بدله|ترنج|بيجامه|لانجري|لبس|هدوم|ملابس)/;

const inBeauty = (p) => [p.department, p.dept_parent, p.dept_grand].some((s) => s === 'beauty') || /^(beauty|perfume|makeup|care$|hair_care)/.test(String(p.department || ''));
const hay = (p) => norm(`${p.name_ar || ''} ${p.name_en || ''} ${p.dept_name || ''} ${p.cat_text || ''}`);

/** @returns {{topic:string, say:string, hits:object[]}|null} */
export function beautyMatch(text, products, { limit = 8 } = {}) {
  const n = ` ${norm(text)} `;
  if (!n.trim() || FASHION.test(n)) return null;
  const topics = ORDER.filter((k) => hasTerm(n, T[k].ask));
  if (!topics.length) return null;
  const topic = topics[0];
  const beauty = (products || []).filter((p) => p && inBeauty(p) && p.inStock !== false && Number(p.photo_mismatch) !== 1);
  const cfg = T[topic];
  let pool = cfg.dept ? beauty.filter((p) => cfg.dept.test(String(p.department || '')) || (!/^(care|hair_care|makeup|perfumes|beauty_|perfume_)/.test(String(p.department || '')) && cfg.name.test(`${p.name_ar} ${p.name_en}`))) : beauty;
  // كلمة محددة («روج»، «سيروم»، «ماسك») → اللي اسمه فيها الأول
  const words = n.split(' ').map((w) => w.replace(PRE, '')).filter((w) => w.length >= 3);
  const specific = pool.filter((p) => { const h = ` ${hay(p)} `; return words.some((w) => { const g = SYN.find((x) => x.includes(w)); return g ? g.some((y) => h.includes(y)) : false; }); });
  if (specific.length) pool = specific;
  const hits = pool.sort((a, b) => (Number(b.sold_count) || 0) - (Number(a.sold_count) || 0)).slice(0, limit);
  return { topic, say: hits.length ? cfg.say : `${cfg.none} تقدري تشوفي كل أقسام التجميل من صفحة «مستحضرات تجميل».`, hits };
}
