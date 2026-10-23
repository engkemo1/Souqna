import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';
import { formatNumber, formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import MarketSearchBar from '../../components/market/MarketSearchBar.jsx';
import StylistChat from '../../components/market/StylistChat.jsx';
import Brand from '../../components/market/Brand.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { cx } from '../../components/ui/cx.js';
import SearchFilters from '../../components/market/SearchFilters.jsx';
import { api } from '../../lib/api.js';
import RequestBanner from '../../components/market/RequestBanner.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';

export default function MarketSearch() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const department = params.get('department') || '';
  const sort = params.get('sort') || 'relevance';
  const { list, label, pathLabel } = useDepartments();
  const dq = useDebounced(q, 150);
  const FILTER_KEYS = ['min', 'max', 'sale', 'new', 'in_stock', 'rating', 'store', 'same_day', 'sizes', 'colors', 'category', 'audience'];
  const [open, setOpen] = useState(false);
  const key = new URLSearchParams({ q: dq, department, sort, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']).filter(([, v]) => v)) }).toString();
  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length + (department ? 1 : 0);
  const { data, error, loading, reload } = useApi(`/search?${key}`);
  const [more, setMore] = useState({ key: '', items: [], page: 1 });
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState(null);
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
  const csv = (k) => (params.get(k) || '').split(',').filter(Boolean);
  const without = (k, v) => set({ [k]: csv(k).filter((x) => x !== v).join(',') });
  const activeChips = [
    params.get('category') && { id: 'category', label: (data?.facets?.categories || []).find((c) => c.key === params.get('category'))?.name?.[lang] || params.get('category'), remove: () => set({ category: '' }) },
    params.get('audience') && { id: 'audience', label: ({ men: 'رجالي', women: 'حريمي', boys: 'ولادي', girls: 'بناتي', kids: 'أطفال', unisex: 'للجنسين' })[params.get('audience')] || params.get('audience'), remove: () => set({ audience: '' }) },
    department && { id: 'department', label: pathLabel(department), remove: () => set({ department: '' }) },
    (params.get('min') || params.get('max')) && { id: 'price', label: `${params.get('min') || 0} – ${params.get('max') || '∞'} ${t('search.price').includes('EGP') ? 'EGP' : 'ج.م'}`, remove: () => set({ min: '', max: '' }) },
    ...[['sale', 'search.onSale'], ['in_stock', 'search.inStock'], ['rating', 'search.rating4'], ['same_day', 'sameday.filter']].filter(([k]) => params.get(k) === '1').map(([k, m]) => ({ id: k, label: t(m), remove: () => set({ [k]: '' }) })),
    params.get('new') && { id: 'new', label: t('search.lastDays', { n: formatNumber(Number(params.get('new')) > 1 ? Number(params.get('new')) : 30, lang) }), remove: () => set({ new: '' }) },
    params.get('store') && { id: 'store', label: (data?.facets?.stores || []).find((x) => x.slug === params.get('store'))?.name?.[lang] || params.get('store'), remove: () => set({ store: '' }) },
    ...csv('sizes').map((z) => ({ id: `size-${z}`, label: `${t('search.size')}: ${z}`, remove: () => without('sizes', z) })),
    ...csv('colors').map((h) => ({ id: `color-${h}`, label: t('search.color'), swatch: h, remove: () => without('colors', h) })),
  ].filter(Boolean);
  const clearFilters = () => { const n = new URLSearchParams(); if (q) n.set('q', q); if (sort !== 'relevance') n.set('sort', sort); setParams(n, { replace: true }); };
  const panel = <SearchFilters params={params} set={set} facets={data?.facets} departments={list} label={label} activeCount={activeCount} onClear={clearFilters} />;

  return (
    <div className="min-h-dvh">
      <MarketHeader />
      <main className="container pb-20 pt-4 sm:pt-8">
        <div className="max-w-2xl" key={q}><MarketSearchBar initial={q} autoFocus={!q && !department} chips={false} /></div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-elevated px-4 text-sm font-semibold lg:hidden">
            <SlidersHorizontal className="h-4 w-4" />{t('search.filters')}{activeCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1 text-xs text-canvas">{activeCount}</span>}
          </button>
          <Select size="sm" value={sort} onChange={(e) => set({ sort: e.target.value === 'relevance' ? '' : e.target.value })} className="ms-auto w-48 sm:w-52 [&_select]:h-11" aria-label={t('common.sort')}>
            {['relevance', 'best', 'price_asc', 'price_desc', 'discount', 'rating', 'newest'].map((s) => <option key={s} value={s}>{t(`search.sort.${s}`)}</option>)}
          </Select>
        </div>

        <div className="mt-5 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block"><div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pe-1">{panel}</div></aside>
          <div className="min-w-0">
        {!params.get('category') && (data?.facets?.categories?.length || 0) > 1 && (
          <section className="mb-7" aria-label={t('search.shopByCategory')}>
            <h2 className="mb-3 font-display text-lg font-bold">{t('search.shopByCategory')}</h2>
            <div className="scroll-x -mx-4 gap-3 px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 lg:grid-cols-4 xl:grid-cols-6">
              {data.facets.categories.slice(0, 12).map((c) => (
                <button key={c.key} type="button" onClick={() => set({ category: c.key })} className="group w-32 shrink-0 text-start sm:w-auto">
                  <span className="block overflow-hidden rounded-2xl bg-secondary ring-1 ring-line transition group-hover:ring-fg/40">
                    {c.image ? <SmartImage media={c.image} ratio="1 / 1" sizes="(min-width:1024px) 14vw, 40vw" className="w-full transition duration-500 group-hover:scale-105" /> : <span className="block aspect-square" />}
                  </span>
                  <span className="mt-2 block truncate text-sm font-semibold">{c.name[lang] || c.name.ar}</span>
                  <span className="block text-xs text-muted">{formatNumber(c.n, lang)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {activeCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2" aria-label={t('search.activeFilters')}>
            {activeChips.map((c) => (
              <button key={c.id} type="button" onClick={c.remove} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-elevated ps-3.5 pe-2.5 text-sm font-medium transition hover:border-fg">
                {c.swatch && <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: c.swatch }} />}
                {c.label}<X className="h-3.5 w-3.5 text-muted" aria-label="remove" />
              </button>
            ))}
            <button type="button" onClick={clearFilters} className="text-sm font-semibold text-brand hover:underline">{t('search.clearFilters')}</button>
          </div>
        )}
        <p className="mb-5 text-sm text-muted" aria-live="polite">
          {loading && !data ? t('common.loading') : q || department
            ? t('search.results', { n: formatNumber(total, lang), range: data?.price?.max ? `${formatMoney(data.price.min, lang)} – ${formatMoney(data.price.max, lang)}` : '' })
            : t('search.allProducts', { n: formatNumber(total, lang) })}
        </p>

        {error && !data ? <ErrorState error={error} onRetry={reload} /> : !data ? (
          <ProductGrid>{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
        ) : items.length ? (
          <>
            <ProductGrid>{items.map((p, i) => <ProductCard key={`${p.store.slug}-${p.id}`} product={p} slug={p.store.slug} index={i} showStore onQuickAdd={setQuick} />)}</ProductGrid>
            {page < (data.pages || 1) && <div className="mt-10 text-center"><Button variant="outline" size="lg" loading={busy} onClick={loadMore}>{t('common.loadMore')}</Button></div>}
          </>
        ) : (
          <>
          <EmptyState icon={SearchX} title={q ? t('search.noResultsFor', { q }) : t('search.noResults')} body={q ? t('search.noResultsForBody') : t('search.noResultsBody')} action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>{t('common.clearAll')}</Button>} />
          {q && <RequestBanner className="!px-0 mt-6" title={t('req.empty')} query={q} />}
          </>
        )}
          </div>
        </div>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('search.filters')}>
            <button type="button" className="absolute inset-0 bg-black/50" aria-label="close" onClick={() => setOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-canvas shadow-lift">
              <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="font-display text-lg font-bold">{t('search.filters')}</h2><button type="button" onClick={() => setOpen(false)} aria-label="close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary"><X className="h-5 w-5" /></button></div>
              <div className="overflow-y-auto px-5 py-4">{panel}</div>
              <div className="border-t border-line p-4"><Button size="lg" className="w-full" onClick={() => setOpen(false)}>{t('search.showResults', { n: formatNumber(total, lang) })}</Button></div>
            </div>
          </div>
        )}
      </main>
      <footer className="container flex items-center justify-between border-t border-line py-8 text-sm text-muted"><Brand /><p>© {new Date().getFullYear()} {t('market.footer')}</p></footer>
      <StylistChat />
      <QuickAddSheet slug={quick?.store?.slug} product={quick} marketplace onClose={() => setQuick(null)} />
    </div>
  );
}
