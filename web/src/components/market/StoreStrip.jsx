import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { StoreLogo } from '../store/StoreChrome.jsx';

/** Round store logos in one scrolling row: the quickest way into a shop (like "local brands" strips on big sites). */
export default function StoreStrip({ stores = [] }) {
  const { t, tr } = useI18n();
  if (stores.length < 2) return null;
  return (
    <section className="container mt-8 sm:mt-10" aria-label={t('market.shopStores')}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold sm:text-2xl">{t('market.shopStores')}</h2>
        <Link to="/stores" className="shrink-0 text-sm font-semibold text-brand hover:underline">{t('market.seeAll')}</Link>
      </div>
      <ul className="scroll-x -mx-4 gap-4 px-4 pb-2 sm:gap-6">
        {stores.map((s) => (
          <li key={s.id} className="w-[84px] shrink-0 snap-start sm:w-[104px]">
            <Link to={`/s/${s.slug}`} className="group block text-center">
              <StoreLogo store={s} size={96} className="mx-auto h-[72px] w-[72px] ring-2 ring-line transition group-hover:ring-brand sm:h-[92px] sm:w-[92px]" />
              <span className="mt-2 block truncate text-xs font-semibold sm:text-sm">{tr(s.name)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
