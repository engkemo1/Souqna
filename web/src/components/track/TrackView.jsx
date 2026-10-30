import { Check, X, PhoneCall, MessageCircle, Truck, Package, ClipboardCheck, PartyPopper, Clock, MapPin, Store as StoreIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mapsLink } from '../store/ReserveSheet.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import SmartImage from '../ui/SmartImage.jsx';
import Button from '../ui/Button.jsx';
import { cx } from '../ui/cx.js';
import { SALES_WHATSAPP } from '../../config/contact.js';
import ReviewForm from './ReviewForm.jsx';

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

/** "Reserve & try in store": what the shopper needs — is it ready, until when, where is the shop. */
function ReservationView({ o }) {
  const { t, tr, lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const storeName = tr(o.store.name);
  const phone = o.store.phone;
  const map = mapsLink(o.store);
  const reason = [...o.events].reverse().find((e) => e.reason)?.reason;
  const until = o.reserveUntil ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(o.reserveUntil)) : '';
  const box = {
    pending: ['bg-amber-50 text-amber-900', Clock, L('مستنيين المحل يأكد إن القطعة موجودة', 'Waiting for the shop to confirm the piece'), L(`أول ما يأكد هيشيلها لك ${o.store.reserveHours || 24} ساعة. متنزلش قبل التأكيد. لو مأكدش لحد ${until} الطلب بيتلغى لوحده.`, `Once confirmed it is held for you ${o.store.reserveHours || 24} h. Don't go before the confirmation. If not confirmed by ${until}, the request is cancelled.`)],
    confirmed: ['bg-emerald-50 text-emerald-900', Check, L('القطعة جاهزة ومستنياك ✓', 'Your piece is ready ✓'), L(`عدّي قيسها قبل ${until}، ولو عجبتك ادفع في المحل.`, `Try it on before ${until}; pay in the shop if you like it.`)],
    delivered: ['bg-emerald-50 text-emerald-900', PartyPopper, L('مبروك عليك 🛍️', 'Enjoy it 🛍️'), L(`شكرًا إنك اشتريت من ${storeName}.`, `Thanks for buying from ${storeName}.`)],
    cancelled: ['bg-red-50 text-red-800', X, L('الحجز اتلغى', 'Reservation cancelled'),
      reason === 'unavailable' ? L('بنعتذر، القطعة اتباعت في المحل قبل ما تعدّي.', 'Sorry, the piece was sold in the shop before you came.')
        : reason === 'expired' ? L('وقت الحجز خلص، والقطعة رجعت للبيع.', 'The hold time ran out and the piece is back on sale.')
          : reason === 'not_confirmed' ? L('المحل مأكدش في الوقت، فالطلب اتلغى. ممكن تجرّب تحجز تاني أو تكلّم المحل.', 'The shop did not confirm in time, so the request was cancelled. Try again or call the shop.')
          : L('الحجز اتلغى.', 'This reservation was cancelled.')],
  }[o.status] || ['bg-surface', Clock, '', ''];
  const [tone, Icon, title, body] = box;
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <p className="flex items-center gap-1.5 text-sm text-muted"><StoreIcon className="h-4 w-4" />{L('حجز للقياس في المحل', 'Reserved to try in store')}</p>
        <p className="mt-0.5 font-mono text-xl font-bold" dir="ltr">{o.number}</p>
        <p className="mt-1 text-sm text-muted">{storeName}{o.firstName ? ` · ${o.firstName}` : ''}</p>
        <div className={cx('mt-4 flex items-start gap-3 rounded-2xl p-4', tone)}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed">{body}</p></div>
        </div>
        {o.status === 'confirmed' && tr(o.store.address || {}) && <p className="mt-4 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr(o.store.address)}</p>}
      </div>

      <div className="rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <ul className="space-y-3">
          {o.items.map((it, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <SmartImage media={it.image} ratio="4 / 5" sizes="56px" className="w-14 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tr(it.name)}</p><p className="text-xs text-muted">{[it.size, `× ${it.qty}`].filter(Boolean).join(' · ')}</p>
                {o.status === 'delivered' && o.token && it.productId && <div className="mt-1"><ReviewForm token={o.token} item={it} /></div>}</div>
              {it.isGift ? <span className="text-sm font-bold text-success">{lang === 'ar' ? 'هدية مجانًا' : 'Free gift'}</span> : it.promoDiscount > 0 ? <span className="flex flex-col items-end leading-tight"><s className="text-xs text-muted tabular">{formatMoney(it.price * it.qty, lang)}</s><span className="text-sm font-semibold text-success tabular">{formatMoney(it.price * it.qty - it.promoDiscount, lang)}</span></span> : <span className="text-sm font-semibold tabular">{formatMoney(it.price * it.qty, lang)}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted">{L('مفيش دفع دلوقتي: بتدفع في المحل بعد ما تقيسها.', 'Nothing to pay now: you pay in the shop after trying it on.')} · {formatMoney(o.total, lang)}</p>
      </div>

      <div className="grid gap-2">
        {o.status === 'confirmed' && map && <Button full icon={MapPin} href={map} target="_blank" rel="noreferrer">{L('اتجاهات المحل على الخريطة', 'Directions to the shop')}</Button>}
        {o.status === 'cancelled' && o.store.slug && <Button full to={`/s/${o.store.slug}`}>{L('شوف قطع تانية في المحل', 'See other pieces in the shop')}</Button>}
        <div className="flex flex-wrap gap-2">
          {phone && <Button variant="outline" icon={PhoneCall} href={`tel:${phone}`}>{t('track.callStore')}</Button>}
          {phone && <Button variant="outline" icon={MessageCircle} href={`https://wa.me/${phone.replace(/^0/, '20')}?text=${encodeURIComponent(L(`أهلاً، بخصوص حجزي رقم ${o.number}`, `Hi, about my reservation ${o.number}`))}`} target="_blank" rel="noreferrer">{t('track.waStore')}</Button>}
        </div>
      </div>
    </div>
  );
}

/** Read-only order tracking: progress steps + what's in the order. Safe to show to anyone holding the link. */
export default function TrackView({ order: o }) {
  if (o.deliveryBy === 'pickup') return <ReservationView o={o} />;
  return <DeliveryView o={o} />;
}

function DeliveryView({ o }) {
  const { t, tr, lang } = useI18n();
  const cancelled = o.status === 'cancelled';
  const feeRejected = o.deliveryFeeStatus === 'rejected';
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
            <li key={i} className="flex flex-wrap items-center gap-3">
              <SmartImage media={it.image} ratio="4 / 5" sizes="56px" className="w-14 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tr(it.name)}</p><p className="text-xs text-muted">{[it.size, `× ${it.qty}`].filter(Boolean).join(' · ')}</p>
                {o.status === 'delivered' && o.token && it.productId && <div className="mt-1"><ReviewForm token={o.token} item={it} /></div>}</div>
              {it.isGift ? <span className="text-sm font-bold text-success">{lang === 'ar' ? 'هدية مجانًا' : 'Free gift'}</span> : it.promoDiscount > 0 ? <span className="flex flex-col items-end leading-tight"><s className="text-xs text-muted tabular">{formatMoney(it.price * it.qty, lang)}</s><span className="text-sm font-semibold text-success tabular">{formatMoney(it.price * it.qty - it.promoDiscount, lang)}</span></span> : <span className="text-sm font-semibold tabular">{formatMoney(it.price * it.qty, lang)}</span>}
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">{t('cart.subtotal')}</dt><dd className="tabular">{formatMoney(o.subtotal, lang)}</dd></div>
          {o.promoDiscount > 0 && <div className="flex justify-between text-success"><dt>{lang === 'ar' ? 'خصم العروض' : 'Offers discount'}<span className="block text-xs font-normal opacity-80">{(o.promotions || []).map((p) => tr(p.name)).join(' · ')}</span></dt><dd className="tabular">−{formatMoney(o.promoDiscount, lang)}</dd></div>}
          {o.discount - (o.promoDiscount || 0) > 0 && <div className="flex justify-between text-success"><dt>{t('cart.discount')}</dt><dd className="tabular">−{formatMoney(o.discount - (o.promoDiscount || 0), lang)}</dd></div>}
          {!feeRejected && <div className="flex justify-between"><dt className="text-muted">{t('cart.shipping')}</dt><dd className="tabular">{o.shippingFree ? t('common.free') : o.shipping ? formatMoney(o.shipping, lang) : t('cart.sharedDelivery')}</dd></div>}
          <div className="flex justify-between text-base font-semibold"><dt>{feeRejected ? (lang === 'ar' ? 'قيمة المنتجات' : 'Items total') : t('cart.total')}</dt><dd className="tabular">{formatMoney(feeRejected ? o.subtotal - o.discount : o.total, lang)}</dd></div>
          {o.deliveryGroupTotal != null && <div className="flex justify-between border-t border-line pt-2 font-semibold text-brand"><dt>{t('cart.marketTotal')} · {o.deliveryGroupCount} {lang === 'ar' ? 'محلات' : 'stores'}</dt><dd className="tabular">{formatMoney(o.deliveryGroupTotal, lang)}</dd></div>}
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
