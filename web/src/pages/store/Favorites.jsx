import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useFavorites } from '../../lib/cart.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Button from '../../components/ui/Button.jsx';
import PageTransition from '../../components/PageTransition.jsx';

export default function Favorites() {
  const { store } = useStore();
  const { t } = useI18n();
  const favs = useFavorites(store.slug);
  const [quick, setQuick] = useState(null);
  const ids = favs.ids.join(',');
  const { data, error, loading, reload } = useApi(ids ? `/stores/${store.slug}/products?ids=${ids}&limit=48` : null, { keepPrevious: false });
  // keep the user's saved order, and drop items un-favourited this session instantly
  const items = (data?.items || []).filter((p) => favs.has(p.id)).sort((a, b) => favs.ids.indexOf(a.id) - favs.ids.indexOf(b.id));

  return (
    <PageTransition className="container pt-6 sm:pt-10">
      <div className="mb-6 flex items-end justify-between sm:mb-8">
        <h1 className="font-display text-display-sm font-medium">{t('fav.title')}</h1>
        {favs.count > 0 && <span className="text-sm text-muted">{t('common.items', { n: favs.count })}</span>}
      </div>
      {!ids ? (
        <EmptyState icon={Heart} title={t('fav.empty')} body={t('fav.emptyBody')} action={<Button to={sp(store.slug, 'shop')}>{t('cart.startShopping')}</Button>} />
      ) : error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
        <ProductGrid>{Array.from({ length: Math.min(4, favs.count) }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
      ) : (
        <ProductGrid>{items.map((p, i) => <ProductCard key={p.id} product={p} slug={store.slug} onQuickAdd={setQuick} index={i} />)}</ProductGrid>
      )}
      <QuickAddSheet slug={store.slug} product={quick} onClose={() => setQuick(null)} />
    </PageTransition>
  );
}
