/**
 * "منسّق مودة" (Gemini/Claude): الموديل هو اللي بيرشّح الطقم، بس من منتجاتنا الحقيقية الأول.
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

/** قايمة المنتجات المتاحة لكل فئة، مفلترة على رسمية المناسبة، ومنوّعة (حد أقصى لكل نوع). */
export function candidatePool(rows, aud, K, { context = null, max = 48, perKey = 5 } = {}) {
  const ok = AUD_OK[aud] || (() => true);
  const fr = context ? K.contexts.get(context)?.formality : null;
  const lo = fr ? fr[0] - 1 : 0; const hi = fr ? fr[1] + 1 : 9;
  const byKey = new Map();
  for (const p of rows || []) {
    if (!p.key || p.inStock === false || p.typeConflict || !(p.price > 0) || !ok(p.gender)) continue;
    const item = K.items.get(p.key); if (!item || item.virtual) continue;
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

export function curatorPrompt({ K, pools, persons, context, budget, adv, eventTime, parsed, baseline, lang = 'ar', assistantName = 'مودة' }) {
  const weather = adv ? `~${adv.temp}°C${adv.fabrics_ar?.length ? `, suited fabrics: ${adv.fabrics_ar.slice(0, 3).join(', ')}` : ''}${adv.notes?.includes('rain') ? ', rain expected' : ''}` : 'unknown';
  const formality = context ? K.contexts.get(context)?.formality : null;
  const asked = (parsed.garments || []).map((g) => `${g.key}${g.color ? `(${g.color})` : ''}`).join(', ');
  return [
    `You are ${assistantName} (مودة), the expert fashion stylist of "Twist", an online marketplace of local clothing stores in Banha, Egypt. You are curating a complete outfit for each person from the REAL stock lists below.`,
    'Style knowledge: match the dress code of the occasion, keep the colours coherent (a small palette, partners may echo each other), respect the weather, make every look complete (e.g. suit/shirt/shoes, or dress/shoes/bag), and never pick sporty or casual pieces (hoodies, shorts, sport shoes) for a formal occasion. The only exception: plain minimalist white or black leather sneakers may go with a classic suit/blazer look at an engagement or wedding guest event, and only when no formal shoe/loafer fits; they are listed in stock only if allowed. Judge each item by its real name and type, not only its label.',
    `Occasion: ${context || 'not specified'}${formality ? ` (formality ${formality[0]}-${formality[1]} out of 5)` : ''}. Time: ${eventTime?.isNight ? 'evening/night' : 'daytime'}. Weather: ${weather}.`,
    budget ? `Total budget for everyone together: ${budget} EGP. The sum of the prices of the chosen products MUST NOT exceed it; split it sensibly between people. If a complete look cannot fit, choose fewer/cheaper pieces and say so in the note.` : 'No budget limit was given.',
    asked ? `The customer explicitly asked for: ${asked}.` : '',
    ...persons.map((a) => `STOCK for "${a}" (id | type (arabic) | name | colours | price EGP | formality):\n${pools[a].length ? pools[a].map((p) => line(p, K)).join('\n') : '(nothing in stock for this person)'}`),
    baseline ? `The rule-based system suggested this baseline (you may improve or replace it): ${JSON.stringify(baseline)}` : '',
    'HARD RULES: (1) choose productId ONLY from the stock lists above for that same person, copied exactly. (2) Choose from our stock first. (3) If an essential piece has no suitable product in stock, DO NOT force a bad one: output it with productId null and a short Arabic "title" describing the piece to source from outside (e.g. "بدلة كحلي سليم فيت", with colour/style, no brand, no price) — Twist will offer to source it. (4) Never invent stock, brands, stores or prices; never write numbers or prices in any text field. (5) "type" must be one of the type keys shown in the lists (for outside pieces use a sensible type key such as suit, shirt, dress_party, heels_low, formal_shoes, loafers, blazer, trousers...).',
    `Reply with ONE JSON object only, no prose around it. Text fields in ${lang === 'en' ? 'English' : 'friendly Egyptian Arabic'}:`,
    '{"people":[{"aud":"men","note":"one short styling tip for this person","items":[{"type":"suit","productId":123,"why":"few words"},{"type":"shirt","productId":null,"title":"قميص أبيض كلاسيك"}]}]}',
  ].filter(Boolean).join('\n');
}

/** يفحص رد الموديل ويبني plan بنفس شكل planOutfit. يرجّع null لو غير سليم. */
export function buildCuratedPlan(out, { plan, pools, persons, budget, K }) {
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
      if (prod) {
        if (seen.has(prod.id)) continue; seen.add(prod.id);
        picks.push({ slotKey: prod.key, optional: false, hero: picks.length === 0, product: prod, relaxed: null, why: clean(it.why, 80) });
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

/** callFn(system, messages) → string|object. بيرجّع async ({plan, rows, parsed, adv, eventTime, K, lang, assistantName}) => plan|null */
export function makeCurator(callFn, { timeoutMs = 16000 } = {}) {
  return async ({ plan, rows, parsed, adv, eventTime, K, lang = 'ar', assistantName = 'مودة' }) => {
    const persons = plan.persons || [];
    if (!persons.length || !plan.context && !(parsed.garments || []).length) return null;
    const pools = Object.fromEntries(persons.map((a) => [a, candidatePool(rows, a, K, { context: plan.context })]));
    if (!persons.some((a) => pools[a].length)) return null;
    const baseline = (plan.people || []).map((pe) => ({ aud: pe.aud, items: pe.picks.map((p) => ({ type: p.slotKey, productId: p.product.id })) }));
    const system = curatorPrompt({ K, pools, persons, context: plan.context, budget: plan.budget || null, adv, eventTime, parsed, baseline, lang, assistantName });
    const raw = await Promise.race([callFn(system, [{ role: 'user', content: 'Curate the outfit now. JSON only.' }]), new Promise((_, rej) => setTimeout(() => rej(new Error('curator timeout')), timeoutMs))]);
    let out = raw;
    if (typeof raw === 'string') { const a = raw.indexOf('{'); const b = raw.lastIndexOf('}'); try { out = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; } catch { out = null; } }
    return buildCuratedPlan(out, { plan, pools, persons, budget: plan.budget || null, K });
  };
}
