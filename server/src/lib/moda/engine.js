/**
 * محرك مودة: رسالة (أو إجابة زرار) → رد جاهز. بدون موديل في المسار الأساسي.
 * runModa(messages, { products, profile, now, weatherMock, imageText, session, answers, llmExtract, fetcher })
 * بيرجع { ...response, session, parsed } — session بيتخزن عند العميل/السيرفر ويتبعت في الطلب الجاي.
 */
import { loadKnowledge } from './knowledge.js';
import { parseMessage } from './parse.js';
import { enrichAll } from './products.js';
import { planOutfit } from './plan.js';
import { respond, pick } from './respond.js';
import { guardResponse } from './guard.js';
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
  for (const k of ['persons', 'garments', 'colors', 'avoidColors', 'taste', 'ownedPieces']) if (!m[k]?.length && prev[k]?.length) m[k] = prev[k];
  for (const k of ['context', 'contextEffective', 'budget', 'daypart', 'dateOffsetDays', 'season']) if ((m[k] === null || m[k] === undefined) && prev[k] != null) m[k] = prev[k];
  if (!cur.context && prev.role) m.role = prev.role;
  return m;
};

export async function runModa(messages, opts = {}) {
  const K = loadKnowledge();
  const { products = [], profile = {}, now = new Date(), weatherMock = null, imageText = '', session = null, answers = null, llmExtract = null, fetcher } = opts;
  const text = lastUserText(messages);
  const dow = cairoParts(now).dow;
  const seed = `${text}|${session?.turn || 0}`;
  let parsed = parseMessage(text, { profile, imageText, now, cairoDow: dow });
  const lang = parsed.lang === 'en' ? 'en' : 'ar';

  // ---------- ريست ----------
  if (parsed.followup === 'reset') {
    const res = respond({ state: 'chat', intent: 'greeting' }, { seed, lang, profile });
    return { ...res, session: { turn: 1 }, parsed };
  }

  // ---------- دمج مع الجلسة ----------
  const hasAnswers = answers && Object.keys(answers).length;
  const continuing = session?.parsed && (session.pending || parsed.intent === 'followup' || hasAnswers || (parsed.intent === 'shop' && !parsed.persons.length && !parsed.garments.length && session.parsed.persons?.length));
  if (hasAnswers) parsed = applyAnswers({ ...parsed, intent: 'shop' }, answers, K);
  if (continuing && (parsed.intent === 'shop' || parsed.intent === 'followup' || parsed.intent === 'unknown')) { parsed = mergeFromSession(parsed, session.parsed); parsed.intent = 'shop'; }
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
  if (parsed.intent === 'unknown' && typeof llmExtract === 'function') {
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
    const res = respond({ state: 'chat', intent: parsed.intent === 'followup' ? 'unknown' : parsed.intent }, { seed, lang, profile, advice });
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

  let res = respond(plan, { seed, lang, profile });
  const g = guardResponse(res, { lang });
  if (!g.ok) res = { ...res, say: pick(K.phrases.ar.fallback_generic, seed), guard: g.problems };

  const shown = plan.people ? plan.people.flatMap((p) => p.picks.map((x) => x.product.id)) : [];
  const nextSession = {
    turn: (session?.turn || 0) + 1, parsed: { ...parsed, advice: null }, pending: plan.state === 'clarify' || Boolean(plan.ask?.length), pendingQuestion: plan.ask?.[0] || null, shown: [...new Set([...(session?.shown || []), ...shown])].slice(-60),
    lastTotal: plan.total ?? null, lastBudgetUsed: plan.budget ?? plan.total ?? null,
  };
  return { ...res, session: nextSession, parsed, weatherSource: weather.source === 'met_norway' ? 'met_norway' : null, debug: { eventTime, weather: adv } };
}
