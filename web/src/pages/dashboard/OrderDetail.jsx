import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, MessageCircle, MapPin, StickyNote, Check, Banknote, Printer, User2, X, Package } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, formatDate, formatTime, formatNumber } from '../../lib/format.js';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Button from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Textarea } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState, errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

function Stepper({ status, events, t, lang }) {
  const cancelled = status === 'cancelled';
  const idx = cancelled ? -1 : FLOW.indexOf(status);
  const at = (s) => events.find((e) => e.status === s)?.created_at;
  return (
    <ol className="grid grid-cols-5 gap-1">
      {FLOW.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s} className="flex flex-col items-center text-center">
            <div className="relative flex w-full items-center">
              <span className={cx('h-0.5 flex-1 rounded-full', i === 0 ? 'opacity-0' : done ? 'bg-primary' : 'bg-fg/10')} />
              <motion.span initial={false} animate={{ scale: i === idx ? [1, 1.15, 1] : 1 }} transition={{ duration: 0.5 }}
                className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors', done ? 'bg-primary text-on-primary' : 'bg-fg/[0.07] text-muted', i === idx && 'ring-4 ring-primary/15')}>
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </motion.span>
              <span className={cx('h-0.5 flex-1 rounded-full', i === FLOW.length - 1 ? 'opacity-0' : i < idx ? 'bg-primary' : 'bg-fg/10')} />
            </div>
            <p className={cx('mt-2 text-[11px] font-medium leading-tight sm:text-xs', done ? 'text-fg' : 'text-muted')}>{t(`status.${s}`)}</p>
            {at(s) && <p className="mt-0.5 hidden text-[11px] text-muted sm:block">{formatDate(at(s), lang, { day: 'numeric', month: 'short' })}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useApi(`/owner/orders/${id}`);
  const [busy, setBusy] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [note, setNote] = useState('');
  const o = data?.order;

  const setStatus = async (status, n) => {
    setBusy(status);
    try {
      const r = await api(`/owner/orders/${id}/status`, { method: 'PATCH', body: { status, note: n || undefined } });
      mutate((d) => ({ order: { ...d.order, status, next: r.next, events: [...d.order.events, { status, note: n || null, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }] } }));
      invalidate('/owner/orders?');
      invalidate('/owner/overview');
      toast({ title: t('orders.statusUpdated', { s: t(`status.${status}`) }) });
      setCancelOpen(false);
      setNote('');
    } catch (e) {
      toast({ tone: 'error', title: errorMessage(t, e) });
    }
    setBusy(null);
  };

  if (error) return error.status === 404 ? <EmptyState icon={Package} title={t('error.notFound')} /> : <ErrorState error={error} onRetry={reload} />;
  if (loading && !o) {
    return (
      <div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 rounded-2xl lg:col-span-2" /><Skeleton className="h-80 rounded-2xl" /></div></div>
    );
  }
  if (!o) return null;

  const nextMain = o.next.find((s) => s !== 'cancelled');
  const canCancel = o.next.includes('cancelled');
  const wa = `https://wa.me/2${o.customer.phone}?text=${encodeURIComponent(lang === 'ar' ? `أهلاً ${o.customer.name}، بخصوص طلبك رقم ${o.number}` : `Hi ${o.customer.name}, about your order ${o.number}`)}`;

  const actions = (
    <>
      {canCancel && <Button variant="danger-ghost" icon={X} onClick={() => setCancelOpen(true)}>{t('status.action.cancelled')}</Button>}
      {nextMain && <Button variant="brand" icon={Check} loading={busy === nextMain} onClick={() => setStatus(nextMain)}>{t(`status.action.${nextMain}`)}</Button>}
    </>
  );

  return (
    <PageTransition className="pb-20 md:pb-0">
      <PageHeader back="/dashboard/orders"
        title={<span className="flex flex-wrap items-center gap-3"><span dir="ltr">#{o.number}</span><StatusBadge status={o.status} t={t} /></span>}
        subtitle={`${formatDate(o.createdAt, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatTime(o.createdAt, lang)}`}
        actions={<div className="hidden items-center gap-2 md:flex"><Button variant="outline" icon={Printer} onClick={() => window.print()}>{t('orders.print')}</Button>{actions}</div>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel>
            {o.status === 'cancelled' ? (
              <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4 text-red-800"><X className="h-5 w-5" /><p className="font-semibold">{t('status.cancelled')}</p></div>
            ) : <Stepper status={o.status} events={o.events} t={t} lang={lang} />}
            {!o.next.length && o.status !== 'cancelled' && <p className="mt-4 text-center text-sm text-muted">{t('orders.final')}</p>}
          </Panel>

          <Panel title={`${t('orders.items')} (${o.items.reduce((s, i) => s + i.qty, 0)})`}>
            <ul className="divide-y divide-line">
              {o.items.map((it) => (
                <li key={it.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <SmartImage media={it.image} ratio="4 / 5" sizes="64px" className="w-14 shrink-0 rounded-xl sm:w-16" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{tr(it.name)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                      {it.color && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/10" style={{ background: it.color }} /></span>}
                      {it.size && <span>{t('product.size')}: <b className="font-semibold text-fg">{it.size}</b></span>}
                      <span className="tabular">{formatMoney(it.price, lang)} × {it.qty}</span>
                    </p>
                  </div>
                  <span className="font-semibold tabular">{formatMoney(it.price * it.qty, lang)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[15px]">
              <div className="flex justify-between"><dt className="text-muted">{t('cart.subtotal')}</dt><dd className="tabular">{formatMoney(o.subtotal, lang)}</dd></div>
              {o.discount > 0 && <div className="flex justify-between text-success"><dt>{t('cart.discount')} {o.coupon && <span className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-xs" dir="ltr">{o.coupon}</span>}</dt><dd className="tabular">−{formatMoney(o.discount, lang)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">{t('cart.shipping')}</dt><dd className="tabular">{o.shipping ? formatMoney(o.shipping, lang) : t('common.free')}</dd></div>
              <div className="flex justify-between pt-1 text-lg font-semibold"><dt>{t('cart.total')}</dt><dd className="tabular">{formatMoney(o.total, lang)}</dd></div>
            </dl>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface p-3 text-sm"><Banknote className="h-5 w-5 text-brand" /><span className="font-medium">{t('checkout.cod')}</span></div>
          </Panel>

          <Panel title={t('orders.timeline')}>
            <ol className="relative space-y-5 ps-6 before:absolute before:inset-y-1 before:start-[7px] before:w-px before:bg-line">
              {[...o.events].reverse().map((e, i) => (
                <li key={i} className="relative">
                  <span className={cx('absolute -start-6 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-elevated', i === 0 ? 'bg-primary' : 'bg-fg/20')} />
                  <p className="text-sm font-semibold">{t(`status.${e.status}`)}</p>
                  <p className="text-xs text-muted">{formatDate(e.created_at, lang, { day: 'numeric', month: 'short' })} · {formatTime(e.created_at, lang)}</p>
                  {e.note && <p className="mt-1 text-sm text-muted">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={t('orders.customerInfo')}>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-brand"><User2 className="h-5 w-5" /></span>
              <div className="min-w-0"><p className="truncate font-semibold">{o.customer.name}</p><p className="text-sm text-muted">{t('orders.previousOrders', { n: formatNumber(o.customer.ordersCount, lang) })} · {formatMoney(o.customer.totalSpent, lang)}</p></div>
            </div>
            <p className="mt-4 font-mono text-[15px]" dir="ltr">{o.customer.phone}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" icon={Phone} href={`tel:${o.customer.phone}`}>{t('orders.call')}</Button>
              <Button variant="outline" size="sm" icon={MessageCircle} href={wa} target="_blank" rel="noreferrer" className="!text-[#128C7E]">{t('orders.whatsapp')}</Button>
            </div>
          </Panel>
          <Panel title={t('orders.delivery')}>
            <p className="flex gap-2.5 text-[15px] leading-relaxed"><MapPin className="mt-1 h-4 w-4 shrink-0 text-muted" /><span>{o.customer.address}<br /><span className="text-muted">{o.customer.city} — {t(`gov.${o.customer.governorate}`)}</span></span></p>
          </Panel>
          {o.notes && (
            <Panel title={t('orders.notes')}>
              <p className="flex gap-2.5 rounded-xl bg-amber-50 p-3.5 text-[15px] text-amber-900"><StickyNote className="mt-0.5 h-4 w-4 shrink-0" />{o.notes}</p>
            </Panel>
          )}
        </div>
      </div>

      {/* mobile action bar */}
      {(nextMain || canCancel) && (
        <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex gap-2 [&>*:last-child]:flex-1">{actions}</div>
        </div>
      )}

      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} danger title={t('status.action.cancelled')} body={t('orders.confirmCancel')}
        confirmLabel={t('status.action.cancelled')} loading={busy === 'cancelled'} onConfirm={() => setStatus('cancelled', note)}>
        <div className="mt-4"><label className="mb-1.5 block text-sm font-medium text-fg" htmlFor="cancel-note">{t('orders.cancelReason')}</label><Textarea id="cancel-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </ConfirmDialog>
    </PageTransition>
  );
}
