/**
 * الوقت والجو لمودة.
 * - توقيت القاهرة بـ Intl (فيه توقيت صيفي)، مش +3 ثابتة.
 * - شروق وغروب الشمس بتتحسب بالكود (معادلة فلكية) من غير API.
 * - الجو من مزوّد خارجي مع كاش ساعة، وفشله مايوقفش حاجة: بنرجع لجدول الشهر.
 */
import { loadKnowledge } from './knowledge.js';

const TZ = 'Africa/Cairo';
const pad2 = (n) => String(n).padStart(2, '0');

export function cairoParts(date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), dow, iso: `${p.year}-${p.month}-${p.day}` };
}

/** فرق توقيت القاهرة عن UTC بالساعات في اليوم ده (2 شتا / 3 صيف). */
export function cairoOffsetHours(date) {
  const c = cairoParts(date);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 3600000);
}

/** شروق/غروب (ساعات عشرية بتوقيت القاهرة) — خوارزمية Almanac. */
export function sunTimes(date, lat, lon) {
  const c = cairoParts(date);
  const start = Date.UTC(c.year, 0, 0);
  const N = Math.floor((Date.UTC(c.year, c.month - 1, c.day) - start) / 864e5);
  const rad = Math.PI / 180; const zenith = 90.833; const lngHour = lon / 15;
  const calc = (rising) => {
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634; L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; RA = ((RA % 360) + 360) % 360;
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90; RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad); const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad; H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = (((T - lngHour) % 24) + 24) % 24;
    return (((UT + cairoOffsetHours(date)) % 24) + 24) % 24;
  };
  return { sunrise: calc(true) ?? 6, sunset: calc(false) ?? 18 };
}

const CONTEXT_DEFAULT_HOUR = {
  engagement_guest: 20, engagement_self: 20, katb_kitab: 19, wedding_guest: 21, wedding_self: 21, graduation: 18, work_casual: 11, work_formal: 11,
  university: 11, ramadan_iftar: 18, date_night: 20, birthday_party: 19, sahel_beach: 14, travel: 12, sport: 18, eid: 12, condolence: 17,
};

/**
 * يحدد وقت المناسبة: تاريخ + ساعة + نهار/ليل.
 * الأولوية: وقت صريح في الرسالة → النهارده/الوقت الحالي → افتراض حسب المناسبة.
 */
export function resolveEventTime(parsed, { now = new Date(), city = { lat: 30.4659, lon: 31.1848 } } = {}) {
  const base = cairoParts(now);
  const offset = parsed.dateOffsetDays ?? 0;
  const eventMs = now.getTime() + offset * 864e5;
  const eventDate = new Date(eventMs);
  const ev = cairoParts(eventDate);
  let hour; let source;
  if (parsed.daypart === 'night') { hour = 21; source = 'message'; }
  else if (parsed.daypart === 'day') { hour = 13; source = 'message'; }
  else if (parsed.dateOffsetDays === null || parsed.dateOffsetDays === 0) {
    if (parsed.dateOffsetDays === 0 || !parsed.context || ['casual_outing', 'work_casual', 'work_formal', 'university', 'sport', 'date_night', 'family_gathering'].includes(parsed.context)) { hour = base.hour + base.minute / 60; source = 'now'; }
    else { hour = CONTEXT_DEFAULT_HOUR[parsed.context] ?? 17; source = 'default'; }
  } else { hour = CONTEXT_DEFAULT_HOUR[parsed.context] ?? 17; source = 'default'; }
  const sun = sunTimes(eventDate, city.lat, city.lon);
  const isNight = hour >= sun.sunset || hour < sun.sunrise;
  let daypart;
  if (isNight && (hour >= 20 || hour < sun.sunrise)) daypart = 'night';
  else if (hour >= sun.sunset - 2) daypart = 'evening';
  else if (hour < 11) daypart = 'morning';
  else daypart = 'afternoon';
  return { date: ev.iso, month: ev.month, hour, daypart, isNight, source, sun, daysAhead: offset };
}

/* ------------------------------ الجو ------------------------------ */

const MONTH_TEMP = [14, 15, 18, 22, 26, 29, 30, 30, 28, 25, 20, 16];
export function climateFallback(month, hour) {
  const t = MONTH_TEMP[month - 1] + (hour >= 20 || hour < 7 ? -4 : hour >= 12 && hour < 17 ? 3 : 0);
  return { temp_c: t, feels_like_c: t, rain_pct: [11, 12, 1, 2].includes(month) ? 15 : 2, wind_kmh: 12, humidity_pct: 60, uv_index: 5, approximate: true, source: 'month' };
}

const cache = new Map();
const apparent = (t, rh, wsKmh) => { const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t)); return Math.round((t + 0.33 * e - 0.7 * (wsKmh / 3.6) - 4) * 10) / 10; };

async function fetchMetNo(city, fetcher) {
  const ua = process.env.WEATHER_USER_AGENT || 'SouqnaModa/1.0 (https://banhalook.app)';
  const res = await fetcher(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${city.lat.toFixed(4)}&lon=${city.lon.toFixed(4)}`, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`met.no ${res.status}`);
  const j = await res.json();
  return j.properties.timeseries.map((s) => {
    const d = s.data.instant.details; const next = s.data.next_1_hours || s.data.next_6_hours;
    const ws = (d.wind_speed || 0) * 3.6; const prec = next?.details?.precipitation_amount ?? 0;
    return { ts: Date.parse(s.time), temp_c: d.air_temperature, humidity_pct: d.relative_humidity, wind_kmh: ws, rain_pct: prec >= 1 ? 85 : prec > 0.1 ? 55 : 5, uv_index: d.ultraviolet_index_clear_sky ?? null, feels_like_c: apparent(d.air_temperature, d.relative_humidity ?? 50, ws) };
  });
}
/**
 * توقع الجو لمناسبة. مايرميش أخطاء أبدًا: أي فشل → تقريب من جدول الشهر (approximate=true).
 * fetcher/provider قابلين للحقن في الاختبارات.
 */
export async function getWeather(eventTime, { city = { key: 'banha', lat: 30.4659, lon: 31.1848 }, provider = 'met_norway', fetcher = globalThis.fetch, now = new Date(), mock = null } = {}) {
  if (mock) return { ...climateFallback(eventTime.month, eventTime.hour), ...mock, approximate: false, source: 'mock' };
  if (eventTime.daysAhead > 6 || !fetcher) return climateFallback(eventTime.month, eventTime.hour);
  try {
    const key = `${provider}:${city.key || `${city.lat},${city.lon}`}`;
    let hit = cache.get(key);
    if (!hit || now.getTime() - hit.at > 3600e3) {
      const series = await fetchMetNo(city, fetcher);
      hit = { at: now.getTime(), series }; cache.set(key, hit);
    }
    const target = now.getTime() + eventTime.daysAhead * 864e5 + (eventTime.hour - cairoParts(now).hour - cairoParts(now).minute / 60) * 3600e3;
    const best = hit.series.reduce((a, b) => (Math.abs(b.ts - target) < Math.abs(a.ts - target) ? b : a));
    if (Math.abs(best.ts - target) > 4 * 3600e3) return climateFallback(eventTime.month, eventTime.hour);
    return { ...best, approximate: false, source: provider };
  } catch {
    return climateFallback(eventTime.month, eventTime.hour);
  }
}

/** درجة الحرارة المحسوسة → شريحة (hot/warm/mild/cool/cold) + ملاحظات الظروف. */
export function weatherAdvice(weather, eventTime) {
  const K = loadKnowledge(); const bands = K.weather.temp_bands;
  const t = weather.feels_like_c ?? weather.temp_c;
  const band = bands.find((b) => t >= b.feels_like_c[0] && t < b.feels_like_c[1]) || bands[2];
  const notes = [];
  if ((weather.rain_pct ?? 0) >= 50) notes.push('rain');
  if ((weather.wind_kmh ?? 0) >= 30) notes.push('wind');
  if ((weather.uv_index ?? 0) >= 8 && ['morning', 'afternoon'].includes(eventTime.daypart)) notes.push('uv');
  if ((weather.humidity_pct ?? 0) >= 70 && t >= 27) notes.push('humid');
  return { band: band.key, layers: band.layers, fabrics_ar: band.fabrics_ar, avoid_ar: band.avoid_ar, temp: Math.round(t), notes, approximate: !!weather.approximate };
}
