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
import StoreStoryCard from '../../components/store/StoreStoryCard.jsx';
import FreeShippingBar from '../../components/store/FreeShippingBar.jsx';
import FlashBanner from '../../components/store/FlashBanner.jsx';
import TickerStrip from '../../components/store/TickerStrip.jsx';
import { HeroSplit, HeroCompact } from '../../components/store/HeroVariants.jsx';
import { useDesign } from '../../lib/design.js';

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
  const { cat } = useDesign();
  if (!categories.length) return null;
  if (cat === 'circles') {
    return (
      <section className="container mt-14 sm:mt-20">
        <SectionHeader title={t('store.shopByCategory')} />
        <div className="scroll-x -mx-4 gap-5 px-4 sm:mx-0 sm:flex sm:flex-wrap sm:justify-center sm:gap-8 sm:px-0">
          {categories.map((c) => (
            <Link key={c.id} to={sp(store.slug, `shop?category=${c.slug}`)} className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center sm:w-32">
              <span className="block w-full overflow-hidden rounded-full ring-2 ring-accent/60 ring-offset-2 ring-offset-canvas"><SmartImage media={c.image} ratio="1 / 1" sizes="128px" imgClassName="group-hover:scale-[1.06] duration-700" /></span>
              <span className="line-clamp-2 text-[13px] font-semibold sm:text-sm">{tr(c.name)}</span>
            </Link>
          ))}
        </div>
      </section>
    );
  }
  if (cat === 'list') {
    return (
      <section className="container mt-14 sm:mt-20">
        <SectionHeader title={t('store.shopByCategory')} />
        <div className="flex flex-wrap gap-2.5">
          {categories.map((c) => (
            <Link key={c.id} to={sp(store.slug, `shop?category=${c.slug}`)} className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold ring-1 ring-line-strong transition hover:bg-btn hover:text-white">
              {tr(c.name)}<span className="text-xs font-normal opacity-60">{c.count}</span>
            </Link>
          ))}
        </div>
      </section>
    );
  }
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
  if (!offers?.length) return null;
  return (
    <section className="container mt-14 sm:mt-20">
      <SectionHeader title={t('offers.title')} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {offers.map((o) => {
          const value = o.type === 'percentage' ? `${o.value}%` : o.type === 'fixed' ? formatMoney(o.value, lang) : t('offers.type.free_shipping');
          const copy = () => {
            navigator.clipboard?.writeText(o.code).catch(() => {});
            toast({ title: t('common.copied'), description: o.code, icon: Ticket });
          };
          return (
            <article key={o.id} className="relative isolate overflow-hidden rounded-3xl bg-primary p-5 text-on-primary shadow-sm sm:p-6">
              <div className="pointer-events-none absolute -end-10 -top-12 -z-10 h-40 w-40 rounded-full bg-on-primary/10" />
              <p className="line-clamp-1 text-sm font-semibold opacity-85">{tr(o.title)}</p>
              <p className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{o.type === 'free_shipping' ? value : t('offers.off', { v: value })}</p>
              {o.minSubtotal > 0 && <p className="mt-2 text-sm opacity-80">{t('offers.minOrder', { v: formatMoney(o.minSubtotal, lang) })}</p>}
              <button type="button" onClick={copy} className="mt-5 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-on-primary/40 bg-on-primary/10 px-3 py-2 transition hover:bg-on-primary/15 active:scale-[.99]">
                <span className="truncate font-mono text-base font-bold tracking-widest" dir="ltr">{o.code}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-on-primary px-3 py-2 text-sm font-semibold text-primary"><Copy className="h-4 w-4" />{t('common.copy')}</span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function StoreHome() {
  const { store, banners } = useStore();
  const { t, tr } = useI18n();
  const { data, error, loading, reload } = useApi(`/stores/${store.slug}/home`);
  const [quick, setQuick] = useState(null);

  const customization = store?.customization || {};
  const hidden = new Set(customization.hiddenSections || []);
  const design = useDesign();
  const explicitOrder = Array.isArray(customization.sectionsOrder) && customization.sectionsOrder.length > 0 ? customization.sectionsOrder : null;
  const STANDARD = ['hero', 'free_shipping', 'trust', 'new_arrivals', 'categories', 'best_sellers', 'offers', 'on_sale', 'story', 'visit'];
  // الترتيب: اللي صاحب المحل حدده، وإلا ترتيب القالب. ticker/flash اختيارية: بتظهر بس لو موجودة في الترتيب.
  const allSections = [...new Set([...(explicitOrder || design.sections), ...STANDARD])];

  const renderSection = (key) => {
    if (hidden.has(key)) return null;

    switch (key) {
      case 'hero': {
        const hasBanners = banners.length > 0;
        const sliderHero = (<><HeroSlider banners={banners} slug={store.slug} /><StoreIdentityBar /></>);
        let node;
        if (design.hero === 'cover') node = <StoreHero />;
        else if (design.hero === 'slider') node = hasBanners ? sliderHero : <StoreHero />;
        else if (design.hero === 'split') node = <HeroSplit banners={banners} />;
        else if (design.hero === 'compact') node = hasBanners ? (<><HeroCompact /><HeroSlider banners={banners} slug={store.slug} /></>) : <HeroCompact />;
        else node = (store.heroMode === 'cover' ? false : hasBanners) ? sliderHero : <StoreHero />;
        return <div key="hero">{node}</div>;
      }

      case 'ticker':
        return <div key="ticker"><TickerStrip /></div>;

      case 'flash':
        return <FlashBanner key="flash" />;

      case 'free_shipping':
        return (
          <div key="free_shipping" className="container mt-4 sm:mt-6">
            <FreeShippingBar />
          </div>
        );

      case 'trust':
        return (
          <div key="trust" className="container mt-8 sm:mt-12">
            <TrustStrip />
          </div>
        );

      case 'new_arrivals':
        return (
          <section key="new_arrivals" className="container mt-14 sm:mt-20">
            <SectionHeader eyebrow={tr(store.name)} title={t('store.newArrivals')} to={sp(store.slug, 'shop?sort=newest')} />
            <ProductRail items={data?.newArrivals || []} slug={store.slug} onQuickAdd={setQuick} loading={loading && !data} />
          </section>
        );

      case 'categories':
        return <CategoryTiles key="categories" />;

      case 'best_sellers':
        if (!loading && (!data?.bestSellers || data.bestSellers.length === 0)) return null;
        return (
          <section key="best_sellers" className="container mt-14 sm:mt-20">
            <SectionHeader title={t('store.bestSellers')} to={sp(store.slug, 'shop?sort=best')} />
            <ProductRail items={data?.bestSellers || []} slug={store.slug} onQuickAdd={setQuick} loading={loading && !data} />
          </section>
        );

      case 'offers':
        return <OfferBand key="offers" />;

      case 'on_sale':
        if (!data?.onSale || data.onSale.length === 0) return null;
        return (
          <section key="on_sale" className="container mt-14 sm:mt-20">
            <SectionHeader title={t('store.onSale')} to={sp(store.slug, 'shop?sale=1')} />
            <ProductGrid>
              {data.onSale.slice(0, 8).map((p, i) => (
                <ProductCard key={p.id} product={p} slug={store.slug} onQuickAdd={setQuick} index={i} />
              ))}
            </ProductGrid>
          </section>
        );

      case 'story':
        return <StoreStoryCard key="story" />;

      case 'visit':
        return <VisitCard key="visit" />;

      default:
        return null;
    }
  };

  return (
    <PageTransition>
      {error ? (
        <div className="container mt-12"><ErrorState error={error} onRetry={reload} /></div>
      ) : (
        allSections.map(renderSection)
      )}
      <QuickAddSheet slug={store.slug} product={quick} onClose={() => setQuick(null)} />
    </PageTransition>
  );
}
