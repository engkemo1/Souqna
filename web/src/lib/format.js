const nf = (lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG', { maximumFractionDigits: 0 });
const cache = {};
const num = (lang) => (cache[lang] ||= nf(lang));

export const formatNumber = (n, lang) => num(lang).format(Math.round(n || 0));

export function formatMoney(n, lang) {
  const v = formatNumber(n, lang);
  return lang === 'ar' ? `${v} ج.م` : `EGP ${v}`;
}

export function formatCompact(n, lang) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
}

const parse = (s) => (s instanceof Date ? s : new Date(String(s).replace(' ', 'T') + (String(s).length <= 19 ? 'Z' : '')));

export function formatDate(s, lang, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', ...opts }).format(parse(s));
}

export function formatTime(s, lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }).format(parse(s));
}

export function relativeTime(s, lang) {
  const d = parse(s).getTime();
  const diff = (Date.now() - d) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en', { numeric: 'auto' });
  if (diff < 60) return rtf.format(-Math.max(1, Math.round(diff)), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 7) return rtf.format(-Math.round(diff / 86400), 'day');
  return formatDate(s, lang);
}

export const formatPct = (n, lang) => `${formatNumber(Math.abs(n * 10) / 10, lang)}%`;
