import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, MessageCircle, MapPin, StickyNote, Check, Banknote, Printer, User2, X, Package, Truck, Store as StoreIcon, Clock } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, formatDate, formatTime, formatNumber } from '../../lib/format.js';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState, errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { printBlock, orderSlipHtml } from '../../lib/printSheets.js';
import { orderUrl } from '../../lib/qr/index.js';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

function Stepper({ status, events, t, lang, byPlatform }) {
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
            <p className={cx('mt-2 text-xs font-medium leading-tight sm:text-xs', done ? 'text-fg' : 'text-muted')}>{byPlatform && s === 'processing' ? t('orders.markReady') : t(`status.${s}`)}</p>
            {at(s) && <p className="mt-0.5 hidden text-xs text-muted sm:block">{formatDate(at(s), lang, { day: 'numeric', month: 'short' })}</p>}
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
  const { store } = useAuth();
  const { data, error, loading, reload, mutate } = useApi(`/owner/orders/${id}`);
  const [busy, setBusy] = useState(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [note, setNote] = useState('');
  const [retOpen, setRetOpen] = useState(false);
  const [ret, setRet] = useState({});
  const [restock, setRestock] = useState(true);
  const [est, setEst] = useState(null);
  const o = data?.order;

  // live estimate of the refund (same calculation the server saves; nothing is written)
  useEffect(() => {
    const items = Object.entries(ret).filter(([, n]) => n > 0).map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));
    if (!retOpen || !items.length) { setEst(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => { api(`/owner/orders/${id}/returns`, { method: 'POST', body: { items, dryRun: true } }).then((r) => live && setEst(r)).catch(() => live && setEst(null)); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [ret, retOpen, id]);

  const doReturn = async () => {
    const items = Object.entries(ret).filter(([, n]) => n > 0).map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));
    if (!items.length) return;
    setBusy('return');
    try {
      const r = await api(`/owner/orders/${id}/returns`, { method: 'POST', body: { items, restock } });
      toast({ title: lang === 'ar' ? `تم تسجيل المرتجع · ${formatMoney(r.refund, lang)}` : `Return recorded · ${formatMoney(r.refund, lang)}` });
      setRetOpen(false); setRet({}); reload(); invalidate('/owner/orders'); invalidate('/owner/promotions');
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); } finally { setBusy(null); }
  };

  const handoff = async () => {
    setBusy('handoff');
    try {
      const r = await api(`/owner/orders/${id}/handoff`, { method: 'POST', body: {} });
      mutate((d) => ({ order: { ...d.order, deliveryBy: 'platform', next: r.next, events: [...d.order.events, { status: d.order.status, note: '@handoff', created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }] } }));
      invalidate('/owner/orders');
      setHandoffOpen(false);
      toast({ title: t('orders.handoffDone') });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy('');
  };
  const setStatus = async (status, n) => {
    setBusy(status);
    try {
      const r = await api(`/owner/orders/${id}/status`, { method: 'PATCH', body: { status, note: n || undefined } });
      mutate((d) => ({ order: { ...d.order, status, next: r.next, ...(r.reserveUntil ? { reserveUntil: r.reserveUntil } : {}), events: [...d.order.events, { status, note: n || null, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }] } }));
      invalidate('/owner/orders?');
      invalidate('/owner/overview');
      toast({ title: t('orders.statusUpdated', { s: statusT(`status.${status}`) }) });
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

  const printSlip = () => {
    const fm = (n) => formatMoney(n, lang);
    printBlock(orderSlipHtml({
      store: store ? tr(store.name) : '', number: o.number,
      date: `${formatDate(o.createdAt, lang, { day: 'numeric', month: 'long', year: 'numeric' })} · ${formatTime(o.createdAt, lang)}`,
      customer: { name: o.customer.name, phone: o.customer.phone, address: [o.customer.address, o.customer.city, o.customer.governorate].filter(Boolean).join('، ') },
      items: o.items.map((i) => ({ name: tr(i.name), variant: i.size ? `${t('product.size')}: ${i.size}` : '', qty: i.qty, total: fm(i.price * i.qty) })),
      totals: [[t('cart.subtotal'), fm(o.subtotal)], ...(o.discount ? [[t('cart.discount'), `-${fm(o.discount)}`]] : []), [t('cart.shipping'), o.shippingFree ? t('qr.free') : o.deliveryGroup ? t('cart.sharedDelivery') : o.shipping ? fm(o.shipping) : t('cart.sharedDelivery')], [t('qr.total'), fm(o.total), true]],
      payment: t('checkout.cod'), notes: o.notes, url: orderUrl(o.id),
      labels: { order: t('qr.order'), items: t('qr.item'), qty: t('qr.qty'), total: t('qr.total'), notes: t('qr.notes'), scan: t('qr.orderScan') },
    }), { page: 'A5', margin: '8mm' });
  };

  const byUs = o.deliveryBy === 'platform';
  const pickup = o.deliveryBy === 'pickup';
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  // in-store reservation wording
  const PK = { pending: L('حجز جديد', 'New reservation'), confirmed: L('جاهزة في المحل', 'Ready in store'), delivered: L('اشتراها', 'Bought'), cancelled: L('اتلغى', 'Cancelled') };
  const PK_ACTION = { confirmed: L('القطعة جاهزة', 'Piece is ready'), delivered: L('اشتراها', 'Bought it') };
  const NOTE = { not_confirmed: L('ماتأكدش في الوقت، فاتلغى لوحده', 'Not confirmed in time, cancelled automatically'), reserve: L('حجز للقياس في المحل', 'Reserved to try in store'), expired: L('وقت الحجز خلص والقطعة رجعت للمخزون', 'Hold time ran out, piece back in stock'), unavailable: L('القطعة اتباعت أو مش متاحة', 'Piece sold / not available'), no_show: L('العميل معدّاش', 'Customer did not come') };
  const statusT = (key, vars) => (pickup && key.startsWith('status.') && PK[key.slice(7)]) ? PK[key.slice(7)] : byUs && o.status === 'processing' && key === 'status.processing' ? t('orders.markReady') : t(key, vars);
  const lastNote = [...o.events].reverse().find((e) => e.note)?.note;
  const sorryWa = `https://wa.me/2${o.customer.phone}?text=${encodeURIComponent(L(`أهلاً ${o.customer.name}، بنعتذر جدًا، القطعة اللي حجزتها (رقم ${o.number}) اتباعت قبل ما تعدّي. لو تحب نوريك حاجة شبهها ابعتلنا.`, `Hi ${o.customer.name}, sorry, the piece you reserved (${o.number}) was sold before you came. Want us to show you something similar?`))}`;
  const left = o.reserveUntil ? Math.max(0, new Date(o.reserveUntil).getTime() - Date.now()) : 0;
  const leftText = left >= 3600e3 ? L(`فاضل ${Math.floor(left / 3600e3)} ساعة`, `${Math.floor(left / 3600e3)} h left`) : L(`فاضل ${Math.ceil(left / 60e3)} دقيقة`, `${Math.ceil(left / 60e3)} min left`);
  const canHandoff = !byUs && ['pending', 'confirmed', 'processing'].includes(o.status);
  const nextMain = o.next.find((s) => s !== 'cancelled');
  const canCancel = o.next.includes('cancelled');
  const wa = `https://wa.me/2${o.customer.phone}?text=${encodeURIComponent(lang === 'ar' ? `أهلاً ${o.customer.name}، بخصوص طلبك رقم ${o.number}` : `Hi ${o.customer.name}, about your order ${o.number}`)}`;

  const actions = (
    <>
      {canCancel && <Button variant="danger-ghost" icon={X} onClick={() => setCancelOpen(true)}>{pickup ? L('اتباعت / اتلغى', 'Sold / cancel') : t('status.action.cancelled')}</Button>}
      {nextMain && <Button variant="brand" icon={Check} loading={busy === nextMain} onClick={() => setStatus(nextMain)}>{pickup ? PK_ACTION[nextMain] : byUs && nextMain === 'processing' ? t('orders.markReady') : t(`status.action.${nextMain}`)}</Button>}
    </>
  );

  return (
    <PageTransition className="pb-20 md:pb-0">
      <PageHeader back="/dashboard/orders"
        title={<span className="flex flex-wrap items-center gap-3"><span dir="ltr">#{o.number}</span><StatusBadge status={o.status} t={statusT} /></span>}
        subtitle={`${formatDate(o.createdAt, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatTime(o.createdAt, lang)}`}
        actions={<div className="hidden items-center gap-2 md:flex"><Button variant="outline" icon={Printer} onClick={printSlip}>{t('orders.print')}</Button>{actions}</div>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel>
            {pickup ? (
              <div className="space-y-3">
                <div className={cx('flex items-start gap-3 rounded-xl p-4', o.status === 'cancelled' ? 'bg-red-50 text-red-800' : o.status === 'delivered' ? 'bg-emerald-50 text-emerald-900' : 'bg-brand/5')}>
                  <StoreIcon className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 text-sm leading-relaxed">
                    <p className="text-base font-semibold">{L('حجز للقياس في المحل', 'Reserved to try in store')} · {PK[o.status]}</p>
                    {o.status === 'pending' && <p>{L('العميل هيعدّي يقيسها ويدفع في المحل. اتأكد إن القطعة موجودة، شيلها على جنب، ودوس «القطعة جاهزة» عشان العميل يعرف إنها مستنياه. لو اتباعت، دوس «اتباعت».', 'The customer will come to try it on and pay in store. Check the piece is there, put it aside and tap “Piece is ready”. If it was sold, tap “Sold”.')}</p>}
                    {o.status === 'confirmed' && <p>{L('القطعة مستنياه. لما ييجي ويشتريها دوس «اشتراها». لو اتباعت لحد تاني أو معدّاش، دوس «اتباعت / اتلغى».', 'Waiting for the customer. Tap “Bought it” when they buy; if it sold to someone else or they did not come, tap “Sold / cancel”.')}</p>}
                    {o.status === 'cancelled' && lastNote && <p>{NOTE[lastNote] || lastNote}</p>}
                    {['pending', 'confirmed'].includes(o.status) && o.reserveUntil && <p className={cx('mt-2 flex items-center gap-1.5 font-semibold', o.status === 'pending' && 'text-amber-800')}><Clock className="h-4 w-4" />{o.status === 'pending' ? L('أكّد قبل', 'Confirm before') : L('محجوزة لحد', 'Held until')} {formatDate(o.reserveUntil, lang, { weekday: 'long' })} {formatTime(o.reserveUntil, lang)} · {leftText}</p>}
                    {o.status === 'pending' && <p className="mt-1 text-[13px]">{L('لو مأكدتش في الوقت ده، الطلب بيتلغى لوحده والقطعة ترجع للبيع.', 'If not confirmed by then, it is cancelled and the piece goes back on sale.')}</p>}
                  </div>
                </div>
                {o.reserveRecord && ['pending', 'confirmed'].includes(o.status) && (
                  <p className={cx('rounded-xl px-4 py-3 text-sm font-medium', o.reserveRecord.noShows > 0 ? 'bg-amber-50 text-amber-900' : o.reserveRecord.bought > 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-surface text-muted')}>
                    {o.reserveRecord.noShows > 0
                      ? L(`⚠️ العميل ده حجز قبل كده ومعدّاش ${o.reserveRecord.noShows} مرة في آخر شهرين. ممكن تكلّمه تتأكد قبل ما تشيل القطعة.`, `⚠️ This customer reserved before and did not come ${o.reserveRecord.noShows} time(s) in the last 2 months. Maybe call before putting it aside.`)
                      : o.reserveRecord.bought > 0
                        ? L(`✓ العميل ده حجز واشترى ${o.reserveRecord.bought} مرة قبل كده.`, `✓ This customer reserved and bought ${o.reserveRecord.bought} time(s) before.`)
                        : L('أول حجز للعميل ده على تويست.', 'First reservation for this customer on Twist.')}
                  </p>
                )}
                {o.status === 'cancelled' && lastNote === 'unavailable' && <Button full variant="outline" icon={MessageCircle} href={sorryWa} target="_blank" rel="noreferrer" className="!text-[#128C7E]">{L('ابعت اعتذار للعميل على واتساب', 'Send the customer an apology on WhatsApp')}</Button>}
              </div>
            ) : o.status === 'cancelled' ? (
              <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4 text-red-800"><X className="h-5 w-5" /><p className="font-semibold">{t('status.cancelled')}</p></div>
            ) : <Stepper status={o.status} events={o.events} t={t} lang={lang} byPlatform={byUs} />}
            {!pickup && !o.next.length && o.status !== 'cancelled' && <p className="mt-4 text-center text-sm text-muted">{t('orders.final')}</p>}
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
                      {it.isGift ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">{lang === 'ar' ? 'هدية مجانية' : 'Free gift'}</span> : <span className="tabular">{formatMoney(it.price, lang)} × {it.qty}</span>}
                      {it.returnedQty > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{lang === 'ar' ? `مرتجع ${it.returnedQty}` : `Returned ${it.returnedQty}`}</span>}
                    </p>
                  </div>
                  {it.isGift ? <span className="font-semibold text-success">{lang === 'ar' ? 'مجانًا' : 'Free'}</span> : it.promoDiscount > 0 ? <span className="flex flex-col items-end leading-tight"><s className="text-xs text-muted tabular">{formatMoney(it.price * it.qty, lang)}</s><span className="font-semibold text-success tabular">{formatMoney(it.price * it.qty - it.promoDiscount, lang)}</span></span> : <span className="font-semibold tabular">{formatMoney(it.price * it.qty, lang)}</span>}
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-base">
              <div className="flex justify-between"><dt className="text-muted">{t('cart.subtotal')}</dt><dd className="tabular">{formatMoney(o.subtotal, lang)}</dd></div>
              {o.platformDiscount > 0 && <div className="rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900">{t('order.platformDiscount', { v: formatMoney(o.platformDiscount, lang) })}</div>}
              {o.promoDiscount > 0 && <div className="flex justify-between text-success"><dt>{lang === 'ar' ? 'خصم العروض' : 'Offers discount'}<span className="block text-xs font-normal opacity-80">{(o.promotions || []).map((p) => tr(p.name)).join(' · ')}</span></dt><dd className="tabular">−{formatMoney(o.promoDiscount, lang)}</dd></div>}
              {o.discount - (o.promoDiscount || 0) > 0 && <div className="flex justify-between text-success"><dt>{t('cart.discount')} {o.coupon && <span className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-xs" dir="ltr">{o.coupon}</span>}</dt><dd className="tabular">−{formatMoney(o.discount - (o.promoDiscount || 0), lang)}</dd></div>}
              {!pickup && <div className="flex justify-between"><dt className="text-muted">{t('cart.shipping')}</dt><dd className="tabular">{o.shippingFree ? t('common.free') : o.deliveryGroup ? t('cart.sharedDelivery') : o.shipping ? formatMoney(o.shipping, lang) : t('cart.sharedDelivery')}</dd></div>}
              {o.deliveryBy === 'platform' && o.shippingFree ? <p className="rounded-lg bg-brand/5 p-3 text-xs leading-5 text-muted">{o.shippingSponsorDue == null ? t('orders.shippingSponsorPending') : t('orders.shippingSponsorDue', { v: formatMoney(o.shippingSponsorDue, lang) })}</p> : o.deliveryGroup && <p className="rounded-lg bg-brand/5 p-3 text-xs leading-5 text-muted">{t('orders.marketplaceFeeNote')}</p>}
              <div className="flex justify-between pt-1 text-lg font-semibold"><dt>{t('cart.total')}</dt><dd className="tabular">{formatMoney(o.total, lang)}</dd></div>
              {o.refunded > 0 && <div className="flex justify-between text-amber-700"><dt>{lang === 'ar' ? 'مرتجعات مستردة' : 'Refunded'}</dt><dd className="tabular">−{formatMoney(o.refunded, lang)}</dd></div>}
            </dl>
            {['shipped', 'delivered'].includes(o.status) && o.items.some((i) => i.qty - (i.returnedQty || 0) > 0) && (
              <Button full variant="outline" className="mt-4" onClick={() => setRetOpen(true)}>{lang === 'ar' ? 'تسجيل مرتجع' : 'Record a return'}</Button>
            )}
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface p-3 text-sm"><Banknote className="h-5 w-5 text-brand" /><span className="font-medium">{pickup ? L('الدفع في المحل', 'Pay in store') : t('checkout.cod')}</span></div>
          </Panel>

          <Panel title={t('orders.timeline')}>
            <ol className="relative space-y-5 ps-6 before:absolute before:inset-y-1 before:start-[7px] before:w-px before:bg-line">
              {[...o.events].reverse().map((e, i) => (
                <li key={i} className="relative">
                  <span className={cx('absolute -start-6 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-elevated', i === 0 ? 'bg-primary' : 'bg-fg/20')} />
                  <p className="text-sm font-semibold">{statusT(`status.${e.status}`)}</p>
                  <p className="text-xs text-muted">{formatDate(e.created_at, lang, { day: 'numeric', month: 'short' })} · {formatTime(e.created_at, lang)}</p>
                  {e.note && <p className="mt-1 text-sm text-muted">{e.note === '@handoff' ? t('orders.evHandoff') : NOTE[e.note] || e.note}</p>}
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
            <p className="mt-4 font-mono text-base" dir="ltr">{o.customer.phone}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" icon={Phone} href={`tel:${o.customer.phone}`}>{t('orders.call')}</Button>
              <Button variant="outline" size="sm" icon={MessageCircle} href={wa} target="_blank" rel="noreferrer" className="!text-[#128C7E]">{t('orders.whatsapp')}</Button>
            </div>
          </Panel>
          {pickup ? (
            <Panel title={L('الاستلام', 'Pickup')}><p className="flex gap-2.5 text-base leading-relaxed"><StoreIcon className="mt-1 h-4 w-4 shrink-0 text-muted" />{L('العميل هيستلم ويدفع في المحل. مفيش توصيل.', 'Collected and paid in store. No delivery.')}</p></Panel>
          ) : (
          <Panel title={t('orders.delivery')}>
            <p className="flex gap-2.5 text-base leading-relaxed"><MapPin className="mt-1 h-4 w-4 shrink-0 text-muted" /><span>{o.customer.address}<br /><span className="text-muted">{o.customer.city} — {t(`gov.${o.customer.governorate}`)}</span></span></p>
            {byUs ? (
              <div className="mt-4 flex items-start gap-3 rounded-xl bg-secondary p-3.5 text-sm"><Truck className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><p><span className="font-semibold">{t('orders.byPlatform')}</span><br /><span className="text-muted">{o.status === 'processing' || o.status === 'shipped' || o.status === 'delivered' ? t('orders.byPlatformReady') : t('orders.byPlatformPrepare')}</span></p></div>
            ) : o.status !== 'cancelled' && o.status !== 'delivered' && o.status !== 'shipped' && (
              <div className="mt-4">
                <Button variant="outline" size="sm" icon={Truck} onClick={() => setHandoffOpen(true)} className="w-full">{t('orders.handoff')}</Button>
                <p className="mt-2 text-[13px] text-muted">{t('orders.handoffHint')}</p>
              </div>
            )}
          </Panel>
          )}
          {o.notes && (
            <Panel title={t('orders.notes')}>
              <p className="flex gap-2.5 rounded-xl bg-amber-50 p-3.5 text-base text-amber-900"><StickyNote className="mt-0.5 h-4 w-4 shrink-0" />{o.notes}</p>
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

      <ConfirmDialog open={handoffOpen} onClose={() => setHandoffOpen(false)} title={t('orders.handoff')} body={t('orders.handoffConfirm')}
        confirmLabel={t('orders.handoffYes')} loading={busy === 'handoff'} onConfirm={handoff} />

      {pickup ? (
        <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} danger title={L('إلغاء الحجز', 'Cancel reservation')} body={L('القطعة هترجع للمخزون على الموقع. ليه؟', 'The piece goes back to stock online. Why?')}
          confirmLabel={L('إلغاء الحجز', 'Cancel reservation')} loading={busy === 'cancelled'} onConfirm={() => setStatus('cancelled', note || 'unavailable')}>
          <div className="mt-4 grid gap-2">
            {[['unavailable', L('القطعة اتباعت أو مش متاحة', 'Sold / not available')], ['no_show', L('العميل معدّاش', 'Customer did not come')]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setNote(k)} aria-pressed={(note || 'unavailable') === k} className={cx('h-11 rounded-xl border px-4 text-start text-sm font-medium', (note || 'unavailable') === k ? 'border-fg bg-fg/[0.04]' : 'border-line')}>{label}</button>
            ))}
          </div>
        </ConfirmDialog>
      ) : (
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} danger title={t('status.action.cancelled')} body={t('orders.confirmCancel')}
        confirmLabel={t('status.action.cancelled')} loading={busy === 'cancelled'} onConfirm={() => setStatus('cancelled', note)}>
        <div className="mt-4"><label className="mb-1.5 block text-sm font-medium text-fg" htmlFor="cancel-note">{t('orders.cancelReason')}</label><Textarea id="cancel-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </ConfirmDialog>
      )}
      <Sheet open={retOpen} onClose={() => setRetOpen(false)} title={lang === 'ar' ? 'تسجيل مرتجع' : 'Record a return'} size="md"
        footer={<Button full disabled={busy === 'return' || !Object.values(ret).some((n) => n > 0)} onClick={doReturn}>{lang === 'ar' ? 'تأكيد المرتجع' : 'Confirm return'}</Button>}>
        <p className="mb-3 text-sm text-muted">{lang === 'ar' ? 'المبلغ المسترد = ما دفعه العميل عن القطع المرتجعة. لو المرتجع يُسقط عرضًا لم يعد مستحقًا يُخصم فرقه. الهدايا المجانية تُرجَع بدون مبلغ.' : 'Refund = what the customer paid for the returned items. If the return breaks an offer that is no longer earned, the difference is deducted. Free gifts return with no refund.'}</p>
        <ul className="space-y-3">
          {o.items.filter((i) => i.qty - (i.returnedQty || 0) > 0).map((it) => {
            const left = it.qty - (it.returnedQty || 0); const n = ret[it.id] || 0;
            return (
              <li key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0 text-sm"><p className="truncate font-medium">{tr(it.name)}{it.isGift ? (lang === 'ar' ? ' (هدية)' : ' (gift)') : ''}</p><p className="text-xs text-muted">{lang === 'ar' ? `متاح للإرجاع ${left}` : `${left} returnable`}</p></div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" aria-label="-" className="h-10 w-10 rounded-lg border border-line-strong text-lg" onClick={() => setRet({ ...ret, [it.id]: Math.max(0, n - 1) })}>−</button>
                  <span className="w-6 text-center tabular">{n}</span>
                  <button type="button" aria-label="+" className="h-10 w-10 rounded-lg border border-line-strong text-lg" onClick={() => setRet({ ...ret, [it.id]: Math.min(left, n + 1) })}>+</button>
                </div>
              </li>
            );
          })}
        </ul>
        {est && (
          <div className="mt-4 space-y-1.5 rounded-xl bg-surface p-3 text-sm">
            <p className="flex justify-between font-semibold"><span>{lang === 'ar' ? 'المبلغ المسترد' : 'Refund'}</span><span className="tabular">{formatMoney(est.refund, lang)}</span></p>
            {est.calculation.promoLost > 0 && <p className="flex justify-between text-amber-700"><span>{lang === 'ar' ? 'عرض لم يعد مستحقًا' : 'Offer no longer earned'}</span><span className="tabular">{formatMoney(est.calculation.promoLost, lang)}</span></p>}
            {est.calculation.giftClawback > 0 && <p className="flex justify-between text-amber-700"><span>{lang === 'ar' ? 'هدية لم تعد مستحقة' : 'Gift no longer earned'}</span><span className="tabular">{formatMoney(est.calculation.giftClawback, lang)}</span></p>}
            <p className="text-xs text-muted">{lang === 'ar' ? 'يُحسب العرض والكوبون من جديد على القطع التي يحتفظ بها العميل. لا يتغيّر إجمالي الطلب الأصلي.' : 'The offer and coupon are recalculated on what the customer keeps. The original order total never changes.'}</p>
          </div>
        )}
        <Checkbox className="mt-3" checked={restock} onChange={setRestock} label={lang === 'ar' ? 'إرجاع القطع للمخزون' : 'Put items back in stock'} />
      </Sheet>
    </PageTransition>
  );
}
