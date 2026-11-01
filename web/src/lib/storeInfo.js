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
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), now: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Open right now? Uses Cairo time; handles closing after midnight. Returns null when the store has no (valid) hours, so nothing is claimed. */
export function openNow(hours, at = new Date()) {
  if (!hours || !validHm(hours.open) || !validHm(hours.close)) return null;
  const { day, now } = cairoParts(at);
  const o = toMin(hours.open), c = toMin(hours.close);
  const overnight = c <= o;
  // after midnight, the shift belongs to the previous day
  const shiftDay = overnight && now < c ? (day + 6) % 7 : day;
  if (hours.dayOff !== null && hours.dayOff !== undefined && shiftDay === hours.dayOff) return false;
  return overnight ? now >= o || now < c : now >= o && now < c;
}

export const CLOSING_SOON_MIN = 60;

/**
 * Richer status from the same saved hours: 'open', 'closing_soon' (open, <= 60 min left, with the minutes) or 'closed'
 * (with the opening time when it opens later today). Null when there are no valid hours.
 */
export function statusInfo(hours, at = new Date()) {
  const open = openNow(hours, at);
  if (open === null) return null;
  const { day, now } = cairoParts(at);
  const o = toMin(hours.open), c = toMin(hours.close);
  const overnight = c <= o;
  if (open) {
    const minsToClose = overnight && now >= o ? 1440 - now + c : c - now;
    return { state: minsToClose <= CLOSING_SOON_MIN ? 'closing_soon' : 'open', minsToClose };
  }
  const dayOffToday = hours.dayOff !== null && hours.dayOff !== undefined && day === hours.dayOff;
  return { state: 'closed', opensTodayAt: !dayOffToday && now < o ? hours.open : null };
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
