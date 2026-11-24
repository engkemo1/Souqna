/**
 * AI fit reading: looks at a product's main photo, name, description and fabric and says how the cut will fit
 * ("small" = tight / runs small, "true", "large" = loose / oversized). Shown on the product page only when the shop did not set it
  * (only for products whose shop switched it on; FIT_AI=0 turns it off everywhere) itself, and always labelled as an automatic reading. Gemini first (free tier), Claude if its key is set; never blocks a save.
 */
import crypto from 'node:crypto';
import sharp from 'sharp';
import { q, update } from '../db/index.js';
import { recordAi, usageDay } from './ai-usage.js';
import { readMediaFile } from './media.js';

const gkey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const akey = () => process.env.ANTHROPIC_API_KEY || '';
export const fitAiEnabled = () => process.env.FIT_AI !== '0' && Boolean(gkey() || akey());
const MODELS = () => [...new Set([process.env.FIT_AI_MODEL, 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-latest'].filter(Boolean))];
const usedUp = new Map();
let goodModel = null;

const PROMPT = (t) => `You help shoppers of an Egyptian online fashion marketplace choose a size. Look at the product photo and details and judge how the garment's CUT fits a typical body wearing the usual size (not how big the size label is).
Product: ${t.name}
Description: ${t.desc || '-'}
Fabric: ${t.material || '-'}
Return JSON only: {"fit":"small"|"true"|"large"|"unknown","stretch":true|false,"confidence":0..1,"note_ar":"<=90 chars, Egyptian Arabic, one friendly sentence about the cut, e.g. القطعة واسعة أوفر سايز فممكن تاخد مقاس أصغر"}
small = body-hugging / slim / tight, large = oversized / loose / relaxed, true = regular. Use "unknown" if the photo does not show a wearable garment clearly. Never invent measurements.`;

const b64 = async (b) => (await sharp(b).resize({ width: 640, height: 640, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()).toString('base64');
const parse = (s) => JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));

async function askGemini(prompt, img) {
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: img } }] }], generationConfig: { temperature: 0, maxOutputTokens: 250, responseMimeType: 'application/json' } };
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
  const day = usageDay();
  let last = null;
  for (const model of [...new Set([goodModel, ...MODELS()].filter(Boolean))]) {
    if (usedUp.get(model) === day) continue;
    const res = await fetch(`${base}/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': gkey() }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { goodModel = model; recordAi('gemini', 'fit', 'ok', '', model); return parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')); }
    last = new Error(`Gemini ${res.status} (${model})`);
    if (res.status === 404) continue;
    recordAi('gemini', 'fit', res.status === 429 ? 'limited' : 'failed', last.message, model);
    if (res.status === 429) { usedUp.set(model, day); if (goodModel === model) goodModel = null; continue; }
    break;
  }
  throw last || new Error('Gemini limit');
}

async function askClaude(prompt, img) {
  const model = process.env.FIT_AI_CLAUDE || 'claude-haiku-4-5';
  const res = await fetch(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': akey(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 250, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }] }] }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) { recordAi('anthropic', 'fit', res.status === 429 ? 'limited' : 'failed', `Claude ${res.status}`, model); throw new Error(`Claude ${res.status}`); }
  const j = await res.json();
  recordAi('anthropic', 'fit', 'ok', '', model);
  return parse((j.content || []).map((c) => c.text || '').join(''));
}

const hasSizes = (p) => { try { return JSON.parse(p.sizes_json || '[]').length > 0; } catch { return false; } };

/** Reads one product. Returns 'done' | 'skipped' | 'failed'. Safe to call any time (it remembers what it already read). */
export async function analyzeFit(productId, { force = false } = {}) {
  if (!fitAiEnabled()) return 'skipped';
  const p = q.get('SELECT * FROM products WHERE id=?', [productId]);
  if (!p || p.size_fit || !p.size_fit_ai_on || !hasSizes(p)) return 'skipped';
  if (/perfume|fragrance|beauty|makeup|skincare/i.test(p.department || '')) return 'skipped';
  const mid = q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [p.id]);
  if (!mid) return 'skipped';
  const t = { name: p.name_ar || p.name_en, desc: (p.description_ar || '').slice(0, 500), material: p.material_ar };
  const key = crypto.createHash('sha1').update(JSON.stringify([t, mid])).digest('hex').slice(0, 16);
  if (!force && p.size_fit_ai_key === key) return 'skipped';
  const m = q.get('SELECT * FROM media WHERE id=?', [mid]);
  let src;
  for (const f of ['md.jpg', 'md.webp', 'original.jpg']) { try { src = await readMediaFile(m, f); break; } catch { /* next size */ } }
  if (!src) return 'skipped';
  const prompt = PROMPT(t), img = await b64(src);
  let out = null;
  if (gkey()) { try { out = await askGemini(prompt, img); } catch { /* try Claude */ } }
  if (!out && akey()) { try { out = await askClaude(prompt, img); } catch { /* give up */ } }
  if (!out) return 'failed';
  const note = String(out.note_ar || '').replace(/<[^>]*>/g, '').trim().slice(0, 140);
  const ok = ['small', 'true', 'large'].includes(out.fit) && Number(out.confidence) >= 0.6 && note.length > 5 && !/https?:|www\.|@|\d{5,}/i.test(note); // the note is model text: never let a product description smuggle a link or phone number through
  update('products', p.id, {
    size_fit_ai: ok ? out.fit : null,
    size_fit_ai_note: ok ? note : null,
    size_fit_ai_stretch: ok && out.stretch ? 1 : 0,
    size_fit_ai_key: key,
  });
  return 'done';
}

/** Fire and forget after a save: never slows or breaks the save. */
export function analyzeFitSoon(productId) { setTimeout(() => { analyzeFit(productId).catch(() => {}); }, 1500); }

/** Admin backfill: reads up to `limit` products that have no reading yet, one at a time. */
export async function backfillFit(limit = 40) {
  const rows = q.all(`SELECT id FROM products WHERE status='active' AND size_fit_ai_on=1 AND (size_fit IS NULL OR size_fit='') AND size_fit_ai_key IS NULL AND sizes_json IS NOT NULL AND sizes_json NOT IN ('[]','') ORDER BY id DESC LIMIT ?`, [limit]);
  const res = { done: 0, skipped: 0, failed: 0 };
  for (const r of rows) { const s = await analyzeFit(r.id); res[s]++; if (s === 'failed') break; }
  return { ...res, total: rows.length };
}
