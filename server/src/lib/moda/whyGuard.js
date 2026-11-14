/**
 * حارس «سبب القطعة»: سبب أي قطعة ما ينفعش يشير لقطعة مش موجودة في نفس الطقم (ولا مع العميل).
 * بنحدد القطع المذكورة في النص من قاموس تويلا نفسه (نفس الأسماء والمرادفات)، وأي جملة فرعية بتذكر قطعة غايبة بتتشال.
 * لو مفضلش حاجة، بنرجع لجملة عامة صادقة. ما بنغيّرش أي قاعدة في قاعدة المعرفة: ده فلتر وقت العرض بس.
 */
import { norm, tokenize, tokenVariants } from './text.js';

const GENERIC_FAMILY = { trousers: 'bottoms', shoes_any: 'shoes', dress_any: 'dresses', top: 'tops' }; // «بنطلون/حذاء/فستان/توب» عامّة: تكفي قطعة من نفس العائلة
const OWNED_GROUP = { sneakers: ['sneakers', 'sport_shoes'], sport_shoes: ['sneakers', 'sport_shoes'], shoes_any: ['shoes_any', 'sneakers', 'sport_shoes', 'formal_shoes', 'loafers', 'flats', 'heels_low', 'heels_high', 'sandals', 'boots'], dress_any: ['dress_any', 'dress_casual', 'dress_work', 'dress_party', 'dress_evening', 'dress_beach'] };

export function mentionedGarments(K, text) {
  const toks = tokenize(norm(String(text || '')));
  const grams = [...toks, ...toks.slice(0, -1).map((t, i) => `${t} ${toks[i + 1]}`)];
  const out = new Set();
  for (const g of grams) for (const v of (g.includes(' ') ? [g] : tokenVariants(g))) for (const h of K.index.exact.get(v) || []) if (h.group === 'garment') out.add(h.key);
  return out;
}

/** القطع المسموح الإشارة ليها: قطع الطقم (بمفاتيحها وأسمائها الحقيقية) + اللي مع العميل */
export function allowedGarments(K, items, ownedKeys = []) {
  const keys = new Set();
  for (const it of items) { if (it.key) keys.add(it.key); for (const t of [it.label, it.name]) for (const k of mentionedGarments(K, t)) keys.add(k); }
  for (const o of ownedKeys) for (const k of OWNED_GROUP[o] || [o]) keys.add(k);
  const fam = new Set([...keys].map((k) => K.items.get(k)?.family).filter(Boolean));
  const ok = (k) => keys.has(k) || (GENERIC_FAMILY[k] && fam.has(GENERIC_FAMILY[k]));
  return { ok, keys };
}

const GENERIC_WHY = 'اخترناها لإنها متاحة دلوقتي وبتناسب طلبك';

/** يرجّع { text, changed }: النص من غير الجمل اللي بتشير لقطعة مش في الطقم */
export function guardWhy(K, text, allow) {
  const src = String(text || '').trim();
  if (!src) return { text: null, changed: false };
  const absent = (s) => [...mentionedGarments(K, s)].some((k) => !allow.ok(k));
  if (!absent(src)) return { text: src, changed: false };
  const parts = src.split(/[،,;؛.]\s*/).map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((p) => !absent(p));
  return { text: kept.length ? kept.join('، ') : null, changed: true };
}

export const genericWhy = () => GENERIC_WHY;
