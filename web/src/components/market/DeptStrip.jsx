import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';
import { CategoryImage, MainCard, deptHref, deptName } from './CategoryCards.jsx';

/**
 * Homepage category discovery. The main sections come straight from the department tree (admin → الأقسام); sections with nothing
 * in them are already filtered out by the API. Mobile: swipeable row of large cards. Desktop: an editorial grid whose first card is featured.
 */
export default function DeptStrip() {
  const { t, lang } = useI18n();
  const { tops } = useDepartments();
  if (!tops.length) return null;

  // Keep the editorial layout meaningful when the API order changes: the
  // section with the most products gets the large card, while perfumes stay
  // inside the compact category grid instead of falling below it.
  const featured = tops.reduce((best, item) => (!best || (item.product_count || 0) > (best.product_count || 0) ? item : best), null);
  const remaining = tops.filter((item) => item.slug !== featured?.slug);
  const perfumeIndex = remaining.findIndex((item) => {
    const value = `${item.slug || ''} ${item.name?.ar || ''} ${item.name?.en || ''}`.toLowerCase();
    return /perfume|fragrance|عطر/.test(value);
  });
  if (perfumeIndex > -1 && perfumeIndex !== 2) {
    const [perfumes] = remaining.splice(perfumeIndex, 1);
    remaining.splice(Math.min(2, remaining.length), 0, perfumes);
  }

  return (
    <section aria-label={t('market.shopByDept')} className="container mt-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-black text-fg sm:text-3xl">{t('market.shopByDept')}</h2>
        <Link to="/search" className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-4 py-2 text-xs font-bold transition hover:border-fg/30 sm:text-sm">
          <span>{t('market.seeAll')}</span><ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 no-scrollbar sm:hidden" lang={lang}>
        {[featured, ...remaining].filter(Boolean).map((d, i) => {
          const isFeatured = d.slug === featured?.slug;
          return (
            <motion.div key={d.slug} initial={{ opacity: 0, scale: .9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: i * .055, duration: .35, ease: 'easeOut' }} className="shrink-0 snap-start text-center">
              <Link to={deptHref(d.slug)} aria-label={deptName(d, lang)} className="group block focus-visible:outline-none">
                <span className={`mx-auto block overflow-hidden rounded-full bg-[#EAF0F8] ring-2 ring-white shadow-[0_10px_24px_-12px_rgba(3,36,77,.7)] transition duration-300 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-brand group-hover:-translate-y-1 group-hover:shadow-[0_16px_28px_-12px_rgba(3,36,77,.6)] ${isFeatured ? 'h-[104px] w-[104px] ring-brand/70' : 'h-[82px] w-[82px]'}`}>
                  <CategoryImage dept={d} priority={i < 2} sizes={isFeatured ? '104px' : '82px'} className="transition duration-700 group-hover:scale-110" />
                </span>
                <span className={`mt-2 block max-w-[104px] truncate font-bold text-[#03244D] ${isFeatured ? 'text-[13px]' : 'text-[12px]'}`}>{deptName(d, lang)}</span>
                {d.product_count > 0 && <span className="mt-0.5 block text-[10px] text-muted">{lang === 'ar' ? `${new Intl.NumberFormat('ar-EG').format(d.product_count)} منتج` : `${d.product_count} items`}</span>}
              </Link>
            </motion.div>
          );
        })}
      </div>
      <div className="hidden gap-4 sm:grid sm:grid-cols-3 lg:grid-cols-4" lang={lang}>
        {featured && <MainCard key={featured.slug} dept={featured} feature={tops.length >= 5} priority />}
        {remaining.map((d, i) => <MainCard key={d.slug} dept={d} priority={i < 3} />)}
      </div>
    </section>
  );
}
