import SuggestInput, { saveRecent } from './SuggestInput.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Search, Heart, User, ShoppingBag, ChevronDown, Menu, X, Flame } from 'lucide-react';
import { useBuyer } from '../../lib/buyer.jsx';
import { useScrolled } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import Brand from './Brand.jsx';
import MobileBottomNav from './MobileBottomNav.jsx';
import Button from '../ui/Button.jsx';
import { cx } from '../ui/cx.js';
import { useMarketCart } from '../../lib/cart.jsx';

const TOP_CATEGORIES = [
  { slug: 'women', label: 'cat.women', href: '/search?department=women' },
  { slug: 'men', label: 'cat.men', href: '/search?department=men' },
  { slug: 'kids', label: 'cat.kids', href: '/search?department=kids' },
  { slug: 'shoes', label: 'cat.shoes', href: '/search?department=shoes' },
  { slug: 'bags', label: 'cat.bags', href: '/search?department=bags' },
  { slug: 'perfume_makeup', label: 'market.nav.perfume', href: '/search?q=عطور' },
  { slug: 'care', label: 'market.nav.care', href: '/search?q=عناية' },
  { slug: 'maternity', label: 'market.nav.maternity', href: '/search?q=حوامل' },
  { slug: 'underwear', label: 'cat.underwear', href: '/search?department=underwear' },
  { slug: 'wedding_suit', label: 'cat.wedding_suit', href: '/search?department=wedding_suit' },
  { slug: 'wedding_dress', label: 'cat.wedding_dress', href: '/search?department=wedding_dress' },
  { slug: 'sports', label: 'cat.sports', href: '/search?department=sports' },
];

export default function MarketHeader() {
  const { t, lang, toggle } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const scrolled = useScrolled(10);
  const me = useBuyer();
  const cart = useMarketCart();
  const handleSectionLink = (id) => (event) => {
    setMobileMenuOpen(false);
    if (window.location.pathname !== '/') return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    window.history.replaceState(null, '', `/#${id}`);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
    <header className={cx('sticky top-0 z-40 bg-white/95 transition-all duration-300 backdrop-blur-md', scrolled ? 'shadow-sm border-b border-line' : 'border-b border-line/60')}>
      <div className="container flex h-16 items-center justify-between gap-3 lg:h-[72px]">
        {/* Brand */}
        <Brand />

        <form role="search" onSubmit={(event) => { event.preventDefault(); const value = query.trim(); saveRecent(value); navigate(value ? `/search?${new URLSearchParams({ q: value })}` : '/search'); }} className="relative mx-4 hidden max-w-xl flex-1 md:block">
          <Search className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <SuggestInput value={query} onChange={setQuery} inputProps={{ placeholder: t('search.placeholder'), 'aria-label': t('search.placeholder') }} className="h-11 w-full rounded-full border-0 bg-[#f2f2f2] ps-4 pe-11 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-brand/20" />
        </form>

        {/* Action icons & owner CTA */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-label={mobileMenuOpen ? (lang === 'ar' ? 'إغلاق القائمة' : 'Close menu') : (lang === 'ar' ? 'فتح القائمة' : 'Open menu')} className="grid h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-fg/[0.06] md:hidden">
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Cart */}
          <Link to="/market-cart" aria-label={t('cart.title')} title={t('cart.title')} data-cart-target className="relative grid h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-fg/[0.06]">
            <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
            {cart.count > 0 && <span className="absolute end-0 top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent tabular">{cart.count > 99 ? '99+' : cart.count}</span>}
          </Link>

          {/* Search */}
          <Link to="/search" aria-label={t('search.open')} className="grid h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-fg/[0.06] md:hidden">
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </Link>

          {/* Wishlist / Heart */}
          <Link to="/favorites" aria-label={t('store.favorites')} title={t('store.favorites')} className="hidden h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-fg/[0.06] sm:grid">
            <Heart className="h-5 w-5" strokeWidth={1.75} />
          </Link>

          {/* Account */}
          <Link to="/account" aria-label={t('acc.title')} title={me?.buyer ? me.buyer.name : t('acc.title')} className="relative hidden h-10 w-10 place-items-center rounded-full text-fg transition hover:bg-fg/[0.06] sm:grid">
            <User className="h-5 w-5" strokeWidth={1.75} />
            {me?.unread > 0 && <span className="absolute end-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-sale ring-2 ring-canvas" />}
          </Link>

          {/* Language selector */}
          <button type="button" onClick={toggle} className="hidden h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-fg/80 transition hover:bg-fg/[0.06] active:scale-95 sm:inline-flex">
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>

          {/* Owner login button */}
          <Button size="sm" variant="ghost" to="/join" className="hidden text-xs font-semibold md:inline-flex">
            {t('market.openStore')}
          </Button>
        </nav>
      </div>

      {/* Secondary Categories Nav */}
      <div className="hidden border-t border-line/40 bg-white/70 py-2 md:block">
        <div className="container flex items-center justify-start gap-6 overflow-x-auto px-2 text-[13px] font-medium text-fg/80 scrollbar-none 2xl:justify-center sm:gap-8">
          <Link to="/stores" className="shrink-0 font-bold text-brand transition hover:text-brand/80">{t('market.exploreStores')}</Link>
          <a href="/#products" onClick={handleSectionLink('products')} className="shrink-0 font-bold text-fg transition hover:text-brand">{t('market.browseProducts')}</a>
          {TOP_CATEGORIES.map((cat) => (
            <Link key={cat.slug} to={cat.href} className="shrink-0 transition hover:text-brand hover:font-semibold">
              {t(cat.label)}
            </Link>
          ))}
          <Link to="/search?sale=1" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#fff0e5] px-3 py-1.5 font-bold text-brand transition hover:bg-brand hover:text-white"><Flame className="h-4 w-4" />{lang === 'ar' ? 'عروض بنها' : 'Banha deals'}</Link>
        </div>
      </div>

      {mobileMenuOpen && <div className="border-t border-line bg-white shadow-lg md:hidden">
        <div className="container grid gap-2 py-4">
          <Link to="/stores" onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-brand px-4 py-3 text-center text-sm font-bold text-white">{t('market.exploreStores')}</Link>
          <a href="/#products" onClick={handleSectionLink('products')} className="rounded-xl border border-line px-4 py-3 text-center text-sm font-bold text-fg">{t('market.browseProducts')}</a>
          <Link to="/join" onClick={() => setMobileMenuOpen(false)} className="rounded-xl border border-line px-4 py-3 text-center text-sm font-bold text-fg">{t('market.openStore')}</Link>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link to="/favorites" onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-secondary px-3 py-2.5 text-center text-sm font-medium">{t('store.favorites')}</Link>
            <Link to="/account" onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-secondary px-3 py-2.5 text-center text-sm font-medium">{t('acc.title')}</Link>
          </div>
          <button type="button" onClick={() => { toggle(); setMobileMenuOpen(false); }} className="rounded-xl px-3 py-2.5 text-center text-sm font-medium text-muted">{lang === 'ar' ? 'English' : 'العربية'}</button>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {TOP_CATEGORIES.map((cat) => <Link key={cat.slug} to={cat.href} onClick={() => setMobileMenuOpen(false)} className="rounded-full border border-line px-3 py-2 text-xs font-medium">{t(cat.label)}</Link>)}
          </div>
        </div>
      </div>}
    </header>
    <MobileBottomNav />
    </>
  );
}
