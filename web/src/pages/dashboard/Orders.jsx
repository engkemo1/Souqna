import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, RefreshCw } from 'lucide-react';
import { useApi, useDebounced, useIsDesktop } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';
import { PageHeader, FilterTabs, Pagination, SearchInput, ListSkeleton } from '../../components/dash/Kit.jsx';
import { OrderCard, OrdersTable } from '../../components/dash/OrderItem.jsx';
import PullToRefresh from '../../components/dash/PullToRefresh.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { IconButton } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const STATUSES = ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function Orders() {
  const { t, lang } = useI18n();
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const [term, setTerm] = useState(params.get('q') || '');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const q = useDebounced(term.trim(), 300);
  useEffect(() => setPage(1), [status, q, sort]);
  const path = useMemo(() => `/owner/orders?${new URLSearchParams({ status, q, sort, page, limit: 20 })}`, [status, q, sort, page]);
  const { data, error, loading, reload } = useApi(path);

  return (
    <PageTransition>
      <PageHeader title={t('orders.title')} subtitle={data ? `${formatNumber(data.counts.all || 0, lang)} ${t('orders.order')}` : ' '}
        actions={<IconButton label={t('common.retry')} icon={RefreshCw} variant="outline" onClick={reload} iconClass={cx('h-5 w-5', loading && 'animate-spin')} />} />

      <FilterTabs value={status} onChange={(s) => setParams(s === 'all' ? {} : { status: s }, { replace: true })}
        options={STATUSES.map((s) => ({ value: s, label: s === 'all' ? t('common.all') : t(`status.${s}`), count: data?.counts?.[s] ?? (data ? 0 : undefined) }))} />

      <div className="mb-5 mt-4 flex gap-2">
        <SearchInput value={term} onChange={setTerm} placeholder={t('orders.search')} className="flex-1" />
        <Select size="sm" value={sort} onChange={(e) => setSort(e.target.value)} className="w-36 shrink-0 sm:w-44 [&_select]:h-11" aria-label={t('common.sort')}>
          <option value="newest">{t('shop.sort.newest')}</option>
          <option value="oldest">{lang === 'ar' ? 'الأقدم' : 'Oldest'}</option>
          <option value="total_desc">{lang === 'ar' ? 'الأعلى قيمة' : 'Highest total'}</option>
          <option value="total_asc">{lang === 'ar' ? 'الأقل قيمة' : 'Lowest total'}</option>
        </Select>
      </div>

      <PullToRefresh onRefresh={reload}>
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <ListSkeleton /> : !data.items.length ? (
          <EmptyState icon={ShoppingBag} title={status === 'all' && !q ? t('orders.empty') : t('orders.emptyFilter')} body={status === 'all' && !q ? t('orders.emptyBody') : null} />
        ) : (
          <div className={cx('transition-opacity', loading && 'opacity-60')}>
            {desktop ? <OrdersTable orders={data.items} /> : <div className="grid gap-3 sm:grid-cols-2">{data.items.map((o) => <OrderCard key={o.id} o={o} />)}</div>}
            <Pagination page={data.page} pages={data.pages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          </div>
        )}
      </PullToRefresh>
    </PageTransition>
  );
}
