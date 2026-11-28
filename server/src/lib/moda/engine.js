/**
 * محرك تويلا: رسالة (أو إجابة زرار) → رد جاهز. بدون موديل في المسار الأساسي.
 * runModa(messages, { products, profile, now, weatherMock, imageText, session, answers, llmExtract, fetcher })
 * بيرجع { ...response, session, parsed } — session بيتخزن عند العميل/السيرفر ويتبعت في الطلب الجاي.
 */
import { loadKnowledge } from './knowledge.js';
import { parseMessage, matchTokens } from './parse.js';
import { applyUnderstanding, rulesConfident } from './understand.js';
import { enrichAll } from './products.js';
import { planOutfit } from './plan.js';
import { respond, pick } from './respond.js';
import { guardResponse } from './guard.js';
import { matchFaq, faqAnswer } from './faq.js';
import { isInfoQuestion, searchAdvice, adviceByPhrase, HONEST_FALLBACK } from './knowledgeQa.js';
const STRONG_INFO = /(^| )(هل|ازاي|ليه|لية|يعني ايه|ايه الفرق|الفرق بين|الفرق ما بين|معني|معنى|بيتكرمش|بتتكرمش|بيصغر|بتصغر|بيكبر|بيبهت|بتبهت|بيتنفس|بيحك|بيسخن|بيشف|بيتوسع|بيدوم|بتدوم|بيفضل|هيصغر|هيكبر|هيبهت|هيتكرمش|بيتغسل|بتتغسل|بيتكوي|بتتكوي|يتغسل|تتغسل|بتوسع|بيوسع|بتضيق|بيضيق|بتتمدد|بيتمدد|بيصفر|بتصفر|خامه|خامة)( |$)/;
import { keywordSearch } from './search.js';
import { beautyMatch } from './beauty.js';
import { occasionOf, isGenericAsk, isOutfitAsk, INTIMATE_KEYS, explicitIntimate, rejectedFamilies, familyOfKey, productTypeChoices, productTypeQuestion, SMART_CASUAL_RE, occasionFit, APPAREL_FAMILIES } from './intent.js';
import { offersAnswer, careForShown } from './offers.js';
import { careFallback } from './parse.js';
import { DEFAULT_CONTACT, fillContact } from './contact.js';
import { buildKb } from './kb.js';
import { matchStore, aspectsOf, mentionsStoreWord, storeAnswer, askWhichStore, allStoresHours, GENERIC } from './stores.js';
import { norm, trainingTokens, isNumberToken } from './text.js';
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
import { serviceReply } from './service.js';
import { sizesLabel, sizeMatch } from './sizes.js';
import { factualText, unsupportedClaims } from './claims.js';

// الموسم: تويلا بتعرفه لوحدها من تاريخ النهارده (القاهرة) من غير ما تسأل. لو العميل قال صيف/شتا بيغلب.
const MONTH_TEMP = { 1: 14, 2: 15, 3: 19, 4: 23, 5: 28, 6: 31, 7: 34, 8: 34, 9: 30, 10: 25, 11: 20, 12: 16 };
const seasonTemp = (now, season) => (season === 'summer' ? 35 : season === 'winter' ? 10 : MONTH_TEMP[cairoParts(now).month] || 22);
const seasonBandOf = (now, season) => { const t = seasonTemp(now, season); return t >= 34 ? 'hot' : t >= 27 ? 'warm' : t >= 19 ? 'mild' : t >= 12 ? 'cool' : 'cold'; };
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
    } else if (id === 'wear_with') {
      const MAP = { tracksuit: ['tracksuit'], jalabiya: ['jalabiya'], tshirt_shorts: ['tshirt', 'shorts'], sneakers: ['sneakers'], slippers: ['slippers'], pajama: ['sleepwear'], hoodie_joggers: ['hoodie', 'joggers'], jeans_tshirt: ['jeans', 'tshirt'] };
      const ks = (MAP[v] || []).filter((k) => K.items.has(k));
      if (ks.length) out.garments = ks.map((key, position) => ({ key, color: null, material: null, text: key, position }));
      out.flags = { ...out.flags, wearWithAsked: true };
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

// طلب ترشيح من غير اسم قطعة («رشحيلي/اقترحيلي/نقيلي/اختارلي حاجة») = تسوق عام، مش اسم منتج
const RECO_RE = /(^| )(ت?رشح|ت?رشحي|ت?رشحو|اقترح|تقترح|تقترحي|اقترحي|نقي|تنقي|اختار|تختار|اختاري|تختاري)(لي|يلي|ولي|لنا|يلنا|ولنا)( |$)|(^| )(ترشيح|ترشيحات|ترشيحاتك|اقتراحاتك)( |$)/;
const RECO_LATIN_RE = /(^|\s)(rash7ly|rashe7ly|rashe7li|rash7li|ra4a7ly|ra4e7ly|e2tere7ly|eqtere7ly|2tere7ly|na2eely|na2ily)(?=\s|$|[?!.,])/;
const DISCOVERY_RE = /(^| )(وريني|ورينى|عايز|عايزه|عاوز|عاوزه|هاتلي|رشحلي|رشحيلي|اقترحي|اقترحلي|عندك|عندكم)( [^ ]+){0,3} (احلي|احلى|احسن|اجمل|حاجه حلوه|حاجات حلوه|حاجه شيك|حاجات شيك|حاجه عمليه|حاجات عمليه|حاجه جديده|حاجات جديده|الجديد|جديدكم|اي حاجه|حاجات لقطه|حاجه لقطه|لقطات|لقطه)( |$)|(^| )(اجدد|اغير|نجدد|نغير) (دولاب|لبس|هدوم|ستايل|الدولاب)[^ ]*( |$)|(^| )(اشوف|نشوف) (عندكم|عندك|عندكو) (ايه|اي)( |$)|(^| )(ashoof|ashof|nshoof|a4oof|ashouf)( [^ ]+){0,2} (gded|gdeed|gedid|gdid|el gded|el gdeed)( |$)|(^| )(زهقان|زهقانه|زهقت) من (لبسي|هدومي|دولابي)( |$)/;
// وصف جسم المتكلم نفسه (مش وصف القطعة: «فستان قصير» مش هنا)
const BODY_SELF_RE = /(جسمي|بشرتي|طولي|اكتافي|كتافي|اكتاف عريضه|اردافي|ارداف عريضه|رقبتي|كمثري|كمثرى|تفاحه|كرش|بطني|انا (طويل|طويله|قصير|قصيره|مليان|مليانه|نحيف|نحيفه|رفيع|رفيعه|تخين|تخينه))/;
const BODY_WORDS_RE = /(كرش|بطني|البطن|عندي بطن|انا طويل|انا طويله|جسمي|بشرتي|طولي|اكتاف|كتافي|اكتافي|ارداف|اردافي|رقبتي|كمثري|كمثرى|تفاحه|مليان|مليانه|تخين|تخينه|نحيف|نحيفه|رفيع|رفيعه|اتخن|يبلعني|قصيره|قصير|سمرا|اسمر|قمحي|قمحاوي|قمحاويه|خمري|خمريه)/;
const AMBIG_BARE_GARMENT = new Set(['ماكسي', 'ميدي', 'سواريه', 'سهره']);
const REFINE_RE = /(^| )(?:لل|بال|وال|ال|ل|و|ب)?(سهره|سواريه|ميدي|ماكسي|قصير|قصيره|طويل|طويله|بكم|باكمام|بأكمام|كم طويل|نص كم|كم قصير|من غير كم|بسوسته|سوسته|سوستة|مقفول|مقفوله|مفتوح|سادة|ساده|مشجر|مشجره|منقوش|منقوشه|نقشه|تطريز|مطرز|بتطريز|الخامه|خامه|قماشه|شيفون|قطن|كتان|ساتان|صوف|تريكو|حرير|لينين|واسع|واسعه|ضيق|ضيقه|اوفر سايز|فيت|سليم|ريجولار)( |$)/;

/** جنس المتكلم (مش المستلم) بيفضل زي ما هو بين الرسايل: لو الرسالة الجديدة مفيهاش علامة، أو علامتها ضعيفة («عايزه» بالهاء) وعكس اللي قبلها. */
const speakerCarry = (parsed, session) => {
  const prev = session?.parsed?.genderHint || null;
  if (!prev) return {};
  if (!parsed?.genderHint || (parsed.genderHint !== prev && parsed.flags?.genderWeak)) return { genderHint: prev };
  return {};
};

const mergeFromSession = (cur, prev) => {
  if (!prev) return cur;
  const m = { ...cur };
  m.flags = { ...(prev.flags || {}), ...(cur.flags || {}) };
  for (const k of ['persons', 'garments', 'colors', 'avoidColors', 'taste', 'ownedPieces', 'style']) if (!m[k]?.length && prev[k]?.length) m[k] = prev[k];
  if (m.context && cur.context == null && prev.flags?.ctxFromStyle && !cur.flags?.ctxFromStyle) m.flags = { ...m.flags, ctxFromStyle: true };
  for (const k of ['context', 'contextEffective', 'budget', 'daypart', 'dateOffsetDays', 'season']) if ((m[k] === null || m[k] === undefined) && prev[k] != null) m[k] = prev[k];
  if (prev.genderHint && (!m.genderHint || (m.genderHint !== prev.genderHint && cur.flags?.genderWeak))) m.genderHint = prev.genderHint; // جنس المتكلم ثابت طول المحادثة
  if (!cur.context && prev.role) m.role = prev.role;
  if (cur.avoidContexts?.length && m.context && cur.avoidContexts.includes(m.context)) { m.context = null; m.contextEffective = null; }
  // «لا اسود» / «خليه كحلي»: لون جديد في الرسالة بيغيّر لون القطعة الوحيدة المطلوبة قبل كده
  if (!cur.garments?.length && cur.colors?.length === 1 && prev.garments?.length === 1) { const pc = prev.garments[0].color; m.garments = [{ ...prev.garments[0], color: cur.colors[0] }]; m.colors = []; if (pc && pc !== cur.colors[0]) { const ph = prev.flags?.colorHistory?.key === prev.garments[0].key ? prev.flags.colorHistory.colors : []; m.flags = { ...m.flags, colorHistory: { key: prev.garments[0].key, colors: [...new Set([...ph, pc])].slice(-3) } }; } }
  if (cur.avoidColors?.length && Array.isArray(m.garments)) m.garments = m.garments.map((g) => (g.color && cur.avoidColors.includes(g.color) ? { ...g, color: null } : g));
  return m;
};

/** قطع مذكورة في نص (حسب قاموس المرادفات) وغير موجودة في مجموعة المسموح بيها. بنعتبر البنطلون/الشينو والجزمة/اللوفر مجموعة واحدة. */
const EQUIV = [['trousers', 'chinos'], ['shirt', 'polo'], ['formal_shoes', 'loafers']];
// فستان سهرة/سواريه/حفلات/«فستان» عام: عيلة واحدة. ذكر «الفستان» وإحنا عارضين فستان سواريه مش قطعة زيادة
const isDressFamily = (key, allowed) => /^dress_/.test(key) && [...allowed].some((k) => /^dress_/.test(k));
export function strayGarments(K, text, allowedKeys, allowedNames = '') {
  const allowed = new Set(allowedKeys);
  for (const g of EQUIV) if (g.some((k) => allowed.has(k))) g.forEach((k) => allowed.add(k));
  const toks = norm(text).split(' ').filter(Boolean);
  const hay = new Set([` ${toks.join(' ')} `, ` ${toks.map((t) => t.replace(/^[وبلف](?=.{3,})/, '')).join(' ')} `]);
  const found = new Set();
  const extra = { boots: ['بوتس'] };
  // نفس قاموس القطع اللي المحلل بيستخدمه (فيه «كلاتش»، «كروس»… اللي مش في synonyms.garments)
  // الكلمة جزء من اسم منتج معروض فعلًا («سويت تيشيرت» من «سويت تيشرت») → مش قطعة زيادة
  const names = ` ${norm(allowedNames || '')} `;
  const inNames = (w) => norm(w).split(' ').some((t) => { const n = t.replace(/^(ال|وال|بال|و|ب|ل)/, ''); return n.length >= 3 && names.includes(` ${n}`); });
  try { for (const m of matchTokens(toks, K)) for (const e of m.entries || []) if (e.group === 'garment' && !allowed.has(e.key) && !isDressFamily(e.key, allowed) && !inNames(m.text)) found.add(e.key); } catch { /* نكمل بالطريقة القديمة */ }
  for (const [key, aliases] of Object.entries(K.synonyms.garments)) {
    if (allowed.has(key) || isDressFamily(key, allowed)) continue;
    for (const a of [...aliases, ...(extra[key] || [])]) {
      const n = norm(a); if (n.length < 3) continue;
      if ([...hay].some((h) => h.includes(` ${n} `))) { found.add(key); break; }
    }
  }
  return [...found];
}
// «مش عاوز حاجه كلاسيك» بعد ما تويلا عرضت طقم: تعديل على الطلب اللي فات (نفس الشخص والمناسبة والميزانية) مش طلب جديد من الصفر.
const NEG_STYLE = /^(?:لا |لأ |لاء )?(?:انا )?مش (?:عاوزه?|عايزه?|حابب|حابه|بحب|عاجبني|عاجبه)(?:ه|ها)? ?(?:حاجه|حاجة|لبس|طقم|اللبس|الطقم|حاجات)? ?(?:ال)?(كلاسيك|كلاسيكي|رسمي|رسميه|شيك|كاجوال|سبور|سبورت|ضيق|واسع|فاتح|غامق)$/;
// «شوفلي حاجه تانيه / عاوز طقم تاني / غيرلي الطقم / فيه غيرها / مش عاجبني»: نفس الطلب اللي فات بس بقطع مختلفة (من غير اللي اتعرض قبل كده)
const ANOTHER = /^(?:(?:ممكن|طب|ياريت|لو سمحت|يلا) )*(?:(?:شوفلي|هاتلي|وريني|عاوزه?|عايزه?|اديني|رشحلي|جيبلي|غيرلي|غير|دورلي) )?(?:انا )?(?:(?:حاجه|حاجات|طقم|لوك|اطقم|اطلاله|اختيار|اختيارات|شكل|واحد|واحده|الطقم|اللوك|ده|دي|دا) )?(?:تاني|تانيه|غير(?:ه|ها|هم|دي|ده|دا)?|مختلفه?|جديده?|بديل|بدائل|اخر|اخري|مش عاجب(?:ني|ها|ه)|مش دي|مش ده)(?: (?:خالص|بقي|لو سمحت))?$|^(?:في|فيه) (?:غير(?:ه|ها|هم)|حاجه تانيه|بدائل|اختيارات تانيه)$|^غير(?:لي|ه|ها|هم|دي|ده)? (?:الطقم|اللوك|ده|دي|الاطلاله)$/;
const CONFUSED = /^(?:انا )?(?:مش فاهم|مش فاهمه|مفهمتش|مفهمتكيش|مش واضح|فهمني|يعني ايه|يعني ايه؟|ايه ده)[ ؟?.!]*$/;
const plainAr = (t) => String(t || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '').replace(/[؟?!.،,]+/g, ' ').replace(/\s+/g, ' ').trim();
export async function runModa(messages, opts = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const last = list[list.length - 1];
  const lastText = last?.role === 'user' && typeof last.content === 'string' ? plainAr(last.content) : '';
  const prevAssistant = [...list].reverse().find((m) => m?.role === 'assistant' && typeof m.content === 'string')?.content || '';
  // «مش فاهم»: ما نكررش نفس الجملة حرفيًا؛ نبسّط السؤال ونديله أمثلة
  if (lastText && CONFUSED.test(lastText) && prevAssistant && /[؟?]/.test(prevAssistant) && opts.session?.lastQuestionAsked !== false) {
    const res = await runModaCore(messages, opts);
    if (res && res.say && plainAr(res.say) === plainAr(prevAssistant)) {
      const ex = /مناسب/.test(prevAssistant) ? ' كلمة واحدة تكفي، زي «خروجة» أو «شغل» أو «فرح»، أو قولي القطعة اللي عاوزها.' : ' اكتبلي إجابة قصيرة، أو قولي القطعة اللي عاوزها.';
      return withMemory(withOccasion({ ...res, say: `معلش، يمكن مش واضحة مني. بسألك: ${String(prevAssistant).trim()}${ex}` }), opts);
    }
    return withMemory(withOccasion(res), opts);
  }
  let msgs = messages; let composite = null;
  const prevShop = opts.session?.lastShopText;
  if (lastText && prevShop && ANOTHER.test(lastText) && (opts.session?.shown || []).length) {
    const res = await runModaCore([...list.slice(0, -1), { ...last, content: prevShop }], { ...opts, forceOther: true });
    if (res?.session && typeof res.session === 'object') res.session = { ...res.session, lastShopText: prevShop };
    return withMemory(withOccasion(res), opts);
  }
  if (lastText && prevShop && NEG_STYLE.test(lastText)) { composite = `${prevShop} ${last.content}`.slice(0, 400); msgs = [...list.slice(0, -1), { ...last, content: composite }]; }
  const res = await runModaCore(msgs, opts);
  if (res?.session && typeof res.session === 'object' && res.blocks?.tabs?.length && (res.state === 'full' || res.state === 'partial') && lastText && !CONFUSED.test(lastText)) {
    const keep = composite || (last?.role === 'user' && typeof last.content === 'string' ? last.content : null);
    if (keep && !NEG_STYLE.test(plainAr(keep))) res.session = { ...res.session, lastShopText: keep.slice(0, 400) };
  }
  return withMemory(withOccasion(res), opts);
}

/** حقل «occasion» العام (evening / wedding / work…) جنب المفتاح الداخلي context، و«style» دايمًا array. إضافة بس: الواجهة القديمة بتتجاهلها. */
function withOccasion(res) {
  if (!res || typeof res !== 'object') return res;
  const fix = (p) => (p && typeof p === 'object' ? { ...p, style: Array.isArray(p.style) ? p.style : [], occasion: occasionOf(p) } : p);
  return { ...res, parsed: fix(res.parsed), ...(res.session && typeof res.session === 'object' ? { session: { ...res.session, parsed: fix(res.session.parsed) } } : {}) };
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
  out.garmentHistory = objs(s.garmentHistory).slice(-6);
  out.excludedTypes = strs(s.excludedTypes).slice(-8);
  if (out.parsed) out.parsed.style = strs(out.parsed.style);
  out.lookHistory = arr(s.lookHistory).map(look).filter(Boolean);
  out.lastSearch = s.lastSearch && s.lastSearch.type === 'beauty' && typeof s.lastSearch.text === 'string' ? { type: 'beauty', text: s.lastSearch.text.slice(0, 300), turn: Number(s.lastSearch.turn) || 0 } : null;
  return out;
}

/** هل لونين بيمشوا مع بعض؟ (نظرية ألوان عامة، مش بيانات محل). */
const NEUTRALS = new Set(['black', 'white', 'grey', 'beige', 'cream', 'off_white', 'navy', 'camel', 'nude', 'champagne']);
const GOOD_PAIRS = [['red', 'black'], ['red', 'white'], ['red', 'beige'], ['red', 'grey'], ['red', 'navy'], ['blue', 'brown'], ['blue', 'white'], ['blue', 'beige'], ['blue', 'grey'], ['brown', 'beige'], ['brown', 'cream'], ['brown', 'olive'], ['olive', 'beige'], ['olive', 'black'], ['olive', 'white'], ['pink', 'grey'], ['pink', 'navy'], ['pink', 'white'], ['pink', 'beige'], ['yellow', 'navy'], ['yellow', 'grey'], ['yellow', 'white'], ['purple', 'grey'], ['purple', 'white'], ['purple', 'beige'], ['green', 'brown'], ['green', 'beige'], ['green', 'white'], ['emerald', 'black'], ['emerald', 'gold'], ['burgundy', 'navy'], ['burgundy', 'beige'], ['burgundy', 'gold'], ['orange', 'navy'], ['orange', 'white'], ['orange', 'brown'], ['gold', 'black'], ['gold', 'navy'], ['silver', 'black'], ['silver', 'navy']];
const RISKY_PAIRS = [['red', 'pink'], ['red', 'orange'], ['red', 'green'], ['purple', 'green'], ['orange', 'pink'], ['blue', 'green'], ['yellow', 'purple'], ['brown', 'black'], ['navy', 'black'], ['red', 'purple'], ['green', 'orange']];
function colorComboAnswer(a, b, ar) {
  const A = ar(a); const B = ar(b);
  const has = (list) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (a === b) return null;
  if (has(GOOD_PAIRS)) return `${A} مع ${B} تركيبة حلوة وشغالة، من الكلاسيكيات اللي بتتنسق بسهولة.`;
  if (NEUTRALS.has(a) || NEUTRALS.has(b)) return `${A} مع ${B} ينفعوا، لأن اللون المحايد (الأسود والأبيض والبيج والرمادي والكحلي) بيمشي مع أغلب الألوان.`;
  if (has(RISKY_PAIRS)) return `${A} مع ${B} ينفعوا بس بحذر: خلّي واحد منهم هو الأساسي والتاني لمسة صغيرة (إكسسوار أو شنطة)، أو افصل بينهم بلون محايد زي الأبيض أو البيج.`;
  return `${A} مع ${B} ممكن يمشوا لو واحد غامق وواحد فاتح، أو واحد منهم هو الأساسي والتاني لمسة بسيطة. ولو محتار، حط لون محايد بينهم (أبيض، بيج، أسود).`;
}

/** نصايح عامة (مش من بيانات المحل) عن لون البشرة وشكل الجسم؛ بتتستخدم لو الموديل مش متاح. من غير أسعار ولا منتجات. */
function bodyAdvice(n) {
  const parts = [];
  if (/(سمرا|سمراء|اسمر|سمره|داكنه|دهبي|قمحي|قمحيه|قمحاوي|قمحاويه|خمري|خمريه|حنطي|بيضا|بيضاء|فاتحه|بشرتي)/.test(n) && /(بشرت|لون|الوان|اسمر|سمرا|سمراء|قمحي|قمحاوي|خمري|بيضا|فاتحه)/.test(n)) {
    if (/(سمرا|سمراء|اسمر|سمره|داكنه)/.test(n)) parts.push('البشرة السمرا بتلمع مع الألوان الغنية والجريئة: الأبيض الناصع، الأصفر والخردلي، الأحمر، الفوشيا، الأخضر الزمردي، والذهبي. وابعدي (أو ابعد) عن الألوان الباهتة القريبة من لون البشرة زي البيج الغامق والبني الباهت لأنها بتطفّي الإطلالة.');
    else if (/(قمحي|قمحيه|قمحاوي|قمحاويه|خمري|خمريه|حنطي)/.test(n)) parts.push('البشرة القمحي بتحلو مع الألوان الدافية والترابية: الزيتي، القرميدي، الأخضر الغامق، الكحلي، الوردي الدافي، والذهبي.');
    else parts.push('البشرة البيضا بتحلو مع الباستيل والألوان الهادية: الأزرق السماوي، الوردي، الكحلي، النبيتي، والأخضر الزمردي. وابعدي (أو ابعد) عن الكريمي والبيج الفاتح جدًا لأنهم بيبهتوا البشرة.');
  }
  if (/(تخين|تخينه|ممتلئ|ممتلئه|سمين|سمينه|وزني زايد|كرش|مليان|مليانه|اتخن|البطن|بطني|بطن|تداري بطني)/.test(n) && !/(نحيف|نحيفه|رفيع|رفيعه)/.test(n)) parts.push('للجسم الممتلئ: الألوان الغامقة الموحدة (أسود، كحلي، نبيتي، زيتي) بتدّي رشاقة، والخطوط الرأسية والقصات المستقيمة أو الـA-line أحسن من الأقمشة اللاصقة أو الواسعة جدًا. ركّز على مقاس مظبوط على الكتف مش ضيق ولا فضفاض.');
  if (/(نحيف|نحيفه|رفيع|رفيعه|مفيش جسم)/.test(n)) parts.push('للجسم النحيف: الطبقات (قميص تحت سويتر أو جاكيت)، والألوان الفاتحة، والخطوط العرضية، والأقمشة السميكة شوية بتضيف حجم.');
  if (/(قصير|قصيره)/.test(n) && !/(قصير الكم|كم قصير)/.test(n) && !/(رقبتي|رقبه)( [^ ]+){0,1} (قصيره|قصير)/.test(n)) parts.push('للطول القصير: بنطلون عالي الخصر، ولون واحد من فوق لتحت، وطول فستان فوق الركبة أو ميدي من غير حاشية طويلة بيطوّلوا الشكل.');
  if (/(طويل|طويله)( |$)/.test(n)) parts.push('للطول الفارع: تقدر تلبس الماكسي والقصات الطويلة والأوفر سايز براحتك، والألوان المقسومة (جزء فوق وجزء تحت) بتوازن الطول.');
  if (/(تفاحه|تفاحي)/.test(n)) parts.push('للجسم التفاحة (الوسط أعرض): قصّات الإمباير (الخصر تحت الصدر)، والياقة V، والبلوزات المنسدلة اللي مش لازقة في البطن، وابعد عن الحزام العريض في نص الجسم.');
  if (/(اكتاف|كتاف|كتافي|اكتافي|الكتف)( [^ ]+){0,1} (عريض|عريضه)|(عرض|بعرض) (ال)?(اكتاف|كتاف|كتف)/.test(n)) parts.push('للأكتاف العريضة: الياقة V أو الياقة المفتوحة، والأكمام الراجلان، والألوان الأغمق فوق، وتحت قصّات واسعة أو A-line توازن الشكل، وابعد عن الكتافات والياقة المركب (Boat neck).');
  if (/(ارداف|اردافي|الارداف|الوسط)( [^ ]+){0,1} (عريض|عريضه)/.test(n)) parts.push('للأرداف العريضة: لفّت النظر لفوق بلون أفتح أو تفاصيل عند الكتف، وتحت ألوان غامقة وقصّات A-line أو مستقيمة، والبليزر الطويل اللي بيغطي الأرداف بيكون أحسن من القصير.');
  if (/(رقبتي|رقبه)( [^ ]+){0,1} (قصيره|قصير)/.test(n)) parts.push('للرقبة القصيرة: الياقة V والقمصان المفتوحة من فوق بتطوّل الرقبة، وابعد عن الهاي نك والياقات العالية والسلاسل القصيرة.');
  if (/(مثلث|كمثري|كمثرى)/.test(n)) parts.push('للجسم الكمثري: لفّت نظر لفوق بألوان أفتح أو أكتاف مزخرفة، وتحت بلون غامق بقصة A-line.');
  return parts.length ? parts.join(' ') + ' تحب أرشحلك قطع من المتاح بالألوان دي؟ قولي لأنهي مناسبة وأنا أدور.' : null;
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
    // «تمام، لا خليه سماوي…» / «ماشي بس غيّر اللون…» / «اوكي، نرجع للبنطلون»: كلمة موافقة قبل تصحيح → نشيلها عشان التصحيح يتفهم زي ما هو
    if (rawSession?.parsed?.garments?.length) t = t.replace(/^\s*(?:تمام|اوكي|أوكي|اوك|ok|okay|ماشي|طيب|طب|حلو|خلاص|ايوه|أيوه|ايوة|أيوة|اه)\s*[،,.!]*\s*(?:بس\s+|و\s*)?(?=(?:لا|لأ|لاء|خلي|خليه|خليها|غير|غيّر|غيري|بدل|بدّل|نرجع|رجع|رجعني|رجعيني|انسى|انسي|سيبك)(?:\s|$|[،,]))/i, '');
    // مقاس لوحده بعد طلب قبل كده («XL» / «لا 43» / «خليه L»)
    const mm = t.trim().replace(/[.!،,؟?]+$/, '').match(/^(?:(?:لا|لأ|لاء|بل)[،,]?\s+)?(?:معلش[،,]?\s+)?(?:(?:خليه|خليها|هاته|هاتها|مقاسي|خليهولي)\s+)?(xxs|xs|s|m|l|xl|xxl|xxxl|[3-5][0-9])$/i);
    if (mm && rawSession?.parsed?.garments?.length) t = `مقاس ${mm[1]}`;
    // «لأ معلش المقاس خليه 36» / «خلي المقاس XL»: تغيير مقاس على نفس الطلب
    const mc = !mm && t.trim().replace(/[.!،,؟?]+$/, '').match(/^(?:(?:لا|لأ|لاء)[،,]?\s+)?(?:معلش\s+)?(?:(?:ال)?(?:مقاس|سايز)\s+(?:خليه|خليها|يبقى|يكون|هيبقى)|(?:خلي|خليه|خليها)\s+(?:ال)?(?:مقاس|سايز))\s+(xxs|xs|s|m|l|xl|xxl|xxxl|[3-5][0-9])$/i);
    if (mc && rawSession?.parsed?.garments?.length) t = `مقاس ${mc[1]}`;
    // «اسود 34» / «eswed 34»: لون + مقاس كرد على طلب شغال
    const mcs = !mm && !mc && t.trim().replace(/[.!،,؟?]+$/, '').match(/^([أا]سود|سود[اه]|[أا]بيض|بيض[اه]|كحلي|بيج|رمادي|[أا]زرق|زرق[اه]|[أا]حمر|حمر[اه]|[أا]خضر|خضر[اه]|بني|eswed|aswad|iswed|soda|abyad|abyd|beda|bida|ko7li|kohly|ko7ly|bej|beige|rmadi|ramady|rmady|azra2|zar2a|a7mar|7amra|akhdar|a5dar|bonni|bonny|black|white|navy|grey|gray|blue|red|green|brown)\s+(xxs|xs|s|m|l|xl|xxl|xxxl|[3-5][0-9])$/i);
    if (mcs && rawSession?.parsed?.garments?.length) t = `${mcs[1]} مقاس ${mcs[2]}`;
    return t;
  })();
  const dow = cairoParts(now).dow;
  const seed = `${text}|${session?.turn || 0}`;
  let parsed = parseMessage(text, { profile, imageText, now, cairoDow: dow });
  // «اقل من 1000»: رقم ميزانية في رسالة قصيرة
  const budgetOf = (s) => { const t = norm(s); const m1 = t.match(/(?:ارخص من|اقل من|اقل|تحت|لحد|بحد|بحد اقصي|في حدود|حوالي|ميزانيتي|ب)\s*(\d{2,6})/) || t.match(/(\d{2,6})\s*(?:جنيه|ج|egp)(?: او اقل| بس)?( |$)/); return m1 ? Number(m1[1]) : null; };
  const BUDGET_WORDS = /(ارخص|اقل|تحت|لحد|بحد|حدود|ميزاني|جنيه|ج\b|بسعر|سعر)/;
  // نتايج البحث: أفضل 3 بس (مش قايمة طويلة تتمرر)؛ meta بتحفظ آخر بحث عشان «اقل من 1000» تتطبق عليه
  const searchReply = (hits, sayText = null, meta = null) => {
    hits = hits.slice(0, 3);
    const items = hits.map((p) => ({ id: p.id, key: p.key, label: String(K.items.get(p.key)?.ar || '').replace(/\s*\(.*?\)\s*/g, '').split(' / ')[0].trim() || (p.cat_text || '').split(' ')[0] || p.dept_name || 'منتج', name: p.name_ar || p.name_en, price: p.price, store: p.store_slug || null, image: p.image || p.image_url || p.thumb || null, colors: p.colorKeys || [] }));
    return { state: 'full', intent: 'shop', say: sayText || (hits.length === 1 ? 'لقيتلك ده في المحلات:' : 'دي اللي لقيتها في المحلات ليك:'), tips: [], styleTips: [], questions: [], missing: [], relaxed: [], parsed,
      blocks: { tabs: [{ id: 'search', label: 'النتايج', look: null, items, subtotal: items.reduce((t, i) => t + (Number(i.price) || 0), 0), missing: [] }], total: 0, budget: null, over: 0, palette: [], couple: false },
      session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: session?.parsed || null, pending: false, pendingQuestion: null, lastSearch: meta ? { ...meta, turn: (session?.turn || 0) + 1 } : null, shown: [...new Set([...(session?.shown || []), ...hits.map((h) => h.id)])] } };
  };
  // ---------- تجميل وعناية (بشرة، مكياج، شعر، جسم، عطور) ----------
  // بتتجاوب من أقسام التجميل الحقيقية؛ من غيرها كانت تويلا بتقول «مش عارفاها كقطعة لبس» أو بتسأل «لأنهي مناسبة؟»
  if (!(answers && Object.keys(answers).length) && !parsed.garments.length && !parsed.followup && !session?.pending) {
    const bmax = BUDGET_WORDS.test(norm(text)) ? budgetOf(text) : null;
    const bz = beautyMatch(text, ensureEnriched(products, K), { limit: 3, budget: bmax });
    if (bz) {
      const bIn = bz.hits;
      if (bIn.length) return searchReply(bIn, bmax ? `${bz.say.replace(/:\s*$/, '')} في حدود ${bmax} جنيه:` : bz.say, { type: 'beauty', text });
      if (bmax && bz.all.length) { const cheap = [...bz.all].sort((a, b) => a.price - b.price)[0]; const r0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang: parsed.lang === 'en' ? 'en' : 'ar', profile, assistantName }); return { ...r0, say: `مفيش في الطلب ده حاجة بأقل من ${bmax} جنيه دلوقتي${cheap ? `. أرخص حاجة «${cheap.name_ar || cheap.name_en}» بـ ${Number(cheap.price).toLocaleString('en-US')} جنيه` : ''}. تحبي أرفع الميزانية؟`, tips: [], styleTips: [], questions: [], blocks: null, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1, lastSearch: { type: 'beauty', text, turn: (session?.turn || 0) + 1 } }, parsed }; }
      const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang: parsed.lang === 'en' ? 'en' : 'ar', profile, assistantName });
      return { ...res0, say: bz.say, tips: [], styleTips: [], questions: [], blocks: null, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
  }

  // المستلم غير المتكلم (ست بتشتري لجوزها): متابعة من غير تحديد جمهور جديد لازم تفضل على المستلم مش ترجع للمتكلم
  { const sp0 = session?.parsed; const spkAud = sp0?.genderHint === 'female' ? 'women' : sp0?.genderHint === 'male' ? 'men' : null;
    if (sp0?.persons?.length === 1 && spkAud && sp0.persons[0] !== spkAud && !sp0.flags?.personFromSpeaker && !parsed.persons?.length && !parsed.genderHint && parsed.garments.length) parsed = { ...parsed, persons: sp0.persons, genderHint: sp0.genderHint }; }
  // متابعة من غير قطعة جديدة («لأ عايز اكبر») مش بتغيّر لمين اللبس: «عايز» هنا بتدل على المتكلم مش على المستلم (جوز بيشتري لمراته)
  if (session?.parsed?.persons?.length && !session.parsed.flags?.personFromSpeaker && parsed.flags?.personFromSpeaker && (!parsed.garments.length || /(^| )(كمان|برضو|برضه|معاه|معاها|معاهم)( |$)|^و[^ ]+ /.test(norm(text)))) parsed = { ...parsed, persons: session.parsed.persons, flags: { ...parsed.flags, personFromSpeaker: false } };
  // «فستان سهرة / fostan sahra»: النوع فستان والمناسبة سهرة (مش نوع «فستان سهرة» بيطابق بس المنتجات اللي اسمها فيه سهرة)
  // («ماكسي / فستان طويل» = طول، مش مناسبة: مابيحطوش سهرة)
  { const evWord = (g) => g.key === 'dress_evening' && /(سهر|sahra|sa7ra|evening|soiree|سواريه)/i.test(norm(String(g.text || '')));
    if (parsed.garments.some(evWord) && !parsed.context && !(parsed.persons || []).some((a) => a === 'men' || a === 'boys')) parsed = { ...parsed, context: 'evening_out', contextEffective: 'evening_out' };
    // السهرة بالليل: «للسهرة» كانت بتتقري وقت (ليل)، فبنحافظ على ده
    if (parsed.context === 'evening_out' && !parsed.daypart) parsed = { ...parsed, daypart: 'night' }; }
  // «طقم كاجوال / فستان كاجوال»: «كاجوال» هنا ستايل للقطعة، مش مناسبة
  if (parsed.flags?.ctxFromStyle && parsed.garments.length) parsed = { ...parsed, context: null, contextEffective: null };
  // «وريني أحلى حاجة / عايزة أجدد دولابي / حاجة عملية ألبسها»: طلب استكشاف عام = تسوق (من غير قطعة محددة)
  const discoveryAsk = !parsed.garments.length && !parsed.context && parsed.intent !== 'advice' && !matchFaq(text)
    && (DISCOVERY_RE.test(` ${parsed.normalized || norm(text)} `) || RECO_RE.test(` ${norm(text)} `) || RECO_LATIN_RE.test(` ${String(text).toLowerCase()} `));
  if (discoveryAsk && (parsed.intent === 'unknown' || parsed.intent === 'followup')) parsed = { ...parsed, intent: 'shop', flags: { ...parsed.flags, discovery: true } };
  // «معايا X نسقلي عليه»: لو X كلمة مش معروفة كقطعة لبس، نقول مش فاهمين بدل ما نسأل أسئلة ونرشح من التخمين
  if (!(answers && Object.keys(answers).length) && !imageText && !parsed.garments.length && !parsed.ownedPieces?.length) {
    const nt = parsed.normalized || norm(text);
    const mm = nt.match(/(?:^| )(?:معايا|معايه|عندي|لابس|لابسه|لابسة|اشتريت|شريت|جبت|عايز|عايزه|عايزة|عاوز|عاوزه|عاوزة|محتاج|محتاجه|محتاجة|دورلي|هاتلي|وريني|ورينى|نفسي في|ابغي|عايزين|عاوزين) (?:ال)?([^ ]+)/);
    const w = mm?.[1];
    const SKIP = new Set(['عنوان', 'العنوان', 'لوكيشن', 'موقع', 'الموقع', 'رقم', 'تليفون', 'مواعيد', 'ساعات', 'فرع', 'فروع', 'خريطه', 'اتجاهات', 'استفسار', 'لبس', 'اللبس', 'هدوم', 'الهدوم', 'ملابس', 'الملابس', 'فكره', 'فكرة', 'هديه', 'هدية', 'هدايا', 'هديتين', 'اقتراح', 'اقتراحات', 'نصيحه', 'نصيحة', 'رايك', 'راي', 'رأيك', 'حجز', 'اوردر', 'الاوردر', 'طلب', 'طلبي', 'حاجه', 'حاجة', 'حاجات', 'قطعه', 'قطعة', 'واحد', 'واحده', 'واحدة', 'طقم', 'شويه', 'شوية', 'ميزانيه', 'ميزانية', 'فلوس', 'مبلغ', 'مناسبه', 'مناسبة', 'ورقه', 'صوره', 'صورة', 'مشكله', 'مشكلة', 'سؤال', 'استفسار', 'وقت', 'ساعه', 'ساعة', 'يوم', 'مقاس', 'اسأل', 'اعرف', 'اشوف', 'اشتري', 'اروح', 'احجز', 'اطلب', 'اسالك', 'اساعد', 'مساعده', 'مساعدة', 'خصم', 'عروض', 'توصيل', 'شحن', 'رقم', 'سعر', 'اسعار', 'حاجة', 'شيء', 'اي', 'ايه', 'كام', 'تغيير', 'استرجاع', 'ارجاع', 'استبدال', 'تتبع', 'اوردر', 'طلب', 'حساب', 'تسجيل', 'مشاركه', 'اتكلم', 'اكلم', 'اتواصل', 'كوبون', 'محل', 'محلات', 'متجر']);
    if (w && w.length >= 3 && !SKIP.has(w) && !isNumberToken(w) && /^[\u0600-\u06FF]+$/.test(w) && !matchTokens([w], K).length && !matchTokens([`ال${w}`], K).length && !(Array.isArray(products) && products.some((pr) => ` ${norm(`${pr.name_ar || ''} ${pr.cat_text || ''}`)} `.includes(` ${w} `))) && !parsed.context && !parsed.advice && !parsed.followup && !matchFaq(text) && !session?.pending && !(BODY_WORDS_RE.test(nt) && bodyAdvice(nt)) && !discoveryAsk) { // سؤال عن الجسم/البشرة («عندي أكتاف عريضة») مش قطعة لبس مجهولة
      const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang: parsed.lang === 'en' ? 'en' : 'ar', profile, assistantName });
      return { ...res0, say: `مش فاهمة طلبك: «${w}» مش عارفاها كقطعة لبس. اكتبيلي اسمها تاني (زي شبشب أو فستان أو بنطلون) أو ابعتيلي صورتها وأنا أنسقلك الباقي.`, tips: [], styleTips: [], questions: [], blocks: null, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
  }
  // معاه قطعة (شبشب/كوتشي/فستان/ترنج...) من غير مناسبة: نجيب القطع اللي بتتلبس معاها ونسيرش عليها في المحلات
  if (!(answers && Object.keys(answers).length) && !parsed.garments.length && !parsed.context && parsed.ownedPieces?.length && parsed.persons?.length) {
    // التنسيق حوالين قطعة العميل جاي من قاعدة المعرفة (knowledge/fashion_kb.json) + قواعد Twist في knowledge/kb_bridge.json
    const menOnly = parsed.persons.includes('men') && !parsed.persons.some((p) => p === 'women' || p === 'women_hijab');
    const side = menOnly ? 'men' : 'women';
    const have = new Set(parsed.ownedPieces.map((o) => o.key));
    const sBand = seasonBandOf(now, parsed.season); const hotS = sBand === 'hot' || sBand === 'warm'; const coldS = sBand === 'cool' || sBand === 'cold';
    const WINTER_ONLY = new Set([...K.items.keys()].filter((k) => K.kb?.seasonOf(k) === 'winter')); const SUMMER_ONLY = new Set([...K.items.keys()].filter((k) => K.kb?.seasonOf(k) === 'summer')); const SWAP_COLD = { shorts: 'jeans', sandals: 'sneakers' };
    const seasonal = (alts) => {
      let a = alts.filter((k) => !(hotS && WINTER_ONLY.has(k)) && !(coldS && SUMMER_ONLY.has(k)));
      if (!a.length && coldS && SWAP_COLD[alts[0]]) a = [SWAP_COLD[alts[0]]];
      return a;
    };
    const specs = [...new Set(parsed.ownedPieces.flatMap((o) => K.kb?.pairsFor(o.key, side) || []))].map((spec) => seasonal(spec.split('|'))).filter((a) => a.length && !have.has(a[0]) && K.items.has(a[0]));
    if (specs.length) parsed = { ...parsed, garments: specs.map(([key, ...alts], position) => ({ key, alts: alts.filter((a) => K.items.has(a)), color: null, material: null, text: key, position })), flags: { ...parsed.flags, pairedFromOwned: true } };
  }
  // نصيحة «الأبيض في الفرح» مالهاش علاقة بقميص أبيض عادي من غير مناسبة
  if (parsed.advice?.id === 'white_at_wedding' && (!/(فرح|خطوب|كتب كتاب|ضيف|ضيفه|عروس|عروسه|حفل|مناسب|wedding|engagement|guest)/.test(norm(text)) || (parsed.garments.length && !/(فستان|فساتين|dress|جيبه|عباي)/.test(norm(text))))) parsed = { ...parsed, advice: null, intent: parsed.garments.length ? 'shop' : 'unknown' };
  // «عندي انترفيو / مقابلة شغل… ألبس إيه؟»: نرشّح طقم للمناسبة (مع النصيحة كـ tip) بدل نصيحة عامة بس
  if (parsed.advice?.id === 'work_first_day' && parsed.context && !parsed.garments.length && /(^| )(البس|هلبس|نلبس|تلبس|لبس|انسب|اطلع|اروح|هروح)( |$)/.test(norm(text))) parsed = { ...parsed, intent: 'shop', flags: { ...parsed.flags, adviceTipId: 'work_first_day' }, advice: null };
  // «حذاء رسمي» لست: القاموس بيقصد أوكسفورد، فنضيف بدايل حريمي (كعب واطي/فلات/لوفر) لو مفيش حذاء رسمي حريمي
  { const pp0 = parsed.persons?.length ? parsed.persons : (session?.parsed?.persons || []);
    if (pp0.length && pp0.every((p) => p === 'women' || p === 'women_hijab' || p === 'girls') && parsed.garments?.some((g) => g.key === 'formal_shoes')) parsed = { ...parsed, garments: parsed.garments.map((g) => (g.key === 'formal_shoes' ? { ...g, alts: [...new Set([...(g.alts || []), 'heels_low', 'flats', 'loafers'])] } : g)) }; }
  // «الجو حر / برد»: نفترض خروجة عادية بموسم مناسب
  if (parsed.intent === 'unknown' && !parsed.garments.length && /(^| )(الجو|الدنيا|الطقس|النهارده الجو)( [^ ]+){0,2} (حر|حاره|حار|برد|بارد|سقعه|ساقع|شتا|صيف|مولع|بيغلي)( |$)/.test(norm(text))) {
    const hot = /(حر|حاره|حار|صيف|مولع|بيغلي)/.test(norm(text));
    parsed = { ...parsed, intent: 'shop', context: 'casual_outing', contextEffective: 'casual_outing', season: hot ? 'summer' : 'winter', flags: { ...parsed.flags, colorFlexible: true } };
  }
  if (/(^| )مدرس[هة]( |$)/.test(norm(text)) && (parsed.context === 'graduation' || parsed.context === 'university')) parsed = { ...parsed, context: null, contextEffective: null };
  if (/(^| )مدرس[هة]( |$)/.test(norm(text)) && !parsed.context && (parsed.persons.includes('boys') || parsed.persons.includes('girls') || /(ابني|بنتي|ولدي|اولادي|ولادي|بناتي|عيل|طفل)/.test(norm(text))) && !parsed.garments.length) parsed = { ...parsed, intent: 'shop', persons: parsed.persons.length ? parsed.persons : (/(بنتي|بناتي)/.test(norm(text)) ? ['girls'] : ['boys']), flags: { ...parsed.flags, colorFlexible: true } };
  // «عندي قميص أزرق نسقلي عليه / عاوز حاجة تمشي معاه»: قطعة معاه + طلب تنسيق = طلب شراء حول القطعة
  if (parsed.intent === 'unknown' && parsed.ownedPieces?.length && (!parsed.garments.length || parsed.flags?.pairedFromOwned) && /(نسق|طقم|لوك|عليه|عليها|عليهم|اكمل|يمشي|يليق|معاه|معاها|حاجه|اجيب|اشتري|ينفع|يتلبس)/.test(norm(text))) parsed = { ...parsed, intent: 'shop', fullLook: true };
  // «فرح صاحبي / خطوبة أختي / كتب كتاب ابن عمي»: المناسبة بتاعة حد تاني → ضيف، من غير ما نسأل «إنت ضيف ولا الفرح بتاعك؟»
  if (/(فرح|الفرح|لفرح|خطوب[هة]|لخطوب[هة]|كتب كتاب|كتب الكتاب) (صاحب|صاحبي|صاحبتي|صاحبه|صاحبت|اخت|اختي|اخويا|اخو|ابن|بنت|خال|خالي|خالتي|عم|عمي|عمتي|قريب|قريبتي|جار|جارتي|جاري|زميل|زميلتي|زميلي|واحد|واحده|ناس)/.test(norm(text)) && !parsed.flags?.roleAsked && parsed.role !== 'self') parsed = { ...parsed, role: 'guest', flags: { ...parsed.flags, roleAsked: true } };
  let lang = parsed.lang === 'en' ? 'en' : 'ar';
  // «جسمي تفاحة… إيه أنسب قصة فستان ليا؟ / أرداف عريضة ألبس بليزر قصير ولا طويل؟»: سؤال نصيحة عن الجسم حتى لو فيه اسم قطعة
  if (!(answers && Object.keys(answers).length) && parsed.garments.length && BODY_SELF_RE.test(norm(text)) && (/[؟?]/.test(String(text)) || /(^| )(انسب|احسن|ايه|ازاي|ولا|يليق|تليق|ينفع|انهي|يداري|يداريه|تداري|تداريه)( |$)/.test(` ${norm(text)} `))
    && !/(^| )(عايز|عايزه|عاوز|عاوزه|هاتلي|وريني|ورينى|محتاج|محتاجه)( |$)/.test(norm(text))) {
    const nt0 = norm(text); const selfHeight = /(انا (قصير|قصيره|طويل|طويله)|طولي)/.test(nt0);
    const adv0 = bodyAdvice(selfHeight ? nt0.replace(/(^| )ال(قصير|قصيره|طويل|طويله)(?= |$)/g, ' ') : nt0.replace(/(^| )(قصير|قصيره|طويل|طويله)(?= |$)/g, ' ')); // «بليزر قصير ولا طويل» وصف القطعة، مش طول المتكلم
    if (adv0) { const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName }); return { ...res0, say: `${adv0}`, intent: 'advice', session: { ...(session || {}), turn: (session?.turn || 0) + 1, pending: false, parsed: { ...(session?.parsed || parsed), genderHint: parsed.genderHint || session?.parsed?.genderHint || null } }, parsed }; }
  }
  // «نسقلي طقم على القطعة دي / على جاكيت X»: القطعة هي اللي معاه، والمطلوب باقي الطقم
  if (!(answers && Object.keys(answers).length) && parsed.garments.length && !parsed.ownedPieces?.length && /(نسق|نسقلي|اطقم|طقم|لوك|اطلاله|تنسيق)[^؟?]*?(علي|على|حوالين|مع|يليق|يلبس|تليق)|(علي|على|حوالين|مع) (القطع[هة]|الجاكيت|القميص|البنطلون|الفستان|البدل[هة]|الحذاء) (دي|ده|دا)/.test(norm(text)) && !/(عاوز|عايز|محتاج|هاتلي)\s+(?:\S+\s+){0,2}(?:جاكيت|قميص|بنطلون|فستان|بدل[هة]|حذاء|جزم[هة])\s*$/.test(norm(text))) {
    const nt0 = norm(text);
    const om = nt0.match(/(?:علي|على|حوالين|مع) (?:ال)?([^ ]+) (?:دي|ده|دا)(?: |$)/);
    const ownedKey = om ? matchTokens([om[1], `ال${om[1]}`], K).flatMap((x) => x.entries || []).find((e) => e.group === 'garment')?.key : null;
    const asked = ownedKey && /(^| )(عايز|عايزه|عاوز|عاوزه|محتاج|محتاجه|هاتلي|وريني|ورينى|ممكن)( |$)/.test(nt0) ? parsed.garments.filter((g) => g.key !== ownedKey) : [];
    if (asked.length) {
      // المطلوب قطعة معينة («طرحة / شنطة») تليق على قطعة معاه: القطعة اللي معاه مالكة، والمطلوب يفضل مطلوب. لمين؟ للمتكلم، مش لصاحب القطعة المملوكة
      const own = parsed.garments.filter((g) => g.key === ownedKey).map((g) => ({ key: g.key, color: g.color || null, material: g.material || null, text: g.text }));
      const spk = parsed.genderHint === 'female' ? ['women'] : parsed.genderHint === 'male' ? ['men'] : parsed.persons;
      parsed = { ...parsed, ownedPieces: own, garments: asked.map((g, position) => ({ ...g, position })), fullLook: false, persons: spk };
    } else parsed = { ...parsed, ownedPieces: parsed.garments.map((g) => ({ key: g.key, color: g.color || null, material: g.material || null, text: g.text })), garments: [], fullLook: true };
  }

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
  // بعد «لبنت صغيرة ولا لحضرتك؟»: رد بسن أو «ليا»
  if (session?.girlAsk && !(answers && Object.keys(answers).length)) {
    const nG = norm(text); const age = nG.match(/(\d{1,2})\s*(?:سنه|سنين|سنوات|شهور|شهر)/);
    const mine = /(^| )(ليا|لي|لنفسي|لحضرتي|لحضرتك|لنفسى|انا)( |$)/.test(nG) && !parsed.garments.length;
    if (age || mine) {
      const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      const base = { ...(session.parsed || parsed), intent: 'shop', garments: [], flags: { ...(session.parsed?.flags || {}) } };
      const sp = age ? { ...base, persons: ['girls'], ages: [Number(age[1])] } : { ...base, persons: ['women'] };
      return { ...res0, say: age ? `تمام، لبنت ${age[1]} ${Number(age[1]) <= 10 ? 'سنين' : 'سنة'}. عايزة قطعة إيه (فستان، ترنج، جزمة…) أو لأنهي مناسبة؟` : 'تمام، ليكي. عايزة قطعة إيه (فستان، قميص، جزمة…) أو لأنهي مناسبة؟', intent: 'chat', tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: sp, girlAsk: false, pending: false }, parsed };
    }
  }
  // كلمة شخص لوحدها («بنت»، «ولد»، «ست»، «راجل»، «واحدة»…): مش اسم محل ومش قطعة — بنسأل عايزة إيه
  if (!(answers && Object.keys(answers).length) && !session?.pending) {
    const bare = norm(text).replace(/^(?:انا|ده|دي|يعني|اه|لا|لـ)\s+/, '').replace(/[؟?!.،,]+/g, '').trim();
    const BARE = { women: /^(?:ست|ستات|سيدات|سيده|واحده|واحدة|انسه|مدام|حريمي|حريم|نسائي|woman|women|lady|ladies|female|femme|mujer|frau|damen)$/, men: /^(?:راجل|رجل|رجاله|رجال|شاب|شباب|واحد|رجالي|man|men|male|guy|homme|hombre|mann|herren)$/, boys: /^(?:ولد|ولاد|ولادي|واد|صبي|طفل|boy|boys|garcon|niño|nino|junge)$/, girls: /^(?:بنت|بنات|بناتي|بنوته|طفله|girl|girls|fille|niña|nina|mädchen)$/ };
    const who = Object.keys(BARE).find((k) => BARE[k].test(bare));
    if (who) {
      const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      const label = { women: 'للستات', men: 'للرجالة', boys: 'للولاد', girls: 'للبنات' }[who];
      const ask = who === 'girls' ? 'ده لبنت صغيرة ولا لحضرتك؟ وعايزة قطعة إيه (فستان، ترنج، جزمة…) أو لأنهي مناسبة؟' : `تمام، ${label}. عايز/عايزة قطعة إيه (قميص، فستان، ترنج، جزمة…) أو لأنهي مناسبة؟`;
      return { ...res, say: ask, intent: 'chat', tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: { ...parsed, intent: 'shop', persons: [who], garments: [], flags: { ...parsed.flags } }, girlAsk: who === 'girls', pending: false }, parsed };
    }
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
      const nameHit = m.store && [m.store.name_ar, m.store.name_en].some((n) => n && norm(text).includes(norm(n)));
      // كارت المحل مبيظهرش غير لو العميل سأل عن المحل (رقم/عنوان/لوكيشن…) أو قال كلمة «محل» أو كتب الاسم لوحده؛ اسم منتج مش بيفتح محل
      const nTxt = norm(text).replace(/^(?:محل|متجر|ستور|store|shop)\s+/, '').replace(/\s+(?:محل|متجر)$/, '').trim();
      const nameOnly = m.store && [m.store.name_ar, m.store.name_en].some((n) => n && norm(n) === nTxt);
      const storeCue = asks.length > 0 || aspects.some((x) => x !== 'all') || mentionsStoreWord(text) || nameOnly || (aspects.includes('all') && nameHit && !parsed.garments.length);
      if (m.store && storeCue && !(parsed.garments.length && !aspects.length) && !(parsed.garments.length && !nameHit)) {
        let live = [];
        try { live = (typeof offers === 'function' ? offers() : Array.isArray(offers) ? offers : []).filter((o) => o.store === m.store.name_ar); } catch { live = []; }
        const out = storeAnswer(m.store, aspects, { products, offers: live, now });
        return reply(out.say, { storeCard: out.card });
      }
      if (m.ambiguous.length && aspects.length) return reply(`تقصد أنهي محل: ${m.ambiguous.slice(0, 5).map((s) => s.name_ar).join(' ولا ')}؟`);
      const isStoreQuery = (asks.length > 0 || mentionsStoreWord(text)) && !parsed.garments.length;
      if (!m.store && isStoreQuery && asks.some((a) => a !== 'offers') && !/(^| )(لطفل|طفل|اطفال|رضيع|بنتي|ابني|ولد|بنت|ولادي|لبس|هدوم|ملابس|طقم|طلب|طلبي|اوردر|اوردري|شحنه|شحنتي)( |$)/.test(norm(text)) && !matchTrainedLesson(text, training?.lessons)) {
        if (asks.length === 1 && asks[0] === 'hours') {
          const h = allStoresHours(list, now);
          if (h) return reply(h);
          const ask = askWhichStore(list);
          if (ask) return reply(ask);
        }
        const STOP = new Set(['ابعتلي', 'ابعت', 'ابعتيلي', 'ابعتهولي', 'قولي', 'قوليلي', 'ورني', 'وريني', 'بنها', 'في', 'ف', 'اي', 'ايه', 'اللي', 'لو', 'سمحت', 'اللوكيشن', 'اللوكشن', 'محل', 'المحل', 'محلات', 'المحلات', 'متجر', 'المتجر', 'عايز', 'عاوز', 'عايزة', 'عاوزة', 'محتاج', 'محتاجة', 'فين', 'مكان', 'مكانها', 'مكانه', 'عنوان', 'عنوانه', 'عناوين', 'رقم', 'ارقام', 'نمرة', 'نمره', 'لوكيشن', 'موقع', 'موقعه', 'مواعيد', 'فروع', 'فرع', 'تليفون', 'واتس', 'واتساب', 'ازاي', 'اروح', 'اوصل', 'طريق', 'محل', 'المحل', 'محلات', 'المحلات', 'متجر', 'المتجر', 'ستور', 'الستور', 'store', 'shop', 'عندكم', 'عندكو', 'في', 'بنها', 'بتفتح', 'بيفتح', 'بتقفل', 'بيقفل', 'ساعات', 'امتي', 'امتى', 'فاتح', 'قافل', 'شغال', 'دلوقتي']);
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
    const live = ensureEnriched(products, K).filter((p) => p && p.inStock !== false && !p.typeConflict && !p.colorConflict && !p.sizeConflict && !p.audienceConflict && Number(p.photo_mismatch) !== 1);
    const diverse = (list, per = 2, max = 6) => { const cnt = new Map(); const out = []; for (const p of list) { const k = p.key || p.cat_text || 'x'; if ((cnt.get(k) || 0) >= per) continue; cnt.set(k, (cnt.get(k) || 0) + 1); out.push(p); if (out.length >= max) break; } return out; };
    const numTxt = (n.match(/(?:ارخص من|اقل من|اقل|تحت|لحد|بحد|بحد اقصي|في حدود|حوالي|ميزانيتي|ب)\s*(\d{2,6})/) || n.match(/(\d{2,6})\s*(?:جنيه|ج|egp)(?: او اقل| بس)?( |$)/) || [])[1];
    if (/(^| )(ماركات|ماركه|براند|براندات|brand|brands)( |$)/.test(n)) {
      let list = []; try { list = typeof stores === 'function' ? stores() : stores || []; } catch { list = []; }
      const names = (Array.isArray(list) ? list : []).map((x) => x.name_ar || x.name_en).filter(Boolean);
      if (names.length) return { state: 'chat', intent: 'faq', faq: 'brands', say: `الماركات على Twist هي المحلات نفسها (كل محل بيبيع ماركته). المحلات الموجودة دلوقتي: ${names.slice(0, 15).join('، ')}${names.length > 15 ? ' وغيرها' : ''}. قولّي اسم المحل وأوريك منتجاته، أو قولّي بتدور على إيه.`, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
    if ((/(الاكتر|اكتر|الاكثر|اكثر|اعلي)( \S+)?( \S+)? (مبيعا|مبيع|طلبا|بيعا|بتتباع|بيتباع|مطلوب|مطلوبه)|(^| )(trending|best seller|bestseller|الاشهر|اشهر|الاكتر مبيعا|الاكثر مبيعا)( |$)/.test(n) || (/(^| )ترند( |$)/.test(n) && !isGenericAsk(text)))) {
      const sold = live.filter((p) => Number(p.sold_count) > 0 && (!INTIMATE_KEYS.has(p.key) || explicitIntimate(text))) /* لانجيري/نوم مايتعرضوش في «الأكتر مبيعًا» من غير طلب */.sort((a, b) => Number(b.sold_count) - Number(a.sold_count));
      if (sold.length >= 2) return searchReply(diverse(sold), 'دي أكتر القطع اللي بتتباع على Twist:');
      const featured = live.filter((p) => Number(p.featured) > 0);
      const fall = diverse(featured.length ? featured : [...live].sort((a, b) => Number(b.id) - Number(a.id)));
      if (fall.length) return searchReply(fall, 'لسه مفيش مبيعات كفاية أحسب منها الأكتر طلبًا، فدي أحدث وأبرز القطع المتاحة:');
    }
    if (/(^| )(الجديد|جديد|احدث|اخر ما وصل|وصل حديثا|وصلنا|وصل جديد|new arrivals|new|كل المنتجات|كل حاجه عندكم|كل اللي عندكم|اتفرج|اتفرج علي|اشوف كل حاجه|اشوف كل المنتجات|ورينا كل حاجه)( |$)/.test(n) && n.split(' ').length <= 6) {
      const fresh = diverse([...live].sort((a, b) => Number(b.id) - Number(a.id)));
      if (fresh.length) return searchReply(fresh, 'دي أحدث القطع اللي اتضافت:');
    }
    // «عاوز اقل من 1000» بعد بحث تجميل/عناية: الميزانية بتتطبق على نفس البحث (مش على الكتالوج كله)
    if (numTxt && session?.lastSearch?.type === 'beauty' && session.lastSearch.turn === session.turn && BUDGET_WORDS.test(n) && n.split(' ').length <= 8) {
      const max = Number(numTxt); const bz2 = beautyMatch(session.lastSearch.text, ensureEnriched(products, K), { limit: 3, budget: max });
      const under2 = bz2?.hits || [];
      if (under2.length) return searchReply(under2, `${bz2.say.replace(/:\s*$/, '')} في حدود ${max} جنيه:`, session.lastSearch);
      const cheap2 = [...(bz2?.all || [])].sort((a, b) => a.price - b.price)[0];
      const r1 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang: parsed.lang === 'en' ? 'en' : 'ar', profile, assistantName });
      return { ...r1, say: `مفيش في الطلب ده حاجة بأقل من ${max} جنيه دلوقتي${cheap2 ? `. أرخص حاجة «${cheap2.name_ar || cheap2.name_en}» بـ ${Number(cheap2.price).toLocaleString('en-US')} جنيه` : ''}. تحبي أرفع الميزانية؟`, tips: [], styleTips: [], questions: [], blocks: null, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1, lastSearch: { ...session.lastSearch, turn: (session?.turn || 0) + 1 } }, parsed };
    }
    if (numTxt && !(session?.parsed?.context || session?.parsed?.garments?.length) && /(ارخص|اقل|تحت|لحد|بحد|حدود|ميزاني|جنيه|ج\b|بسعر|سعر)/.test(n) && n.split(' ').length <= 8) {
      const max = Number(numTxt);
      // «لبس لراجل/لبنتي… ميزانيتي X»: القائمة للجمهور المذكور بس (مش منديل جيب رجالي لبنت)
      const GEN = { men: ['men'], women: ['women'], women_hijab: ['women'], boys: ['boys', 'kids'], girls: ['girls', 'kids'], kids: ['boys', 'girls', 'kids'] };
      const wantG = new Set([...(parsed?.persons || []), ...(parsed?.kidsUnspecified ? ['kids'] : [])].flatMap((x) => GEN[x] || [])); const kidsOnly = wantG.size > 0 && [...wantG].every((g) => g === 'boys' || g === 'girls' || g === 'kids'); const gOk = (p) => !wantG.size || !p.gender || (p.gender === 'unisex' ? !kidsOnly : wantG.has(p.gender));
      let under = live.filter((p) => Number(p.price) > 0 && Number(p.price) <= max && gOk(p)).sort((a, b) => Number(a.price) - Number(b.price));
      // تفضيل القطع اللي جمهورها معروف وبيطابق (أو «عايزة» = حريمي كتفضيل مش شرط)؛ المجهولة بتفضل بس لو مفيش 3 قطع معروفة
      { const pref = wantG.size ? wantG : (parsed?.genderHint === 'female' ? new Set(['women', 'unisex']) : null);
        if (pref) { const known = under.filter((p) => p.gender && pref.has(p.gender) && !(kidsOnly && p.gender === 'unisex')); if (known.length >= 3) under = known; } }
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
  } else if (noAnswers && typeof brain !== 'function' && !parsed.garments.length && !/(^| )(كم|اكمام|بكم|قصير الكم)( |$)/.test(nOp) && !/(?:وزني|وزن|طولي|طول|weight|height) ?\d|\d ?(?:كيلو|كجم|سم|kg|cm)/.test(nOp) && /(عندي بطن|تداري البطن|يداري البطن|تداري بطني|انا طويل|انا طويله|طويله جدا|رفيع|رفيعه|مليان|مليانه|اتخن|يبلعني|تفاحه|اكتافي|اكتاف عريضه|كتافي|ارداف|اردافي|رقبتي|قمحاوي|قمحاويه|خمري|خمريه|تخين|تخينه|تخينة|نحيف|نحيفه|نحيفة|قصير|قصيره|قصيرة|طويل جدا|سمراء|سمرا|بشرتي|مثلث|كمثري|حامل|حمل|ممتلئ|وزني|كرش)/.test(nOp) && nOp.split(' ').length >= 2 && [null, 'unlisted_item'].includes(matchFaq(text))) {
    const advTxt = bodyAdvice(nOp);
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: advTxt || 'تمام، عشان أرشحلك اللي يناسبك صح قولي: اللبس لأنهي مناسبة، وطولك ووزنك (أو مقاسك)، والقطعة اللي عاوزها لو في حاجة معينة. وأنا أدورلك في المتاح عندنا.', intent: advTxt ? 'advice' : 'chat', /* نصيحة جسم/بشرة = advice مش دردشة */ session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  } else if (noAnswers && typeof brain !== 'function' && !parsed.garments.length && !parsed.context && matchFaq(text) !== 'size_between' && nOp.split(' ').length >= 3 && /(رايك|رايكم|تشوف|شايف|احسن ولا|افضل ولا|محتار|مش عارف اختار)/.test(nOp)) {
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: 'عشان أقولك رأيي صح محتاجة أعرف: اللبس لمين ولأنهي مناسبة؟ وقولي القطعتين اللي محتار بينهم وأقارنهملك وأجيبلك المتاح عندنا.', intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  } else if (noAnswers && typeof brain === 'function' && matchFaq(text) !== 'size_between' && nOp.split(' ').length >= 3 && /(رايك|رايكم|تشوف|شايف|شايفه|يليق|هيليق|هينفع|ينفع|تنفع|يمشي|مناسب لي|احسن ولا|افضل ولا|محتار|مش عارف اختار|اعمل ايه|اخد ايه|حلو ولا|تخين|تخينه|تخينة|نحيف|نحيفه|نحيفة|قصير|قصيره|قصيرة|طويل جدا|طويله|سمراء|سمرا|بشره|بشرتي|مثلث|كمثري|ساعه رمليه|كرش|بطن|حامل|حمل|ممتلئ|ممتلئه|مقاس كبير|وزني)/.test(nOp) && !/(رقم|لوكيشن|عنوان|فرع|توصيل|شحن|دفع|استرجاع|استبدال)/.test(nOp)) {
    let b = null;
    try { b = await brain({ messages, rows: ensureEnriched(products, K), assistantName: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], lang, userBudget: null, facts: { mode: 'opinion' }, text, kb: kbText() }); } catch { b = null; }
    if (b?.reply) {
      const slots = { ...parsed, intent: 'shop', persons: b.persons.length ? b.persons : parsed.persons, context: b.context || parsed.context, contextEffective: b.context || parsed.contextEffective, garments: b.garments.length ? b.garments.map((key, position) => ({ key, color: null, material: null, text: key, position })) : parsed.garments, colors: b.colors.length ? b.colors : parsed.colors, advice: null };
      const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res, say: b.reply, intent: 'brain', session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: slots, pending: false, opinionOffer: Boolean(slots.persons.length || slots.garments.length || slots.context) }, parsed };
    }
    { const advTxt = bodyAdvice(nOp); if (advTxt && !parsed.garments.length) { const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName }); return { ...res, say: advTxt, intent: 'advice', session: { ...(session || {}), turn: (session?.turn || 0) + 1, pending: false }, parsed }; } }
  }

  // ---------- أسئلة الخدمة أو قواعد التدريب المعتمدة ----------
  const giftToSomeone = /(^| )(هدي[هة]|هديه|هدايا|gift)( |$)/.test(norm(text)) && /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي|للاكس|لاكسي|للبت|الاكس|البت|اجيبلها|جيبلها|ليها)/.test(norm(text));
  // «حلو / عجبني / تمام خدته» بعد ما اتعرضلها قطع: رد قصير بدل «مش فاهمة»
  if (!(answers && Object.keys(answers).length) && !session?.pending && !session?.opinionOffer && !session?.altOffer && session?.parsed && (session.shown?.length || session.activeLook?.items?.length) && /^(حلو|حلوه|جميل|جميله|تحفه|عجبني|عجبتني|عجبني اوي|تمام خدته|خدته|هاخده|هاخدها|هاخدهم|هشتريه|هشتريها|ماشي هاخده|ممتاز|perfect|nice|great|love it|i love it|زي الفل|يجنن)( [^ ]+){0,2}$/.test(nOp)) {
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: 'حلو! لو عجبتك القطعة افتحها وضيفها للسلة. ولو عايز أكمّلك الطقم بقطعة تانية (جزمة، جاكيت، شنطة، إكسسوار) قولي.', intent: 'chat', tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  }
  // «ينفع احمر مع بيج؟»: توافق ألوان (نظرية عامة)
  if (!(answers && Object.keys(answers).length) && /(^| )(ينفع|يمشي|تمشي|تنفع|حلو|شيك|يلبق|بيمشي|بتمشي|هل|مناسب|ينفعوا|يمشوا)( |$)/.test(nOp) && / (مع|و) /.test(` ${nOp} `)) {
    const cols = [...new Set([...(parsed.colors || []), ...(parsed.garments || []).map((g) => g.color).filter(Boolean)])];
    if (cols.length === 2 && !/(عايز|عاوز|عايزه|عاوزه|محتاج|محتاجه|هاتلي|وريني)/.test(nOp)) {
      const say = colorComboAnswer(cols[0], cols[1], (c) => String(K.colors.get(c)?.ar || c).split(' ')[0]);
      if (say) { const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName }); return { ...res0, say: `${say} تحب أرشحلك قطع بالألوان دي من المتاح؟`, intent: 'chat', tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed }; }
    }
  }
  const isReturnRequest = (/(^|\s)(a8ayar|a8ayaro|a8ayarha|aghayar|abadel|abadlo|abadelha|araga3|arga3|arag3o|estbdal|estebdal|esterga3|estrga3)(?=\s|$|[?!.,])/i.test(String(text)) || /(^| )(ارجع|ارجعه|ارجعها|ارجاع|استرجع|استرجاع|ابدل|ابدله|ابدلها|استبدل|استبدله|استبدلها|استبدال)( |$)/.test(norm(text))) && !/(ارجع (تاني|اشتري|البس|الابس|اجيب|اطلب|اشوف|اكمل|اتفرج)|ابدل (لون|اللون) (الطقم|اللوك))/.test(norm(text)); // «عايز أرجع ألبس بدل» = أرجع لعادة، مش استرجاع // «عايزة أرجع الفستان» = استرجاع حتى لو فيه اسم قطعة
  // «عايزة أرجع الفستان / أبدل القميص بمقاس أصغر»: طلب استرجاع/استبدال حتى لو فيه اسم قطعة → إجابة الاسترجاع مش ترشيح منتجات
  // سؤال معلومة عن مقاس/طول/كرمشة حتى لو ذكر قطعة («طول الفستان لحد فين»، «مقاس البيجامة بيطلع واسع؟»): إجابة مش ترشيح
  if (['size_runs', 'length_q', 'size_between', 'wrinkle'].includes(matchFaq(text)) && !(answers && Object.keys(answers).length) && !session?.pending) {
    const sf = matchFaq(text);
    return { state: 'chat', intent: 'faq', faq: sf, say: faqAnswer(sf, { lang, name: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], contact }), tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
  }
  // «بتوصلوا لحد الشغل في القاهرة؟»: سؤال توصيل/تتبع حتى لو فيه كلمة مناسبة
  if (!parsed.garments.length && parsed.context && ['shipping_where', 'shipping_time', 'shipping_cost', 'order_track'].includes(matchFaq(text)) && !(answers && Object.keys(answers).length)) {
    const sf = matchFaq(text);
    return { state: 'chat', intent: 'faq', faq: sf, say: faqAnswer(sf, { lang, name: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], contact }), tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
  }
  // «طلبت جاكيت من أسبوع ولسه موصلش»: متابعة طلب حتى لو فيه اسم قطعة
  if (parsed.garments.length && matchFaq(text) === 'order_track' && /(^| )(طلبت|طلبنا|طلبته|طلبتها|اوردري|طلبي|الاوردر|الطلب)( |$)/.test(norm(text)) && /(^| )(موصلش|ماوصلش|موصلتش|ماوصلتش|موصلوش|اتاخر|اتأخر|فين|لسه)( |$)/.test(norm(text)) && !(answers && Object.keys(answers).length)) {
    return { state: 'chat', intent: 'faq', faq: 'order_track', say: faqAnswer('order_track', { lang, name: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], contact }), tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
  }
  // «في خصم على الجواكت؟»: سؤال خصومات حتى لو فيه اسم قطعة
  if (!isReturnRequest && parsed.garments.length && matchFaq(text) === 'discounts' && /[؟?]|(^| )(في|فيه|عندكم|هل)( |$)/.test(` ${norm(text)} `) && !(answers && Object.keys(answers).length)) {
    return { state: 'chat', intent: 'faq', faq: 'discounts', say: faqAnswer('discounts', { lang, name: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], contact }), tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
  }
  // جوه محادثة تسوق شغالة «ابدله بمقاس أكبر» ممكن تبقى تبديل في الترشيح، فبنعتبرها استرجاع بس لو مفيش طلب شغال أو الكلام عن حاجة اشتراها/وصلته
  const postPurchase = /(^| )(وصلني|وصلتني|وصل|وصلت|جالي|جاني|استلمت|استلمته|استلمتها|اشتريت|اشتريته|اشتريتها|طلع|طلعت|الاوردر|الطلب|اللي جه|اللي جالي)( |$)/.test(norm(text));
  if (isReturnRequest && parsed.garments.length && (!session?.parsed?.garments?.length || postPurchase) && !(answers && Object.keys(answers).length) && !session?.pending) {
    const rf = ['refund_money', 'wrong_item', 'size_change_after'].includes(matchFaq(text)) ? matchFaq(text) : 'returns';
    return { state: 'chat', intent: 'faq', faq: rf, say: faqAnswer(rf, { lang, name: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], contact }), tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
  }
  // أسئلة خدمة عن منتج (تفاصيل/مقارنة/طلب وسلة/رأي بعد الشراء): رد صادق بدل ما نبدأ بحث جديد عن نفس القطعة
  let purchaseNote = '';
  if (!(answers && Object.keys(answers).length)) {
    const sv = serviceReply({ text, parsed, session, products, lang });
    if (sv && sv.appendToShop) purchaseNote = sv.say;
    else if (sv) return { state: 'chat', intent: 'faq', faq: sv.faq, say: sv.say, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
  }
  const isQuestionOrInquiry = /(^| )(الفرق بين|الفرق ما بين|ايه الفرق|فرق بين|ايه خامه|ايه خامة|ايه هي خامه|مقاسات الاطفال|مقاسات اطفال|الدفع عند الاستلام|جبتلي حاجه غلط|اجرب الاول|يعني ايه|ايه معنى|ايه معني|معنى|معني|ما هو|ما هي|ما الفرق|ايه الفرق|الفرق بين|الفرق مابين|لو حد سال|لو حد سأل|رشحي اولا|رشحي اول|احسن محل|احسن محلات|افضل محل|افضل محلات|فين الاقي|ازاي|كيف|طريقه|اعمل ايه|البس ايه|اختار ايه|تنصحيني|نصيحه|نصايح|قاعده|ينفع البس|ينفع ارجع|ينفع استبدل|لو المقاس|لو التيشرت|لو البنطلون|لو الهدوم|لو الطلب|علاج|حل لمشكله|طقم ل|طقم فرح|طقم جامعه|طقم انترفيو|يركب علي|يركب على|يركبوا|يمشوا مع بعض|يمشي مع|يليقوا مع بعض|يليق علي|يليق على|لايقين|تداري الكرش|يداري الكرش|تداري البطن|تخسسني|تنحفني|تبين طولي|تطولني|يطولني|متحررش|تطري علي الجسم|تطري على الجسم|متكتمش|تدفيني|سقعه|سقعة|برد الشتا|برد الشتاء|بتكش|بيكش|بيبهت|بتبهت|بيوبر|بتوبر|سيكا|للشقا|تستحمل بهدله|تستحمل بهدلة|تستحمل كرف|صيف وشتا|صيف وشتاء|ولا|احسن|افضل|يتلبس عليه|يتلبس معاه|يتلبس مع|يتلبس علي|يتلبس على|تتلبس عليها|تتلبس معاه|تتلبس مع|تتلبس علي|تتلبس على|البس عليه|البس معاه|مفتوح ولا مقفول|القوالب|قوالب|لحد الدور|نفس اسعار|نفس سعر|طويل ورفيع|مسلوع|قصير ومليان|افتح الشحنه|افتح الشحنة|افتح الاوردر|افتح الطلب|وزني|طولي|الموديل لابس|الموديل لابسه|الموديل لابسة|بتمط|ليكرا|استريتش|ناشفه وقافشه|ناشفة وقافشة|علي الطبيعه|على الطبيعة|زي الصوره|زي الصورة|فلاتر|كود الخصم|كوبون الخصم|مش شغال|بروموكود|احجز|احجزلي|حجز|اول الشهر|هتيجي تاني|هتوفر تاني|خلصت|فيزا مع المندوب|عيب صناعه|عيب صناعة|خياطه مقطوعه|خياطة مقطوعة|14 يوم|اربعتاشر يوم|ممنوع استرجاع|بياناتي|رقم تليفوني|خصوصيه|خصوصية|اهل العروسه|أهل العروسة|قعدة تعارف|عزاء|مأتم|امتحان شفوي|مناقشة تخرج|فاتح ولا غامق|اكسفورد|أكسفورد|مبيشفش|مبيشف|بيشف|غسيل البمب|الجواكت البمب|اشيل الوبر|شيل الوبر|مكنة الوبر|شوز قماش|كانفاس|كونفرس|فانس|كفر الجزار|بطا|دملو|جمجرة|ورورة|استلم في الشغل|استلم في الكلية|حد ادنى|حد أدنى|المندوب اتأخر|اتاخر|بينزل امتى|بيخلص امتى|ترانزيشنال|طرحه جوكر|طرحة جوكر|طرحه شيفون|طرحة شيفون|دريس كت|فستان كت|طرحه منقوشه|طرحة منقوشة|طرحه مشجره|طرحة مشجرة|عرض الكرافته|عرض الكرافتة|زرار البدله|زرار البدلة|منديل الجيب|منديل البدله|منديل البدلة|شراب مخفي|سوسته معلقه|سوستة معلقة|ريحه الكمكمه|ريحة الكمكمة|اصفرار الياقه|اصفرار الياقة|اوبن اير|فرح في جنينه|فرح في جنينة|بعد الساعه 5|بعد الساعة 5|منتج مختلف)( |$)/.test(norm(text));
  const SERVICE_FAQ = new Set(['price_final', 'discounts', 'support', 'goodbye', 'returns', 'refund_money', 'order_track', 'order_change', 'complaint_contact', 'insult', 'identity', 'about_me', 'about_ai', 'payment', 'payment_options', 'cod', 'shipping_cost', 'shipping_time', 'shipping_where', 'contact_phone', 'contact_all', 'contact_address', 'contact_hours', 'how_order', 'wrong_item', 'authenticity', 'size_change_after', 'merchant_login_help', 'seller_join', 'nearest_store']);
  if (!giftToSomeone && !(answers && Object.keys(answers).length) && (!session?.pending || SERVICE_FAQ.has(matchFaq(text))) && (!parsed.garments.length || isQuestionOrInquiry) && (!parsed.context || isQuestionOrInquiry) && !(parsed.followup && session?.parsed)) {
    const trained = matchTrainedLesson(text, training?.lessons);
    if (trained) {
      return { state: 'chat', intent: 'faq', faq: 'training', say: trained.answer, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed: { ...parsed, advice: null } };
    }
    if ((!parsed.garments.length || matchFaq(text) === 'fabric' || String(matchFaq(text)).startsWith('gloss_')) && !(matchFaq(text) === 'size_other' && session?.parsed?.garments?.length) && !(matchFaq(text) === 'sizes_available' && session?.parsed?.garments?.length && !/[؟?]|(^| )(عندكم|موجود|فيه|متاح|متوفر)( |$)/.test(norm(text)) && /^(?:(?:عايز|عايزه|عاوز|عاوزه|خليه|خليها|هات|هاته|هاتها|هاتهولي)\s+)?(?:ال)?مقاس\s+(?:xxs|xs|s|m|l|xl|xxl|xxxl|3xl|[3-5][0-9]|اكس لارج|اكس اكس لارج|دبل اكس لارج|دبل اكس|اكسل)$/i.test(norm(text).trim())) && !(matchFaq(text) === 'budget_only' && session?.parsed && (session.parsed.garments?.length || session.parsed.context))) {
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
  // ---------- بوابة سؤال المعلومة العامة (مش طلب شراء) ----------
  // أي سؤال معلومة («القطن بيتكرمش؟»، «ازاي اغسل الصوف»، «ايه الفرق بين…») مايتحوّلش لبحث منتجات و«ملقتش…».
  // الترتيب: نصيحة من قاعدة المعرفة (مطابقة موزونة) ← العقل لو متاح ← رد صادق. اللي فيه قطعة بس إشارة ضعيفة (؟ أو «احسن») بيكمّل ترشيح عادي.
  if (!(answers && Object.keys(answers).length) && !session?.pending && !giftToSomeone && !matchFaq(text) && isInfoQuestion(text)) {
    const strong = STRONG_INFO.test(` ${norm(text)} `);
    if (strong || (!parsed.garments.length && !parsed.context)) {
      const reply = (say, extra = {}) => ({ state: 'chat', intent: 'advice', say, tips: [], styleTips: [], questions: [], blocks: null, ...extra, session: { ...(session || {}), turn: (session?.turn || 0) + 1, pending: false }, parsed: { ...parsed, advice: null } });
      const hit = searchAdvice(text, K) || (parsed.advice ? adviceByPhrase(text, K, parsed.advice.id) : null);
      if (hit?.answer_ar) return reply(hit.answer_ar, { adviceId: hit.id });
      if (!hit) {
        if (typeof brain === 'function') {
          let b = null;
          try { b = await brain({ messages, rows: ensureEnriched(products, K), assistantName: typeof assistantName === 'string' ? assistantName : assistantName?.[lang], lang, userBudget: null, facts: { mode: 'knowledge' }, text, kb: kbText() }); } catch { b = null; }
          if (b?.reply) return { ...reply(b.reply), intent: 'brain' };
        }
        if (strong) return reply(HONEST_FALLBACK, { adviceId: 'honest_fallback' });
      }
    }
  }

  // ---------- فهم الموديل أولاً (اختياري): Gemini/Claude يحوّل الرسالة لبيانات، والكود بيتحقق، والقواعد تكمّل ----------
  if (typeof understand === 'function' && !(answers && Object.keys(answers).length) && !session?.pending && parsed.intent === 'shop' && text.trim().length >= 8 && !rulesConfident(parsed, text)) {
    try {
      const u = await understand({ text, parsed, session });
      if (u) {
        const rulesP = parsed;
        parsed = applyUnderstanding(parsed, u);
        // الموديل مايقررش نوع المنتج في طلب عام («حاجة حلوة للسهرة»): لو القواعد مالقيتش نوع، نفضل من غير نوع ونسأل
        if (!rulesP.garments.length && isGenericAsk(text)) parsed = { ...parsed, garments: rulesP.garments };
        // لانجيري/نوم/روب/داخلي: بطلب صريح في كلام العميل بس، مش بتخمين الموديل
        if (!explicitIntimate(text)) parsed = { ...parsed, garments: parsed.garments.filter((g) => !INTIMATE_KEYS.has(g.key)) };
        if (rulesP.context === 'evening_out') parsed = { ...parsed, context: rulesP.context, contextEffective: rulesP.contextEffective };
        parsed = { ...parsed, style: rulesP.style || [] };
      }
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
  // ================= نوع المنتج ≠ المناسبة ≠ الستايل =================
  // الأنواع اللي العميل رفضها («مش عايزة لانجيري» / «لا مش فستان») بتتشال لحد ما يطلبها تاني صراحة
  let excludedTypes = Array.isArray(session?.excludedTypes) ? [...session.excludedTypes] : [];
  { const rej = rejectedFamilies(text);
    const wantNow = (parsed.garments || []).map((g) => familyOfKey(g.key)).filter((f) => !rej.includes(f));
    if (rej.length) parsed = { ...parsed, garments: parsed.garments.filter((g) => !rej.includes(familyOfKey(g.key))) };
    excludedTypes = [...new Set([...excludedTypes.filter((f) => !wantNow.includes(f) && !(/(رجعني|رجعيني|نرجع|ارجع|خلينا)/.test(norm(text)) && /فستان|الفستان/.test(norm(text)) && f === 'dress')), ...rej])].slice(-8); }
  const ptRows = () => ensureEnriched(products, K);
  const audOf = (p) => { const ps = (p?.persons || []).map((a) => (a === 'women_hijab' ? 'women' : a));
    if (ps.length === 1 && (ps[0] === 'women' || ps[0] === 'men')) return ps[0];
    if (!ps.length && p?.genderHint === 'female') return 'women';
    if (!ps.length && p?.genderHint === 'male') return 'men';
    return null; };
  // قطعة العميل الشخصية قد تكون واضحة ("معايا هاف بوت") لكن لا نخمّن صاحبها من نوع القطعة.
  // اسأل عن الجمهور قبل التخطيط؛ وإلا ينتهي الطلب برسالة "مفيش نتيجة" بدل سؤال واحد مفيد.
  if (!hasAnswers && !session?.pending && parsed.ownedPieces?.length && !parsed.persons?.length
    && /(نسق|طقم|لوك|باقي|اكمل|يليق|تمشي|يمشي|معاه|معاها|اجيب|اشتري)/.test(norm(text))) {
    const q = clarify('تمام، القطعة دي ليك ولا ليها؟ عشان أنسّق باقي الطقم صح.', 'who_is_it_for', 'الطقم لمين؟', [
      { label: 'رجالي', value: 'men' }, { label: 'حريمي', value: 'women' },
    ]);
    return { ...q, session: { ...q.session, parsed } };
  }
  const WOMEN_TYPES = new Set(['dress_any', 'two_piece_set', 'jumpsuit', 'blouse', 'skirt', 'abaya', 'lingerie']);
  const MEN_TYPES = new Set(['suit', 'shirt', 'blazer']);
  // يكمّل نوع المنتج اللي العميل اختاره على المناسبة والستايل والجمهور والمقاس اللي اتقالوا قبل كده (من غير ما نسأل تاني)
  const carryIntent = (cur, sp, garments) => {
    const g = garments || cur.garments;
    const ps = cur.persons?.length && !(cur.flags?.personFromSpeaker && sp.persons?.length && !sp.flags?.personFromSpeaker) ? cur.persons : sp.persons?.length ? sp.persons
      : g.some((x) => WOMEN_TYPES.has(x.key) || /^dress_/.test(x.key)) ? ['women'] : g.some((x) => MEN_TYPES.has(x.key)) ? ['men'] : [];
    return { ...sp, ...cur, intent: 'shop', followup: null, advice: null, garments: g, persons: ps,
      context: (!cur.flags?.ctxFromStyle && cur.context) || sp.context || null, contextEffective: (!cur.flags?.ctxFromStyle && cur.contextEffective) || sp.contextEffective || null,
      style: [...new Set([...(sp.style || []), ...(cur.style || [])])], colors: cur.colors?.length ? cur.colors : sp.colors || [],
      budget: cur.budget || sp.budget || null, genderHint: cur.genderHint || sp.genderHint || null,
      flags: { ...(sp.flags || {}), ...(cur.flags || {}), ...(sp.flags?.size && !cur.flags?.size ? { size: sp.flags.size } : {}), productTypeAnswered: true, ctxFromStyle: cur.context && !cur.flags?.ctxFromStyle ? false : Boolean(sp.flags?.ctxFromStyle && !(cur.context && !cur.flags?.ctxFromStyle)) } };
  };
  const typeGarments = (value, aud, cur) => {
    const col = cur.colors?.[0] || null;
    const mk = (key, i = 0) => ({ key, color: i === 0 ? col : null, material: null, text: key, position: i });
    if (value === 'smart_casual') return aud === 'men' ? [mk('shirt'), mk('trousers', 1)] : [mk('blouse'), mk('trousers', 1)];
    if (value === 'tshirt' || value === 'shirt' || value === 'suit' || value === 'blazer' || value === 'trousers' || K.items.has(value)) return [mk(value)];
    return [];
  };
  const spPT = session?.parsed || null;
  if (hasAnswers && answers.product_type != null && spPT) {
    const v = String(answers.product_type);
    const g = typeGarments(v, audOf(spPT), parsed);
    if (g.length) { parsed = carryIntent({ ...parsed, garments: [] }, spPT, g); if (v === 'smart_casual') parsed.style = [...new Set([...(parsed.style || []), 'casual', 'elegant'])]; }
  } else if (!hasAnswers && session?.pendingQuestion === 'product_type' && session?.pending && spPT) {
    if (parsed.garments.length) parsed = carryIntent(parsed, spPT);
    else if (SMART_CASUAL_RE.test(` ${norm(text)} `) || ((parsed.style || []).includes('casual') && norm(text).split(' ').length <= 4)) {
      parsed = carryIntent({ ...parsed, garments: [] }, spPT, typeGarments('smart_casual', audOf(spPT), parsed));
      parsed.style = [...new Set([...(parsed.style || []), 'casual', 'elegant'])];
    } else if (/^(?:و|ف)?(?:ال)?(طقم|اطقم|طقم قطعتين)$/.test(norm(text).trim())) parsed = carryIntent({ ...parsed, garments: [] }, spPT, typeGarments('two_piece_set', audOf(spPT), parsed));
  }
  // «طقم كاجوال / طقم شيك» لست (من غير مناسبة فرح/خطوبة): طقم قطعتين = نوع منتج، مش لوك كامل
  if (!hasAnswers && !parsed.garments.length && /(^| )(?:ال)?(طقم|اطقم)( |$)/.test(` ${norm(text)} `) && !/(طقم كامل|لوك)/.test(norm(text))
    && (audOf(parsed) === 'women' || (!audOf(parsed) && audOf(spPT || {}) === 'women'))
    && ((parsed.style || []).length || (spPT?.garments?.length && /(^| )(لا|لأ|مش)( |$)/.test(norm(text))))
    && !/^(engagement_|wedding_|katb_kitab|graduation|eid|condolence)/.test(parsed.context || '')) {
    if (parsed.flags?.ctxFromStyle) parsed = { ...parsed, context: null, contextEffective: null };
    parsed = spPT?.garments?.length && !(parsed.style || []).length ? carryIntent({ ...parsed, garments: [] }, spPT, typeGarments('two_piece_set', 'women', parsed)) : { ...parsed, intent: 'shop', garments: typeGarments('two_piece_set', 'women', parsed), persons: parsed.persons?.length ? parsed.persons : ['women'] };
  }
  // تصحيح النوع وسط طلب شغال («لا مش فستان، عايزة لانجيري» / «لا مش ده، عايزة طقم»): النوع بس بيتغير، والمناسبة/الستايل/المقاس يفضلوا
  if (!hasAnswers && spPT && parsed.garments.length && !parsed.flags?.productTypeAnswered && !parsed.context
    && (rejectedFamilies(text).length || /^(?:لا|لأ|لاء)?[،, ]*(?:مش (?:ده|دي|دا|كده)|مش عايز|مش عايزه|مش عاوز|مش عاوزه)/.test(norm(text).trim()))) {
    parsed = carryIntent(parsed, spPT);
  }
  // «عايزة حاجة تحت البليزر / جوه الجاكيت»: قطعة بتتلبس تحت القطعة دي، مش القطعة نفسها
  { const um = norm(text).match(/(?:^| )(?:تحت|جوه|جوا|مع)\s+(?:ال)?(بليزر|جاكيت|جاكت|كارديجان|بالطو|عبايه|البليزر|الجاكيت)(?: |$)/);
    if (!hasAnswers && um && /(^| )(تحت|جوه|جوا)( |$)/.test(norm(text)) && parsed.garments.every((g) => ['blazer', 'jacket', 'cardigan', 'coat', 'abaya', 'long_cardigan'].includes(g.key))) {
      const outer = parsed.garments[0]?.key || 'blazer';
      const aud = audOf(parsed) || audOf(spPT || {}) || 'women';
      const tops = aud === 'men' ? ['shirt', 'tshirt'] : ['blouse', 'top'];
      parsed = { ...parsed, intent: 'shop', persons: parsed.persons?.length ? parsed.persons : [aud], garments: tops.slice(0, 1).map((key, i) => ({ key, color: parsed.colors?.[0] || null, material: null, text: key, position: i })), ownedPieces: [...(parsed.ownedPieces || []), { key: outer, color: null }], flags: { ...parsed.flags, underLayer: outer } };
    } }
  // «هات معاه حاجة تانية / حاجة تمشي معاه»: قطعة مكمّلة للي اتعرض، مش نفس النوع تاني
  if (!hasAnswers && spPT?.garments?.length && !parsed.garments.length && lookItems.length
    && /(^| )(?:هات|هاتي|هاتلي|ضيف|ضيفي|ضيفلي|وهات|عايز|عايزه|عاوز|عاوزه|ورني|وريني)? ?(?:معاه|معاها|عليه|عليها) (?:حاجه|حاجات|قطعه)(?: تانيه| كمان| تليق| تمشي)?( |$)|(^| )(?:حاجه|قطعه) (?:تليق|تمشي|تتلبس) (?:معاه|معاها|عليه|عليها)( |$)/.test(` ${norm(text)} `)) {
    const cur = spPT.garments[0].key; const fam = familyOfKey(cur);
    const aud = audOf(spPT) || 'women';
    const COMP = aud === 'men' ? { suit: ['formal_shoes', 'tie'], top: ['trousers', 'sneakers'], bottoms: ['shirt', 'sneakers'], blazer: ['shirt', 'trousers'] } : { dress: ['heels_high', 'handbag'], jumpsuit: ['heels_high', 'handbag'], set: ['heels_low', 'handbag'], top: ['trousers', 'skirt'], bottoms: ['blouse', 'flats'], skirt: ['blouse', 'heels_low'], abaya: ['tarha', 'flats'], lingerie: ['robe'] };
    const keys = (COMP[fam] || (aud === 'men' ? ['formal_shoes'] : ['handbag'])).filter((k) => K.items.has(k));
    parsed = { ...spPT, intent: 'shop', followup: null, advice: null, garments: keys.slice(0, 1).map((key, i) => ({ key, color: null, material: null, text: key, position: i })), ownedPieces: [...(spPT.ownedPieces || []), { key: cur, color: spPT.garments[0].color || null }], flags: { ...(spPT.flags || {}), complementOf: cur, colorFlexible: true } };
  }
  // طلب عام من غير نوع («حاجة حلوة للسهرة» / «حاجة شيك» / «حاجة محتشمة للسهرة»): نسأل عن النوع بدل ما نخمّن (ولا نرشح لانجيري لوحدنا)
  { const ctxQ = parsed.context; const styles = parsed.style || [];
    const ASKABLE = new Set(['evening_out', 'casual_outing', 'work_casual', 'work_formal', 'university', 'travel', 'date_night', 'home', 'family_gathering']);
    const kidsAsk = parsed.kidsUnspecified || (parsed.persons || []).some((a) => a === 'boys' || a === 'girls');
    if (!hasAnswers && !parsed.garments.length && !parsed.ownedPieces?.length && !parsed.flags?.gift && !parsed.flags?.productTypeAnswered && !kidsAsk
      && ['shop', 'unknown', 'advice', 'followup'].includes(parsed.intent) && (isGenericAsk(text) || (isOutfitAsk(text) && !ctxQ && styles.length)) && !matchFaq(text)
      && (ctxQ === 'evening_out' || (styles.length && (!ctxQ || ASKABLE.has(ctxQ)) && !(ctxQ && /(^| )(لبس|اللبس|هدوم|الهدوم|اطلاله|لوك|outfit)( |$)/.test(norm(text)))))) {
      const aud = audOf(parsed);
      const choices = productTypeChoices({ aud, context: ctxQ, styles, rows: ptRows(), excluded: excludedTypes });
      if (choices.length >= 2) {
        const askedIds = [...new Set([...(session?.askedIds || []), 'product_type'])].slice(-12);
        const keep = { ...parsed, intent: 'shop', advice: null, followup: null, garments: [] };
        return { state: 'clarify', intent: 'shop', say: productTypeQuestion(choices, aud), tips: [], styleTips: [], blocks: null, missing: [], ask: ['product_type'],
          questions: [{ id: 'product_type', text: aud === 'men' ? 'تحب نوع إيه؟' : 'تحبي نوع إيه؟', type: 'single', options: choices }],
          session: { ...(session || {}), turn: (session?.turn || 0) + 1, pending: true, pendingQuestion: 'product_type', askedIds, excludedTypes, parsed: { ...keep, ...speakerCarry(keep, session) } }, parsed: keep };
      }
    } }
  // شبشب/جلوجز أو ترنج لوحده: بيتلبس مع حاجات كتير، فنسأل مع إيه من غير اختيارات (العميل بيكتب بنفسه)
  if (!hasAnswers && !parsed.garments.length && !parsed.context && parsed.persons.length && parsed.ownedPieces?.length && !parsed.flags?.wearWithAsked && !session?.pending && (parsed.ownedPieces.every((o) => o.key === 'slippers') || parsed.ownedPieces.every((o) => o.key === 'tracksuit'))) {
    const what = parsed.ownedPieces[0].key === 'tracksuit' ? 'الترنج' : 'الشبشب';
    parsed = { ...parsed, flags: { ...parsed.flags, wearWithAsked: true } };
    return { ...clarify(`${what} بيتلبس مع حاجات كتير. هتلبسيه مع إيه؟ اكتبيلي وأنا أدورلك عليه في المحلات.`, 'wear_with', '', []), questions: [], ask: [] };
  }
  // «لعيالي / لاولادي / لرضيع»: نسأل ولد ولا بنت بدل ما نخمن
  if (!hasAnswers && !session?.pending && parsed.kidsUnspecified && !parsed.persons.length) {
    const baby = parsed.flags?.baby;
    return clarify(baby ? 'تمام! ولد ولا بنت؟ وعنده كام شهر أو سنة؟' : 'تمام! ولد ولا بنت ولا الاتنين؟', 'who_is_it_for', baby ? 'ولد ولا بنت؟' : 'اللبس لمين من الأطفال؟', [{ label: 'ولد', value: 'boys' }, { label: 'بنت', value: 'girls' }, { label: 'ولد وبنت', value: 'kids' }]);
  }
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
        parsed = { ...parsed, intent: 'shop', avoidColors: [], colors: [], garments: pr.garments.map((g) => ({ ...g, color: g.color || col })), persons: parsed.persons };      } else if (!pr.garments?.length && col && session?.parsed?.garments?.length && /^(ال)?لون/.test(rest)) {
        parsed = { ...session.parsed, intent: 'shop', followup: null, avoidColors: [], colors: [], garments: session.parsed.garments.map((g, i) => (i === 0 ? { ...g, color: col } : g)) };
      }
    } }
  // ---- «رجعني للفستان / نرجع للبنطلون / خلينا في الجيبة»: رجوع لقطعة اتكلمنا عنها قبل كده بكل تفاصيلها (مش «حاجة للفستان»)
  let returnTurn = false;
  if (!hasAnswers && session?.parsed) {
    const nt = norm(text);
    const rm = nt.match(/(?:^| )(?:رجعني|رجعيني|رجعنا|نرجع|ارجع|ارجعي|خلينا|خليني|نكمل|كملي|كمل)(?: تاني)? (?:لل|ل|على|علي|في|بال|ب|ع)?(?:ال)?([^ ]{2,})/);
    if (rm) {
      const k = (() => { for (const w of [rm[1], `ال${rm[1]}`, rm[1].replace(/^ل/, '')]) { const m = matchTokens([w], K).flatMap((x) => x.entries || []).find((e) => e.group === 'garment'); if (m) return m.key; } return null; })();
      const fam = (key) => (/^dress/.test(key) ? 'dress' : K.items.get(key)?.family || key);
      if (k) {
        const pool = [...(session.parsed.garments || []), ...[...(session.garmentHistory || [])].reverse()];
        const hit = pool.find((g) => g?.key === k) || pool.find((g) => g?.key && fam(g.key) === fam(k));
        if (hit) { parsed = { ...session.parsed, intent: 'shop', followup: null, garments: [{ ...hit }], ownedPieces: [], fullLook: false, flags: { ...(session.parsed.flags || {}), swapId: undefined, anchorId: undefined } }; returnTurn = true; }
      }
    }
    // «خريفي متوسط» / «شتوي»: موسم لوحده في نص الطلب = تفصيلة لنفس القطعة
    if (!returnTurn && !parsed.garments.length && parsed.season && session.parsed.garments?.length && !parsed.context && !parsed.persons?.length && nt.split(' ').length <= 4) {
      parsed = { ...session.parsed, intent: 'shop', followup: null, season: parsed.season, garments: session.parsed.garments.map((g) => ({ ...g })) };
      returnTurn = true;
    }
    // «عندك حاجة شبهه / زيها؟» (و«أنا محجبة / أرخص» معاها): نفس القطعة اللي بنتكلم عليها، مع أي قيد جديد
    if (!returnTurn && !parsed.garments.length && session.parsed.garments?.length && /(^| )(شبهه|شبهها|شبههم|زيه|زيها|زيهم|زي ده|زي دي|زي دا|من نوعه|من نوعها|نفس الموديل|نفس الستايل|نفس القصه)( |$|[؟?])/.test(` ${nt} `)) {
      parsed = { ...session.parsed, ...Object.fromEntries(Object.entries({ persons: parsed.persons?.length ? parsed.persons : null, budget: parsed.budget || null, context: parsed.context || null, contextEffective: parsed.context ? parsed.contextEffective : null, style: parsed.style?.length ? [...new Set([...(session.parsed.style || []), ...parsed.style])] : null }).filter(([, v]) => v)), intent: 'shop', followup: parsed.followup || null, garments: session.parsed.garments.map((g) => ({ ...g })), flags: { ...(session.parsed.flags || {}), ...(parsed.flags || {}) } };
      returnTurn = true;
    }
    // «حاجة في النص، زي الجينز كده» / «لون قريب من الكحلي»: تشبيه، مش طلب قطعة تانية → نفضل على نفس القطعة
    if (!returnTurn && session.parsed.garments?.length && parsed.garments.length && !/(^| )(عايز|عايزه|عاوز|عاوزه|وريني|ورينى|هاتلي|هات|محتاج|محتاجه|ضيف|وكمان)( |$)/.test(nt)) {
      const cm = nt.match(/(?:^| )(?:زي|زى|شبه|قريب من|نفس لون)(?: ال| )?([^ ]+)/);
      if (cm) {
        const ck = matchTokens([cm[1], `ال${cm[1]}`], K).flatMap((x) => x.entries || []).find((e) => e.group === 'garment')?.key;
        const cur = session.parsed.garments.map((g) => g.key);
        if (ck && !cur.includes(ck)) {
          const rest = parsed.garments.filter((g) => g.key !== ck);
          if (!rest.length) { parsed = { ...session.parsed, intent: 'shop', followup: null, garments: session.parsed.garments.map((g, i) => (i === 0 && ck === 'jeans' && !parsed.colors?.length ? { ...g, color: K.colors.has('blue') ? 'blue' : g.color } : g)) }; returnTurn = true; }
        }
      }
    }
  }
  let anchor = returnTurn ? null : (pickedItem ? { item: pickedItem, keyRe: famRe(pickedItem) } : (!hasAnswers ? resolveAnchor(text, session) : null));
  let audFilter = null;
  if (answers?.which_person) {
    const w = String(answers.which_person);
    if (w === 'men') audFilter = new Set(['men', 'boys']); else if (w === 'women') audFilter = new Set(['women', 'women_hijab', 'girls']);
    const auds = [...new Set(lookItems.map((x) => x.aud).filter((x) => x && (!audFilter || audFilter.has(x))))];
    if (auds.length) parsed = { ...parsed, intent: 'shop', persons: auds };
  }
  if (/(مش|غير|من غير|بدون)\s*(محجب|حجاب|طرحه)/.test(norm(text))) parsed = { ...parsed, persons: (parsed.persons || []).map((a) => (a === 'women_hijab' ? 'women' : a)), flags: { ...parsed.flags, notHijab: true, hijabAsked: true } }; // «مش محجبة» مش «محجبة»
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
    /* «لي ولمراتي» / «لمراتي ولي» / «ليه ولي»: الاتنين مذكورين بحرف عطف مباشر = الاتنين مع بعض، مش واحد منهم (إضافة: بتتخطى الاختزال بس) */
    const ME_W = '(?:ليا|لنفسي|لي)'; const OTH_W = '(?:ليها|لها|ليه|له|لخطيبتي|لمراتي|لحبيبتي|لزوجتي|لصاحبتي|لخطيبي|لجوزي|لحبيبي|لزوجي|لصاحبي)';
    const conjoined = new RegExp('(?:^|\\s)' + ME_W + '\\s+و?' + OTH_W + '(?=\\s|$)|(?:^|\\s)' + OTH_W + '\\s+و?' + ME_W + '(?=\\s|$)').test(nt);
    if (conjoined) { /* نسيب الاتنين */ }
    else if (toMe && !toHer && !toHim) parsed = { ...parsed, persons: [speaker], flags: { ...parsed.flags, soloFromCouple: speaker } };
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
  let refinementTurn = false;
  // «هاخد الاتنين / الاتنين حلوين»: اللونين اللي اتعرضوا على نفس القطعة
  if (!hasAnswers && session?.parsed?.garments?.length === 1 && session.parsed.flags?.colorHistory?.key === session.parsed.garments[0].key && session.parsed.flags.colorHistory.colors?.length && /(^| )(الاتنين|الاثنين|التنين|الاتنين دول|هما الاتنين|اللونين|الالوان الاتنين)( |$)/.test(norm(text)) && !parsed.garments.length) {
    const cur = session.parsed.garments[0];
    parsed = { ...mergeFromSession(parsed, session.parsed), intent: 'shop', followup: null };
    parsed.colors = [...new Set([...session.parsed.flags.colorHistory.colors, cur.color].filter(Boolean))];
  }
  // «تمام هات الجاكيت مقاس L» بعد سؤال جانبي: نفس القطعة اتذكرت تاني → نكمل بنفس مواصفاتها (لون/خامة/موسم…) مش طلب جديد من الصفر
  if (!hasAnswers && session?.parsed?.garments?.length && parsed.garments.length && parsed.intent === 'shop'
    && parsed.garments.every((g) => session.parsed.garments.some((p) => p.key === g.key))
    && !/(^| )(تاني|تانيه|غير|غيره|غيرها|جديد|جديده|خالص|بلاش|مش عاجبني)( |$)/.test(norm(text).replace(/(^| )(ال[^ ]+) (تاني|تانيه)(?= |$)/g, '$1$2'))) { // «وريني القميص تاني» = نفس القميص تاني؛ «قميص تاني» = قميص غيره
    const prevBy = new Map(session.parsed.garments.map((p) => [p.key, p]));
    parsed = { ...parsed, garments: parsed.garments.map((g) => ({ ...g, color: g.color || prevBy.get(g.key)?.color || null, material: g.material || prevBy.get(g.key)?.material || null })) };
    for (const k of ['season', 'context', 'contextEffective', 'budget', 'daypart']) if ((parsed[k] === null || parsed[k] === undefined) && session.parsed[k] != null) parsed[k] = session.parsed[k];
    if (!parsed.persons?.length && session.parsed.persons?.length) parsed.persons = session.parsed.persons;
    if (!parsed.flags?.size && session.parsed.flags?.size) parsed.flags = { ...parsed.flags, size: session.parsed.flags.size }; // المقاس كمان ميضيعش
  }
  // «ماكسي/ميدي/سواريه/سهره» لوحدها وسط طلب شغال = تفصيلة للقطعة اللي بنتكلم عنها، مش طلب قطعة جديدة
  if (!hasAnswers && session?.parsed?.garments?.length && parsed.garments.length && parsed.garments.every((g) => AMBIG_BARE_GARMENT.has(String(g.text || '').replace(/^(?:وال|بال|لل|ال|و|ل|ب)(?=.{3,})/, '')))) parsed = { ...parsed, garments: [] };
  // تفصيلة قصيرة (طول/كم/سوستة/نقشة/خامة/قصّة) على طلب شغال: نكمل نفس الطلب بدل «مش فاهمة» (المحرك لسه مش بيفلتر بالتفاصيل دي، فبنقول كده)
  const samePeople = !parsed.persons.length || parsed.persons.every((a) => (session?.parsed?.persons || []).includes(a) || (a === 'women' && (session?.parsed?.persons || []).includes('women_hijab')));
  if (!hasAnswers && session?.parsed?.garments?.length && !parsed.garments.length && !parsed.context && samePeople && !parsed.ownedPieces?.length
    && (parsed.intent === 'unknown' || parsed.intent === 'shop' || parsed.intent === 'followup') && norm(text).split(' ').filter(Boolean).length <= 10
    && (REFINE_RE.test(` ${norm(text)} `) || parsed.flags?.looseMaterials?.length) && !matchFaq(text)) {
    parsed = { ...mergeFromSession(parsed, session.parsed), intent: 'shop', followup: null };
    const lm = parsed.flags?.looseMaterials;
    if (lm?.length === 1 && parsed.garments?.length === 1) parsed.garments = [{ ...parsed.garments[0], material: lm[0] }];
    refinementTurn = true;
  }
  const isContinuation = !returnTurn && !parsed.flags?.complementOf && isContinuationRequest(text, session) || Boolean(anchor && parsed.flags?.anchorId) || Boolean(audFilter && session?.parsed?.garments?.length);
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
  if (session?.pendingQuestion === 'budget' && /مش فارق|مش فارقة|براحتك|من غير ميزانية|مفيش ميزانية|اي حاجة|أي حاجة|اي حاجه|أي حاجه|اي ميزانية|أي ميزانية|اي سعر|أي سعر|مفتوحة|مفتوحه|مش مهم|any budget|any price|flexible/i.test(parsed.normalized || '')) {
    parsed.budget = { value: null, kind: 'total' };
    parsed.flags = { ...parsed.flags, budgetFlexible: true };
  }
  // رد قصير على «اللبس ده لمين؟»: «ست / بنت / ليا / for me» (كلمات بتتفهم غلط برا السؤال فبنقراها هنا بس)
  if (['audience', 'who_is_it_for'].includes(session?.pendingQuestion) && !(parsed.persons || []).length) {
    const ntw = (parsed.normalized || norm(text)).trim();
    if (/^(ست|ستات|ستي|بنت|بنوته|ليا|ليّا|ليه|لنفسي|مدام|for her|for me|woman|lady|ladies)$/.test(ntw)) parsed = { ...parsed, persons: ['women'] };
    else if (/^(رجل|راجل|ولد|شاب|ليّ|him|for him|man|guy)$/.test(ntw)) parsed = { ...parsed, persons: ['men'] };
  }
  // «فاتحة / باستيل»: تفضيل ألوان فاتحة بيتحوّل لألوان فعلية بدل ما يتجاهل (والتفضيل بيكمّل مع الجلسة)
  { const nt = parsed.normalized || norm(text); const LIGHT = ['white', 'cream', 'off_white', 'beige', 'pink', 'blush', 'sky_blue', 'lavender', 'mint', 'champagne'].filter((c) => K.colors.has(c));
    if (LIGHT.length && /(^| )(فاتح|فاتحه|فاتحة|باستيل|ألوان فاتحة|الوان فاتحه)( |$)/.test(nt) && !/بشرت|لون بشرتي/.test(nt) && !(parsed.colors || []).length) parsed = { ...parsed, colors: LIGHT, flags: { ...parsed.flags, lightTone: true, colorFlexible: true } }; }
  if (session?.pendingQuestion === 'color_preference' && /أي لون|اي لون|مش فارق|مش فارقة|سيبها علي|اختاري|any color|no preference/i.test(parsed.normalized || '')) {
    parsed.flags = { ...parsed.flags, colorFlexible: true };
  }
  { // مقاس مكتوب في الكلام: "مقاس L" / "سايز 42" / أو رد لوحده على سؤال المقاس
    const t = String(parsed.normalized || text || '');
    const WORDS = { 'اكس لارج': 'XL', 'اكس اكس لارج': 'XXL', لارج: 'L', ميديم: 'M', سمول: 'S', وسط: 'M' };
    const SZ_RE = /(?:مقاسي|مقاسى|مقاس|سايزي|سايز|size)\s*(?:هو |ال)?(xxxxl|xxxl|5xl|4xl|3xl|2xl|xxl|xxs|xl|xs|s|m|l|\d{2})(?![a-z0-9])/i;
    // النص الخام الأول: norm بيختصر الحروف المكررة («XXXL» → «xl»)
    const rawT = String(text || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    let sz = (rawT.match(SZ_RE) || t.match(SZ_RE) || [])[1];
    if (!sz && session?.pendingQuestion === 'size_needed') {
      sz = (t.trim().match(/^(xxxl|5xl|4xl|3xl|2xl|xxl|xxs|xl|xs|s|m|l|\d{2})$/i) || [])[1];
      if (!sz) for (const [w, v] of Object.entries(WORDS)) if (t.includes(w)) { sz = v; break; }
    }
    if (!sz && parsed.garments.length) { const m = String(text).match(/(?:^|\s)(5XL|4XL|3XL|2XL|XXXL|XXL|XL|XXS|XS|L|M|S)(?=\s|$|[؟?!.،,])/); if (m) sz = m[1]; } // «sweatshirt ramady XL»: مقاس لاتيني كابيتال جنب قطعة
    if (!sz) { const m = t.match(/(?:مقاسي|مقاسى|مقاس|سايزي|سايز|size)\s*(?:هو )?(اكس اكس لارج|دبل اكس لارج|دبل اكس|اكس لارج|اكسل)/); if (m) sz = { 'اكس اكس لارج': 'XXL', 'دبل اكس لارج': 'XXL', 'دبل اكس': 'XXL', 'اكس لارج': 'XL', اكسل: 'XL' }[m[1]]; }
    if (!sz) { const m = t.match(/(?:مقاسي|مقاسى|مقاس|سايزي|سايز|size)\s*(?:هو )?(كبير جدا|كبير|لارج|صغير|سمول|وسط|ميديم)/); if (m) sz = { 'كبير جدا': 'XL', كبير: 'L', لارج: 'L', صغير: 'S', سمول: 'S', وسط: 'M', ميديم: 'M' }[m[1]]; }
    if (!sz && session?.parsed?.garments?.length && !parsed.garments.length) {
      const m2 = t.trim().match(/^(?:مقاسي |انا )?(?:(?:لارج|ميديم|سمول|اكس لارج|اكس اكس لارج)|(?:xxl|xl|xs|s|m|l|3xl))$/i);
      if (m2) { const w2 = m2[0].replace(/^(?:مقاسي |انا )/, '').trim(); sz = WORDS[w2] || w2; }
    }
    if (!sz && !hasAnswers && session?.parsed?.garments?.length && /(?:مقاس|سايز) (اكبر|اصغر)/.test(t)) {
      const SZL = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']; const cur = String(session.parsed.flags?.size || 'M').toUpperCase(); const ci = SZL.indexOf(cur);
      sz = SZL[Math.max(0, Math.min(SZL.length - 1, (ci < 0 ? 2 : ci) + (/اكبر/.test(t) ? 1 : -1)))];
    }
    if (sz) sz = ({ '2XL': 'XXL', '3XL': 'XXXL', XXXXL: '4XL' })[String(sz).toUpperCase()] || sz; // صيغة واحدة للمقاس
    if (sz) {
      parsed.flags = { ...parsed.flags, size: String(sz).toUpperCase() };
      const prev = session?.parsed;
      if (!hasAnswers && !parsed.garments.length && (prev?.garments?.length || prev?.context)) parsed = { ...prev, intent: 'shop', followup: null, flags: { ...(prev.flags || {}), size: String(sz).toUpperCase() } };
    }
  }
  // وزن/طول → مقاس تقريبي («وزني 85»، «طولي 180 ووزني 90»، «85 كيلو»)، و«مش متأكد/مش عارف مقاسي»
  let sizeNote = '';
  if (!hasAnswers) {
    const nt = norm(text);
    const wM = nt.match(/(?:وزني|وزن|weight|wazny)\s*(?:حوالي|تقريبا|يجي)?\s*(\d{2,3})/) || nt.match(/(\d{2,3})\s*(?:كيلو|كجم|كغ|kg|كيلوجرام)/);
    const hM = nt.match(/(?:طولي|طول|height|toly)\s*(?:حوالي|تقريبا)?\s*(\d{3})/) || nt.match(/(\d{3})\s*(?:سم|cm|سنتي)/);
    if (wM || hM) {
      const w = wM ? Number(wM[1]) : null; const h = hM ? Number(hM[1]) : null;
      const pp = (parsed.persons?.length ? parsed.persons : session?.parsed?.persons) || [];
      const gh = parsed.genderHint || session?.parsed?.genderHint || null;
      const female = pp.length ? (pp.some((p) => String(p).startsWith('women') || p === 'girls') && !pp.includes('men')) : gh === 'female';
      const SZ = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
      let idx = null;
      if (w) {
        const cuts = female ? [48, 56, 66, 76, 88, 100] : [55, 65, 77, 90, 103, 115];
        idx = cuts.findIndex((c) => w < c); if (idx < 0) idx = cuts.length;
        if (h) { if (h >= (female ? 175 : 188)) idx += 1; else if (h <= (female ? 155 : 165)) idx -= 1; }
        idx = Math.max(0, Math.min(SZ.length - 1, idx));
      } else if (h) idx = Math.max(0, Math.min(SZ.length - 1, female ? (h < 155 ? 1 : h < 165 ? 2 : h < 175 ? 3 : 4) : (h < 165 ? 2 : h < 175 ? 3 : h < 185 ? 4 : 5)));
      if (idx != null && w) {
        const sz = SZ[idx];
        parsed.flags = { ...parsed.flags, size: sz };
        sizeNote = `بوزنك${h ? ' وطولك' : ''} غالبًا مقاسك ${sz} (تقدير تقريبي، وبراجع المقاسات المتاحة فعلًا). `;
        const prev = session?.parsed;
        if (!parsed.garments.length && (prev?.garments?.length || prev?.context)) parsed = { ...prev, intent: 'shop', followup: null, flags: { ...(prev.flags || {}), size: sz } };
        else if (!parsed.garments.length && !parsed.context) {
          const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
          return { ...res, say: `${sizeNote}قولي بقى عاوز إيه بالظبط (قميص، بنطلون، فستان، جزمة…) وأدورلك عليه.`, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: { ...parsed, intent: 'shop', flags: { ...parsed.flags, size: sz } }, pending: false }, parsed };
        }
      } else if (h && !w) {
        const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
        return { ...res, say: 'تمام، وزنك كام تقريبًا؟ بالطول والوزن أقدر أقولك المقاس الأنسب.', intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1, pendingQuestion: 'size_needed' }, parsed };
      }
    } else if (/^(?:لا )?(?:مش (?:متاكد|متاكده|عارف|عارفه|فاكر|فاكره)|معرفش|ماعرفش|مش عارف مقاسي|معرفش مقاسي|مش متاكد من المقاس|مش عارفه مقاسي|not sure|i don't know|idk|dont know)(?: مقاسي| المقاس| مقاس)?$/.test(nt) && (session?.pendingQuestion === 'size_needed' || session?.parsed?.garments?.length)) {
      const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res, say: 'ولا يهمك! قولي طولك ووزنك تقريبًا (مثلًا: طولي 175 ووزني 80) وأحددلك المقاس الأنسب.', intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1, pendingQuestion: 'size_needed' }, parsed };
    }
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
  let excludeIds = parsed.flags?.complementOf && !hasAnswers ? [...(session?.shown || [])] : []; const prevTotal = session?.lastTotal; // القطعة المكمّلة: مانكررش اللي اتعرض
  // «ارخص»: بنجرّب سقف أقل مؤقتًا، لكنه مش ميزانية العميل: مايتحفظش في الجلسة ومايتقالش له «ميزانيتك».
  let derivedBudget = false;
  { // «عليها» = السيدة بس، «عليه» = الراجل بس (في طقم الاتنين)
    const pa = isContinuation ? (audFilter || pronounAuds(text)) : null;
    if (pa) {
      const auds = [...new Set((session?.activeLook?.items || []).map((x) => x.aud).filter((x) => x && pa.has(x)))];
      if (auds.length) parsed = { ...parsed, persons: auds };
    }
  }
  if (!hasAnswers && session?.parsed && (session.parsed.garments?.length || session.parsed.context) && !parsed.garments.length && /^(اغلي|اغلى|الاغلي|الاغلى|افخم|الافخم|اعلي|اعلى|احسن|احسن واحد|اغلي حاجه|اغلى حاجه|اغلي شويه|اغلى شويه)$/.test(nOp)) {
    parsed = { ...session.parsed, intent: 'shop', followup: null, budget: null, flags: { ...(session.parsed.flags || {}), priciest: true, cheapest: undefined, budgetFlexible: true } };
  }
  if (parsed.followup === 'cheaper' && prevTotal) { parsed.budget = { value: Math.max(100, Math.round((session.lastBudgetUsed || prevTotal) * 0.8 / 50) * 50), kind: 'total' }; derivedBudget = true; }
  if (opts.forceOther) parsed = { ...parsed, flags: { ...(parsed.flags || {}), showOther: true } };
  if (parsed.followup === 'show_more' || parsed.flags?.showOther) excludeIds = session?.shown || [];
  if (parsed.flags?.swapId) excludeIds = [...excludeIds, parsed.flags.swapId];
  // «عايز بدلة كبيرة / للكبار / دي أطفالي»: اللي اتعرض كان مقاس عيال → نستبعده ونحوّل أي «ولاد/بنات» لكبار
  if (!hasAnswers && session?.shown?.length && /(^| )(كبير|كبيره|للكبار|كبار|مش اطفال|مش اطفالي|مش اطفالى|اطفالي|اطفالى|للعيال|لعيل|بتاع عيال|بتاعه عيال|بتاعت عيال|دي لطفل|ده لطفل|مش لطفل|انا مش طفل|مش عيل)( |$)/.test(` ${norm(text)} `) && !/(^| )(لابني|لبنتي|ابني|بنتي|لاولادي|لولادي|للولاد|للبنات)( |$)/.test(norm(text))) {
    const grown = (ps) => [...new Set((ps || []).map((p) => (p === 'boys' ? 'men' : p === 'girls' ? 'women' : p)).filter((p) => p !== 'kids'))];
    const base = parsed.garments.length ? parsed : { ...(session.parsed || {}), ...parsed, garments: session.parsed?.garments || [], intent: 'shop' };
    const ps = grown(base.persons?.length ? base.persons : session.parsed?.persons);
    parsed = { ...base, intent: 'shop', persons: ps.length ? ps : (parsed.genderHint === 'female' ? ['women'] : ['men']), flags: { ...(base.flags || {}), adultsOnly: true } };
    excludeIds = [...new Set([...excludeIds, ...(session.shown || [])])];
  }

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
  { const mm = !hasAnswers && !session?.parsed?.garments?.length ? norm(text).match(/^(?:انا )?(?:(?:مقاسي|مقاس|مقاسى) ?)?(xxs|xs|s|m|l|xl|xxl|xxxl|[0-9]{2}|لارج|ميديم|سمول|اكس لارج|اكس اكس لارج)$/i) : null;
    if (mm) {
      const sz = ({ 'لارج': 'L', 'ميديم': 'M', 'سمول': 'S', 'اكس لارج': 'XL', 'اكس اكس لارج': 'XXL' })[mm[1]] || mm[1].toUpperCase();
      const res = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res, say: `تمام، مقاسك ${sz}. عاوز أدورلك على إيه بالظبط؟ (قميص، بنطلون، فستان، جزمة…)`, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1, parsed: { ...parsed, intent: 'shop', flags: { ...parsed.flags, size: sz } }, pending: false }, parsed };
    } }
  // موسم من غير قطعة ولا مناسبة («لبس شتوي»): نفترض خروجة عادية وبنسأل لمين لو مش معروف
  if (!hasAnswers && !parsed.garments.length && !parsed.context && /(^| )(شتوي|شتويه|صيفي|صيفيه|للشتا|للصيف|الشتا|الصيف)( |$)/.test(norm(text)) && norm(text).split(' ').length <= 5) {
    parsed = { ...parsed, intent: 'shop', context: 'casual_outing', contextEffective: 'casual_outing', flags: { ...parsed.flags, colorFlexible: true } };
  }
  // هدية من غير ما يقول لمين: نسأل بدل ما نقول «مفهمتش»
  const GIFT_W = /(^| )(هدي[هة]|هديه|هدايا|gift)( |$)/;
  if (!hasAnswers && !session?.pending && GIFT_W.test(norm(text)) && !parsed.garments.length && !/(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي|لولد|لبنت|لطفل|للبت|لاكسي|للاكس|للواد|لزميلي|لزميلتي|لصحبي|لصحبتي|لعمتي|لخالتي|لعمي|لخالي|لجدتي|لجدي|لحماتي|لحفيدي|لابن|لعيالي|لاولادي|لحبيبي|لصحبتي|للراجل|للست|للاكس|لاكسي|للبت|الاكس|البت|اجيبلها|جيبلها|ليها|لاخت |لام |لمرات |لحمايا|لاخو |لابو |لجوز | لها$| لها | ليه$| ليه )/.test(norm(text))) {
    parsed = { ...parsed, intent: 'shop', persons: [], flags: { ...parsed.flags, gift: true } };
    return clarify('تمام، الهدية لمين؟', 'gift_for', 'الهدية لمين؟', [{ label: 'ست (مراتي / خطيبتي / أمي / أختي)', value: 'women' }, { label: 'راجل (جوزي / أبويا / أخويا)', value: 'men' }, { label: 'طفل', value: 'kids' }]);
  }
  if (hasAnswers && answers.gift_for) {
    const rcp = answers.gift_for === 'women' ? 'women' : answers.gift_for === 'men' ? 'men' : null;
    if (rcp) parsed = { ...parsed, intent: 'shop', persons: [rcp], garments: (rcp === 'women' ? ['handbag', 'perfume', 'tarha'] : ['watch', 'perfume', 'belt']).map((key, position) => ({ key, color: null, material: null, text: key, position })), flags: { ...parsed.flags, gift: true, colorFlexible: true, budgetFlexible: true } };
    else parsed = { ...parsed, intent: 'shop', persons: ['boys', 'girls'], garments: ['tshirt', 'dress_casual', 'sneakers'].map((key, position) => ({ key, color: null, material: null, text: key, position })), flags: { ...parsed.flags, gift: true, colorFlexible: true, budgetFlexible: true } };
  }
  // هدية: المستلم هو اللي بنختار له، مش العميل نفسه
  if (!hasAnswers && (parsed.intent === 'shop' || parsed.intent === 'advice' || parsed.intent === 'unknown') && !parsed.garments.length && /(^| )(هدي[هة]|هديه|هدايا|gift)( |$)/.test(norm(text)) && /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي|للاكس|لاكسي|للبت|الاكس|البت|اجيبلها|جيبلها|ليها|لاخت |لام |لمرات |لحماتي|لحمايا|لاخو |لابو |لجوز | لها$| لها | ليه$)/.test(norm(text))) {
    const toHer = /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي|لزوجتي|لوالدتي|لها|حريمي|لاخت |لام |لمرات |لحماتي|للاكس|لاكسي|للبت|الاكس|البت|اجيبلها|جيبلها|ليها)/.test(norm(text)) || /(لمراتي|لخطيبتي|لحبيبتي|لامي|لماما|لاختي|لبنتي|لصاحبتي)/.test(String(text));
    const toHim = / ليه$|(لحمايا|لاخو |لابو |لجوز |لجوزي|لخطيبي|لحبيبي|لابويا|لبابا|لاخويا|لابني|لصاحبي|لزوجي|لوالدي)/.test(norm(text));
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
    const ok0 = parsed.ownedPieces[0].key;
    if (ok0 === 'slippers' || ok0 === 'tracksuit') { // الشبشب والترنج بيتلبسوا مع حاجات كتير: نسأل «مع إيه؟» من غير اختيارات
      const what = ok0 === 'tracksuit' ? 'الترنج' : 'الشبشب';
      return { ...res0, say: `${what} بيتلبس مع حاجات كتير. هتلبسه مع إيه؟ اكتبلي وأنا أدورلك عليه في المحلات.`, intent: 'chat', session: { ...(session || {}) } };
    }
    return { ...res0, say: 'حلو القطعة دي! تحب أنسقلك معاها إيه؟ قميص ولا جاكيت ولا جزمة ولا إكسسوار؟ أو قولي رايح فين وأرشحلك طقم كامل.', intent: 'chat', session: { ...(session || {}) } };
  }
  // «بدلة/لبس رقص»: مش بدلة رسمي — لو في منتج بالاسم ده نعرضه، وإلا نقول مفيش بدل ما نعرض بدلة رجالي
  if (!hasAnswers && !session?.pending && /(^| )(رقص|رقصه|راقصه|dance|raks)( |$)/.test(norm(text)) && !parsed.ownedPieces?.length) {
    const hits = keywordSearch(text, ensureEnriched(products, K), { limit: 6 });
    if (hits.length) return searchReply(hits);
    const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
    return { ...res0, say: 'مش لاقية لبس رقص مخصوص في المحلات دلوقتي. لو تقصدي فستان أو طقم سهرة لفرح أو حفلة قوليلي لمين وأرشحلك من المتاح.', intent: 'chat', tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  }
  // بحث بالكلمات في المنتجات الحقيقية: لأي حاجة برا قاموس اللبس (مكياج، نظارات، بيجامات…)
  if (!hasAnswers && !session?.pending && (parsed.intent === 'unknown' || (parsed.intent === 'shop' && !parsed.ownedPieces?.length && !parsed.garments.length && !parsed.context && !parsed.persons.length)) && text.trim().length >= 3) {
    const hits = keywordSearch(text, ensureEnriched(products, K), { limit: 6 });
    if (hits.length) return searchReply(hits);
    if (parsed.intent === 'unknown' && typeof llmExtract !== 'function' && !/(^| )(حاجه|حاجات|حلوه|حلو|شيك|لقطه|حاجه حلوه|عندي|انا|ممكن|ليه|ازاي|فين|امتي|امتى|اقتراح|شكوي|شكوى|سؤال|للمحل|المحل|عندكم|عندك)( |$)/.test(` ${norm(text)} `) && text.trim().split(/\s+/).length <= 3 && /^[\u0600-\u06FFa-zA-Z ]+$/.test(text.trim()) && !session?.parsed && !/^(ايه|ايوه|ايوا|اه|لا|تمام|طب|طيب|هو|هي|بس|كمل|كمان|تاني|وبعدين|ممكن|ازاي|ليه|مين|فين|امتي|انتي|انت|انا|خلاص|ماشي|اوكي|يعني|هاتلي|ورينا|ورني|مش|ده|دي|دا|كده|كدا|حلو|وحش|غبي|غبيه|سيئ|سيء|مدير|خدمه)( |$)/.test(norm(text).trim()) && !/(غبي|غبيه|وحش|سيئ|سيء|بتفهمي|بتفهم|مدير|شكوي|شكوى)/.test(norm(text))) {
      const res0 = respond({ state: 'chat', intent: 'unknown' }, { seed, lang, profile, assistantName });
      return { ...res0, say: `ملقتش «${text.trim()}» في المحلات دلوقتي. جرّب اسم تاني للقطعة، أو قولي المناسبة ولمين وأرشحلك من المتاح.`, intent: 'chat', session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
    }
  }
  // طلب مبهم («حاجة شيك»): قبل ما نسأل سؤال جاهز، الموديل يحاول يفهم؛ لو فهم نكمّل بحث في المنتجات
  const vague = !wasUnknown && !hasAnswers && !session?.pending && parsed.intent === 'shop' && !parsed.garments.length && !parsed.context && !parsed.ownedPieces?.length && text.trim().length >= 3;
  if ((wasUnknown || vague) && !altRequest && typeof brain === 'function') {
    const b = await callBrain();
    if (b) {
      const slots = { persons: b.persons.length ? b.persons : parsed.persons, context: b.context || parsed.context, garments: b.garments.filter((key) => !INTIMATE_KEYS.has(key) || explicitIntimate(text)).length ? b.garments.filter((key) => !INTIMATE_KEYS.has(key) || explicitIntimate(text)).map((key) => ({ key, color: null, material: null, text: key, position: 0 })) : parsed.garments };
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
  const adv = weatherMock ? weatherAdvice(weatherMock, eventTime) : { ...weatherAdvice({ temp_c: seasonTemp(now, parsed.season), approximate: true }, eventTime), fabrics_ar: [], notes: [], seasonOnly: true };

  // ---------- تخطيط ----------
  let rows = ensureEnriched(products, K);
  const pinnedItems = isContinuation ? resolvePinnedItems(text, session, parsed.garments, rows, anchor && parsed.flags?.anchorId ? anchor : null, audFilter) : [];
  let plan = planOutfit(parsed, excludeIds.length ? rows.filter((p) => !excludeIds.includes(p.id)) : rows, { adv, eventTime, profile, K, pinnedItems });
  const OPTIONAL_ASKS = new Set(['budget', 'modest_preference', 'women_style', 'color_preference', 'engagement_role']);
  const askedBefore = new Set(session?.askedIds || []);
  const dropAsked = (p) => (p?.ask?.length ? { ...p, ask: p.ask.filter((id) => !(OPTIONAL_ASKS.has(id) && askedBefore.has(id))) } : p);
  plan = dropAsked(plan);
  if (excludeIds.length && plan.state === 'none' && !parsed.flags?.swapId) plan = dropAsked(planOutfit(parsed, rows, { adv, eventTime, profile, K, pinnedItems }));
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
  const needsClarificationFirst = plan.state === 'clarify' || (Boolean(plan.ask?.length) && plan.state !== 'none' && Boolean(plan.context) && !(plan.context === 'evening_out' && parsed.garments.length) && !(parsed.garments.length && plan.ask.every((id) => id === 'color_preference'))); // قطعة صريحة للسهرة: النتايج الأول والأسئلة اختيارية
  // مراجع Gemini: آخر خط دفاع قبل العرض. بيشيل أي قطعة اسمها مش بتطابق خانتها (كافلينج كقميص، لانجري كفستان).
  if (typeof verifier === 'function' && !needsClarificationFirst && ['full', 'alternatives', 'partial', 'over_budget'].includes(plan.state)) {
    try { const vp = await verifier({ plan, K }); if (vp) plan = vp; } catch { /* نكمل */ }
    plan = auditPlanPicks(plan, K);
  }
  // أسماء القطع والتابات عربي بس: لما نعرض منتجات نرد بالعربي حتى لو الطلب بحروف لاتينية (shoes / hoodie aswad)، بدل رد نص إنجليزي وأسماء عربي مخلوطين.
  if (!(needsClarificationFirst || ['clarify', 'chat', 'no_look'].includes(plan.state))) lang = 'ar';
  const wantCols0 = (pp) => [pp.garments?.[0]?.color, ...(pp.colors || [])].filter(Boolean);
  // شبكة أمان: التخطيط ملقاش (أو لقى بديل) لكن في منتج اسمه/لونه فيه كل كلمات العميل بالظبط: نعرضه بدل «مش موجود»
  if (!needsClarificationFirst && !hasAnswers && ['none', 'alternatives', 'partial'].includes(plan.state) && !parsed.followup && !parsed.flags?.showOther && text.trim().length >= 3) {
    try {
      const wantNet = new Set((parsed.persons || []).map((a) => (a === 'women_hijab' ? 'women' : a)));
      const fitC = parsed.contextEffective === 'evening_out' ? 'evening_out' : null; const fitS = parsed.style || [];
      const hitsNet = keywordSearch(text, ensureEnriched(products, K), { limit: 12 }).filter((pr) => !wantNet.size || !pr.gender || pr.gender === 'unisex' || wantNet.has(pr.gender)).filter((pr) => { if (!parsed.flags?.size) return true; const m = sizeMatch(pr, String(parsed.flags.size).toUpperCase()); return m === true || (m === null && !(APPAREL_FAMILIES.test(pr.key || '') || /(shoe|sneaker|heel|flat|sandal|loafer|boot|slipper)/.test(pr.key || ''))); }).filter((pr) => !wantCols0(parsed).length || (pr.colorKeys || []).length).filter((pr) => !(fitC || fitS.length) || !APPAREL_FAMILIES.test(pr.key || '') || occasionFit(pr, { context: fitC, styles: fitS }).level !== 'unsuitable').slice(0, 6); // مفيش منتج جنس تاني بيتعرض كأنه مطابق
      const wantGarm = (parsed.garments || []).length <= 1 || (parsed.garments || []).every((g) => g.text === g.key);
      // العميل طلب لون معين ومفيش ولا نتيجة بنفس اللون: مانعرضش النتايج كأنها مطابقة، نسيب رد «البديل الأقرب» الصريح
      const wantCols = [parsed.garments?.[0]?.color, ...(parsed.colors || [])].filter(Boolean);
      const colorMiss = plan.state !== 'none' && wantCols.length > 0 && !hitsNet.some((pr) => (pr.colorKeys || []).some((c) => wantCols.includes(c)));
      if (hitsNet.length && wantGarm && !colorMiss && (plan.state === 'none' || (parsed.garments?.[0]?.color || parsed.colors?.length))) return searchReply(hitsNet);
    } catch { /* ignore */ }
  }
  let res = respond(needsClarificationFirst ? { ...plan, state: 'clarify' } : plan, { seed, lang, profile, assistantName });
  if ((parsed.flags?.groupMixed || parsed.flags?.groupFriends) && res?.questions?.[0]?.id === 'who_is_it_for') res = { ...res, say: parsed.flags.groupMixed ? 'تمام! العيلة فيها مين؟ اختار اللي ينطبق وأرشحلك لبس للكل.' : 'تمام! أنتوا شلة بنات ولا شباب ولا مخلوط؟ اختار وأرشحلك.' };
  if (sizeNote && res?.say && !needsClarificationFirst) res = { ...res, say: sizeNote + res.say };
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
    // القطع المذكورة في جملة اقتراح تنسيق («يمشي معاه بنطلون أبيض») مش ادعاء إنها معروضة؛ بنفحص بس الجمل اللي بتقرر حقائق
    // قطعة العميل نفسه («الكوتشي الأبيض بتاعك») مش ادعاء إنها معروضة
    for (const o of parsed.ownedPieces || []) if (o?.key) planKeys.add(o.key);
    const shownNames = [...found.map((f) => f.name), ...stockAlternatives.map((x) => x.name)].join(' . ');
    const stray = b?.reply ? [...strayGarments(K, factualText(b.reply), planKeys, shownNames), ...(plan.state === 'full' && avail.length && /(مش موجود|مش موجوده|مش متاح|مش متاحه|ملقتش|مفيش|مش لاقي|مش لاقيه|مش لاقية|مش عندنا|غير متاح|للأسف)/.test(b.reply.replace(/(مفيش|مش عليه|مش عليها|مافيش|ما فيش)\s+(خصم|خصومات|عرض|عروض|تخفيض)[^.،!؟]*/g, '')) ? ['contradicts_found'] : []), ...(!avail.length && /(هتلاقي|هتلاقى|هتلاقو|ستجد|you'll find|you will find).{0,40}(تحت|below)/i.test(b.reply) ? ['claims_items_below'] : [])] : [];
    // ادعاءات الموديل اللي مش في البيانات: مقاس متاح، ألوان مش موجودة في القطع، أو مناسبة العميل ما قالهاش → نرفض الرد ونرجع لجملة القواعد
    if (b?.reply) {
      const nr = norm(b.reply);
      if (/(متوفر|متوفره|موجود|موجوده|متاح|متاحه)( [^ ]+){0,2} (ب|في )?(كل )?(المقاسات|مقاس|بمقاس)|بمقاس (xxs|xs|s|m|l|xl|xxl|xxxl|[0-9]{2})|كل المقاسات/i.test(nr)) stray.push('claims_size');
      if (!parsed.context && /(^| )(فرح|الفرح|للفرح|لفرح|خطوبه|للخطوبه|الخطوبه|كتب كتاب|كتب الكتاب|التخرج|للتخرج)( |$)/.test(` ${nr} `)) stray.push('claims_occasion');
      const pickedColors = (plan.people || []).flatMap((p) => p.picks.flatMap((x) => [...(x.product.colorKeys || []).map((c) => String(K.colors.get(c)?.ar || '')), ...(Array.isArray(x.product.colors_json) ? x.product.colors_json.map((c) => c?.name || c?.ar || '') : [String(x.product.colors_json || '')])]));
      const allowed = norm([...pickedColors, ...found.map((f) => `${f.name} ${f.color || ''}`), ...stockAlternatives.map((x) => `${x.name} ${x.color || ''}`), ...(parsed.garments || []).map((g) => String(K.colors.get(g.color)?.ar || '')), ...(parsed.colors || []).map((c) => String(K.colors.get(c)?.ar || '')), ...(plan.palette || []).map((c) => String(K.colors.get(c)?.ar || c))].join(' '));
      const COLOR_W = ['اسود', 'سودا', 'ابيض', 'بيضا', 'كحلي', 'بيج', 'رمادي', 'ازرق', 'زرقا', 'احمر', 'حمرا', 'اخضر', 'خضرا', 'بني', 'نبيتي', 'زيتي', 'بينك', 'وردي', 'اصفر', 'برتقالي', 'موف', 'بنفسجي', 'دهبي', 'ذهبي', 'فضي', 'سماوي', 'لبني', 'كافيه', 'جملي', 'اوف وايت'];
      const stem = (w) => w.replace(/^(ال|وال|بال|و)/, '');
      // بس الألوان اللي بيقول إنها «متوفرة/موجودة/ألوان كتير زي…»؛ تعليق التنسيق («يمشي معاها أبيض») مسموح
      const segs = (norm(factualText(b.reply)).match(/(متوفر|متوفره|موجود|موجوده|متاح|متاحه|الوان كتير|بالوان|في الوان|الوان زي|الوان تانيه|بلون|بالالوان|كل الالوان)[^.،!؟]{0,45}/g) || []).join(' ');
      const said = COLOR_W.filter((w) => new RegExp(`(^| )(ال|وال|بال|و)?${w}( |$)`).test(` ${segs} `));
      const fam = { سودا: 'اسود', بيضا: 'ابيض', زرقا: 'ازرق', حمرا: 'احمر', خضرا: 'اخضر', ذهبي: 'دهبي' };
      const has = (w) => allowed.includes(w) || (fam[w] && allowed.includes(fam[w])) || Object.entries(fam).some(([a, b2]) => b2 === w && allowed.includes(a));
      if (said.some((w) => !has(stem(w)))) stray.push('claims_color');
      // خصم / ميعاد توصيل / فروع / خامة أو مميزات مش مكتوبة عند المحل
      for (const c of unsupportedClaims(b.reply, { picked: (plan.people || []).flatMap((p) => p.picks.map((x) => x.product)), parsed })) stray.push(c);
    }
    if (b?.reply && !stray.length) { res = { ...res, say: b.reply, brainReply: true }; brainUsed = true; const mentioned = stockAlternatives.find((x) => b.reply.includes(x.name) || b.reply.includes(String(K.items.get(x.type)?.ar || '\u0000').split(' ')[0])); if (mentioned) altOffer = { wanted: mentioned.wanted, type: mentioned.type }; }
    else if (b?.reply) res = { ...res, brainRejected: stray };
  }
  if (plan.state === 'none' && parsed.avoidColors?.length && parsed.garments?.length && parsed.garments[0].color && !parsed.avoidColors.includes(parsed.garments[0].color)) {
    const cn = String(K.colors.get(parsed.garments[0].color)?.ar || parsed.garments[0].color).split(' ')[0];
    res = { ...res, say: `مفيش ${String(K.items.get(parsed.garments[0].key)?.ar || 'القطعة دي').split(' ')[0]} بلون ${cn} متاح دلوقتي. تحب أجيبلك لون تاني من نفس القطعة ولا نوع مختلف؟` };
  } else if (plan.state === 'none' && parsed.avoidColors?.length && parsed.garments?.length) {
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
      if (picks.length && !(plan.relaxed || []).some((x) => x.kind === 'material') && !picks.some((pr) => pr.materials?.size && wantMat.some((m) => pr.materials.has(m)))) res = { ...res, say: `${res.say} الخامة مش مكتوبة عند المحل، فاتأكد منها من صفحة المنتج أو كلّم المحل.` };
    } }
  // تفاصيل مطلوبة مش مسجلة (كم/ذكية/مطرز…): نقولها بصراحة بدل ما نسيب العميل يفتكر إنها اتحققت
  { const nq = norm(text);
    if (['full', 'alternatives', 'partial'].includes(plan.state) && !needsClarificationFirst && !res.brainReply && !/(ملقتش|مش متاح بالظبط)/.test(res.say || '')) {
      const picksD = (plan.people || []).flatMap((pe) => pe.picks.map((x) => x.product));
      const notes = [];
      if (/(كم (قصير|طويل|واسع|ضيق|نص|ربع)|(^| )بكم (قصير|طويل)|من غير كم|بدون كم|حمالات|قصير الكم|طويل الكم)/.test(nq)) notes.push('تفصيلة الكم');
      for (const w of ['ذكيه', 'مطرز', 'مخرم', 'دانتيل', 'ستان', 'حرير', 'مطبوع', 'مخطط', 'كارو', 'منقوش', 'مشجر', 'لامع', 'ضد الماء']) {
        if (new RegExp(`(^| )(و|ب|بال|ال|وال)?${w}( |$)`).test(nq) && picksD.length /* كلمة مستقلة: «فستان» مش «ستان» */ && !picksD.some((pr) => norm(`${pr.name_ar || ''} ${pr.description_ar || ''} ${pr.cat_text || ''}`).includes(w))) notes.push(`«${w}»`);
      }
      if (notes.length) res = { ...res, say: `${res.say} مش متأكدة إن ${notes.join(' و')} متسجل عند المحل للقطعة دي، فتأكد منه من صورها ووصفها أو كلّم المحل.` };
    } }
  // العميل حدد لون ومفيش حاجة بيه في الترشيح: نقولها بصراحة
  { const want = [...new Set([...(parsed.colors || []), ...(parsed.garments || []).map((x) => x.color)].filter(Boolean))];
    if (want.length && ['full', 'alternatives', 'partial'].includes(plan.state) && !needsClarificationFirst && !res.brainReply && !/(ملقتش|مش متاح بالظبط|مفيش.*بلون)/.test(res.say || '') && !(plan.relaxed || []).some((x) => ['near_color', 'material', 'color'].includes(x.kind))) {
      const picks = (plan.people || []).flatMap((pe) => pe.picks.map((x) => x.product));
      if (picks.length && !picks.some((pr) => (pr.colorKeys || []).some((c) => want.includes(c)))) {
        const names = want.map((c) => String(K.colors.get(c)?.ar || c).split(' ')[0]).join(' / ');
        res = { ...res, say: `${res.say} ملقتش في الطقم ده حاجة بلون ${names}، فده أقرب المتاح. لو عايز لون تاني قولي.` };
      }
    } }
  // مناسب للسهرة؟ لو قطعة معروضة مفيش في بياناتها إشارات كفاية: نقولها بصراحة بدل ما نوحي إنها «سهرة»
  if ((parsed.contextEffective === 'evening_out') && !needsClarificationFirst && ['full', 'alternatives', 'partial', 'over_budget'].includes(plan.state)) {
    const shownIdsU = new Set((res.blocks?.tabs || []).flatMap((t) => (t.items || []).flatMap((it) => [it.id, ...(it.alts || []).map((a) => a.id)])));
    const byIdU = new Map(ensureEnriched(products, K).map((pr) => [pr.id, pr]));
    const unc = [...shownIdsU].map((id) => byIdU.get(id)).filter((pr) => pr && APPAREL_FAMILIES.test(pr.key || '') && !INTIMATE_KEYS.has(pr.key) && occasionFit(pr, { context: 'evening_out', styles: parsed.style || [] }).level === 'uncertain'); // المعروض فعلًا (القطعة وبدائلها)
    if (unc.length) res = { ...res, say: `${res.say} مش متأكدة إن ${unc.slice(0, 2).map((pr) => `«${pr.name_ar}»`).join(' و')} مناسب للسهرة: مش مكتوب في بياناته تفاصيل كفاية (خامة أو تصميم)، فبصّي على صوره أو اسألي المحل.`, uncertainFit: unc.map((pr) => pr.id) };
  }
  const g = guardResponse(res, { lang });
  if (!g.ok) res = { ...res, say: pick(K.phrases.ar.fallback_generic, seed), guard: g.problems };

  if (parsed.preferredStoreName && !needsClarificationFirst && ['full', 'alternatives', 'partial'].includes(plan.state) && !res.say?.includes(parsed.preferredStoreName)) {
    res = { ...res, say: `رشحتلك أولاً من كولكشن «${parsed.preferredStoreName}» في بنها:\n\n${res.say}` };
  }
  if (sizeMiss && plan.people?.length) {
    const sizes = [...new Set(plan.people.flatMap((pe) => pe.picks.map((pk) => sizesLabel(pk.product || {})).filter(Boolean)))];
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
  if ((parsed.followup === 'show_more' || parsed.flags?.showOther) && excludeIds.length && plan.people?.length && !needsClarificationFirst) {
    const ids = plan.people.flatMap((p) => p.picks.map((x) => x.product.id));
    if (ids.length && ids.every((id) => excludeIds.includes(id))) res = { ...res, say: 'ده اللي متاح دلوقتي لطلبك، ومفيش بدائل تانية غيره. لو عايز، غيّر اللون أو النوع أو الميزانية وأدورلك تاني.' };
  }
  if ((parsed.followup === 'show_more' || parsed.flags?.showOther) && ['alternatives', 'partial'].includes(plan.state) && !res.brainReply && !needsClarificationFirst && !((plan.people || []).flatMap((p) => p.picks.map((x) => x.product.id)).every((id) => excludeIds.includes(id)))) {
    const pr = String(res.say || '').match(/(السعر|الإجمالي)[^.]*\./);
    res = { ...res, say: `دي اختيارات تانية قريبة من اللي كنت بتدور عليه.${pr ? ' ' + pr[0] : ''}` };
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
    turn: (session?.turn || 0) + 1, parsed: { ...parsed, advice: null, ...(derivedBudget ? { budget: session?.parsed?.budget ?? null } : {}), ...speakerCarry(parsed, session) }, pending: plan.state === 'clarify' || Boolean(plan.ask?.length), pendingQuestion: plan.ask?.[0] || null, askedIds: [...new Set([...(session?.askedIds || []), ...(plan.ask || [])])].slice(-12), shown: [...new Set([...(session?.shown || []), ...shown])].slice(-60),
    altOffer,
    lastState: plan.state, lastTotal: needsClarificationFirst ? (session?.lastTotal ?? null) : (plan.total ?? null), lastBudgetUsed: needsClarificationFirst ? (session?.lastBudgetUsed ?? null) : (plan.budget ?? plan.total ?? null),
    activeLook,
    lookHistory,
    excludedTypes,
    // القطع اللي اتكلمنا عنها قبل كده (عشان «رجعني للفستان» يرجع بنفس اللون والخامة)
    garmentHistory: (() => { const prevG = session?.parsed?.garments || []; const curKeys = (parsed.garments || []).map((g) => g.key).join(','); let h = [...(session?.garmentHistory || [])];
      if (prevG.length && prevG.map((g) => g.key).join(',') !== curKeys) for (const g of prevG) { h = h.filter((x) => x?.key !== g.key); h.push({ ...g }); }
      return h.slice(-6); })(),
  };
  const refineNote = refinementTurn && res?.say && ['full', 'alternatives', 'partial', 'over_budget'].includes(res.state) ? (lang === 'en' ? 'Noted that detail, but I cannot filter by it precisely yet; here are the closest options:' : 'خدت بالي من التفصيلة دي، بس لسه مش بقدر أفلتر بيها بالظبط؛ دي أقرب اختيارات للي طلبته:') : null;
  if (purchaseNote && res.blocks) res = { ...res, say: `${res.say} ${purchaseNote}`, serviceAction: 'purchase_help' }; // حقل إضافي اختياري (الواجهة القديمة بتتجاهله)
  if (parsed.flags?.adviceTipId) { const tipA = K.phrases.advice.items.find((a) => a.id === parsed.flags.adviceTipId)?.answer_ar; if (tipA) res = { ...res, tips: [tipA, ...(res.tips || [])].slice(0, 3) }; }
  return { ...res, ...(refineNote ? { say: `${refineNote}\n${res.say}` } : {}), session: nextSession, parsed, curated, debug: { eventTime } };
}
