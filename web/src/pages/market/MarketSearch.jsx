import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';
import { formatNumber, formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import MarketSearchBar from '../../components/market/MarketSearchBar.jsx';
import Brand from '../../components/market/Brand.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { cx } from '../../components/ui/cx.js';
import { api } from '../../lib/api.js';

export default function MarketSearch() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const department = params.get('department') || '';
  const sort = params.get('sort') || 'relevance';
  const { list, label } = useDepartments();
  const dq = useDebounced(q, 150);
  const key = new URLSearchParams({ q: dq, department, sort }).toString();
  const { data, error, loading, reload } = useApi(`/search?${key}`);
  const [more, setMore] = useState({ key: '', items: [], page: 1 });
  const [busy, setBusy] = useState(false);
  const items = [...(data?.items || []), ...(more.key === key ? more.items : [])];
  const page = more.key === key ? more.page : 1;

  useEffect(() => { document.title = `${q ? `${q} · ` : ''}${t('search.title')} · ${t('app.name')}`; }, [q, t]);
  const set = (patch) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setParams(n, { replace: true }); };
  const loadMore = async () => {
    setBusy(true);
    try { const r = await api(`/search?${key}&page=${page + 1}`); setMore({ key, items: [...(more.key === key ? more.items : []), ...r.items], page: page + 1 }); } catch { /* ignore */ }
    setBusy(false);
  };
  const total = data?.total ?? 0;

  return (
    <div className="min-h-dvh">
      <MarketHeader />
      <main className="container pb-20 pt-4 sm:pt-8">
        <div className="max-w-2xl" key={q}><MarketSearchBar initial={q} autoFocus={!q && !department} /></div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="scroll-x -mx-4 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label={t('settings.departments')}>
            {[{ slug: '', name: t('search.allDepartments') }, ...list.map((d) => ({ slug: d.slug, name: label(d.slug) }))].map((d) => (
              <button key={d.slug} type="button" role="tab" aria-selected={department === d.slug} onClick={() => set({ department: d.slug })}
                className={cx('h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition', department === d.slug ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>{d.name}</button>
            ))}
          </div>
          <Select size="sm" value={sort} onChange={(e) => set({ sort: e.target.value === 'relevance' ? '' : e.target.value })} className="sm:w-52 [&_select]:h-11" aria-label={t('common.sort')}>
            {['relevance', 'price_asc', 'price_desc', 'newest'].map((s) => <option key={s} value={s}>{t(`search.sort.${s}`)}</option>)}
          </Select>
        </div>

        <p className="mb-5 mt-5 text-sm text-muted" aria-live="polite">
          {loading && !data ? t('common.loading') : q || department
            ? t('search.results', { n: formatNumber(total, lang), range: data?.price?.max ? `${formatMoney(data.price.min, lang)} – ${formatMoney(data.price.max, lang)}` : '' })
            : t('search.allProducts', { n: formatNumber(total, lang) })}
        </p>

        {error && !data ? <ErrorState error={error} onRetry={reload} /> : !data ? (
          <ProductGrid>{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
        ) : items.length ? (
          <>
            <ProductGrid>{items.map((p, i) => <ProductCard key={`${p.store.slug}-${p.id}`} product={p} slug={p.store.slug} index={i} showStore />)}</ProductGrid>
            {page < (data.pages || 1) && <div className="mt-10 text-center"><Button variant="outline" size="lg" loading={busy} onClick={loadMore}>{t('common.loadMore')}</Button></div>}
          </>
        ) : (
          <EmptyState icon={SearchX} title={t('search.noResults')} body={t('search.noResultsBody')} action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>{t('common.clearAll')}</Button>} />
        )}
      </main>
      <footer className="container flex items-center justify-between border-t border-line py-8 text-sm text-muted"><Brand /><p>© {new Date().getFullYear()} {t('market.footer')}</p></footer>
    </div>
  );
}
