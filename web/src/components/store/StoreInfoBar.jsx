import { useState } from 'react';
import { Phone, Navigation, ChevronDown, Clock } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { DAYS_AR, DAYS_EN, fmtTime, mapHref, minutesLabel, statusInfo, telHref, todayHours, upcomingHolidays, waNumber, weekRows } from '../../lib/storeInfo.js';

/**
 * "Can I go / call / message now?" card, right under the store's hero.
 * One rounded card: the open/closed status on the start side (tap for the whole week), three round action buttons on the end side
 * (WhatsApp, call, directions). Everything comes from what the merchant saved; a missing value simply hides its part.
 */
const tone = {
  open: { text: 'text-emerald-700', chip: 'bg-emerald-500/12 text-emerald-700', dot: 'bg-emerald-500', ping: 'bg-emerald-500/50' },
  closing_soon: { text: 'text-amber-700', chip: 'bg-amber-500/15 text-amber-700', dot: 'bg-amber-500', ping: 'bg-amber-500/50' },
  closed: { text: 'text-red-600', chip: 'bg-red-500/10 text-red-600', dot: 'bg-red-500', ping: '' },
};

const WhatsAppIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.23 8.25c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
  </svg>
);

export default function StoreInfoBar() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const [week, setWeek] = useState(false);
  const hours = store.hours;
  const st = statusInfo(hours);
  const tel = telHref(store.phone);
  const wa = waNumber(store.whatsapp);
  const map = mapHref(store, tr(store.address));
  if (!st && !tel && !wa && !map) return null;

  const names = ar ? DAYS_AR : DAYS_EN;
  const today = todayHours(hours, ar);
  const nx = st?.state === 'closed' ? st.next : null;
  const nextText = nx ? `${ar ? 'يفتح ' : 'Opens '}${nx.dayOffset === 0 ? (ar ? 'اليوم' : 'today') : nx.dayOffset === 1 ? (ar ? 'بكرة' : 'tomorrow') : names[nx.weekday]} ${fmtTime(nx.at, ar)}` : '';
  const headline = st ? (st.state === 'open' ? (ar ? 'مفتوح الآن' : 'Open now') : st.state === 'closing_soon' ? (ar ? 'يقفل قريبًا' : 'Closing soon') : (st.holiday ? (ar ? 'إجازة' : 'On holiday') : (ar ? 'مغلق الآن' : 'Closed now'))) : '';
  const sub = !st ? '' : st.state === 'closed'
    ? [st.holiday?.note, nextText || (today ? '' : (ar ? 'مغلق اليوم' : 'Closed today'))].filter(Boolean).join(' · ')
    : [st.state === 'closing_soon' ? (ar ? `بعد ${minutesLabel(st.minsToClose, true)}` : `in ${minutesLabel(st.minsToClose, false)}`) : (st.closesAt ? `${ar ? 'حتى' : 'Until'} ${fmtTime(st.closesAt, ar)}` : '')].filter(Boolean).join(' · ');
  const rows = week ? weekRows(hours, ar) : [];
  const holidays = week ? upcomingHolidays(hours) : [];

  const round = 'grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-[.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:h-10 sm:w-auto sm:grid-flow-col sm:gap-2 sm:px-4';
  return (
    <section aria-label={ar ? 'معلومات المحل' : 'Store info'} data-testid="store-info-bar" className="container mt-3 sm:mt-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-elevated shadow-[0_6px_24px_-14px_rgb(0_0_0/.35)]">
        <div className="flex items-center gap-3 p-2.5 sm:p-3">
          {st ? (
            <button type="button" onClick={() => setWeek((v) => !v)} aria-expanded={week} aria-controls="store-week" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 text-start transition hover:bg-fg/[0.04]">
              <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full sm:h-10 sm:w-10 ${tone[st.state].chip}`}>
                {st.state !== 'closed' && <span className={`absolute inset-0 animate-ping rounded-full motion-reduce:hidden ${tone[st.state].ping}`} style={{ animationDuration: '2.4s' }} />}
                <Clock className="relative h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span data-testid="store-open-status" data-state={st.state} className={`block text-[15px] font-bold leading-tight ${tone[st.state].text}`}>{headline}</span>
                {sub && <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted" dir="auto">{sub}</span>}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${week ? 'rotate-180' : ''}`} aria-hidden="true" />
              <span className="sr-only">{ar ? 'مواعيد الأسبوع' : 'Weekly hours'}</span>
            </button>
          ) : <span className="flex-1" />}
          {(wa || tel || map) && (
            <div className="flex shrink-0 items-center gap-2">
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={ar ? 'واتساب' : 'WhatsApp'} title={ar ? 'واتساب' : 'WhatsApp'} className={`${round} bg-[#25D366] text-white shadow-[0_4px_14px_-6px_#25D366] hover:brightness-95`}><WhatsAppIcon className="h-[22px] w-[22px]" /><span className="hidden text-[13px] font-bold sm:inline">{ar ? 'واتساب' : 'WhatsApp'}</span></a>}
              {tel && <a href={tel} aria-label={ar ? 'اتصال' : 'Call'} title={ar ? 'اتصال' : 'Call'} className={`${round} bg-fg/[0.07] text-fg hover:bg-fg/[0.12]`}><Phone className="h-5 w-5" /><span className="hidden text-[13px] font-bold sm:inline">{ar ? 'اتصال' : 'Call'}</span></a>}
              {map && <a href={map} target="_blank" rel="noreferrer" aria-label={ar ? 'الموقع' : 'Directions'} title={ar ? 'الموقع' : 'Directions'} className={`${round} bg-fg/[0.07] text-fg hover:bg-fg/[0.12]`}><Navigation className="h-5 w-5" /><span className="hidden text-[13px] font-bold sm:inline">{ar ? 'الموقع' : 'Directions'}</span></a>}
            </div>
          )}
        </div>
        {week && (
          <div id="store-week" className="border-t border-line bg-fg/[0.02] px-4 py-3" data-testid="store-week">
            <ul className="space-y-1.5">
              {rows.map((d) => (
                <li key={d.day} className={`flex items-baseline justify-between gap-4 text-[14px] ${d.today ? 'font-bold text-fg' : 'text-muted'}`}>
                  <span>{d.name}{d.today ? ` · ${ar ? 'النهاردة' : 'today'}` : ''}</span>
                  <span dir="auto">{d.closed ? (ar ? 'إجازة' : 'Closed') : d.text}</span>
                </li>
              ))}
            </ul>
            {holidays.map((h) => <p key={`${h.from}-${h.to}`} className="mt-2 text-[12px] font-semibold text-amber-700">{ar ? 'إجازة' : 'Holiday'}: {h.from === h.to ? h.from : `${h.from} → ${h.to}`}{h.note ? ` · ${h.note}` : ''}</p>)}
          </div>
        )}
      </div>
    </section>
  );
}
