import { memo, useState } from 'react';
import SaleCountdown from './SaleCountdown.jsx';
import DiscountBadge from '../campaign/DiscountBadge.jsx';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Plus, ArrowLeftRight } from 'lucide-react';
import SmartImage from '../ui/SmartImage.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { Price, ColorDots } from '../ui/Commerce.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useFavorites } from '../../lib/cart.jsx';
import { useCompare } from '../../lib/compare.js';
import { useToast } from '../ui/Toast.jsx';
import { sp } from '../../lib/store.jsx';
import { useDesign, GRID_CLASS, kidTint } from '../../lib/design.js';
import { cx } from '../ui/cx.js';
import { OfferChip } from '../promo/OfferCards.jsx';

// touch phones have no hover: skip the second (hover) image there entirely — half the images, half the decoding
const CAN_HOVER = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover)').matches;

export const CARD_SIZES = '(min-width:1280px) 22vw, (min-width:1024px) 28vw, (min-width:640px) 33vw, 50vw';

function ProductCard({ product: p, slug, onQuickAdd, priority, index = 0, showStore, ratio = '4 / 5.75', comparable = false }) {
  const { t, tr } = useI18n();
  const favs = useFavorites(slug);
  const toast = useToast();
  const cmp = useCompare();
  const inCmp = comparable && cmp.has(p.id);
  const fav = favs.has(p.id);
  const [popKey, setPopKey] = useState(0);
  const [peek, setPeek] = useState(false); // the hover photo is only created once the pointer/finger gets near the card
  const href = sp(p.store?.slug || slug, `p/${p.slug}`);
  const out = p.stock === 'out';
  const { card } = useDesign();
  const bubble = card === 'bubble'; // kids template: pastel card, bubbly corners, a little bounce
  const tint = bubble ? kidTint(index) : null;
  const imgR = card === 'flat' ? 'rounded-none' : card === 'bordered' ? 'rounded-md' : bubble ? 'rounded-[22px]' : 'rounded-2xl';
  const wrap = card === 'soft' ? 'rounded-3xl bg-surface p-2.5' : card === 'bordered' ? 'rounded-lg p-2 ring-1 ring-line'
    : bubble ? 'rounded-[28px] p-2 pb-3 transition duration-300 [@media(hover:hover)]:hover:-translate-y-1.5 [@media(hover:hover)]:hover:shadow-[0_18px_40px_-18px_rgba(31,35,64,0.35)]' : '';
  const tone = { brand: 'bg-primary text-on-primary', sale: 'bg-sale text-on-sale', dark: 'bg-neutral-900 text-white', gold: 'bg-amber-400 text-neutral-900', green: 'bg-emerald-600 text-white' }[p.badge?.tone] || 'bg-primary text-on-primary';

  const toggleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const added = favs.toggle(p.id);
    setPopKey((k) => k + 1);
    toast({ title: added ? t('fav.added') : t('fav.removed'), tone: 'info', icon: Heart, duration: 1800 });
  };

  const toggleCompare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = cmp.toggle(p.id);
    if (r === 'full') toast({ title: t('compare.full'), tone: 'info', icon: ArrowLeftRight, duration: 2200 });
  };

  return (
    <article
      onPointerEnter={CAN_HOVER ? () => setPeek(true) : undefined}
      className={cx('group relative flex min-w-0 flex-col', wrap)}
      style={tint ? { background: tint.bg, '--c-text': '31 35 64', '--c-muted': '84 89 112', '--c-sale': '185 28 28', '--c-on-sale': '255 255 255' } : undefined}
    >
      <Link to={href} className={cx('relative block overflow-hidden focus-visible:shadow-ring', bubble ? 'bg-white/70' : 'bg-surface', imgR)} aria-label={tr(p.name)}>
        <SmartImage
          media={p.image}
          alt={tr(p.name)}
          ratio={ratio}
          sizes={CARD_SIZES}
          priority={priority}
          imgClassName="group-hover:scale-[1.02] [@media(hover:none)]:group-hover:scale-100"
          className={cx(out && 'opacity-70')}
        />
        {p.hoverImage && CAN_HOVER && peek && (
          <SmartImage
            media={p.hoverImage}
            alt=""
            ratio={ratio}
            sizes={CARD_SIZES}
            className="!absolute inset-0 opacity-0 transition-opacity duration-700 ease-in-out [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:group-active:opacity-100"
          />
        )}

        {/* badges */}
        <div className="pointer-events-none absolute start-2.5 top-2.5 flex flex-col items-start gap-1.5 sm:start-3 sm:top-3">
          {/* One or two badges at most, by priority — a stack of three reads as noise. */}
          {[
            p.badge && <span key="b" className={cx('rounded-full px-2 py-0.5 text-xs font-bold', tone)}>{p.badge.text}</span>,
            p.discount > 0 && <DiscountBadge key="d" pct={p.discount} campaign={p.campaign} />,
            p.offer && !out && <OfferChip key="o" offer={p.offer} className="max-w-[9.5rem]" />,
            p.isNew && !out && <span key="n" className="rounded-full bg-neutral-900/85 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur sm:text-xs">{t('product.new')}</span>,
          ].filter(Boolean).slice(0, 2)}
        </div>
        {out && (
          <span className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-white/90 py-2 text-center text-xs font-semibold text-neutral-900 backdrop-blur sm:inset-x-3 sm:bottom-3">{t('product.outOfStock')}</span>
        )}
        {p.stock === 'low' && (
          <span className="absolute bottom-2.5 start-2.5 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-amber-800 backdrop-blur sm:bottom-3 sm:start-3 [@media(hover:hover)]:group-hover:opacity-0 transition-opacity">{t('product.lowStock')}</span>
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

      {/* compare (search results only) */}
      {comparable && (
        <button
          type="button"
          onClick={toggleCompare}
          aria-pressed={inCmp}
          aria-label={inCmp ? t('compare.remove') : t('compare.add')}
          className="absolute end-1.5 top-12 grid h-10 w-10 place-items-center rounded-full transition active:scale-90 sm:end-2 sm:top-[3.25rem]"
        >
          <span className={cx('grid h-8 w-8 place-items-center rounded-full shadow-sm backdrop-blur transition', inCmp ? 'bg-neutral-900 text-white' : 'bg-white/85 text-neutral-900 hover:bg-white')}>
            <ArrowLeftRight className="h-[16px] w-[16px]" strokeWidth={2} />
          </span>
        </button>
      )}

      <div className={cx('flex flex-1 flex-col pt-3', bubble && 'px-1.5')}>
        {showStore && p.store && <span className="mb-0.5 truncate text-[13px] font-medium text-fg/70">{tr(p.store.name)}</span>}
        <div className="flex items-start justify-between gap-2">
          <Link to={href} className="line-clamp-2 min-h-[2.5em] text-[13.5px] font-medium leading-snug text-fg hover:text-brand sm:text-base">{tr(p.name)}</Link>
          {/* mobile quick add */}
          {!out && onQuickAdd && (
            <button type="button" onClick={() => onQuickAdd(p)} aria-label={t('product.addToCart')}
              className="-me-1.5 -mt-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg transition active:scale-90 [@media(hover:hover)]:hidden">
              {bubble
                ? <span className="kid-wiggle grid h-9 w-9 place-items-center rounded-full text-white shadow-sm" style={{ background: tint.ink }}><ShoppingBag className="h-4 w-4" /></span>
                : <span className="grid h-8 w-8 place-items-center rounded-full border border-line-strong"><ShoppingBag className="h-4 w-4" /></span>}
            </button>
          )}
        </div>
        <Price value={p.price} compareAt={p.compareAt} size="sm" className={cx('mt-1.5 sm:[&>span:first-child]:text-base', bubble && '[&>span:first-child]:font-extrabold')} />
        <SaleCountdown ms={p.saleEndsAt} campaign={p.campaign} variant="chip" className="mt-1.5" />
        <ColorDots colors={p.colors} className="mt-2" />
      </div>
    </article>
  );
}

export default memo(ProductCard);

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="aspect-[4/5.75] w-full rounded-2xl" />
      <Skeleton className="mt-3 h-3.5 w-4/5" />
      <Skeleton className="mt-2 h-3.5 w-2/5" />
      <div className="mt-3 flex gap-1.5"><Skeleton circle className="h-3.5 w-3.5" /><Skeleton circle className="h-3.5 w-3.5" /><Skeleton circle className="h-3.5 w-3.5" /></div>
    </div>
  );
}

export function ProductGrid({ children, className, density }) {
  const { grid } = useDesign();
  return <div className={cx('grid', GRID_CLASS[density] || GRID_CLASS[grid] || GRID_CLASS.cozy, className)}>{children}</div>;
}
