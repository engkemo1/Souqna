import { Check, X, PhoneCall, MessageCircle, Truck, Package, ClipboardCheck, PartyPopper, Clock } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import SmartImage from '../ui/SmartImage.jsx';
import Button from '../ui/Button.jsx';
import { cx } from '../ui/cx.js';
import { SALES_WHATSAPP } from '../../config/contact.js';

const STEPS = [
  { key: 'pending', icon: ClipboardCheck },
  { key: 'confirmed', icon: Check },
  { key: 'processing', icon: Package },
  { key: 'shipped', icon: Truck },
  { key: 'delivered', icon: PartyPopper },
];
const stamp = (iso, lang) => {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso.replace(' ', 'T') + 'Z')); } catch { return iso; }
};

/** Read-only order tracking: progress steps + what's in the order. Safe to show to anyone holding the link. */
export default function TrackView({ order: o }) {
  const { t, tr, lang } = useI18n();
  const cancelled = o.status === 'cancelled';
  const idx = Math.max(0, STEPS.findIndex((s) => s.key === o.status));
  const when = Object.fromEntries(o.events.map((e) => [e.status, e.created_at]));
  const storeName = tr(o.store.name);
  const phone = o.store.phone;
  const waHref = `https://wa.me/${(phone || '').replace(/^0/, '20')}?text=${encodeURIComponent(t('track.waText', { number: o.number }))}`;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{t('success.orderNumber')}</p>
            <p className="mt-0.5 font-mono text-xl font-bold" dir="ltr">{o.number}</p>
            <p className="mt-1 text-sm text-muted">{storeName}{o.firstName ? ` · ${o.firstName}` : ''}</p>
          </div>
          <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold', cancelled ? 'bg-red-100 text-red-700' : o.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
            {cancelled ? <X className="h-4 w-4" /> : o.status === 'delivered' ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {t(`track.s.${o.status}`)}
          </span>
        </div>

        {cancelled ? (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t('track.cancelledBody')}</p>
        ) : (
          <ol className="mt-6 space-y-0">
            {STEPS.map((s, i) => {
              const done = i <= idx;
              const current = i === idx && o.status !== 'delivered';
              const Icon = s.icon;
              return (
                <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < STEPS.length - 1 && <span aria-hidden className={cx('absolute start-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5', i < idx ? 'bg-primary' : 'bg-line')} />}
                  <span className={cx('relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full ring-4 ring-elevated', done ? 'bg-primary text-on-primary' : 'bg-secondary text-muted', current && 'animate-pulse')}><Icon className="h-[18px] w-[18px]" /></span>
                  <div className="pt-1.5">
                    <p className={cx('text-[15px] font-semibold', !done && 'text-muted')}>{t(`track.step.${s.key}`)}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{done ? (when[s.key] ? stamp(when[s.key], lang) : '') : t(`track.next.${s.key}`)}</p>
                    {s.key === 'shipped' && done && o.deliveryBy === 'platform' && <p className="mt-1 text-[13px] text-brand">{t('track.platformDelivery')}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <ul className="space-y-3">
          {o.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3">
              <SmartImage media={it.image} ratio="4 / 5" sizes="56px" className="w-14 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tr(it.name)}</p><p className="text-xs text-muted">{[it.size, `× ${it.qty}`].filter(Boolean).join(' · ')}</p></div>
              <span className="text-sm font-semibold tabular">{formatMoney(it.price * it.qty, lang)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">{t('cart.subtotal')}</dt><dd className="tabular">{formatMoney(o.subtotal, lang)}</dd></div>
          {o.discount > 0 && <div className="flex justify-between text-success"><dt>{t('cart.discount')}</dt><dd className="tabular">−{formatMoney(o.discount, lang)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">{t('cart.shipping')}</dt><dd className="tabular">{o.shipping ? formatMoney(o.shipping, lang) : t('common.free')}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>{t('cart.total')}</dt><dd className="tabular">{formatMoney(o.total, lang)}</dd></div>
        </dl>
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted">{t('track.payCod')} · {o.city}{o.governorate ? ` — ${t(`gov.${o.governorate}`)}` : ''}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {phone && <Button variant="outline" icon={PhoneCall} href={`tel:${phone}`}>{t('track.callStore')}</Button>}
        {phone && <Button variant="outline" icon={MessageCircle} href={waHref} target="_blank" rel="noreferrer">{t('track.waStore')}</Button>}
        <Button variant="ghost" href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(t('track.waText', { number: o.number }))}`} target="_blank" rel="noreferrer">{t('track.waUs')}</Button>
      </div>
    </div>
  );
}
