/**
 * Fingerprint / Face ID lock for the shop dashboard.
 * The session itself stays signed in (until the owner logs out); this only asks the phone to confirm
 * "it is really you" when the app is opened, using the device's own fingerprint / face / screen-lock.
 */
const KEY = 'twist.bio.v1';
const OK = 'twist.bio.ok';
const HIDDEN = 'twist.bio.hidden';

const rand = (n = 32) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

export async function bioSupported() {
  try {
    return !!(window.isSecureContext && window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}
export const bioEnabled = (userId) => { const r = read(); return !!r && String(r.uid) === String(userId); };
export const bioUnlocked = () => { try { return sessionStorage.getItem(OK) === '1'; } catch { return false; } };
const markUnlocked = () => { try { sessionStorage.setItem(OK, '1'); } catch { /* ignore */ } };
export const bioLock = () => { try { sessionStorage.removeItem(OK); } catch { /* ignore */ } };
export const bioDisable = () => { try { localStorage.removeItem(KEY); sessionStorage.removeItem(OK); } catch { /* ignore */ } };

export async function bioEnable(user) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(), rp: { name: 'Twist' },
      user: { id: new TextEncoder().encode(`u${user.id}`), name: user.email, displayName: user.name || user.email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    },
  });
  if (!cred) throw new Error('cancelled');
  localStorage.setItem(KEY, JSON.stringify({ uid: user.id, id: b64(cred.rawId) }));
  markUnlocked();
}

export async function bioUnlock() {
  const r = read();
  if (!r) return true;
  const res = await navigator.credentials.get({
    publicKey: { challenge: rand(), allowCredentials: [{ type: 'public-key', id: unb64(r.id) }], userVerification: 'required', timeout: 60000 },
  });
  if (!res) throw new Error('cancelled');
  markUnlocked();
  return true;
}

/** Remember when the app went to the background, so it can ask again after a while away. */
export function noteHidden() { try { sessionStorage.setItem(HIDDEN, String(Date.now())); } catch { /* ignore */ } }
export function awayLong(ms = 2 * 60e3) {
  try { const t = Number(sessionStorage.getItem(HIDDEN)); sessionStorage.removeItem(HIDDEN); return t > 0 && Date.now() - t > ms; } catch { return false; }
}
