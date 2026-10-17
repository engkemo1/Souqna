import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Trash2, ArrowRight } from 'lucide-react';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import MobileBottomNav from '../../components/market/MobileBottomNav.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Button from '../../components/ui/Button.jsx';
import { useMarketFavorites } from '../../lib/cart.jsx';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';

export default function MarketFavorites() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { ids, count, clear } = useMarketFavorites();
  const [quick, setQuick] = useState(null);

  const idsParam = useMemo(() => (ids.length ? ids.join(',') : null), [ids]);
  const { data, error, loading, reload } = useApi(idsParam ? `/search?ids=${idsParam}` : null, { keepPrevious: false });

  // Order returned products to match the order they were favorited, filtering out any removed items
  const products = useMemo(() => {
    if (!data?.items) return [];
    return data.items
      .filter((p) => ids.includes(p.id))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }, [data?.items, ids]);

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <MarketHeader />
      <main className="container max-w-6xl py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-brand shadow-sm">
              <Heart className="h-6 w-6 fill-brand text-brand" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold sm:text-3xl">{ar ? 'المفضلة' : 'Favorites'}</h1>
                {count > 0 && (
                  <span className="rounded-full bg-[#EAF0F8] px-2.5 py-0.5 text-xs font-bold text-brand">
                    {ar ? `${count} قطعة` : `${count} items`}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                {ar ? 'كل القطع والملابس اللي حفظتيها من محلات بنها في مكان واحد' : 'All your saved items from Banha stores, together'}
              </p>
            </div>
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 self-start rounded-xl px-3 py-2 text-xs font-semibold text-muted transition hover:bg-sale/10 hover:text-sale sm:self-auto"
            >
              <Trash2 className="h-4 w-4" />
              {ar ? 'تفريغ المفضلة' : 'Clear all'}
            </button>
          )}
        </div>

        {/* Content */}
        {!ids.length ? (
          <div className="rounded-3xl border border-line bg-elevated px-5 py-16 text-center shadow-sm">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#EAF0F8] text-brand">
              <Heart className="h-8 w-8" />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-[#03244D] sm:text-2xl">
              {ar ? 'مفيش منتجات في المفضلة لسه' : 'No favorites yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              {ar
                ? 'اضغطي على علامة القلب على أي قطعة تعجبك في المحلات عشان تحفظيها هنا وترجعيلها في أي وقت.'
                : 'Click the heart icon on any product you like to save it here and view it later.'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button to="/search" iconEnd={ArrowRight}>
                {ar ? 'اكتشف المنتجات' : 'Browse products'}
              </Button>
              <Button to="/stores" variant="outline">
                {ar ? 'تصفّح المحلات' : 'Browse stores'}
              </Button>
            </div>
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <ProductGrid>
            {Array.from({ length: Math.min(8, count) }, (_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </ProductGrid>
        ) : (
          <ProductGrid>
            {products.map((p, i) => (
              <ProductCard
                key={p.id}
                product={p}
                slug={p.store?.slug || p.storeSlug}
                showStore
                onQuickAdd={setQuick}
                index={i}
              />
            ))}
          </ProductGrid>
        )}
      </main>

      <QuickAddSheet
        slug={quick?.store?.slug}
        product={quick}
        marketplace
        onClose={() => setQuick(null)}
      />
      <MobileBottomNav />
    </div>
  );
}
