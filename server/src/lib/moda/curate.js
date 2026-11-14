/**
 * "منسّق تويلا" (Gemini/Claude): الموديل هو اللي بيرشّح الطقم، بس من منتجاتنا الحقيقية الأول.
 * - بنديله قايمة منتجات حقيقية (id + نوع + لون + سعر + رسمية) مفلترة على الفئة والمناسبة.
 * - لو قطعة مش لاقيلها حاجة مناسبة في القايمة، بيقترحها "من بره" (productId=null + وصف قصير)
 *   وبتتحول لزرار "اطلبه" عشان Twist تجيبها وتبلّغ العميل.
 * - الموديل ما بيكتبش أسعار ولا بيخترع منتجات: كل id بيتفحص إنه من القايمة، والأسعار والإجمالي من قاعدة البيانات،
 *   ولو الطقم عدّى الميزانية أو طلع غلط بنرجع لترشيح القواعد (plan الأصلي).
 */
import { checkText } from './guard.js';

const AUD_OK = {
  men: (g) => g === 'men' || g === 'unisex',
  boys: (g) => g === 'boys' || g === 'kids' || g === 'unisex',
  girls: (g) => g === 'girls' || g === 'kids' || g === 'unisex',
  women: (g) => g === 'women' || g === 'unisex',
  women_hijab: (g) => g === 'women' || g === 'unisex',
};
const itemAr = (K, key) => String(K.items.get(key)?.ar || key).replace(/\s*\(.*?\)\s*/g, '').split(' / ')[0].trim();
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').replace(/[*#`<>]/g, '').trim().slice(0, max);
const PRICE_RE = /(\d[\d,.]*)\s*(جنيه|جنية|ج\.?م|EGP|LE|pounds?)/i;

/** القطع اللي العميل قال إنها معاه («معايا كوتشي أبيض»): بنبني الطقم حواليها ومنقترحش نوع منها تاني، إلا لو طلب صراحةً قطعة منه. */
const OWNED_GROUP = { sneakers: ['sneakers', 'sport_shoes'], sport_shoes: ['sneakers', 'sport_shoes'], dress_any: ['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_beach'], shoes_any: ['shoes_any', 'sneakers', 'sport_shoes', 'formal_shoes', 'loafers', 'flats', 'heels_low', 'heels_high', 'sandals', 'boots'], slippers: ['slippers', 'sneakers', 'sport_shoes', 'formal_shoes', 'loafers', 'flats', 'heels_low', 'heels_high', 'sandals', 'boots'] };
export function ownedKeysOf(parsed) {
  const asked = new Set((parsed?.garments || []).map((g) => g.key));
  const out = new Set();
  for (const o of parsed?.ownedPieces || []) for (const k of OWNED_GROUP[o.key] || [o.key]) if (!asked.has(k)) out.add(k);
  return out;
}
const safeWhy = (v) => { const t = clean(v, 140); return t && !/https?:\/\/|www\./i.test(t) && !PRICE_RE.test(t) && checkText(t, { lang: 'ar', maxLen: 160 }).ok ? t : null; };

/** قايمة المنتجات المتاحة لكل فئة، مفلترة على رسمية المناسبة، ومنوّعة (حد أقصى لكل نوع). */
export function candidatePool(rows, aud, K, { context = null, max = 48, perKey = 5 } = {}) {
  const ok = AUD_OK[aud] || (() => true);
  const fr = context ? K.contexts.get(context)?.formality : null;
  const lo = fr ? fr[0] - 1 : 0; const hi = fr ? fr[1] + 1 : 9;
  const byKey = new Map();
  for (const p of rows || []) {
    if (!p.key || p.inStock === false || p.typeConflict || !(p.price > 0) || !ok(p.gender)) continue;
    const item = K.items.get(p.key); if (!item || item.virtual || item.family === 'underwear_sleep' || p.key === 'cufflinks') continue;
    if (p.formality != null && (p.formality < lo || p.formality > hi)) continue;
    if (fr && fr[0] >= 4 && ['sneakers', 'sport_shoes', 'slippers'].includes(p.key) && !(p.minimalSneaker && fr[1] < 5)) continue; // رسمي: كوتشي ساده أبيض/أسود بس
    if (!byKey.has(p.key)) byKey.set(p.key, []);
    byKey.get(p.key).push(p);
  }
  const out = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0) || a.price - b.price);
    out.push(...list.slice(0, perKey));
  }
  return out.sort((a, b) => a.key.localeCompare(b.key)).slice(0, max);
}

const line = (p, K) => `${p.id} | ${p.key} (${itemAr(K, p.key)}) | ${clean(p.name_ar || p.name_en, 60)} | ${(p.colorKeys || []).slice(0, 2).join('/') || '-'} | ${Math.round(p.price)} | f${p.formality ?? '?'}`;

export function curatorPrompt({ K, pools, persons, context, budget, adv, eventTime, parsed, baseline, lang = 'ar', assistantName = 'تويلا', level = 0, hintMax = 900, ruleChars = 3200 }) {
  const weather = adv ? `~${adv.temp}°C${adv.fabrics_ar?.length ? `, suited fabrics: ${adv.fabrics_ar.slice(0, 3).join(', ')}` : ''}${adv.notes?.includes('rain') ? ', rain expected' : ''}` : 'unknown';
  const formality = context ? K.contexts.get(context)?.formality : null;
  const asked = (parsed.garments || []).map((g) => `${g.key}${g.color ? `(${g.color})` : ''}`).join(', ');
  return [
    `You are ${assistantName} (تويلا), the expert fashion stylist of "Twist", an online marketplace of local clothing stores in Banha, Egypt. You are curating a complete outfit for each person from the REAL stock lists below.`,
    'Style knowledge: match the dress code of the occasion, keep the colours coherent (a small palette, partners may echo each other), respect the weather, make every look complete (e.g. suit/shirt/shoes, or dress/shoes/bag), and never pick sporty or casual pieces (hoodies, shorts, sport shoes) for a formal occasion. The only exception: plain minimalist white or black leather sneakers may go with a classic suit/blazer look at an engagement or wedding guest event, and only when no formal shoe/loafer fits; they are listed in stock only if allowed. Judge each item by its real name and type, not only its label.',
    `Occasion: ${context || 'not specified'}${formality ? ` (formality ${formality[0]}-${formality[1]} out of 5)` : ''}. Time: ${eventTime?.isNight ? 'evening/night' : 'daytime'}. Weather: ${weather}.`,
    budget ? `Total budget for everyone together: ${budget} EGP. The sum of the prices of the chosen products MUST NOT exceed it; split it sensibly between people. If a complete look cannot fit, choose fewer/cheaper pieces and say so in the note.` : 'No budget limit was given.',
    asked ? `The customer explicitly asked for: ${asked}.` : '',
    (parsed.ownedPieces || []).length ? `The customer ALREADY OWNS: ${parsed.ownedPieces.map((o) => `${o.key}${o.color ? ` (${o.color})` : ''}`).join(', ')}. Build the look AROUND it: pick pieces that go with it (colour, formality, season), do NOT choose another product of that type unless they asked for one, and say in the note how the piece they own fits.` : '',
    ...persons.map((a) => `STOCK for "${a}" (id | type (arabic) | name | colours | price EGP | formality):\n${pools[a].length ? pools[a].map((p) => line(p, K)).join('\n') : '(nothing in stock for this person)'}`),
    (K.kb?.guideFor ? K.kb.guideFor(level, { maxRuleChars: ruleChars, focus: [context, ...(parsed.garments || []).map((g) => g.key), ...(parsed.ownedPieces || []).map((o) => o.key)] }) : K.kb?.guide) || '',
    K.kb?.pairingHint ? (() => { const h = K.kb.pairingHint([...(parsed.garments || []).map((g) => g.key), ...(parsed.ownedPieces || []).map((o) => o.key)], { maxPer: hintMax }); return h ? `Knowledge base pairing for the pieces in this request:\n${h}` : ''; })() : '',
    baseline && level < 2 ? `The rule-based system suggested this baseline (you may improve or replace it): ${JSON.stringify(baseline)}` : '',
    'HARD RULES: (1) choose productId ONLY from the stock lists above for that same person, copied exactly. (2) Choose from our stock first. (3) If an essential piece has no suitable product in stock, DO NOT force a bad one: output it with productId null and a short Arabic "title" describing the piece to source from outside (e.g. "بدلة كحلي سليم فيت", with colour/style, no brand, no price) — Twist will offer to source it. (4) Never invent stock, brands, stores or prices; never write numbers or prices in any text field. (5) "type" must be one of the type keys shown in the lists (for outside pieces use a sensible type key such as suit, shirt, dress_party, heels_low, formal_shoes, loafers, blazer, trousers...).',
    `Reply with ONE JSON object only, no prose around it. Text fields in ${lang === 'en' ? 'English' : 'friendly Egyptian Arabic'}:`,
    '{"people":[{"aud":"men","note":"one short styling tip for this person","items":[{"type":"suit","productId":123,"why":"one short sentence: why it suits + how it goes with another piece of this outfit"},{"type":"shirt","productId":null,"title":"قميص أبيض كلاسيك"}]}]}',
  ].filter(Boolean).join('\n');
}

/** يفحص رد الموديل ويبني plan بنفس شكل planOutfit. يرجّع null لو غير سليم. */
export function buildCuratedPlan(out, { plan, pools, persons, budget, K, owned = new Set() }) {
  if (!out || !Array.isArray(out.people)) return null;
  const people = []; const missing = []; let total = 0;
  for (const aud of persons) {
    const entry = out.people.find((x) => x?.aud === aud);
    if (!entry || !Array.isArray(entry.items) || !entry.items.length) return null;
    const pool = new Map(pools[aud].map((p) => [String(p.id), p]));
    const picks = []; const miss = []; const seen = new Set();
    for (const it of entry.items.slice(0, 7)) {
      const type = typeof it?.type === 'string' && K.items.has(it.type) ? it.type : null;
      const prod = it?.productId != null ? pool.get(String(it.productId)) : null;
      if (it?.productId != null && !prod) return null; // id مخترع أو من فئة تانية
      if ((prod && owned.has(prod.key)) || (!prod && type && owned.has(type))) continue; // العميل عنده النوع ده: منكرروش
      if (prod) {
        if (seen.has(prod.id) || seen.has(`k:${prod.key}`)) continue; seen.add(prod.id); seen.add(`k:${prod.key}`); // منتج واحد لكل نوع (مفيش كوتشيين في طقم واحد)
        picks.push({ slotKey: prod.key, optional: false, hero: picks.length === 0, product: prod, relaxed: null, why: safeWhy(it.why) });
        total += prod.price;
      } else if (type) {
        let title = clean(it.title, 60);
        if (!title || PRICE_RE.test(title) || !checkText(title, { lang: 'ar', maxLen: 80 }).ok) title = itemAr(K, type);
        miss.push({ keys: [type], base: type, material: null, color: null, label: type, title, aud });
      }
    }
    if (!picks.length && !miss.length) return null;
    const note = clean(entry.note, 220);
    const noteOk = note && !/https?:\/\/|www\./i.test(note) && !/\d\s*(جنيه|ج\.?م|EGP)/i.test(note) && checkText(note, { lang: 'ar', maxLen: 260 }).ok;
    people.push({
      aud, mode: 'look',
      look: noteOk ? { id: 'curated', name_ar: null, tip_ar: note, formality: null } : null,
      picks, missing: miss, subtotal: picks.reduce((t, p) => t + p.product.price, 0),
    });
    missing.push(...miss);
  }
  if (!people.some((p) => p.picks.length)) return null;
  if (budget && total > budget) return null; // نرجع لترشيح القواعد اللي بيحترم الميزانية
  const state = missing.length ? 'partial' : 'full';
  const palette = []; for (const pe of people) for (const pk of pe.picks) { const c = pk.product.colorKeys?.[0]; if (c && !palette.includes(c)) palette.push(c); }
  return { ...plan, state, people, missing, relaxed: [], dropped: [], total, over: 0, ask: plan.ask || [], palette: palette.slice(0, 3), curated: true, tone: plan.tone };
}

/** حدّ حجم الـ prompt بالتوكن (تقديري): مزوّدين زي Groq المجاني حدّهم ~8k توكن/دقيقة شامل الرد. بنضغط تدريجيًا (من الأقل أهمية للطلب) بس لما الطلب كبير. CURATOR_PROMPT_TOKENS لتغييره. */
export const CURATOR_TOKEN_BUDGET = () => Math.max(2500, Number(process.env.CURATOR_PROMPT_TOKENS) || 4500);
export const estTokens = (str) => Math.ceil([...String(str)].reduce((n, c) => n + (/[\u0600-\u06FF]/.test(c) ? 0.45 : 0.26), 0)); // تقدير متحفظ: العربي ~2.2 حرف/توكن، اللاتيني ~4
const TIERS = [
  { level: 0, perKey: 5, max: 48, hintMax: 900, ruleChars: 3200 },
  { level: 1, perKey: 4, max: 36, hintMax: 600, ruleChars: 3200 },
  { level: 1, perKey: 3, max: 24, hintMax: 450, ruleChars: 3200 }, // درجة وسطية: القواعد كاملة، والقوايم أصغر
  { level: 2, perKey: 3, max: 24, hintMax: 400, ruleChars: 3200 },
  { level: 2, perKey: 2, max: 16, hintMax: 250, ruleChars: 2200 },
];
/** يبني الـ prompt + قوايم المنتجات (نفسها اللي بيتحقق منها الكود) بأقل ضغط يدخل في الحد. */
export function buildCuratorRequest({ K, rows, persons, plan, parsed, adv, eventTime, lang, assistantName, baseline, tokenBudget = CURATOR_TOKEN_BUDGET() }) {
  let last = null;
  for (const t of TIERS) {
    const pools = Object.fromEntries(persons.map((a) => [a, candidatePool(rows, a, K, { context: plan.context, max: t.max, perKey: t.perKey })]));
    if (!persons.some((a) => pools[a].length)) return null;
    const system = curatorPrompt({ K, pools, persons, context: plan.context, budget: plan.budget || null, adv, eventTime, parsed, baseline, lang, assistantName, level: t.level, hintMax: t.hintMax, ruleChars: t.ruleChars });
    last = { system, pools, tier: TIERS.indexOf(t), tokens: estTokens(system) };
    if (last.tokens <= tokenBudget) return last;
  }
  return last;
}

/** callFn(system, messages) → string|object. بيرجّع async ({plan, rows, parsed, adv, eventTime, K, lang, assistantName}) => plan|null */
export function makeCurator(callFn, { timeoutMs = 16000 } = {}) {
  return async ({ plan, rows, parsed, adv, eventTime, K, lang = 'ar', assistantName = 'تويلا' }) => {
    const persons = plan.persons || [];
    if (!persons.length || !plan.context && !(parsed.garments || []).length) return null;
    const baseline = (plan.people || []).map((pe) => ({ aud: pe.aud, items: pe.picks.map((p) => ({ type: p.slotKey, productId: p.product.id })) }));
    const req = buildCuratorRequest({ K, rows, persons, plan, parsed, adv, eventTime, lang, assistantName, baseline });
    if (!req) return null;
    const { system, pools } = req;
    const raw = await Promise.race([callFn(system, [{ role: 'user', content: 'Curate the outfit now. JSON only.' }]), new Promise((_, rej) => setTimeout(() => rej(new Error('curator timeout')), timeoutMs))]);
    let out = raw;
    if (typeof raw === 'string') { const a = raw.indexOf('{'); const b = raw.lastIndexOf('}'); try { out = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; } catch { out = null; } }
    return buildCuratedPlan(out, { plan, pools, persons, budget: plan.budget || null, K, owned: ownedKeysOf(parsed) });
  };
}

/**
 * ????? ????? ???????? (Gemini ?????): ??? ?? ????? ?????? ?????? ?? ????: ????? ???????? ???????? ???????
 * (????? "???????" ?? ???? ????? ?? ?????? ?? ???? ?????). ????? ????? ?????? ??????? ????? "?????".
 * ?? ??? ?? ?? ???? = ????? ?? ?? ?? (??????? ?? plan.js ?? ?? ?????? ?????).
 */
export function makeVerifier(callFn, { timeoutMs = 7000 } = {}) {
  return async ({ plan, K }) => {
    const rows = [];
    for (const pe of plan.people || []) for (const pk of pe.picks || []) rows.push({ id: pk.product.id, slot: pk.slotKey, name: clean(pk.product.name_ar || pk.product.name_en, 70), cat: clean(pk.product.cat_text, 50) });
    if (!rows.length) return plan;
    const system = [
      'You audit an outfit built by a fashion stylist for an online clothing store in Egypt. For each line (id | slot the piece fills | product name | store category) decide if the PRODUCT is really the garment of that SLOT.',
      'Mark a line BAD when the product is a different thing than its slot: e.g. cufflinks / shirt buttons / pins / brooches in a shirt, suit or dress slot; lingerie, babydoll, robe, pajamas or underwear in a dress, outfit, shirt or suit slot; a belt, sock, bag or beauty product in a clothing slot; house slippers for an outing or a formal occasion; a hoodie in a formal slot.',
      'Judge by the real name, not by the slot label. When unsure, keep it (not BAD).',
      'Reply with ONE JSON object only: {"bad":[ids of BAD lines]}',
    ].join('\n');
    const msg = rows.map((r) => `${r.id} | ${r.slot} | ${r.name} | ${r.cat || '-'}`).join('\n');
    let raw;
    try { raw = await Promise.race([callFn(system, [{ role: 'user', content: msg }]), new Promise((_, rej) => setTimeout(() => rej(new Error('verifier timeout')), timeoutMs))]); } catch { return plan; }
    let out = raw;
    if (typeof raw === 'string') { const a = raw.indexOf('{'); const b = raw.lastIndexOf('}'); try { out = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; } catch { out = null; } }
    const valid = new Set(rows.map((r) => String(r.id)));
    const bad = new Set((Array.isArray(out?.bad) ? out.bad : []).map(String).filter((id) => valid.has(id)));
    if (!bad.size) return plan;
    const people = (plan.people || []).map((pe) => {
      const dropped = pe.picks.filter((pk) => bad.has(String(pk.product.id)));
      if (!dropped.length) return pe;
      const picks = pe.picks.filter((pk) => !bad.has(String(pk.product.id)));
      const missing = [...(pe.missing || []), ...dropped.map((pk) => ({ keys: [pk.slotKey], base: pk.slotKey, material: null, color: null, label: itemAr(K, pk.slotKey), title: itemAr(K, pk.slotKey), aud: pe.aud }))];
      return { ...pe, picks, missing, subtotal: picks.reduce((t, pk) => t + pk.product.price, 0) };
    });
    if (!people.some((pe) => pe.picks.length)) return plan;
    const total = people.reduce((t, pe) => t + pe.subtotal, 0);
    return { ...plan, people, missing: people.flatMap((pe) => pe.missing || []), total, state: people.some((pe) => (pe.missing || []).length) ? 'partial' : plan.state, verified: true };
  };
}
