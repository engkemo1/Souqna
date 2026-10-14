import { Link } from 'react-router-dom';
import { ArrowRight, Store } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { StoreLogo } from '../store/StoreChrome.jsx';

/** Round store brand cards: inspired by Amazon's "New Local Brands" strip */
export default function StoreStrip({ stores = [] }) {
  const { t, tr, lang } = useI18n();
  if (stores.length < 2) return null;

  return (
    <section className="container mt-10 sm:mt-14" aria-label={t('market.shopStores')}>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-black text-gray-900 sm:text-3xl">
              {t('market.shopStores')}
            </h2>
            <span className="hidden items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 sm:inline-flex">
              <Store className="h-3.5 w-3.5" />
              {lang === 'ar' ? 'محلات بنها' : 'Local Shops'}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-gray-500 sm:text-sm">
            {lang === 'ar'
              ? 'تسوق مباشرة من أشهر المحلات والبراندات المحلية في مكان واحد'
              : 'Shop directly from top local stores and boutiques in one place'}
          </p>
        </div>
        <Link
          to="/stores"
          className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:border-brand hover:text-brand sm:text-sm shadow-2xs"
        >
          <span>{t('market.seeAll')}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </Link>
      </div>

      <ul className="scroll-x -mx-4 gap-4 px-4 pb-3 pt-1 sm:gap-6">
        {stores.map((s) => (
          <li key={s.id} className="w-[92px] shrink-0 snap-start sm:w-[110px]">
            <Link to={`/s/${s.slug}`} className="group block text-center">
              <div className="relative mx-auto flex h-[82px] w-[82px] items-center justify-center rounded-full bg-gradient-to-b from-stone-50 to-stone-100/60 p-1.5 shadow-[0_4px_14px_rgba(20,33,61,0.06)] ring-1 ring-black/5 transition-all duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[0_12px_24px_rgba(20,33,61,0.12)] group-hover:ring-brand/40 sm:h-[98px] sm:w-[98px]">
                <StoreLogo
                  store={s}
                  size={90}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <span className="mt-2.5 block truncate text-xs font-black text-[#14213D] transition-colors group-hover:text-brand sm:text-[13px]">
                {tr(s.name)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
