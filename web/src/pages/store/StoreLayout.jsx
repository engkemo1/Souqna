import { useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useTheme } from '../../lib/theme.js';
import { useI18n } from '../../lib/i18n.jsx';
import { StoreContext, sp } from '../../lib/store.jsx';
import { StoreHeader, BottomNav, StoreFooter, AnnouncementBar } from '../../components/store/StoreChrome.jsx';
import CartDrawer from '../../components/store/CartDrawer.jsx';
import { HeroSkeleton } from '../../components/store/HeroSlider.jsx';
import { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Button from '../../components/ui/Button.jsx';

export default function StoreLayout() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const { t, tr } = useI18n();
  const { data, error, reload } = useApi(`/stores/${slug}`);
  useTheme(data?.store?.theme?.cssVars);

  useEffect(() => {
    if (!data) return;
    const key = `souqna.visit.${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* ignore */ }
    api(`/stores/${slug}/visit`, { method: 'POST' }).catch(() => {});
  }, [data, slug]);

  useEffect(() => { if (data) document.title = `${tr(data.store.name)} · ${t('app.name')}`; }, [data, tr, t]);

  const sub = pathname.replace(sp(slug), '');
  const hideBottomNav = /^\/(p\/|checkout|order\/)/.test(sub);

  useEffect(() => {
    document.documentElement.style.setProperty('--toast-offset', hideBottomNav ? '96px' : 'calc(var(--bottom-nav-h) + 16px)');
    return () => document.documentElement.style.removeProperty('--toast-offset');
  }, [hideBottomNav]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        {error.status === 404
          ? <EmptyState icon={Store} title={t('store.notFound')} body={t('error.notFoundBody')} action={<Button to="/">{t('store.backToMarket')}</Button>} />
          : <ErrorState error={error} onRetry={reload} />}
      </div>
    );
  }

  if (!data) {
    return (
      <div aria-busy="true">
        <div className="h-9 bg-fg/[0.08]" />
        <div className="container flex h-[60px] items-center gap-3 lg:h-[72px]"><Skeleton circle className="h-9 w-9" /><Skeleton className="h-5 w-36" /></div>
        <HeroSkeleton />
        <div className="container mt-10"><Skeleton className="mb-6 h-7 w-48" /><ProductGrid>{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid></div>
      </div>
    );
  }

  return (
    <StoreContext.Provider value={data}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-elevated focus:px-4 focus:py-2">Skip to content</a>
      <AnnouncementBar />
      <StoreHeader />
      <main id="main" className={hideBottomNav ? 'min-h-[60dvh]' : 'min-h-[60dvh] pb-[calc(var(--bottom-nav-h)+var(--safe-b))] lg:pb-0'}>
        <Outlet />
      </main>
      <StoreFooter />
      {!hideBottomNav && <BottomNav />}
      <CartDrawer slug={slug} />
    </StoreContext.Provider>
  );
}
