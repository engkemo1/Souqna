import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Banknote, ShoppingBag, Receipt, Percent, Eye, Repeat } from 'lucide-react';
import { useApi, useIsDesktop } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, formatNumber, formatDate } from '../../lib/format.js';
import { PageHeader, KpiCard, Panel } from '../../components/dash/Kit.jsx';
import { SalesAreaChart, SimpleBars } from '../../components/dash/SalesChart.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { Segmented } from '../../components/ui/Field.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import PageTransition from '../../components/PageTransition.jsx';

const PALETTE = ['#F8620A', '#F8620A', '#6C8EAD', '#B9A37E', '#8E6C8A', '#5E8C61'];

function BarList({ rows, valueOf, labelOf, format, colorful }) {
  const max = Math.max(1, ...rows.map(valueOf));
  const total = rows.reduce((s, r) => s + valueOf(r), 0) || 1;
  return (
    <ul className="space-y-4">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorful ? PALETTE[i % PALETTE.length] : '#F8620A' }} /><span className="truncate">{labelOf(r)}</span></span>
            <span className="shrink-0 tabular"><b className="font-semibold">{format(valueOf(r))}</b> <span className="text-xs text-muted">{Math.round((valueOf(r) / total) * 100)}%</span></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-fg/[0.06]">
            <motion.div className="h-full rounded-full" style={{ background: colorful ? PALETTE[i % PALETTE.length] : '#F8620A' }} initial={{ width: 0 }} whileInView={{ width: `${(valueOf(r) / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PageTrafficList({ rows, totalViews, format, t }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">{t('analytics.noPages')}</p>;
  const typeLabel = (type) => t(`analytics.pageType.${type}`) || t('analytics.pageType.page');
  return (
    <ol className="divide-y divide-line">
      {rows.map((row, i) => {
        const basePath = row.path.split('/').slice(0, 3).join('/');
        const route = row.path.slice(basePath.length).replace(/\/$/, '') || '/';
        const title = row.type === 'store' ? t('analytics.pageStore') : row.type === 'catalog' || route === '/categories' ? typeLabel(row.type === 'catalog' ? 'catalog' : 'category') : route.split('/').filter(Boolean).slice(-1)[0] || t('analytics.pageStore');
        return (
          <li key={row.path} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-bold text-brand">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold" dir="auto">{title}</span>
              <span className="mt-0.5 block text-xs text-muted">{typeLabel(row.type)}</span>
            </span>
            <span className="shrink-0 text-end">
              <span className="block text-sm font-semibold tabular">{t('analytics.pageVisits', { n: format(row.views) })}</span>
              <span className="mt-0.5 block text-xs text-muted">{t('analytics.pageShare', { n: Math.round((row.views / Math.max(1, totalViews)) * 100) })}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Analytics() {
  const { t, tr, lang } = useI18n();
  const desktop = useIsDesktop();
  const [range, setRange] = useState(30);
  const { data: d, error, reload } = useApi(`/owner/analytics?range=${range}`);
  const money = (n) => formatMoney(n, lang);
  const num = (n) => formatNumber(n, lang);
  if (error && !d) return <ErrorState error={error} onRetry={reload} />;
  const k = d?.kpis;
  const weekdays = t('analytics.weekdays').split(',');
  const peak = d ? d.byHour.reduce((a, b) => (b.orders > a.orders ? b : a), d.byHour[0]) : null;
  const hourLabel = (h) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { hour: 'numeric', hour12: true, timeZone: 'UTC' }).format(new Date(Date.UTC(2020, 0, 1, h)));
  const f = d?.funnel;
  const traffic = d?.traffic;

  return (
    <PageTransition>
      <PageHeader title={t('analytics.title')} actions={<Segmented value={range} onChange={setRange} options={[7, 30, 90].map((r) => ({ value: r, label: t(`dash.range.${r}`) }))} />} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label={t('analytics.revenue')} value={k?.sales.value} format={money} delta={k?.sales.delta} icon={Banknote} tone="brand" loading={!d} />
        <KpiCard label={t('dash.ordersKpi')} value={k?.orders.value} format={num} delta={k?.orders.delta} icon={ShoppingBag} tone="accent" loading={!d} />
        <KpiCard label={t('dash.aov')} value={k?.aov.value} format={money} delta={k?.aov.delta} icon={Receipt} tone="violet" loading={!d} />
        <KpiCard label={t('dash.visits')} value={k?.visits.value} format={num} delta={k?.visits.delta} icon={Eye} tone="sky" loading={!d} />
        <KpiCard label={t('dash.conversion')} value={k?.conversion.value} format={(v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`} delta={k?.conversion.delta} deltaSuffix="pt" icon={Percent} loading={!d} />
        <KpiCard label={t('analytics.repeatRate')} value={k?.repeatRate.value} format={(v) => `${Math.round(v)}%`} icon={Repeat} loading={!d} />
      </div>

      <Panel className="mt-4" title={t('analytics.revenue')}>
        {!d ? <Skeleton className="h-[280px]" /> : <SalesAreaChart series={d.series} previous={d.previousSeries} height={desktop ? 320 : 240} />}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t('analytics.pageViews')} subtitle={t('analytics.pageViewsHelp')}>
          {!traffic ? <Skeleton className="h-40" /> : (
            <>
              <div className="rounded-2xl bg-secondary p-5">
                <p className="text-sm font-medium text-muted">{t('analytics.viewsInRange')}</p>
                <p className="mt-1 text-4xl font-bold tabular text-brand">{num(traffic.pageViews)}</p>
                <p className="mt-3 text-sm font-medium text-fg">{t(traffic.previousPageViews === 0 && traffic.pageViews > 0 ? 'analytics.viewsNew' : traffic.pageViewsDelta > 0 ? 'analytics.viewsUp' : traffic.pageViewsDelta < 0 ? 'analytics.viewsDown' : 'analytics.viewsSame', { n: Math.abs(traffic.pageViewsDelta) })}</p>
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-1 text-xs font-medium text-muted">{t('analytics.dailyViews')}</p>
                <SimpleBars data={traffic.pageViewSeries.map((x) => ({ ...x, label: formatDate(`${x.day} 12:00:00`, lang, { day: 'numeric', month: 'short' }) }))} dataKey="views" labelKey="label" height={desktop ? 190 : 160} />
              </div>
            </>
          )}
        </Panel>
        <Panel title={t('analytics.topPages')} subtitle={t('analytics.topPagesHelp')}>
          {!traffic ? <Skeleton className="h-52" /> : <PageTrafficList rows={traffic.topPages} totalViews={traffic.pageViews} format={num} t={t} />}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t('analytics.byCategory')}>
          {!d ? <Skeleton className="h-40" /> : <BarList rows={d.byCategory} valueOf={(r) => r.revenue} labelOf={(r) => tr(r.name)} format={money} colorful />}
        </Panel>
        <Panel title={t('analytics.byCity')}>
          {!d ? <Skeleton className="h-40" /> : <BarList rows={d.byCity} valueOf={(r) => r.orders} labelOf={(r) => r.city} format={(n) => t('analytics.orders', { n: num(n) })} />}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t('analytics.byHour')} subtitle={peak ? t('analytics.peak', { h: hourLabel(peak.hour) }) : null}>
          {!d ? <Skeleton className="h-52" /> : <SimpleBars data={d.byHour.map((x) => ({ ...x, label: hourLabel(x.hour) }))} dataKey="orders" labelKey="label" />}
        </Panel>
        <Panel title={t('analytics.byWeekday')}>
          {!d ? <Skeleton className="h-52" /> : <SimpleBars data={d.byWeekday.map((x) => ({ ...x, label: weekdays[x.wd] }))} dataKey="orders" labelKey="label" color="#F8620A" />}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-2" title={t('analytics.funnel')}>
          {!f ? <Skeleton className="h-48" /> : (
            <ol className="space-y-3">
              {[[t('analytics.funnel.visits'), f.visits], [t('analytics.funnel.views'), f.productViews], [t('analytics.funnel.orders'), f.orders]].map(([label, v], i, arr) => {
                const pct = Math.max(4, (v / Math.max(1, Math.max(...arr.map((x) => x[1])))) * 100);
                return (
                  <li key={label}>
                    <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="font-semibold tabular">{num(v)}</span></div>
                    <div className="h-9 overflow-hidden rounded-lg bg-fg/[0.05]">
                      <motion.div className="flex h-full items-center justify-end rounded-lg px-2 text-xs font-semibold text-white" style={{ background: PALETTE[i] }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, delay: i * 0.12 }}>
                        {i === arr.length - 1 && `${((v / Math.max(1, arr[0][1])) * 100).toFixed(1)}%`}
                      </motion.div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
        <Panel className="lg:col-span-3" title={t('analytics.topProducts')}>
          {!d ? <Skeleton className="h-48" /> : (
            <ol className="divide-y divide-line">
              {d.topProducts.map((p, i) => (
                <li key={p.id}>
                  <Link to={`/dashboard/products/${p.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                    <span className="w-5 text-center text-sm font-semibold text-muted">{i + 1}</span>
                    <SmartImage media={p.image} ratio="1 / 1" sizes="48px" className="h-11 w-11 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{tr(p.name)}</span><span className="text-xs text-muted">{t('analytics.units', { n: num(p.qty) })}</span></span>
                    <span className="font-semibold tabular">{money(p.revenue)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </PageTransition>
  );
}
