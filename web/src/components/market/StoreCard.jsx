import { useDepartments } from '../../lib/departments.js';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, MapPin, ArrowUpRight, BadgeCheck } from 'lucide-react';
import SmartImage from '../ui/SmartImage.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { StoreLogo } from '../store/StoreChrome.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

// A store with no cover yet gets a calm coloured tile with its name, picked from its slug so it always looks the same.
const FALLBACKS = ['linear-gradient(135deg,#0F3D5E,#2F6E94)', 'linear-gradient(135deg,#5B2A5F,#9C5BA0)', 'linear-gradient(135deg,#7A2E2E,#C26A5A)', 'linear-gradient(135deg,#1F5C4A,#4E9A80)', 'linear-gradient(135deg,#4A3A8C,#7C6BD0)', 'linear-gradient(135deg,#8A4B12,#D08A3C)'];
const hashOf = (v) => { let h = 0; for (const ch of String(v)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % FALLBACKS.length; };

export default function StoreCard({ store: s, index = 0, large }) {
  const { t, tr, lang } = useI18n();
  const { label: deptLabel } = useDepartments({ all: true }); // last level only ("فساتين سواريه"), not the whole path
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
          {s.cover ? (
            <SmartImage media={s.cover} ratio={large ? '16 / 10' : '16 / 9'} sizes={large ? '(min-width:1024px) 48vw, 100vw' : '(min-width:1024px) 32vw, (min-width:640px) 48vw, 100vw'}
              imgClassName="duration-[1.1s] group-hover:scale-[1.04] [@media(hover:none)]:group-hover:scale-100" />
          ) : (
            // no cover uploaded: a clean brand-coloured cover with the store's logo instead of a broken-image box
            <div className="relative grid w-full place-items-center overflow-hidden px-6 text-center" style={{ aspectRatio: large ? '16 / 10' : '16 / 9', background: brand ? `linear-gradient(135deg, rgb(${brand}) 0%, rgb(${brand} / .62) 100%)` : FALLBACKS[hashOf(s.slug || s.id)] }}>
              <div aria-hidden="true" className="absolute -end-10 -top-10 h-44 w-44 rounded-full bg-white/10" /><div aria-hidden="true" className="absolute -bottom-12 -start-8 h-40 w-40 rounded-full bg-black/10" />
              <div className="relative flex flex-col items-center gap-2.5">
                {s.logo && <StoreLogo store={s} size={64} className="h-16 w-16 shadow-soft ring-4 ring-white/25" />}
                <span className="line-clamp-2 font-display text-2xl font-black leading-tight text-white drop-shadow-sm">{tr(s.name)}</span>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
          <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
            {s.featured && <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-neutral-900 shadow-sm backdrop-blur"><BadgeCheck className="h-3.5 w-3.5 text-[#F8620A]" />{t('market.featured')}</span>}
            {s.offerBadge && <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white shadow-sm" style={{ backgroundColor: brand ? `rgb(${brand})` : '#B4532A' }}>{tr(s.offerBadge)}</span>}
          </div>
          <span className="absolute bottom-3 end-3 hidden translate-y-2 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 opacity-0 shadow-soft transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:hover)]:inline-flex">
            {t('market.visitStore')}<ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
          </span>
        </div>
        <div className="flex items-start gap-3.5 px-3 pb-3 pt-4">
          <StoreLogo store={s} size={48} className="relative z-10 -mt-10 h-14 w-14 shadow-soft ring-4 ring-elevated" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className={cx('truncate font-display font-bold', large ? 'text-xl sm:text-2xl' : 'text-lg')}>{tr(s.name)}</h3>
              {s.ratingCount > 0 && <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{s.rating}<span className="font-normal text-muted">({s.ratingCount})</span></span>}
            </div>
            <p className="mt-1 line-clamp-1 hidden text-sm text-muted sm:block">{tr(s.tagline)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 sm:mt-3 gap-y-1 text-[13px] text-muted">
              {(() => {
                const d = s.departments?.length ? s.departments : [s.category];
                const shown = d.length > 3 ? d.slice(0, 2) : d;
                return (<>
                  {shown.map((c) => <span key={c} className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 font-medium text-fg">{deptLabel(c)}</span>)}
                  {d.length > 3 && <span className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 font-medium text-fg">+{d.length - 2}</span>}
                </>);
              })()}
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
      <Skeleton className={cx('w-full rounded-[20px]', large ? 'aspect-[16/10]' : 'aspect-[16/9]')} />
      <div className="flex gap-3.5 px-3 pb-3 pt-4">
        <Skeleton circle className="-mt-10 h-14 w-14 ring-4 ring-elevated" />
        <div className="flex-1 space-y-2.5"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3.5 w-1/3" /></div>
      </div>
    </div>
  );
}
