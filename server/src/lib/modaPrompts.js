/**
 * الاقتراحات الجاهزة لمودة (بتتعدّل من الأدمن → المساعد الذكي):
 *  - hero:  الأزرار السريعة في الصفحة الرئيسية ("إطلالة فرح"، "طقم جامعة"...) — الزرار له اسم قصير ورسالة بتتبعت لمودة.
 *  - chips: الرسائل المثال اللي بتظهر في أول الشات ("ممكن تسأل مودة مثلاً").
 * بتتخزن في app_settings. لو الأدمن ماغيّرش حاجة بنرجع للقيم الافتراضية.
 * كل رسالة بنفحصها بالمحلل بتاع مودة (parseMessage) ونقول للأدمن لو مودة مش هتفهمها، عشان زرار ما يطلعش "بايظ".
 */
import { q } from '../db/index.js';
import { parseMessage } from './moda/parse.js';
import { loadKnowledge } from './moda/knowledge.js';

const KEY = 'moda_prompts';
const MAX_HERO = 8;
const MAX_CHIPS = 6;

export const DEFAULT_PROMPTS = {
  hero: [
    { ar: 'إطلالة فرح', en: 'Wedding outfit', askAr: 'إطلالة كاملة لحضور فرح', askEn: 'Complete outfit for a wedding' },
    { ar: 'طقم جامعة', en: 'University look', askAr: 'طقم مريح للجامعة', askEn: 'Comfortable university outfit' },
    { ar: 'طقم شغل', en: 'Work outfit', askAr: 'إطلالة مناسبة للشغل', askEn: 'An outfit for work' },
    { ar: 'ستايل رياضي', en: 'Sporty style', askAr: 'لبس رياضي كامل', askEn: 'Complete sporty look' },
  ],
  chips: [
    { ar: 'أنا وخطيبتي رايحين خطوبة، عايزين طقم لينا الاتنين', en: 'Engagement party: matching outfits for me and my fiancée' },
    { ar: 'عندي قميص أزرق سماوي، عايز كوتشي يليق عليه', en: 'I have a sky-blue shirt, which sneakers go with it?' },
    { ar: 'عندي فرح وعايز بدلة كاملة بـ 4000 جنيه', en: 'Wedding guest: full suit up to EGP 4000' },
  ],
};

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function normalizePrompts(input) {
  const hero = (Array.isArray(input?.hero) ? input.hero : [])
    .map((p) => ({ ar: clean(p?.ar, 40), en: clean(p?.en, 60), askAr: clean(p?.askAr, 250), askEn: clean(p?.askEn, 250) }))
    .filter((p) => p.ar && p.askAr).slice(0, MAX_HERO)
    .map((p) => ({ ...p, en: p.en || p.ar, askEn: p.askEn || p.askAr }));
  const chips = (Array.isArray(input?.chips) ? input.chips : [])
    .map((c) => ({ ar: clean(c?.ar, 250), en: clean(c?.en, 250) }))
    .filter((c) => c.ar).slice(0, MAX_CHIPS)
    .map((c) => ({ ...c, en: c.en || c.ar }));
  return { hero, chips };
}

/** هل مودة هتفهم الرسالة دي (فيها مناسبة أو قطعة)؟ */
export function promptUnderstood(text) {
  try {
    const p = parseMessage(String(text || ''));
    return p.intent !== 'unknown' && !!(p.context || p.garments?.length);
  } catch { return false; }
}

const readSaved = () => {
  try { return JSON.parse(q.get('SELECT value FROM app_settings WHERE key=?', [KEY])?.value || 'null'); } catch { return null; }
};

/** للموقع (عام): القايمة الحالية. */
export function getModaPrompts() {
  const saved = readSaved();
  const base = saved ? normalizePrompts(saved) : DEFAULT_PROMPTS;
  return { hero: base.hero, chips: base.chips };
}

/** للأدمن: القايمة + هل متعدلة + فحص كل رسالة. */
export function adminModaPrompts() {
  const saved = readSaved();
  const cur = getModaPrompts();
  return {
    custom: !!saved,
    hero: cur.hero.map((p) => ({ ...p, understood: promptUnderstood(p.askAr) })),
    chips: cur.chips.map((c) => ({ ...c, understood: promptUnderstood(c.ar) })),
    defaults: DEFAULT_PROMPTS,
    limits: { hero: MAX_HERO, chips: MAX_CHIPS },
  };
}

export function saveModaPrompts(input) {
  const next = normalizePrompts(input);
  q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [KEY, JSON.stringify(next)]);
  return adminModaPrompts();
}

export function resetModaPrompts() {
  q.run('DELETE FROM app_settings WHERE key=?', [KEY]);
  return adminModaPrompts();
}

/** المساعد الذكي يقترح قايمة جديدة (للمراجعة بس، مابتتحفظش لوحدها). بنشيل أي رسالة مودة مش هتفهمها. */
export async function suggestPrompts(callFn) {
  const K = loadKnowledge();
  const occasions = [...K.contexts.values()].filter((c) => c.key !== 'condolence').map((c) => c.ar).join('، ');
  const system = [
    'You write ready-made suggestion buttons and example messages for "Moda (مودة)", the fashion-stylist chat of "Talla / طلة", an online marketplace of local clothing stores in Banha, Egypt.',
    'Write in warm Egyptian Arabic (and a short natural English version). Reply with ONE JSON object only, no prose:',
    '{"hero":[{"ar":"short button label (2-3 words)","en":"...","askAr":"the message sent to the stylist","askEn":"..."}],"chips":[{"ar":"a full natural sentence a customer would type","en":"..."}]}',
    `hero: exactly 6 items. Each askAr MUST clearly name ONE occasion or garment the shop can dress (occasions we know: ${occasions}). Never mention prices, brands or stores.`,
    'chips: exactly 4 items. Realistic requests mixing who it is for, the occasion, a piece they already own or a budget in EGP (e.g. 3000 جنيه). Vary them: men, women, couple, a budget one.',
    'Seasonal relevance: today is mid-October in Egypt (autumn, mild weather).',
  ].join('\n');
  const raw = await callFn(system, [{ role: 'user', content: 'اقترح القايمة.' }]);
  let out = raw;
  if (typeof raw === 'string') { const a = raw.indexOf('{'); const b = raw.lastIndexOf('}'); out = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; }
  const n = normalizePrompts(out);
  const hero = n.hero.filter((p) => promptUnderstood(p.askAr));
  const chips = n.chips.filter((c) => promptUnderstood(c.ar));
  if (!hero.length && !chips.length) throw new Error('no usable suggestions');
  return { hero, chips };
}
