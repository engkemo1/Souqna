/** Same-day delivery: the store switches it on for TODAY (Cairo date) with a cut-off time; it switches itself off at the cut-off and at midnight. */
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function cairoNow(d = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/** Is this store delivering today right now? (accepts a stores row) */
export function sameDayActive(s, now = cairoNow()) {
  return !!s && s.same_day_date === now.date && now.hm < (s.same_day_until || '18:00');
}

/** SQL fragment + params that keep only stores with same-day delivery on, for queries that alias stores as `s`. */
export function sameDaySql() {
  const n = cairoNow();
  return { sql: 's.same_day_date=? AND s.same_day_until>?', params: [n.date, n.hm] };
}
