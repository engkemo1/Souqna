/**
 * Morning summary for store owners: yesterday's orders and sales, as a push notification on the phones
 * where they turned alerts on. Runs once a day around 9:00 Cairo time; never breaks the server.
 */
import { q } from '../db/index.js';
import { notifyStore } from './push.js';

const cairoNow = () => new Date(Date.now() + 3 * 3600e3); // Egypt is UTC+3 (summer time), close enough for a 9am nudge
const day = (d) => d.toISOString().slice(0, 10);

export function sendDailySummaries() {
  const today = day(cairoNow());
  if (q.val("SELECT value FROM app_settings WHERE key='daily_summary_last'") === today) return 0;
  q.run("INSERT INTO app_settings(key,value) VALUES('daily_summary_last',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [today]);
  const yesterday = day(new Date(cairoNow().getTime() - 864e5));
  const rows = q.all(`SELECT o.store_id, COUNT(*) AS n, COALESCE(SUM(o.total),0) AS sales
    FROM orders o WHERE o.status<>'cancelled' AND date(o.created_at,'+3 hours')=?
      AND o.store_id IN (SELECT DISTINCT store_id FROM push_subscriptions) GROUP BY o.store_id`, [yesterday]);
  for (const r of rows) {
    notifyStore(r.store_id, { title: 'ملخص امبارح ☀️', body: `${r.n} ${r.n === 1 ? 'طلب' : 'طلبات'} · مبيعات ${r.sales} ج.م`, url: '/dashboard', tag: 'daily-summary' });
  }
  return rows.length;
}

export function startDailySummary() {
  const tick = () => {
    try { if (cairoNow().getUTCHours() === 9) sendDailySummaries(); } catch (e) { console.error(`[summary] ${e.message}`); }
  };
  setInterval(tick, 10 * 60e3).unref();
}
