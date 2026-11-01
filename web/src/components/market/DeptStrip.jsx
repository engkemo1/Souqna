import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';
import { MainCard } from './CategoryCards.jsx';

/**
 * Homepage category discovery. The main sections come straight from the department tree (admin → الأقسام); sections with nothing
 * in them are already filtered out by the API. Mobile: swipeable row of large cards. Desktop: an editorial grid whose first card is featured.
 */
export default function DeptStrip() {
  const { t, lang } = useI18n();
  const { tops } = useDepartments();
  if (!tops.length) return null;
  return (
    <section aria-label={t('market.shopByDept')} className="container mt-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-black text-fg sm:text-3xl">{t('market.shopByDept')}</h2>
        <Link to="/search" className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-4 py-2 text-xs font-bold transition hover:border-fg/30 sm:text-sm">
          <span>{t('market.seeAll')}</span><ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:hidden">
        {tops.map((d, i) => <div key={d.slug} className="w-[64vw] max-w-[260px] shrink-0 snap-start"><MainCard dept={d} priority={i < 2} /></div>)}
      </div>
      <div className="hidden gap-4 sm:grid sm:grid-cols-3 lg:grid-cols-4" lang={lang}>
        {tops.map((d, i) => <MainCard key={d.slug} dept={d} feature={i === 0 && tops.length >= 5} priority={i < 4} />)}
      </div>
    </section>
  );
}
