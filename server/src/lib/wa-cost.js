/**
 * WhatsApp message cost tracking.
 * Meta reports, per message, a delivery status that carries its pricing category and whether it is billable.
 * The webhook (routes/wa.js) stores those here; the admin screen sums them by category and multiplies by the rates
 * the admin typed in (take them from the Meta invoice / rate card: they change). Nothing here can break an order.
 */
import { q } from '../db/index.js';

export const WA_CATEGORIES = ['utility', 'authentication', 'marketing', 'service'];
const RATE_KEY = (c) => `wa_rate_${c}`;

/** One entry of a webhook `statuses` array. Keeps the latest status; pricing is only present on some statuses, so never overwrite it with null. */
export function recordWaStatus(s) {
  try {
    if (!s?.id) return;
    const category = s.pricing?.category ? String(s.pricing.category).toLowerCase() : null;
    const billable = s.pricing ? (s.pricing.billable === false ? 0 : 1) : null;
    const err = s.errors?.[0] ? `${s.errors[0].code || ''} ${s.errors[0].title || ''}`.trim().slice(0, 200) : null;
    q.run(
      `INSERT INTO wa_msgs (id, to_wa, status, category, billable, error, ts) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, category=COALESCE(excluded.category, wa_msgs.category), billable=COALESCE(excluded.billable, wa_msgs.billable), error=COALESCE(excluded.error, wa_msgs.error), ts=MAX(wa_msgs.ts, excluded.ts)`,
      [String(s.id), String(s.recipient_id || '').slice(0, 30), String(s.status || '').slice(0, 20), category, billable, err, Number(s.timestamp) || Math.floor(Date.now() / 1000)],
    );
  } catch (e) { console.error(`[wa-cost] status not recorded: ${e.message}`); }
}

export function waRates() {
  const out = {};
  for (const c of WA_CATEGORIES) {
    const v = Number(q.get('SELECT value FROM app_settings WHERE key=?', [RATE_KEY(c)])?.value);
    out[c] = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  const fx = Number(q.get("SELECT value FROM app_settings WHERE key='wa_rate_fx'")?.value);
  out.fx = Number.isFinite(fx) && fx > 0 ? fx : 0;
  return out;
}

export function saveWaRates(b) {
  const put = (k, v) => q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
  for (const c of WA_CATEGORIES) if (b[c] !== undefined) put(RATE_KEY(c), b[c]);
  if (b.fx !== undefined) put('wa_rate_fx', b.fx);
}

/** Counts and cost for the last `days` days. Rates are USD per message; fx is EGP per USD (0 = not set). */
export function waUsage(days = 30) {
  const d = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  const since = Math.floor(Date.now() / 1000) - d * 86400;
  const rates = waRates();
  const rows = q.all(
    `SELECT COALESCE(category,'unknown') AS category, COUNT(*) AS total, SUM(CASE WHEN billable=1 THEN 1 ELSE 0 END) AS billable,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM wa_msgs WHERE ts >= ? GROUP BY COALESCE(category,'unknown')`, [since]);
  const byCategory = rows.map((r) => ({ ...r, billable: r.billable || 0, failed: r.failed || 0, usd: +((r.billable || 0) * (rates[r.category] || 0)).toFixed(4) }));
  const byDay = q.all(
    `SELECT date(ts,'unixepoch') AS day, COUNT(*) AS total, SUM(CASE WHEN billable=1 THEN 1 ELSE 0 END) AS billable
       FROM wa_msgs WHERE ts >= ? GROUP BY day ORDER BY day DESC LIMIT 60`, [since]);
  const totalUsd = +byCategory.reduce((s, r) => s + r.usd, 0).toFixed(4);
  return { days: d, rates, byCategory, byDay, totals: { messages: byCategory.reduce((s, r) => s + r.total, 0), billable: byCategory.reduce((s, r) => s + r.billable, 0), usd: totalUsd, egp: rates.fx ? +(totalUsd * rates.fx).toFixed(2) : null } };
}
