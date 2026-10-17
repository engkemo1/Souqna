/**
 * "عقل" مودة: موديل لغة (Cloudflare Workers AI المجاني أو Claude) بيدّي المحادثة ذكاء — بيجاوب أي سؤال، وبيسأل سؤال واحد
 * يجمع بيه المعلومة الناقصة، وبيطلّع من الكلام (مين / مناسبة / قطع / ألوان / ميزانية) بمفردات محددة.
 *
 * مهم: الموديل بيتكلم بس. المنتجات والأسعار والمخزون بتيجي من المحرك والقاعدة (engine.js / plan.js)، والرد بيتفحص
 * (guard.js) قبل ما يوصل للعميل — أي رد فيه سعر مخترع أو لينك أو لغة غلط بيتشال ونرجع لردود المحرك.
 * الموديل اختياري تمامًا: من غيره المحرك بيشتغل بقواعده.
 */
import { loadKnowledge } from './knowledge.js';
import { checkText } from './guard.js';

const PERSONS = new Set(['men', 'women', 'women_hijab', 'boys', 'girls']);
const itemAr = (K, key) => String(K.items.get(key)?.ar || key).replace(/\s*\(.*?\)\s*/g, '').split(' / ')[0].trim();

/** ملخص مختصر للي موجود فعلًا في المخزون (نوع القطعة × الفئة) — عشان الموديل ما يوعدش بحاجة مش موجودة. */
export function catalogDigest(rows, K = loadKnowledge(), { maxPerGroup = 14 } = {}) {
  const groups = { men: new Map(), women: new Map(), kids: new Map(), unisex: new Map() };
  for (const p of rows || []) {
    if (!p.key || p.inStock === false) continue;
    const g = p.gender === 'men' ? 'men' : p.gender === 'women' ? 'women' : ['boys', 'girls', 'kids'].includes(p.gender) ? 'kids' : 'unisex';
    groups[g].set(p.key, (groups[g].get(p.key) || 0) + 1);
  }
  const label = { men: 'رجالي', women: 'حريمي', kids: 'أطفال', unisex: 'للجنسين' };
  return Object.entries(groups).filter(([, m]) => m.size).map(([g, m]) => `${label[g]}: ${[...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxPerGroup).map(([k, n]) => `${itemAr(K, k)} (${k}) ×${n}`).join('، ')}`).join('\n');
}

export function brainPrompt({ K = loadKnowledge(), digest = '', assistantName = 'مودة', training = '', facts = null } = {}) {
  const ctx = [...K.contexts.keys()].filter((c) => c !== 'condolence');
  const garments = [...K.items.keys()].filter((k) => !['dress_any', 'shoes_any', 'underwear_sleep', 'sleepwear'].includes(k));
  const colors = [...K.colors.keys()];
  return [
    `You are ${assistantName} (مودة), the personal fashion stylist and shopping assistant of "Twist", an online marketplace of local clothing stores in Banha, Egypt.`,
    'Talk like a warm, sharp, friendly Egyptian stylist. Reply in the customer\'s language: Egyptian Arabic by default (English if they write English). Short: 1-3 sentences.',
    'Your job: (1) answer ANY question the customer asks — fashion advice, what suits an occasion/body/colour, sizing, fabric and care, and questions about orders, shipping, payment and exchanges; (2) when you still miss something you need to recommend, ask exactly ONE short question (who it is for / the occasion / budget / colours or style / size), never several; (3) understand what they want.',
    'Platform facts you may state (only these): payment is cash on delivery; each store sets its own exchange/return period (usually 3 days from receiving the order, shown on the store page), so never promise a period for a specific store; shipping is calculated per store and shown before the order is confirmed; track orders on the "Track order" page with the tracking number; to change/cancel an order contact the store from its page. Twist brings Banha clothing stores together; a shopper can order from several stores in one order. How to order: search or ask the stylist, open the product, choose size and colour, add to basket, continue with details and address, confirm. There is a "Search by photo" page, a "Stores" page, a "Request a product" page, and "My account" (sign in with phone number). To sell on Twist: open "Join as a seller" and contact the team on WhatsApp/phone; the team sets up the store and gives a link to the store dashboard (add products, photos, prices, orders, stock, offers, theme, sales reports). Never give phone numbers, prices, delivery times for specific areas, or stock promises. If you do not know something, say so plainly, say where the customer can check (the store page, the checkout, the Twist team via "Join as a seller"), and offer to help with shopping instead — never guess or make things up. Safety: never ask for passwords, card numbers or ID; payment is on delivery.',
    'HARD RULES: never invent products, brands, stores, prices, discounts or stock. Never write a price. Never claim an item exists — the system shows real products separately under your reply. If the customer asks for something that is not in the stock list below, say it is not available right now and suggest the closest available alternative from the list. Off-topic questions: answer in one short friendly sentence, then steer back to shopping. No emojis, no markdown, no links.',
    digest ? `What is actually in stock right now (type (key) ×count):\n${digest}` : 'Stock information is not available; do not promise specific items.',
    facts ? `Facts from the recommendation engine for this turn: ${JSON.stringify(facts)}` : '',
    training ? training.trim() : '',
    'Reply with ONE JSON object only, no prose around it:',
    '{"reply":"your message to the customer","persons":[],"context":null,"garments":[],"colors":[],"budget":null,"ready":false}',
    'persons: any of men, women, women_hijab, boys, girls — who the clothes are for, only if stated or clearly implied.',
    `context: one of ${ctx.join(', ')} or null.`,
    `garments: pieces the customer explicitly asked for, from: ${garments.join(', ')}.`,
    `colors: from ${colors.join(', ')}.`,
    'budget: a number in EGP only if the customer stated one, else null.',
    'ready: true only when you have enough (who + occasion or a specific piece) for the system to show products now; if ready is false your reply should contain your ONE question.',
    'Leave unknown fields empty/null. Never output values outside these lists.',
  ].filter(Boolean).join('\n');
}

const toHistory = (messages) => (Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }])
  .slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(typeof m.content === 'string' ? m.content : (m.content || []).map((c) => c.text || '').join(' ')).slice(0, 500) }))
  .filter((m) => m.content.trim());

/** يرجّع رد الموديل بعد التنضيف، أو null لو مش سليم. */
export function sanitizeBrain(out, { K = loadKnowledge(), lang = 'ar', userBudget = null } = {}) {
  if (!out || typeof out !== 'object') return null;
  let reply = String(out.reply ?? out.say ?? '').replace(/\s+/g, ' ').trim();
  if (reply.length > 520) reply = reply.slice(0, 520).replace(/[^.!؟?،,]*$/, '').trim() || reply.slice(0, 520);
  const guard = checkText(reply, { lang, maxLen: 600 });
  const priceLike = /(\d[\d,.]*)\s*(جنيه|جنية|ج\.?م|EGP|LE|pounds?)/gi;
  const prices = [...reply.matchAll(priceLike)].map((m) => Number(m[1].replace(/,/g, '')));
  const invented = prices.some((n) => !userBudget || Math.abs(n - userBudget) > 1);
  const bad = !reply || !guard.ok || invented || /https?:\/\/|www\./i.test(reply) || /[*#`]{2,}/.test(reply);
  const list = (v, set) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && set.has(x)))];
  const budget = Number(out.budget); 
  return {
    reply: bad ? '' : reply,
    persons: list(out.persons, PERSONS),
    context: K.contexts.has(out.context) && out.context !== 'condolence' ? out.context : null,
    garments: list(out.garments, new Set([...K.items.keys()])),
    colors: list(out.colors, new Set([...K.colors.keys()])),
    budget: Number.isFinite(budget) && budget >= 100 && budget <= 200000 ? Math.round(budget) : null,
    ready: out.ready === true,
  };
}

/** callFn(system, messages) → string|object. opts: { training(query) → string, timeoutMs } */
export function makeBrain(callFn, { training = () => '', timeoutMs = 14000 } = {}) {
  return async ({ messages, rows, assistantName, lang = 'ar', userBudget = null, facts = null, text = '' }) => {
    const K = loadKnowledge();
    const system = brainPrompt({ K, digest: catalogDigest(rows, K), assistantName: assistantName || 'مودة', training: training(text) || '', facts });
    const history = toHistory(messages);
    if (!history.length || history[history.length - 1].role !== 'user') return null;
    const raw = await Promise.race([callFn(system, history), new Promise((_, rej) => setTimeout(() => rej(new Error('brain timeout')), timeoutMs))]);
    let out = raw;
    if (typeof raw === 'string') { const a = raw.indexOf('{'); const b = raw.lastIndexOf('}'); try { out = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : { reply: raw }; } catch { out = { reply: raw }; } }
    return sanitizeBrain(out, { K, lang, userBudget });
  };
}
