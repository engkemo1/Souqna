/**
 * Device speed tier, decided once per visit and written on <html data-perf="high|mid|low">.
 *  high — desktop / strong phone: everything animates
 *  mid  — phones, mid-range devices, 3G: light motion only
 *  low  — weak devices, data-saver, 2G, or a device that proved slow: no blur effects, no extra motion
 * It starts from what the device reports, then measures real smoothness for ~1 second after the page settles and only ever
 * moves DOWN. A slow verdict is remembered for a week, so the next visit starts at the right level immediately.
 */
const ORDER = ['high', 'mid', 'low'];
const html = document.documentElement;
const nav = navigator;
const conn = nav.connection || {};
const mem = nav.deviceMemory; const cores = nav.hardwareConcurrency;

function start() {
  const weak = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') || (mem && mem <= 2) || (cores && cores <= 2);
  const phone = (() => { try { return window.matchMedia('(max-width: 767px)').matches; } catch { return false; } })();
  const mid = /3g/.test(conn.effectiveType || '') || (mem && mem <= 4) || (cores && cores <= 4) || phone;
  let tier = weak ? 'low' : mid ? 'mid' : 'high';
  try {
    const s = JSON.parse(localStorage.getItem('tw.perf') || 'null');
    if (s && Date.now() - s.ts < 7 * 864e5 && ORDER.indexOf(s.t) > ORDER.indexOf(tier)) tier = s.t;
  } catch { /* storage unavailable */ }
  return tier;
}

export function setPerf(t) {
  if (html.dataset.perf === t) return;
  html.dataset.perf = t;
  window.dispatchEvent(new Event('perf-change'));
}
export const perfTier = () => html.dataset.perf || 'high';

export function initPerf() {
  setPerf(start());
  if (typeof requestAnimationFrame !== 'function') return;
  const probe = () => {
    if (document.visibilityState !== 'visible') { setTimeout(probe, 2000); return; }
    let n = 0; let last = performance.now(); let sum = 0;
    const tick = (t) => {
      sum += t - last; last = t; n += 1;
      if (n < 50) { requestAnimationFrame(tick); return; }
      const avg = sum / n; const cur = ORDER.indexOf(perfTier());
      const want = avg > 40 ? 2 : avg > 25 ? 1 : 0; // slower than ~25 fps → one step down, slower than ~40 ms/frame → straight to low
      if (want > cur) { const t2 = ORDER[want]; setPerf(t2); try { localStorage.setItem('tw.perf', JSON.stringify({ t: t2, ts: Date.now() })); } catch { /* ignore */ } }
    };
    requestAnimationFrame(tick);
  };
  const go = () => setTimeout(probe, 2500);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
