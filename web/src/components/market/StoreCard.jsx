import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, MapPin, ArrowUpRight, BadgeCheck } from 'lucide-react';
import SmartImage from '../ui/SmartImage.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { StoreLogo } from '../store/StoreChrome.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

export default function StoreCard({ store: s, index = 0, large }) {
  const { t, tr, lang } = useI18n();
  const brand = s.theme?.cssVars?.['--c-primary'];
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, delay: (index % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      <Link to={`/s/${s.slug}`} className="block rounded-3xl bg-elevated p-2 ring-1 ring-line transition duration-300 ease-out hover:-translate-y-1 hover:shadow-lift hover:ring-line-strong focus-visible:shadow-ring active:scale-[.99] [@media(hover:none)]:hover:translate-y-0">
        <div className="relative overflow-hidden rounded-[20px]">
          <SmartImage media={s.cover} ratio={large ? '16 / 10' : '16 / 11'} sizes={large ? '(min-width:1024px) 48vw, 100vw' : '(min-width:1024px) 32vw, (min-width:640px) 48vw, 100vw'}
            imgClassName="duration-[1.1s] group-hover:scale-[1.04] [@media(hover:none)]:group-hover:scale-100" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
          <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
            {s.featured && <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-neutral-900 shadow-sm backdrop-blur"><BadgeCheck className="h-3.5 w-3.5 text-[#17483B]" />{t('market.featured')}</span>}
            {s.offerBadge && <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white shadow-sm" style={{ backgroundColor: brand ? `rgb(${brand})` : '#B4532A' }}>{tr(s.offerBadge)}</span>}
          </div>
          <span className="absolute bottom-3 end-3 hidden translate-y-2 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 opacity-0 shadow-soft transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:hover)]:inline-flex">
            {t('market.visitStore')}<ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
          </span>
        </div>
        <div className="flex items-start gap-3.5 px-3 pb-3 pt-4">
          <StoreLogo store={s} size={48} className="-mt-10 h-14 w-14 shadow-soft ring-4 ring-elevated" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className={cx('truncate font-display font-semibold', large ? 'text-xl sm:text-2xl' : 'text-lg')}>{tr(s.name)}</h3>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{s.rating}<span className="font-normal text-muted">({s.ratingCount})</span></span>
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-muted">{tr(s.tagline)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <span className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 font-medium text-fg">{t(`cat.${s.category}`)}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.city === 'Banha' && lang === 'ar' ? 'بنها' : s.city}</span>
              {s.productCount != null && <span>{t('market.products', { n: s.productCount })}</span>}
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

export function StoreCardSkeleton({ large }) {
  return (
    <div className="rounded-3xl bg-elevated p-2 ring-1 ring-line" aria-hidden="true">
      <Skeleton className={cx('w-full rounded-[20px]', large ? 'aspect-[16/10]' : 'aspect-[16/11]')} />
      <div className="flex gap-3.5 px-3 pb-3 pt-4">
        <Skeleton circle className="-mt-10 h-14 w-14 ring-4 ring-elevated" />
        <div className="flex-1 space-y-2.5"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3.5 w-1/3" /></div>
      </div>
    </div>
  );
}
