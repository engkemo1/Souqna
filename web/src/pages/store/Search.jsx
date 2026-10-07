import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search as SearchIcon, X, TrendingUp, Clock } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useApi, useDebounced, useLocalState } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import PageTransition from '../../components/PageTransition.jsx';

export default function Search() {
  const { store, categories } = useStore();
  const { t, tr, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get('q') || '');
  const q = useDebounced(value.trim(), 280);
  const [recent, setRecent] = useLocalState(`souqna.recent.${store.slug}`, []);
  const [quick, setQuick] = useState(null);
  const input = useRef(null);
  const { data, error, loading, reload } = useApi(q.length >= 2 ? `/stores/${store.slug}/products?q=${encodeURIComponent(q)}&limit=24` : null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    setParams(q ? { q } : {}, { replace: true });
    if (q.length >= 3) setRecent((r) => [q, ...r.filter((x) => x !== q)].slice(0, 6));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const popular = lang === 'ar' ? ['هودي', 'جاكيت', 'جينز', 'تيشيرت', 'بنطلون'] : ['Hoodie', 'Jacket', 'Jeans', 'Tee', 'Joggers'];

  return (
    <PageTransition className="container pt-5 sm:pt-10">
      <h1 className="sr-only">{t('search.title')}</h1>
      <div className="relative mx-auto max-w-2xl">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input ref={input} type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.title')}
          className="h-14 w-full rounded-2xl border border-line-strong bg-elevated ps-12 pe-12 text-base shadow-sm outline-none transition focus:border-ring focus:shadow-ring [&::-webkit-search-cancel-button]:hidden" />
        {value && <button type="button" onClick={() => { setValue(''); input.current?.focus(); }} aria-label={t('common.clear')} className="absolute end-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-fg/[0.06]"><X className="h-5 w-5" /></button>}
      </div>

      {q.length < 2 ? (
        <div className="mx-auto mt-8 max-w-2xl space-y-8">
          {recent.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted"><Clock className="h-4 w-4" />{t('search.recent')}</h2>
              <div className="flex flex-wrap gap-2">{recent.map((r) => <button key={r} type="button" onClick={() => setValue(r)} className="h-10 rounded-full border border-line-strong px-4 text-sm font-medium hover:border-fg">{r}</button>)}</div>
            </section>
          )}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted"><TrendingUp className="h-4 w-4" />{t('search.popular')}</h2>
            <div className="flex flex-wrap gap-2">{popular.map((r) => <button key={r} type="button" onClick={() => setValue(r)} className="h-10 rounded-full bg-fg/[0.06] px-4 text-sm font-medium hover:bg-fg/[0.1]">{r}</button>)}</div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">{t('store.categories')}</h2>
            <div className="flex flex-wrap gap-2">{categories.map((c) => <Link key={c.id} to={sp(store.slug, `shop?category=${c.slug}`)} className="h-10 rounded-full border border-line-strong px-4 text-sm font-medium leading-10 hover:border-fg">{tr(c.name)}</Link>)}</div>
          </section>
        </div>
      ) : (
        <div className="mt-8">
          {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
            <ProductGrid>{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
          ) : data?.items.length ? (
            <>
              <p className="mb-5 text-sm text-muted" aria-live="polite">{t('common.results', { n: data.total })}</p>
              <ProductGrid>{data.items.map((p, i) => <ProductCard key={p.id} product={p} slug={store.slug} onQuickAdd={setQuick} index={i} />)}</ProductGrid>
            </>
          ) : (
            <EmptyState title={t('search.noResults', { q })} body={t('search.noResultsBody')} />
          )}
        </div>
      )}
      <QuickAddSheet slug={store.slug} product={quick} onClose={() => setQuick(null)} />
    </PageTransition>
  );
}
