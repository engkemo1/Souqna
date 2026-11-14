/**
 * صياغة رد تويلا. كل جملة بتيجي من phrases.json (عامية)، والكود بس بيختار ويعبّي المتغيرات.
 * مفيش نص بيتولّد من موديل هنا.
 */
import { loadKnowledge } from './knowledge.js';
import { generateColorHarmonyInsight, generateFitAndSizingTip } from './stylingInsights.js';
import { allowedGarments, guardWhy, genericWhy } from './whyGuard.js';

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const pick = (list, seed = '') => (Array.isArray(list) && list.length ? list[hashStr(String(seed)) % list.length] : (list ?? ''));
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
const itemAr = (K, key) => String(K.items.get(key)?.ar || key).replace(/\s*\(.*?\)\s*/g, '').split(' / ')[0].trim();
const colorAr = (K, key) => K.colors.get(key)?.ar || key;
const joinAr = (input) => { const arr = [...new Set(input)]; return arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join('، ')} و${arr[arr.length - 1]}`; };
const dedupeSay = (t) => { const seen = new Set(); return String(t || '').split(/(?<=[.!؟?])\s+/).filter((x) => { const k = x.trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; }).join(' '); };
const nf = (n) => Number(n).toLocaleString('en-US');

const QUESTION_FOR = { audience: 'who_is_it_for', occasion: 'what_occasion', budget: 'budget', dress_kind: 'dress_kind' };

export function buildQuestion(K, askKey, lang = 'ar') {
  const id = QUESTION_FOR[askKey] || askKey; const q = K.questions.questions[id];
  if (!q) return null;
  if (lang === 'en' && q.en) return { id, text: q.en.text, type: q.type, options: q.options.map((o) => ({ ...o, label: q.en.options[typeof o.value === 'string' ? o.value : JSON.stringify(o.value)] || o.label })) };
  return { id, text: q.text, type: q.type, options: q.options };
}

// سؤال «ضيف ولا صاحب المناسبة»: اسم المناسبة الصح (فرح/كتب كتاب/خطوبة) ومخاطبة الست بالمؤنث، بدل «إنت ضيف ولا الخطوبة بتاعتك؟» لكل الحالات
function fitRoleQ(q, plan, L) {
  if (!q || q.id !== 'engagement_role' || L === 'en') return q;
  const ctx = plan?.parsed?.context || plan?.context || '';
  const ev = /wedding/.test(ctx) ? ['الفرح', 'بتاعك', 'بتاعي'] : /katb/.test(ctx) ? ['كتب الكتاب', 'بتاعك', 'بتاعي'] : ['الخطوبة', 'بتاعتك', 'بتاعتي'];
  const pp = plan?.parsed?.persons || plan?.persons || [];
  const fem = plan?.parsed?.genderHint === 'female' || (!plan?.parsed?.genderHint && pp.length && pp.every((p) => p === 'women' || p === 'women_hijab'));
  const text = fem ? `إنتي ضيفة ولا ${ev[0]} ${ev[1]}؟` : `إنت ضيف ولا ${ev[0]} ${ev[1]}؟`;
  return { ...q, text, options: q.options.map((o) => ({ ...o, label: o.value === 'guest' ? (fem ? 'ضيفة' : 'ضيف') : `${ev[0]} ${ev[2]}` })) };
}

function tabLabel(aud, persons, P) {
  const hasMan = persons.includes('men'); const hasWoman = persons.includes('women') || persons.includes('women_hijab');
  if (aud === 'men') return P.tab_him; if (aud === 'women' || aud === 'women_hijab') return hasMan ? P.tab_her : P.tab_all;
  if (aud === 'boys') return hasMan || hasWoman || persons.includes('girls') ? P.tab_boy : P.tab_all;
  if (aud === 'girls') return hasMan || hasWoman || persons.includes('boys') ? P.tab_girl : P.tab_all;
  return P.tab_all;
}

// سبب القطعة في الأطقم اللي من غير AI: سبب القطعة نفسها + ربطها بباقي القطع المختارة في نفس الطقم (مش وصف عام بس)
const tieWhyToLook = (K, itemsIn, L, ownedLabels = [], ownedKeys = []) => {
  if (L === 'en') return itemsIn;
  // 1) حارس: سبب أي قطعة ما يشيرش لقطعة مش في نفس الطقم (ولا مع العميل). الجملة اللي بتذكر قطعة غايبة بتتشال، ولو مفضلش حاجة نرجع لسبب القطعة نفسها أو جملة عامة صادقة.
  const allow = allowedGarments(K, itemsIn, ownedKeys);
  const items = itemsIn.map((it) => {
    if (!it.why || !['piece', 'look'].includes(it.whyKind)) return it;
    const g = guardWhy(K, it.why, allow); if (!g.changed) return it;
    if (g.text) return { ...it, why: g.text };
    const own = K.kb?.whyAr?.(it.key); const og = own ? guardWhy(K, own, allow) : null;
    if (og && og.text) return { ...it, why: og.text, whyKind: 'piece' };
    const occ = K.kb?.occasionsAr?.(it.key) || [];
    return { ...it, why: occ.length ? `بتناسب ${occ.join('، ')}` : genericWhy(), whyKind: 'piece' };
  });
  if (items.length < 2) return items;
  const shortLabel = (i) => String(i.label || '').trim();
  const words = (o) => [shortLabel(o), ...String(o.name || '').split(/\s+/).filter((w) => w.length >= 3).slice(0, 2)].filter(Boolean);
  return items.map((it) => {
    if (!it.why || !['piece', 'look'].includes(it.whyKind)) return it;
    const others = items.filter((o) => o !== it && shortLabel(o)).map(shortLabel).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
    // سبب جاي من الـ AI وبيذكر فعلًا قطعة تانية في الطقم (أو القطعة اللي مع العميل): نسيبه زي ما هو. غير كده نضيف الربط بالكود، مش معتمدين على الموديل.
    if (it.whyKind === 'look' && (items.some((o) => o !== it && words(o).some((w) => String(it.why).includes(w))) || /اللي (عندك|معاك)|عندك|معاك/.test(String(it.why)))) return it;
    if (!others.length && !ownedLabels.length) return it;
    const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join('، ')} و${others[others.length - 1]}`;
    const own = [...new Set(ownedLabels)].filter((l) => l && l !== it.label).slice(0, 2); const ownTxt = own.length ? ` ومع ${own.join(' و')} اللي معاك` : '';
    return { ...it, why: `${String(it.why).replace(/[.؟!]+\s*$/, '')}. في الطقم ده بيتنسق مع ${list || 'باقي القطع'}${ownTxt}.`, whyKind: it.whyKind === 'look' ? 'look+outfit' : 'outfit' };
  });
};

const itemCard = (K, pk) => {
  const p = pk.product;
  const fitTip = generateFitAndSizingTip(p);
  return { id: p.id, key: p.key, label: itemAr(K, p.key || pk.slotKey), name: p.name_ar || p.name_en, price: p.price, store: p.store_slug || null, image: p.image || p.image_url || p.thumb || null, colors: p.colorKeys, optional: pk.optional, relaxed: pk.relaxed || null, fitTip: fitTip || null, why: pk.why || K.kb?.whyAr?.(pk.slotKey) || null, whyKind: pk.why ? 'look' : (K.kb?.whyAr?.(pk.slotKey) ? 'piece' : null),
    alts: (pk.alts || []).map((a) => ({ id: a.id, key: a.key, label: itemAr(K, a.key || pk.slotKey), name: a.name_ar || a.name_en, price: a.price, store: a.store_slug || null, image: a.image || a.image_url || a.thumb || null, colors: a.colorKeys })) };
};

/** بيحوّل plan → رد. opts: { seed, lang } */
export function respond(plan, { seed = '', lang = 'ar', profile = {}, advice = null, assistantName = null } = {}) {
  const K = loadKnowledge();
  const L = lang === 'en' ? 'en' : 'ar';
  const P = { ...K.phrases.ar, ...(L === 'en' ? K.phrases.en : {}) };
  const name = typeof assistantName === 'string' ? assistantName : assistantName?.[L];
  const say = (key, vars = {}) => fill(pick(P[key], `${seed}:${key}`), { name: name || (L === 'en' ? 'Twila' : 'تويلا'), ...vars });

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
    const couple = plan.persons?.length === 2 && plan.persons.includes('men') && plan.persons.some((a) => a === 'women' || a === 'women_hijab');
    const herText = first === 'modest_preference' && (plan.persons?.includes('men') || plan.soloFromCouple === 'women') ? 'هي محجبة ولا لأ؟' : null;
    const text = herText ? herText : first === 'audience' ? say('clarify_audience') : first === 'occasion' ? say('clarify_occasion') : first === 'budget' ? say(couple ? 'clarify_budget_couple' : 'clarify_budget') : first === 'time_if_dressy' ? say('clarify_time') : first === 'venue_if_dressy' ? say('clarify_venue') : first === 'color_preference' ? say('clarify_color') : first === 'dress_kind' ? say('dress_clarify') : (buildQuestion(K, first, L)?.text || say('clarify_generic'));
    const questions = asks.slice(0, K.questions.limits.max_questions_per_turn).map((a) => {
      const q = fitRoleQ(buildQuestion(K, a, L), plan, L);
      if (a === 'modest_preference' && q && (plan.persons?.includes('men') || plan.soloFromCouple === 'women')) return { ...q, text: 'هي محجبة ولا لأ؟' };
      return a === 'budget' && couple && q ? { ...q, text: say('clarify_budget_couple') } : q;
    }).filter(Boolean);
    return { state: 'clarify', intent: 'shop', say: first === 'engagement_role' && questions[0]?.id === 'engagement_role' ? questions[0].text : text, questions, blocks: null, ask: asks };
  }

  if (plan.state === 'no_look') {
    const ctxName = String(K.contexts.get(plan.context)?.ar || '').replace(/\s*\(.*?\)\s*/g, ' ').split('/')[0].trim() || (L === 'en' ? 'this occasion' : 'المناسبة دي');
    return { state: 'no_look', intent: 'shop', say: say('no_look', { occasion: ctxName }), tips: [], styleTips: [], questions: [], blocks: null, missing: [], relaxed: [] };
  }

  const ctxAr = plan.context ? (K.contexts.get(plan.context)?.ar || '') : '';
  const occasion = String(ctxAr).replace(/\s*\(.*?\)\s*/g, ' ').split('/')[0].trim() || 'المناسبة';
  const occasionForAr = { engagement_guest: 'للخطوبة', engagement_self: 'لخطوبتك', katb_kitab: 'لكتب الكتاب', wedding_guest: 'للفرح', wedding_self: 'لفرحك', graduation: 'للتخرج', family_gathering: 'للمة العيلة', birthday_party: 'لعيد الميلاد', date_night: 'لخروجة أو عشا', work_formal: 'للشغل', work_casual: 'للشغل', university: 'للجامعة', sport: 'للرياضة', casual_outing: 'للخروجة', travel: 'للسفر', eid: 'للعيد', ramadan_iftar: 'لإفطار رمضان', sahel_beach: 'للساحل' };
  const occasionFor = L === 'en' ? occasion : (occasionForAr[plan.context] || `لـ${occasion}`);
  const paletteAr = joinAr((plan.palette || []).map((c) => colorAr(K, c)));
  const couple = !plan.audienceOpen && plan.people.length === 2 && plan.persons.includes('men') && plan.persons.some((a) => a === 'women' || a === 'women_hijab');
  const condolence = plan.tone === 'sober';

  const parts = [];
  const relaxedTexts = [];
  const wantedAr = (w) => { const ws = w.split(' '); const c = ws.find((x) => K.colors.has(x)); const it = ws.find((x) => K.items.has(x)); return [it ? itemAr(K, it) : '', c ? colorAr(K, c) : ''].filter(Boolean).join(' '); };
  for (const r of plan.relaxed || []) {
    if (r.kind.includes('substitute')) relaxedTexts.push(`${say('alt_item', { wanted: wantedAr(r.wanted), got: itemAr(K, r.got) })}.`);
    else if (r.kind === 'color') relaxedTexts.push(`${say('alt_color', { wanted: wantedAr(r.wanted) })}.`);
  }

  // ---------- مقدمة حسب الحالة ----------
  const single = plan.people.flatMap((p) => p.picks).length === 1 && !(plan.missing || []).length;
  let intro;
  if (plan.altFor?.length) intro = say('intro_alt_look', { missing: joinAr(plan.altFor.map((k) => itemAr(K, k))), occasionFor });
  else if (plan.state === 'none') intro = say('intro_none');
  else if (plan.state === 'partial') intro = say(couple ? 'intro_partial_couple' : plan.context ? 'intro_partial' : 'intro_partial_item', { occasion, occasionFor, missing: joinAr((plan.missing || []).map((m) => `${itemAr(K, m.base)}${m.material ? ` ${K.synonyms.materials[m.material]?.[0] || m.material}` : ''}`)) });
  else if (plan.state === 'alternatives') intro = `${say('intro_alternatives')} ${relaxedTexts.join(' ')}`.trim();
  else if (plan.state === 'over_budget') intro = say(single ? 'over_budget_item' : 'over_budget', { total: nf(plan.total), budget: nf(plan.budget), over: nf(plan.over) });
  else intro = say(couple ? 'intro_full_couple' : plan.context ? 'intro_full' : 'intro_item', { occasion, occasionFor, palette: paletteAr });
  if (!paletteAr && L !== 'en') intro = intro.replace(/\s*[:،]?\s*(بألوان|ألوان)\s*(متناسقة مع بعض)?\s*(?=[.،])/g, '');
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
    } else if (Number(plan.total) > 0 && !plan.audienceOpen) parts.push(say(plan.people.flatMap((p) => p.picks).length === 1 ? 'total_line_item' : 'total_line', { total: nf(plan.total) }));
    if (plan.budget && plan.total <= plan.budget && Number(plan.total) > 0) {
      // لو في قطع ناقصة، "جوه الميزانية" مضللة: القطع الناقصة هتزود التكلفة.
      if (plan.state === 'partial' && (plan.missing || []).length) {
        if (plan.total >= plan.budget * 0.5) parts.push(say('partial_budget_warn', { total: nf(plan.total), budget: nf(plan.budget), left: nf(Math.max(0, plan.budget - plan.total)) }));
      } else parts.push(say('within_budget', { budget: nf(plan.budget) }));
    }
  } else if (plan.state === 'over_budget') {
    if (!single) parts.push(say('total_line', { total: nf(plan.total) }));
    parts.push(say(single ? 'over_hint_item' : 'over_hint'));
  }
  if (plan.dropped?.length) parts.push(say('dropped_optional', { dropped: joinAr([...new Set(plan.dropped)].map((k) => itemAr(K, k))) }));
  const swapped = plan.people.flatMap((p) => p.picks.filter((x) => x.relaxed === 'budget').map((x) => itemAr(K, x.slotKey)));
  if (swapped.length) parts.push(say('budget_swap', { slot: joinAr(swapped) }));
  // ملاحظة الكوتشي الرسمي بتظهر بس لو المناسبة نفسها رسمية (خطوبة/فرح/تخرج...). في الجامعة والخروجات الكوتشي طبيعي ومفيش داعي لتبرير.
  const dressyOccasion = !!plan.context && (K.contexts.get(plan.context)?.formality?.[0] || 0) >= 4;
  const formalSneaker = dressyOccasion && plan.people.some((pe) => pe.picks.some((pk) => pk.product?.minimalSneaker && (['formal_shoes', 'loafers'].includes(pk.slotKey) || pk.product?.key === 'sneakers')));
  // للست: «تحب أدورلك جزمة رسمية؟» كانت بتودّي لحذاء أوكسفورد رجالي → نسأل عن كعب أو فلات
  const sneakerForWoman = formalSneaker && plan.people.some((pe) => (pe.aud === 'women' || pe.aud === 'women_hijab' || pe.aud === 'girls') && pe.picks.some((pk) => pk.product?.minimalSneaker));
  if (formalSneaker) parts.push(say(sneakerForWoman && K.phrases?.[L]?.minimal_sneaker_note_women ? 'minimal_sneaker_note_women' : 'minimal_sneaker_note'));

  // ---------- جو ووقت ----------
  const tips = [];
  const styleTips = [];
  const adv = plan.weather;
  if (!condolence && adv && !adv.seasonOnly) {
    if (adv.fabrics_ar?.length) tips.push(say('weather_line', { temp: adv.temp, fabrics: joinAr(adv.fabrics_ar.slice(0, 2)) }));
    if ((adv.band === 'cool' || adv.band === 'cold') && plan.eventTime?.isNight) tips.push(say('weather_layer', { layers: adv.layers === 1 ? 'جاكيت أو شال خفيف' : 'جاكيت تقيل' }));
    if (adv.notes?.includes('rain')) tips.push(say('weather_rain'));
    if (adv.approximate && (plan.eventTime?.daysAhead || 0) > 0) tips.push(say('weather_approx'));
  }
  if (!condolence) {
    const harmony = (!condolence && plan.palette?.length && plan.state !== 'none')
      ? generateColorHarmonyInsight(plan.pickColors || plan.palette, plan.context, couple, plan.pickCount)
      : null;
    if (harmony) styleTips.push(harmony);
    const seen = new Set();
    for (const pe of plan.people) if (pe.look?.tip_ar && !seen.has(pe.look.tip_ar)) {
      seen.add(pe.look.tip_ar);
      const who = couple ? `${tabLabel(pe.aud, plan.persons, P)}: ` : '';
      styleTips.push(`${who}${pe.look.tip_ar}`);
    }
  }

  // ---------- بلوكات المنتجات ----------
  const tabs = plan.people.map((pe) => ({
    id: pe.aud, label: plan.audienceOpen ? (pe.aud === 'men' ? (L === 'en' ? 'Men' : 'رجالي') : (L === 'en' ? 'Women' : 'حريمي')) : tabLabel(pe.aud, plan.persons, { ...P }), look: pe.look?.name_ar || null,
    items: pe.picks.map((pk) => itemCard(K, pk)), subtotal: pe.subtotal,
    missing: pe.missing.map((m) => ({ key: m.base, material: m.material, label: m.title || itemAr(K, m.base), button: P.order_missing_button, hint: pick(P.order_missing_hint, `${seed}:hint`), payload: { type: 'request_item', key: m.base, material: m.material, color: m.color, audience: pe.aud } })),
  }));

  // نفس المنتج مايظهرش في أكتر من تاب (قطعة للجنسين)
  { const seenIds = new Set(); for (const t of tabs) { const before = t.items; t.items = t.items.filter((it) => (seenIds.has(it.id) ? false : (seenIds.add(it.id), true))); if (before.length && !t.items.length && !t.missing.length) t.missing = before.map((it) => ({ label: it.label || it.key, base: it.key, keys: [it.key].filter(Boolean), color: null, material: null })); /* التاب فضي بعد التكرار: نعرضه «مش متاح» بدل ما يختفي بصمت */ } for (let i = tabs.length - 1; i >= 0 && tabs.length > 1; i -= 1) if (!tabs[i].items.length && !tabs[i].missing.length) tabs.splice(i, 1); }
  // سبب كل قطعة: الحارس + الربط بالطقم بيتطبقوا بعد إزالة التكرار بين التابات، عشان السبب ما يشيرش لقطعة اتشالت
  for (const t of tabs) t.items = tieWhyToLook(K, t.items, L, (plan.parsed?.ownedPieces || []).map((o) => itemAr(K, o.key)), (plan.parsed?.ownedPieces || []).map((o) => o.key));
  const questions = condolence ? [] : (plan.ask || []).slice(0, 1).map((a) => fitRoleQ(buildQuestion(K, a, L), plan, L)).filter(Boolean);

  return {
    state: plan.state, intent: 'shop', say: dedupeSay(parts.filter(Boolean).join(' ')), tips: tips.slice(0, 2), styleTips: styleTips.slice(0, 2), questions,
    blocks: { tabs, total: plan.total, budget: plan.budget, over: plan.over, palette: (plan.palette || []).map((c) => ({ key: c, ar: colorAr(K, c) })), couple },
    missing: plan.missing || [], relaxed: plan.relaxed || [],
  };
}
