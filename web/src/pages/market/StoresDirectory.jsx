import { useEffect, useMemo, useState } from 'react';
import { Search, Store } from 'lucide-react';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import StoreCard, { StoreCardSkeleton } from '../../components/market/StoreCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useApi, useDebounced } from '../../lib/hooks.js';
import CategoryBrowser from '../../components/market/CategoryBrowser.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../../components/ui/cx.js';

export default function StoresDirectory() {
  const { t, lang } = useI18n();
    const [term, setTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('featured');
  const q = useDebounced(term.trim(), 250);
  const path = useMemo(() => `/marketplace?${new URLSearchParams({ q, category, sort })}`, [q, category, sort]);
  const { data, error, loading, reload } = useApi(path);

  useEffect(() => {
    document.title = `${t('market.allStores')} · ${t('app.name')}`;
    window.scrollTo(0, 0);
  }, [t]);

  return (
    <div className="min-h-dvh bg-[#F6F8FB] text-[#03244D]">
      <MarketHeader />
      <main>
        <section className="container pb-2 pt-6 sm:pt-10" aria-label={t('market.allStores')}>
          {/* one title, one search box, one sort — everything else (back link, badge, offers button, repeated captions) was noise */}
          <div className="flex items-end justify-between gap-3">
            <h1 className="font-display text-2xl font-black leading-tight sm:text-4xl">{lang === 'ar' ? 'كل المحلات' : 'All stores'}</h1>
            {data?.stores?.length ? <span className="pb-1 text-sm font-medium text-muted">{lang === 'ar' ? `${new Intl.NumberFormat('ar-EG').format(data.stores.length)} محل` : `${data.stores.length} stores`}</span> : null}
          </div>
          <div className="mb-5 mt-4 flex gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('market.searchStores')} aria-label={t('market.searchStores')} className="h-12 w-full rounded-xl border border-line-strong bg-white ps-10 pe-3 text-base outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" />
            </div>
            <Select size="sm" value={sort} onChange={(e) => setSort(e.target.value)} className="w-32 shrink-0 sm:w-48 [&_select]:h-12" aria-label={t('common.sort')}>
              {['featured', 'rating', 'newest', 'products'].map((item) => <option key={item} value={item}>{t(`market.sort.${item}`)}</option>)}
            </Select>
          </div>

          <CategoryBrowser value={category} onChange={setCategory} />

          {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">{Array.from({ length: 6 }, (_, i) => <StoreCardSkeleton key={i} />)}</div>
          ) : data?.stores?.length ? (
            <>
              <div className={cx('mt-5 grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 lg:gap-6', loading && 'opacity-60')}>
                {data.stores.map((shop, i) => <StoreCard key={shop.id} store={shop} index={i} />)}
              </div>
            </>
          ) : <EmptyState icon={Store} title={t('market.noStores')} body={t('market.noStoresBody')} action={<Button variant="outline" onClick={() => { setTerm(''); setCategory('all'); }}>{t('common.clearAll')}</Button>} />}
        </section>
      </main>
    </div>
  );
}
