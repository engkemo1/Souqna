/**
 * محرك مودة: رسالة (أو إجابة زرار) → رد جاهز. بدون موديل في المسار الأساسي.
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
import { norm } from './text.js';

/** "طب ممكن ألبس إيه؟ / فيه بديل؟ / حاجة تانية" بعد رد ما لقاش المطلوب: العميل بيطلب بدائل لنفس المناسبة. */
const ALT_RE = /(البس|ألبس|الاقي|اجيب|اشتري|اختار)( [^ ]+){0,3} (ايه|اي|ايش)( |$)|(^| )(بديل|بدائل|البديل|حاجه تانيه|حاجات تانيه|مفيش غيره|ايه المتاح|ايه الموجود|ايه اللي موجود)( |$)/;
import { cairoParts, resolveEventTime, getWeather, weatherAdvice } from './time.js';

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
  const K = loadKnowledge();
  const { products = [], profile = {}, now = new Date(), weatherMock = null, imageText = '', session = null, answers = null, llmExtract = null, brain = null, curator = null, understand = null, fetcher, assistantName = null } = opts;
  const text = lastUserText(messages);
  const dow = cairoParts(now).dow;
  const seed = `${text}|${session?.turn || 0}`;
  let parsed = parseMessage(text, { profile, imageText, now, cairoDow: dow });
  const lang = parsed.lang === 'en' ? 'en' : 'ar';

  // ---------- ريست ----------
  if (parsed.followup === 'reset') {
    const res = respond({ state: 'chat', intent: 'greeting' }, { seed, lang, profile, assistantName });
    return { ...res, session: { turn: 1 }, parsed };
  }

  // ---------- أسئلة الخدمة (مين أنت، فين طلبي، الشحن، الدفع…) — مش طلب لبس ----------
  if (!(answers && Object.keys(answers).length) && !session?.pending && !parsed.garments.length && !parsed.context) {
    const faq = matchFaq(text);
    const say = faq ? faqAnswer(faq, { lang, name: typeof assistantName === 'string' ? assistantName : assistantName?.[lang] }) : null;
    if (say) return { state: 'chat', intent: 'faq', faq, say, tips: [], styleTips: [], questions: [], blocks: null, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  }

  // ---------- فهم الموديل أولاً (اختياري): Gemini/Claude يحوّل الرسالة لبيانات، والكود بيتحقق، والقواعد تكمّل ----------
  if (typeof understand === 'function' && !(answers && Object.keys(answers).length) && !session?.pending && parsed.intent === 'shop' && text.trim().length >= 8 && !rulesConfident(parsed, text)) {
    try {
      const u = await understand({ text, parsed });
      if (u) parsed = applyUnderstanding(parsed, u);
    } catch { /* نكمل بالقواعد */ }
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

  // ---------- متابعات ----------
  let excludeIds = []; const prevTotal = session?.lastTotal;
  if (parsed.followup === 'cheaper' && prevTotal) parsed.budget = { value: Math.max(100, Math.round((session.lastBudgetUsed || prevTotal) * 0.8 / 50) * 50), kind: 'total' };
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

  const advice = parsed.advice ? K.phrases.advice.items.find((a) => a.id === parsed.advice.id) : null;
  if (parsed.intent !== 'shop') {
    const res = respond({ state: 'chat', intent: parsed.intent === 'followup' ? 'unknown' : parsed.intent }, { seed, lang, profile, advice, assistantName });
    return { ...res, session: { ...(session || {}), turn: (session?.turn || 0) + 1 }, parsed };
  }

  // ---------- وقت وجو ----------
  const eventTime = resolveEventTime(parsed, { now });
  const weather = await getWeather(eventTime, { now, mock: weatherMock, fetcher });
  const adv = weatherAdvice(weather, eventTime);

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
  const needsClarificationFirst = Boolean(plan.ask?.length) && plan.state !== 'none';
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

  const shown = !needsClarificationFirst && plan.people ? plan.people.flatMap((p) => p.picks.map((x) => x.product.id)) : [];
  const nextSession = {
    turn: (session?.turn || 0) + 1, parsed: { ...parsed, advice: null }, pending: plan.state === 'clarify' || Boolean(plan.ask?.length), pendingQuestion: plan.ask?.[0] || null, shown: [...new Set([...(session?.shown || []), ...shown])].slice(-60),
    lastState: plan.state, lastTotal: needsClarificationFirst ? (session?.lastTotal ?? null) : (plan.total ?? null), lastBudgetUsed: needsClarificationFirst ? (session?.lastBudgetUsed ?? null) : (plan.budget ?? plan.total ?? null),
  };
  return { ...res, session: nextSession, parsed, weatherSource: weather.source === 'met_norway' ? 'met_norway' : null, curated, debug: { eventTime, weather: adv } };
}
