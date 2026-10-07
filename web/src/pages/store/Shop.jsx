import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, Check, PackageSearch } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';
import { onColor } from '@souqna/shared/theme';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Select, Switch } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const SORTS = ['featured', 'newest', 'best', 'price_asc', 'price_desc', 'discount'];
const FILTER_KEYS = ['category', 'sizes', 'colors', 'min', 'max', 'sale'];

function FilterPanel({ value, onChange, facets, categories }) {
  const { t, tr } = useI18n();
  const set = (k, v) => onChange({ ...value, [k]: v || undefined });
  const toggleList = (k, item) => {
    const list = (value[k] || '').split(',').filter(Boolean);
    const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
    set(k, next.join(','));
  };
  const has = (k, item) => (value[k] || '').split(',').includes(item);

  return (
    <div className="divide-y divide-line">
      <section className="pb-6">
        <h3 className="mb-3 text-sm font-semibold">{t('shop.filter.category')}</h3>
        <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
          {[{ slug: '', name: { ar: t('common.all'), en: t('common.all') } }, ...categories].map((c) => {
            const active = (value.category || '') === c.slug;
            return (
              <button key={c.slug || 'all'} type="button" onClick={() => set('category', c.slug)}
                className={cx('flex h-10 items-center justify-between gap-3 rounded-full border px-4 text-sm font-medium transition lg:rounded-xl lg:border-0 lg:px-3',
                  active ? 'border-fg bg-fg text-canvas lg:bg-fg/[0.07] lg:text-fg' : 'border-line-strong hover:border-fg lg:hover:bg-fg/[0.04]')}>
                {tr(c.name)}
                {c.count != null && <span className={cx('hidden text-xs lg:inline', active ? 'text-fg' : 'text-muted')}>{c.count}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {facets?.sizes?.length > 0 && (
        <section className="py-6">
          <h3 className="mb-3 text-sm font-semibold">{t('shop.filter.size')}</h3>
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => (
              <button key={s} type="button" onClick={() => toggleList('sizes', s)} aria-pressed={has('sizes', s)}
                className={cx('h-10 min-w-[3rem] rounded-xl border px-3 text-sm font-semibold transition', has('sizes', s) ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>{s}</button>
            ))}
          </div>
        </section>
      )}

      {facets?.colors?.length > 0 && (
        <section className="py-6">
          <h3 className="mb-3 text-sm font-semibold">{t('shop.filter.color')}</h3>
          <div className="flex flex-wrap gap-2.5">
            {facets.colors.map((c) => {
              const on = has('colors', c.hex.toUpperCase());
              return (
                <button key={c.hex} type="button" onClick={() => toggleList('colors', c.hex.toUpperCase())} aria-pressed={on} title={tr({ ar: c.name_ar, en: c.name_en })} aria-label={tr({ ar: c.name_ar, en: c.name_en })}
                  className={cx('grid h-10 w-10 place-items-center rounded-full ring-offset-2 ring-offset-elevated transition', on ? 'ring-2 ring-fg' : 'hover:ring-1 hover:ring-line-strong')}>
                  <span className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-inset ring-black/10" style={{ background: c.hex }}>
                    {on && <Check className="h-4 w-4" strokeWidth={3} style={{ color: onColor(c.hex) }} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="py-6">
        <h3 className="mb-3 text-sm font-semibold">{t('shop.filter.price')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input inputMode="numeric" size="sm" placeholder={`${t('shop.filter.min')} ${facets?.price?.min ?? ''}`} value={value.min || ''} onChange={(e) => set('min', e.target.value.replace(/\D/g, ''))} aria-label={t('shop.filter.min')} />
          <Input inputMode="numeric" size="sm" placeholder={`${t('shop.filter.max')} ${facets?.price?.max ?? ''}`} value={value.max || ''} onChange={(e) => set('max', e.target.value.replace(/\D/g, ''))} aria-label={t('shop.filter.max')} />
        </div>
      </section>

      <section className="pt-6">
        <Switch label={t('shop.filter.onSale')} checked={value.sale === '1'} onChange={(v) => set('sale', v ? '1' : '')} />
      </section>
    </div>
  );
}

export default function Shop() {
  const { store, categories } = useStore();
  const { t, tr, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState({});
  const [quick, setQuick] = useState(null);
  const [extra, setExtra] = useState({ page: 1, items: [], loading: false });
  const sentinel = useRef(null);

  const query = useMemo(() => {
    const q = new URLSearchParams(params);
    q.delete('page');
    q.set('limit', '24');
    return q.toString();
  }, [params]);
  const { data, error, loading, reload } = useApi(`/stores/${store.slug}/products?${query}&page=1`);
  const draftQuery = useMemo(() => new URLSearchParams(Object.entries(draft).filter(([, v]) => v)).toString(), [draft]);
  const { data: draftCount } = useApi(sheet ? `/stores/${store.slug}/products?${draftQuery}&limit=1` : null);

  useEffect(() => { setExtra({ page: 1, items: [], loading: false }); }, [query]);

  const items = [...(data?.items || []), ...extra.items];
  const hasMore = data && extra.page < data.pages;
  const loadMore = async () => {
    if (extra.loading || !hasMore) return;
    setExtra((e) => ({ ...e, loading: true }));
    try {
      const next = await api(`/stores/${store.slug}/products?${query}&page=${extra.page + 1}`);
      setExtra((e) => ({ page: e.page + 1, items: [...e.items, ...next.items], loading: false }));
    } catch { setExtra((e) => ({ ...e, loading: false })); }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadMore(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  });

  const current = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || undefined]));
  const activeCount = FILTER_KEYS.filter((k) => k !== 'category' && params.get(k)).length;
  const apply = (v) => {
    const next = new URLSearchParams(params);
    for (const k of FILTER_KEYS) { if (v[k]) next.set(k, v[k]); else next.delete(k); }
    setParams(next, { replace: true });
  };
  const setSort = (s) => { const next = new URLSearchParams(params); next.set('sort', s); setParams(next, { replace: true }); };
  const cat = categories.find((c) => c.slug === params.get('category'));
  const q = params.get('q');
  const title = q ? `“${q}”` : params.get('sale') === '1' ? t('store.onSale') : cat ? tr(cat.name) : t('shop.title');

  const chips = [];
  for (const s of (current.sizes || '').split(',').filter(Boolean)) chips.push({ key: `size-${s}`, label: s, remove: () => apply({ ...current, sizes: current.sizes.split(',').filter((x) => x !== s).join(',') }) });
  for (const c of (current.colors || '').split(',').filter(Boolean)) {
    const col = data?.facets?.colors?.find((x) => x.hex.toUpperCase() === c);
    chips.push({ key: `color-${c}`, label: col ? tr({ ar: col.name_ar, en: col.name_en }) : c, swatch: c, remove: () => apply({ ...current, colors: current.colors.split(',').filter((x) => x !== c).join(',') }) });
  }
  if (current.min || current.max) chips.push({ key: 'price', label: `${current.min || 0} – ${current.max || '∞'}`, remove: () => apply({ ...current, min: undefined, max: undefined }) });
  if (current.sale) chips.push({ key: 'sale', label: t('shop.filter.onSale'), remove: () => apply({ ...current, sale: undefined }) });

  return (
    <PageTransition className="container pt-6 sm:pt-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="font-display text-display-sm font-medium">{title}</h1>
          <p className="mt-1.5 text-sm text-muted" aria-live="polite">{data ? t('common.results', { n: formatNumber(data.total, lang) }) : ' '}</p>
        </div>
      </div>

      {/* category chips */}
      <div className="scroll-x -mx-4 mb-4 gap-2 px-4 lg:hidden">
        {[{ slug: '', name: { ar: t('common.all'), en: t('common.all') } }, ...categories].map((c) => {
          const active = (params.get('category') || '') === c.slug;
          return (
            <button key={c.slug || 'all'} type="button" onClick={() => apply({ ...current, category: c.slug || undefined })}
              className={cx('h-10 shrink-0 snap-start rounded-full border px-4 text-sm font-medium transition', active ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated')}>
              {tr(c.name)}
            </button>
          );
        })}
      </div>

      {/* toolbar */}
      <div className="sticky top-0 z-20 -mx-4 mb-6 flex items-center gap-2 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur lg:static lg:mx-0 lg:mb-8 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <Button variant="outline" size="sm" icon={SlidersHorizontal} onClick={() => { setDraft(current); setSheet(true); }} className="lg:hidden">
          {t('common.filters')}{activeCount > 0 && <span className="ms-1 grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1 text-[11px] text-canvas">{activeCount}</span>}
        </Button>
        <div className="hidden min-w-0 flex-1 flex-wrap gap-2 lg:flex">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={c.remove} className="inline-flex h-9 items-center gap-2 rounded-full bg-fg/[0.06] ps-3.5 pe-2.5 text-sm font-medium hover:bg-fg/[0.1]">
              {c.swatch && <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c.swatch }} />}{c.label}<X className="h-3.5 w-3.5" />
            </button>
          ))}
          {chips.length > 1 && <button type="button" onClick={() => apply({ category: current.category })} className="h-9 px-2 text-sm font-semibold underline-offset-4 hover:underline">{t('common.clearAll')}</button>}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <label htmlFor="sort" className="hidden text-sm text-muted sm:block">{t('common.sort')}</label>
          <Select id="sort" size="sm" value={params.get('sort') || 'featured'} onChange={(e) => setSort(e.target.value)} className="w-[180px]">
            {SORTS.map((s) => <option key={s} value={s}>{t(`shop.sort.${s}`)}</option>)}
          </Select>
        </div>
      </div>

      {/* mobile active chips */}
      {chips.length > 0 && (
        <div className="scroll-x -mx-4 -mt-3 mb-5 gap-2 px-4 lg:hidden">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={c.remove} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-fg/[0.06] ps-3.5 pe-2.5 text-sm font-medium">
              {c.swatch && <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c.swatch }} />}{c.label}<X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10 xl:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pe-2 no-scrollbar">
            <FilterPanel value={current} onChange={apply} facets={data?.facets} categories={categories} />
          </div>
        </aside>

        <div className="min-w-0">
          {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
            <ProductGrid className="xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 9 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
          ) : items.length === 0 ? (
            <EmptyState icon={PackageSearch} title={t('shop.empty')} body={t('shop.emptyBody')}
              action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>{t('common.clearAll')}</Button>} />
          ) : (
            <>
              <ProductGrid className={cx('transition-opacity duration-300 xl:grid-cols-3 2xl:grid-cols-4', loading && 'opacity-50')}>
                {items.map((p, i) => <ProductCard key={p.id} product={p} slug={store.slug} onQuickAdd={setQuick} index={i} priority={i < 2} />)}
                {extra.loading && Array.from({ length: 3 }, (_, i) => <ProductCardSkeleton key={`s${i}`} />)}
              </ProductGrid>
              <div ref={sentinel} className="flex justify-center py-10">
                {hasMore && <Button variant="outline" onClick={loadMore} disabled={extra.loading}>{extra.loading ? <Spinner /> : t('common.loadMore')}</Button>}
              </div>
            </>
          )}
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('common.filters')} side="bottom"
        footer={(
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setDraft({ category: draft.category })}>{t('common.clear')}</Button>
            <Button full onClick={() => { apply(draft); setSheet(false); }}>{t('shop.showResults', { n: draftCount ? formatNumber(draftCount.total, lang) : '…' })}</Button>
          </div>
        )}>
        <div className="py-2">
          <FilterPanel value={draft} onChange={setDraft} facets={data?.facets} categories={categories} />
        </div>
      </Sheet>
      <QuickAddSheet slug={store.slug} product={quick} onClose={() => setQuick(null)} />
    </PageTransition>
  );
}
