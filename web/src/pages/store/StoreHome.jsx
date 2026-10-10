import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Copy, Ticket } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import HeroSlider from '../../components/store/HeroSlider.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';
import { TrustStrip } from '../../components/store/StoreChrome.jsx';
import VisitCard from '../../components/store/VisitCard.jsx';
import StoreHero, { StoreIdentityBar } from '../../components/store/StoreHero.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';

export function SectionHeader({ title, eyebrow, to, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`mb-6 flex items-end justify-between gap-4 sm:mb-8 ${className}`}>
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="font-display text-display-sm font-bold">{title}</h2>
      </div>
      {to && (
        <Link to={to} className="group inline-flex shrink-0 items-center gap-1.5 pb-1 text-sm font-semibold text-fg">
          <span className="link-underline">{t('common.viewAll')}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/** Mobile: horizontal swipe rail. Desktop: 4-up grid. */
function ProductRail({ items, slug, onQuickAdd, loading }) {
  if (loading) {
    return (
      <div className="scroll-x -mx-4 gap-3 px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="w-[46%] shrink-0 sm:w-auto"><ProductCardSkeleton /></div>)}
      </div>
    );
  }
  return (
    <div className="scroll-x -mx-4 gap-3 px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 sm:overflow-visible sm:px-0 xl:grid-cols-4">
      {items.map((p, i) => (
        <div key={p.id} className="w-[46%] shrink-0 snap-start xs:w-[44%] sm:w-auto sm:[&:nth-child(n+7)]:hidden xl:[&:nth-child(n+7)]:block xl:[&:nth-child(n+9)]:hidden">
          <ProductCard product={p} slug={slug} onQuickAdd={onQuickAdd} index={i} />
        </div>
      ))}
    </div>
  );
}

function CategoryTiles() {
  const { store, categories } = useStore();
  const { tr, t } = useI18n();
  if (!categories.length) return null;
  return (
    <section className="container mt-14 sm:mt-20">
      <SectionHeader title={t('store.shopByCategory')} />
      <div className="scroll-x -mx-4 gap-3 px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {categories.map((c, i) => (
          <motion.div key={c.id} className="w-[62%] shrink-0 snap-start xs:w-[52%] sm:w-auto"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5 }}>
            <Link to={sp(store.slug, `shop?category=${c.slug}`)} className="group relative block overflow-hidden rounded-3xl">
              <SmartImage media={c.image} ratio="4 / 5" sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 60vw" imgClassName="group-hover:scale-[1.04] duration-[1.2s]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white sm:p-5">
                <div>
                  <p className="font-display text-xl font-bold sm:text-2xl">{tr(c.name)}</p>
                  <p className="mt-0.5 text-sm text-white/80">{t('categories.count', { n: c.count })}</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-neutral-900 transition-transform duration-300 group-hover:scale-110">
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function OfferBand() {
  const { offers } = useStore();
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const o = offers[0];
  if (!o) return null;
  const value = o.type === 'percentage' ? `${o.value}%` : o.type === 'fixed' ? formatMoney(o.value, lang) : t('offers.type.free_shipping');
  const copy = () => {
    navigator.clipboard?.writeText(o.code).catch(() => {});
    toast({ title: t('common.copied'), description: o.code, icon: Ticket });
  };
  return (
    <section className="container mt-14 sm:mt-20">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-8 text-on-primary sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-on-primary/10" />
        <div className="pointer-events-none absolute -bottom-24 end-24 h-56 w-56 rounded-full bg-on-primary/5" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold opacity-80">{tr(o.title)}</p>
            <p className="mt-1 font-display text-4xl font-bold sm:text-5xl">{o.type === 'free_shipping' ? value : t('offers.off', { v: value })}</p>
            {o.minSubtotal > 0 && <p className="mt-2 text-sm opacity-80">{t('offers.minOrder', { v: formatMoney(o.minSubtotal, lang) })}</p>}
          </div>
          <button type="button" onClick={copy} className="group inline-flex h-14 items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-on-primary/40 bg-on-primary/10 ps-5 pe-3 transition hover:bg-on-primary/15 active:scale-[.98] sm:min-w-[260px]">
            <span className="font-mono text-lg font-bold tracking-widest">{o.code}</span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-on-primary px-3 py-2 text-sm font-semibold text-primary"><Copy className="h-4 w-4" />{t('common.copy')}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export default function StoreHome() {
  const { store, banners } = useStore();
  const { t, tr } = useI18n();
  const { data, error, loading, reload } = useApi(`/stores/${store.slug}/home`);
  const [quick, setQuick] = useState(null);

  return (
    <PageTransition>
      {(() => {
        // The owner chooses: cover, slider, or auto (slider when there are active banners, cover otherwise).
        const useSlider = store.heroMode === 'cover' ? false : banners.length > 0;
        return useSlider ? (<><HeroSlider banners={banners} slug={store.slug} /><StoreIdentityBar /></>) : <StoreHero />;
      })()}

      <div className="container mt-8 sm:mt-12"><TrustStrip /></div>

      {error ? <div className="container"><ErrorState error={error} onRetry={reload} /></div> : (
        <>
          <section className="container mt-14 sm:mt-20">
            <SectionHeader eyebrow={tr(store.name)} title={t('store.newArrivals')} to={sp(store.slug, 'shop?sort=newest')} />
            <ProductRail items={data?.newArrivals || []} slug={store.slug} onQuickAdd={setQuick} loading={loading && !data} />
          </section>

          <CategoryTiles />

          {(loading || data?.bestSellers?.length > 0) && (
            <section className="container mt-14 sm:mt-20">
              <SectionHeader title={t('store.bestSellers')} to={sp(store.slug, 'shop?sort=best')} />
              <ProductRail items={data?.bestSellers || []} slug={store.slug} onQuickAdd={setQuick} loading={loading && !data} />
            </section>
          )}

          <OfferBand />

          {data?.onSale?.length > 0 && (
            <section className="container mt-14 sm:mt-20">
              <SectionHeader title={t('store.onSale')} to={sp(store.slug, 'shop?sale=1')} />
              <ProductGrid>
                {data.onSale.slice(0, 8).map((p, i) => <ProductCard key={p.id} product={p} slug={store.slug} onQuickAdd={setQuick} index={i} />)}
              </ProductGrid>
            </section>
          )}
        </>
      )}
      <QuickAddSheet slug={store.slug} product={quick} onClose={() => setQuick(null)} />
      <VisitCard />
    </PageTransition>
  );
}
