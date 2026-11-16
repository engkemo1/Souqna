/**
 * فصل «نوع المنتج» عن «المناسبة» عن «الستايل»:
 *  - نوع المنتج  = garments (مفاتيح القاموس الحقيقية: dress_*, two_piece_set, blouse, lingerie…)
 *  - المناسبة    = parsed.context (مفتاح داخلي) → parsed.occasion (اسم عام: evening, wedding, work…)
 *  - الستايل     = parsed.style  (elegant, casual, formal, modest, trendy, simple, understated)
 * المناسبة والستايل عمرهم ما بيبقوا نوع منتج: «حاجة حلوة للسهرة» مالهاش نوع → نسأل.
 * وفيها طبقة «مناسب للمناسبة/الستايل؟» بتقرا بيانات المنتج نفسها (اسم، وصف، خامة، قسم، خصائص) — مش كلمة واحدة في العنوان.
 */
import { norm } from './text.js';

// ---------- الستايل ----------
const STYLE_WORDS = {
  elegant: ['شيك', 'شيكه', 'انيق', 'انيقه', 'راقي', 'راقيه', 'فخم', 'فخمه', 'كلاس', 'شياكه', 'elegant', 'chic', 'classy', 'sheek', 'shik', 'sheik', 'chik'],
  casual: ['كاجوال', 'كاجول', 'كازوال', 'كجوال', 'سبور', 'casual', 'kajwal', 'casul'],
  formal: ['فورمال', 'فورمل', 'رسمي', 'رسميه', 'formal', 'formel'],
  modest: ['محتشم', 'محتشمه', 'ساتر', 'ساتره', 'مستور', 'مستوره', 'modest', 'mo7tasham', 'mo7tashma', 'muhtashem'],
  trendy: ['ترند', 'ترندي', 'تريند', 'تريندي', 'موضه', 'روش', 'روشه', 'trendy', 'trend', 'trending'],
  simple: ['بسيط', 'بسيطه', 'سمبل', 'سيمبل', 'ساده', 'simple', 'basic', 'baseet', 'basit'],
  understated: ['هادي', 'هاديه', 'مش ملفت', 'مش ملفته', 'مش مبهرج', 'مش مبهرجه', 'مش لافت', 'understated', 'low key', 'lowkey', 'subtle'],
};
const STYLE_KEYS = Object.keys(STYLE_WORDS);
const wordRe = (w) => new RegExp(`(^| )(?:و|ب|بال|ال|وال)?${w.replace(/ /g, ' ')}( |$)`);

/** الستايلات المذكورة في الرسالة (ممكن أكتر من واحد: «كاجوال شيك» = casual + elegant). المنفي («مش شيك») مايتحسبش. */
export function parseStyles(text) {
  const n = ` ${norm(text)} `;
  const out = [];
  for (const k of STYLE_KEYS) {
    for (const w of STYLE_WORDS[k]) {
      const re = wordRe(norm(w));
      if (!re.test(n)) continue;
      // «مش ملفت» عبارة نفي مقصودة (understated)، غير كده «مش X» = مش عايز الستايل ده
      if (!w.startsWith('مش ') && new RegExp(`(^| )(مش|بلاش|من غير|بدون) (?:و|ب|ال)?${norm(w)}( |$)`).test(n)) continue;
      out.push(k); break;
    }
  }
  return out;
}

/** كلمات ستايل بس (من غير مناسبة): «كاجوال» في قاموس المناسبات بتدّي خروجة؛ لو مفيش غيرها يبقى ستايل، مش مناسبة. */
const STYLE_ONLY_CTX_WORDS = /(^| )(كاجوال|كاجول|كازوال|casual|كجوال)( |$)/;
const CASUAL_OUTING_REAL = /(^| )(?:و|ل|لل|ال)?(خروجه|خروجات|مشوار|مشاوير|خروج|كافيه|كافيهات|مول|outing|going out|hangout|coffee|mall|kharga|5roga|5arga|5orog|mashwar|cafe|سيشن|تصوير|لبس يومي|يومي)( |$)/;
export function contextFromStyleOnly(text, context) {
  if (context !== 'casual_outing') return false;
  const n = ` ${norm(text)} `;
  return STYLE_ONLY_CTX_WORDS.test(n) && !CASUAL_OUTING_REAL.test(n);
}

// ---------- المناسبة ----------
const OCCASION_OF = {
  evening_out: 'evening', date_night: 'evening',
  wedding_guest: 'wedding', wedding_self: 'wedding',
  engagement_guest: 'engagement', engagement_self: 'engagement', katb_kitab: 'engagement',
  work_casual: 'work', work_formal: 'work',
  casual_outing: 'casual_outing', university: 'university', travel: 'travel', home: 'home',
  family_gathering: 'family_gathering', eid: 'eid', ramadan_iftar: 'ramadan_iftar', sahel_beach: 'beach',
  graduation: 'graduation', birthday_party: 'birthday_party', condolence: 'condolence', sport: 'sport',
};
/** اسم المناسبة العام من المفتاح الداخلي. «كاجوال» لوحدها ستايل → مفيش مناسبة. */
export function occasionOf(parsed) {
  if (!parsed?.context || parsed.flags?.ctxFromStyle) return null;
  return OCCASION_OF[parsed.context] || parsed.context;
}

// ---------- طلب عام من غير نوع ----------
const GENERIC_RE = /(^| )(?:و|ف|ب|ال)?(حاجه|حاجات|حاجتين|قطعه|قطع|لبس|لبسه|هدوم|اي حاجه|شي|شيء|حاجه حلوه|something|anything|outfit ideas|7aga|haga|7aja|7agat|lebs|7aaga)( |$)/;
const RECO_ONLY_RE = /(^| )(رشحيلي|رشحي لي|رشحيلى|رشحلي|ترشحيلي|ترشحلي|اقترحي|اقترحيلي|اقترح|اقترحلي|recommend|suggest|rasha7ili|rash7ili)( |$)/;
// طلب لوك كامل صريح: مش سؤال نوع، نسيبه للتخطيط القديم
const OUTFIT_RE = /(البس ايه|البس اي|هلبس ايه|نلبس ايه|ألبس إيه|اللبس ايه|اروح بايه|اروح بإيه|طقم كامل|لوك كامل|لوك|اوتفيت|outfit|من فوق لتحت|من راسي لرجلي|نسقيلي|نسقلي|تنسيق كامل|what to wear|wear what)/;
export function isGenericAsk(text) {
  const n = ` ${norm(text)} `;
  if (OUTFIT_RE.test(n)) return false;
  return GENERIC_RE.test(n) || RECO_ONLY_RE.test(n);
}
export function isOutfitAsk(text) { return OUTFIT_RE.test(` ${norm(text)} `); }

// ---------- ملابس داخلية/نوم: بطلب صريح بس ----------
export const INTIMATE_KEYS = new Set(['lingerie', 'sleepwear', 'robe', 'underwear']);
const INTIMATE_RE = /(لانجيري|لانجري|لينجري|لانجريه|لانجيريه|بيبي دول|babydoll|baby doll|lingerie|langerie|lanjery|قميص نوم|قمصان نوم|لبس نوم|ملابس نوم|بيجامه|بيجاما|بجامه|بجاما|بيجامات|روب|ارواب|برنس|نايت|nightgown|nightwear|sleepwear|pajama|pyjama|robe|ستيان|سنتيان|سوتيان|برا |اندر|داخلي|بوكسر|كلوت|underwear|بودي شيفون نوم)/;
export function explicitIntimate(text) { return INTIMATE_RE.test(` ${norm(text)} `); }

// ---------- أنواع مرفوضة («مش عايزة لانجيري» / «لا مش فستان») ----------
const FAMILY_WORDS = [
  ['lingerie', /(لانجيري|لانجري|لينجري|لانجريه|لانجيريه|بيبي دول|lingerie)/],
  ['dress', /(فستان|فساتين|الفستان|دريس|dress)/],
  ['set', /(طقم|اطقم|الطقم|set)/],
  ['top', /(بلوزه|بلوزات|البلوزه|توب|تيشيرت|قميص(?! نوم))/],
  ['skirt', /(جيبه|جيب|الجيبه|جونله|skirt)/],
  ['jeans', /(جينز|الجينز|jeans)/],
  ['bottoms', /(بنطلون|بناطيل|البنطلون|pants)/],
  ['jumpsuit', /(جمبسوت|جامبسوت|jumpsuit)/],
  ['sleepwear', /(قميص نوم|بيجامه|روب|لبس نوم)/],
  ['abaya', /(عبايه|عبايات|العبايه|abaya)/],
];
/** الأنواع اللي العميل رفضها صراحة في الرسالة: «مش عايزة X» / «لا مش X» / «بلاش X» / «من غير X». */
export function rejectedFamilies(text) {
  const n = ` ${norm(text)} `;
  const out = [];
  for (const [fam, re] of FAMILY_WORDS) {
    const src = re.source.slice(1, -1);
    if (new RegExp(`(^| )(مش عايز|مش عايزه|مش عاوز|مش عاوزه|مش|بلاش|من غير|بدون|مش محتاج|مش محتاجه|لا) (?:ال)?(?:${src})`).test(n)) out.push(fam);
  }
  return out;
}
export function familyOfKey(k) {
  if (!k) return null;
  if (/^dress_/.test(k)) return 'dress';
  return ({ lingerie: 'lingerie', sleepwear: 'sleepwear', robe: 'sleepwear', underwear: 'underwear', two_piece_set: 'set', classic_set: 'set', womens_suit: 'set', blouse: 'top', top: 'top', tshirt: 'top', shirt: 'top', tunic: 'top', polo: 'top', jumpsuit: 'jumpsuit', skirt: 'skirt', trousers: 'bottoms', jeans: 'jeans', chinos: 'bottoms', abaya: 'abaya', suit: 'suit', tuxedo: 'suit', blazer: 'blazer' })[k] || k;
}

// ---------- سؤال نوع المنتج ----------
const CHOICES = {
  women: [
    { value: 'dress_any', label: 'فستان', labelEvening: 'فستان سهرة', keys: /^dress_/ },
    { value: 'two_piece_set', label: 'طقم', keys: /^(two_piece_set|womens_suit)$/ },
    { value: 'jumpsuit', label: 'جمبسوت', keys: /^jumpsuit$/ },
    { value: 'blouse', label: 'بلوزة / توب', keys: /^(blouse|top|tunic)$/ },
    { value: 'skirt', label: 'جيبة', keys: /^skirt$/ },
    { value: 'trousers', label: 'بنطلون', keys: /^(trousers|jeans|chinos)$/ },
    { value: 'abaya', label: 'عباية', keys: /^abaya$/, modestOnly: true },
    { value: 'lingerie', label: 'لانجيري', keys: /^lingerie$/, eveningOnly: true },
  ],
  men: [
    { value: 'suit', label: 'بدلة', keys: /^(suit|tuxedo|classic_set)$/ },
    { value: 'shirt', label: 'قميص', keys: /^(shirt|polo)$/ },
    { value: 'blazer', label: 'بليزر', keys: /^blazer$/ },
    { value: 'trousers', label: 'بنطلون', keys: /^(trousers|chinos|jeans)$/ },
    { value: 'tshirt', label: 'تيشيرت', keys: /^tshirt$/ },
  ],
};
export const SMART_CASUAL = { value: 'smart_casual', label: 'حاجة كاجوال شيك' };
const FAMILY_OF_VALUE = { dress_any: 'dress', two_piece_set: 'set', jumpsuit: 'jumpsuit', blouse: 'top', skirt: 'skirt', trousers: 'bottoms', abaya: 'abaya', lingerie: 'lingerie', suit: 'suit', shirt: 'top', blazer: 'blazer', tshirt: 'top' };

/**
 * اختيارات نوع المنتج من الكتالوج الحقيقي: نوع مالوش منتج متاح للجمهور ده مايظهرش.
 * اللانجيري بيظهر كاختيار (مش ترشيح تلقائي) بس في السهرة، ومش مع «محتشم/فورمال»، ومش لو العميل رفضه.
 */
export function productTypeChoices({ aud, context, styles = [], rows = [], excluded = [] }) {
  const evening = context === 'evening_out' || context === 'date_night';
  const modest = styles.includes('modest');
  const formalish = styles.includes('formal') || /^work_/.test(context || '') || context === 'university';
  const casual = styles.includes('casual');
  const want = aud === 'men' ? ['men'] : aud === 'women' ? ['women'] : ['women', 'men'];
  const out = [];
  for (const side of want) {
    const genderOk = (g) => !g || g === 'unisex' || (side === 'women' ? (g === 'women' || g === 'women_hijab') : g === 'men');
    for (const c of CHOICES[side]) {
      if (excluded.includes(FAMILY_OF_VALUE[c.value])) continue;
      if (c.eveningOnly && (!evening || modest || formalish || casual || side !== 'women')) continue;
      if (c.modestOnly && !modest) continue;
      if (side === 'men' && (casual || context === 'casual_outing') && !styles.includes('formal') && (c.value === 'suit' || c.value === 'blazer')) continue; // كاجوال للرجالة: مش بدلة/بليزر
      if (!rows.some((p) => p && p.key && c.keys.test(p.key) && p.inStock !== false && !p.typeConflict && genderOk(p.gender))) continue;
      if (out.some((o) => o.value === c.value)) continue;
      out.push({ value: c.value, label: side === 'men' && want.length > 1 ? `${c.label} رجالي` : (evening && c.labelEvening ? c.labelEvening : c.label) });
    }
  }
  // ترتيب: السهرة → الفستان، وبعده اللانجيري (اختيار، مش ترشيح)؛ المحتشم → العباية الأول
  const isMen = (o) => / رجالي$/.test(o.label) || (aud === 'men');
  let women = out.filter((o) => !isMen(o)); const men = out.filter(isMen);
  if (modest) women.sort((a, b) => (b.value === 'abaya') - (a.value === 'abaya'));
  const ling = women.find((o) => o.value === 'lingerie');
  if (ling) women = [women[0], ling, ...women.slice(1).filter((o) => o !== ling)].filter(Boolean);
  const smart = !excluded.includes('smart_casual') && aud !== 'men' && !casual ? [{ ...SMART_CASUAL }] : [];
  // الجمهور مش معروف: اختيارات الستات + اختيار رجالي واحد عشان الراجل يقدر يجاوب برضه
  const list = aud === 'men' ? men.slice(0, 6) : aud === 'women' ? women.slice(0, 6) : [...women.slice(0, 5), ...men.slice(0, 1)];
  return [...list, ...smart];
}

/** نص السؤال: «أكيد ❤️ تحبي فستان سهرة، ولا لانجيري، ولا حاجة كاجوال شيك؟» من الاختيارات المتاحة فعلًا. */
export function productTypeQuestion(choices, aud) {
  const verb = aud === 'men' ? 'تحب' : 'تحبي';
  const names = (() => {
    const first = choices[0]; const ling = choices.find((c) => c.value === 'lingerie'); const smart = choices.find((c) => c.value === 'smart_casual');
    const pick = [first, ling || choices.find((c) => c !== first && c !== smart), smart || choices.find((c) => c !== first && c !== ling && c.value !== (ling || {}).value)].filter(Boolean);
    return [...new Set(pick.map((c) => c.label))];
  })();
  const list = names.length >= 2 ? `${names.slice(0, -1).join('، ولا ')}، ولا ${names[names.length - 1]}` : names[0] || 'نوع معين';
  return `أكيد ❤️ ${verb} ${list}؟ ولو في بالك نوع تاني اكتبهولي.`;
}

/** إجابة حرة معناها «سيبيها عليا / كاجوال شيك» */
export const SMART_CASUAL_RE = /(كاجوال شيك|شيك كاجوال|سمارت كاجوال|smart casual|اي حاجه|أي حاجة|مش فارق|مش فارقه|اختاري انتي|اختاري|سيبها عليكي|على ذوقك|علي ذوقك|زي ما تشوفي)/;

// ---------- مناسب للمناسبة/الستايل؟ (من بيانات المنتج بس) ----------
const SIG = {
  evening: {
    pos: [[/(ستان|ساتان|satin)/, 2], [/(شيفون|chiffon)/, 2], [/(دانتيل|lace)/, 2], [/(^| )تول( |$)|tulle/, 2], [/(مطرز|مطرزه|تطريز|embroider)/, 2], [/(ترتر|سيكوين|sequin)/, 2], [/(خرز|beads?)/, 2], [/(قطيفه|قطيفة|velvet)/, 2], [/(حرير|silk)/, 2], [/(سواريه|soiree)/, 2], [/(لامع|لامعه|glitter|shiny)/, 2], [/(كريب|crepe)/, 1], [/(طويل|ماكسي|maxi|long)/, 1], [/(سهره|سهرات|evening)/, 1]],
    neg: [[/(بيتي|للبيت|البيت|homewear|home wear)/, -4], [/(نوم|sleep|pajama|بيجام)/, -4], [/(رياضي|رياضه|sport)/, -3], [/(جينز|دنيم|denim|jeans)/, -3], [/(كاجوال|casual)/, -2], [/(يومي|daily)/, -2], [/(مريح)/, -1], [/(قطن|cotton)/, -1]],
    dept: [[/(occasion|evening|soiree|party|long_dresses|سهر)/, 2], [/(homewear|sleep|lingerie|underwear|sport|loungewear)/, -4]],
  },
  casual: { pos: [[/(كاجوال|casual)/, 2], [/(جينز|دنيم|denim)/, 2], [/(يومي|daily)/, 2], [/(قطن|cotton)/, 1], [/(مريح)/, 1], [/(سبور)/, 2]], neg: [[/(سواريه|soiree)/, -3], [/(ترتر|سيكوين)/, -2], [/(مطرز|تطريز)/, -1], [/(سهره)/, -1]], dept: [[/(casual)/, 1], [/(occasion|evening|soiree)/, -2]] },
  elegant: { pos: [[/(ستان|ساتان|شيفون|دانتيل|حرير|قطيفه|قطيفة)/, 1], [/(كريب|crepe)/, 1], [/(مطرز|تطريز)/, 1], [/(شيك|انيق|راقي)/, 1]], neg: [[/(بيتي|للبيت|نوم)/, -4], [/(رياضي|sport)/, -3], [/(جينز|دنيم)/, -1]], dept: [[/(homewear|sleep|sport)/, -3]] },
  formal: { pos: [[/(كريب|crepe)/, 2], [/(قماش)/, 1], [/(بليزر|blazer)/, 1], [/(رسمي|فورمال|formal|كلاسيك)/, 2], [/(بنطلون واسع)/, 1]], neg: [[/(جينز|دنيم)/, -2], [/(رياضي|sport)/, -3], [/(بيتي|نوم)/, -4], [/(كاجوال)/, -1]], dept: [[/(homewear|sleep|sport)/, -3]] },
  modest: { pos: [[/(محتشم|محتشمه)/, 3], [/(بكم|باكمام|كم طويل|باكمام طويله)/, 2], [/(واسع|واسعه|فضفاض)/, 1], [/(طويل|ماكسي)/, 1], [/(عبايه|عباية|abaya)/, 2]], neg: [[/(بدون اكمام|من غير اكمام|كت|سليفلس|sleeveless|حمالات)/, -4], [/(قصير|ميني|mini)/, -3], [/(شفاف|transparent)/, -3], [/(مفتوح|ضهر مفتوح|فتحه)/, -2], [/(كروب|crop)/, -3], [/(ضيق)/, -1]], dept: [[/(modest|hijab|abaya)/, 2], [/(lingerie|sleep|underwear)/, -4]] },
  simple: { pos: [[/(بسيط|بسيطه|ساده|basic)/, 2]], neg: [[/(ترتر|مطرز|تطريز)/, -1]], dept: [] },
  understated: { pos: [[/(هادي|ساده)/, 1]], neg: [[/(لامع|ترتر|سيكوين)/, -2]], dept: [] },
  trendy: { pos: [[/(ترند|موضه|جديد|اوفر سايز|oversize)/, 1]], neg: [], dept: [] },
};

/** النص اللي بنقيّم منه: اسم + وصف + خامة + تصنيف + خصائص (attrs_json) — كله من المحل. */
function productText(p) {
  let at = p.attrs_json; if (typeof at === 'string') { try { at = JSON.parse(at); } catch { at = at || ''; } }
  const attrs = at && typeof at === 'object' ? Object.values(at).flat().filter((v) => typeof v === 'string').join(' ') : String(at || '');
  return ` ${norm([p.name_ar, p.name_en, p.description_ar, p.description_en, p.material_ar, p.cat_text, attrs].filter(Boolean).join(' . '))} `;
}
const deptText = (p) => [p.department, p.dept_parent, p.dept_grand, p.dept_name].filter(Boolean).join(' ').toLowerCase();

// الإشارات بتتطابق ككلمة كاملة (مع بادئة و/ب/ال ولاحقة ه/ي): «ستان» جوه «فستان» مش ستان
const WORD_CACHE = new Map();
const asWord = (re) => {
  if (!WORD_CACHE.has(re)) WORD_CACHE.set(re, new RegExp(`(^|\\s)(?:و|ب|بال|ال|وال|لل)?(?:${re.source.replace(/\(\^\| \)|\( \|\$\)/g, '')})(?:ه|ة|ي|يه|ات)?(?=\\s|$)`, 'i'));
  return WORD_CACHE.get(re);
};
function scoreOn(table, txt, dept) {
  let s = 0; const why = [];
  for (const [re, w] of table.pos) if (asWord(re).test(txt)) { s += w; why.push(`+${re.source.split('|')[0].replace(/[()^$ ]/g, '')}`); }
  for (const [re, w] of table.neg) if (asWord(re).test(txt)) { s += w; why.push(`${w}:${re.source.split('|')[0].replace(/[()^$ ]/g, '')}`); }
  for (const [re, w] of table.dept || []) if (re.test(dept)) { s += w; why.push(`${w > 0 ? '+' : ''}${w}:dept`); }
  return { s, why };
}

/**
 * تقييم منتج لمناسبة/ستايل: { level: 'suitable'|'uncertain'|'unsuitable', score, why[] }.
 * - «سهرة» في العنوان إشارة ضعيفة (+1) بس: ماتخليش فستان بيتي قطن «مناسب».
 * - منتج مفيش في بياناته أي إشارة = uncertain (منقولش إنه مناسب ولا إنه مش مناسب).
 * - الرفض (unsuitable) بييجي من إشارات سلبية مكتوبة فعلًا، مش من غياب كلمة.
 */
// نوع القطعة نفسه (من القاموس) إشارة للسهرة: البدلة/التكسيدو رسمية بطبيعتها، الجينز/الرياضي لأ
const EVENING_BY_KEY = { suit: 2, tuxedo: 3, classic_set: 1, womens_suit: 1, heels_high: 1, clutch: 2, jeans: -3, sport_top: -3, sport_bottom: -3, tracksuit: -4, joggers: -3, hoodie: -2, shorts: -3, sneakers: -1, slippers: -4 };
export function occasionFit(p, { context = null, styles = [] } = {}) {
  const txt = productText(p); const dept = deptText(p);
  let occ = null;
  if (context === 'evening_out' || context === 'date_night') { occ = scoreOn(SIG.evening, txt, dept); const kw = EVENING_BY_KEY[p.key]; if (kw) { occ.s += kw; occ.why.push(`${kw > 0 ? '+' : ''}${kw}:key`); } }
  let st = 0; const why = occ ? [...occ.why] : [];
  let modestScore = null;
  for (const k of styles) {
    if (!SIG[k]) continue;
    const r = scoreOn(SIG[k], txt, dept); st += r.s; why.push(...r.why.map((w) => `${k}${w}`));
    if (k === 'modest') modestScore = r.s;
  }
  const base = occ ? occ.s : st;
  let level = base >= 2 ? 'suitable' : base <= -2 ? 'unsuitable' : 'uncertain';
  if (modestScore != null && modestScore <= -2) level = 'unsuitable'; // «بدون أكمام/قصير/شفاف» مكتوبة صراحة
  if (occ && styles.length && level === 'suitable' && st <= -3) level = 'uncertain';
  return { level, score: (occ ? occ.s : 0) + st, occScore: occ ? occ.s : null, why };
}

/** القطع اللي بنقيّمها للمناسبة (لبس)؛ الجزم/الشنط/الإكسسوار بيترتبوا بس، مابيتشالوش. */
export const APPAREL_FAMILIES = /^(dress_|blouse$|top$|tunic$|tshirt$|shirt$|polo$|two_piece_set$|womens_suit$|classic_set$|jumpsuit$|skirt$|trousers$|jeans$|chinos$|abaya$|suit$|blazer$|hijab_set$|sleepwear$|lingerie$|robe$|shorts$|leggings$|joggers$|hoodie$|sweater$)/;

/** كلمات المناسبة/الستايل/الطلب العام: بتتشال من البحث بالكلمات عشان «سهرة» ماتجيبش منتج لمجرد إن اسمه فيه «سهرة». */
export const SEARCH_NOISE = new Set(['سهره', 'سهرة', 'للسهره', 'للسهرة', 'بالسهره', 'السهره', 'سهرات', 'للسهرات', 'شيك', 'كاجوال', 'فورمال', 'رسمي', 'محتشم', 'محتشمه', 'بسيط', 'بسيطه', 'ترند', 'ترندي', 'حلوه', 'حلو', 'رشحيلي', 'رشحلي', 'اقترحي', 'اقترحيلي', 'النهارده', 'بكره', 'بالليل', 'sahra', 'evening', 'chic', 'casual']);
