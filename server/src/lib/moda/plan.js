/**
 * مخطط تويلا: من الرسالة المفهومة (parse) + المنتجات المثرّاة + الوقت والجو → خطة لبس.
 * الكود هو اللي يقرر القطع من المخزون. مفيش موديل هنا.
 */
import { loadKnowledge } from './knowledge.js';

const WOMEN_KEYS = new Set(['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_bridal', 'dress_beach', 'jumpsuit', 'skirt', 'blouse', 'abaya', 'heels_low', 'heels_high', 'clutch', 'shawl', 'two_piece_set', 'womens_suit', 'hijab_set', 'tarha', 'long_cardigan', 'flats', 'tunic']);
const MEN_KEYS = new Set(['suit', 'tuxedo', 'tie', 'bow_tie', 'pocket_square', 'waistcoat', 'classic_set']);
const HERO_KEYS = new Set(['dress_party', 'dress_evening', 'dress_casual', 'dress_work', 'dress_bridal', 'jumpsuit', 'two_piece_set', 'womens_suit', 'suit', 'classic_set', 'tuxedo', 'abaya', 'hijab_set']);
const GUEST_CONTEXTS = new Set(['engagement_guest', 'wedding_guest', 'katb_kitab']);
const DRESSY_ACCESSORY = new Set(['tie', 'bow_tie', 'pocket_square']);
const FABRIC_KEYS = new Set(['tops', 'bottoms', 'dresses', 'suiting', 'modest']);
const LEISURE_CONTEXTS = new Set(['sahel_beach', 'sport', 'home', 'condolence', 'travel']);
// وصفات مرتبطة بمناسبة موسمية بعينها (عيد/إفطار): ماتتستلفش كبديل لمناسبة تانية (مثلاً الجامعة).
const EVENT_ONLY_CONTEXTS = new Set(['eid', 'ramadan_iftar']);
const AUD_WEIGHT = { men: 1, women: 1, women_hijab: 1, boys: 0.6, girls: 0.6 };

const genderOK = (aud, g) => {
  if (g === 'unisex') return true;
  if (aud === 'men') return g === 'men';
  if (aud === 'women' || aud === 'women_hijab') return g === 'women';
  if (aud === 'boys') return g === 'boys' || g === 'kids';
  if (aud === 'girls') return g === 'girls' || g === 'kids';
  return false;
};
const keyFits = (aud, key) => {
  if (WOMEN_KEYS.has(key)) return aud === 'women' || aud === 'women_hijab' || aud === 'girls';
  if (MEN_KEYS.has(key)) return aud === 'men' || aud === 'boys';
  return true;
};

/** يفك المفاتيح الافتراضية (dress_any / shoes_any) حسب الفئة والرسمية. */
function resolveKeys(keys, aud, fRange) {
  const out = [];
  const hi = fRange ? fRange[1] : 3; const lo = fRange ? fRange[0] : 2;
  for (const k of keys) {
    if (k === 'dress_any') out.push(...(hi >= 4 && lo >= 4 ? ['dress_party', 'dress_evening'] : hi >= 4 ? ['dress_party', 'dress_evening', 'dress_casual', 'dress_work'] : lo >= 3 ? ['dress_casual', 'dress_work', 'dress_party'] : ['dress_casual']));
    else if (k === 'shoes_any') {
      const dressy = hi >= 4; const smart = hi >= 3;
      if (aud === 'men' || aud === 'boys') out.push(...(dressy ? ['formal_shoes', 'loafers'] : smart ? ['loafers', 'formal_shoes', 'sneakers'] : ['sneakers', 'loafers']));
      else out.push(...(dressy ? ['heels_low', 'heels_high', 'flats'] : smart ? ['flats', 'heels_low', 'sandals'] : ['sneakers', 'flats', 'sandals']));
    } else out.push(k);
  }
  return [...new Set(out)];
}

const bandOf = (adv) => adv?.band || null;

/** بيبني قائمة slots لشخص. */
function slotsFor(aud, parsed, look, K, ctxF, adv) {
  const mine = parsed.garments.filter((g) => keyFits(aud, g.key));
  const multi = parsed.persons.length > 1;
  const explicit = multi ? mine.filter((g) => WOMEN_KEYS.has(g.key) || MEN_KEYS.has(g.key)) : mine;
  if (explicit.length) {
    return {
      mode: 'explicit',
      slots: explicit.map((g, i) => ({ keys: resolveKeys([g.key], aud, ctxF), base: g.key, required: true, share: Math.round(100 / explicit.length), color: g.color || null, material: g.material || null, explicit: true, hero: i === 0 })),
    };
  }
  if (!look) return { mode: 'none', slots: [] };
  const owned = new Set((parsed.ownedPieces || []).map((o) => o.key));
  const slots = [];
  look.slots.forEach(([keyStr, req, share], i) => {
    const keys = String(keyStr).split('|');
    if (keys.some((k) => owned.has(k))) return; // عنده القطعة دي
    slots.push({ keys: resolveKeys(keys, aud, [look.formality, look.formality]), base: keys[0], required: !!req, share, color: null, material: null, explicit: false, hero: i === 0 });
  });
  // طبقة إضافية لو الجو بارد
  const band = bandOf(adv);
  if ((band === 'cool' || band === 'cold') && look.formality >= 3) {
    const has = slots.some((s) => s.keys.some((k) => ['shawl', 'cardigan', 'blazer', 'jacket', 'coat', 'long_cardigan', 'suit', 'classic_set'].includes(k)));
    if (!has) {
      const keys = aud === 'men' ? ['blazer', 'jacket', 'coat'] : aud === 'women_hijab' ? ['long_cardigan', 'shawl', 'cardigan'] : aud === 'women' ? ['shawl', 'cardigan', 'blazer', 'jacket'] : ['cardigan', 'jacket'];
      slots.push({ keys, base: keys[0], required: true, share: 8, color: null, material: null, explicit: false, hero: false, weatherLayer: true });
    }
  }
  return { mode: 'look', slots };
}

/** ترتيب مستويات التخفيف لـ slot. */
function levelsFor(slot, K) {
  const subs = [];
  for (const k of slot.keys) for (const s of K.substitutes[k] || []) if (!slot.keys.includes(s) && !subs.includes(s)) subs.push(s);
  const lv = [{ keys: slot.keys, color: true, fd: 1, rel: null }];
  if (slot.color) lv.push({ keys: slot.keys, color: false, fd: 1, rel: 'color' });
  lv.push({ keys: slot.keys, color: false, fd: 2, rel: 'formality' });
  if (subs.length) {
    if (slot.color) lv.push({ keys: [...slot.keys, ...subs], color: true, fd: 2, rel: 'substitute' });
    lv.push({ keys: [...slot.keys, ...subs], color: false, fd: 2, rel: slot.color ? 'substitute+color' : 'substitute' });
  }
  return lv;
}

const primary = (p) => p.colorKeys?.[0] || null;

function scoreProduct(p, slot, ctx) {
  const { look, K, adv, fTarget, partnerHero, palette, taste, requestedColors, budgetCap, learnedPreferences } = ctx;
  let s = 10;
  if (fTarget && p.formality != null) s -= 3 * Math.abs(p.formality - fTarget);
  const cols = p.colorKeys || [];
  if (slot.color && cols.includes(slot.color)) s += 6;
  if (requestedColors.length && cols.some((c) => requestedColors.includes(c))) s += 3;
  if (look?.colors) { const idx = look.colors.findIndex((c) => cols.includes(c)); if (idx >= 0) s += 3 - idx * 0.5; }
  if (look?.avoid_colors && cols.some((c) => look.avoid_colors.includes(c))) s -= 6;
  if (palette.length && cols.some((c) => palette.includes(c))) s += 1.5;
  if (partnerHero && DRESSY_ACCESSORY.has(p.key) && cols.some((c) => partnerHero.includes(c))) s += 5;
  if (partnerHero && p.key === 'pocket_square' && cols.some((c) => partnerHero.includes(c))) s += 2;
  if (taste.length && look?.taste?.some((t) => taste.includes(t))) s += 1;
  if (learnedPreferences?.liked.has(String(p.id))) s += 2;
  if (learnedPreferences?.disliked.has(String(p.id))) s -= 2;
  s += Math.min(2.5, p.popularity || 0);
  { const ki = slot.keys.indexOf(p.key); if (ki > 0) s -= ki * 1.5; else if (ki < 0) s -= 4; }
  // الجو
  const item = K.items.get(p.key); const band = adv?.band;
  if (item && FABRIC_KEYS.has(item.family)) {
    const m = p.materials || new Set();
    if (band === 'hot' || band === 'warm') { if (m.has('wool')) s -= 4; if (m.has('velvet')) s -= 4; if (m.has('linen')) s += 1.5; if (m.has('cotton')) s += 1; if (m.has('chiffon')) s += 1; }
    if (band === 'cool' || band === 'cold') { if (m.has('linen')) s -= 2; if (m.has('chiffon')) s -= 1; if (m.has('wool')) s += 1.5; if (m.has('velvet')) s += 1.5; }
  }
  // سعر: العقاب على الغلاء النسبي لحصة الـslot
  if (budgetCap && p.price > budgetCap) s -= Math.min(6, (p.price / budgetCap - 1) * 6);
  return s;
}

const CASUAL_ONLY = new Set(['sneakers', 'sport_shoes', 'slippers']);

/** يجيب المرشحين لـ slot عند مستوى تخفيف معين. */
function candidatesAt(slot, lvl, aud, products, ctx) {
  const { K, fTargetRange, role, context, userAvoid, lookAvoidHard } = ctx;
  const keys = new Set(lvl.keys);
  const out = [];
  for (const p of products) {
    if (!p.key || !keys.has(p.key)) continue;
    if (!p.inStock) continue;
    // مناسبة رسمية (خطوبة/فرح…): الكوتشي والجزم الرياضي والشبشب مش بدائل مقبولة إلا لو العميل طلبها بنفسه
    if (CASUAL_ONLY.has(p.key) && fTargetRange && fTargetRange[0] >= 4 && !slot.keys.includes(p.key) && !p.minimalSneaker) continue;
    if (p.key === 'jalabiya' && !slot.explicit) continue;
    if (!genderOK(aud, p.gender)) continue;
    if (aud === 'women_hijab' && p.sleeveless) continue;
    const cols = p.colorKeys || [];
    if (userAvoid.length && cols.length && cols.every((c) => userAvoid.includes(c))) continue;
    if (slot.material && !p.materials?.has(slot.material)) continue;
    if (slot.color && lvl.color && !cols.includes(slot.color)) continue;
    const hero = HERO_KEYS.has(p.key);
    if (hero && role === 'guest' && GUEST_CONTEXTS.has(context) && cols.length && K.nearWhite.has(cols[0])) continue;
    if (lookAvoidHard && cols.some((c) => lookAvoidHard.includes(c))) continue;
    if (fTargetRange && p.formality != null) {
      const [lo, hi] = fTargetRange; const d = p.formality < lo ? lo - p.formality : p.formality > hi ? p.formality - hi : 0;
      if (d > (p.minimalSneaker ? Math.max(lvl.fd, 3) : lvl.fd)) continue;
    }
    out.push(p);
  }
  return out;
}

/** يملا look (أو وضع صريح) لشخص ويرجع picks + missing + relaxed + score. */
function fillPerson(aud, parsed, look, products, K, env, personBudget, partnerHero) {
  const { adv, role, context, userAvoid } = env;
  const ctxRange = K.contexts.get(context)?.formality || null;
  const built = slotsFor(aud, parsed, look, K, ctxRange, adv);
  const fRangeLook = look && built.mode === 'look' ? [look.formality, look.formality] : ctxRange;
  const taste = [...(parsed.taste || []), ...(env.profileTaste || [])];
  const lookAvoidHard = context === 'condolence' && look?.avoid_colors ? look.avoid_colors : null;
  const picks = []; const missing = []; const relaxed = [];
  let palette = [];
  const ordered = [...built.slots].sort((a, b) => Number(b.hero) - Number(a.hero));
  let scoreSum = 0; let maxLevel = 0;
  for (const slot of ordered) {
    const levels = levelsFor(slot, K);
    let chosen = null;
    for (let li = 0; li < levels.length; li += 1) {
      const lvl = levels[li];
      const fR = slot.hero || built.mode === 'look' ? fRangeLook : fRangeLook;
      const list = candidatesAt(slot, lvl, aud, products, { K, fTargetRange: built.mode === 'explicit' && !ctxRange ? null : fR, role, context, userAvoid, lookAvoidHard });
      if (!list.length) continue;
      const cap = personBudget ? (personBudget * slot.share) / 100 * 1.3 : null;
      const sctx = { look: built.mode === 'look' ? look : null, K, adv, fTarget: fR ? (fR[0] + fR[1]) / 2 : null, partnerHero, palette, taste, requestedColors: parsed.colors || [], budgetCap: cap, learnedPreferences: env.learnedPreferences };
      const ranked = list.map((p) => ({ p, s: scoreProduct(p, slot, sctx) })).sort((a, b) => (parsed.flags?.cheapest ? a.p.price - b.p.price || b.s - a.s : b.s - a.s || a.p.price - b.p.price));
      chosen = { lvl, li, ranked };
      break;
    }
    if (!chosen) {
      if (slot.required) missing.push({ keys: slot.keys, base: slot.base, material: slot.material, color: slot.color, label: slot.material ? `${slot.material}_${slot.base}` : slot.base });
      continue;
    }
    const cap = personBudget ? (personBudget * slot.share) / 100 * 1.3 : null;
    let idx = 0;
    if (cap) { const within = chosen.ranked.findIndex((r) => r.p.price <= cap); if (within >= 0) idx = within; else idx = chosen.ranked.reduce((bi, r, i, a) => (r.p.price < a[bi].p.price ? i : bi), 0); }
    const top = chosen.ranked[idx];
    const visible = slot.explicit || slot.hero;
    if (chosen.lvl.rel && visible) relaxed.push({ slot: slot.base, kind: chosen.lvl.rel, wanted: slot.color ? `${slot.color} ${slot.base}` : slot.base, got: top.p.key });
    // مجموعة بدائل أرخص للميزانية (بدائل من نفس الاستخدام بنفس الرسمية ±1)
    const subs = []; for (const k of slot.keys) for (const x of K.substitutes[k] || []) if (!slot.keys.includes(x) && !subs.includes(x)) subs.push(x);
    let pool = [];
    if (subs.length) {
      const pl = candidatesAt(slot, { keys: [...slot.keys, ...subs], color: false, fd: 1, rel: null }, aud, products, { K, fTargetRange: built.mode === 'explicit' && !ctxRange ? null : fRangeLook, role, context, userAvoid, lookAvoidHard });
      const sctx2 = { look: built.mode === 'look' ? look : null, K, adv, fTarget: fRangeLook ? (fRangeLook[0] + fRangeLook[1]) / 2 : null, partnerHero, palette, taste, requestedColors: parsed.colors || [], budgetCap: null, learnedPreferences: env.learnedPreferences };
      pool = pl.filter((x) => !chosen.ranked.some((r) => r.p.id === x.id)).map((x) => ({ p: x, s: scoreProduct(x, slot, sctx2) - 3, viaPool: true }));
    }
    maxLevel = Math.max(maxLevel, chosen.li);
    scoreSum += top.s;
    const c0 = primary(top.p); if (c0 && slot.hero && !palette.includes(c0)) palette = [c0, ...palette]; else if (c0 && palette.length < 3 && !palette.includes(c0)) palette.push(c0);
    picks.push({ slot, product: top.p, ranked: chosen.ranked, pool, relaxedKind: visible ? chosen.lvl.rel : null });
  }
  // الاختياري ما يبقاش أغلى من 20% من إجمالي المطلوب
  const reqTotal = picks.filter((p) => p.slot.required).reduce((t, p) => t + p.product.price, 0);
  for (const pk of [...picks]) {
    if (pk.slot.required || !reqTotal) continue;
    const lim = reqTotal * 0.2;
    if (pk.product.price <= lim) continue;
    const alt = pk.ranked.filter((r) => r.p.price <= lim)[0];
    if (alt) pk.product = alt.p; else picks.splice(picks.indexOf(pk), 1);
  }
  // رتّب picks بترتيب الـslots الأصلي
  picks.sort((a, b) => built.slots.indexOf(a.slot) - built.slots.indexOf(b.slot));
  return { aud, mode: built.mode, look, picks, missing, relaxed, score: scoreSum, maxLevel, slotsCount: built.slots.length, palette };
}

function lookCandidates(aud, context, K, parsed, role) {
  const taste = parsed.taste || [];
  const owned = new Set((parsed.ownedPieces || []).map((piece) => piece.key));
  return K.outfits.looks.filter((l) => l.status !== 'draft' && l.audience.includes(aud) && l.contexts.includes(context)
    && (l.id !== 'm_owned_blazer' || owned.has('blazer')))
    .map((l) => ({ look: l, t: l.taste?.filter((x) => taste.includes(x)).length || 0 }));
}

/** سياق افتراضي لما العميل يطلب قطعة من غير مناسبة ومعاه قطع مملوكة (صورة). */
function lookForOwned(aud, parsed, K) {
  const owned = (parsed.ownedPieces || []).map((o) => o.key);
  if (!owned.length) return [];
  return K.outfits.looks.filter((l) => l.status !== 'draft' && l.audience.includes(aud) && l.slots.some(([k]) => String(k).split('|').some((x) => owned.includes(x)))).sort((a, b) => b.formality - a.formality).map((l) => ({ look: l, t: 0 }));
}

const rankFill = (f, tgt = null) => [f.missing.length, f.maxLevel, f.look && tgt != null ? Math.round(Math.abs(f.look.formality - tgt) * 2) : 0, -f.slotsCount, -f.score];
const cmp = (a, b) => { for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

const sumPicks = (picks) => picks.reduce((t, p) => t + p.product.price, 0);

/** ضبط الميزانية: نشيل الاختياري، وبعدين ننزّل لأرخص بديل. */
function fitBudget(fills, budget) {
  const all = () => fills.flatMap((f) => f.picks);
  let total = all().reduce((t, p) => t + p.product.price, 0);
  const dropped = [];
  if (!budget || total <= budget) return { total, dropped, over: 0 };
  // 1) اختياري
  while (total > budget) {
    let best = null;
    for (const f of fills) for (const p of f.picks) if (!p.slot.required && (!best || p.slot.share < best.p.slot.share || (p.slot.share === best.p.slot.share && p.product.price > best.p.product.price))) best = { f, p };
    if (!best) break;
    best.f.picks.splice(best.f.picks.indexOf(best.p), 1); dropped.push(best.p.slot.base); total -= best.p.product.price;
  }
  // 2) تنزيل
  let guard = 120; let heroOk = false;
  while (total > budget && guard-- > 0) {
    let best = null;
    for (const f of fills) for (const p of f.picks) {
      if (p.slot.hero && !heroOk) continue;
      const cheaper = [...p.ranked, ...(p.pool || [])].filter((r) => r.p.price < p.product.price).sort((a, b) => b.s - a.s)[0];
      if (!cheaper) continue;
      const saving = p.product.price - cheaper.p.price; const lossOf = ([...p.ranked, ...(p.pool || [])].find((r) => r.p.id === p.product.id)?.s ?? 0) - cheaper.s;
      const eff = saving / (1 + Math.max(0, lossOf));
      if (!best || eff > best.eff) best = { p, cheaper, saving, eff };
    }
    if (!best) { if (!heroOk) { heroOk = true; continue; } break; }
    best.p.product = best.cheaper.p; total -= best.saving;
    if (best.cheaper.viaPool && !best.p.relaxedKind) best.p.relaxedKind = 'budget';
  }
  total = all().reduce((t, p) => t + p.product.price, 0);
  return { total, dropped, over: Math.max(0, total - budget) };
}

/**
 * الخطة الكاملة.
 * env: { adv (weatherAdvice), eventTime, profile }
 */
export function planOutfit(parsed, products, env = {}) {
  const K = env.K || loadKnowledge();
  const adv = env.adv || null; const profile = env.profile || {};
  const budget = parsed.budget?.value || null;
  if (parsed.intent && parsed.intent !== 'shop') return { parsed, state: 'chat', intent: parsed.intent, persons: [], people: [], ask: [] };
  const asks = [];
  const base = { parsed, weather: adv, eventTime: env.eventTime || null };

  // ---- أسئلة لازم تتسأل قبل أي ترشيح ----
  let persons = [...parsed.persons];
  if (!persons.length) {
    if (parsed.genderHint === 'female') persons = ['women']; else if (parsed.genderHint === 'male') persons = ['men'];
    else if (profile.audience) persons = [profile.audience];
  }
  if (!persons.length) return { ...base, state: 'clarify', ask: ['audience', ...(parsed.context || parsed.garments.length || (parsed.ownedPieces || []).length ? [] : ['occasion'])], persons: [] };
  const context = parsed.contextEffective || null; const role = parsed.role || 'guest';
  const hasGarments = parsed.garments.length > 0; const hasOwned = (parsed.ownedPieces || []).length > 0;
  if (!context && !hasGarments && !hasOwned) return { ...base, state: 'clarify', ask: ['occasion'], persons };
  if (!context && parsed.garments.length && parsed.garments.every((g) => g.key === 'dress_any')) return { ...base, state: 'clarify', ask: ['dress_kind'], persons };

  const userAvoid = [...(parsed.avoidColors || []), ...(profile.avoidColors || [])];
  const productIds = (value) => new Set(String(value || '').split(',').filter((id) => /^\d{1,15}$/.test(id)));
  const learnedPreferences = { liked: productIds(profile.likedProductIds), disliked: productIds(profile.dislikedProductIds) };
  const envC = { adv, role, context, userAvoid, profileTaste: profile.taste || [], learnedPreferences };
  const wsum = persons.reduce((t, a) => t + (AUD_WEIGHT[a] || 1), 0);
  const pBudget = (a) => (budget ? (budget * (AUD_WEIGHT[a] || 1)) / wsum : null);

  const cr = K.contexts.get(context)?.formality || null;
  const tgt = cr ? (env.eventTime?.isNight && cr[1] >= 4 ? cr[1] : (cr[0] + cr[1]) / 2) : null;
  // ---- اختيار look لكل شخص (أفضل 3 مرشحين) ثم أفضل توليفة ----
  const perPerson = persons.map((aud) => {
    const hasExplicit = parsed.garments.some((g) => keyFits(aud, g.key)) && !(persons.length > 1 && !parsed.garments.some((g) => keyFits(aud, g.key) && (WOMEN_KEYS.has(g.key) || MEN_KEYS.has(g.key))));
    let cands = context ? lookCandidates(aud, context, K, parsed, role) : lookForOwned(aud, parsed, K);
    // No approved look for this occasion: borrow one only if it is about as formal AND not a leisure-only look
    // (a beach outfit must never answer a work request). Otherwise say so honestly (state 'no_look') instead of guessing.
    if (!cands.length && context && !hasExplicit) {
      const [lo, hi] = cr || [2, 4]; const mid = (lo + hi) / 2;
      cands = K.outfits.looks
        .filter((l) => l.status !== 'draft' && l.audience.includes(aud) && Math.abs(l.formality - mid) <= 1 && (LEISURE_CONTEXTS.has(context) || !l.contexts.every((c) => LEISURE_CONTEXTS.has(c))) && (EVENT_ONLY_CONTEXTS.has(context) || !l.contexts.every((c) => EVENT_ONLY_CONTEXTS.has(c))))
        .map((l) => ({ look: l, t: 0 })).sort((a, b) => Math.abs(a.look.formality - mid) - Math.abs(b.look.formality - mid));
    }
    if (hasExplicit || !cands.length) return [fillPerson(aud, parsed, null, products, K, envC, pBudget(aud), null)];
    const fills = cands.map((c) => ({ ...fillPerson(aud, parsed, c.look, products, K, envC, pBudget(aud), null), t: c.t }));
    fills.sort((a, b) => cmp([...rankFill(a, tgt), -a.t], [...rankFill(b, tgt), -b.t]));
    return fills.slice(0, 3);
  });

  const pairs = K.outfits.couple_pairs?.pairs || []; const gapMax = K.outfits.couple_pairs?.formality_gap_max ?? 1;
  const combos = perPerson.reduce((acc, list) => acc.flatMap((c) => list.map((f) => [...c, f])), [[]]);
  const comboScore = (c) => {
    let sc = c.reduce((t, f) => t + f.missing.length * 1000 + f.maxLevel * 100 + (f.look && tgt != null ? Math.abs(f.look.formality - tgt) * 10 : 0) - f.slotsCount * 3 - f.score * 0.01, 0);
    const him = c.find((f) => f.aud === 'men' && f.look); const her = c.find((f) => (f.aud === 'women' || f.aud === 'women_hijab') && f.look);
    if (him && her) {
      if (pairs.some((p) => p.men === him.look.id && p.women.includes(her.look.id))) sc -= 20;
      if (Math.abs(him.look.formality - her.look.formality) > gapMax) sc += 30;
    }
    return sc;
  };
  combos.sort((a, b) => comboScore(a) - comboScore(b));

  const finalize = (combo) => {
    let fl = combo;
    // مرور ثاني: تنسيق الكرافتة/المنديل مع لون فستانها
    const herF = fl.find((f) => f.aud === 'women' || f.aud === 'women_hijab');
    const herHero = herF?.picks[0]?.product?.colorKeys?.slice(0, 2);
    if (herHero?.length) fl = fl.map((f) => ((f.aud === 'men' && f.look) ? { ...fillPerson('men', parsed, f.look, products, K, envC, pBudget('men'), herHero), t: f.t } : f));
    fl = fl.map((f) => ({ ...f, picks: f.picks.map((p) => ({ ...p })) }));
    const fit = fitBudget(fl, budget);
    const heroSwapped = fl.some((f) => f.picks.some((p) => p.slot.hero && p.relaxedKind === 'budget'));
    return { fills: fl, fit, heroSwapped };
  };
  let best = null;
  for (const combo of combos.slice(0, 6)) {
    const r = finalize(combo);
    const bad = (r.fit.over > 0 ? 2 : 0) + (r.heroSwapped ? 1 : 0);
    if (!best || bad < best.bad || (bad === best.bad && bad > 0 && r.fit.over < best.r.fit.over)) best = { r, bad };
    if (bad === 0) break;
  }
  const fills = best.r.fills; const { total, dropped, over } = best.r.fit;

  // ---- الحالة ----
  const anyPicks = fills.some((f) => f.picks.length);
  const missing = fills.flatMap((f) => f.missing.map((m) => ({ ...m, aud: f.aud })));
  const relaxed = fills.flatMap((f) => f.relaxed.map((r) => ({ ...r, aud: f.aud })));
  let state;
  if (!anyPicks && context && !hasGarments && fills.every((f) => f.mode === 'none')) state = 'no_look';
  else if (!anyPicks) state = 'none';
  else if (budget && over > 0) state = 'over_budget';
  else if (missing.length) state = 'partial';
  else if (relaxed.length) state = 'alternatives';
  else state = 'full';

  const slotTotal = fills.reduce((t, f) => t + f.slotsCount, 0);
  // Gather every recommendation-critical detail in the same clarification turn.
  // Twila must not reveal a provisional look between these answers.
  if (!budget && !parsed.flags?.budgetFlexible && (persons.length > 1 || slotTotal > 2) && state !== 'none' && state !== 'no_look') asks.push('budget');
  if (context && !parsed.daypart && (K.contexts.get(context)?.formality?.[1] || 0) >= 4 && state !== 'none' && state !== 'no_look') asks.push('time_if_dressy');
  if (parsed.garments.length === 1 && !parsed.garments[0].color && !parsed.colors?.length && !parsed.flags?.colorFlexible && !parsed.flags?.cheapest && state !== 'none' && state !== 'no_look') asks.push('color_preference');

  const palette = [];
  for (const f of fills) for (const p of f.picks) { const c = primary(p.product); if (c && !palette.includes(c) && !['black', 'white'].includes(c) || (c && palette.length < 1 && !palette.includes(c))) palette.push(c); }

  return {
    ...base, state, persons, context, role, budget, total, over, dropped, missing, relaxed, ask: asks, palette: palette.slice(0, 3),
    people: fills.map((f) => ({
      aud: f.aud, mode: f.mode, look: f.look ? { id: f.look.id, name_ar: f.look.name_ar, tip_ar: f.look.tip_ar, formality: f.look.formality } : null,
      picks: f.picks.map((p) => ({ slotKey: p.slot.base, optional: !p.slot.required, hero: p.slot.hero, product: p.product, relaxed: p.relaxedKind })),
      missing: f.missing, subtotal: sumPicks(f.picks),
    })),
    tone: context === 'condolence' ? 'sober' : 'normal',
  };
}
