import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Store, Tag } from 'lucide-react';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import StoreCard, { StoreCardSkeleton } from '../../components/market/StoreCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { useDepartments } from '../../lib/departments.js';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../../components/ui/cx.js';

export default function StoresDirectory() {
  const { t, lang } = useI18n();
  const { list: departments, label } = useDepartments();
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('featured');
  const q = useDebounced(term.trim(), 250);
  const path = useMemo(() => `/marketplace?${new URLSearchParams({ q, category, sort })}`, [q, category, sort]);
  const { data, error, loading, reload } = useApi(path);
  const cats = ['all', ...departments.map((d) => d.slug)];

  useEffect(() => {
    document.title = `${t('market.allStores')} · ${t('app.name')}`;
    window.scrollTo(0, 0);
  }, [t]);

  return (
    <div className="min-h-dvh bg-[#faf9f7] text-[#14213D]">
      <MarketHeader />
      <main>
        <section className="border-b border-line bg-[radial-gradient(ellipse_at_85%_20%,#fff0e5_0%,transparent_38%),linear-gradient(180deg,#fffdfa_0%,#faf9f7_100%)]">
          <div className="container py-9 sm:py-14">
            <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold text-muted transition hover:text-brand"><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />{lang === 'ar' ? 'العودة للرئيسية' : 'Back to home'}</Link>
            <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#fff0e5] px-3.5 py-1.5 text-xs font-bold text-brand"><Store className="h-4 w-4" />{lang === 'ar' ? 'محلات بنها في مكان واحد' : 'Banha shops in one place'}</span>
                <h1 className="mt-3 font-display text-3xl font-black leading-tight sm:text-5xl">{lang === 'ar' ? 'اكتشف كل المحلات' : 'Discover all stores'}</h1>
                <p className="mt-3 text-sm leading-7 text-[#526078] sm:text-base">{lang === 'ar' ? 'اختار القسم اللي بتدور عليه، قارن بين المحلات، وافتح صفحة كل محل عشان تشوف منتجاته وعروضه.' : 'Choose a department, compare local shops, and open each store page to browse its products and offers.'}</p>
              </div>
              <Link to="/search?sale=1" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-brand/25 bg-white px-4 text-sm font-bold text-brand shadow-sm transition hover:bg-[#fff0e5]"><Tag className="h-4 w-4" />{lang === 'ar' ? 'شوف العروض' : 'Browse offers'}</Link>
            </div>
          </div>
        </section>

        <section className="container py-8 sm:py-10" aria-label={t('market.allStores')}>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-muted">{lang === 'ar' ? 'كل محل له صفحة خاصة بمنتجاته وعروضه' : 'Every shop has its own page for products and offers'}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('market.searchStores')} aria-label={t('market.searchStores')} className="h-11 w-full rounded-xl border border-line-strong bg-white ps-10 pe-3 text-base outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10" />
              </div>
              <Select size="sm" value={sort} onChange={(e) => setSort(e.target.value)} className="sm:w-48 [&_select]:h-11" aria-label={t('common.sort')}>
                {['featured', 'rating', 'newest', 'products'].map((item) => <option key={item} value={item}>{t(`market.sort.${item}`)}</option>)}
              </Select>
            </div>
          </div>

          <div className="mb-7 flex flex-wrap gap-2" role="tablist" aria-label={t('settings.category')}>
            {cats.map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} onClick={() => setCategory(item)} className={cx('rounded-full border px-3.5 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm', category === item ? 'border-brand bg-brand text-white shadow-sm' : 'border-line-strong bg-white text-[#43516a] hover:border-brand/50 hover:text-brand')}>
              {item === 'all' ? t('cat.all') : label(item)}
            </button>)}
          </div>

          {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">{Array.from({ length: 6 }, (_, i) => <StoreCardSkeleton key={i} />)}</div>
          ) : data?.stores?.length ? (
            <>
              <p className="mb-4 text-xs font-medium text-muted">{lang === 'ar' ? `عرض ${new Intl.NumberFormat('ar-EG').format(data.stores.length)} محل` : `Showing ${data.stores.length} stores`}</p>
              <div className={cx('grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 lg:gap-6', loading && 'opacity-60')}>
                {data.stores.map((shop, i) => <StoreCard key={shop.id} store={shop} index={i} />)}
              </div>
            </>
          ) : <EmptyState icon={Store} title={t('market.noStores')} body={t('market.noStoresBody')} action={<Button variant="outline" onClick={() => { setTerm(''); setCategory('all'); }}>{t('common.clearAll')}</Button>} />}
        </section>
      </main>
    </div>
  );
}
