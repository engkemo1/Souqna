import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Navigation } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { StoreLogo } from './StoreChrome.jsx';
import { mapsLinks } from './VisitCard.jsx';

/** هيرو مقسوم: نص على جنب وصورة الغلاف على الجنب التاني (بوتيك / رجالي). */
export function HeroSplit({ banners = [] }) {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const image = store.cover || banners[0]?.image || null;
  const maps = mapsLinks(store, tr(store.address));
  return (
    <section className="bg-secondary text-on-secondary">
      <div className="container grid items-center gap-6 py-8 sm:py-12 md:grid-cols-2 md:gap-12">
        <div className="order-2 md:order-1">
          <span className="inline-block rounded-full p-[3px] ring-2 ring-accent/70"><StoreLogo store={store} size={56} className="h-14 w-14" /></span>
          <h1 className="mt-4 font-display text-[34px] font-bold leading-tight !text-on-secondary sm:text-5xl">{tr(store.name)}</h1>
          {tr(store.tagline) && <p className="mt-3 max-w-md text-base opacity-80 sm:text-lg">{tr(store.tagline)}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={sp(store.slug, 'shop')} className="group inline-flex items-center gap-2 rounded-full bg-btn px-6 py-3 text-[15px] font-semibold text-white">
              {ar ? 'تسوّق الكولكشن' : 'Shop the collection'}<Arrow className="h-4 w-4" />
            </Link>
            {tr(store.address) && (
              <a href={maps.open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold ring-1 ring-current/30">
                <Navigation className="h-4 w-4" />{ar ? 'اللوكيشن' : 'Location'}
              </a>
            )}
          </div>
        </div>
        <div className="order-1 md:order-2">
          {image ? <SmartImage media={image} priority ratio="4 / 5" sizes="(min-width:768px) 50vw, 100vw" className="rounded-3xl" /> : <div className="aspect-[4/5] rounded-3xl bg-primary/10" />}
        </div>
      </div>
    </section>
  );
}

/** هيرو مضغوط: شريط هوية بلون المحل (للمحلات اللي عايزة المنتجات تظهر أسرع). */
export function HeroCompact() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const ar = lang === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return (
    <section className="bg-primary text-on-primary">
      <div className="container flex flex-wrap items-center justify-between gap-4 py-5 sm:py-6">
        <div className="flex min-w-0 items-center gap-3">
          <StoreLogo store={store} size={48} className="h-12 w-12" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold !text-on-primary sm:text-2xl">{tr(store.name)}</h1>
            {tr(store.tagline) && <p className="truncate text-[13px] opacity-80">{tr(store.tagline)}</p>}
          </div>
        </div>
        <Link to={sp(store.slug, 'shop')} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-on-primary px-5 py-2.5 text-[14px] font-semibold text-primary">
          {ar ? 'تسوّق الكولكشن' : 'Shop now'}<Arrow className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
