import { useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, ShoppingBag, Package, Users, BarChart3, TicketPercent, Images, FolderTree, Palette, Settings, LogOut, ExternalLink, Plus, Menu,
} from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useApi } from '../../lib/hooks.js';
import { useTheme, DASHBOARD_THEME } from '../../lib/theme.js';
import { BrandMark } from '../../components/market/Brand.jsx';
import { StoreLogo } from '../../components/store/StoreChrome.jsx';
import LangToggle from '../../components/LangToggle.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { cx } from '../../components/ui/cx.js';

export function useNav() {
  const { t } = useI18n();
  return [
    { group: null, items: [
      { to: '/dashboard', end: true, icon: LayoutDashboard, label: t('dash.overview') },
      { to: '/dashboard/orders', icon: ShoppingBag, label: t('dash.orders'), badge: 'pending' },
      { to: '/dashboard/products', icon: Package, label: t('dash.products') },
      { to: '/dashboard/customers', icon: Users, label: t('dash.customers') },
      { to: '/dashboard/analytics', icon: BarChart3, label: t('dash.analytics') },
    ] },
    { group: t('dash.manage'), items: [
      { to: '/dashboard/offers', icon: TicketPercent, label: t('dash.offers') },
      { to: '/dashboard/banners', icon: Images, label: t('dash.banners') },
      { to: '/dashboard/categories', icon: FolderTree, label: t('dash.categories') },
    ] },
    { group: t('dash.store'), items: [
      { to: '/dashboard/theme', icon: Palette, label: t('dash.theme') },
      { to: '/dashboard/settings', icon: Settings, label: t('dash.settings') },
    ] },
  ];
}

function Sidebar({ pending }) {
  const { t, tr } = useI18n();
  const { store, user, logout } = useAuth();
  const nav = useNav();
  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-[76px] flex-col border-e border-line bg-elevated md:flex lg:w-[264px]">
      <div className="flex h-[72px] items-center gap-2.5 px-5 lg:px-6">
        <BrandMark className="h-9 w-9" />
        <span className="hidden font-display text-xl font-semibold lg:block">{t('app.name')}</span>
      </div>
      <div className="mx-3 mb-3 hidden rounded-2xl border border-line bg-surface p-3 lg:block">
        <div className="flex items-center gap-3">
          <StoreLogo store={store} size={40} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{tr(store.name)}</p>
            <a href={`/s/${store.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">{t('dash.viewStore')}<ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>
      </div>
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {nav.map((g, gi) => (
          <div key={gi} className={cx(gi > 0 && 'mt-5')}>
            {g.group && <p className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-muted lg:block">{g.group}</p>}
            {gi > 0 && <div className="mx-3 mb-3 h-px bg-line lg:hidden" />}
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink to={it.to} end={it.end} title={it.label}
                    className={({ isActive }) => cx('group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition',
                      'justify-center lg:justify-start', isActive ? 'text-fg' : 'text-muted hover:bg-fg/[0.04] hover:text-fg')}>
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId="side-active" className="absolute inset-0 rounded-xl bg-fg/[0.06]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                        <it.icon className="relative h-5 w-5 shrink-0" strokeWidth={isActive ? 2.1 : 1.75} />
                        <span className="relative hidden lg:block">{it.label}</span>
                        {it.badge === 'pending' && pending > 0 && (
                          <span className="relative ms-auto hidden h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent lg:grid">{pending}</span>
                        )}
                        {it.badge === 'pending' && pending > 0 && <span className="absolute end-2.5 top-2.5 h-2 w-2 rounded-full bg-accent ring-2 ring-elevated lg:hidden" />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2 lg:px-1">
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="flex flex-col items-center gap-1 lg:flex-row">
            <LangToggle compact />
            <button type="button" onClick={logout} title={t('auth.logout')} aria-label={t('auth.logout')} className="grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-fg/[0.06] hover:text-sale"><LogOut className="h-[18px] w-[18px] rtl:-scale-x-100" /></button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileTop() {
  const { store } = useAuth();
  const { t, tr } = useI18n();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-elevated/90 px-4 backdrop-blur-md md:hidden">
      <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
        <StoreLogo store={store} size={32} className="h-8 w-8" />
        <span className="truncate text-[15px] font-semibold">{tr(store.name)}</span>
      </Link>
      <div className="flex items-center">
        <LangToggle compact />
        <a href={`/s/${store.slug}`} target="_blank" rel="noreferrer" aria-label={t('dash.viewStore')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-fg/[0.06]"><ExternalLink className="h-5 w-5" /></a>
      </div>
    </header>
  );
}

function MobileNav({ pending }) {
  const { t } = useI18n();
  const items = [
    { to: '/dashboard', end: true, icon: LayoutDashboard, label: t('dash.overview') },
    { to: '/dashboard/orders', icon: ShoppingBag, label: t('dash.orders'), n: pending },
    { fab: true },
    { to: '/dashboard/products', icon: Package, label: t('dash.products') },
    { to: '/dashboard/more', icon: Menu, label: t('dash.more') },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-elevated/95 backdrop-blur-md pb-safe md:hidden" aria-label="Dashboard">
      <ul className="grid h-16 grid-cols-5">
        {items.map((it, i) => it.fab ? (
          <li key="fab" className="grid place-items-center">
            <Link to="/dashboard/products/new" aria-label={t('dash.addProduct')} className="-mt-6 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-on-primary shadow-lift ring-4 ring-canvas transition active:scale-90">
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </Link>
          </li>
        ) : (
          <li key={i}>
            <NavLink to={it.to} end={it.end} className={({ isActive }) => cx('relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-fg' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="dash-bn" className="absolute top-0 h-0.5 w-10 rounded-full bg-primary" />}
                  <span className="relative"><it.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.75} />
                    {it.n > 0 && <span className="absolute -end-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent ring-2 ring-elevated">{it.n}</span>}
                  </span>
                  {it.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function DashboardLayout() {
  const { user, store, ready } = useAuth();
  const { pathname } = useLocation();
  const { t } = useI18n();
  useTheme(DASHBOARD_THEME);
  const { data: counts } = useApi(user ? `/owner/orders?limit=1&_=${pathname.startsWith('/dashboard/orders') ? 'o' : 'x'}` : null);
  const pending = counts?.counts?.pending || 0;

  useEffect(() => { document.title = `${t('dash.overview')} · ${t('app.name')}`; }, [t]);

  // New-order alerts: poll the store's feed, beep and toast for orders that arrive after the page opened.
  const toast = useToast();
  useEffect(() => {
    if (!user || !store) return undefined;
    let since = null;
    let alive = true;
    const beep = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.25);
      } catch { /* audio may be blocked until the first click */ }
    };
    const tick = async () => {
      try {
        const d = await api(`/owner/notifications${since ? `?since=${encodeURIComponent(since)}` : ''}`);
        if (!alive) return;
        if (since && d.newOrders?.length) {
          beep();
          d.newOrders.slice(0, 3).forEach((o) => toast({ title: `طلب جديد ${o.number}`, description: `${o.customer_name} · ${o.city || ''} · ${o.total} ج.م`, duration: 6000 }));
        }
        since = d.now;
      } catch { /* network hiccup: try again next tick */ }
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [user, store, toast]);
  useEffect(() => {
    document.documentElement.style.setProperty('--toast-offset', 'calc(var(--bottom-nav-h) + 16px)');
    return () => document.documentElement.style.removeProperty('--toast-offset');
  }, []);

  if (!ready) return <div className="grid min-h-dvh place-items-center"><Skeleton className="h-10 w-40" /></div>;
  if (!user || !store) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;

  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar pending={pending} />
      <MobileTop />
      <div className="md:ps-[76px] lg:ps-[264px]">
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-[calc(96px+var(--safe-b))] pt-5 sm:px-6 md:pb-12 md:pt-8 lg:px-8 xl:px-10">
          <Outlet />
        </main>
      </div>
      <MobileNav pending={pending} />
    </div>
  );
}
