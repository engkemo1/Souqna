import { z } from 'zod';

/**
 * Weekly opening schedule (display only — it never blocks an order).
 * days[0..6] = Sunday..Saturday, each { closed, shifts: [{ open, close }] } with up to 2 shifts (a break in the middle);
 * a shift whose close <= open runs past midnight. holidays = date ranges (Cairo dates) when the store is closed.
 */
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_invalid');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_invalid');
const shift = z.object({ open: hm, close: hm });
export const hoursSchema = z.object({
  days: z.array(z.object({ closed: z.boolean(), shifts: z.array(shift).max(2) })).length(7),
  holidays: z.array(z.object({ from: date, to: date, note: z.string().trim().max(60).optional().default('') })).max(40).default([]),
}).superRefine((v, ctx) => {
  v.days.forEach((d, i) => { if (!d.closed && !d.shifts.length) ctx.addIssue({ code: 'custom', path: ['days', i], message: 'shift_required' }); });
  v.holidays.forEach((x, i) => { if (x.to < x.from) ctx.addIssue({ code: 'custom', path: ['holidays', i, 'to'], message: 'date_order' }); });
});

/** The legacy columns (opens_at / closes_at / day_off) are kept in step with the schedule so older screens keep working. */
export function legacyFromSchedule(v) {
  const firstOpen = v.days.find((d) => !d.closed && d.shifts.length);
  if (!firstOpen) return { opens_at: null, closes_at: null, day_off: null };
  const closedDays = v.days.map((d, i) => (d.closed ? i : -1)).filter((i) => i >= 0);
  return { opens_at: firstOpen.shifts[0].open, closes_at: firstOpen.shifts[firstOpen.shifts.length - 1].close, day_off: closedDays.length === 1 ? closedDays[0] : null };
}

/** What the storefront receives as `store.hours` (legacy fields stay, so nothing that reads them breaks). */
export function storeHours(s) {
  let sched = null;
  if (s.hours_json) { try { const p = hoursSchema.safeParse(JSON.parse(s.hours_json)); if (p.success) sched = p.data; } catch { /* ignore a bad blob */ } }
  if (sched) {
    const l = legacyFromSchedule(sched);
    return { open: l.opens_at, close: l.closes_at, dayOff: l.day_off, days: sched.days, holidays: sched.holidays };
  }
  return s.opens_at && s.closes_at ? { open: s.opens_at, close: s.closes_at, dayOff: s.day_off ?? null } : null;
}
