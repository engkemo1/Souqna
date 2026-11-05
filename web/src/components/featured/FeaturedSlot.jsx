import { memo, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';
import SmartImage from '../ui/SmartImage.jsx';

const isMobile = () => { try { return window.matchMedia('(max-width: 767px)').matches; } catch { return false; } };
const send = (id, kind, placement) => {
  try { fetch(`/api/featured/${id}/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placement }), keepalive: true }).catch(() => {}); } catch { /* tracking must never break the page */ }
};
const pick = (o, lang) => (o && (o[lang] || o.ar || o.en)) || '';
const LABEL = { ar: 'مُميّز', en: 'Featured' };

/** Counts one impression per campaign per mount, once at least half of the card is on screen. */
function useImpression(id, placement, off) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current || off) return undefined;
    if (typeof IntersectionObserver === 'undefined') { done.current = true; send(id, 'impression', placement); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !done.current) { done.current = true; send(id, 'impression', placement); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [id, placement, off]);
  return ref;
}

function MediaInner({ item, ratio, priority, sizes, device }) {
  const { image } = item;
  const mobile = image.mobile || image.desktop;
  const media = image.offer || null;
  if (media) return <SmartImage media={media} alt="" ratio={ratio} priority={priority} sizes={sizes} className="absolute inset-0 h-full w-full" />;
  if (!image.desktop && !image.mobile) return null;
  if (device) return <img src={device === 'mobile' ? (image.mobile || image.desktop) : (image.desktop || image.mobile)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />; // admin preview forces one image
  return (
    <picture>
      {image.mobile && image.desktop && <source media="(max-width: 767px)" srcSet={mobile} />}
      <img src={image.desktop || mobile} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
    </picture>
  );
}

const ALIGN = { start: 'items-start text-start', center: 'items-center text-center', end: 'items-end text-end' };
function Media(props) {
  const f = props.item.fit || { zoom: 100, x: 50, y: 50 };
  const moved = f.zoom !== 100 || f.x !== 50 || f.y !== 50;
  return (
    <div className="absolute inset-0 -z-20 overflow-hidden" style={moved ? { transform: `scale(${f.zoom / 100})`, transformOrigin: `${f.x}% ${f.y}%` } : undefined}>
      <MediaInner {...props} />
    </div>
  );
}
export const NARROW = { start: 'me-auto', center: 'mx-auto', end: 'ms-auto' };
const FG_SIDE = { start: 'start-0', center: 'start-1/2 -translate-x-1/2 rtl:translate-x-1/2', end: 'end-0' };
const CTA = {
  solid: 'bg-white text-neutral-950 hover:bg-brand hover:text-white',
  outline: 'border border-current bg-transparent hover:bg-white/15',
  light: 'bg-white/20 backdrop-blur hover:bg-white/30',
};


export const FeaturedCard = memo(function FeaturedCard({ item, variant, priority, lang, onClick, preview = false, device }) {
  const ref = useImpression(item.id, item.placement, preview);
  const title = pick(item.title, lang);
  const subtitle = pick(item.subtitle, lang);
  const badge = pick(item.badge, lang);
  const cta = pick(item.cta, lang);
  const storeName = item.store ? pick(item.store.name, lang) : '';
  const hasMedia = !!(item.image.offer || item.image.desktop || item.image.mobile || item.fg);
  const fg = item.color || '#ffffff';
  const style = { background: item.bg || undefined, color: hasMedia || item.bg ? fg : undefined };
  const Wrap = item.external ? 'a' : Link;
  const wrapProps = item.external ? { href: item.href, target: '_blank', rel: 'noopener noreferrer sponsored' } : { to: item.href };
  const lay = item.layout || { width: 'wide', height: 'm' };
  const heights = { s: 'min-h-36 sm:min-h-44', l: 'min-h-72 sm:min-h-[26rem]' };
  const baseH = { hero: 'min-h-56 sm:min-h-72 lg:min-h-80', grid: 'min-h-48 sm:min-h-56', slot: 'min-h-32', strip: 'min-h-44' }[variant] || 'min-h-48';
  const radius = lay.width === 'full' && variant !== 'slot' && variant !== 'strip' ? 'rounded-none' : variant === 'slot' || variant === 'strip' ? 'rounded-2xl' : 'rounded-3xl';
  const sizeCls = cx(heights[lay.height] || baseH, radius, variant === 'strip' && 'w-72 shrink-0 snap-start sm:w-80');
  return (
    <Wrap ref={ref} {...wrapProps} onClick={(e) => { if (preview) e.preventDefault(); else onClick?.(item); }} aria-label={title}
      className={cx('group relative isolate flex overflow-hidden text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', !hasMedia && !item.bg && 'bg-fg', sizeCls)} style={style}>
      <Media item={item} device={device} priority={priority} sizes={variant === 'hero' ? '100vw' : '(min-width:1024px) 33vw, 80vw'} />
      {item.fg && <img src={item.fg.src} alt="" loading="lazy" decoding="async" className={cx('pointer-events-none absolute bottom-0 z-[1] max-h-[92%] object-contain', FG_SIDE[item.fg.pos] || FG_SIDE.end)} style={{ width: `${item.fg.size}%` }} />}
      {hasMedia && item.overlay > 0 && <div className="absolute inset-0 -z-10" style={{ background: `linear-gradient(to top, rgba(0,0,0,${item.overlay / 100}) 0%, rgba(0,0,0,${(item.overlay / 100) * 0.3}) 60%, rgba(0,0,0,${(item.overlay / 100) * 0.07}) 100%)` }} />}
      <span className="absolute start-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">{LABEL[lang] || LABEL.ar}</span>
        {badge && <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white">{badge}</span>}
      </span>
      <div className={cx('relative z-10 mt-auto flex w-full flex-col p-4 pt-12 sm:p-5', ALIGN[item.align] || ALIGN.start)}>
        {item.store && (
          <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold opacity-90">
            {item.store.logo
              ? <SmartImage media={item.store.logo} alt="" ratio="1 / 1" className="h-6 w-6 rounded-full" sizes="24px" />
              : <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: item.store.logoColor }}>{item.store.logoInitials}</span>}
            <span className="truncate">{storeName}</span>
          </p>
        )}
        <p className={cx('font-display font-extrabold leading-tight', variant === 'hero' ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl')}>{title}</p>
        {subtitle && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed opacity-90">{subtitle}</p>}
        {cta && (
          <span className={cx('mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition', CTA[item.ctaStyle] || CTA.solid)}>
            {cta}<ArrowUpRight className="h-4 w-4 rtl:-scale-x-100" />
          </span>
        )}
      </div>
    </Wrap>
  );
});

function Ticker({ items, lang, onClick }) {
  return (
    <div className="border-y border-line bg-elevated" role="region" aria-label={LABEL[lang]}>
      <ul className="container flex gap-6 overflow-x-auto py-2 text-sm [scrollbar-width:none]">
        {items.map((item) => <TickerItem key={item.id} item={item} lang={lang} onClick={onClick} />)}
      </ul>
    </div>
  );
}
function TickerItem({ item, lang, onClick }) {
  const ref = useImpression(item.id, item.placement);
  const Wrap = item.external ? 'a' : Link;
  const props = item.external ? { href: item.href, target: '_blank', rel: 'noopener noreferrer sponsored' } : { to: item.href };
  const sub = pick(item.subtitle, lang);
  return (
    <li ref={ref} className="shrink-0">
      <Wrap {...props} onClick={() => onClick(item)} className="inline-flex items-center gap-2 font-medium hover:text-brand">
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">{pick(item.badge, lang) || LABEL[lang]}</span>
        {pick(item.title, lang)}{sub ? <span className="text-muted"> — {sub}</span> : null}
      </Wrap>
    </li>
  );
}

const VARIANT = { market_top: 'hero', market_bottom: 'hero', market_hero: 'hero', store_hero: 'hero', market_grid: 'grid', store_offers: 'strip', market_strip: 'strip', search_slot: 'slot', store_ticker: 'ticker' };

/**
 * One featured slot. Renders nothing when there is nothing to show (or on error), so a page never has a hole.
 * placement: market_hero | market_strip | market_grid | store_hero | store_offers | store_ticker | search_slot
 */
export default function FeaturedSlot({ placement, store, category, className }) {
  const { lang } = useI18n();
  const device = useMemo(() => (isMobile() ? 'mobile' : 'desktop'), []);
  const qs = new URLSearchParams({ placement, device });
  if (store) qs.set('store', store);
  if (category) qs.set('category', category);
  const { data } = useApi(`/featured?${qs}`);
  const items = data?.items || [];
  const onClick = (item) => send(item.id, 'click', placement);
  if (!items.length) return null;
  const variant = VARIANT[placement] || 'grid';
  if (variant === 'ticker') return <Ticker items={items} lang={lang} onClick={onClick} />;
  if (variant === 'strip') {
    return (
      <section className={cx('container mt-6 sm:mt-8', className)} aria-label={LABEL[lang]}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {items.map((item, i) => <FeaturedCard key={item.id} item={item} variant="strip" lang={lang} onClick={onClick} priority={false} />)}
        </div>
      </section>
    );
  }
  const cols = variant === 'hero' ? (items.length > 1 ? 'md:grid-cols-2' : '') : variant === 'slot' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4';
  if (variant === 'slot') {
    return (
      <section className={cx('mb-4', className)} aria-label={LABEL[lang]}>
        <div className={cx('grid gap-3 sm:gap-4', cols)}>{items.map((item) => <FeaturedCard key={item.id} item={item} variant="slot" lang={lang} onClick={onClick} />)}</div>
      </section>
    );
  }
  // consecutive "wide" banners share the page-width grid; a full-width or narrow banner gets a row of its own
  const rows = [];
  items.forEach((item) => {
    const w = item.layout?.width || 'wide';
    const last = rows[rows.length - 1];
    if (w === 'wide' && last?.wide) last.items.push(item); else rows.push({ wide: w === 'wide', width: w, items: [item] });
  });
  let first = true;
  return (
    <>
      {rows.map((row) => {
        const priority0 = first; first = false;
        if (row.width === 'full') return <section key={row.items[0].id} className={cx('mt-6 sm:mt-8', className)} aria-label={LABEL[lang]}><FeaturedCard item={row.items[0]} variant={variant} lang={lang} onClick={onClick} priority={priority0 && variant === 'hero'} /></section>;
        if (row.width === 'narrow') return <section key={row.items[0].id} className={cx('container mt-6 sm:mt-8', className)} aria-label={LABEL[lang]}><div className={cx('max-w-3xl', NARROW[row.items[0].layout.align] || NARROW.center)}><FeaturedCard item={row.items[0]} variant={variant} lang={lang} onClick={onClick} priority={priority0 && variant === 'hero'} /></div></section>;
        const cls = variant === 'hero' ? (row.items.length > 1 ? 'md:grid-cols-2' : '') : 'sm:grid-cols-2 lg:grid-cols-4';
        return (
          <section key={row.items.map((x) => x.id).join('-')} className={cx('container mt-6 sm:mt-8', className)} aria-label={LABEL[lang]}>
            <div className={cx('grid gap-3 sm:gap-4', cls)}>{row.items.map((item, i) => <FeaturedCard key={item.id} item={item} variant={variant} lang={lang} onClick={onClick} priority={priority0 && variant === 'hero' && i === 0} />)}</div>
          </section>
        );
      })}
    </>
  );
}
