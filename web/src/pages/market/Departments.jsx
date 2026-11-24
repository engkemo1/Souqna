import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Flame, LayoutGrid, Store } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useApi } from '../../lib/hooks.js';
import { useDepartments } from '../../lib/departments.js';
import { emojiFor } from '../../lib/deptIcons.js';
import { cx } from '../../components/ui/cx.js';
import SmartImage from '../../components/ui/SmartImage.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import { CategoryImage, deptHref, deptName } from '../../components/market/CategoryCards.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';

/** A round picture for a section: its stored photo → a real product of that section → (last resort) a soft tinted circle with a glyph. */
function Face({ dept, cover, size, className }) {
  const has = dept?.image || dept?.images?.card;
  return (
    <span className={cx('relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#EAF0F8] to-[#FFF3EB]', size, className)}>
      {has ? <CategoryImage dept={dept} sizes="96px" />
        : cover ? <SmartImage media={cover} alt="" sizes="96px" className="absolute inset-0 h-full w-full" />
          : <span className="text-[28px] leading-none" aria-hidden="true">{emojiFor(dept)}</span>}
    </span>
  );
}

/**
 * /categories — pick a main section (round pictures), see its sub-sections as round pictures right under it,
 * then a taste of its products. Opened from the «الأقسام» tab on phones.
 */
export default function Departments() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { tops, childrenOf, bySlug } = useDepartments();
  const [sp, setSp] = useSearchParams();
  const [quick, setQuick] = useState(null);
  const covers = useApi('/departments/covers').data?.covers || {};
  const mains = useMemo(() => tops.filter((d) => d.product_count > 0), [tops]);
  const active = mains.find((d) => d.slug === sp.get('d')) || mains[0];
  useEffect(() => { document.title = ar ? 'الأقسام | تويست' : 'Sections | Twist'; }, [ar]);

  const subs = useMemo(() => {
    if (!active) return [];
    const kids = childrenOf(active.slug).filter((c) => c.product_count > 0);
    const extra = active.slug === 'women' ? bySlug.get('women_lingerie') : null; // lingerie sits two levels down — keep it one tap away
    return extra && extra.product_count > 0 && !kids.some((k) => k.slug === extra.slug) ? [...kids, extra] : kids;
  }, [active, childrenOf, bySlug]);

  const prods = useApi(active ? `/search?${new URLSearchParams({ department: active.slug, sort: 'relevance' })}` : '/search?department=none', { enabled: !!active });
  const items = (prods.data?.items || []).slice(0, 8);
  const name = active ? deptName(active, lang) : '';

  return (
    <div className="min-h-dvh bg-canvas">
      <MarketHeader />
      <main className="container max-w-3xl pb-24 pt-4 sm:pt-8">
        <h1 className="font-display text-[22px] font-black text-[#101d3a] sm:text-3xl">{ar ? 'الأقسام' : 'Sections'}</h1>

        {/* main sections: round pictures, one row */}
        <div className="scroll-x -mx-4 mt-4 gap-3.5 px-4 pb-1" role="tablist" aria-label={ar ? 'الأقسام الرئيسية' : 'Main sections'}>
          {mains.map((d) => {
            const on = d.slug === active?.slug;
            return (
              <button key={d.slug} type="button" role="tab" aria-selected={on} onClick={() => setSp({ d: d.slug }, { replace: true })} className="group flex w-[76px] shrink-0 flex-col items-center gap-1.5">
                <Face dept={d} cover={covers[d.slug]} size="h-[68px] w-[68px]" className={cx('transition', on ? 'ring-[3px] ring-brand ring-offset-2' : 'opacity-90 ring-1 ring-black/5 group-active:scale-95')} />
                <span className={cx('line-clamp-1 text-[13px]', on ? 'font-black text-brand' : 'font-semibold text-[#3b4658]')}>{deptName(d, lang)}</span>
              </button>
            );
          })}
        </div>

        {active && (
          <>
            {/* its sub-sections: round pictures in an even grid */}
            <section className="mt-6 rounded-3xl border border-line bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-black text-[#101d3a]">{ar ? `أقسام ${name}` : `${name} sections`}</h2>
                <Link to={deptHref(active.slug)} className="inline-flex items-center gap-1 text-[13px] font-bold text-brand">{ar ? 'شوف الكل' : 'See all'}<ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" /></Link>
              </div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                <Link to={deptHref(active.slug)} className="flex flex-col items-center gap-1.5 active:scale-95">
                  <span className="grid h-[64px] w-[64px] place-items-center rounded-full bg-brand text-white"><LayoutGrid className="h-6 w-6" aria-hidden="true" /></span>
                  <span className="line-clamp-2 text-center text-[12px] font-bold leading-tight text-brand">{ar ? 'الكل' : 'All'}</span>
                </Link>
                {subs.map((c) => (
                  <Link key={c.slug} to={deptHref(c.slug)} className="flex flex-col items-center gap-1.5 active:scale-95">
                    <Face dept={c} cover={covers[c.slug]} size="h-[64px] w-[64px]" className="ring-1 ring-black/5" />
                    <span className="line-clamp-2 text-center text-[12px] font-semibold leading-tight text-[#3b4658]">{deptName(c, lang)}</span>
                  </Link>
                ))}
              </div>
            </section>

            {/* a taste of the products */}
            <section className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-black text-[#101d3a]">{ar ? `منتجات ${name}` : `${name} products`}</h2>
                <Link to={deptHref(active.slug)} className="inline-flex items-center gap-1 text-[13px] font-bold text-brand">{ar ? 'شوف الكل' : 'See all'}<ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" /></Link>
              </div>
              {prods.loading && !prods.data
                ? <ProductGrid>{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
                : <ProductGrid>{items.map((p, i) => <ProductCard key={`${p.store.slug}-${p.id}`} product={p} slug={p.store.slug} index={i} showStore onQuickAdd={setQuick} />)}</ProductGrid>}
              <Link to={deptHref(active.slug)} className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-btn text-sm font-bold text-on-btn transition active:scale-[.98]">{ar ? `شوف كل منتجات ${name}` : `See all ${name}`}<ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" /></Link>
            </section>
          </>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Link to="/search?sale=1" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#EAF0F8] text-sm font-bold text-brand transition active:scale-[.98]"><Flame className="h-4 w-4" />{ar ? 'عروض بنها' : 'Banha deals'}</Link>
          <Link to="/stores" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#EAF0F8] text-sm font-bold text-brand transition active:scale-[.98]"><Store className="h-4 w-4" />{ar ? 'كل المحلات' : 'All stores'}</Link>
        </div>
      </main>
      <QuickAddSheet slug={quick?.store?.slug} product={quick} marketplace onClose={() => setQuick(null)} />
    </div>
  );
}
