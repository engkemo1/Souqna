import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import SmartImage from '../ui/SmartImage.jsx';
import { StatusBadge } from '../ui/Badge.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, relativeTime, formatDate, formatTime } from '../../lib/format.js';

function Thumbs({ images = [], count }) {
  return (
    <div className="flex items-center -space-x-2.5 rtl:space-x-reverse">
      {images.slice(0, 3).map((m, i) => (
        <SmartImage key={i} media={m} ratio="1 / 1" sizes="40px" className="h-9 w-9 rounded-lg ring-2 ring-elevated" />
      ))}
      {count > images.length && <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-xs font-semibold ring-2 ring-elevated">+{count - images.length}</span>}
    </div>
  );
}

/** Mobile-first order card. */
export function OrderCard({ o }) {
  const { t, lang, isRtl } = useI18n();
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  return (
    <Link to={`/dashboard/orders/${o.id}`} className="block rounded-2xl border border-line bg-elevated p-4 transition active:scale-[.99] hover:border-line-strong">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm font-semibold" dir="ltr">#{o.number}</span>
        <StatusBadge status={o.status} t={t} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{o.customer}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted"><MapPin className="h-3.5 w-3.5 shrink-0" />{o.city} · {relativeTime(o.createdAt, lang)}</p>
        </div>
        <Thumbs images={o.images} count={o.itemsCount} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-[13px] text-muted">{t('orders.items.count', { n: o.itemsCount })}</span>
        <span className="inline-flex items-center gap-1 font-semibold tabular">{formatMoney(o.total, lang)}<Chevron className="h-4 w-4 text-muted" /></span>
      </div>
    </Link>
  );
}

/** Desktop table row. */
export function OrderRow({ o }) {
  const { t, lang } = useI18n();
  return (
    <tr className="group cursor-pointer transition hover:bg-fg/[0.025]">
      <td className="py-3.5 ps-5"><Link to={`/dashboard/orders/${o.id}`} className="font-mono text-sm font-semibold after:absolute after:inset-0" dir="ltr">#{o.number}</Link></td>
      <td className="py-3.5"><p className="font-medium">{o.customer}</p><p className="text-[13px] text-muted">{o.city}</p></td>
      <td className="py-3.5 text-sm text-muted"><p>{formatDate(o.createdAt, lang, { day: 'numeric', month: 'short' })}</p><p className="text-xs">{formatTime(o.createdAt, lang)}</p></td>
      <td className="py-3.5"><Thumbs images={o.images} count={o.itemsCount} /></td>
      <td className="py-3.5 font-semibold tabular">{formatMoney(o.total, lang)}</td>
      <td className="py-3.5 pe-5"><StatusBadge status={o.status} t={t} /></td>
    </tr>
  );
}

export function OrdersTable({ orders }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
      <table className="w-full min-w-[640px] text-start">
        <thead>
          <tr className="border-b border-line text-start text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="py-3 ps-5 text-start font-semibold">{t('orders.order')}</th>
            <th className="py-3 text-start font-semibold">{t('orders.customer')}</th>
            <th className="py-3 text-start font-semibold">{t('orders.date')}</th>
            <th className="py-3 text-start font-semibold">{t('orders.items')}</th>
            <th className="py-3 text-start font-semibold">{t('orders.total')}</th>
            <th className="py-3 pe-5 text-start font-semibold">{t('orders.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr]:relative">
          {orders.map((o) => <OrderRow key={o.id} o={o} />)}
        </tbody>
      </table>
    </div>
  );
}
