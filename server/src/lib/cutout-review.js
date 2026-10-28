/**
 * A second pair of eyes on every background removal: Gemini looks at the photo before and after and says whether the
 * product came out complete and alone. The local checks in cutout.js catch the usual traces of a wrong cut; this catches
 * the rest (a hand, a chair, a reflection, a hanger, a missing sleeve, whatever the case).
 * The cut is used only when Gemini clearly approves. No answer (no network, limit reached, unclear reply) = not approved,
 * and the photo keeps its real background. Without a Gemini key the local checks alone decide (the old behaviour).
 * CUTOUT_REVIEW=0 turns the review off.
 */
import crypto from 'node:crypto';
import sharp from 'sharp';
import { recordAi } from './ai-usage.js';

const key = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
export const reviewEnabled = () => process.env.CUTOUT_REVIEW !== '0' && Boolean(key());

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

async function ask(original, result) {
  const img = async (b) => ({ inlineData: { mimeType: 'image/jpeg', data: (await sharp(b).resize({ width: 640, height: 640, fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()).toString('base64') } });
  const body = {
    contents: [{ role: 'user', parts: [{ text: PROMPT }, await img(original), await img(result)] }],
    generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json' },
  };
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
  let last = null;
  for (const model of [...new Set([goodModel, ...MODELS()].filter(Boolean))]) {
    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      goodModel = model;
      recordAi('gemini', 'photo_check', 'ok', '', model);
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    }
    last = new Error(`Gemini ${res.status} (${model}): ${JSON.stringify(j.error || j).slice(0, 160)}`);
    if (res.status !== 404) recordAi('gemini', 'photo_check', res.status === 429 ? 'limited' : 'failed', last.message, model);
    if (res.status !== 404) break; // only a retired model name is worth another try
  }
  throw last || new Error('no Gemini model');
}

// how many times the review could not be asked (no answer at all), so a batch job can tell "not trusted" from "not checked"
let unavailable = 0;
export const reviewUnavailableCount = () => unavailable;

/** true = the cut-out may be used. */
export async function reviewCutout(original, result) {
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
    console.error(`[cutout] review unavailable (${e.message}): keeping the real background`);
    return false; // not cached: next time it may work
  }
  if (fp) {
    cache.set(fp, { ok, at: Date.now() });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return ok;
}
