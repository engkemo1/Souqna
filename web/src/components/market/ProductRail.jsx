import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductCard, { ProductCardSkeleton } from '../store/ProductCard.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useState } from 'react';
import QuickAddSheet from '../store/QuickAddSheet.jsx';

/** One horizontally-scrolling shelf of products ("Trending", "Deals", …). Renders nothing when empty. */
export default function ProductRail({ title, items, loading, to, tone = '' }) {
  const { t } = useI18n();
  const [quick, setQuick] = useState(null);
  if (!loading && !items?.length) return null;
  return (
    <section className={tone}>
      <div className="container py-10 sm:py-12">
        <div className="mb-6 flex items-end justify-between gap-3">
          <h2 className="font-display text-display-sm font-bold">{title}</h2>
          {to && <Link to={to} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-4 text-sm font-bold text-[#03244D] transition hover:border-fg/40 hover:bg-secondary active:scale-95">{t('market.seeAll')}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></Link>}
        </div>
        <div className="scroll-x -mx-4 gap-3 px-4 pb-2 sm:gap-5">
          {loading ? Array.from({ length: 5 }, (_, i) => <div key={i} className="w-[46%] shrink-0 sm:w-[30%] lg:w-[22%] xl:w-[18%]"><ProductCardSkeleton /></div>) :
            items.map((p, i) => (
              <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22%] xl:w-[18%]">
                <ProductCard product={p} slug={p.store.slug} index={i} showStore onQuickAdd={setQuick} />
              </div>
            ))}
          {!loading && to && (
            <div className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22%] xl:w-[18%]">
              <Link to={to} className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line-strong bg-white text-center text-[#03244D] transition hover:border-fg/40 hover:bg-secondary">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#EAF0F8]"><ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /></span>
                <span className="px-3 text-sm font-bold">{t('market.seeAll')}</span>
              </Link>
            </div>
          )}
        </div>
      </div>
      <QuickAddSheet slug={quick?.store?.slug} product={quick} marketplace onClose={() => setQuick(null)} />
    </section>
  );
}
