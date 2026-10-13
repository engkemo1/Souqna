/** Remembers how long the last photo searches really took (per device) so the progress bar / ETA is realistic. */
const KEY = 'souqna.visualMs';
const DEFAULT_MS = 6000;

export function expectedVisualMs() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]').filter((n) => Number.isFinite(n) && n > 0);
    if (!list.length) return DEFAULT_MS;
    const sorted = [...list].sort((a, b) => a - b);
    return Math.min(60_000, Math.max(1500, sorted[Math.floor(sorted.length / 2)])); // median of the last few
  } catch { return DEFAULT_MS; }
}

export function recordVisualMs(ms) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]').filter((n) => Number.isFinite(n));
    localStorage.setItem(KEY, JSON.stringify([...list, Math.round(ms)].slice(-5)));
  } catch { /* private mode — ignore */ }
}
