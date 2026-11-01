import { Phone, MessageCircle, Navigation } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { DAYS_AR, DAYS_EN, fmtTime, mapHref, minutesLabel, statusInfo, telHref, waNumber } from '../../lib/storeInfo.js';

/**
 * Compact "can I go / call / message now?" strip right under the store header.
 * Everything comes from what the merchant saved; a missing value simply hides its part (nothing is invented).
 * The fuller "Visit us" card further down the page is unchanged.
 */
const tone = {
  open: { text: 'text-emerald-700', dot: 'bg-emerald-500', ping: 'bg-emerald-500/50' },
  closing_soon: { text: 'text-amber-700', dot: 'bg-amber-500', ping: 'bg-amber-500/50' },
  closed: { text: 'text-red-600', dot: 'bg-red-500', ping: '' },
};

export default function StoreInfoBar() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const hours = store.hours;
  const st = statusInfo(hours);
  const tel = telHref(store.phone);
  const wa = waNumber(store.whatsapp);
  const map = mapHref(store, tr(store.address));
  if (!st && !tel && !wa && !map) return null;

  const dayOff = hours && hours.dayOff !== null && hours.dayOff !== undefined ? (ar ? DAYS_AR : DAYS_EN)[hours.dayOff] : null;
  // stacked icon + label on phones (44px+ touch targets), icon beside label from sm up
  const base = 'group inline-flex min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 text-[11px] font-semibold leading-tight transition active:scale-[.96] sm:min-w-0 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-2.5 sm:text-[13px]';
  const neutral = `${base} bg-fg/[0.06] text-fg hover:bg-fg/[0.1]`;
  const waCls = `${base} bg-[#25D366]/15 text-[#0b7a3e] hover:bg-[#25D366]/25`;
  const icon = 'h-[18px] w-[18px] shrink-0 sm:h-4 sm:w-4';
  return (
    <section aria-label={ar ? 'معلومات المحل' : 'Store info'} data-testid="store-info-bar" className="border-b border-line bg-elevated shadow-[0_1px_0_rgb(var(--c-border)/.4)]">
      <div className="container flex items-center justify-between gap-3 py-2.5">
        {st ? (
          <div className="min-w-0">
            <p data-testid="store-open-status" data-state={st.state} className={`flex items-center gap-2 text-[15px] font-bold leading-tight ${tone[st.state].text}`}>
              <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
                {st.state !== 'closed' && <span className={`absolute inset-0 animate-ping rounded-full motion-reduce:hidden ${tone[st.state].ping}`} />}
                <span className={`relative h-2.5 w-2.5 rounded-full ${tone[st.state].dot}`} />
              </span>
              {st.state === 'open' ? (ar ? 'مفتوح الآن' : 'Open now') : st.state === 'closing_soon' ? (ar ? 'يقفل قريبًا' : 'Closing soon') : (ar ? 'مغلق الآن' : 'Closed now')}
            </p>
            <p className="mt-1 truncate text-[12px] leading-tight text-muted" dir="auto">
              {st.state === 'closing_soon' && <>{ar ? `بعد ${minutesLabel(st.minsToClose, true)}` : `in ${minutesLabel(st.minsToClose, false)}`}<span aria-hidden="true"> · </span></>}
              {st.state === 'closed' && st.opensTodayAt && <>{ar ? 'يفتح اليوم ' : 'Opens today '}</>}
              {fmtTime(hours.open, ar)} – {fmtTime(hours.close, ar)}{dayOff ? ` · ${ar ? `إجازة ${dayOff}` : `Closed ${dayOff}`}` : ''}
            </p>
          </div>
        ) : <span />}
        {(tel || wa || map) && (
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={waCls}><MessageCircle className={icon} /><span>{ar ? 'واتساب' : 'WhatsApp'}</span></a>}
            {tel && <a href={tel} className={neutral}><Phone className={icon} /><span>{ar ? 'اتصال' : 'Call'}</span></a>}
            {map && <a href={map} target="_blank" rel="noreferrer" className={neutral}><Navigation className={icon} /><span>{ar ? 'الموقع' : 'Location'}</span></a>}
          </div>
        )}
      </div>
    </section>
  );
}
