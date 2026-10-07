import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import SmartImage from '../ui/SmartImage.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { Price, ColorDots } from '../ui/Commerce.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useFavorites } from '../../lib/cart.jsx';
import { useToast } from '../ui/Toast.jsx';
import { sp } from '../../lib/store.jsx';
import { cx } from '../ui/cx.js';

export const CARD_SIZES = '(min-width:1280px) 22vw, (min-width:1024px) 28vw, (min-width:640px) 33vw, 50vw';

function ProductCard({ product: p, slug, onQuickAdd, priority, index = 0, showStore }) {
  const { t, tr } = useI18n();
  const favs = useFavorites(slug);
  const toast = useToast();
  const fav = favs.has(p.id);
  const [popKey, setPopKey] = useState(0);
  const href = sp(slug, `p/${p.slug}`);
  const out = p.stock === 'out';

  const toggleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const added = favs.toggle(p.id);
    setPopKey((k) => k + 1);
    toast({ title: added ? t('fav.added') : t('fav.removed'), tone: 'info', icon: Heart, duration: 1800 });
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.5, delay: Math.min(index % 4, 3) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex min-w-0 flex-col"
    >
      <Link to={href} className="relative block overflow-hidden rounded-2xl bg-surface focus-visible:shadow-ring" aria-label={tr(p.name)}>
        <SmartImage
          media={p.image}
          alt={tr(p.name)}
          ratio="4 / 5"
          sizes={CARD_SIZES}
          priority={priority}
          imgClassName="group-hover:scale-[1.035] [@media(hover:none)]:group-hover:scale-100"
          className={cx(out && 'opacity-70')}
        />
        {p.hoverImage && (
          <SmartImage
            media={p.hoverImage}
            alt=""
            ratio="4 / 5"
            sizes={CARD_SIZES}
            className="!absolute inset-0 opacity-0 transition-opacity duration-500 ease-out [@media(hover:hover)]:group-hover:opacity-100"
          />
        )}

        {/* badges */}
        <div className="pointer-events-none absolute start-2.5 top-2.5 flex flex-col items-start gap-1.5 sm:start-3 sm:top-3">
          {p.discount > 0 && <span className="rounded-full bg-sale px-2 py-0.5 text-[11px] font-bold text-white tabular sm:text-xs">-{p.discount}%</span>}
          {p.isNew && !out && <span className="rounded-full bg-neutral-900/85 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur sm:text-xs">{t('product.new')}</span>}
        </div>
        {out && (
          <span className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-white/90 py-2 text-center text-xs font-semibold text-neutral-900 backdrop-blur sm:inset-x-3 sm:bottom-3">{t('product.outOfStock')}</span>
        )}
        {p.stock === 'low' && (
          <span className="absolute bottom-2.5 start-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-amber-800 backdrop-blur sm:bottom-3 sm:start-3 [@media(hover:hover)]:group-hover:opacity-0 transition-opacity">{t('product.lowStock')}</span>
        )}

        {/* desktop quick add */}
        {!out && onQuickAdd && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onQuickAdd(p); }}
            className="absolute inset-x-3 bottom-3 hidden translate-y-2 items-center justify-center gap-2 rounded-xl bg-white/95 py-2.5 text-sm font-semibold text-neutral-900 opacity-0 shadow-soft backdrop-blur transition-all duration-300 ease-out hover:bg-white group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 [@media(hover:hover)]:flex"
          >
            <Plus className="h-4 w-4" />{t('product.addToCart')}
          </button>
        )}
      </Link>

      {/* favourite */}
      <button
        type="button"
        onClick={toggleFav}
        aria-pressed={fav}
        aria-label={fav ? t('product.removeFavorite') : t('product.addFavorite')}
        className="absolute end-1.5 top-1.5 grid h-10 w-10 place-items-center rounded-full transition active:scale-90 sm:end-2 sm:top-2"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/85 text-neutral-900 shadow-sm backdrop-blur transition hover:bg-white">
          <Heart key={popKey} className={cx('h-[17px] w-[17px] transition-colors', fav ? 'fill-sale text-sale' : '', popKey && 'animate-pop')} strokeWidth={2} />
        </span>
      </button>

      <div className="flex flex-1 flex-col pt-3">
        {showStore && p.store && <span className="mb-0.5 truncate text-xs font-medium text-muted">{tr(p.store.name)}</span>}
        <div className="flex items-start justify-between gap-2">
          <Link to={href} className="line-clamp-2 min-h-[2.5em] text-[13.5px] font-medium leading-snug text-fg hover:text-brand sm:text-[15px]">{tr(p.name)}</Link>
          {/* mobile quick add */}
          {!out && onQuickAdd && (
            <button type="button" onClick={() => onQuickAdd(p)} aria-label={t('product.addToCart')}
              className="-me-1.5 -mt-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg transition active:scale-90 [@media(hover:hover)]:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-line-strong"><ShoppingBag className="h-4 w-4" /></span>
            </button>
          )}
        </div>
        <Price value={p.price} compareAt={p.compareAt} size="sm" className="mt-1.5 sm:[&>span:first-child]:text-[15px]" />
        <ColorDots colors={p.colors} className="mt-2" />
      </div>
    </motion.article>
  );
}

export default memo(ProductCard);

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
      <Skeleton className="mt-3 h-3.5 w-4/5" />
      <Skeleton className="mt-2 h-3.5 w-2/5" />
      <div className="mt-3 flex gap-1.5"><Skeleton circle className="h-3.5 w-3.5" /><Skeleton circle className="h-3.5 w-3.5" /><Skeleton circle className="h-3.5 w-3.5" /></div>
    </div>
  );
}

export function ProductGrid({ children, className }) {
  return <div className={cx('grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-10 md:grid-cols-3 xl:grid-cols-4', className)}>{children}</div>;
}
