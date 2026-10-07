import { useEffect, useMemo, useState } from 'react';
import { Users, Phone, MessageCircle, Crown, Repeat, Wallet } from 'lucide-react';
import { useApi, useDebounced, useIsDesktop } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, formatNumber, relativeTime, formatDate } from '../../lib/format.js';
import { PageHeader, Pagination, SearchInput, ListSkeleton, KpiCard } from '../../components/dash/Kit.jsx';
import { OrderCard } from '../../components/dash/OrderItem.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Select } from '../../components/ui/Field.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const initials = (n) => n.split(' ').slice(0, 2).map((x) => x[0]).join('');
const hue = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
function Avatar({ name, size = 'h-10 w-10' }) {
  return <span className={cx('grid shrink-0 place-items-center rounded-full text-sm font-semibold', size)} style={{ background: `hsl(${hue(name)} 45% 92%)`, color: `hsl(${hue(name)} 45% 28%)` }}>{initials(name)}</span>;
}

function CustomerSheet({ id, onClose }) {
  const { t, lang } = useI18n();
  const { data } = useApi(id ? `/owner/customers/${id}` : null, { keepPrevious: false });
  const c = data?.customer;
  return (
    <Sheet open={!!id} onClose={onClose} title={c?.name || ' '} side="auto" desktop="end" size="md">
      {!c ? <div className="space-y-3 py-4"><Skeleton className="h-20" /><Skeleton className="h-32" /></div> : (
        <div className="space-y-5 py-4">
          <div className="flex items-center gap-4"><Avatar name={c.name} size="h-14 w-14 text-lg" />
            <div><p className="font-mono" dir="ltr">{c.phone}</p><p className="text-sm text-muted">{c.city} — {t(`gov.${c.governorate}`)}</p></div></div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" icon={Phone} href={`tel:${c.phone}`}>{t('orders.call')}</Button>
            <Button variant="outline" size="sm" icon={MessageCircle} href={`https://wa.me/2${c.phone}`} target="_blank" rel="noreferrer">{t('orders.whatsapp')}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface p-4"><p className="text-xs text-muted">{t('customers.orders')}</p><p className="mt-1 text-xl font-semibold">{formatNumber(c.orders, lang)}</p></div>
            <div className="rounded-2xl bg-surface p-4"><p className="text-xs text-muted">{t('customers.spent')}</p><p className="mt-1 text-xl font-semibold">{formatMoney(c.spent, lang)}</p></div>
          </div>
          <p className="text-sm text-muted">{t('orders.customerSince')} {formatDate(c.since, lang)} · {c.address}</p>
          <div className="space-y-3">{data.orders.map((o) => <OrderCard key={o.id} o={o} />)}</div>
        </div>
      )}
    </Sheet>
  );
}

export default function Customers() {
  const { t, lang } = useI18n();
  const desktop = useIsDesktop();
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const q = useDebounced(term.trim(), 300);
  useEffect(() => setPage(1), [q, sort]);
  const path = useMemo(() => `/owner/customers?${new URLSearchParams({ q, sort, page, limit: 24 })}`, [q, sort, page]);
  const { data, error, loading, reload } = useApi(path);
  const s = data?.summary;
  const vip = (c) => c.spent >= 6000 || c.orders >= 4;

  return (
    <PageTransition>
      <PageHeader title={t('customers.title')} />
      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <KpiCard label={t('customers.total')} value={s?.total} format={(n) => formatNumber(n, lang)} icon={Users} tone="brand" loading={!s} />
        <KpiCard label={t('customers.repeat')} value={s?.repeat} format={(n) => formatNumber(n, lang)} icon={Repeat} tone="violet" loading={!s} hint={s ? `${Math.round((s.repeat / Math.max(1, s.total)) * 100)}%` : null} />
        <KpiCard label={t('customers.avg')} value={s?.avg} format={(n) => formatMoney(n, lang)} icon={Wallet} tone="accent" loading={!s} />
      </div>
      <div className="mb-5 flex gap-2">
        <SearchInput value={term} onChange={setTerm} placeholder={t('customers.search')} className="flex-1" />
        <Select size="sm" value={sort} onChange={(e) => setSort(e.target.value)} className="w-40 shrink-0 sm:w-48 [&_select]:h-11" aria-label={t('common.sort')}>
          {['recent', 'spent', 'orders'].map((x) => <option key={x} value={x}>{t(`customers.sort.${x}`)}</option>)}
        </Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <ListSkeleton /> : !data.items.length ? (
        <EmptyState icon={Users} title={t('customers.empty')} body={t('customers.emptyBody')} />
      ) : (
        <div className={cx('transition-opacity', loading && 'opacity-60')}>
          {desktop ? (
            <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
              <table className="w-full min-w-[640px]">
                <thead><tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-3 ps-5 text-start font-semibold">{t('orders.customer')}</th><th className="py-3 text-start font-semibold">{t('checkout.city')}</th>
                  <th className="py-3 text-start font-semibold">{t('customers.orders')}</th><th className="py-3 text-start font-semibold">{t('customers.spent')}</th><th className="py-3 pe-5 text-start font-semibold">{t('customers.lastOrder')}</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((c) => (
                    <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer transition hover:bg-fg/[0.025]">
                      <td className="py-3 ps-5"><span className="flex items-center gap-3"><Avatar name={c.name} /><span><span className="flex items-center gap-2 font-medium">{c.name}{vip(c) && <Badge tone="warning" size="sm"><Crown className="h-3 w-3" />{t('customers.vip')}</Badge>}</span><span className="block font-mono text-[13px] text-muted" dir="ltr">{c.phone}</span></span></span></td>
                      <td className="py-3 text-sm">{c.city}</td>
                      <td className="py-3 tabular">{formatNumber(c.orders, lang)}</td>
                      <td className="py-3 font-semibold tabular">{formatMoney(c.spent, lang)}</td>
                      <td className="py-3 pe-5 text-sm text-muted">{c.lastOrderAt ? relativeTime(c.lastOrderAt, lang) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.items.map((c) => (
                <button key={c.id} type="button" onClick={() => setOpen(c.id)} className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-4 text-start transition active:scale-[.99]">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-2 truncate font-semibold">{c.name}{vip(c) && <Crown className="h-4 w-4 shrink-0 text-amber-500" />}</p><p className="truncate text-[13px] text-muted">{c.city} · {t('analytics.orders', { n: c.orders })}</p></div>
                  <span className="text-sm font-semibold tabular">{formatMoney(c.spent, lang)}</span>
                </button>
              ))}
            </div>
          )}
          <Pagination page={data.page} pages={data.pages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </div>
      )}
      <CustomerSheet id={open} onClose={() => setOpen(null)} />
    </PageTransition>
  );
}
