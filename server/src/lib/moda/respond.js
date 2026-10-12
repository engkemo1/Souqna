/**
 * صياغة رد مودة. كل جملة بتيجي من phrases.json (عامية)، والكود بس بيختار ويعبّي المتغيرات.
 * مفيش نص بيتولّد من موديل هنا.
 */
import { loadKnowledge } from './knowledge.js';

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const pick = (list, seed = '') => (Array.isArray(list) && list.length ? list[hashStr(String(seed)) % list.length] : (list ?? ''));
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
const itemAr = (K, key) => String(K.items.get(key)?.ar || key).replace(/\s*\(.*?\)\s*/g, '').split(' / ')[0].trim();
const colorAr = (K, key) => K.colors.get(key)?.ar || key;
const joinAr = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join('، ')} و${arr[arr.length - 1]}`);
const nf = (n) => Number(n).toLocaleString('en-US');

const QUESTION_FOR = { audience: 'who_is_it_for', occasion: 'what_occasion', budget: 'budget', dress_kind: 'dress_kind' };

export function buildQuestion(K, askKey, lang = 'ar') {
  const id = QUESTION_FOR[askKey] || askKey; const q = K.questions.questions[id];
  if (!q) return null;
  if (lang === 'en' && q.en) return { id, text: q.en.text, type: q.type, options: q.options.map((o) => ({ ...o, label: q.en.options[typeof o.value === 'string' ? o.value : JSON.stringify(o.value)] || o.label })) };
  return { id, text: q.text, type: q.type, options: q.options };
}

function tabLabel(aud, persons, P) {
  const hasMan = persons.includes('men'); const hasWoman = persons.includes('women') || persons.includes('women_hijab');
  if (aud === 'men') return P.tab_him; if (aud === 'women' || aud === 'women_hijab') return hasMan ? P.tab_her : P.tab_all;
  if (aud === 'boys') return hasMan || hasWoman || persons.includes('girls') ? P.tab_boy : P.tab_all;
  if (aud === 'girls') return hasMan || hasWoman || persons.includes('boys') ? P.tab_girl : P.tab_all;
  return P.tab_all;
}

const itemCard = (K, pk) => {
  const p = pk.product;
  return { id: p.id, key: p.key, label: itemAr(K, pk.slotKey), name: p.name_ar || p.name_en, price: p.price, store: p.store_slug || null, image: p.image || p.image_url || p.thumb || null, colors: p.colorKeys, optional: pk.optional, relaxed: pk.relaxed || null };
};

/** بيحوّل plan → رد. opts: { seed, lang } */
export function respond(plan, { seed = '', lang = 'ar', profile = {}, advice = null } = {}) {
  const K = loadKnowledge();
  const L = lang === 'en' ? 'en' : 'ar';
  const P = { ...K.phrases.ar, ...(L === 'en' ? K.phrases.en : {}) };
  const say = (key, vars = {}) => fill(pick(P[key], `${seed}:${key}`), vars);

  // ---------- محادثة ----------
  if (plan.state === 'chat') {
    if (plan.intent === 'greeting') return { state: 'chat', intent: 'greeting', say: profile.name ? say('greeting_returning', { name: profile.name }) : say('greeting'), questions: [], blocks: null };
    if (plan.intent === 'thanks') return { state: 'chat', intent: 'thanks', say: say('thanks'), questions: [], blocks: null };
    if (plan.intent === 'advice' && advice) return { state: 'chat', intent: 'advice', say: advice.answer_ar, questions: [], blocks: null, adviceId: advice.id };
    return { state: 'chat', intent: plan.intent || 'unknown', say: say('didnt_understand'), questions: [], blocks: null };
  }

  // ---------- أسئلة ----------
  if (plan.state === 'clarify') {
    const asks = plan.ask || [];
    const first = asks[0];
    const text = first === 'audience' ? say('clarify_audience') : first === 'occasion' ? say('clarify_occasion') : first === 'budget' ? say('clarify_budget') : first === 'color_preference' ? say('clarify_color') : first === 'dress_kind' ? say('dress_clarify') : say('clarify_generic');
    return { state: 'clarify', intent: 'shop', say: text, questions: asks.slice(0, K.questions.limits.max_questions_per_turn).map((a) => buildQuestion(K, a, L)).filter(Boolean), blocks: null, ask: asks };
  }

  const ctxAr = plan.context ? (K.contexts.get(plan.context)?.ar || '') : '';
  const occasion = String(ctxAr).replace(/\s*\(.*?\)\s*/g, ' ').split('/')[0].trim() || 'المناسبة';
  const paletteAr = joinAr((plan.palette || []).map((c) => colorAr(K, c)));
  const couple = plan.people.length === 2 && plan.persons.includes('men') && plan.persons.some((a) => a === 'women' || a === 'women_hijab');
  const condolence = plan.tone === 'sober';

  const parts = [];
  const relaxedTexts = [];
  const wantedAr = (w) => { const ws = w.split(' '); const c = ws.find((x) => K.colors.has(x)); const it = ws.find((x) => K.items.has(x)); return [it ? itemAr(K, it) : '', c ? colorAr(K, c) : ''].filter(Boolean).join(' '); };
  for (const r of plan.relaxed || []) {
    if (r.kind.includes('substitute')) relaxedTexts.push(`${say('alt_item', { wanted: wantedAr(r.wanted), got: itemAr(K, r.got) })}.`);
    else if (r.kind === 'color') relaxedTexts.push(`${say('alt_color', { wanted: wantedAr(r.wanted) })}.`);
  }

  // ---------- مقدمة حسب الحالة ----------
  let intro;
  if (plan.state === 'none') intro = say('intro_none');
  else if (plan.state === 'partial') intro = say(couple ? 'intro_partial_couple' : 'intro_partial', { occasion, missing: joinAr((plan.missing || []).map((m) => `${itemAr(K, m.base)}${m.material ? ` ${K.synonyms.materials[m.material]?.[0] || m.material}` : ''}`)) });
  else if (plan.state === 'alternatives') intro = `${say('intro_alternatives')} ${relaxedTexts.join(' ')}`.trim();
  else if (plan.state === 'over_budget') intro = say('over_budget', { total: nf(plan.total), budget: nf(plan.budget), over: nf(plan.over) });
  else intro = say(couple ? 'intro_full_couple' : 'intro_full', { occasion, palette: paletteAr });
  parts.push(intro);

  if (condolence) {
    const c = K.phrases.ar.condolence;
    parts[0] = plan.state === 'none' ? pick(c.no_results, seed) : pick(c.intro, seed);
  }

  // ---------- الإجمالي ----------
  if (plan.state !== 'none' && plan.state !== 'over_budget') {
    if (couple) {
      const him = plan.people.find((p) => p.aud === 'men');
      const her = plan.people.find((p) => p.aud !== 'men');
      const himHasPrice = Number(him?.subtotal) > 0;
      const herHasPrice = Number(her?.subtotal) > 0;
      if (plan.state === 'partial' && (himHasPrice || herHasPrice)) {
        parts.push(say('total_line_couple_partial', {
          available: [himHasPrice ? `ليك ${nf(him.subtotal)} جنيه` : '', herHasPrice ? `ليها ${nf(her.subtotal)} جنيه` : ''].filter(Boolean).join('، '),
          total: nf(plan.total),
        }));
      } else if (!himHasPrice && herHasPrice) parts.push(say('total_line_couple_her_only', { her: nf(her.subtotal) }));
      else if (himHasPrice && !herHasPrice) parts.push(say('total_line_couple_him_only', { him: nf(him.subtotal) }));
      else if (himHasPrice && herHasPrice) parts.push(say('total_line_couple', { him: nf(him.subtotal), her: nf(her.subtotal), total: nf(plan.total) }));
    } else if (Number(plan.total) > 0) parts.push(say('total_line', { total: nf(plan.total) }));
    if (plan.budget && plan.total <= plan.budget && Number(plan.total) > 0) parts.push(say('within_budget', { budget: nf(plan.budget) }));
  } else if (plan.state === 'over_budget') {
    parts.push(say('total_line', { total: nf(plan.total) }), say('over_hint'));
  }
  if (plan.dropped?.length) parts.push(say('dropped_optional', { dropped: joinAr([...new Set(plan.dropped)].map((k) => itemAr(K, k))) }));
  const swapped = plan.people.flatMap((p) => p.picks.filter((x) => x.relaxed === 'budget').map((x) => itemAr(K, x.slotKey)));
  if (swapped.length) parts.push(say('budget_swap', { slot: joinAr(swapped) }));

  // ---------- جو ووقت ----------
  const tips = [];
  const adv = plan.weather;
  if (!condolence && adv) {
    if (adv.fabrics_ar?.length) tips.push(say('weather_line', { temp: adv.temp, fabrics: joinAr(adv.fabrics_ar.slice(0, 2)) }));
    if ((adv.band === 'cool' || adv.band === 'cold') && plan.eventTime?.isNight) tips.push(say('weather_layer', { layers: adv.layers === 1 ? 'جاكيت أو شال خفيف' : 'جاكيت تقيل' }));
    if (adv.notes?.includes('rain')) tips.push(say('weather_rain'));
    if (adv.approximate && (plan.eventTime?.daysAhead || 0) > 0) tips.push(say('weather_approx'));
  }
  if (!condolence) {
    const seen = new Set();
    for (const pe of plan.people) if (pe.look?.tip_ar && !seen.has(pe.look.tip_ar)) { seen.add(pe.look.tip_ar); tips.push(say('tip_formats', { tip: pe.look.tip_ar })); }
  }

  // ---------- بلوكات المنتجات ----------
  const tabs = plan.people.map((pe) => ({
    id: pe.aud, label: tabLabel(pe.aud, plan.persons, { ...P }), look: pe.look?.name_ar || null,
    items: pe.picks.map((pk) => itemCard(K, pk)), subtotal: pe.subtotal,
    missing: pe.missing.map((m) => ({ key: m.base, material: m.material, label: itemAr(K, m.base), button: P.order_missing_button, hint: pick(P.order_missing_hint, `${seed}:hint`), payload: { type: 'request_item', key: m.base, material: m.material, color: m.color, audience: pe.aud } })),
  }));

  const questions = condolence ? [] : (plan.ask || []).slice(0, 1).map((a) => buildQuestion(K, a, L)).filter(Boolean);

  return {
    state: plan.state, intent: 'shop', say: parts.filter(Boolean).join(' '), tips: tips.slice(0, 3), questions,
    blocks: { tabs, total: plan.total, budget: plan.budget, over: plan.over, palette: (plan.palette || []).map((c) => ({ key: c, ar: colorAr(K, c) })), couple },
    missing: plan.missing || [], relaxed: plan.relaxed || [],
  };
}
