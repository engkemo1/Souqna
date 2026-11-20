import { useEffect, useState } from 'react';
import { api } from './api.js';

/** Live Twist sale campaigns for the storefront (countdown, top bar, falling effect, hero). Shared fetch, refreshed every minute. */
let state = { discount: null, shipping: null, offset: 0, loaded: false };
const subs = new Set();
let timer = null;
let inflight = false;

async function load() {
  if (inflight) return;
  inflight = true;
  try {
    const d = await api('/campaigns/active');
    state = { discount: d.discount || null, shipping: d.shipping || null, offset: (d.serverNow || Date.now()) - Date.now(), loaded: true };
    subs.forEach((f) => f(state));
  } catch { /* no campaign info → show nothing */ } finally { inflight = false; }
}

export function useCampaigns() {
  const [s, setS] = useState(state);
  useEffect(() => {
    subs.add(setS);
    if (!state.loaded) load();
    if (!timer) timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { subs.delete(setS); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
  }, []);
  return s;
}

/** Remaining ms to `endsAt`, ticking each second (server clock corrected). */
export function useCountdown(endsAt, offset = 0, on = true) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset, on]);
  const left = Math.max(0, (endsAt || 0) - now);
  const s = Math.floor(left / 1000);
  return { left, d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
