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
import { keywordSearch } from './search.js';
import { offersAnswer, careForShown } from './offers.js';
import { careFallback } from './parse.js';
import { DEFAULT_CONTACT, fillContact } from './contact.js';
import { buildKb } from './kb.js';
import { matchStore, aspectsOf, mentionsStoreWord, storeAnswer, askWhichStore, allStoresHours, GENERIC } from './stores.js';
import { norm, trainingTokens } from './text.js';
import { isContinuationRequest, isSameGarmentReference, resolvePinnedItems, auditPlanPicks, resolveAnchor, pronounAuds, needsWhoPart } from './continuity.js';

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
    else if (id === 'gift_for') out.flags = { ...out.flags, gift: true };
    else if (id === 'who_is_it_for_flag') out.flags = { ...out.flags, audienceAsked: true };
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
    } else if (id === 'size_needed') {
      if (v && v !== 'unknown') out.flags = { ...out.flags, size: String(v).toUpperCase() };
      else out.flags = { ...out.flags, sizeSkipped: true };
    } else if (id === 'dress_kind') out.garments = [{ key: v, color: null, material: null, text: v, position: 0 }];
    else if (id === 'taste_style') out.taste = [].concat(v);
    else if (id === 'modest_preference') {
      out.flags = { ...out.flags, hijabAsked: true, notHijab: v === 'regular' };
      if (v === 'hijab' || v === 'modest') out.persons = out.persons.map((a) => (a === 'women' ? 'women_hijab' : a));
    } else if (id === 'women_style') out.flags = { ...out.flags, womenStyle: v === 'dress' || v === 'set' ? v : 'any' };
    else if (id === 'engagement_role') { out.flags = { ...out.flags, roleAsked: true }; out.role = v === 'self' ? 'self' : 'guest'; if (v === 'self' && out.context === 'engagement_guest') out.contextEffective = 'engagement_self'; }
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
  // «لا اسود» / «خليه كحلي»: لون جديد في الرسالة بيغيّر لون القطعة الوحيدة المطلوبة قبل كده
  if (!cur.garments?.length && cur.colors?.length === 1 && prev.garments?.length === 1) { m.garments = [{ ...prev.garments[0], color: cur.colors[0] }]; m.colors = []; }
  if (cur.avoidColors?.length && Array.isArray(m.garments)) m.garments = m.garments.map((g) => (g.color && cur.avoidColors.includes(g.color) ? { ...g, color: null } : g));
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

/** الجلسة جاية من المتصفح: ما نثقش في شكلها. بنظّفها عشان أي قيمة غريبة ماتوقعش المحرك. */
function cleanSession(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const arr = (v) => (Array.isArray(v) ? v : []);
  const objs = (v) => arr(v).filter((x) => x && typeof x === 'object' && !Array.isArray(x));
  const strs = (v) => arr(v).filter((x) => typeof x === 'string');
  const look = (l) => (l && typeof l === 'object' && !Array.isArray(l) ? { ...l, items: objs(l.items), persons: strs(l.persons) } : null);
  const out = { ...s, turn: Number.isFinite(Number(s.turn)) ? Number(s.turn) : 0, shown: arr(s.shown).filter((x) => typeof x === 'number' || typeof x === 'string') };
  out.parsed = s.parsed && typeof s.parsed === 'object' && !Array.isArray(s.parsed) ? { ...s.parsed, garments: objs(s.parsed.garments), persons: strs(s.parsed.persons), colors: strs(s.parsed.colors), avoidColors: strs(s.parsed.avoidColors), taste: strs(s.parsed.taste), ownedPieces: objs(s.parsed.ownedPieces), flags: s.parsed.flags && typeof s.parsed.flags === 'object' ? s.parsed.flags : {} } : null;
  out.activeLook = look(s.activeLook);
  out.lookHistory = arr(s.lookHistory).map(look).filter(Boolean);
  return out;
}

async function runModaCore(messages, opts = {}) {
  const K = loadKnowledge();
  const { products = [], offers = null, stores = null, contact = null, profile = {}, now = new Date(), weatherMock = null, imageText = '', session: rawSession = null, answers: rawAnswers = null, llmExtract = null, brain = null, curator = null, understand = null, verifier = null, fetcher, assistantName = null, training = null } = opts;
  const session = cleanSession(rawSession);
  const answers = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers) ? rawAnswers : null;
  const text = (() => {
    let t = lastUserText(messages);
    // «لازرق / لاسود / لكحلي» = «ازرق…» (حرف اللام لزق في اللون)
    t = t.replace(/(^|\s)ل([اأإ](?:زرق|حمر|سود|بيض|خضر|صفر|سمر)|كحلي|بيج|رمادي|بني|وردي|بنفسجي|برتقالي|ذهبي|فضي|بوردو|زيتي)(?=\s|$)/g, '$1$2');
    // مقاس لوحده بعد طلب قبل كده («XL» / «لا 43» / «خليه L»)
    const mm = t.trim().match(/^(?:لا |لأ |بل |خليه |خليها |هاته |هاتها |مقاسي )?(xxs|xs|s|m|l|xl|xxl|xxxl|[3-5][0-9])$/i);
    if (mm && rawSession?.parsed?.garments?.length) t = `مقاس ${mm[1]}`;
    return t;
  })();
  const dow = cairoParts(now).dow;
  const seed = `${text}|${session?.turn || 0}`;
  let parsed = parseMessage(text, { profile, imageText, now, cairoDow: dow });
  // نصيحة «الأبيض في الفرح» مالهاش علاقة بقميص أبيض عادي من غير مناسبة
  if (parsed.advice?.id === 'white_at_wedding' && (!/(فرح|خطوب|كتب كتاب|ضيف|ضيفه|عروس|عروسه|حفل|مناسب|wedding|engagement|guest)/.test(norm(text)) || !/(فستان|فساتين|dress|جيبه|عباي)/.test(norm(text)))) parsed = { ...parsed, advice: null, intent: parsed.garments.length ? 'shop' : 'unknown' };
  // «الجو حر / برد»: نفترض خروجة عادية بموسم مناسب
  if (parsed.intent === 'unknown' && !parsed.garments.length && /(^| )(الجو|الدنيا|الطقس|النهارده الجو)( [^ ]+){0,2} (حر|حاره|حار|برد|بارد|سقعه|ساقع|شتا|صيف|مولع|بيغلي)( |$)/.test(norm(text))) {
    const hot = /(حر|حاره|حار|صيف|مولع|بيغلي)/.test(norm(text));
    parsed = { ...parsed, intent: 'shop', context: 'casual_outing', contextEffective: 'casual_outing', season: hot ? 'summer' : 'winter', flags: { ...parsed.flags, colorFlexible: true } };
  }
  if (/(^| )مدرس[هة]( |$)/.test(norm(text)) && (parsed.context === 'graduation' || parsed.context === 'university')) parsed = { ...parsed, context: null, contextEffective: null };
  if (/(^| )مدرس[هة]( |$)/.test(norm(text)) && !parsed.context && (parsed.persons.includes('boys') || parsed.persons.includes('girls') || /(ابني|بنتي|ولدي|اولادي|ولادي|بناتي|عيل|طفل)/.test(norm(text))) && !parsed.garments.length) parsed = { ...parsed, intent: 'shop', persons: parsed.persons.length ? parsed.persons : (/(بنتي|بناتي)/.test(norm(text)) ? ['girls'] : ['boys']), flags: { ...parsed.flags, colorFlexible: true } };
  // «عندي قميص أزرق نسقلي عليه / عاوز حاجة تمشي معاه»: قطعة معاه + طلب تنسيق = طلب شراء حول القطعة
  if (parsed.intent === 'unknown' && parsed.ownedPieces?.length && !parsed.garments.length && /(نسق|طقم|لوك|عليه|عليها|عليهم|اكمل|يمشي|يليق|معاه|معاها|حاجه|اجيب|اشتري|ينفع|يتلبس)/.test(norm(text))) parsed = { ...parsed, intent: 'shop', fullLook: true };
  let lang = parsed.lang === 'en' ? 'en' : 'ar';
  // «نسقلي طقم على القطعة دي / على جاكيت X»: القطعة هي اللي معاه، والمطلوب باقي الطقم
  if (!(answers && Object.keys(answers).length) && parsed.garments.length && !parsed.ownedPieces?.length && /(نسق|نسقلي|اطقم|طقم|لوك|اطلاله|تنسيق)[^؟?]*?(علي|على|حوالين|مع|يليق|يلبس|تليق)|(علي|على|حوالين|مع) (القطع[هة]|الجاكيت|القميص|البنطلون|الفستان|البدل[هة]|الحذاء) (دي|ده|دا)/.test(norm(text)) && !/(عاوز|عايز|محتاج|هاتلي)\s+(?:\S+\s+){0,2}(?:جاكيت|قميص|بنطلون|فستان|بدل[هة]|حذاء|جزم[هة])\s*$/.test(norm(text))) {
    parsed = { ...parsed, ownedPieces: parsed.garments.map((g) => ({ key: g.key, color: g.color || null, material: g.material || null, text: g.text })), garments: [], fullLook: true };
  }

  const searchReply = (hits, sayText = null) => {
    const items = hits.map((p) => ({ id: p.id, key: p.key, label: String(K.items.get(p.key)?.ar || '').replace(/\s*\(.*?\)\s*/g, '').split(' / ')[0].trim() || (p.cat_text || '').split(' ')[0] || 'منتج', name: p.name_ar || p.name_en, price: p.price, store: p.store_slug || null, image: p.image || p.image_url || p.thumb || null, colors: p.colorKeys || [] }));
    return { state: 'full', intent: 'shop', say: sayText || (hits.length === 1 ? 'لقيتلك ده في المحلات:' : 'دي اللي لقيتها في المحلات ليك:'), tips: [], styleTips: [], questions: [], missing: [], relaxed: [], parsed,
      blocks: { tabs: [{ id: 'search', label: 'النتايج', look: null, items, subtotal: items.reduce((t, i) => t + (Number(i.price) || 0), 0), missing: [] }], total: 0, budget: null, over: 0, palette: [], couple: false },
      session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: session?.parsed || null, pending: false, pendingQuestion: null, shown: [...new Set([...(session?.shown || []), ...hits.map((h) => h.id)])] } };
  };
  // ---------- ريست ----------
  if (parsed.followup === 'reset') {
    const res = respond({ state: 'chat', intent: 'greeting' }, { seed, lang, profile, assistantName });
    return { ...res, session: { turn: 1 }, parsed };
  }

  // حقائق حقيقية (منتجات/محلات) للعقل: ممنوع يجاوب عن منتج أو محل بحاجة مش فيها
  const kbText = () => {
    let list = []; try { list = typeof stores === 'function' ? stores() : stores || []; } catch { list = []; }
    let c = contact; try { c = typeof contact === 'function' ? contact() : contact; } catch { c = null; }
    try { return buildKb({ products: ensureEnriched(products, K), lookItems: session?.activeLook?.items || [], stores: list, text, contact: c }); } catch { return ''; }
  };
  // ---------- أسئلة عن محل معيّن (رقمه/لوكيشنه/عنوانه/فروعه/مواعيده/سوشيال/بيبيع إيه/عروضه) ----------
  if (!(answers && Object.keys(answers).length) && !session?.pending && stores) {
    let list = [];
    try { list = typeof stores === 'function' ? stores() : stores; } catch { list = []; }
    if (Array.isArray(list) && list.length) {
      const aspects = aspectsOf(text);
      const asks = aspects.filter((a) => a !== 'all');
      const m = matchStore(text, list);
      const reply = (say, extra = {}) => ({ state: 'chat', intent: 'faq', faq: 'store', say: fillContact(say, contact), tips: [], styleTips: [], questions: [], blocks: null, ...extra, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } });
      const nameHit = m.store && [m.store.name_ar, m.store.name_en].some((n) => n && norm(text).includes(norm(n)));
      if (m.store && !(parsed.garments.length && !aspects.length) && !(parsed.garments.length && !nameHit)) {
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

  // ---------- أسئلة عامة من بيانات الموقع الفعلية: ماركات / الأكتر مبيعًا / الجديد / «أرخص من X» ----------
  if (!(answers && Object.keys(answers).length) && !session?.pending && !parsed.garments.length && !parsed.context) {
    const n = norm(text);
    const live = ensureEnriched(products, K).filter((p) => p && p.inStock !== false && !p.typeConflict && Number(p.photo_mismatch) !== 1);
    const diverse = (list, per = 2, max = 6) => { const cnt = new Map(); const out = []; for (const p of list) { const k = p.key || p.cat_text || 'x'; if ((cnt.get(k) || 0) >= per) continue; cnt.set(k, (cnt.get(k) || 0) + 1); out.push(p); if (out.length >= max) break; } return out; };
    const numTxt = (n.match(/(?:ارخص من|اقل من|اقل|تحت|لحد|بحد|بحد اقصي|في حدود|حوالي|ميزانيتي|ب)\s*(\d{2,6})/) || n.match(/(\d{2,6})\s*(?:جنيه|ج|egp)(?: او اقل| بس)?( |$)/) || [])[1];
    if (/(^| )(ماركات|ماركه|براند|براندات|brand|brands)( |$)/.test(n)) {
      let list = []; try { list = typeof stores === 'function' ? stores() : stores || []; } catch { list = []; }
      const names = (Array.isArray(list) ? list : []).map((x) => x.name_ar || x.name_en).filter(Boolean);
      if (names.length) return { state: 'chat', intent: 'faq', faq: 'brands', say: `الماركات على Twist هي المحلات نفسها (كل محل بيبيع ماركته). المحلات الموجودة دلوقتي: ${names.slice(0, 15).join('، ')}${names.length > 15 ? ' وغيرها' : ''}. قولّي اسم المحل وأوريك منتجاته، أو قولّي بتدور على إيه.`, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
    if (/(الاكتر|اكتر|الاكثر|اكثر|اعلي)( \S+)?( \S+)? (مبيعا|مبيع|طلبا|بيعا|بتتباع|بيتباع|مطلوب|مطلوبه)|(^| )(ترند|trending|best seller|bestseller|الاشهر|اشهر|الاكتر مبيعا|الاكثر مبيعا)( |$)/.test(n)) {
      const sold = live.filter((p) => Number(p.sold_count) > 0).sort((a, b) => Number(b.sold_count) - Number(a.sold_count));
      if (sold.length >= 2) return searchReply(diverse(sold), 'دي أكتر القطع اللي بتتباع على Twist:');
      const featured = live.filter((p) => Number(p.featured) > 0);
      const fall = diverse(featured.length ? featured : [...live].sort((a, b) => Number(b.id) - Number(a.id)));
      if (fall.length) return searchReply(fall, 'لسه مفيش مبيعات كفاية أحسب منها الأكتر طلبًا، فدي أحدث وأبرز القطع المتاحة:');
    }
    if (/(^| )(الجديد|جديد|احدث|اخر ما وصل|وصل حديثا|وصلنا|وصل جديد|new arrivals|new|كل المنتجات|كل حاجه عندكم|كل اللي عندكم|اتفرج|اتفرج علي|اشوف كل حاجه|اشوف كل المنتجات|ورينا كل حاجه)( |$)/.test(n) && n.split(' ').length <= 6) {
      const fresh = diverse([...live].sort((a, b) => Number(b.id) - Number(a.id)));
      if (fresh.length) return searchReply(fresh, 'دي أحدث القطع اللي اتضافت:');
    }
    if (numTxt && !(session?.parsed?.context || session?.parsed?.garments?.length) && /(ارخص|اقل|تحت|لحد|بحد|حدود|ميزاني|جنيه|ج\b|بسعر|سعر)/.test(n) && n.split(' ').length <= 8) {
      const max = Number(numTxt);
      const under = live.filter((p) => Number(p.price) > 0 && Number(p.price) <= max).sort((a, b) => Number(a.price) - Number(b.price));
      if (under.length) return searchReply(diverse(under, 1, 6), `دي أرخص القطع المتاحة في حدود ${max} جنيه:`);
      const cheapest = [...live].filter((p) => Number(p.price) > 0).sort((a, b) => Number(a.price) - Number(b.price))[0];
      if (cheapest) return { state: 'chat', intent: 'faq', faq: 'budget_browse', say: `مفيش قطع متاحة بأقل من ${max} جنيه دلوقتي. أرخص قطعة عندنا «${cheapest.name_ar}» بـ ${Number(cheapest.price).toLocaleString('en-US')} جنيه. قولّي تدور على إيه وأظبطلك على ميزانيتك.`, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
  }

  // ---------- «إيه رأيك في كذا؟»: الموديل يرد برأي حقيقي، ولو العميل وافق نجيبله المتاح عندنا ----------
  const noAnswers = !(answers && Object.keys(answers).length);
  const nOp = norm(text);
  if (noAnswers && (session?.opinionOffer || session?.altOffer) && session?.parsed && /^(تمام|ماشي|حلو|حلوه|عجبني|عجبتني|ايوه|ايوا|اه|اها|اوك|اوكي|ok|اكيد|طبعا|هاتلي|هاتها|هاتهالي|هاتو|وريني|ورني|وريهالي|ورينا|ورنا|عايز اشوف|عاوز اشوف|اوريها|يلا|ياريت)( |$)/.test(nOp) && nOp.split(' ').length <= 6) {
    const ao = session.altOffer;
    const base = ao ? { ...session.parsed, garments: (session.parsed.garments || []).map((g) => (g.key === ao.wanted ? { ...g, key: ao.type, color: null, text: ao.type } : g)) } : session.parsed;
    parsed = { ...base, intent: 'shop', followup: null, flags: { ...(base.flags || {}), fromOpinion: true, roleAsked: true, budgetFlexible: true } };
  } else if (noAnswers && typeof brain !== 'function' && !parsed.garments.length && /(تخين|تخينه|تخينة|نحيف|نحيفه|نحيفة|قصير|قصيره|قصيرة|طويل جدا|سمراء|سمرا|بشرتي|مثلث|كمثري|حامل|حمل|ممتلئ|وزني|كرش)/.test(nOp) && nOp.split(' ').length >= 2 && [null, 'unlisted_item'].includes(matchFaq(text))) {
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: 'تمام، عشان أرشحلك اللي يناسبك صح قولي: اللبس لأنهي مناسبة، وطولك ووزنك (أو مقاسك)، والقطعة اللي عاوزها لو في حاجة معينة. وأنا أدورلك في المتاح عندنا.', intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  } else if (noAnswers && typeof brain !== 'function' && !parsed.garments.length && !parsed.context && nOp.split(' ').length >= 3 && /(رايك|رايكم|تشوف|شايف|احسن ولا|افضل ولا|محتار|مش عارف اختار)/.test(nOp)) {
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: 'عشان أقولك رأيي صح محتاجة أعرف: اللبس لمين ولأنهي مناسبة؟ وقولي القطعتين اللي محتار بينهم وأقارنهملك وأجيبلك المتاح عندنا.', intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  } else if (noAnswers && typeof brain === 'function' && nOp.split(' ').length >= 3 && /(رايك|رايكم|تشوف|شايف|شايفه|يليق|هيليق|هينفع|ينفع|تنفع|يمشي|مناسب لي|احسن ولا|افضل ولا|محتار|مش عارف اختار|اعمل ايه|اخد ايه|حلو ولا|تخين|تخينه|تخينة|نحيف|نحيفه|نحيفة|قصير|قصيره|قصيرة|طويل جدا|طويله|سمراء|سمرا|بشره|بشرتي|مثلث|كمثري|ساعه رمليه|كرش|بطن|حامل|حمل|ممتلئ|ممتلئه|مقاس كبير|وزني)/.test(nOp) && !/(رقم|لوكيشن|عنوان|فرع|توصيل|شحن|دفع|استرجاع|استبدال)/.test(nOp)) {
    let b = null;
    try { b = await brain({ messages, rows: ensureEnriched(products, K), assistantName: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], lang, userBudget: null, facts: { mode: 'opinion' }, text, kb: kbText() }); } catch { b = null; }
    if (b?.reply) {
      const slots = { ...parsed, intent: 'shop', persons: b.persons.length ? b.persons : parsed.persons, context: b.context || parsed.context, contextEffective: b.context || parsed.contextEffective, garments: b.garments.length ? b.garments.map((key, position) => ({ key, color: null, material: null, text: key, position })) : parsed.garments, colors: b.colors.length ? b.colors : parsed.colors, advice: null };
      const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res, say: b.reply, intent: 'brain', session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: slots, pending: false, opinionOffer: Boolean(slots.persons.length || slots.garments.length || slots.context) }, parsed };
    }
  }

  // ---------- أسئلة الخدمة أو قواعد التدريب المعتمدة ----------
  const giftToSomeone = /(^| )(هدي[هة]|هديه|هدايا|gift)( |$)/.test(norm(text)) && /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي)/.test(norm(text));
  const isQuestionOrInquiry = /(^| )(ايه خامه|ايه خامة|ايه هي خامه|مقاسات الاطفال|مقاسات اطفال|الدفع عند الاستلام|جبتلي حاجه غلط|اجرب الاول|يعني ايه|ايه معنى|ايه معني|معنى|معني|ما هو|ما هي|ما الفرق|ايه الفرق|الفرق بين|الفرق مابين|لو حد سال|لو حد سأل|رشحي اولا|رشحي اول|احسن محل|احسن محلات|افضل محل|افضل محلات|فين الاقي|ازاي|كيف|طريقه|اعمل ايه|البس ايه|اختار ايه|تنصحيني|نصيحه|نصايح|قاعده|ينفع البس|ينفع ارجع|ينفع استبدل|لو المقاس|لو التيشرت|لو البنطلون|لو الهدوم|لو الطلب|علاج|حل لمشكله|طقم ل|طقم فرح|طقم جامعه|طقم انترفيو|يركب علي|يركب على|يركبوا|يمشوا مع بعض|يمشي مع|يليقوا مع بعض|يليق علي|يليق على|لايقين|تداري الكرش|يداري الكرش|تداري البطن|تخسسني|تنحفني|تبين طولي|تطولني|يطولني|متحررش|تطري علي الجسم|تطري على الجسم|متكتمش|تدفيني|سقعه|سقعة|برد الشتا|برد الشتاء|بتكش|بيكش|بيبهت|بتبهت|بيوبر|بتوبر|سيكا|للشقا|تستحمل بهدله|تستحمل بهدلة|تستحمل كرف|صيف وشتا|صيف وشتاء|ولا|احسن|افضل|يتلبس عليه|يتلبس معاه|يتلبس مع|يتلبس علي|يتلبس على|تتلبس عليها|تتلبس معاه|تتلبس مع|تتلبس علي|تتلبس على|البس عليه|البس معاه|مفتوح ولا مقفول|القوالب|قوالب|لحد الدور|نفس اسعار|نفس سعر|طويل ورفيع|مسلوع|قصير ومليان|افتح الشحنه|افتح الشحنة|افتح الاوردر|افتح الطلب|وزني|طولي|الموديل لابس|الموديل لابسه|الموديل لابسة|بتمط|ليكرا|استريتش|ناشفه وقافشه|ناشفة وقافشة|علي الطبيعه|على الطبيعة|زي الصوره|زي الصورة|فلاتر|كود الخصم|كوبون الخصم|مش شغال|بروموكود|احجز|احجزلي|حجز|اول الشهر|هتيجي تاني|هتوفر تاني|خلصت|فيزا مع المندوب|عيب صناعه|عيب صناعة|خياطه مقطوعه|خياطة مقطوعة|14 يوم|اربعتاشر يوم|ممنوع استرجاع|بياناتي|رقم تليفوني|خصوصيه|خصوصية|اهل العروسه|أهل العروسة|قعدة تعارف|عزاء|مأتم|امتحان شفوي|مناقشة تخرج|فاتح ولا غامق|اكسفورد|أكسفورد|مبيشفش|مبيشف|بيشف|غسيل البمب|الجواكت البمب|اشيل الوبر|شيل الوبر|مكنة الوبر|شوز قماش|كانفاس|كونفرس|فانس|كفر الجزار|بطا|دملو|جمجرة|ورورة|استلم في الشغل|استلم في الكلية|حد ادنى|حد أدنى|المندوب اتأخر|اتاخر|بينزل امتى|بيخلص امتى|ترانزيشنال|طرحه جوكر|طرحة جوكر|طرحه شيفون|طرحة شيفون|دريس كت|فستان كت|طرحه منقوشه|طرحة منقوشة|طرحه مشجره|طرحة مشجرة|عرض الكرافته|عرض الكرافتة|زرار البدله|زرار البدلة|منديل الجيب|منديل البدله|منديل البدلة|شراب مخفي|سوسته معلقه|سوستة معلقة|ريحه الكمكمه|ريحة الكمكمة|اصفرار الياقه|اصفرار الياقة|اوبن اير|فرح في جنينه|فرح في جنينة|بعد الساعه 5|بعد الساعة 5|منتج مختلف)( |$)/.test(norm(text));
  if (!giftToSomeone && !(answers && Object.keys(answers).length) && !session?.pending && (!parsed.garments.length || isQuestionOrInquiry) && (!parsed.context || isQuestionOrInquiry) && !(parsed.followup && session?.parsed)) {
    const trained = matchTrainedLesson(text, training?.lessons);
    if (trained) {
      return { state: 'chat', intent: 'faq', faq: 'training', say: trained.answer, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
    }
    if ((!parsed.garments.length || matchFaq(text) === 'fabric') && !(matchFaq(text) === 'budget_only' && session?.parsed && (session.parsed.garments?.length || session.parsed.context))) {
      const faq = matchFaq(text);
      if (faq === 'unlisted_item') { const found = keywordSearch(text, ensureEnriched(products, K), { limit: 6 }); if (found.length) return searchReply(found); }
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
      const u = await understand({ text, parsed, session });
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
  // ---------- مرجعيات الكلام (الفستان/الجزمة/عليها/عليهم/القطعة دي): نفهمها من اللوك الحالي، ولو مش واضحة نسأل بدل التخمين ----------
  const lookItems = session?.activeLook?.items || [];
  const clarify = (say, id, qtext, options) => ({
    state: 'clarify', intent: 'shop', say, tips: [], styleTips: [], blocks: null, missing: [], ask: [id],
    questions: [{ id, text: qtext, type: 'single', options }],
    session: { ...(session || {}), turn: (session?.turn || 0) + 1, pending: true, pendingQuestion: id }, parsed,
  });
  const itemLabel = (it) => `${it.name}${it.aud === 'men' ? ' (ليه)' : it.aud === 'women' || it.aud === 'women_hijab' ? ' (ليها)' : ''}`;
  const famRe = (it) => new RegExp(String(it.key || it.slotKey || 'zzz').replace(/[^a-z_]/gi, '') || 'zzz', 'i');
  const pickedItem = answers?.which_piece != null ? lookItems.find((i) => String(i.id) === String(answers.which_piece)) : null;
  // «غيّر الجزمة / بدّل القميص لأزرق»: استبدال قطعة من اللوك الحالي (أو طلب قطعة بلون جديد لو مفيش لوك)
  { const sw = !hasAnswers ? norm(text).match(/^(?:عاوز |عايز |ممكن |لو سمحت )?(?:اغير|غير|غيري|بدل|ابدل|بدلي|خلي|خليه|خليها)\s+(.+)$/) : null;
    if (sw && !/^(ده|دي|دا|الطقم|اللبس|كله|كل حاجه)$/.test(sw[1])) {
      const rest = sw[1];
      const pr = parseMessage(rest, { profile, imageText: '', now, cairoDow: dow });
      const col = pr.colors?.[0] || pr.garments?.[0]?.color || null;
      const hit = lookItems.length ? resolveAnchor(rest, session) : null;
      if (hit?.item) {
        const it = hit.item;
        parsed = { ...parsed, intent: 'shop', persons: it.aud ? [it.aud] : parsed.persons, avoidColors: [], garments: [{ key: it.key || it.slotKey, color: col, material: null, text: it.name, position: 0 }], flags: { ...parsed.flags, swapId: it.id, colorFlexible: true } };
      } else if (pr.garments?.length && col) {
        parsed = { ...parsed, intent: 'shop', avoidColors: [], colors: [], garments: pr.garments.map((g) => ({ ...g, color: g.color || col })), persons: parsed.persons };
      }
    } }
  let anchor = pickedItem ? { item: pickedItem, keyRe: famRe(pickedItem) } : (!hasAnswers ? resolveAnchor(text, session) : null);
  let audFilter = null;
  if (answers?.which_person) {
    const w = String(answers.which_person);
    if (w === 'men') audFilter = new Set(['men', 'boys']); else if (w === 'women') audFilter = new Set(['women', 'women_hijab', 'girls']);
    const auds = [...new Set(lookItems.map((x) => x.aud).filter((x) => x && (!audFilter || audFilter.has(x))))];
    if (auds.length) parsed = { ...parsed, intent: 'shop', persons: auds };
  }
  if (/(مش|غير|من غير|بدون)\s*(محجب|حجاب|طرحه)/.test(norm(text))) parsed = { ...parsed, flags: { ...parsed.flags, notHijab: true } };
  if (/(انا|انتي|هي|خطيبتي|مراتي)?\s*(الخطوبه|الفرح|كتب الكتاب)\s*(بتاع|بتاعت|بتاعتي|بتاعتنا|بتاعتها)|خطوبتي|خطوبتنا|فرحي|فرحنا|كتب كتابي/.test(norm(text))) parsed = { ...parsed, flags: { ...parsed.flags, roleAsked: true } };
  if (/(ضيف|ضيفه|مدعو|معزوم|حضور|رايح خطوبه|رايحين خطوبه|رايحه خطوبه|رايحه فرح|رايح فرح)/.test(norm(text))) parsed = { ...parsed, flags: { ...parsed.flags, roleAsked: true } };
  // "جبت بدلة ومجبتش ليها" / "عاوز لخطيبتي فستان": one side is already dressed, style only the other one
  if (hasAnswers && session?.parsed?.flags?.soloFromCouple && parsed.persons.includes('men') && parsed.persons.includes('women')) parsed = { ...parsed, persons: [session.parsed.flags.soloFromCouple], flags: { ...parsed.flags, soloFromCouple: session.parsed.flags.soloFromCouple } };
  if (!hasAnswers && parsed.intent === 'shop' && parsed.persons.includes('men') && parsed.persons.includes('women')) {
    const nt = norm(text);
    const HER = '(?:^|\\s)(?:ليها|لها|لخطيبتي|لمراتي|لحبيبتي|لزوجتي|لصاحبتي)(?=\\s|$)';
    const HIM = '(?:^|\\s)(?:ليه|له|لخطيبي|لجوزي|لحبيبي|لزوجي|لصاحبي)(?=\\s|$)';
    const HAVE = '(جبت|جيبت|اشتريت|عندي|لابس|معايا|جهزت|خدت|لقيت)';
    const NOT = '(مجبتش|مجبتلهاش|مجبتلوش|ملقتش|لسه|ولسه|محتاج|محتاجه|عاوز|عايز|عايزه|عاوزه|عاوزين|ابغي)';
    const toHer = new RegExp(NOT + '[^؟?]*' + HER).test(nt) || new RegExp(HAVE + '[^؟?]*(بدل|قميص|بنطلون|جاكيت|كرافت|اوت ?فيت|طقم|لبس)[^؟?]*' + NOT + '?[^؟?]*' + HER).test(nt);
    const toHim = new RegExp(NOT + '[^؟?]*' + HIM).test(nt);
    const speaker = /(خطيبتي|مراتي|حبيبتي|زوجتي)/.test(nt) ? 'men' : /(خطيبي|جوزي|حبيبي|زوجي)/.test(nt) ? 'women' : null;
    const toMe = speaker && new RegExp(NOT + '[^؟?]*(?:^|\\s)(?:ليا|لنفسي|لي)(?=\\s|$)').test(nt);
    if (toMe && !toHer && !toHim) parsed = { ...parsed, persons: [speaker], flags: { ...parsed.flags, soloFromCouple: speaker } };
    else if (toHer && !toHim) parsed = { ...parsed, persons: ['women'], flags: { ...parsed.flags, soloFromCouple: 'women' } };
    else if (toHim && !toHer) parsed = { ...parsed, persons: ['men'], flags: { ...parsed.flags, soloFromCouple: 'men' } };
  }
  if (anchor?.ambiguous) {
    return clarify('تقصد أنهي قطعة بالظبط؟', 'which_piece', 'تقصد أنهي قطعة؟', anchor.ambiguous.map((it) => ({ label: itemLabel(it), value: it.id })));
  }
  if (!hasAnswers && needsWhoPart(text, session)) {
    const hasM = lookItems.some((x) => x.aud === 'men' || x.aud === 'boys'); const hasW = lookItems.some((x) => ['women', 'women_hijab', 'girls'].includes(x.aud));
    return clarify('عاوزه ليك ولا ليها ولا للاتنين؟', 'which_person', 'القطعة دي لمين؟', [...(hasM ? [{ label: 'ليه', value: 'men' }] : []), ...(hasW ? [{ label: 'ليها', value: 'women' }] : []), { label: 'للاتنين', value: 'both' }]);
  }
  if (answers?.look_action) {
    const act = String(answers.look_action);
    if (act.startsWith('swap:')) {
      const it = lookItems.find((i) => String(i.id) === act.slice(5));
      if (it) { parsed = { ...parsed, intent: 'shop', persons: it.aud ? [it.aud] : parsed.persons, garments: [{ key: it.key || it.slotKey, color: null, material: null, text: it.name, position: 0 }], flags: { ...parsed.flags, swapId: it.id } }; }
    } else {
      const say = act === 'add' ? 'تمام، قولي عاوز تضيف إيه للطقم (جزمة، شنطة، إكسسوار...) وأنسقهولك.' : 'تمام، اكتبلي عاوز إيه بالظبط وأنا معاك.';
      return { state: 'chat', intent: 'chat', say, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1, pending: false, pendingQuestion: null }, parsed };
    }
  }
  if (anchor) {
    const prevWanted = (session.parsed?.garments || []).filter((g) => !anchor.keyRe.test(String(g.key || '')));
    if (prevWanted.length) {
      const aud = anchor.item.aud;
      parsed = { ...parsed, intent: 'shop', garments: prevWanted, persons: aud ? [aud] : parsed.persons, flags: { ...parsed.flags, anchorId: anchor.item.id } };
    } else if (pickedItem) {
      // اختار القطعة بس ومفيش طلب سابق: نسأله عاوز إيه عليها
      return clarify(`تمام، «${anchor.item.name}». عاوز تنسق عليها إيه؟`, 'look_action', 'عاوز إيه؟', [{ label: 'أضيف قطعة عليها', value: 'add' }, { label: 'غيّر القطعة دي', value: `swap:${anchor.item.id}` }]);
    }
  }
  const isContinuation = isContinuationRequest(text, session) || Boolean(anchor && parsed.flags?.anchorId) || Boolean(audFilter && session?.parsed?.garments?.length);
  if (!hasAnswers && parsed.intent === 'unknown' && session?.parsed?.garments?.length && /^(?:(?:عندكم|فيه|في|متاح|هاتلي|عاوز|عايز)\s+)?(?:مقاس|سايز|size)\s*(?:xxl|xl|xs|s|m|l|3xl|\d{2}|كبير جدا|كبير|صغير|وسط|لارج|ميديم|سمول)\s*[؟?]?$/i.test(norm(text).trim())) parsed = { ...parsed, intent: 'followup' };
  if (!hasAnswers && parsed.intent === 'unknown' && session?.parsed?.garments?.length && !parsed.garments.length && !parsed.persons.length && (parsed.colors?.length || parsed.avoidColors?.length) && norm(text).split(' ').filter(Boolean).length <= 5) parsed = { ...parsed, intent: 'followup' };
  const complaintOnly = /^(مش عاجبني|مش عاجبه|مش عاجباني|وحش|وحشه|مش حلو|مش حلوه|مش شيك|مش مناسب|مش مناسبه)( ده| دي| دا| خالص| اوي| كده)?$/.test(norm(text).trim());
  if (complaintOnly && !hasAnswers && session?.parsed) {
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: 'آسفة إن الاختيارات ما عجبتكش. إيه اللي مش مناسب: السعر، اللون، الموديل ولا النوع؟ قولي وأعدّلهالك على ذوقك.', intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  }
  const continuing = !complaintOnly && session?.parsed && ((!hasAnswers && !session.pending && (session.parsed.garments?.length || session.parsed.context) && !parsed.garments.length && !parsed.context && !parsed.persons.length && Boolean(parsed.budget || /^(ارخص|اقل|ارخص شويه|اقل شويه|ارخص من كده|ارخص من كدا)$/.test(norm(text).trim()))) || isContinuation || altRequest || session.pending || parsed.intent === 'followup' || hasAnswers || (parsed.intent === 'shop' && !parsed.persons.length && !parsed.garments.length && session.parsed.persons?.length));
  if (hasAnswers) parsed = applyAnswers({ ...parsed, intent: 'shop' }, answers, K);
  if (continuing && (parsed.intent === 'shop' || parsed.intent === 'followup' || parsed.intent === 'unknown')) { parsed = mergeFromSession(parsed, session.parsed); parsed.intent = 'shop'; }
  // قالت قبل كده إنها محجبة وبعدين كتبت «فستان»: نفضل فاكرين الحجاب
  if (!hasAnswers && session?.parsed?.persons?.includes('women_hijab') && parsed.persons.length === 1 && parsed.persons[0] === 'women' && !parsed.flags?.notHijab) parsed = { ...parsed, persons: session.parsed.persons, flags: { ...parsed.flags, hijab: true } };
  // طلب قطعة من غير ما يقول لمين بعد طلب سابق لنفس الشخص: نكمّل على نفس الشخص بدل ما نسأل تاني
  if (!hasAnswers && !continuing && parsed.intent === 'shop' && !parsed.persons.length && parsed.garments.length && session?.parsed?.persons?.length && (session.parsed.garments?.length || session.parsed.context) && !parsed.flags?.audienceAsked) parsed = { ...parsed, persons: session.parsed.persons, flags: { ...parsed.flags, personsFromSession: true } };
  if (altRequest) parsed = { ...parsed, garments: [], flags: { ...parsed.flags, altRequest: true } }; // اعرض تركيبة المناسبة بالمتاح بدل ما نكرر الطلب الناقص
  if (session?.pendingQuestion === 'budget' && /مش فارق|مش فارقة|براحتك|من غير ميزانية|any budget|flexible/i.test(parsed.normalized || '')) {
    parsed.budget = { value: null, kind: 'total' };
    parsed.flags = { ...parsed.flags, budgetFlexible: true };
  }
  if (session?.pendingQuestion === 'color_preference' && /أي لون|اي لون|مش فارق|مش فارقة|سيبها علي|اختاري|any color|no preference/i.test(parsed.normalized || '')) {
    parsed.flags = { ...parsed.flags, colorFlexible: true };
  }
  { // مقاس مكتوب في الكلام: "مقاس L" / "سايز 42" / أو رد لوحده على سؤال المقاس
    const t = String(parsed.normalized || text || '');
    const WORDS = { 'اكس لارج': 'XL', 'اكس اكس لارج': 'XXL', لارج: 'L', ميديم: 'M', سمول: 'S', وسط: 'M' };
    let sz = (t.match(/(?:مقاس|سايز|size)\s*(xxl|xl|xs|s|m|l|3xl|\d{2})(?![a-z0-9])/i) || [])[1];
    if (!sz && session?.pendingQuestion === 'size_needed') {
      sz = (t.trim().match(/^(xxl|xl|xs|s|m|l|3xl|\d{2})$/i) || [])[1];
      if (!sz) for (const [w, v] of Object.entries(WORDS)) if (t.includes(w)) { sz = v; break; }
    }
    if (!sz) { const m = t.match(/(?:مقاس|سايز|size)\s*(كبير جدا|كبير|لارج|صغير|سمول|وسط|ميديم)/); if (m) sz = { 'كبير جدا': 'XL', كبير: 'L', لارج: 'L', صغير: 'S', سمول: 'S', وسط: 'M', ميديم: 'M' }[m[1]]; }
    if (sz) parsed.flags = { ...parsed.flags, size: String(sz).toUpperCase() };
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
  { // «عليها» = السيدة بس، «عليه» = الراجل بس (في طقم الاتنين)
    const pa = isContinuation ? (audFilter || pronounAuds(text)) : null;
    if (pa) {
      const auds = [...new Set((session?.activeLook?.items || []).map((x) => x.aud).filter((x) => x && pa.has(x)))];
      if (auds.length) parsed = { ...parsed, persons: auds };
    }
  }
  if (parsed.followup === 'cheaper' && prevTotal) { parsed.budget = { value: Math.max(100, Math.round((session.lastBudgetUsed || prevTotal) * 0.8 / 50) * 50), kind: 'total' }; derivedBudget = true; }
  if (parsed.followup === 'show_more') excludeIds = session?.shown || [];
  if (parsed.flags?.swapId) excludeIds = [...excludeIds, parsed.flags.swapId];

  // ---------- فهم احتياطي بالموديل المجاني (اختياري) ----------
  // ---------- عقل الموديل (اختياري): يجاوب أي سؤال ويسأل سؤال واحد، أو يستخرج المطلوب ----------
  let brainUsed = false;
  const callBrain = async (facts = null) => {
    if (typeof brain !== 'function') return null;
    try { return await brain({ messages, rows: ensureEnriched(products, K), assistantName: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], lang, userBudget: parsed.budget?.value || null, facts, text, kb: kbText() }); } catch { return null; }
  };
  // «غيره / حاجة تانية / مش دي»: بديل للقطعة المعروضة قبل كده
  if (session?.parsed?.garments?.length && !hasAnswers && /^(غيره|غيرها|غيرهم|غير ده|غير دي|غير دا|حاجه تانيه|حاجات تانيه|حاجه غيرها|مش دي|مش ده|مش دا|واحد تاني|واحده تانيه|بديل|بدائل|فيه غيره|فيه غيرها|في غيره|في غيرها|اغلي|اغلي شويه|احسن|احسن من كده|افضل|افضل من كده|حاجه احسن|حاجه افضل|اشيك|اشيك من كده)$/.test(norm(text).trim())) {
    parsed = { ...parsed, intent: 'shop', followup: 'show_more' };
    excludeIds = session?.shown || [];
  }
  // سؤال معلّق والعميل كتب كلام تاني بدل ما يجاوب: منكررش السؤال نفسه (نكمّل بدونه)
  if (!hasAnswers && session?.pendingQuestion && session?.pending) {
    const pq = session.pendingQuestion;
    const f = { ...parsed.flags };
    if (pq === 'budget' && !parsed.budget) f.budgetFlexible = true;
    else if (pq === 'modest_preference') f.hijabAsked = true;
    else if (pq === 'women_style') f.womenStyle = f.womenStyle || 'any';
    else if (pq === 'engagement_role') f.roleAsked = true;
    else if (pq === 'color_preference' && !parsed.colors?.length) f.colorFlexible = true;
    parsed = { ...parsed, flags: f };
  }
  // «أنا العروسة / أنا العريس»
  if (!hasAnswers && !parsed.persons.length && /(^| )(انا )?(العروسه|عروسه|عروسة)( |$)/.test(norm(text))) parsed = { ...parsed, persons: ['women'], role: 'self', flags: { ...parsed.flags, roleAsked: true } };
  else if (!hasAnswers && !parsed.persons.length && /(^| )(انا )?(العريس|عريس)( |$)/.test(norm(text))) parsed = { ...parsed, persons: ['men'], role: 'self', flags: { ...parsed.flags, roleAsked: true } };
  // «بكام / كام الإجمالي»: نرد بأسعار القطع المعروضة فعلًا
  if (!hasAnswers && !session?.pending && lookItems.length && /^(بكام|بكام ده|بكام دي|بكام دا|بكام كل ده|كام سعره|سعره كام|سعرها كام|كام السعر|كام ده|كام دي|كام الاجمالي|الاجمالي كام|كام السعر الكلي|السعر الكلي|كام الحساب|اجمالي كام|كام كله|كله بكام|الحساب كام|السعر كام)( [^ ]+){0,2}$/.test(norm(text).trim())) {
    const rows0 = lookItems.filter((i) => Number(i.price) > 0);
    if (rows0.length) {
      const total = rows0.reduce((t, i) => t + Number(i.price), 0);
      const lines = rows0.map((i) => `${i.name}: ${Number(i.price).toLocaleString('en-US')} جنيه`).join('، ');
      const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res0, say: rows0.length === 1 ? `${lines}.` : `${lines}. الإجمالي: ${total.toLocaleString('en-US')} جنيه.`, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
  }
  // الأسعار غالية: لو في طلب قبل كده نرخّص، ولو لأ نسأل عن الميزانية
  if (!hasAnswers && !session?.pending && /(^| )(غالي|غاليه|غلي|غاليين|اسعاركم غاليه|الاسعار غاليه|الاسعار عاليه|مش معايا فلوس|معييش فلوس)( |$)/.test(norm(text)) && !parsed.garments.length && norm(text).split(' ').length <= 6) {
    if (session?.parsed?.garments?.length || session?.parsed?.context) { parsed = { ...session.parsed, intent: 'shop', followup: null, flags: { ...(session.parsed.flags || {}), cheapest: true } }; }
    else return clarify('معاك حق، قولي ميزانيتك تقريبًا وأدورلك على اللي يناسبها.', 'budget', 'ميزانيتك تقريبًا قد إيه؟', [{ label: 'لحد ٣٠٠ جنيه', value: [0, 300] }, { label: 'لحد ٥٠٠ جنيه', value: [0, 500] }, { label: 'لحد ١٠٠٠ جنيه', value: [0, 1000] }, { label: 'لحد ٢٠٠٠ جنيه', value: [0, 2000] }]);
  }
  // «مقاسي L» من غير ما يقول عاوز إيه: نسجّله ونسأله
  { const mm = !hasAnswers && !session?.parsed?.garments?.length ? norm(text).match(/^(?:انا )?(?:(?:مقاسي|مقاس|مقاسى) ?)?(xxs|xs|s|m|l|xl|xxl|xxxl|[0-9]{2})$/i) : null;
    if (mm) {
      const sz = mm[1].toUpperCase();
      const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res, say: `تمام، مقاسك ${sz}. عاوز أدورلك على إيه بالظبط؟ (قميص، بنطلون، فستان، جزمة…)`, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: { ...parsed, intent: 'shop', flags: { ...parsed.flags, size: sz } }, pending: false }, parsed };
    } }
  // موسم من غير قطعة ولا مناسبة («لبس شتوي»): نفترض خروجة عادية وبنسأل لمين لو مش معروف
  if (!hasAnswers && !parsed.garments.length && !parsed.context && /(^| )(شتوي|شتويه|صيفي|صيفيه|للشتا|للصيف|الشتا|الصيف)( |$)/.test(norm(text)) && norm(text).split(' ').length <= 5) {
    parsed = { ...parsed, intent: 'shop', context: 'casual_outing', contextEffective: 'casual_outing', flags: { ...parsed.flags, colorFlexible: true } };
  }
  // هدية من غير ما يقول لمين: نسأل بدل ما نقول «مفهمتش»
  const GIFT_W = /(^| )(هدي[هة]|هديه|هدايا|gift)( |$)/;
  if (!hasAnswers && !session?.pending && GIFT_W.test(norm(text)) && !parsed.garments.length && !/(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي|لولد|لبنت|لطفل)/.test(norm(text))) {
    parsed = { ...parsed, intent: 'shop', persons: [], flags: { ...parsed.flags, gift: true } };
    return clarify('تمام، الهدية لمين؟', 'gift_for', 'الهدية لمين؟', [{ label: 'ست (مراتي / خطيبتي / أمي / أختي)', value: 'women' }, { label: 'راجل (جوزي / أبويا / أخويا)', value: 'men' }, { label: 'طفل', value: 'kids' }]);
  }
  if (hasAnswers && answers.gift_for) {
    const rcp = answers.gift_for === 'women' ? 'women' : answers.gift_for === 'men' ? 'men' : null;
    if (rcp) parsed = { ...parsed, intent: 'shop', persons: [rcp], garments: (rcp === 'women' ? ['handbag', 'perfume', 'tarha'] : ['watch', 'perfume', 'belt']).map((key, position) => ({ key, color: null, material: null, text: key, position })), flags: { ...parsed.flags, gift: true, colorFlexible: true, budgetFlexible: true } };
    else parsed = { ...parsed, intent: 'shop', persons: ['boys', 'girls'], garments: ['tshirt', 'dress_casual', 'sneakers'].map((key, position) => ({ key, color: null, material: null, text: key, position })), flags: { ...parsed.flags, gift: true, colorFlexible: true, budgetFlexible: true } };
  }
  // هدية: المستلم هو اللي بنختار له، مش العميل نفسه
  if (!hasAnswers && (parsed.intent === 'shop' || parsed.intent === 'advice' || parsed.intent === 'unknown') && !parsed.garments.length && /(^| )(هدي[هة]|هديه|هدايا|gift)( |$)/.test(norm(text)) && /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي)/.test(norm(text))) {
    const toHer = /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لها|حريمي)/.test(norm(text)) || /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي)/.test(String(text));
    const toHim = /(لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي)/.test(norm(text));
    const recipient = toHer ? 'women' : toHim ? 'men' : null;
    if (recipient) parsed = { ...parsed, intent: 'shop', advice: null, persons: [recipient], garments: (recipient === 'women' ? ['handbag', 'perfume', 'tarha'] : ['watch', 'perfume', 'belt']).map((key, position) => ({ key, color: null, material: null, text: key, position })), flags: { ...parsed.flags, gift: true, colorFlexible: true } };
  }
  // أطفال من غير قطعة ولا مناسبة: نعرض طقم يومي بدل ما نسأل عن مناسبة
  if (!hasAnswers && parsed.intent === 'shop' && !parsed.garments.length && !parsed.context && parsed.persons.length && parsed.persons.every((x) => x === 'boys' || x === 'girls')) {
    const girl = parsed.persons.includes('girls') && !parsed.persons.includes('boys');
    parsed = { ...parsed, garments: (girl ? ['dress_casual', 'sneakers'] : ['tshirt', 'jeans', 'sneakers']).map((key, position) => ({ key, color: null, material: null, text: key, position })), flags: { ...parsed.flags, colorFlexible: true } };
  }
  // عنده قطعة ومقالش عاوز إيه: نسأل بدل ما نقول «مفهمتش»
  if (!hasAnswers && !session?.pending && parsed.ownedPieces?.length && !parsed.garments.length && !parsed.context && /^(عندي|معايا|عندى|لابس)(?=\s|$)/.test(text.trim()) && !/(عايز|عاوز|عايزه|عاوزه|طقم|نسق|يليق|يمشي|رايح|مناسب)/.test(text)) {
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: 'حلو القطعة دي! تحب أنسقلك معاها إيه؟ قميص ولا جاكيت ولا جزمة ولا إكسسوار؟ أو قولي رايح فين وأرشحلك طقم كامل.', intent: 'chat', session: { ...(session || {}) } };
  }
  // بحث بالكلمات في المنتجات الحقيقية: لأي حاجة برا قاموس اللبس (مكياج، نظارات، بيجامات…)
  if (!hasAnswers && !session?.pending && (parsed.intent === 'unknown' || (parsed.intent === 'shop' && !parsed.ownedPieces?.length && !parsed.garments.length && !parsed.context && !parsed.persons.length)) && text.trim().length >= 3) {
    const hits = keywordSearch(text, ensureEnriched(products, K), { limit: 6 });
    if (hits.length) return searchReply(hits);
    if (parsed.intent === 'unknown' && text.trim().split(/\s+/).length <= 3 && /^[\u0600-\u06FFa-zA-Z ]+$/.test(text.trim()) && !session?.parsed && !/^(ايه|ايوه|ايوا|اه|لا|تمام|طب|طيب|هو|هي|بس|كمل|كمان|تاني|وبعدين|ممكن|ازاي|ليه|مين|فين|امتي|انتي|انت|انا|خلاص|ماشي|اوكي|يعني|هاتلي|ورينا|ورني|مش|ده|دي|دا|كده|كدا|حلو|وحش|غبي|غبيه|سيئ|سيء|مدير|خدمه)( |$)/.test(norm(text).trim()) && !/(غبي|غبيه|وحش|سيئ|سيء|بتفهمي|بتفهم|مدير|شكوي|شكوى)/.test(norm(text))) {
      const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res0, say: `ملقتش «${text.trim()}» في المحلات دلوقتي. جرّب اسم تاني للقطعة، أو قولي المناسبة ولمين وأرشحلك من المتاح.`, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
  }
  // طلب مبهم («حاجة شيك»): قبل ما نسأل سؤال جاهز، الموديل يحاول يفهم؛ لو فهم نكمّل بحث في المنتجات
  const vague = !wasUnknown && !hasAnswers && !session?.pending && parsed.intent === 'shop' && !parsed.garments.length && !parsed.context && !parsed.ownedPieces?.length && text.trim().length >= 3;
  if ((wasUnknown || vague) && !altRequest && typeof brain === 'function') {
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
  if (parsed.intent === 'unknown' && !hasAnswers && lookItems.length && text.trim().split(/\s+/).length <= 8 && !matchFaq(text)) {
    return clarify('مش متأكدة فهمتك صح. تقصد إيه بالظبط؟', 'look_action', 'تحب أعمل إيه؟', [...lookItems.slice(0, 4).map((it) => ({ label: `بدّل «${it.name}»`, value: `swap:${it.id}` })), { label: 'أضيف قطعة للطقم', value: 'add' }, { label: 'حاجة تانية', value: 'other' }]);
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
  const pinnedItems = isContinuation ? resolvePinnedItems(text, session, parsed.garments, rows, anchor && parsed.flags?.anchorId ? anchor : null, audFilter) : [];
  let plan = planOutfit(parsed, excludeIds.length ? rows.filter((p) => !excludeIds.includes(p.id)) : rows, { adv, eventTime, profile, K, pinnedItems });
  if (excludeIds.length && plan.state === 'none' && !parsed.flags?.swapId) plan = planOutfit(parsed, rows, { adv, eventTime, profile, K, pinnedItems });
  plan = auditPlanPicks(plan, K);
  let sizeMiss = null;
  if (plan.state === 'none' && parsed.flags?.size) { const alt = planOutfit({ ...parsed, flags: { ...parsed.flags, size: undefined } }, rows, { adv, eventTime, profile, K, pinnedItems }); if (alt.people?.some((pe) => pe.picks.length)) { sizeMiss = parsed.flags.size; plan = auditPlanPicks(alt, K); } }

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
  // مراجع Gemini: آخر خط دفاع قبل العرض. بيشيل أي قطعة اسمها مش بتطابق خانتها (كافلينج كقميص، لانجري كفستان).
  if (typeof verifier === 'function' && !needsClarificationFirst && ['full', 'alternatives', 'partial', 'over_budget'].includes(plan.state)) {
    try { const vp = await verifier({ plan, K }); if (vp) plan = vp; } catch { /* نكمل */ }
    plan = auditPlanPicks(plan, K);
  }
  // أسماء القطع والتابات عربي بس: لما نعرض منتجات نرد بالعربي حتى لو الطلب بحروف لاتينية (shoes / hoodie aswad)، بدل رد نص إنجليزي وأسماء عربي مخلوطين.
  if (!(needsClarificationFirst || ['clarify', 'chat', 'no_look'].includes(plan.state))) lang = 'ar';
  let res = respond(needsClarificationFirst ? { ...plan, state: 'clarify' } : plan, { seed, lang, profile, assistantName });
  let altOffer = null;
  if (typeof brain === 'function' && ['none', 'no_look', 'partial', 'alternatives', 'full'].includes(plan.state) && !needsClarificationFirst) {
    const avail = [...new Set((plan.people || []).flatMap((p) => p.picks.map((x) => x.product.key)).filter(Boolean))];
    const found = (plan.people || []).flatMap((p) => p.picks.map((x) => ({ type: String(x.slotKey || '').split('|')[0], name: x.product.name_ar, color: x.product.color_text || undefined, for: p.aud }))).slice(0, 8);
    // بدائل حقيقية من المخزون لكل قطعة ناقصة (نفس العائلة: جينز ← بنطلون، جزمة ← كوتشي…) عشان الموديل يقترحها بأسمائها
    const stockAlternatives = [];
    if (plan.state !== 'full') {
      const wantG = new Set((parsed.persons || []).map((a) => (a === 'women_hijab' ? 'women' : a)));
      const stock = ensureEnriched(products, K).filter((pr) => pr.key && pr.inStock !== false && (!wantG.size || !pr.gender || wantG.has(pr.gender) || pr.gender === 'unisex'));
      for (const m of plan.missing || []) {
        const fam = K.items.get(m.base)?.family; if (!fam) continue;
        const subs = new Set(K.substitutes?.[m.base] || []);
        const pool = stock.filter((pr) => pr.key !== m.base && K.items.get(pr.key)?.family === fam).sort((a, b) => (subs.has(b.key) ? 1 : 0) - (subs.has(a.key) ? 1 : 0));
        for (const pr of pool.slice(0, 2)) stockAlternatives.push({ wanted: m.base, type: pr.key, name: pr.name_ar, color: pr.color_text || undefined });
      }
    }
    const NOTE = plan.state === 'full'
      ? 'We FOUND everything the customer asked for (items are shown as cards below your reply). Reply in warm casual Egyptian Arabic like a friend, 1-2 short sentences: say you found it, mention one or two of the found pieces by their exact names from found, and add one natural styling comment (colours / what goes with what). Never write prices. Do not ask a question unless it really helps.'
      : 'Say honestly what is not available (only the missing/relaxed part, never more), in warm casual Egyptian Arabic like a friend. Then suggest the closest alternative from found and ask for their opinion in ONE short question, for example: لو جبتلك كوتشي أبيض بدل الجزمة رأيك؟ / لو جبتلك بنطلون بدل الجينز تنفع؟ / تحب أدورلك على لون تاني؟. Use ONLY pieces listed in found or stockAlternatives as the alternative (name them); never claim an item exists that is not there. Never write prices.';
    const b = await callBrain({ result: plan.state, requested: parsed.garments.map((x) => x.key), occasion: parsed.context || null, missing: (plan.missing || []).map((m) => m.base).filter(Boolean), availableAlternativeTypes: avail, found, stockAlternatives, relaxed: (plan.relaxed || []).map((r) => r.kind || r.base || r.key).filter(Boolean).slice(0, 4), note: NOTE });
    // رد الموديل ما يتقبلش لو بيذكر قطع مش في النتيجة (مثلاً هودي/جينز/بوتس وإحنا عارضين بنطلون وكوتشي).
    const planKeys = new Set([...avail, ...stockAlternatives.map((x) => x.type), ...(plan.missing || []).map((m) => m.base), ...parsed.garments.map((x) => x.key), ...(plan.people || []).flatMap((p) => p.picks.flatMap((x) => String(x.slotKey || '').split('|')))].filter(Boolean));
    const stray = b?.reply ? [...strayGarments(K, b.reply, planKeys), ...(!avail.length && /(هتلاقي|هتلاقى|هتلاقو|ستجد|you'll find|you will find).{0,40}(تحت|below)/i.test(b.reply) ? ['claims_items_below'] : [])] : [];
    if (b?.reply && !stray.length) { res = { ...res, say: b.reply, brainReply: true }; brainUsed = true; const mentioned = stockAlternatives.find((x) => b.reply.includes(x.name) || b.reply.includes(String(K.items.get(x.type)?.ar || '\u0000').split(' ')[0])); if (mentioned) altOffer = { wanted: mentioned.wanted, type: mentioned.type }; }
    else if (b?.reply) res = { ...res, brainRejected: stray };
  }
  if (plan.state === 'none' && parsed.avoidColors?.length && parsed.garments?.length) {
    const nm = parsed.avoidColors.map((c) => String(K.colors.get(c)?.ar || c).split(' ')[0]).join(' / ');
    res = { ...res, say: `مفيش ${String(K.items.get(parsed.garments[0].key)?.ar || 'القطعة دي').split(' ')[0]} بلون غير ${nm} متاح دلوقتي. تحب أجيبلك نفس القطعة بـ${nm}، ولا ألون تاني من نوع مختلف؟` };
  }
  if (parsed.flags?.swapId && plan.state === 'none') {
    const nm = lookItems.find((i) => String(i.id) === String(parsed.flags.swapId))?.name;
    res = { ...res, say: `مفيش بديل تاني متاح${nm ? ` لـ«${nm}»` : ''} دلوقتي. تحب أدورلك على نوع أو لون مختلف؟` };
  }
  { const wantMat = (parsed.garments || []).map((x) => x.material).filter(Boolean);
    if (wantMat.length && ['full', 'alternatives', 'partial'].includes(plan.state) && !needsClarificationFirst && !res.brainReply) {
      const picks = (plan.people || []).flatMap((pe) => pe.picks.map((x) => x.product));
      if (picks.length && !picks.some((pr) => pr.materials?.size && wantMat.some((m) => pr.materials.has(m)))) res = { ...res, say: `${res.say} الخامة مش مكتوبة عند المحل، فاتأكد منها من صفحة المنتج أو كلّم المحل.` };
    } }
  // العميل حدد لون ومفيش حاجة بيه في الترشيح: نقولها بصراحة
  { const want = [...new Set([...(parsed.colors || []), ...(parsed.garments || []).map((x) => x.color)].filter(Boolean))];
    if (want.length && ['full', 'alternatives', 'partial'].includes(plan.state) && !needsClarificationFirst && !res.brainReply && !/(ملقتش|مش متاح بالظبط|مفيش.*بلون)/.test(res.say || '')) {
      const picks = (plan.people || []).flatMap((pe) => pe.picks.map((x) => x.product));
      if (picks.length && !picks.some((pr) => (pr.colorKeys || []).some((c) => want.includes(c)))) {
        const names = want.map((c) => String(K.colors.get(c)?.ar || c).split(' ')[0]).join(' / ');
        res = { ...res, say: `${res.say} ملقتش في الطقم ده حاجة بلون ${names}، فده أقرب المتاح. لو عايز لون تاني قولي.` };
      }
    } }
  const g = guardResponse(res, { lang });
  if (!g.ok) res = { ...res, say: pick(K.phrases.ar.fallback_generic, seed), guard: g.problems };

  if (parsed.preferredStoreName && !needsClarificationFirst && ['full', 'alternatives', 'partial'].includes(plan.state) && !res.say?.includes(parsed.preferredStoreName)) {
    res = { ...res, say: `رشحتلك أولاً من كولكشن «${parsed.preferredStoreName}» في بنها:\n\n${res.say}` };
  }
  if (sizeMiss && plan.people?.length) {
    const sizes = [...new Set(plan.people.flatMap((pe) => pe.picks.flatMap((pk) => String(pk.product?.size_list || '').split(',').map((x) => x.trim()).filter(Boolean))))];
    res = { ...res, say: `مقاس ${sizeMiss} مش متاح دلوقتي في الحاجة دي.${sizes.length ? ` المقاسات المتاحة: ${sizes.join('، ')}.` : ''} دي أقرب اختيارات متاحة، ولو عاوز مقاس تاني قولي.` };
  }
  if (pinnedItems.length > 0 && plan.people?.length && !needsClarificationFirst) {
    const heroPin = pinnedItems[0]?.product;
    const allPicks = plan.people.flatMap((p) => p.picks);
    const newPicks = allPicks.filter((pk) => !pinnedItems.some((pin) => pin.id === pk.product.id));
    if (newPicks.length > 0) {
      const newNames = newPicks.map((pk) => pk.product.name_ar).slice(0, 2).join(' و ');
      res = { ...res, say: `احتفظتلك بنفس القطعة اللي اخترناها («${heroPin.name_ar}»)، ونسقتلك معاها ${newNames} تليق عليها جداً.` };
    } else if (plan.missing?.length > 0) {
      res = { ...res, say: `احتفظتلك بنفس القطعة اللي اخترناها («${heroPin.name_ar}»)، لكن للأسف مفيش قطعة مناسبة ومضمونة متاحة حالياً لطلبك في المحلات. تقدري تطلبيها ونوفرها لك فوراً بالزرار تحت.` };
    }
  }
  if (derivedBudget && plan.state === 'over_budget' && plan.total > 0) res = { ...res, say: `ده أرخص اختيار لقيته لطلبك دلوقتي: ${Number(plan.total).toLocaleString('en-US')} جنيه. لو عندك ميزانية معينة قوليلي رقمها بالظبط وأدورلك جواها.` };
  if (parsed.followup === 'show_more' && excludeIds.length && plan.people?.length && !needsClarificationFirst) {
    const ids = plan.people.flatMap((p) => p.picks.map((x) => x.product.id));
    if (ids.length && ids.every((id) => excludeIds.includes(id))) res = { ...res, say: 'ده اللي متاح دلوقتي لطلبك، ومفيش بدائل تانية غيره. لو عايز، غيّر اللون أو النوع أو الميزانية وأدورلك تاني.' };
  }
  const shown = !needsClarificationFirst && plan.people ? plan.people.flatMap((p) => p.picks.map((x) => x.product.id)) : [];
  const activeLook = !needsClarificationFirst && plan.people?.length ? {
    context: plan.context || parsed.context || null,
    persons: plan.persons || parsed.persons || [],
    items: plan.people.flatMap((p) => p.picks.map((pk) => ({
      id: pk.product.id,
      name: pk.product.name_ar,
      key: pk.product.key,
      slotKey: pk.slotKey,
      aud: p.aud,
      price: pk.product.price,
      formality: pk.product.formality,
      colorKeys: pk.product.colorKeys || [],
    }))),
  } : (session?.activeLook || null);
  const lookHistory = [
    ...(session?.lookHistory || []),
    ...(session?.activeLook ? [session.activeLook] : [])
  ].filter(Boolean).slice(-6);
  const nextSession = {
    turn: (session?.turn || 0) + 1, parsed: { ...parsed, advice: null, ...(derivedBudget ? { budget: session?.parsed?.budget ?? null } : {}) }, pending: plan.state === 'clarify' || Boolean(plan.ask?.length), pendingQuestion: plan.ask?.[0] || null, shown: [...new Set([...(session?.shown || []), ...shown])].slice(-60),
    altOffer,
    lastState: plan.state, lastTotal: needsClarificationFirst ? (session?.lastTotal ?? null) : (plan.total ?? null), lastBudgetUsed: needsClarificationFirst ? (session?.lastBudgetUsed ?? null) : (plan.budget ?? plan.total ?? null),
    activeLook,
    lookHistory,
  };
  return { ...res, session: nextSession, parsed, curated, debug: { eventTime } };
}
