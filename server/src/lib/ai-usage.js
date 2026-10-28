/**
 * Counts what we ask Gemini, per day, so the admin can see how much of the free daily limit is used.
 * Google does not tell an app how much of its limit is left, so we count our own calls and remember when Google said
 * "limit reached" (HTTP 429). Google's daily limit restarts at midnight Pacific time; the day is counted the same way.
 */
import { q } from '../db/index.js';

const KINDS = ['photo_check', 'moda'];
export const usageDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

let ready = false;
function ensure() {
  if (ready) return;
  q.run(`CREATE TABLE IF NOT EXISTS ai_usage (
    day TEXT NOT NULL, provider TEXT NOT NULL, kind TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0, limited INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, provider, kind))`);
  ready = true;
}

const setting = (k, v) => q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
const getSetting = (k) => q.get('SELECT value FROM app_settings WHERE key=?', [k])?.value ?? null;

/** outcome: 'ok' | 'limited' (Google said the limit is reached) | 'failed' (anything else). Never throws. */
export function recordAi(provider, kind, outcome, message = '', model = '') {
  try {
    ensure();
    const col = outcome === 'ok' ? 'ok' : outcome === 'limited' ? 'limited' : 'failed';
    q.run(`INSERT INTO ai_usage(day, provider, kind, ${col}) VALUES(?,?,?,1) ON CONFLICT(day, provider, kind) DO UPDATE SET ${col}=${col}+1`, [usageDay(), provider, KINDS.includes(kind) ? kind : 'moda']);
    if (outcome === 'limited') setting(`${provider}_limited_at`, new Date().toISOString());
    if (outcome === 'ok') setting(`${provider}_ok_at`, new Date().toISOString());
    if (model) setting(`${provider}_model_${kind}`, model);
    if (outcome !== 'ok' && message) setting(`${provider}_last_error`, String(message).slice(0, 300));
  } catch { /* counting must never break the real work */ }
}

/** When Google's daily limit restarts next (midnight Pacific), as an ISO time. */
function nextReset(now = new Date()) {
  const today = usageDay(now);
  for (let h = 1; h <= 26; h++) {
    const t = new Date(now.getTime() + h * 3600e3);
    if (usageDay(t) !== today) {
      // step back to the exact minute the Pacific date changed
      let lo = t.getTime() - 3600e3, hi = t.getTime();
      while (hi - lo > 60e3) { const mid = (lo + hi) / 2; if (usageDay(new Date(mid)) === today) lo = mid; else hi = mid; }
      let at = Math.floor(hi / 60e3) * 60e3;
      if (usageDay(new Date(at)) === today) at += 60e3;
      return new Date(at).toISOString();
    }
  }
  return null;
}

export function geminiUsage({ configured }) {
  ensure();
  const day = usageDay();
  const rows = q.all("SELECT day, kind, ok, limited, failed FROM ai_usage WHERE provider='gemini' ORDER BY day DESC LIMIT 60");
  const byDay = new Map();
  for (const r of rows) {
    const d = byDay.get(r.day) || { day: r.day, total: 0, ok: 0, limited: 0, failed: 0, kinds: {} };
    d.ok += r.ok; d.limited += r.limited; d.failed += r.failed; d.total += r.ok + r.limited + r.failed;
    d.kinds[r.kind] = (d.kinds[r.kind] || 0) + r.ok + r.limited + r.failed;
    byDay.set(r.day, d);
  }
  const today = byDay.get(day) || { day, total: 0, ok: 0, limited: 0, failed: 0, kinds: {} };
  const limitedAt = getSetting('gemini_limited_at'), okAt = getSetting('gemini_ok_at');
  // "stopped now" = Google refused for the limit today and nothing worked since
  const stopped = Boolean(limitedAt && usageDay(new Date(limitedAt)) === day && (!okAt || okAt < limitedAt));
  const limit = Number(getSetting('gemini_daily_limit')) || 0;
  return {
    configured, day, today, limit, stopped, limitedAt, lastError: getSetting('gemini_last_error') || '',
    resetsAt: nextReset(), history: [...byDay.values()].slice(0, 7),
    models: { photo_check: getSetting('gemini_model_photo_check') || '', moda: getSetting('gemini_model_moda') || '' },
  };
}

export function saveGeminiLimit(n) { setting('gemini_daily_limit', Math.max(0, Math.round(Number(n) || 0))); }
