import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Banknote, ShoppingBag, Receipt, Percent, Users, Package, Plus, TicketPercent, Share2, ArrowUpRight, AlertTriangle, PackageCheck, BellRing } from 'lucide-react';
import { useApi, useIsDesktop, useMediaQuery } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { formatMoney, formatNumber } from '../../lib/format.js';
import { KpiCard, Panel, PanelLink } from '../../components/dash/Kit.jsx';
import { SalesAreaChart } from '../../components/dash/SalesChart.jsx';
import { OrderCard, OrdersTable } from '../../components/dash/OrderItem.jsx';
import AnimatedNumber from '../../components/ui/AnimatedNumber.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { Segmented } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import AppAlertsCard from '../../components/dash/AppAlertsCard.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

function greeting(t) {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }).format(new Date()));
  return h < 12 ? t('dash.greeting.morning') : h < 17 ? t('dash.greeting.afternoon') : t('dash.greeting.evening');
}

const STATUS_COLORS = { pending: 'bg-amber-400', confirmed: 'bg-sky-500', processing: 'bg-violet-500', shipped: 'bg-blue-600', delivered: 'bg-emerald-600', cancelled: 'bg-red-400' };

export default function Overview() {
  const { t, tr, lang } = useI18n();
  const { store } = useAuth();
  const toast = useToast();
  const desktop = useIsDesktop();
  const wide = useMediaQuery('(min-width: 1280px)');
  const [range, setRange] = useState(7);
  const { data: d, error, loading, reload } = useApi(`/owner/overview?range=${range}`);
  const money = (n) => formatMoney(n, lang);
  const num = (n) => formatNumber(n, lang);

  const share = async () => {
    const url = `${window.location.origin}/s/${store.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: tr(store.name), url });
      else { await navigator.clipboard.writeText(url); toast({ title: t('dash.storeLinkCopied') }); }
    } catch { /* dismissed */ }
  };

  if (error && !d) return <ErrorState error={error} onRetry={reload} />;
  const k = d?.kpis;
  const totalStatus = d ? Object.values(d.statusCounts).reduce((a, b) => a + b, 0) : 0;

  return (
    <PageTransition>
      <AppAlertsCard hideWhenDone className="mb-6" />
      {/* greeting + today */}
      <div className="mb-6 flex flex-col gap-5 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-base text-muted">{greeting(t)} 👋</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">{tr(store.name)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={range} onChange={setRange} options={[7, 30, 90].map((r) => ({ value: r, label: t(`dash.range.${r}`) }))} ariaLabel="Range" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-[#111111] p-5 text-white sm:p-6 lg:col-span-1">
          <div className="pointer-events-none absolute -end-10 -top-10 h-40 w-40 rounded-full bg-[#FF5A1F]/25 blur-2xl" />
          <p className="relative text-sm font-medium text-white/70">{t('dash.todaySales')}</p>
          {!d ? <Skeleton className="mt-3 h-10 w-40 bg-white/10" /> : (
            <p className="relative mt-2 text-[34px] font-semibold sm:text-4xl"><AnimatedNumber value={d.today.sales} format={money} /></p>
          )}
          <p className="relative mt-1 text-sm text-white/70">{d ? t('dash.todayOrders', { n: num(d.today.orders) }) : ' '}</p>
          {d?.today.pending > 0 && (
            <Link to="/dashboard/orders?status=pending" className="relative mt-5 flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3.5 py-3 text-sm ring-1 ring-white/10 transition hover:bg-white/15">
              <span className="flex items-center gap-2.5"><span className="relative grid h-8 w-8 place-items-center rounded-lg bg-[#FF5A1F] text-white"><BellRing className="h-4 w-4" /><span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-amber-300" /></span>{t('dash.pendingOrders', { n: d.today.pending })}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
            </Link>
          )}
        </motion.div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2">
          <KpiCard label={t('dash.sales')} value={k?.sales.value} format={money} delta={k?.sales.delta} icon={Banknote} tone="brand" loading={!d} />
          <KpiCard label={t('dash.ordersKpi')} value={k?.orders.value} format={num} delta={k?.orders.delta} icon={ShoppingBag} tone="accent" loading={!d} />
          <KpiCard label={t('dash.aov')} value={k?.aov.value} format={money} delta={k?.aov.delta} icon={Receipt} tone="violet" loading={!d} />
          <KpiCard label={t('dash.conversion')} value={k?.conversion.value} format={(v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`} delta={k?.conversion.delta} deltaSuffix="pt" icon={Percent} tone="sky" loading={!d}
            hint={k ? `${num(k.visits.value)} ${t('dash.visits')}` : null} />
        </div>
      </div>

      {/* quick actions (mobile & tablet) */}
      <div className="mt-4 grid grid-cols-3 gap-3 lg:hidden">
        {[[Plus, t('dash.addProduct'), '/dashboard/products/new'], [TicketPercent, t('dash.createOffer'), '/dashboard/offers?new=1'], [Share2, t('dash.shareStore'), null]].map(([Icon, label, to]) => {
          const cls = 'flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-elevated px-2 py-4 text-center text-[13px] font-medium transition active:scale-95';
          const inner = <><span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-brand"><Icon className="h-5 w-5" /></span>{label}</>;
          return to ? <Link key={label} to={to} className={cls}>{inner}</Link> : <button key={label} type="button" onClick={share} className={cls}>{inner}</button>;
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title={t('dash.salesOverview')}
          action={<div className="hidden items-center gap-4 text-xs text-muted sm:flex"><span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-[#FF5A1F]" />{t('dash.currentPeriod')}</span><span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[#B9B5AC]" />{t('dash.previousPeriod')}</span></div>}>
          {!d ? <Skeleton className="h-[260px] w-full" /> : <SalesAreaChart series={d.series} previous={d.previousSeries} height={desktop ? 300 : 230} />}
        </Panel>

        <Panel title={t('dash.orderStatus')}>
          {!d ? <div className="space-y-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div> : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-fg/[0.06]">
                {['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => (
                  <motion.span key={s} initial={{ width: 0 }} animate={{ width: `${((d.statusCounts[s] || 0) / totalStatus) * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className={STATUS_COLORS[s]} />
                ))}
              </div>
              <ul className="mt-5 space-y-1">
                {['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => (
                  <li key={s}>
                    <Link to={`/dashboard/orders?status=${s}`} className="-mx-2 flex h-10 items-center justify-between rounded-lg px-2 text-sm transition hover:bg-fg/[0.04]">
                      <span className="flex items-center gap-2.5"><span className={cx('h-2.5 w-2.5 rounded-full', STATUS_COLORS[s])} />{t(`status.${s}`)}</span>
                      <span className="font-semibold tabular">{num(d.statusCounts[s] || 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title={t('dash.recentOrders')} action={<PanelLink to="/dashboard/orders">{t('common.viewAll')}</PanelLink>} bodyClassName="p-0 sm:p-0 pt-0 sm:pt-0">
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {!d ? <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
              : !d.recentOrders.length ? <EmptyState compact icon={ShoppingBag} title={t('orders.empty')} body={t('orders.emptyBody')} />
                : wide ? <div className="-mx-1"><OrdersTable orders={d.recentOrders} /></div>
                  : <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">{d.recentOrders.slice(0, 4).map((o) => <OrderCard key={o.id} o={o} />)}</div>}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel title={t('dash.topProducts')} action={<PanelLink to="/dashboard/analytics">{t('dash.analytics')}</PanelLink>}>
            {!d ? <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
              <ol className="space-y-3">
                {d.topProducts.map((p, i) => (
                  <li key={p.id}>
                    <Link to={`/dashboard/products/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 transition hover:bg-fg/[0.04]">
                      <span className="w-4 text-center text-xs font-semibold text-muted">{i + 1}</span>
                      <SmartImage media={p.image} ratio="1 / 1" sizes="48px" className="h-11 w-11 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tr(p.name)}</p><p className="text-xs text-muted">{t('dash.sold', { n: num(p.qty) })}</p></div>
                      <span className="text-sm font-semibold tabular">{money(p.revenue)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title={t('dash.lowStock')} action={<PanelLink to="/dashboard/products?stock=low">{t('common.viewAll')}</PanelLink>}>
            {!d ? <Skeleton className="h-24" /> : !d.lowStock.length ? (
              <p className="flex items-center gap-2.5 text-sm text-muted"><PackageCheck className="h-5 w-5 text-success" />{t('dash.allGood')}</p>
            ) : (
              <ul className="space-y-3">
                {d.lowStock.map((p) => (
                  <li key={p.id}>
                    <Link to={`/dashboard/products/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 transition hover:bg-fg/[0.04]">
                      <SmartImage media={p.image} ratio="1 / 1" sizes="48px" className="h-11 w-11 shrink-0 rounded-lg" />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{tr(p.name)}</p>
                      <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', p.stock <= 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}>
                        <AlertTriangle className="h-3.5 w-3.5" />{p.stock <= 0 ? t('dash.outOfStock') : t('dash.lowStockLeft', { n: p.stock })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* totals footer */}
      {d && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-fg/[0.05]"><Package className="h-5 w-5" /></span><div><p className="text-lg font-semibold tabular">{num(d.totals.products)}</p><p className="text-xs text-muted">{t('dash.totalProducts')}</p></div></div>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-fg/[0.05]"><Users className="h-5 w-5" /></span><div><p className="text-lg font-semibold tabular">{num(d.totals.customers)}</p><p className="text-xs text-muted">{t('dash.totalCustomers')}</p></div></div>
        </div>
      )}
    </PageTransition>
  );
}
