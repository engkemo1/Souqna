/**
 * فهم احتياطي بموديل مجاني (Cloudflare Workers AI) — بيتشغل بس لما القواعد مافهمتش الرسالة.
 * الموديل بيرجّع JSON صغير بمفردات محددة، والمحرك بيرفض أي قيمة برّه القاموس (engine.js).
 * مفيش نص من الموديل بيوصل للعميل، ومفيش منتجات بتتخترع.
 */
import { loadKnowledge } from './knowledge.js';

export function extractionPrompt() {
  const K = loadKnowledge();
  const ctx = [...K.contexts.keys()].filter((c) => c !== 'condolence');
  const garments = [...K.items.keys()].filter((k) => !['dress_any', 'shoes_any', 'underwear_sleep', 'sleepwear'].includes(k));
  return [
    'You extract shopping intent from a short message (Egyptian Arabic, Franco-Arabic, English or mixed) for a clothing store.',
    'Reply with ONE JSON object only, no prose: {"persons":[],"context":null,"garments":[]}.',
    'persons: any of men, women, women_hijab, boys, girls (who the clothes are for).',
    `context: one of ${ctx.join(', ')} or null.`,
    `garments: any of ${garments.join(', ')} (only pieces the user explicitly asks for).`,
    'If unsure about a field leave it empty or null. Never invent values outside these lists.',
  ].join('\n');
}

/** callFn(systemPrompt, messages) => Promise<string|object> */
export function makeLlmExtract(callFn) {
  const system = extractionPrompt();
  return async (text) => {
    const out = await callFn(system, [{ role: 'user', content: String(text).slice(0, 300) }]);
    if (out && typeof out === 'object') return out;
    const s = String(out || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  };
}
