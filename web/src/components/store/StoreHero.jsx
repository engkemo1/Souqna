import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, Navigation, ArrowLeft, ArrowRight } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { StoreLogo } from './StoreChrome.jsx';
import { mapsLinks, openNow } from './VisitCard.jsx';

const ease = [0.22, 1, 0.36, 1];

/** Full-bleed cover with the store's identity on top — used when the store has no banners. */
export default function StoreHero() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const open = openNow(store.hours);
  const maps = mapsLinks(store, tr(store.address));
  const Arrow = ar ? ArrowLeft : ArrowRight;

  return (
    <section className="relative isolate overflow-hidden bg-[#0B0B0C] text-white">
      {store.cover && (
        <motion.div className="absolute inset-0 -z-10" initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 6, ease: 'easeOut' }}>
          <SmartImage media={store.cover} priority sizes="100vw" className="h-full w-full" imgClassName="h-full w-full object-cover" />
        </motion.div>
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/55 to-black/10" />
      <div className="absolute inset-0 -z-10 from-black/80 via-black/35 to-transparent ltr:bg-gradient-to-r rtl:bg-gradient-to-l" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0)_0%,rgba(0,0,0,.45)_80%)]" />
      {/* hairline frame in the store's accent colour */}
      <div className="pointer-events-none absolute inset-3 rounded-[28px] border border-accent/45 sm:inset-5" />

      <div className="container flex min-h-[520px] flex-col justify-end pb-10 pt-24 sm:min-h-[600px] sm:pb-16">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease }} className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="rounded-full p-[3px] ring-2 ring-accent/80"><StoreLogo store={store} size={64} className="h-16 w-16" /></span>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {store.rating ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{store.rating}<span className="opacity-60">({store.ratingCount})</span>
                </span>
              ) : null}
              {open !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                  <span className={`relative flex h-2 w-2`}>
                    {open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${open ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  </span>
                  {open ? (ar ? 'مفتوح دلوقتي' : 'Open now') : (ar ? 'مقفول دلوقتي' : 'Closed now')}
                </span>
              )}
            </div>
          </div>
          <h1 className="mt-5 font-display text-[44px] font-medium leading-[1.1] tracking-tight !text-white drop-shadow-[0_4px_24px_rgba(0,0,0,.5)] sm:text-[72px]">{tr(store.name)}</h1>
          {tr(store.tagline) && <p className="mt-3 max-w-xl text-lg text-white/80 sm:text-xl">{tr(store.tagline)}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={sp(store.slug, 'shop')} className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-semibold text-black transition hover:bg-white/90">
              {ar ? 'تسوّق الكولكشن' : 'Shop the collection'}<Arrow className="h-4 w-4 transition group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" />
            </Link>
            {tr(store.address) && (
              <a href={maps.open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3.5 text-[15px] font-semibold backdrop-blur transition hover:bg-white/20">
                <Navigation className="h-4 w-4" />{ar ? 'افتح اللوكيشن' : 'Open location'}
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Store identity strip shown under the banner slider, so the logo and name stay visible in slider mode. */
export function StoreIdentityBar() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const open = openNow(store.hours);
  const maps = mapsLinks(store, tr(store.address));
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease }}
      className="border-b border-line bg-surface">
      <div className="container flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="shrink-0 rounded-full p-[3px] ring-2 ring-accent/70"><StoreLogo store={store} size={56} className="h-14 w-14" /></span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-medium tracking-tight sm:text-3xl">{tr(store.name)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              {tr(store.tagline) && <span className="truncate">{tr(store.tagline)}</span>}
              {store.rating ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{store.rating} ({store.ratingCount})</span> : null}
              {open !== null && (
                <span className={`inline-flex items-center gap-1.5 font-semibold ${open ? 'text-emerald-700' : 'text-red-600'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-red-500'}`} />{open ? (ar ? 'مفتوح دلوقتي' : 'Open now') : (ar ? 'مقفول دلوقتي' : 'Closed now')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={sp(store.slug, 'shop')} className="inline-flex items-center gap-2 rounded-full bg-btn px-5 py-2.5 text-[14px] font-semibold text-on-btn">
            {ar ? 'تسوّق الكولكشن' : 'Shop the collection'}<Arrow className="h-4 w-4" />
          </Link>
          {tr(store.address) && (
            <a href={maps.open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold ring-1 ring-line hover:bg-fg/[0.04]">
              <Navigation className="h-4 w-4" />{ar ? 'اللوكيشن' : 'Location'}
            </a>
          )}
        </div>
      </div>
    </motion.section>
  );
}
