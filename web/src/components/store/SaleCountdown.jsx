import { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';
import { useCampaigns, useCountdown } from '../../lib/campaigns.js';
import { look } from '../../lib/campaignTheme.js';
import { formatMoney } from '../../lib/format.js';

const num = (n, lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en').format(n);

function useNow(step) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), step); return () => clearInterval(id); }, [step]);
  return now;
}

const split = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }; };

/**
 * End of a timed discount. `chip` is a small one-liner for product cards; `panel` is the live countdown on the product page.
 * It disappears by itself when the time is up (the server puts the old price back within a minute).
 */
export default function SaleCountdown({ ms, campaign, ...rest }) {
  if (!ms || ms <= Date.now()) return null; // no timer (and no interval) for products without a timed discount
  if (campaign) return <CampaignCountdown ms={ms} {...rest} />; // the product is in a Twist sale campaign (Black Friday…): themed look
  return <Countdown ms={ms} {...rest} />;
}

const two = (n) => String(n).padStart(2, '0');

/** Campaign look for the countdown: a compact chip on cards, a themed panel (with the saving) on the product page. */
function CampaignCountdown({ ms, variant = 'panel', className, save = 0, name = '' }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { discount, offset } = useCampaigns();
  const l = look(discount || { theme: 'blackfriday' });
  const live = variant === 'panel';
  const t = useCountdown(ms, offset, live);
  const now = useNow(live ? 60000 : 30000);
  if (!live) {
    const left = ms - (now + offset);
    if (left <= 0) return null;
    const x = split(left);
    const text = x.d > 0 ? (ar ? `${num(x.d, lang)} ي ${num(x.h, lang)} س` : `${x.d}d ${x.h}h`) : x.h > 0 ? (ar ? `${num(x.h, lang)} س ${num(x.m, lang)} د` : `${x.h}h ${x.m}m`) : (ar ? `${num(x.m, lang)} د` : `${x.m}m`);
    return (
      <span className={cx('inline-flex items-center gap-1 rounded-full py-0.5 pe-2 ps-1 text-[11px] font-bold', className)} style={{ background: l.c1, color: '#fff' }}>
        <span className="grid h-4 w-4 place-items-center rounded-full" style={{ background: l.c2, color: '#111' }}><Hourglass className="h-2.5 w-2.5" aria-hidden="true" /></span>
        {ar ? `ينتهي بعد ${text}` : `Ends in ${text}`}
      </span>
    );
  }
  const cells = [t.d > 0 && [t.d, ar ? 'يوم' : 'd'], [t.h, ar ? 'ساعة' : 'h'], [t.m, ar ? 'دقيقة' : 'm'], [t.s, ar ? 'ثانية' : 's']].filter(Boolean);
  return (
    <div className={cx('relative overflow-hidden rounded-2xl p-3.5 text-white sm:p-4', className)} role="timer" aria-label={ar ? 'الوقت المتبقي على العرض' : 'Time left on the offer'} style={{ background: `linear-gradient(to left, ${l.c1}, ${l.c1} 55%, color-mix(in srgb, ${l.c2} 38%, ${l.c1}))`, boxShadow: `0 10px 28px -14px ${l.c1}` }}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-10 start-0 h-28 w-28 rounded-full blur-2xl" style={{ background: l.c2, opacity: 0.3 }} />
      <div className="relative flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black" style={{ background: l.c2, color: '#111' }}><span aria-hidden="true">{l.emoji}</span><span className="truncate">{name || (ar ? 'عرض لفترة محدودة' : 'Limited-time offer')}</span></span>
        {save > 0 && <span className="shrink-0 text-[12.5px] font-bold" style={{ color: l.c2 }}>{ar ? `وفّرت ${formatMoney(save, lang)}` : `You save ${formatMoney(save, lang)}`}</span>}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="text-[12.5px] font-semibold leading-tight opacity-90">{ar ? 'الخصم بينتهي بعد' : 'Offer ends in'}</div>
        <div className="flex items-stretch gap-1.5" dir="ltr">
          {cells.map(([n, label]) => (
            <div key={label} className="min-w-[46px] rounded-xl px-1.5 py-1 text-center backdrop-blur sm:min-w-[54px]" style={{ background: 'rgba(255,255,255,.14)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22)' }}>
              <div className="text-xl font-black leading-none tabular-nums">{two(n)}</div>
              <div className="mt-0.5 text-[10px] opacity-80">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Countdown({ ms, variant = 'panel', className }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const live = variant === 'panel';
  const now = useNow(live ? 1000 : 30000);
  if (!ms || ms - now <= 0) return null;
  const t = split(ms - now);
  const urgent = ms - now < 86400e3;

  if (!live) {
    if (ms - now >= 7 * 86400e3) return null; // cards only show it in the last week
    const text = t.d > 0 ? (ar ? `${num(t.d, lang)} ي ${num(t.h, lang)} س` : `${t.d}d ${t.h}h`) : t.h > 0 ? (ar ? `${num(t.h, lang)} س ${num(t.m, lang)} د` : `${t.h}h ${t.m}m`) : (ar ? `${num(Math.max(1, t.m), lang)} د` : `${Math.max(1, t.m)}m`);
    return (
      <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold', urgent ? 'bg-sale text-white' : 'bg-sale/10 text-sale', className)}>
        <Hourglass className="h-3 w-3" aria-hidden="true" />{urgent ? (ar ? `آخر ساعات · ${text}` : `Last hours · ${text}`) : (ar ? `ينتهي خلال ${text}` : `Ends in ${text}`)}
      </span>
    );
  }

  const cells = [t.d > 0 && [t.d, ar ? 'يوم' : 'days'], [t.h, ar ? 'ساعة' : 'hrs'], [t.m, ar ? 'دقيقة' : 'min'], [t.s, ar ? 'ثانية' : 'sec']].filter(Boolean);
  return (
    <div className={cx('relative overflow-hidden rounded-2xl border bg-gradient-to-l from-sale/10 via-sale/[0.04] to-transparent p-3.5', urgent ? 'border-sale/60 shadow-sm' : 'border-sale/25', className)} role="timer" aria-label={ar ? 'الوقت المتبقي للخصم' : 'Time left on this discount'}>
      <div className="flex items-center gap-2 text-[13px] font-bold text-sale"><Hourglass className="h-4 w-4" aria-hidden="true" />{urgent ? (ar ? 'آخر ساعات للخصم' : 'Last hours of the offer') : (ar ? 'خصم لفترة محدودة' : 'Limited-time offer')}</div>
      <div className="mt-2.5 flex items-stretch gap-2" dir="ltr">
        {cells.map(([n, label], i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="min-w-[56px] rounded-xl bg-canvas/80 px-2 py-1.5 text-center ring-1 ring-sale/20">
              <div className="text-xl font-black leading-none tabular-nums text-fg">{String(n).padStart(2, '0')}</div>
              <div className="mt-1 text-[11px] text-muted">{label}</div>
            </div>
            {i < cells.length - 1 && <span aria-hidden="true" className="-mt-3 text-lg font-bold text-sale/60">:</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
