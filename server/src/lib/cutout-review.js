/**
 * A second pair of eyes on every background removal: Gemini looks at the photo before and after and says whether the
 * product came out complete and alone. The local checks in cutout.js catch the usual traces of a wrong cut; this catches
 * the rest (a hand, a chair, a reflection, a hanger, a missing sleeve, whatever the case).
 * The cut is used only when a reviewer clearly approves. Gemini first (each model has its own free daily limit, so a used-up
 * model hands over to the next), then Claude when ANTHROPIC_API_KEY is set. When nobody can answer, see reviewCutout().
 * Without any key the local checks alone decide (the old behaviour).
 * CUTOUT_REVIEW=0 turns the review off.
 */
import crypto from 'node:crypto';
import sharp from 'sharp';
import { recordAi, usageDay } from './ai-usage.js';

const key = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
export const reviewEnabled = () => process.env.CUTOUT_REVIEW !== '0' && Boolean(key() || process.env.ANTHROPIC_API_KEY);

// Flash-Lite: on the free tier it allows ~25x more requests a day than Flash (500 vs 20) and is enough to judge a cut.
// A name Google has retired answers 404 and the next one is tried.
const MODELS = () => [...new Set([process.env.CUTOUT_REVIEW_MODEL, 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-latest'].filter(Boolean))];
let goodModel = null;

// The same photo is judged twice (owner's preview, then the real upload at a larger size): remember recent answers.
const cache = new Map();
const CACHE_MS = 60 * 60e3;
async function fingerprint(img) {
  const { data } = await sharp(img).resize(24, 30, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return crypto.createHash('sha1').update(Buffer.from(data.map((v) => v >> 5))).digest('hex');
}

const PROMPT = `You check background removal for an online clothing shop. Image 1 is the shop's original photo. Image 2 is the
same photo after the background was replaced by plain white. Compare them carefully, especially along the edges.
Reply with ONE JSON object only:
{"complete": true if every part of the product in image 1 is fully present in image 2 (sleeves, cuffs, hems, hood, straps, collar, laces, every piece of the set),
 "clean": true if image 2 contains ONLY the product: no pieces of a rack, pole, shelf, hanger hook, wall, floor, shadow patch, mannequin stand, hand, furniture or any other object,
 "problem": "a few words about what is wrong, or empty"}
Be strict: a small piece of rack or wall left beside the product, or a missing piece of the product, means false.`;

const b64 = async (b) => (await sharp(b).resize({ width: 640, height: 640, fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64');
const parse = (text) => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
class Limited extends Error {}
const usedUp = new Map(); // model -> the (Pacific) day Google said its limit was reached

/** Gemini. Every model has its own daily limit, so when one is used up the next one is tried. */
async function askGemini(original, result) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: await b64(original) } }, { inlineData: { mimeType: 'image/jpeg', data: await b64(result) } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json' },
  };
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
  let last = null, limited = false;
  const day = usageDay();
  for (const model of [...new Set([goodModel, ...MODELS()].filter(Boolean))]) {
    if (usedUp.get(model) === day) { limited = true; continue; } // already told "limit reached" today: don't ask again until it renews
    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      goodModel = model;
      recordAi('gemini', 'photo_check', 'ok', '', model);
      return parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
    }
    last = new Error(`Gemini ${res.status} (${model}): ${JSON.stringify(j.error || j).slice(0, 160)}`);
    if (res.status === 404) continue; // retired name
    recordAi('gemini', 'photo_check', res.status === 429 ? 'limited' : 'failed', last.message, model);
    if (res.status === 429) { limited = true; usedUp.set(model, day); if (goodModel === model) goodModel = null; continue; } // this model's day is used up: next model
    break; // a real error (bad key, network): the other models would fail the same way
  }
  throw limited ? new Limited(last?.message || 'Gemini limit') : (last || new Error('no Gemini model'));
}

/** Claude, only when its key is set on the server (paid per use; a photo check costs a fraction of a cent). */
const anthropicKey = () => process.env.ANTHROPIC_API_KEY || '';
async function askClaude(original, result) {
  const img = async (b) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await b64(b) } });
  const model = process.env.CUTOUT_REVIEW_CLAUDE || 'claude-haiku-4-5';
  const res = await fetch(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 200, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, await img(original), await img(result)] }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const msg = `Claude ${res.status}: ${(await res.text()).slice(0, 160)}`;
    recordAi('anthropic', 'photo_check', res.status === 429 ? 'limited' : 'failed', msg, model);
    throw new Error(msg);
  }
  const j = await res.json();
  recordAi('anthropic', 'photo_check', 'ok', '', model);
  return parse((j.content || []).map((c) => c.text || '').join(''));
}

/** The reviewers, in order. Gemini first (free), then Claude if configured. */
async function ask(original, result) {
  const errors = [];
  if (key()) { try { return await askGemini(original, result); } catch (e) { errors.push(e.message); } }
  if (anthropicKey()) { try { return await askClaude(original, result); } catch (e) { errors.push(e.message); } }
  throw new Error(errors.join(' | ') || 'no reviewer configured');
}

// how many times the review could not be asked (no answer at all), so a batch job can tell "not trusted" from "not checked"
let unavailable = 0;
export const reviewUnavailableCount = () => unavailable;

/**
 * true = the cut-out may be used.
 * `ownerSees`: the shop owner is looking at the result right now (the preview before upload, or they picked the white
 * background themselves). When no AI reviewer can answer (every daily limit used up, no network), the local checks
 * decide and the owner's own eyes are the last check. Without an owner (re-making old photos, WhatsApp uploads) an
 * unchecked cut is never used.
 */
export async function reviewCutout(original, result, { ownerSees = false } = {}) {
  if (!reviewEnabled()) return true;
  const fp = await fingerprint(original).catch(() => null);
  const hit = fp && cache.get(fp);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  let ok = false;
  try {
    const v = await ask(original, result);
    ok = v?.complete === true && v?.clean === true;
    if (!ok) console.log(`[cutout] review said no (${String(v?.problem || 'unclear').slice(0, 120)}): keeping the real background`);
  } catch (e) {
    unavailable++;
    if (ownerSees) { console.log(`[cutout] no AI reviewer answered (${e.message.slice(0, 160)}): local checks passed, the owner sees the result`); return true; }
    console.error(`[cutout] review unavailable (${e.message.slice(0, 200)}): keeping the real background`);
    return false; // not cached: next time it may work
  }
  if (fp) {
    cache.set(fp, { ok, at: Date.now() });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return ok;
}
