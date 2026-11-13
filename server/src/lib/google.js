/** Sign in with Google: verifies the ID token Google hands to the browser (no extra dependency, keys come from Google's public JWKS). */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from './errors.js';

let cache = { at: 0, keys: new Map() };
async function googleKeys(force = false) {
  if (!force && cache.keys.size && Date.now() - cache.at < 3600e3) return cache.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`google certs ${r.status}`);
  const { keys } = await r.json();
  cache = { at: Date.now(), keys: new Map((keys || []).map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])) };
  return cache.keys;
}

export const googleReady = () => Boolean(config.googleClientId);

/** Returns { sub, email, name } for a valid Google credential, or throws an AppError. */
export async function verifyGoogleCredential(credential) {
  if (!googleReady()) throw new AppError(503, 'google_unavailable', 'Google sign-in is not set up.');
  try {
    const kid = jwt.decode(String(credential), { complete: true })?.header?.kid;
    let key = kid ? (await googleKeys()).get(kid) : null;
    if (!key && kid) key = (await googleKeys(true)).get(kid);
    if (!key) throw new Error('unknown key');
    const p = jwt.verify(String(credential), key, { algorithms: ['RS256'], audience: config.googleClientId, issuer: ['https://accounts.google.com', 'accounts.google.com'] });
    if (!p.sub || p.email_verified === false) throw new Error('not verified');
    return { sub: String(p.sub), email: p.email ? String(p.email).toLowerCase() : null, name: String(p.name || p.given_name || '').trim() };
  } catch (e) {
    console.error(`[google] sign-in rejected: ${e.message}`);
    throw new AppError(401, 'google_invalid', 'Google sign-in failed. Please try again.');
  }
}
