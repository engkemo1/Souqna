import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Store, CreditCard, MapPin, Sparkles, Camera, MessageSquare, Users, Truck, BarChart3, Smartphone, Palette, Banknote, Image as ImageIcon, ArrowRight, ShoppingBag, Heart, User, Package } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { sp } from '../../lib/store.jsx';
import Brand from '../../components/market/Brand.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import StylistChat from '../../components/market/StylistChat.jsx';
import ModaAvatar from '../../components/market/ModaAvatar.jsx';
import WearThis from '../../components/market/WearThis.jsx';
import RequestBanner from '../../components/market/RequestBanner.jsx';
import LookOfDay from '../../components/market/LookOfDay.jsx';
// the illustrated street is heavy SVG: load it in its own chunk so the first paint of the page is not delayed
const StreetScene = lazy(() => import('../../components/market/StreetScene.jsx'));
const streetFallback = <div aria-hidden="true" className="h-[360px] w-full sm:h-[440px] lg:h-[540px]" style={{ background: 'linear-gradient(180deg,#F6F9FD 0%,#EEF3FA 50%,#F4F7FB 100%)' }} />;
import { useDepartments } from '../../lib/departments.js';
import DeptStrip from '../../components/market/DeptStrip.jsx';
import ProductRail from '../../components/market/ProductRail.jsx';
import RecentlyViewed from '../../components/market/RecentlyViewed.jsx';
import StoreStrip from '../../components/market/StoreStrip.jsx';
import StoreCard from '../../components/market/StoreCard.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Button from '../../components/ui/Button.jsx';
import { cx } from '../../components/ui/cx.js';

const HERO_PROMPTS = [
  { ar: 'إطلالة فرح', en: 'Wedding outfit', askAr: 'إطلالة كاملة لحضور فرح', askEn: 'Complete outfit for a wedding' },
  { ar: 'طقم جامعة', en: 'University look', askAr: 'طقم مريح للجامعة', askEn: 'Comfortable university outfit' },
  { ar: 'طقم شغل', en: 'Work outfit', askAr: 'إطلالة مناسبة للشغل', askEn: 'An outfit for work' },
  { ar: 'ستايل رياضي', en: 'Sporty style', askAr: 'لبس رياضي كامل', askEn: 'Complete sporty look' },
];

function HeroStats({ stats = {}, lang }) {
  const { t } = useI18n();
  const items = [
    [Users, t('market.stat.customersValue'), t('market.stat.customers')],
    [Package, stats.products ? `+${new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(stats.products)}` : '—', t('market.stat.products')],
    [Store, t('market.stat.storesValue'), t('market.stat.stores')],
    [Truck, t('market.stat.deliveryValue'), t('market.stat.delivery')],
  ];
  return (
    <div className="grid grid-cols-2 divide-x divide-x-reverse divide-y divide-gray-100 rounded-2xl border border-line bg-white/95 py-3 shadow-[0_12px_35px_rgba(3,36,77,.06)] sm:grid-cols-4 sm:divide-y-0 sm:py-5">
      {items.map(([Icon, value, label]) => <div key={label} className="flex items-center justify-center gap-2.5 px-2 py-3 text-center sm:gap-3.5 sm:px-4 sm:py-1">
        <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f6f7f9] text-[#03244D] sm:grid"><Icon className="h-5 w-5" strokeWidth={1.75} /></div>
        <div><p className="font-display text-base font-black text-[#03244D] sm:text-2xl" dir="ltr">{value}</p><p className="text-[10px] font-medium text-muted sm:text-xs">{label}</p></div>
      </div>)}
    </div>
  );
}

function Why() {
  const { t } = useI18n();
  const items = [
    [CreditCard, t('market.why1'), t('market.why1b')],
    [Store, t('market.why3'), t('market.why3b')],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([Icon, a, b]) => (
        <div key={a} className="flex items-center gap-3.5 rounded-2xl border border-line bg-white px-4 py-3.5 shadow-xs">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#EAF0F8] text-brand">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-bold text-gray-900">{a}</p>
            <p className="text-[13px] text-gray-500">{b}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MarketHome() {
  const { t, tr, lang } = useI18n();
  const location = useLocation();
  const nav = useNavigate();
  const [heroSearch, setHeroSearch] = useState('');
  const [heroMode, setHeroMode] = useState('photo');
  const { data: base } = useApi('/marketplace?q=&category=all&sort=featured');
  const { data: promptCfg } = useApi('/stylist/prompts'); // الأزرار السريعة بتتظبط من الأدمن؛ الافتراضي HERO_PROMPTS لو الطلب فشل
  const heroPrompts = promptCfg?.hero || HERO_PROMPTS;
  const { label: deptLabel } = useDepartments();
  const STREET_DEPTS = ['women', 'men', 'kids', 'shoes', 'bags', 'hijab', 'abaya', 'jalabiya', 'denim', 'sports', 'accessories', 'underwear', 'wedding_dress', 'wedding_suit'];
  const deptLabels = Object.fromEntries(STREET_DEPTS.map((d) => [d, deptLabel(d)]));
  const deptCounts = base ? Object.fromEntries(STREET_DEPTS.map((d) => [d, base.departments?.find((x) => x.slug === d)?.products || 0])) : {};
  const showWearThis = base?.features?.stylist !== false;

  useEffect(() => { document.title = `${t('app.name')} · ${t('app.tagline')}`; }, [t]);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!['stores', 'products'].includes(id)) return undefined;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  const handleHeroSearchSubmit = (e) => {
    e.preventDefault();
    const qStr = heroSearch.trim();
    nav(qStr ? `/search?${new URLSearchParams({ q: qStr })}` : '/search');
  };

  return (
    <div className="min-h-dvh bg-[#F6F8FB] ">
      <MarketHeader />

      {/* Hero */}
      <section className="relative isolate overflow-hidden pt-6 sm:pt-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-white to-[#F6F9FD]" />
        <div aria-hidden="true" className="pointer-events-none absolute -start-24 top-10 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="container relative grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
          <div className="relative z-10 w-full min-w-0 max-w-2xl">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-[#EAF0F8] px-4 py-2 text-[13px] font-bold text-brand">
              <MapPin className="h-4 w-4" /><span>{lang === 'ar' ? 'اكتشف محلات الملابس في بنها' : 'Discover Banha clothing stores'}</span>
            </motion.div>
            <h1 className="mt-3 font-display text-[clamp(2.25rem,1.4rem+3vw,4.15rem)] font-black leading-[1.18] tracking-tight text-[#101d3a] sm:mt-4">
              <span className="block">{t('market.heroTitle').split('\n')[0]}</span>
              <span className="relative mt-1 inline-block pb-2 text-primary">{t('market.heroTitle').split('\n')[1]}<svg aria-hidden="true" viewBox="0 0 180 10" preserveAspectRatio="none" className="absolute bottom-0 end-0 h-2 w-[42%] text-primary"><path d="M2 6 C28 1 46 9 72 5 S124 2 178 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#43516a] sm:mt-4 sm:text-base sm:leading-8 lg:text-[18px]">{t('market.heroBody')}</p>

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:hidden">
              <Link to="/visual" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-btn px-3 py-3 text-sm font-bold text-white shadow-sm"><Camera className="h-5 w-5" />{t('market.searchByPhoto')}</Link>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('moda:open', { detail: {} }))} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-[#F8620A] bg-white px-3 py-3 text-sm font-bold text-[#03244D]"><ModaAvatar src={base?.features?.stylistAvatar || null} size={28} ring={false} />{t('market.askStylist')}</button>
            </div>
            <div className="mt-5 flex gap-2.5">
              <Link to="/stores" className="flex flex-1 items-center justify-center rounded-2xl bg-btn px-3 py-3.5 text-sm shadow-[0_10px_24px_-8px_rgba(3,36,77,.55)] font-bold text-white transition hover:brightness-95 sm:flex-none sm:px-7">{t('market.exploreStores')}</Link>
              <Link to="/join" className="flex flex-1 items-center justify-center rounded-2xl border-[1.5px] border-[#F8620A] bg-white px-3 py-3.5 text-sm font-bold text-[#03244D] transition hover:bg-[#FFF3EB] sm:flex-none sm:px-7">{t('market.openStore')}</Link>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none lg:hidden">
              {[
                ['women', t('cat.women'), '/search?department=women'],
                ['men', t('cat.men'), '/search?department=men'],
                ['kids', t('cat.kids'), '/search?department=kids'],
                ['shoes', t('cat.shoes'), '/search?department=shoes'],
                ['bags', t('cat.bags'), '/search?department=bags'],
              ].map(([slug, label, href]) => <Link key={slug} to={href} className="shrink-0 rounded-full border-[1.5px] border-[#F8620A] bg-white px-3.5 py-2 text-xs font-semibold text-[#03244D]">{label}</Link>)}
            </div>

            <Link to="/stores" className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white bg-white/85 px-3.5 py-3 shadow-[0_8px_24px_rgba(3,36,77,.07)] backdrop-blur lg:hidden">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex -space-x-2 rtl:space-x-reverse">
                  {(base?.stores || []).filter((store) => store.cover).slice(0, 3).map((store) => <SmartImage key={store.id} media={store.cover} alt={tr(store.name)} ratio="1 / 1" sizes="36px" className="h-9 w-9 rounded-full border-2 border-white" />)}
                  <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-btn text-white"><Store className="h-4 w-4" /></span>
                </span>
                <span className="min-w-0"><b className="block truncate text-xs text-[#03244D]">{t('market.allStores')}</b><span className="mt-0.5 block text-[10px] text-muted">{lang === 'ar' ? 'محلات الملابس في بنها كلها في مكان واحد' : 'Banha clothing stores, all in one place'}</span></span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-brand rtl:rotate-180" />
            </Link>
          </div>

          <div className="relative hidden rounded-[28px] border border-white bg-white/90 p-5 shadow-[0_24px_60px_-24px_rgba(3,36,77,.28)] backdrop-blur sm:block lg:p-6">
            <p className="mb-3 text-sm font-extrabold text-[#03244D]">{lang === 'ar' ? 'ابحث عن اللي في بالك' : 'Find what you have in mind'}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid sm:gap-3" aria-label={t('market.quickTry')}>
              <button type="button" onClick={() => setHeroMode('photo')} aria-pressed={heroMode === 'photo'} className={cx('flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] px-2 text-xs font-bold transition sm:text-sm', heroMode === 'photo' ? 'border-[#F8620A] bg-[#FFF3EB] text-fg' : 'border-[#F8620A] bg-white text-[#03244D] hover:bg-[#FFF3EB]')}><Camera className="h-4 w-4" />{t('market.searchByPhoto')}</button>
              <button type="button" onClick={() => setHeroMode('text')} aria-pressed={heroMode === 'text'} className={cx('flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] px-2 text-xs font-bold transition sm:text-sm', heroMode === 'text' ? 'border-[#F8620A] bg-[#FFF3EB] text-fg' : 'border-[#F8620A] bg-white text-[#03244D] hover:bg-[#FFF3EB]')}><Search className="h-4 w-4" />{t('market.searchByText')}</button>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('moda:open', { detail: {} }))} className="flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#F8620A] bg-white px-2 text-xs font-bold text-[#03244D] transition hover:bg-[#FFF3EB] sm:text-sm"><ModaAvatar src={base?.features?.stylistAvatar || null} size={25} ring={false} />{t('market.askStylist')}</button>
            </div>
            {heroMode === 'text' ? (
              <form onSubmit={handleHeroSearchSubmit} className="relative mt-3">
                <input type="search" value={heroSearch} onChange={(e) => setHeroSearch(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} className="h-14 w-full rounded-2xl border border-line bg-white ps-12 pe-24 text-sm shadow-xs outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/10 sm:text-base" />
                <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <button type="submit" className="absolute end-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-btn px-5 text-sm font-bold text-white transition hover:brightness-95">{t('search.go')}</button>
              </form>
            ) : (
              <Link to="/visual" className="group mt-3 min-h-[148px] flex-col items-center justify-center flex rounded-2xl border border-dashed border-line-strong bg-white/80 px-4 py-5 text-center shadow-[0_8px_24px_rgba(3,36,77,.04)] transition hover:border-fg/30 hover:bg-[#F6F8FB]">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#EAF0F8] text-brand"><ImageIcon className="h-6 w-6" /></span>
                <span className="mt-2 text-sm font-bold text-[#03244D]">{t('visual.pick')}</span>
                <span className="mt-1 text-xs text-muted">{t('visual.pickHint')}</span>
              </Link>
            )}
            <div className="mt-4">
              {heroPrompts.length > 0 && <p className="mb-2 text-xs font-semibold text-muted">{t('market.quickTry')}</p>}
              <div className="flex flex-wrap gap-2">
                {heroPrompts.map((prompt) => <button key={prompt.ar} type="button" onClick={() => window.dispatchEvent(new CustomEvent('moda:open', { detail: { ask: lang === 'ar' ? prompt.askAr : prompt.askEn } }))} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-[11px] font-medium text-[#03244D] transition hover:border-fg/30 hover:bg-[#F6F8FB] sm:text-xs"><Sparkles className="h-3.5 w-3.5 text-brand" />{lang === 'ar' ? prompt.ar : prompt.en}</button>)}
              </div>
            </div>
          </div>

        </div>
        <div className="relative mt-2 md:mt-4" style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 26%, #000 86%, transparent 100%)', maskImage: 'linear-gradient(to bottom, transparent 0%, #000 26%, #000 86%, transparent 100%)' }}>
          <Suspense fallback={streetFallback}><StreetScene lang={lang} labels={deptLabels} counts={deptCounts} /></Suspense>
        </div>
      </section>

      {/* Put the two discovery helpers right after the hero so shoppers see them early. */}
      <div className="container mt-5 grid gap-4 md:mt-7 md:grid-cols-2">
        {showWearThis && <WearThis className="h-full" />}
        <RequestBanner compact className={showWearThis ? 'h-full' : 'h-full md:col-span-2'} />
      </div>

      <div className="container mt-5 sm:mt-7">
      {/* Stats Row */}
      <section className="container mt-4 sm:mt-6">
        <HeroStats stats={base?.stats || {}} lang={lang} />
      </section>

      {/* Why Strip */}
      <div className="container mt-6 sm:mt-8"><Why /></div>

      {/* shop by department: right under the trust strip (secure payment · easy exchange · local products) */}
      <div className="mt-8 sm:mt-10"><DeptStrip departments={base?.departments || []} /></div>
      <StoreStrip stores={base?.stores || []} />
      <LookOfDay />

      {/* product shelves */}
      <div id="products" className="mt-8 scroll-mt-32 border-y border-line bg-secondary/50">
        <ProductRail title={t('market.trending')} items={base?.trending} loading={!base} to="/search?sort=best" />
      </div>
      <ProductRail title={t('market.deals')} items={base?.deals} to="/search?sale=1" />
      <div className="border-y border-line bg-secondary/50">
        <ProductRail title={t('market.newArrivals')} items={base?.newest} to="/search?sort=newest" />
      </div>
      <RecentlyViewed />
      {(base?.deptRails || []).map((r, i) => (
        <div key={r.slug} className={i % 2 === 0 ? '' : 'border-y border-line bg-secondary/50'}>
          <ProductRail title={t('market.topIn', { d: r.name?.[lang] || r.name?.ar })} items={r.items} to={`/search?department=${r.slug}`} />
        </div>
      ))}

      {/* A small shop preview leads to a dedicated, searchable store directory. */}
      <section id="stores" className="scroll-mt-32 border-y border-line bg-white">
        <div className="container py-10 sm:py-14">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-[#EAF0F8] px-3 py-1 text-xs font-bold text-brand">{lang === 'ar' ? 'محلات محلية من بنها' : 'Local Banha shops'}</span>
              <h2 className="mt-3 font-display text-2xl font-black text-[#03244D] sm:text-3xl">{t('market.allStores')}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{lang === 'ar' ? 'تصفّح المحلات، ادخل صفحة كل محل، وشوف المنتجات والعروض في مكان واحد.' : 'Browse local shops, open each store page, and see the products and offers in one place.'}</p>
            </div>
            <Link to="/stores" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-btn px-5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">{lang === 'ar' ? 'اكتشف كل المحلات' : 'Discover all stores'}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(base?.stores || []).slice(0, 3).map((store, i) => <StoreCard key={store.id} store={store} index={i} />)}
          </div>
        </div>
      </section>

      {/* owner CTA */}
      <section className="container mt-16">
        <div className="relative overflow-hidden rounded-[32px] border border-line bg-gradient-to-br from-[#EAF0F8] via-white to-white px-6 py-12 text-[#03244D] shadow-[0_18px_50px_rgba(3,36,77,.06)] sm:px-12 sm:py-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative">
            <h2 className="font-display text-display-sm font-bold text-[#03244D]">{t('market.ownerTitle')}</h2>
            <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-[#43516a]">{t('market.ownerBody')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="primary" to="/join">{t('market.openStore')}</Button>
              <Button size="lg" to="/login?demo=1" className="!border-line !bg-white !text-[#03244D] hover:!border-brand hover:!text-brand" variant="outline">{t('market.ownerDemo')}</Button>
            </div>
          </div>
          <ul className="relative mt-10 grid gap-3 sm:grid-cols-2 lg:mt-0">
            {[[Palette, t('auth.side1')], [Smartphone, t('auth.side2')], [BarChart3, t('auth.side3')], [Banknote, t('store.cod')]].map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EAF0F8] text-brand"><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-medium text-[#26344e]">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="container mt-16 flex flex-col items-center justify-between gap-4 border-t border-line py-10 text-sm text-muted sm:flex-row">
        <Brand />
        <div className="flex flex-col items-center gap-2 sm:items-end">
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">{[['privacy', 'legal.privacy'], ['terms', 'legal.terms']].map(([k, l]) => <Link key={k} to={`/legal/${k}`} className="hover:text-fg">{t(l)}</Link>)}</nav>
          <p>© {new Date().getFullYear()} {t('market.footer')}</p>
        </div>
      </footer>
      <StylistChat />
    </div>
  );
}
