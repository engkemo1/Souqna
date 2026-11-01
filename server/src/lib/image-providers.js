/**
 * Image-generation providers. A provider is `async ({ prompt, slug, level }) => { buffer, mime }`.
 *
 * cloudflare — Cloudflare Workers AI, model @cf/black-forest-labs/flux-1-schnell (override with IMAGE_GEN_CF_MODEL).
 *   Uses the credentials the app already has for Workers AI (CF_AI_TOKEN + CF_ACCOUNT_ID / R2_ACCOUNT_ID); no new service or key.
 *   Cost (Cloudflare pricing page, Oct 2026): 4.80 neurons per 512×512 tile + 9.60 per step ($0.011 per 1,000 neurons; 10,000 free/day).
 *   The docs do not state the output size, so cost per image is an estimate: ~43 neurons (≈$0.0005) if one tile at 4 steps, more if the output is larger.
 * Documented limits: prompt 1–2048 chars, steps ≤ 8 (default 4); response image is base64 in `image` (REST envelope: result.image).
 *   NOTE: the request/response shape below follows Cloudflare's documented JSON API ({prompt, steps} → result.image as base64) but has NOT
 *   been exercised against the live API from this repository; the first admin-triggered generation is the real verification.
 */
import { registerProvider } from './image-gen.js';

const cfAccount = () => process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
const cfToken = () => process.env.CF_AI_TOKEN || '';
export const cloudflareReady = () => !!(cfAccount() && cfToken());

export class ProviderError extends Error {
  constructor(message, { status = 0, limited = false, retryable = false } = {}) { super(message); this.status = status; this.limited = limited; this.retryable = retryable; }
}

export async function cloudflareFlux({ prompt }, { fetchImpl = fetch } = {}) {
  const model = process.env.IMAGE_GEN_CF_MODEL || '@cf/black-forest-labs/flux-1-schnell';
  const base = process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4';
  let res;
  try {
    res = await fetchImpl(`${base}/accounts/${cfAccount()}/ai/run/${model}`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${cfToken()}` },
      body: JSON.stringify({ prompt: String(prompt).slice(0, 2000), steps: Math.min(8, Math.max(1, Math.round(Number(process.env.IMAGE_GEN_STEPS)) || 4)) }), signal: AbortSignal.timeout(90_000),
    });
  } catch (e) { throw new ProviderError(`Cloudflare AI request failed: ${e.message}`, { retryable: true }); }
  const type = res.headers.get('content-type') || '';
  if (res.ok && type.startsWith('image/')) return { buffer: Buffer.from(await res.arrayBuffer()), mime: type.split(';')[0] };
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) {
    const msg = JSON.stringify(j.errors || j).slice(0, 200);
    throw new ProviderError(`Cloudflare AI ${res.status}: ${msg}`, { status: res.status, limited: res.status === 429 || /neuron|limit|quota/i.test(msg), retryable: res.status >= 500 });
  }
  const b64 = j.result?.image;
  if (!b64 || typeof b64 !== 'string') throw new ProviderError('Cloudflare AI returned no image.', { retryable: true });
  return { buffer: Buffer.from(b64, 'base64'), mime: 'image/jpeg' };
}

/** Registered at startup only when the credentials exist; registering never calls the provider. */
export function registerDefaultProviders() { if (cloudflareReady()) registerProvider('cloudflare', (args) => cloudflareFlux(args)); }
