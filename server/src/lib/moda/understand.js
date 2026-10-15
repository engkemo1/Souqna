/**
 * طبقة "الفهم" بالموديل (Gemini/Claude): بتقرا رسالة العميل وتحوّلها لبيانات منظمة (لمين، مناسبة، قطع بألوانها، ميزانية بمداها، وقت).
 * الموديل بيفهم بس — مش بيرد على العميل ومش بيختار منتجات. كل قيمة بتتفحص قبل ما تتقبل:
 *  - أنواع/ألوان/مناسبات لازم تكون من القاموس، والأشخاص من القايمة المحددة.
 *  - الميزانية لازم يكون رقمها (أو "ألف") مكتوب فعلاً في رسالة العميل، وإلا بنتجاهلها ونكمل بقواعد parse.js.
 * لو الموديل وقع/اتأخر/رجّع حاجة غلط، المحرك بيكمل بالقواعد زي ما كان.
 */
import { loadKnowledge } from './knowledge.js';

const PERSONS = new Set(['men', 'women', 'women_hijab', 'boys', 'girls']);
const toAsciiDigits = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

export function understandPrompt(K = loadKnowledge()) {
  const ctx = [...K.contexts.keys()].filter((c) => c !== 'condolence');
  const garments = [...K.items.keys()].filter((k) => !['dress_any', 'shoes_any', 'underwear_sleep', 'sleepwear'].includes(k));
  const colors = [...K.colors.keys()];
  return [
    'You read ONE message from a customer of an online clothing marketplace in Egypt (Egyptian Arabic, Franco-Arabic, English or mixed) and extract what they want as structured data. You do NOT reply to the customer.',
    'Reply with ONE JSON object only, no prose:',
    '{"persons":[],"context":null,"role":"guest","garments":[{"type":"tshirt","color":null}],"budget":null,"daypart":null}',
    'persons: any of men, women, women_hijab, boys, girls — who the clothes are for (the customer may be buying for someone else). Only if stated or clearly implied.',
    `context: one of ${ctx.join(', ')} or null. Use *_self (engagement_self, wedding_self) only when the customer himself/herself is the bride/groom; otherwise *_guest.`,
    `garments: the pieces explicitly asked for; "type" from: ${garments.join(', ')}; "color" from: ${colors.join(', ')} or null. Distinguish shoe kinds carefully (sneakers vs formal shoes vs loafers vs heels vs sandals) and never map a sneaker to a formal shoe.`,
    'budget: only if the customer states money limits. {"max":number,"min":number|null,"kind":"total"|"per_item"}. A range like "من 200 ل 1000" or "between 500 and 1500" means min=200,max=1000 (max is the limit). "لحد 1000" / "up to 1000" means max=1000,min=null. "ألف" = 1000, "ألفين" = 2000, "5k" = 5000. Never invent a budget.',
    'Never guess an occasion the customer did not mention: if they only ask for one piece (e.g. sneakers to go with a shirt they already own), leave context null and list only that piece in garments.',
    'daypart: "day" or "night" only if stated (بالليل, الصبح, الضهر, evening…), else null.',
    'Never output values outside these lists. Leave unknown fields empty/null.',
  ].join('\n');
}

/** يفحص رد الموديل ويرجّع فهم نضيف أو null. */
export function sanitizeUnderstanding(out, text, K = loadKnowledge()) {
  if (!out || typeof out !== 'object') return null;
  const list = (v, set) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && set.has(x)))];
  const colorSet = new Set(K.colors.keys()); const itemSet = new Set(K.items.keys());
  const persons = list(out.persons, PERSONS);
  const context = typeof out.context === 'string' && K.contexts.has(out.context) && out.context !== 'condolence' ? out.context : null;
  const garments = [];
  for (const g of Array.isArray(out.garments) ? out.garments : []) {
    const type = typeof g === 'string' ? g : g?.type ?? g?.key;
    if (typeof type !== 'string' || !itemSet.has(type) || K.items.get(type)?.virtual || garments.some((x) => x.key === type)) continue;
    const color = typeof g === 'object' && typeof g.color === 'string' && colorSet.has(g.color) ? g.color : null;
    garments.push({ key: type, color, material: null, text: type, position: garments.length });
  }
  // الميزانية: لازم تكون مكتوبة في الرسالة
  let budget = null;
  const b = out.budget;
  if (b && typeof b === 'object') {
    const max = Math.round(Number(b.max ?? b.value)); let min = b.min == null ? null : Math.round(Number(b.min));
    const digits = new Set((toAsciiDigits(text).match(/\d+(?:\.\d+)?/g) || []).map(Number));
    const kWord = /(الف|ألف|آلاف|الاف|ألفين|الفين|\d\s*k\b)/i.test(toAsciiDigits(text));
    const grounded = (v) => digits.has(v) || kWord;
    if (Number.isFinite(max) && max >= 100 && max <= 200000 && grounded(max)) {
      if (min != null && !(Number.isFinite(min) && min >= 0 && min < max && grounded(min))) min = null;
      budget = { value: max, ...(min != null ? { min } : {}), kind: b.kind === 'per_item' ? 'per_item' : 'total' };
    }
  }
  const daypart = out.daypart === 'day' || out.daypart === 'night' ? out.daypart : null;
  const role = out.role === 'self' ? 'self' : 'guest';
  if (!persons.length && !context && !garments.length && !budget && !daypart) return null;
  return { persons, context, role, garments, budget, daypart };
}

/** يدمج الفهم في نتيجة parseMessage: الموديل أولاً، والقواعد تكمّل اللي ناقص. */
export function applyUnderstanding(parsed, u) {
  if (!u) return parsed;
  const out = { ...parsed, flags: { ...parsed.flags, understood: true } };
  if (u.persons.length) out.persons = u.persons;
  if (u.context) {
    out.context = u.context;
    out.contextEffective = u.context;
    if (u.role === 'self' || u.context.endsWith('_self')) out.role = 'self';
  }
  if (u.garments.length) {
    // لو القواعد لقت قطعة بنفس النوع نحتفظ بخامتها
    out.garments = u.garments.map((g) => { const old = parsed.garments.find((x) => x.key === g.key); return { ...g, material: old?.material || null, color: g.color || old?.color || null }; });
    const cs = [...new Set(out.garments.map((g) => g.color).filter(Boolean))];
    if (cs.length && !out.colors?.length) out.colors = cs;
  }
  if (u.budget) out.budget = u.budget;
  if (u.daypart) out.daypart = u.daypart;
  if (out.intent === 'unknown' || out.intent === 'shop') out.intent = 'shop';
  return out;
}

/** القواعد واثقة؟ لو أيوه ومفيش أرقام ملتبسة نوفّر نداء الموديل. */
export function rulesConfident(parsed, text) {
  if (!parsed || parsed.intent !== 'shop') return false;
  const t = toAsciiDigits(text);
  const nums = (t.match(/\d+/g) || []).length;
  const wordsBudget = /(الف|ألف|آلاف|الاف|ألفين|الفين)/.test(t);
  const hasWho = parsed.persons?.length > 0;
  const hasWhat = Boolean(parsed.context) || parsed.garments?.length > 0;
  if (!hasWho || !hasWhat) return false;
  if (nums >= 2 || wordsBudget && !parsed.budget) return false; // مدى أو رقم بالكلام
  if (nums === 1 && !parsed.budget) return false;
  if (parsed.garments?.some((g) => /shoe|sneaker|loafer|boot|sandal|heel/i.test(g.key)) && !parsed.context) return false;
  return text.length < 40;
}

/** callFn(system, messages) → string|object. بيرجّع async ({text, parsed}) => understanding|null */
export function makeUnderstander(callFn, { timeoutMs = 6500 } = {}) {
  const system = understandPrompt();
  return async ({ text }) => {
    const raw = await Promise.race([callFn(system, [{ role: 'user', content: String(text).slice(0, 400) }]), new Promise((_, rej) => setTimeout(() => rej(new Error('understand timeout')), timeoutMs))]);
    let out = raw;
    if (typeof raw === 'string') { const a = raw.indexOf('{'); const b = raw.lastIndexOf('}'); try { out = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; } catch { out = null; } }
    return sanitizeUnderstanding(out, text);
  };
}
