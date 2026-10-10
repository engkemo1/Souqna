import { useDepartments } from '../../lib/departments.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Search, ArrowRight, Store, Banknote, RefreshCcw, MapPin, Sparkles, BarChart3, Smartphone, Palette } from 'lucide-react';
import { useApi, useDebounced, useScrolled } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';
import Brand from '../../components/market/Brand.jsx';
import PromoBar from '../../components/market/PromoBar.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import MarketSearchBar from '../../components/market/MarketSearchBar.jsx';
import StoreCard, { StoreCardSkeleton } from '../../components/market/StoreCard.jsx';
import ProductCard, { ProductCardSkeleton } from '../../components/store/ProductCard.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import LangToggle from '../../components/LangToggle.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { cx } from '../../components/ui/cx.js';

function HeroCollage({ stores }) {
  const { lang } = useI18n();
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 600], [0, -40]);
  const y2 = useTransform(scrollY, [0, 600], [0, 30]);
  const covers = stores.filter((s) => s.cover).slice(0, 3);
  if (covers.length < 3) {
    return <div className="grid grid-cols-2 gap-3"><Skeleton className="aspect-[4/5] rounded-3xl" /><Skeleton className="mt-10 aspect-[4/5] rounded-3xl" /></div>;
  }
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-xl">
      <motion.div style={{ y: y1 }} className="absolute start-0 top-0 w-[58%]">
        <motion.div initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          <Link to={`/s/${covers[0].slug}`} className="block overflow-hidden rounded-[28px] shadow-lift ring-1 ring-black/5"><SmartImage media={covers[0].cover} ratio="4 / 5" position="50% 100%" sizes="(min-width:1024px) 22vw, 50vw" priority /></Link>
        </motion.div>
      </motion.div>
      <motion.div style={{ y: y2 }} className="absolute end-0 top-[12%] w-[50%]">
        <motion.div initial={{ opacity: 0, y: 40, rotate: 3 }} animate={{ opacity: 1, y: 0, rotate: 3 }} transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}>
          <Link to={`/s/${covers[1].slug}`} className="block overflow-hidden rounded-[28px] shadow-lift ring-1 ring-black/5"><SmartImage media={covers[1].cover} ratio="4 / 5" position="50% 100%" sizes="(min-width:1024px) 20vw, 45vw" priority /></Link>
        </motion.div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="absolute bottom-[-6%] start-[22%] hidden w-[46%] sm:block">
        <Link to={`/s/${covers[2].slug}`} className="block overflow-hidden rounded-[28px] shadow-lift ring-4 ring-canvas"><SmartImage media={covers[2].cover} ratio="16 / 11" sizes="(min-width:1024px) 20vw, 45vw" /></Link>
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, type: 'spring', stiffness: 200, damping: 18 }}
        className="absolute -bottom-2 end-[2%] hidden items-center gap-2.5 rounded-2xl bg-elevated px-3.5 py-2.5 shadow-lift ring-1 ring-line sm:flex">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-brand"><MapPin className="h-[18px] w-[18px]" /></span>
        <span className="text-sm font-semibold leading-tight">{lang === 'ar' ? 'بنها' : 'Banha'}<span className="block text-xs font-normal text-muted">{lang === 'ar' ? 'القليوبية، مصر' : 'Qalyubia, Egypt'}</span></span>
      </motion.div>
    </div>
  );
}

function Why() {
  const { t } = useI18n();
  const items = [[Banknote, t('market.why1'), t('market.why1b')], [RefreshCcw, t('market.why2'), t('market.why2b')], [Store, t('market.why3'), t('market.why3b')]];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([Icon, a, b]) => (
        <div key={a} className="flex items-center gap-3.5 rounded-2xl border border-line bg-elevated px-4 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-brand"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
          <div><p className="text-sm font-semibold">{a}</p><p className="text-[13px] text-muted">{b}</p></div>
        </div>
      ))}
    </div>
  );
}

export default function MarketHome() {
  const { t, tr, lang } = useI18n();
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('featured');
  const q = useDebounced(term.trim(), 250);
  const path = useMemo(() => `/marketplace?${new URLSearchParams({ q, category, sort })}`, [q, category, sort]);
  const { data, error, loading, reload } = useApi(path);
  const { data: base } = useApi('/marketplace?q=&category=all&sort=featured');

  useEffect(() => { document.title = `${t('app.name')} · ${t('app.tagline')}`; }, [t]);

  const featured = (base?.stores || []).filter((s) => s.featured);
  const { label: deptLabel } = useDepartments();
  const cats = ['all', ...(base?.categories || []).map((c) => c.id)];
  const titleLines = t('market.heroTitle').split('\n');

  return (
    <div className="min-h-dvh">
      <PromoBar />
      <MarketHeader />

      {/* hero */}
      <section className="container grid items-center gap-12 pb-16 pt-8 sm:pt-14 lg:grid-cols-2 lg:gap-8 lg:pb-24 lg:pt-16">
        <div className="max-w-xl">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-brand">
            <Sparkles className="h-3.5 w-3.5" />{t('market.heroEyebrow')}
          </motion.p>
          <h1 className="mt-5 font-display text-[clamp(2.3rem,1.4rem+3.8vw,4.4rem)] font-bold leading-[1.04]">
            {titleLines.map((l, i) => (
              <motion.span key={i} className="block" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                {i === titleLines.length - 1 ? <span className="text-brand">{l}</span> : l}
              </motion.span>
            ))}
          </h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-5 text-[17px] leading-relaxed text-muted">{t('market.heroBody')}</motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }} className="mt-7"><MarketSearchBar /></motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" href="#stores" iconEnd={ArrowRight}>{t('market.exploreStores')}</Button>
            <Button size="lg" variant="outline" to="/join">{t('market.openStore')}</Button>
          </motion.div>
          <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
            {[[formatNumber(base?.stats.stores || 0, lang), t('market.stat.stores')], [formatNumber(base?.stats.products || 0, lang), t('market.stat.products')], [t('market.stat.deliveryValue'), t('market.stat.delivery')]].map(([v, l]) => (
              <div key={l}><dt className="sr-only">{l}</dt><dd className="font-display text-2xl font-bold sm:text-3xl">{base ? v : <Skeleton className="h-7 w-12" />}</dd><dd className="mt-1 text-xs leading-snug text-muted sm:text-sm">{l}</dd></div>
            ))}
          </motion.dl>
        </div>
        <HeroCollage stores={featured.length >= 3 ? featured : base?.stores || []} />
      </section>

      <div className="container"><Why /></div>

      {/* featured */}
      <section className="container mt-20">
        <div className="mb-8 flex items-end justify-between"><h2 className="font-display text-display-sm font-bold">{t('market.featuredStores')}</h2></div>
        <div className="grid gap-5 md:grid-cols-2 lg:gap-6">
          {!base ? [0, 1].map((i) => <StoreCardSkeleton key={i} large />) : featured.slice(0, 2).map((s, i) => <StoreCard key={s.id} store={s} index={i} large />)}
        </div>
      </section>

      {/* trending products across stores */}
      <section className="container mt-20">
        <h2 className="mb-8 font-display text-display-sm font-bold">{t('market.trending')}</h2>
        <div className="scroll-x -mx-4 gap-3 px-4 pb-2 sm:gap-5">
          {!base ? Array.from({ length: 5 }, (_, i) => <div key={i} className="w-[46%] shrink-0 sm:w-[30%] lg:w-[22%] xl:w-[18%]"><ProductCardSkeleton /></div>) :
            base.trending.map((p, i) => (
              <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22%] xl:w-[18%]">
                <ProductCard product={p} slug={p.store.slug} index={i} showStore />
              </div>
            ))}
        </div>
      </section>

      {/* all stores with filters */}
      <section id="stores" className="container mt-20 scroll-mt-20">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="font-display text-display-sm font-bold">{t('market.allStores')}</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('market.searchStores')} aria-label={t('market.searchStores')}
                className="h-11 w-full rounded-xl border border-line-strong bg-elevated ps-10 pe-3 text-base outline-none transition focus:border-ring focus:shadow-ring" />
            </div>
            <Select size="sm" value={sort} onChange={(e) => setSort(e.target.value)} className="sm:w-48 [&_select]:h-11" aria-label={t('common.sort')}>
              {['featured', 'rating', 'newest', 'products'].map((s) => <option key={s} value={s}>{t(`market.sort.${s}`)}</option>)}
            </Select>
          </div>
        </div>
        <div className="scroll-x -mx-4 mb-8 gap-2 px-4" role="tablist" aria-label={t('settings.category')}>
          {cats.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
              className={cx('h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition', category === c ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>
              {c === 'all' ? t('cat.all') : deptLabel(c)}
            </button>
          ))}
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <StoreCardSkeleton key={i} />)}</div>
        ) : data?.stores.length ? (
          <div className={cx('grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 lg:gap-6', loading && 'opacity-60')}>
            {data.stores.map((s, i) => <StoreCard key={s.id} store={s} index={i} />)}
          </div>
        ) : (
          <EmptyState icon={Store} title={t('market.noStores')} body={t('market.noStoresBody')} action={<Button variant="outline" onClick={() => { setTerm(''); setCategory('all'); }}>{t('common.clearAll')}</Button>} />
        )}
      </section>

      {/* owner CTA */}
      <section className="container mt-24">
        <div className="relative overflow-hidden rounded-[32px] bg-[#111111] px-6 py-12 text-white sm:px-12 sm:py-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-[#FF5A1F]/20 blur-3xl" />
          <div className="relative">
            <h2 className="font-display text-display-sm font-bold text-white">{t('market.ownerTitle')}</h2>
            <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-white/75">{t('market.ownerBody')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="white" to="/join">{t('market.openStore')}</Button>
              <Button size="lg" to="/login?demo=1" className="!border-white/25 !bg-transparent !text-white hover:!bg-white/10" variant="outline">{t('market.ownerDemo')}</Button>
            </div>
          </div>
          <ul className="relative mt-10 grid gap-3 sm:grid-cols-2 lg:mt-0">
            {[[Palette, t('auth.side1')], [Smartphone, t('auth.side2')], [BarChart3, t('auth.side3')], [Banknote, t('store.cod')]].map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#FF8A5C]"><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-medium text-white/90">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="container mt-20 flex flex-col items-center justify-between gap-4 border-t border-line py-10 text-sm text-muted sm:flex-row">
        <Brand />
        <p>© {new Date().getFullYear()} {t('market.footer')}</p>
      </footer>
    </div>
  );
}
