import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useTheme } from '../../lib/theme.js';
import { useI18n } from '../../lib/i18n.jsx';
import { StoreContext, sp } from '../../lib/store.jsx';
import { StoreHeader, BottomNav, StoreFooter, AnnouncementBar } from '../../components/store/StoreChrome.jsx';
import CartDrawer from '../../components/store/CartDrawer.jsx';
import SmartWhatsApp from '../../components/store/SmartWhatsApp.jsx';
import { resolveDesign } from '@souqna/shared/layout';
import { buildTheme } from '@souqna/shared/theme';
import { HeroSkeleton } from '../../components/store/HeroSlider.jsx';
import { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Button from '../../components/ui/Button.jsx';

export default function StoreLayout() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const { t, tr } = useI18n();
  const { data: apiData, error, reload } = useApi(`/stores/${slug}`);
  const navigate = useNavigate();
  // رابط قديم (اتغير اسم/رابط المتجر): حوّل للرابط الجديد من غير ما الزائر يحس.
  useEffect(() => {
    const cur = apiData?.store?.slug;
    if (cur && cur !== slug) navigate(pathname.replace(`/s/${slug}`, `/s/${cur}`) + window.location.search + window.location.hash, { replace: true });
  }, [apiData, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  // وضع المعاينة الحية: لما المتجر يتفتح جوه مصمّم المتجر (?preview=design) بيسمع إعدادات التصميم الغير محفوظة ويرسمها فورًا.
  const isPreview = typeof window !== 'undefined' && window.parent !== window && new URLSearchParams(window.location.search).get('preview') === 'design';
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!isPreview) return undefined;
    const on = (e) => { if (e.origin === window.location.origin && e.data?.type === 'souqna-design-preview') setPreview(e.data.payload || null); };
    window.addEventListener('message', on);
    window.parent.postMessage({ type: 'souqna-design-ready' }, window.location.origin);
    return () => window.removeEventListener('message', on);
  }, [isPreview, !!apiData]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo(() => {
    if (!apiData || !preview) return apiData;
    const cz = apiData.store.customization || {};
    const theme = preview.palette ? buildTheme(preview.palette) : apiData.store.theme;
    return { ...apiData, store: { ...apiData.store, theme, customization: { ...cz, design: preview.design || cz.design, sectionsOrder: preview.sectionsOrder || cz.sectionsOrder, hiddenSections: preview.hiddenSections || cz.hiddenSections, flash: preview.flash || cz.flash } } };
  }, [apiData, preview]);
  useTheme(data?.store?.theme?.cssVars);

  // Warm the chunks of the pages a shopper reaches next, so tapping the cart/product never waits on (or fails to fetch) a lazy bundle.
  useEffect(() => {
    if (!data) return undefined;
    const id = setTimeout(() => { import('./CartPage.jsx'); import('./Checkout.jsx'); import('./Product.jsx'); import('./Shop.jsx'); }, 800);
    return () => clearTimeout(id);
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data || isPreview) return;
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
      <div data-tpl={resolveDesign(data.store.customization).template} data-type={resolveDesign(data.store.customization).type}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-elevated focus:px-4 focus:py-2">Skip to content</a>
      <AnnouncementBar />
      <StoreHeader />
      <main id="main" className={hideBottomNav ? 'min-h-[60dvh]' : 'min-h-[60dvh] pb-[calc(var(--bottom-nav-h)+var(--safe-b))] lg:pb-0'}>
        <Outlet />
      </main>
      <StoreFooter />
      {!hideBottomNav && <BottomNav />}
      <CartDrawer slug={slug} />
      <SmartWhatsApp hasBottomNav={!hideBottomNav} />
      </div>
    </StoreContext.Provider>
  );
}
