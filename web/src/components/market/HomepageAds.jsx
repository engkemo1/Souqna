import { Link } from 'react-router-dom';
import { ArrowUpRight, Megaphone } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';

export default function HomepageAds() {
  const { data } = useApi('/homepage-ads');
  const { t, lang } = useI18n();
  const items = data?.items || [];
  if (!items.length) return null;
  return (
    <section className="container mt-6 sm:mt-8" aria-labelledby="homepage-ads-title">
      <div className="mb-5 flex items-end justify-between gap-3 sm:mb-6">
        <div>
          <p className="eyebrow mb-1.5 inline-flex items-center gap-1.5"><Megaphone className="h-3.5 w-3.5" />{t('market.adsEyebrow')}</p>
          <h2 id="homepage-ads-title" className="font-display text-display-sm font-bold">{t('market.adsTitle')}</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {items.map((ad) => {
          const title = ad.title?.[lang] || ad.title?.ar || '';
          const subtitle = ad.subtitle?.[lang] || ad.subtitle?.ar || '';
          const cta = ad.cta?.[lang] || ad.cta?.ar || t('market.adsCta');
          return (
            <Link key={ad.id} to={ad.link} className="group relative isolate flex min-h-64 overflow-hidden rounded-3xl bg-fg text-canvas shadow-sm sm:min-h-72 lg:min-h-80">
              <img src={ad.image} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-black/5" />
              <div className="mt-auto w-full p-5 sm:p-6 lg:p-7">
                <p className="max-w-2xl font-display text-2xl font-extrabold leading-tight sm:text-3xl">{title}</p>
                {subtitle && <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">{subtitle}</p>}
                <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-neutral-950 transition group-hover:bg-brand group-hover:text-white">
                  {cta}<ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
