/** Pure helpers behind the store info bar and the "Visit us" card (no React, so they are unit-tested in web/test/store-info.test.js). */

export const DAYS_AR = ['الأحد', 'الإتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
export const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const validHm = (v) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v ?? ''));

export function fmtTime(hm, ar) {
  let [h, m] = String(hm).split(':').map(Number);
  const pm = h >= 12; h = h % 12 || 12;
  const mm = m ? `:${String(m).padStart(2, '0')}` : '';
  return ar ? `${h}${mm} ${pm ? 'م' : 'ص'}` : `${h}${mm} ${pm ? 'PM' : 'AM'}`;
}

function cairoParts(at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), now: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** YYYY-MM-DD shifted by n days (pure calendar arithmetic, no timezone involved). */
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };

/** Saved hours in one shape: the weekly schedule when the store has one, otherwise the old single open/close (+ day off) turned into the same shape. */
export function scheduleOf(hours) {
  if (!hours) return null;
  if (Array.isArray(hours.days) && hours.days.length === 7) {
    const days = hours.days.map((d) => ({ closed: !!d.closed, shifts: (d.shifts || []).filter((x) => validHm(x.open) && validHm(x.close)) }));
    return { days, holidays: Array.isArray(hours.holidays) ? hours.holidays.filter((h) => h?.from && h?.to) : [] };
  }
  if (!validHm(hours.open) || !validHm(hours.close)) return null;
  const off = hours.dayOff !== null && hours.dayOff !== undefined ? Number(hours.dayOff) : -1;
  return { days: Array.from({ length: 7 }, (_, i) => ({ closed: i === off, shifts: i === off ? [] : [{ open: hours.open, close: hours.close }] })), holidays: [] };
}

const holidayOn = (sc, date) => sc.holidays.find((h) => h.from <= date && date <= h.to) || null;

/**
 * Walks the shifts from yesterday to a week ahead (Cairo time) and answers: open now? until when? next opening?
 * A shift whose close <= open runs past midnight and belongs to the day it started on; a holiday closes the whole day it covers.
 */
function walk(sc, at) {
  const { day, now, date } = cairoParts(at);
  const spans = [];
  for (let k = -1; k <= 8; k++) {
    const d = sc.days[(day + k + 7) % 7];
    if (d.closed || holidayOn(sc, addDays(date, k))) continue;
    for (const sh of d.shifts) { const o = toMin(sh.open), c = toMin(sh.close); spans.push({ k, start: k * 1440 + o, end: k * 1440 + (c <= o ? c + 1440 : c), open: sh.open, close: sh.close }); }
  }
  spans.sort((x, y) => x.start - y.start);
  const cur = spans.find((x) => x.start <= now && now < x.end) || null;
  const next = spans.find((x) => x.start > now) || null;
  return { cur, next, now, day, date, holiday: holidayOn(sc, date) };
}

/** Open right now? Uses Cairo time; handles closing after midnight, a break between two shifts and holidays. Null when the store has no (valid) hours, so nothing is claimed. */
export function openNow(hours, at = new Date()) {
  const sc = scheduleOf(hours);
  if (!sc) return null;
  return !!walk(sc, at).cur;
}

export const CLOSING_SOON_MIN = 60;

/**
 * Richer status from the same saved hours: 'open', 'closing_soon' (open, <= 60 min left, with the minutes) or 'closed'.
 * Closed also says when it opens next ({ at: 'HH:MM', dayOffset: 0 today | 1 tomorrow | n, weekday }) and, on a holiday, the note.
 * `opensTodayAt` is kept for older callers. Null when there are no valid hours.
 */
export function statusInfo(hours, at = new Date()) {
  const sc = scheduleOf(hours);
  if (!sc) return null;
  const w = walk(sc, at);
  if (w.cur) {
    const minsToClose = w.cur.end - w.now;
    return { state: minsToClose <= CLOSING_SOON_MIN ? 'closing_soon' : 'open', minsToClose, closesAt: w.cur.close };
  }
  const next = w.next ? { at: w.next.open, dayOffset: w.next.k, weekday: (w.day + w.next.k) % 7 } : null;
  return { state: 'closed', opensTodayAt: next && next.dayOffset === 0 ? next.at : null, next, holiday: w.holiday ? { note: w.holiday.note || '', to: w.holiday.to } : null };
}

/** Today's opening times as text ("10 ص – 2 م · 5 م – 11 م"), or null when the store is closed all day today. */
export function todayHours(hours, ar, at = new Date()) {
  const sc = scheduleOf(hours);
  if (!sc) return null;
  const { day, date } = cairoParts(at);
  const d = sc.days[day];
  if (d.closed || !d.shifts.length || holidayOn(sc, date)) return null;
  return d.shifts.map((x) => `${fmtTime(x.open, ar)} – ${fmtTime(x.close, ar)}`).join(' · ');
}

/** The whole week for the "Visit us" card: Saturday first (Egypt), identical days grouped is NOT done so every day stays readable. */
export function weekRows(hours, ar, at = new Date()) {
  const sc = scheduleOf(hours);
  if (!sc) return [];
  const { day, date } = cairoParts(at);
  return [6, 0, 1, 2, 3, 4, 5].map((i) => {
    const d = sc.days[i];
    const off = d.closed || !d.shifts.length;
    return { day: i, name: (ar ? DAYS_AR : DAYS_EN)[i], closed: off, text: off ? '' : d.shifts.map((x) => `${fmtTime(x.open, ar)} – ${fmtTime(x.close, ar)}`).join(' · '), today: i === day };
  });
}

/** Upcoming (or running) holidays, soonest first, already shown in the store's own words. */
export function upcomingHolidays(hours, at = new Date()) {
  const sc = scheduleOf(hours);
  if (!sc) return [];
  const { date } = cairoParts(at);
  return sc.holidays.filter((h) => h.to >= date).sort((a, b) => a.from.localeCompare(b.from)).slice(0, 5);
}

/** "25 minutes" / "25 دقيقة" with proper Arabic number forms. */
export function minutesLabel(n, ar) {
  if (!ar) return `${n} ${n === 1 ? 'minute' : 'minutes'}`;
  if (n === 1) return 'دقيقة';
  if (n === 2) return 'دقيقتين';
  return `${n} ${n >= 3 && n <= 10 ? 'دقائق' : 'دقيقة'}`;
}

/** WhatsApp number in international form, or null when the saved value cannot be a phone number. */
export function waNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const n = d.startsWith('20') ? d : `20${d.replace(/^0/, '')}`;
  return n.length >= 10 && n.length <= 15 ? n : null;
}

/** tel: href from the saved phone, or null. */
export function telHref(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return `tel:${s.startsWith('+') ? '+' : ''}${digits}`;
}

/** Where "Location" opens: the saved map link first, then saved coordinates, then a search for the saved address. Null when none exist. */
export function mapHref({ mapUrl, lat, lng } = {}, address = '') {
  const url = String(mapUrl || '').trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== null && lng !== null && lat !== '' && lng !== '') return `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`;
  const a = String(address || '').trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(/بنها|banha/i.test(a) ? a : `${a} بنها`)}`;
}
