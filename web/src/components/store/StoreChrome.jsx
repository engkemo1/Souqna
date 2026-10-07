import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Heart, ShoppingBag, Home, LayoutGrid, ChevronLeft, ChevronRight, MapPin, Phone, Instagram, Facebook, Star, Truck, RefreshCcw, Banknote, Store } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useCart, useFavorites } from '../../lib/cart.jsx';
import { useStore, sp } from '../../lib/store.jsx';
import { useScrollDirection, useScrolled } from '../../lib/hooks.js';
import { formatMoney } from '../../lib/format.js';
import SmartImage from '../ui/SmartImage.jsx';
import { IconButton } from '../ui/Button.jsx';
import LangToggle from '../LangToggle.jsx';
import { cx } from '../ui/cx.js';

export function CountBadge({ n, bumpKey }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span key="b" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
          className="absolute -end-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-on-accent ring-2 ring-header tabular">
          <span key={bumpKey} className={bumpKey ? 'animate-bump' : ''}>{n > 99 ? '99+' : n}</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function StoreLogo({ store, size = 36, className }) {
  return store.logo ? (
    <SmartImage media={store.logo} ratio="1 / 1" sizes={`${size * 2}px`} className={cx('shrink-0 rounded-full ring-1 ring-black/5', className)} />
  ) : (
    <span className={cx('grid shrink-0 place-items-center rounded-full bg-primary font-display text-sm text-on-primary', className)} style={{ width: size, height: size }}>{store.code}</span>
  );
}

export function AnnouncementBar() {
  const { store, offers } = useStore();
  const { t, tr, lang } = useI18n();
  const items = [
    t('store.freeShippingOver', { v: formatMoney(store.freeShippingOver, lang) }),
    ...offers.slice(0, 2).map((o) => `${t('store.useCode')} ${o.code} — ${tr(o.title)}`),
    t('store.cod'),
  ];
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((x) => (x + 1) % items.length), 4200); return () => clearInterval(id); }, [items.length]);
  return (
    <div className="relative h-9 overflow-hidden bg-footer text-center text-[12.5px] font-medium text-on-footer" aria-live="off">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={i} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.35 }} className="absolute inset-0 grid place-items-center truncate px-4">
          {items[i]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export function StoreHeader() {
  const { store, categories } = useStore();
  const { t, tr, isRtl } = useI18n();
  const cart = useCart(store.slug);
  const favs = useFavorites(store.slug);
  const hidden = useScrollDirection();
  const scrolled = useScrolled(40);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const isHome = pathname === sp(store.slug);
  const Back = isRtl ? ChevronRight : ChevronLeft;

  return (
    <header className={cx('sticky top-0 z-40 bg-header/95 text-on-header backdrop-blur-md transition-[transform,box-shadow] duration-300 supports-[backdrop-filter]:bg-header/85',
      hidden ? '-translate-y-full lg:translate-y-0' : 'translate-y-0', scrolled ? 'shadow-[0_1px_0_rgb(var(--c-border))]' : '')}>
      <div className="container flex h-[60px] items-center gap-2 lg:h-[72px] lg:gap-6">
        {/* start */}
        <div className="flex min-w-0 flex-1 items-center gap-1 lg:flex-none">
          {!isHome && (
            <button type="button" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(sp(store.slug)))} aria-label={t('common.back')}
              className="-ms-2 grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-fg/[0.07] lg:hidden"><Back className="h-5 w-5" /></button>
          )}
          <Link to={sp(store.slug)} className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pe-2">
            <StoreLogo store={store} size={36} className="h-9 w-9" />
            <span className="truncate font-display text-[17px] font-semibold tracking-tight lg:text-xl">{tr(store.name)}</span>
          </Link>
        </div>

        {/* desktop nav */}
        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label={t('store.categories')}>
          <NavLink end to={sp(store.slug)} className={({ isActive }) => cx('rounded-full px-3.5 py-2 text-[14.5px] font-medium transition hover:bg-fg/[0.06]', isActive && 'bg-fg/[0.06]')}>{t('store.home')}</NavLink>
          <NavLink end to={sp(store.slug, 'shop')} className={({ isActive }) => cx('rounded-full px-3.5 py-2 text-[14.5px] font-medium transition hover:bg-fg/[0.06]', isActive && !search && 'bg-fg/[0.06]')}>{t('store.shopAll')}</NavLink>
          {categories.slice(0, 4).map((c) => (
            <Link key={c.id} to={sp(store.slug, `shop?category=${c.slug}`)} className="rounded-full px-3.5 py-2 text-[14.5px] font-medium transition hover:bg-fg/[0.06]">{tr(c.name)}</Link>
          ))}
          <Link to={sp(store.slug, 'shop?sale=1')} className="rounded-full px-3.5 py-2 text-[14.5px] font-semibold text-sale transition hover:bg-sale/10">{t('store.onSale')}</Link>
        </nav>

        {/* end */}
        <div className="flex items-center gap-0.5">
          <IconButton to={sp(store.slug, 'search')} label={t('store.search')} icon={Search} className="hidden lg:inline-grid" />
          <LangToggle compact className="lg:hidden" />
          <LangToggle className="hidden lg:inline-flex" />
          <IconButton to={sp(store.slug, 'favorites')} label={t('store.favorites')} icon={Heart} className="hidden lg:inline-grid" badge={<CountBadge n={favs.count} />} />
          <IconButton label={t('store.cart')} icon={ShoppingBag} onClick={cart.open} data-cart-target className="hidden lg:inline-grid" badge={<CountBadge n={cart.count} bumpKey={cart.bump} />} />
          <IconButton to={sp(store.slug, 'cart')} label={t('store.cart')} icon={ShoppingBag} data-cart-target className="lg:hidden" badge={<CountBadge n={cart.count} bumpKey={cart.bump} />} />
        </div>
      </div>
    </header>
  );
}

/** One-handed mobile navigation. Hidden on desktop and on product/checkout pages. */
export function BottomNav() {
  const { store } = useStore();
  const { t } = useI18n();
  const cart = useCart(store.slug);
  const favs = useFavorites(store.slug);
  const items = [
    { to: '', end: true, icon: Home, label: t('store.home') },
    { to: 'categories', icon: LayoutGrid, label: t('store.categories') },
    { to: 'search', icon: Search, label: t('store.search') },
    { to: 'favorites', icon: Heart, label: t('store.favorites'), n: favs.count },
    { to: 'cart', icon: ShoppingBag, label: t('store.cart'), n: cart.count, cart: true },
  ];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-header/95 text-on-header backdrop-blur-md pb-safe lg:hidden">
      <ul className="mx-auto grid h-[var(--bottom-nav-h)] max-w-lg grid-cols-5">
        {items.map((it) => (
          <li key={it.to}>
            <NavLink to={sp(store.slug, it.to)} end={it.end} className="group relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium">
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="bn-pill" className="absolute top-1.5 h-8 w-14 rounded-full bg-fg/[0.08]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="relative" {...(it.cart ? { 'data-cart-target': true } : {})}>
                    <it.icon className={cx('h-[22px] w-[22px] transition', isActive ? 'scale-105' : 'opacity-70')} strokeWidth={isActive ? 2.2 : 1.75} />
                    {it.n > 0 && <span className="absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent ring-2 ring-header tabular"><span key={it.cart ? cart.bump : 0} className={it.cart && cart.bump ? 'animate-bump' : ''}>{it.n}</span></span>}
                  </span>
                  <span className={cx('relative', isActive ? 'font-semibold' : 'opacity-70')}>{it.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TrustStrip({ className }) {
  const { t, lang } = useI18n();
  const { store } = useStore();
  const items = [
    { icon: Truck, title: t('store.delivery'), body: t('store.freeShippingOver', { v: formatMoney(store.freeShippingOver, lang) }) },
    { icon: Banknote, title: t('store.cod'), body: t('market.why1b') },
    { icon: RefreshCcw, title: t('store.exchange'), body: t('market.why2b') },
  ];
  return (
    <div className={cx('grid grid-cols-1 gap-3 sm:grid-cols-3', className)}>
      {items.map((it) => (
        <div key={it.title} className="flex items-center gap-3.5 rounded-2xl bg-secondary px-4 py-3.5 text-on-secondary">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-elevated text-brand shadow-sm"><it.icon className="h-5 w-5" strokeWidth={1.75} /></span>
          <div className="min-w-0"><p className="text-sm font-semibold">{it.title}</p><p className="truncate text-[13px] opacity-75">{it.body}</p></div>
        </div>
      ))}
    </div>
  );
}

export function StoreFooter() {
  const { store, categories } = useStore();
  const { t, tr } = useI18n();
  return (
    <footer className="mt-20 bg-footer text-on-footer">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <StoreLogo store={store} size={44} className="h-11 w-11" />
            <p className="font-display text-xl font-semibold">{tr(store.name)}</p>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-footer-muted">{tr(store.description)}</p>
          <div className="mt-4 flex items-center gap-1.5 text-sm"><Star className="h-4 w-4 fill-current text-amber-400" /><span className="font-semibold">{store.rating}</span><span className="text-footer-muted">({store.ratingCount})</span></div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-on-footer">{t('store.shop')}</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-footer-muted">
            <li><Link className="hover:text-on-footer" to={sp(store.slug, 'shop')}>{t('store.shopAll')}</Link></li>
            {categories.map((c) => <li key={c.id}><Link className="hover:text-on-footer" to={sp(store.slug, `shop?category=${c.slug}`)}>{tr(c.name)}</Link></li>)}
            <li><Link className="hover:text-on-footer" to={sp(store.slug, 'shop?sale=1')}>{t('store.onSale')}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-on-footer">{t('store.contact')}</h3>
          <ul className="mt-4 space-y-3 text-sm text-footer-muted">
            <li className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{tr(store.address)}</li>
            {store.phone && <li><a className="flex gap-2.5 hover:text-on-footer" href={`tel:${store.phone}`} dir="ltr"><Phone className="h-4 w-4 shrink-0" />{store.phone}</a></li>}
            {store.instagram && <li><a className="flex gap-2.5 hover:text-on-footer" href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4 shrink-0" />@{store.instagram}</a></li>}
            {store.facebook && <li><a className="flex gap-2.5 hover:text-on-footer" href={`https://facebook.com/${store.facebook}`} target="_blank" rel="noreferrer"><Facebook className="h-4 w-4 shrink-0" />{store.facebook}</a></li>}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-on-footer">{t('store.about')}</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-footer-muted">
            <li>{t('store.cod')}</li><li>{t('store.exchange')}</li><li>{t('store.delivery')}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col items-center justify-between gap-3 py-6 text-xs text-footer-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {tr(store.name)}</p>
          <Link to="/" className="inline-flex items-center gap-1.5 hover:text-on-footer"><Store className="h-3.5 w-3.5" />{t('store.poweredBy')} · {t('app.name')}</Link>
        </div>
      </div>
    </footer>
  );
}
