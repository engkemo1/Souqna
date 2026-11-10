/**
 * محرك تويلا: رسالة (أو إجابة زرار) → رد جاهز. بدون موديل في المسار الأساسي.
 * runModa(messages, { products, profile, now, weatherMock, imageText, session, answers, llmExtract, fetcher })
 * بيرجع { ...response, session, parsed } — session بيتخزن عند العميل/السيرفر ويتبعت في الطلب الجاي.
 */
import { loadKnowledge } from './knowledge.js';
import { parseMessage } from './parse.js';
import { applyUnderstanding, rulesConfident } from './understand.js';
import { enrichAll } from './products.js';
import { planOutfit } from './plan.js';
import { respond, pick } from './respond.js';
import { guardResponse } from './guard.js';
import { matchFaq, faqAnswer } from './faq.js';
import { offersAnswer, careForShown } from './offers.js';
import { careFallback } from './parse.js';
import { DEFAULT_CONTACT, fillContact } from './contact.js';
import { matchStore, aspectsOf, mentionsStoreWord, storeAnswer, askWhichStore, allStoresHours, GENERIC } from './stores.js';
import { norm, trainingTokens } from './text.js';

function matchTrainedLesson(text, lessons) {
  if (!Array.isArray(lessons) || !lessons.length) return null;
  const nText = norm(text);
  if (!nText || nText.length < 3) return null;
  const qTokens = trainingTokens(nText);
  if (!qTokens.length) return null;
  const qSet = new Set(qTokens);

  let best = null;
  let maxScore = 0;

  for (const lesson of lessons) {
    if (lesson.status === 'draft') continue;
    const lTokens = trainingTokens(`${lesson.question} ${lesson.tags || ''} ${lesson.topic || ''}`);
    if (!lTokens.length) continue;

    const nQ = norm(lesson.question);
    if (nText === nQ || nText.includes(nQ) || (nQ.length >= 8 && nQ.includes(nText))) {
      const score = 20 + lTokens.length;
      if (score > maxScore) { maxScore = score; best = lesson; }
      continue;
    }

    let matches = 0;
    for (const t of qSet) {
      if (lTokens.includes(t)) matches += 1;
    }

    const ratio = matches / Math.min(qTokens.length, lTokens.length);
    if (matches >= 2 && ratio >= 0.35) {
      const score = matches * 3 + ratio * 2;
      if (score > maxScore) { maxScore = score; best = lesson; }
    }
  }

  return maxScore >= 6 ? best : null;
}

/** "طب ممكن ألبس إيه؟ / فيه بديل؟ / حاجة تانية" بعد رد ما لقاش المطلوب: العميل بيطلب بدائل لنفس المناسبة. */
const ALT_RE = /(البس|ألبس|الاقي|اجيب|اشتري|اختار)( [^ ]+){0,3} (ايه|اي|ايش)( |$)|(^| )(بديل|بدائل|البديل|حاجه تانيه|حاجات تانيه|مفيش غيره|ايه المتاح|ايه الموجود|ايه اللي موجود)( |$)/;
import { cairoParts, resolveEventTime, weatherAdvice } from './time.js';

const enrichedCache = new WeakMap();
function ensureEnriched(products, K) {
  if (!Array.isArray(products)) return [];
  if (products.length && products[0].formality !== undefined && 'inStock' in products[0]) return products;
  if (!enrichedCache.has(products)) enrichedCache.set(products, enrichAll(products, K));
  return enrichedCache.get(products);
}

const lastUserText = (messages) => {
  if (typeof messages === 'string') return messages;
  for (let i = (messages || []).length - 1; i >= 0; i -= 1) { const m = messages[i]; if (m && m.role === 'user') return typeof m.content === 'string' ? m.content : (m.content || []).map((c) => c.text || '').join(' '); }
  return '';
};

/** إجابات الأزرار → حقول parse. */
function applyAnswers(parsed, answers = {}, K) {
  const out = { ...parsed };
  for (const [id, v] of Object.entries(answers || {})) {
    if (id === 'who_is_it_for') {
      if (v === 'couple') out.persons = out.persons.length ? out.persons : ['men', 'women'];
      else if (v === 'family') out.persons = ['men', 'women', 'boys', 'girls'];
      else if (v === 'kids') out.persons = ['boys', 'girls'];
      else out.persons = [v];
    } else if (id === 'couple_who' || id === 'family_who' || id === 'kids_who') out.persons = [].concat(v);
    else if (id === 'what_occasion' && v !== 'other') { out.context = v; out.contextEffective = v; out.role = out.role || 'guest'; }
    else if (id === 'time_if_dressy') out.daypart = v;
    else if (id === 'budget') {
      out.flags = { ...out.flags, budgetFlexible: v === 'flexible' || (Array.isArray(v) && v[1] == null) };
      if (Array.isArray(v)) out.budget = { value: v[1] ?? null, kind: 'total' };
      else if (typeof v === 'number') out.budget = { value: v, kind: 'total' };
    } else if (id === 'color_preference') {
      out.flags = { ...out.flags, colorFlexible: v === 'any' };
      if (v !== 'any' && K.colors.has(v)) {
        out.flags.colorPreference = v;
        if (out.garments.length === 1) out.garments = out.garments.map((g) => ({ ...g, color: v }));
        else out.colors = [v];
      }
    } else if (id === 'dress_kind') out.garments = [{ key: v, color: null, material: null, text: v, position: 0 }];
    else if (id === 'taste_style') out.taste = [].concat(v);
    else if (id === 'engagement_role') { out.role = v === 'self' ? 'self' : 'guest'; if (v === 'self' && out.context === 'engagement_guest') out.contextEffective = 'engagement_self'; }
  }
  return out;
}

const mergeFromSession = (cur, prev) => {
  if (!prev) return cur;
  const m = { ...cur };
  m.flags = { ...(prev.flags || {}), ...(cur.flags || {}) };
  for (const k of ['persons', 'garments', 'colors', 'avoidColors', 'taste', 'ownedPieces']) if (!m[k]?.length && prev[k]?.length) m[k] = prev[k];
  for (const k of ['context', 'contextEffective', 'budget', 'daypart', 'dateOffsetDays', 'season']) if ((m[k] === null || m[k] === undefined) && prev[k] != null) m[k] = prev[k];
  if (!cur.context && prev.role) m.role = prev.role;
  return m;
};

/** قطع مذكورة في نص (حسب قاموس المرادفات) وغير موجودة في مجموعة المسموح بيها. بنعتبر البنطلون/الشينو والجزمة/اللوفر مجموعة واحدة. */
const EQUIV = [['trousers', 'chinos'], ['shirt', 'polo'], ['formal_shoes', 'loafers']];
export function strayGarments(K, text, allowedKeys) {
  const allowed = new Set(allowedKeys);
  for (const g of EQUIV) if (g.some((k) => allowed.has(k))) g.forEach((k) => allowed.add(k));
  const toks = norm(text).split(' ').filter(Boolean);
  const hay = new Set([` ${toks.join(' ')} `, ` ${toks.map((t) => t.replace(/^[وبلف](?=.{3,})/, '')).join(' ')} `]);
  const found = new Set();
  const extra = { boots: ['بوتس'] };
  for (const [key, aliases] of Object.entries(K.synonyms.garments)) {
    if (allowed.has(key)) continue;
    for (const a of [...aliases, ...(extra[key] || [])]) {
      const n = norm(a); if (n.length < 3) continue;
      if ([...hay].some((h) => h.includes(` ${n} `))) { found.add(key); break; }
    }
  }
  return [...found];
}
export async function runModa(messages, opts = {}) {
  const res = await runModaCore(messages, opts);
  return withMemory(res, opts);
}

/** اللي تويلا بتفتكره عن العميل بين الزيارات (بيتخزّن في متصفحه): آخر ميزانيه قالها، والفئه (رجالي/حريمي) لو حددها لواحد بس. */
function withMemory(res, opts) {
  if (!res || typeof res !== 'object') return res;
  const p = res.parsed || {};
  const remember = {};
  const v = Number(p.budget?.value);
  if (Number.isFinite(v) && v >= 100 && v <= 1000000 && p.budget?.kind === 'total' && !p.flags?.budgetFromProfile) remember.lastBudget = String(Math.round(v));
  if (Array.isArray(p.persons) && p.persons.length === 1 && (p.persons[0] === 'men' || p.persons[0] === 'women') && p.intent === 'shop') remember.audience = p.persons[0];
  let out = Object.keys(remember).length ? { ...res, remember } : res;
  if (out.parsed?.flags?.budgetFromProfile && out.blocks && !opts.session) out = { ...out, say: `${out.say}\nاستخدمت ميزانيتك المعتادة (${Number(out.parsed.budget.value).toLocaleString('en-US')} جنيه). قولي لو عايز تغيّرها.` };
  return out;
}

async function runModaCore(messages, opts = {}) {
  const K = loadKnowledge();
  const { products = [], offers = null, stores = null, contact = null, profile = {}, now = new Date(), weatherMock = null, imageText = '', session = null, answers = null, llmExtract = null, brain = null, curator = null, understand = null, fetcher, assistantName = null, training = null } = opts;
  const text = lastUserText(messages);
  const dow = cairoParts(now).dow;
  const seed = `${text}|${session?.turn || 0}`;
  let parsed = parseMessage(text, { profile, imageText, now, cairoDow: dow });
  let lang = parsed.lang === 'en' ? 'en' : 'ar';

  // ---------- ريست ----------
  if (parsed.followup === 'reset') {
    const res = respond({ state: 'chat', intent: 'greeting' }, { seed, lang, profile, assistantName });
    return { ...res, session: { turn: 1 }, parsed };
  }

  // ---------- أسئلة عن محل معيّن (رقمه/لوكيشنه/عنوانه/فروعه/مواعيده/سوشيال/بيبيع إيه/عروضه) ----------
  if (!(answers && Object.keys(answers).length) && !session?.pending && stores) {
    let list = [];
    try { list = typeof stores === 'function' ? stores() : stores; } catch { list = []; }
    if (Array.isArray(list) && list.length) {
      const aspects = aspectsOf(text);
      const asks = aspects.filter((a) => a !== 'all');
      const m = matchStore(text, list);
      const reply = (say, extra = {}) => ({ state: 'chat', intent: 'faq', faq: 'store', say: fillContact(say, contact), tips: [], styleTips: [], questions: [], blocks: null, ...extra, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } });
      if (m.store && !(parsed.garments.length && !aspects.length)) {
        let live = [];
        try { live = (typeof offers === 'function' ? offers() : Array.isArray(offers) ? offers : []).filter((o) => o.store === m.store.name_ar); } catch { live = []; }
        const out = storeAnswer(m.store, aspects, { products, offers: live, now });
        return reply(out.say, { storeCard: out.card });
      }
      if (m.ambiguous.length && aspects.length) return reply(`تقصد أنهي محل: ${m.ambiguous.slice(0, 5).map((s) => s.name_ar).join(' ولا ')}؟`);
      const isStoreQuery = (asks.length > 0 || mentionsStoreWord(text)) && !parsed.garments.length;
      if (!m.store && isStoreQuery && asks.some((a) => a !== 'offers') && !matchTrainedLesson(text, training?.lessons)) {
        if (asks.length === 1 && asks[0] === 'hours') {
          const h = allStoresHours(list, now);
          if (h) return reply(h);
          const ask = askWhichStore(list);
          if (ask) return reply(ask);
        }
        const STOP = new Set(['عاوز', 'عايز', 'عايزة', 'عاوزة', 'محتاج', 'محتاجة', 'فين', 'مكان', 'مكانها', 'مكانه', 'عنوان', 'عنوانه', 'عناوين', 'رقم', 'ارقام', 'نمرة', 'نمره', 'لوكيشن', 'موقع', 'موقعه', 'مواعيد', 'فروع', 'فرع', 'تليفون', 'واتس', 'واتساب', 'ازاي', 'اروح', 'اوصل', 'طريق', 'محل', 'المحل', 'محلات', 'المحلات', 'متجر', 'المتجر', 'ستور', 'الستور', 'store', 'shop', 'عندكم', 'عندكو', 'في', 'بنها', 'بتفتح', 'بيفتح', 'بتقفل', 'بيقفل', 'ساعات', 'امتي', 'امتى', 'فاتح', 'قافل', 'شغال', 'دلوقتي']);
        const strippedTokens = norm(text).split(' ').filter((w) => w.length >= 2 && !GENERIC.has(w) && !STOP.has(w));
        if (strippedTokens.length === 0) {
          const ask = askWhichStore(list);
          if (ask) return reply(ask);
        } else {
          const qName = strippedTokens.join(' ');
          return reply(`مش لاقية متجر مسجل باسم «${qName}» في بنها على الموقع. اتأكد من اسم المحل، أو قولي بتدور على إيه بالظبط (زي شوزات أو كوتشيات أو لبس) وأرشحلك المحلات المتاحة عندنا.`);
        }
      }
    }
  }

  // «عروض/خصومات على هودي»: بنعرض الخصومات الحقيقيه على النوع ده (لو فيه)، ولو مفيش بنكمل الطلب عادي.
  if (!(answers && Object.keys(answers).length) && !session?.pending && parsed.garments.length && !parsed.context && /(^| )(عروض|عرض|خصومات|خصم|تخفيضات|اوكازيون|اوكازيونات)( |$)/.test(parsed.normalized || norm(text))) {
    const keys = new Set(parsed.garments.map((g) => g.key));
    const real = offersAnswer({ offers: [], products: products.filter((p) => keys.has(p.key)), intro: 'دي أقوى الخصومات المتاحة على طلبك دلوقتي:' });
    if (real) return { state: 'chat', intent: 'faq', faq: 'discounts', say: real, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null }, };
  }

  // ---------- أسئلة الخدمة أو قواعد التدريب المعتمدة ----------
  const isQuestionOrInquiry = /(^| )(يعني ايه|ايه معنى|ايه معني|معنى|معني|ما هو|ما هي|ما الفرق|ايه الفرق|الفرق بين|الفرق مابين|لو حد سال|لو حد سأل|رشحي اولا|رشحي اول|احسن محل|احسن محلات|افضل محل|افضل محلات|فين الاقي|ازاي|كيف|طريقه|اعمل ايه|البس ايه|اختار ايه|تنصحيني|نصيحه|نصايح|قاعده|ينفع البس|ينفع ارجع|ينفع استبدل|لو المقاس|لو التيشرت|لو البنطلون|لو الهدوم|لو الطلب|علاج|حل لمشكله|طقم ل|طقم فرح|طقم جامعه|طقم انترفيو|يركب علي|يركب على|يركبوا|يمشوا مع بعض|يمشي مع|يليقوا مع بعض|يليق علي|يليق على|لايقين|تداري الكرش|يداري الكرش|تداري البطن|تخسسني|تنحفني|تبين طولي|تطولني|يطولني|متحررش|تطري علي الجسم|تطري على الجسم|متكتمش|تدفيني|سقعه|سقعة|برد الشتا|برد الشتاء|بتكش|بيكش|بيبهت|بتبهت|بيوبر|بتوبر|سيكا|للشقا|تستحمل بهدله|تستحمل بهدلة|تستحمل كرف|صيف وشتا|صيف وشتاء|ولا|احسن|افضل|يتلبس عليه|يتلبس معاه|يتلبس مع|يتلبس علي|يتلبس على|تتلبس عليها|تتلبس معاه|تتلبس مع|تتلبس علي|تتلبس على|البس عليه|البس معاه|مفتوح ولا مقفول|القوالب|قوالب|لحد الدور|نفس اسعار|نفس سعر|طويل ورفيع|مسلوع|قصير ومليان|افتح الشحنه|افتح الشحنة|افتح الاوردر|افتح الطلب|وزني|طولي|الموديل لابس|الموديل لابسه|الموديل لابسة|بتمط|ليكرا|استريتش|ناشفه وقافشه|ناشفة وقافشة|علي الطبيعه|على الطبيعة|زي الصوره|زي الصورة|فلاتر|كود الخصم|كوبون الخصم|مش شغال|بروموكود|احجز|احجزلي|حجز|اول الشهر|هتيجي تاني|هتوفر تاني|خلصت|فيزا مع المندوب|عيب صناعه|عيب صناعة|خياطه مقطوعه|خياطة مقطوعة|14 يوم|اربعتاشر يوم|ممنوع استرجاع|بياناتي|رقم تليفوني|خصوصيه|خصوصية|اهل العروسه|أهل العروسة|قعدة تعارف|عزاء|مأتم|امتحان شفوي|مناقشة تخرج|فاتح ولا غامق|اكسفورد|أكسفورد|مبيشفش|مبيشف|بيشف|غسيل البمب|الجواكت البمب|اشيل الوبر|شيل الوبر|مكنة الوبر|شوز قماش|كانفاس|كونفرس|فانس|كفر الجزار|بطا|دملو|جمجرة|ورورة|استلم في الشغل|استلم في الكلية|حد ادنى|حد أدنى|المندوب اتأخر|اتاخر|بينزل امتى|بيخلص امتى|ترانزيشنال|طرحه جوكر|طرحة جوكر|طرحه شيفون|طرحة شيفون|دريس كت|فستان كت|طرحه منقوشه|طرحة منقوشة|طرحه مشجره|طرحة مشجرة|عرض الكرافته|عرض الكرافتة|زرار البدله|زرار البدلة|منديل الجيب|منديل البدله|منديل البدلة|شراب مخفي|سوسته معلقه|سوستة معلقة|ريحه الكمكمه|ريحة الكمكمة|اصفرار الياقه|اصفرار الياقة|اوبن اير|فرح في جنينه|فرح في جنينة|بعد الساعه 5|بعد الساعة 5|منتج مختلف)( |$)/.test(norm(text));
  if (!(answers && Object.keys(answers).length) && !session?.pending && (!parsed.garments.length || isQuestionOrInquiry) && (!parsed.context || isQuestionOrInquiry) && !(parsed.followup && session?.parsed)) {
    const trained = matchTrainedLesson(text, training?.lessons);
    if (trained) {
      return { state: 'chat', intent: 'faq', faq: 'training', say: trained.answer, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
    }
    if (!parsed.garments.length) {
      const faq = matchFaq(text);
      let say = faq ? faqAnswer(faq, { lang, name: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], contact }) : null;
      if (faq === 'discounts' && !/(كود|كوبون|coupon|code)/i.test(text)) { // عروض حقيقيه لو موجوده، وإلا الرد العام
        let live = [];
        try { live = typeof offers === 'function' ? offers() : Array.isArray(offers) ? offers : []; } catch { live = []; }
        const real = offersAnswer({ offers: live, products });
        if (real) { say = real; lang = 'ar'; }
        else say = 'مفيش عروض أو خصومات شغالة على الموقع دلوقتي. لو اتضاف عرض هيظهر على المنتج وفي «عروض بنها». تقدر تقولي تدور على إيه وأرشحلك أحسن سعر متاح.';
      }
      if (say) return { state: 'chat', intent: 'faq', faq, say, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
  }

  // ---------- فهم الموديل أولاً (اختياري): Gemini/Claude يحوّل الرسالة لبيانات، والكود بيتحقق، والقواعد تكمّل ----------
  if (typeof understand === 'function' && !(answers && Object.keys(answers).length) && !session?.pending && parsed.intent === 'shop' && text.trim().length >= 8 && !rulesConfident(parsed, text)) {
    try {
      const u = await understand({ text, parsed });
      if (u) parsed = applyUnderstanding(parsed, u);
    } catch { /* نكمل بالقواعد */ }
  }
  if (parsed.intent === 'shop' && Array.isArray(training?.lessons)) {
    const trained = matchTrainedLesson(text, training.lessons);
    if (trained) {
      let storeList = [];
      try { storeList = typeof stores === 'function' ? stores() : stores || []; } catch { storeList = []; }
      const matchedStore = storeList.find((s) => trained.answer?.includes(s.name_ar) || trained.tags?.includes(s.slug) || (s.name_en && trained.tags?.toLowerCase().includes(s.name_en.toLowerCase())));
      if (matchedStore) {
        parsed.preferredStore = matchedStore.slug || matchedStore.name_ar;
        parsed.preferredStoreName = matchedStore.name_ar;
      }
    }
  }

  // ---------- دمج مع الجلسة ----------
  const hasAnswers = answers && Object.keys(answers).length;
  const wasUnknown = parsed.intent === 'unknown' && !hasAnswers;
  const altRequest = parsed.intent === 'unknown' && !hasAnswers && Boolean(session?.parsed?.context) && ALT_RE.test(norm(text));
  const continuing = session?.parsed && (altRequest || session.pending || parsed.intent === 'followup' || hasAnswers || (parsed.intent === 'shop' && !parsed.persons.length && !parsed.garments.length && session.parsed.persons?.length));
  if (hasAnswers) parsed = applyAnswers({ ...parsed, intent: 'shop' }, answers, K);
  if (continuing && (parsed.intent === 'shop' || parsed.intent === 'followup' || parsed.intent === 'unknown')) { parsed = mergeFromSession(parsed, session.parsed); parsed.intent = 'shop'; }
  if (altRequest) parsed = { ...parsed, garments: [], flags: { ...parsed.flags, altRequest: true } }; // اعرض تركيبة المناسبة بالمتاح بدل ما نكرر الطلب الناقص
  if (session?.pendingQuestion === 'budget' && /مش فارق|مش فارقة|براحتك|من غير ميزانية|any budget|flexible/i.test(parsed.normalized || '')) {
    parsed.budget = { value: null, kind: 'total' };
    parsed.flags = { ...parsed.flags, budgetFlexible: true };
  }
  if (session?.pendingQuestion === 'color_preference' && /أي لون|اي لون|مش فارق|مش فارقة|سيبها علي|اختاري|any color|no preference/i.test(parsed.normalized || '')) {
    parsed.flags = { ...parsed.flags, colorFlexible: true };
  }
  if (parsed.flags?.colorPreference && parsed.garments.length === 1) {
    parsed.garments = parsed.garments.map((g) => ({ ...g, color: parsed.flags.colorPreference }));
  } else if (parsed.garments.length === 1 && !parsed.garments[0].color && parsed.colors?.length === 1) {
    parsed.garments = parsed.garments.map((g) => ({ ...g, color: parsed.colors[0] }));
  }

  // ميزانيه معتاده من زياره سابقه: بتتطبق بس على طلب مناسبه/طقم من غير ميزانيه، ومتتقالش لو العميل حدد ميزانيه.
  if (parsed.intent === 'shop' && !parsed.budget?.value && profile?.lastBudget && !session?.parsed?.budget && !hasAnswers && (parsed.context || parsed.garments.length >= 2)) {
    const lb = Number(profile.lastBudget);
    if (Number.isFinite(lb) && lb >= 100 && lb <= 1000000) { parsed.budget = { value: lb, kind: 'total' }; parsed.flags = { ...parsed.flags, budgetFromProfile: true }; }
  }

  // ---------- متابعات ----------
  let excludeIds = []; const prevTotal = session?.lastTotal;
  // «ارخص»: بنجرّب سقف أقل مؤقتًا، لكنه مش ميزانية العميل: مايتحفظش في الجلسة ومايتقالش له «ميزانيتك».
  let derivedBudget = false;
  if (parsed.followup === 'cheaper' && prevTotal) { parsed.budget = { value: Math.max(100, Math.round((session.lastBudgetUsed || prevTotal) * 0.8 / 50) * 50), kind: 'total' }; derivedBudget = true; }
  if (parsed.followup === 'show_more') excludeIds = session?.shown || [];

  // ---------- فهم احتياطي بالموديل المجاني (اختياري) ----------
  // ---------- عقل الموديل (اختياري): يجاوب أي سؤال ويسأل سؤال واحد، أو يستخرج المطلوب ----------
  let brainUsed = false;
  const callBrain = async (facts = null) => {
    if (typeof brain !== 'function') return null;
    try { return await brain({ messages, rows: ensureEnriched(products, K), assistantName: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], lang, userBudget: parsed.budget?.value || null, facts, text }); } catch { return null; }
  };
  if (wasUnknown && !altRequest && typeof brain === 'function') {
    const b = await callBrain();
    if (b) {
      const slots = { persons: b.persons.length ? b.persons : parsed.persons, context: b.context || parsed.context, garments: b.garments.length ? b.garments.map((key) => ({ key, color: null, material: null, text: key, position: 0 })) : parsed.garments };
      const enough = slots.persons.length || slots.context || slots.garments.length;
      const merged = { ...parsed, ...slots, contextEffective: slots.context || parsed.contextEffective, colors: b.colors.length ? b.colors : parsed.colors, budget: b.budget ? { value: b.budget, kind: 'total' } : parsed.budget };
      if (b.ready && enough) { parsed = { ...merged, intent: 'shop', flags: { ...parsed.flags, brain: true } }; brainUsed = true; }
      else if (b.reply) {
        const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
        const keep = enough ? { ...merged, intent: 'shop', advice: null } : (session?.parsed || null);
        return { ...res, say: b.reply, intent: 'brain', session: { ...(session || {}), turn: (session?.turn || 0) + 1, ...(keep ? { parsed: keep, pending: Boolean(enough) } : {}) }, parsed };
      }
    }
  }

  if (parsed.intent === 'unknown' && !brain && typeof llmExtract === 'function') {
    try {
      const ex = await llmExtract(text);
      const valid = (list, set) => (Array.isArray(list) ? list.filter((x) => set.has(x)) : []);
      if (ex && typeof ex === 'object') {
        const persons = valid(ex.persons, new Set(['men', 'women', 'women_hijab', 'boys', 'girls']));
        const ctx = K.contexts.has(ex.context) && ex.context !== 'condolence' ? ex.context : null;
        const garments = valid(ex.garments, new Set(K.items.keys())).map((key) => ({ key, color: null, material: null, text: key, position: 0 }));
        if (persons.length || ctx || garments.length) { parsed = { ...parsed, intent: 'shop', persons: persons.length ? persons : parsed.persons, context: ctx, contextEffective: ctx, garments }; parsed.flags = { ...parsed.flags, llm: true }; }
      }
    } catch { /* نكمل بدونه */ }
  }

  let advice = parsed.advice ? K.phrases.advice.items.find((a) => a.id === parsed.advice.id) : null;
  let materialNote = '';
  if (advice?.care && advice.id === 'care_general') { // القطعه اللي اتعرضت للعميل ليها خامه مكتوبه من المحل: نرد على خامتها
    const byId = new Map(products.map((p) => [p.id, p]));
    const sp = (session?.shown || []).map((id) => byId.get(id)).find((p) => p?.material_ar && String(p.material_ar).trim());
    if (sp) {
      const mat = String(sp.material_ar).trim();
      const cid = careFallback(norm(mat), K, { allowGeneral: false });
      const alt = cid ? K.phrases.advice.items.find((a) => a.id === cid) : null;
      if (alt) advice = alt;
      materialNote = `خامة «${sp.name_ar}» حسب المحل: ${mat}.`;
    }
  }
  if (parsed.intent === 'unknown') {
    const trained = matchTrainedLesson(text, training?.lessons);
    if (trained) {
      return { state: 'chat', intent: 'faq', faq: 'training', say: trained.answer, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
    }
  }
  if (parsed.intent !== 'shop') {
    const res = respond({ state: 'chat', intent: parsed.intent === 'followup' ? 'unknown' : parsed.intent }, { seed, lang, profile, advice, assistantName });
    if (advice?.care && res.say) { const mine = careForShown(session?.shown || [], products); res.say = [materialNote, res.say, mine].filter(Boolean).join('\n\n'); }
    return { ...res, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  }

  // ---------- وقت ----------
  const eventTime = resolveEventTime(parsed, { now });
  // Weather API disabled for latency, but compute advice if weatherMock is passed (e.g. in tests)
  const adv = weatherMock ? weatherAdvice(weatherMock, eventTime) : null;

  // ---------- تخطيط ----------
  let rows = ensureEnriched(products, K);
  let plan = planOutfit(parsed, excludeIds.length ? rows.filter((p) => !excludeIds.includes(p.id)) : rows, { adv, eventTime, profile, K });
  if (excludeIds.length && plan.state === 'none') plan = planOutfit(parsed, rows, { adv, eventTime, profile, K });

  // المطلوب بالاسم مش متاح بس المناسبة معروفة: نجرّب تركيبة المناسبة بالمتاح ونسيب زرار "اطلبه" للقطعة الناقصة
  if (plan.state === 'none' && parsed.context && parsed.garments.length) {
    const alt = planOutfit({ ...parsed, garments: [] }, rows, { adv, eventTime, profile, K });
    if (['full', 'alternatives', 'partial', 'over_budget'].includes(alt.state) && alt.people.some((p) => p.picks.length)) {
      const wanted = plan.missing.map((m) => m.base);
      alt.people.forEach((person) => { const orig = plan.people.find((o) => o.aud === person.aud) || plan.people[0]; person.missing = [...(orig?.missing || []), ...person.missing.filter((m) => !(orig?.missing || []).some((o) => o.base === m.base))]; });
      plan = { ...alt, missing: [...plan.missing, ...alt.missing.filter((m) => !wanted.includes(m.base))], altFor: wanted };
    }
  }

  // (طلب قطعة معينة زي "كوتشي يليق على قميصي" مش طلب طقم: المنسّق ما بيتدخلش عشان ما يضيفش قطع ما طلبهاش العميل)
  // منسّق الذكاء الاصطناعي: بيرشّح الطقم من منتجاتنا الحقيقية الأول، وأي قطعة ناقصة بيقترحها من بره كزرار "اطلبه".
  // أي فشل/رد غلط/تعدّي ميزانية = نكمل بترشيح القواعد.
  let curated = false;
  if (typeof curator === 'function' && plan.context && !(parsed.garments || []).length && ['full', 'alternatives', 'partial', 'over_budget'].includes(plan.state) && !plan.ask?.length) {
    try {
      const cp = await curator({ plan, rows, parsed, adv, eventTime, K, lang, assistantName: typeof assistantName === 'string' ? assistantName : assistantName?.[lang] });
      if (cp) { plan = cp; curated = true; }
    } catch { /* نكمل بالقواعد */ }
  }
  // Finish every clarification before showing picks. Questions should not be
  // buried after a partial or low-confidence product result.
  // طلب قطعة/صورة من غير مناسبة: النتايج تظهر على طول والأسئلة (لون/ميزانية) اختيارية تحتها. لوك المناسبة (خطوبة/فرح…) بيفضل يخلّص أسئلته الأول.
  const needsClarificationFirst = plan.state === 'clarify' || (Boolean(plan.ask?.length) && plan.state !== 'none' && Boolean(plan.context));
  // أسماء القطع والتابات عربي بس: لما نعرض منتجات نرد بالعربي حتى لو الطلب بحروف لاتينية (shoes / hoodie aswad)، بدل رد نص إنجليزي وأسماء عربي مخلوطين.
  if (!(needsClarificationFirst || ['clarify', 'chat', 'no_look'].includes(plan.state))) lang = 'ar';
  let res = respond(needsClarificationFirst ? { ...plan, state: 'clarify' } : plan, { seed, lang, profile, assistantName });
  if (typeof brain === 'function' && ['none', 'no_look', 'partial'].includes(plan.state) && !needsClarificationFirst) {
    const avail = [...new Set((plan.people || []).flatMap((p) => p.picks.map((x) => x.product.key)).filter(Boolean))];
    const b = await callBrain({ result: plan.state, requested: parsed.garments.map((x) => x.key), occasion: parsed.context || null, missing: (plan.missing || []).map((m) => m.base).filter(Boolean), availableAlternativeTypes: avail, note: 'Say honestly what is not available, mention the closest alternatives shown below your reply, and ask ONE short question to refine (budget, style or colour).' });
    // رد الموديل ما يتقبلش لو بيذكر قطع مش في النتيجة (مثلاً هودي/جينز/بوتس وإحنا عارضين بنطلون وكوتشي).
    const planKeys = new Set([...avail, ...(plan.missing || []).map((m) => m.base), ...parsed.garments.map((x) => x.key), ...(plan.people || []).flatMap((p) => p.picks.flatMap((x) => String(x.slotKey || '').split('|')))].filter(Boolean));
    const stray = b?.reply ? [...strayGarments(K, b.reply, planKeys), ...(!avail.length && /(هتلاقي|هتلاقى|هتلاقو|ستجد|you'll find|you will find).{0,40}(تحت|below)/i.test(b.reply) ? ['claims_items_below'] : [])] : [];
    if (b?.reply && !stray.length) { res = { ...res, say: b.reply, brainReply: true }; brainUsed = true; }
    else if (b?.reply) res = { ...res, brainRejected: stray };
  }
  const g = guardResponse(res, { lang });
  if (!g.ok) res = { ...res, say: pick(K.phrases.ar.fallback_generic, seed), guard: g.problems };

  if (parsed.preferredStoreName && !needsClarificationFirst && ['full', 'alternatives', 'partial'].includes(plan.state) && !res.say?.includes(parsed.preferredStoreName)) {
    res = { ...res, say: `رشحتلك أولاً من كولكشن «${parsed.preferredStoreName}» في بنها:\n\n${res.say}` };
  }
  if (derivedBudget && plan.state === 'over_budget' && plan.total > 0) res = { ...res, say: `ده أرخص اختيار لقيته لطلبك دلوقتي: ${Number(plan.total).toLocaleString('en-US')} جنيه. لو عندك ميزانية معينة قوليلي رقمها بالظبط وأدورلك جواها.` };
  if (parsed.followup === 'show_more' && excludeIds.length && plan.people?.length && !needsClarificationFirst) {
    const ids = plan.people.flatMap((p) => p.picks.map((x) => x.product.id));
    if (ids.length && ids.every((id) => excludeIds.includes(id))) res = { ...res, say: 'ده اللي متاح دلوقتي لطلبك، ومفيش بدائل تانية غيره. لو عايز، غيّر اللون أو النوع أو الميزانية وأدورلك تاني.' };
  }
  const shown = !needsClarificationFirst && plan.people ? plan.people.flatMap((p) => p.picks.map((x) => x.product.id)) : [];
  const nextSession = {
    turn: (session?.turn || 0) + 1, parsed: { ...parsed, advice: null, ...(derivedBudget ? { budget: session?.parsed?.budget ?? null } : {}) }, pending: plan.state === 'clarify' || Boolean(plan.ask?.length), pendingQuestion: plan.ask?.[0] || null, shown: [...new Set([...(session?.shown || []), ...shown])].slice(-60),
    lastState: plan.state, lastTotal: needsClarificationFirst ? (session?.lastTotal ?? null) : (plan.total ?? null), lastBudgetUsed: needsClarificationFirst ? (session?.lastBudgetUsed ?? null) : (plan.budget ?? plan.total ?? null),
  };
  return { ...res, session: nextSession, parsed, curated, debug: { eventTime } };
}
