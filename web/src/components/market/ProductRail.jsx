import { Link } from 'react-router-dom';
import ProductCard, { ProductCardSkeleton } from '../store/ProductCard.jsx';
import { useI18n } from '../../lib/i18n.jsx';

/** One horizontally-scrolling shelf of products ("Trending", "Deals", …). Renders nothing when empty. */
export default function ProductRail({ title, items, loading, to, tone = '' }) {
  const { t } = useI18n();
  if (!loading && !items?.length) return null;
  return (
    <section className={tone}>
      <div className="container py-10 sm:py-12">
        <div className="mb-6 flex items-end justify-between gap-3">
          <h2 className="font-display text-display-sm font-bold">{title}</h2>
          {to && <Link to={to} className="shrink-0 text-sm font-semibold text-brand hover:underline">{t('market.seeAll')}</Link>}
        </div>
        <div className="scroll-x -mx-4 gap-3 px-4 pb-2 sm:gap-5">
          {loading ? Array.from({ length: 5 }, (_, i) => <div key={i} className="w-[46%] shrink-0 sm:w-[30%] lg:w-[22%] xl:w-[18%]"><ProductCardSkeleton /></div>) :
            items.map((p, i) => (
              <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22%] xl:w-[18%]">
                <ProductCard product={p} slug={p.store.slug} index={i} showStore />
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
