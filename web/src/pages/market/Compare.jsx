import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Star, X } from 'lucide-react';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { Price } from '../../components/ui/Commerce.jsx';
import Button from '../../components/ui/Button.jsx';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useCompare } from '../../lib/compare.js';
import { formatNumber } from '../../lib/format.js';
import { sp } from '../../lib/store.jsx';

const parseIds = (s) => [...new Set(String(s || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4);

/** Side-by-side comparison (max 4). The ids live in the URL so a comparison can be shared; the picked list on this device is the fallback. */
export default function Compare() {
  const { lang, tr } = useI18n();
  const ar = lang === 'ar';
  const [params, setParams] = useSearchParams();
  const picked = useCompare();
  const urlIds = parseIds(params.get('ids'));
  const ids = urlIds.length ? urlIds : picked.ids;
  const { data, error, reload } = useApi(ids.length ? `/compare?ids=${ids.join(',')}` : null, { keepPrevious: false });
  const items = data?.items || [];

  useEffect(() => { document.title = `${ar ? 'مقارنة المنتجات' : 'Compare products'} · Twist`; }, [ar]);

  const drop = (id) => {
    picked.remove(id);
    const rest = ids.filter((x) => x !== id);
    setParams(rest.length ? { ids: rest.join(',') } : {}, { replace: true });
  };

  const minPrice = items.length > 1 ? Math.min(...items.map((p) => p.price)) : null;
  const bestRating = items.length > 1 ? Math.max(...items.map((p) => p.rating || 0)) : 0;
  const name = (n) => (n ? n[lang] || n.ar || '' : '');
  const cols = { gridTemplateColumns: `6.5rem repeat(${Math.max(items.length, 1)}, minmax(9.5rem, 1fr))` };

  const rows = [
    { key: 'store', label: ar ? 'المحل' : 'Store', cell: (p) => <Link to={`/s/${p.store.slug}`} className="font-medium hover:text-brand">{name(p.store.name)}</Link> },
    { key: 'price', label: ar ? 'السعر' : 'Price', cell: (p) => (
      <div><Price value={p.price} compareAt={p.compareAt} size="md" />{p.discount > 0 && <span className="mt-1 inline-block rounded-full bg-sale/10 px-2 py-0.5 text-xs font-semibold text-sale">-{p.discount}%</span>}{minPrice !== null && p.price === minPrice && <span className="ms-1 mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{ar ? 'الأرخص' : 'Lowest'}</span>}</div>
    ) },
    { key: 'rating', label: ar ? 'التقييم' : 'Rating', cell: (p) => (p.ratingCount > 0
      ? <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{formatNumber(Math.round(p.rating * 10) / 10, lang)}<span className="text-xs text-muted">({formatNumber(p.ratingCount, lang)})</span>{bestRating > 0 && p.rating === bestRating && items.length > 1 && <span className="ms-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{ar ? 'الأعلى' : 'Top'}</span>}</span>
      : <span className="text-muted">{ar ? 'لسه مفيش تقييمات' : 'No reviews yet'}</span>) },
    { key: 'material', label: ar ? 'الخامة' : 'Material', cell: (p) => (p.material ? name(p.material) : <span className="text-muted">—</span>) },
    { key: 'colors', label: ar ? 'الألوان' : 'Colours', cell: (p) => (p.colors?.length
      ? <span className="flex flex-wrap gap-1.5">{p.colors.map((c) => <span key={c.hex} title={tr({ ar: c.name_ar || c.name, en: c.name_en || c.name }) || c.hex} className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/15" style={{ backgroundColor: c.hex }} />)}</span>
      : <span className="text-muted">—</span>) },
    { key: 'sizes', label: ar ? 'المقاسات المتاحة' : 'Sizes in stock', cell: (p) => (p.sizes?.length
      ? <span className="flex flex-wrap gap-1">{p.sizes.map((z) => <span key={z} className="rounded-md border border-line-strong px-1.5 py-0.5 text-xs font-semibold">{z}</span>)}</span>
      : <span className="text-muted">—</span>) },
    { key: 'stock', label: ar ? 'التوفر' : 'Availability', cell: (p) => (p.stock === 'out' ? <span className="font-semibold text-sale">{ar ? 'خلصان' : 'Out of stock'}</span> : p.stock === 'low' ? <span className="font-semibold text-amber-700">{ar ? 'كمية قليلة' : 'Low stock'}</span> : <span className="font-semibold text-emerald-700">{ar ? 'متوفر' : 'In stock'}</span>) },
  ];

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <MarketHeader />
      <main className="container max-w-6xl pb-20 pt-6 sm:pt-10">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-brand"><ArrowLeftRight className="h-5 w-5" /></span>
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{ar ? 'مقارنة المنتجات' : 'Compare products'}</h1>
            <p className="text-sm text-muted">{ar ? 'السعر والخامة والألوان والمقاسات جنب بعض' : 'Price, material, colours and sizes side by side'}</p>
          </div>
        </div>

        {error && !data ? <ErrorState error={error} onRetry={reload} /> : !ids.length || (data && !items.length) ? (
          <EmptyState icon={ArrowLeftRight} title={ar ? 'مفيش منتجات للمقارنة' : 'Nothing to compare yet'} body={ar ? 'دوس «قارن» على أي منتج في نتايج البحث وضيف لحد 4 منتجات.' : 'Tap “Compare” on any search result to add up to 4 products.'} action={<Button to="/search" variant="outline">{ar ? 'ابدأ البحث' : 'Start searching'}</Button>} />
        ) : !data ? (
          <p className="text-sm text-muted" aria-live="polite">{ar ? 'بنحمّل…' : 'Loading…'}</p>
        ) : (
          <>
            {items.length < 2 && <p className="mb-4 rounded-xl bg-secondary px-4 py-3 text-sm">{ar ? 'ضيف منتج تاني على الأقل عشان المقارنة تبقى مفيدة.' : 'Add at least one more product to compare.'} <Link to="/search" className="font-semibold text-brand underline">{ar ? 'كمّل بحث' : 'Keep searching'}</Link></p>}
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="grid min-w-max gap-x-3 sm:min-w-0" style={cols} role="table">
                <div />
                {items.map((p) => (
                  <div key={p.id} className="relative pb-3" role="columnheader">
                    <button type="button" onClick={() => drop(p.id)} aria-label={ar ? 'شيل من المقارنة' : 'Remove'} className="absolute end-1.5 top-1.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-neutral-900 shadow-sm"><X className="h-4 w-4" /></button>
                    <Link to={sp(p.store.slug, `p/${p.slug}`)} className="block overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                      <SmartImage media={p.image} alt={name(p.name)} ratio="4 / 5" sizes="(min-width:1024px) 22vw, 50vw" className="w-full" />
                    </Link>
                    <Link to={sp(p.store.slug, `p/${p.slug}`)} className="mt-2 line-clamp-2 block text-sm font-semibold leading-snug hover:text-brand">{name(p.name)}</Link>
                  </div>
                ))}
                {rows.map((r) => (
                  <div key={r.key} className="contents" role="row">
                    <div className="sticky start-0 z-[1] border-t border-line bg-canvas py-3 pe-2 text-xs font-semibold text-muted" role="rowheader">{r.label}</div>
                    {items.map((p) => <div key={p.id} className="border-t border-line py-3 text-sm" role="cell">{r.cell(p)}</div>)}
                  </div>
                ))}
                <div />
                {items.map((p) => <div key={p.id} className="border-t border-line pt-3"><Button to={sp(p.store.slug, `p/${p.slug}`)} size="md" full>{ar ? 'شوف المنتج' : 'View product'}</Button></div>)}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
