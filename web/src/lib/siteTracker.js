import { api } from './api.js';

/**
 * Anonymous, session-level beacons for the admin analytics (visits, campaigns, funnel). Nothing here can break the page.
 * - One visit beacon per browser session, with a random device id (server stores only a hash of it) and the traffic source.
 * - If the link carries ?src=...&camp=... the campaign is remembered for 7 days so an order later is credited to it.
 * - Never fires for the owner dashboard, admin, POS or design previews.
 */
const SKIP = /^\/(admin|dashboard|pos|scan|setup)(\/|$)/;
const CHECKOUT = /^\/(market-checkout|s\/[^/]+\/checkout)\/?$/;
const ORDER_DONE = /^\/(market-order-success|s\/[^/]+\/order\/[^/]+)\/?$/;
const ATTR_KEY = 'souqna.attr';
const WEEK = 7 * 864e5;

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function sourceOf() {
  const sp = new URLSearchParams(window.location.search);
  const tag = (sp.get('utm_source') || sp.get('src') || sp.get('ref') || '').toLowerCase();
  const ref = (document.referrer || '').toLowerCase();
  const s = `${tag} ${ref}`;
  if (/whatsapp|wa\.me/.test(s)) return 'whatsapp';
  if (/instagram/.test(s)) return 'instagram';
  if (/facebook|fb\.com|fbclid|messenger/.test(s) || sp.has('fbclid')) return 'facebook';
  if (/tiktok/.test(s)) return 'tiktok';
  if (/youtube|youtu\.be/.test(s)) return 'youtube';
  if (/google|bing|duckduckgo|yahoo/.test(s)) return 'google';
  if (!ref || ref.includes(window.location.host)) return 'direct';
  return 'other';
}
const campOf = () => { const sp = new URLSearchParams(window.location.search); return slug(sp.get('camp') || sp.get('utm_campaign') || ''); };

function remember(src, camp) {
  try { if (camp) localStorage.setItem(ATTR_KEY, JSON.stringify({ src, camp, t: Date.now() })); } catch { /* ignore */ }
}
function recall() {
  try {
    const a = JSON.parse(localStorage.getItem(ATTR_KEY) || 'null');
    return a && Date.now() - a.t < WEEK ? a : null;
  } catch { return null; }
}

export function trackSiteVisit(pathname) {
  try {
    if (SKIP.test(pathname)) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('preview')) return;
    const camp = campOf();
    const src = sourceOf();
    remember(src, camp); // even on a later page of the same session, a campaign link is remembered
    if (sessionStorage.getItem('souqna.site.visit')) return;
    sessionStorage.setItem('souqna.site.visit', '1');
    let vid = localStorage.getItem('souqna.vid');
    if (!vid) {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      vid = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
      localStorage.setItem('souqna.vid', vid);
    }
    api('/site/visit', { method: 'POST', body: { vid, src, camp: camp || undefined } }).catch(() => {});
  } catch { /* tracking must never break the page */ }
}

/** Funnel steps: reached checkout / finished an order (once per browser session each). */
export function trackPageEvents(pathname) {
  try {
    if (new URLSearchParams(window.location.search).get('preview')) return;
    if (CHECKOUT.test(pathname) && !sessionStorage.getItem('souqna.ev.checkout')) {
      sessionStorage.setItem('souqna.ev.checkout', '1');
      api('/site/event', { method: 'POST', body: { name: 'checkout_start' } }).catch(() => {});
    }
    if (ORDER_DONE.test(pathname) && !sessionStorage.getItem('souqna.ev.order')) {
      sessionStorage.setItem('souqna.ev.order', '1');
      const a = recall();
      api('/site/conversion', { method: 'POST', body: { src: a?.src || sourceOf(), camp: a?.camp || undefined } }).catch(() => {});
    }
  } catch { /* never break the page */ }
}
