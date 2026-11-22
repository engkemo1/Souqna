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
    const s = JSON.parse(localStorage.getItem('tw.perf2') || 'null');
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
  // Measure twice (about 1 s each, a few seconds apart) and use the MEDIAN frame time, so one janky moment (images decoding,
  // a throttled/background tab, a tab switch) can't wrongly demote a good device. Only two slow verdicts in a row count.
  let slow = 0; let runs = 0;
  const probe = () => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) { if (runs < 6) { runs += 1; setTimeout(probe, 3000); } return; }
    const d = []; let last = performance.now(); let bad = false;
    const onVis = () => { bad = true; };
    document.addEventListener('visibilitychange', onVis, { once: true });
    const tick = (t) => {
      d.push(t - last); last = t;
      if (d.length < 45) { requestAnimationFrame(tick); return; }
      document.removeEventListener('visibilitychange', onVis);
      runs += 1;
      if (bad) { if (runs < 6) setTimeout(probe, 3000); return; }
      d.sort((x, y) => x - y);
      const med = d[d.length >> 1];
      const want = med > 50 ? 2 : med > 34 ? 1 : 0; // median slower than ~20 fps → low · slower than ~30 fps → mid
      const cur = ORDER.indexOf(perfTier());
      if (want > cur) {
        slow += 1;
        if (slow >= 2) { const t2 = ORDER[want]; setPerf(t2); try { localStorage.setItem('tw.perf2', JSON.stringify({ t: t2, ts: Date.now() })); } catch { /* ignore */ } }
        else setTimeout(probe, 2500);
      } else {
        slow = 0;
        if (want === 0 && html.dataset.perfReady !== '1') { html.dataset.perfReady = '1'; window.dispatchEvent(new Event('perf-change')); } // device proved smooth → heavy decorative motion may start
      }
    };
    requestAnimationFrame(tick);
  };
  const go = () => setTimeout(probe, 2500);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
