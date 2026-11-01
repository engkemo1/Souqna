import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, SlidersHorizontal } from 'lucide-react';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import { CategoryImage, SubCard, ThumbChip, deptName } from '../../components/market/CategoryCards.jsx';
import ProductCard, { ProductCardSkeleton, ProductGrid } from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { PROFILES } from '@souqna/shared/catalog';
import NotFound from '../NotFound.jsx';

const SITE = typeof window !== 'undefined' ? window.location.origin : '';

/** Title / description / canonical / BreadcrumbList for the current section. Server-rendered too (for crawlers); this keeps client navigation in sync. */
function useSeo({ dept, trail, lang }) {
  useEffect(() => {
    if (!dept) return undefined;
    const name = deptName(dept, lang);
    const title = dept.seo?.title?.[lang] || dept.seo?.title?.ar || `${name} | Twist`;
    const desc = dept.seo?.description?.[lang] || dept.seo?.description?.ar || dept.description?.[lang] || dept.description?.ar || `${name}: ${lang === 'ar' ? 'تسوق من محلات بنها على Twist' : 'shop from Banha stores on Twist'}`;
    const url = `${SITE}/c/${dept.slug}`;
    document.title = title;
    const meta = (sel, make) => { let el = document.head.querySelector(sel); if (!el) { el = make(); document.head.appendChild(el); } return el; };
    meta('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' })).setAttribute('content', desc);
    meta('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' })).setAttribute('href', url);
    const ld = meta('script[data-twist-breadcrumb]', () => { const s = document.createElement('script'); s.type = 'application/ld+json'; s.dataset.twistBreadcrumb = '1'; return s; });
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: lang === 'ar' ? 'الرئيسية' : 'Home', item: `${SITE}/` }, ...trail.map((c) => ({ name: deptName(c, lang), item: `${SITE}/c/${c.slug}` }))].map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: x.item })) });
    return () => { document.head.querySelector('script[data-twist-breadcrumb]')?.remove(); };
  }, [dept, trail, lang]);
}

export default function CategoryPage() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useApi(`/departments/${encodeURIComponent(slug)}`);
  const navigate = useNavigate();
  useEffect(() => { if (data?.canonical && data.canonical !== slug) navigate(`/c/${data.canonical}`, { replace: true }); }, [data?.canonical, slug, navigate]); // an old link lands on the canonical section
  const dept = data?.department;
  const trail = useMemo(() => data?.breadcrumb || [], [data]);
  const children = data?.children || [];
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('relevance');
  const dq = useDebounced(term.trim(), 250);
  const key = new URLSearchParams({ q: dq, department: slug, sort }).toString();
  const prods = useApi(`/search?${key}`);
  const [more, setMore] = useState({ key: '', items: [], page: 1 });
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState(null);
  useSeo({ dept, trail, lang });
  useEffect(() => { window.scrollTo(0, 0); setTerm(''); setSort('relevance'); }, [slug]);

  if (error?.status === 404) return <NotFound />;
  const prof = PROFILES[dept?.profile];
  const ratio = (prof?.ratio || '4/5').replace('/', ' / ');
  const items = [...(prods.data?.items || []), ...(more.key === key ? more.items : [])];
  const page = more.key === key ? more.page : 1;
  const loadMore = async () => {
    setBusy(true);
    try { const r = await api(`/search?${key}&page=${page + 1}`); setMore({ key, items: [...(more.key === key ? more.items : []), ...r.items], page: page + 1 }); } catch { /* ignore */ }
    setBusy(false);
  };
  const medium = children.filter((c) => c.level === 1);
  const compact = children.filter((c) => c.level >= 2);
  const desc = dept?.description?.[lang] || dept?.description?.ar || '';

  return (
    <div className="min-h-dvh bg-[#F6F8FB] text-[#03244D]">
      <MarketHeader />
      <main>
        {error && error.status !== 404 ? <div className="container py-10"><ErrorState error={error} onRetry={reload} /></div> : !dept && loading ? (
          <div className="container py-10"><div className="h-56 animate-pulse rounded-3xl bg-fg/5" /></div>
        ) : dept && (
          <>
            <section className="relative isolate overflow-hidden bg-[#EAF0F8]">
              <div className="absolute inset-0 -z-10"><CategoryImage dept={dept} priority sizes="100vw" className="opacity-90" /></div>
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
              <div className="container flex min-h-[220px] flex-col justify-end py-6 sm:min-h-[300px] sm:py-10">
                <nav aria-label="breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-[13px] text-white/85">
                  <Link to="/" className="hover:underline">{lang === 'ar' ? 'الرئيسية' : 'Home'}</Link>
                  {trail.map((c, i) => (
                    <span key={c.slug} className="inline-flex items-center gap-1"><ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" aria-hidden="true" />
                      {i === trail.length - 1 ? <span aria-current="page" className="font-bold text-white">{deptName(c, lang)}</span> : <Link to={`/c/${c.slug}`} className="hover:underline">{deptName(c, lang)}</Link>}
                    </span>
                  ))}
                </nav>
                <h1 className="font-display text-3xl font-black text-white drop-shadow sm:text-5xl">{deptName(dept, lang)}</h1>
                {desc && <p className="mt-2 max-w-2xl text-sm leading-7 text-white/90 sm:text-base">{desc}</p>}
              </div>
            </section>

            <div className="container py-6 sm:py-8">
              {medium.length > 0 && (
                <section aria-label={lang === 'ar' ? 'الأقسام' : 'Sections'} className="mb-8">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">{medium.map((c) => <SubCard key={c.slug} dept={c} />)}</div>
                </section>
              )}
              {compact.length > 0 && (
                <section aria-label={lang === 'ar' ? 'أنواع' : 'Types'} className="mb-8">
                  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">{compact.map((c) => <div key={c.slug} className="shrink-0"><ThumbChip dept={c} /></div>)}</div>
                </section>
              )}

              <section aria-label={lang === 'ar' ? 'المنتجات' : 'Products'}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                    <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={lang === 'ar' ? `ابحث في ${deptName(dept, lang)}` : `Search in ${deptName(dept, lang)}`} aria-label={t('search.title')} className="h-11 w-full rounded-xl border border-line-strong bg-white ps-10 pe-3 text-base outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10" />
                  </div>
                  <Select size="sm" value={sort} onChange={(e) => setSort(e.target.value)} className="sm:ms-auto sm:w-52 [&_select]:h-11" aria-label={t('common.sort')}>
                    {['relevance', 'best', 'price_asc', 'price_desc', 'newest'].map((s) => <option key={s} value={s}>{t(`search.sort.${s}`)}</option>)}
                  </Select>
                  <Button to={`/search?department=${encodeURIComponent(slug)}`} variant="secondary" icon={SlidersHorizontal}>{lang === 'ar' ? 'فلاتر القسم' : 'Section filters'}</Button>
                </div>
                {prods.loading && !prods.data ? <ProductGrid>{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
                  : items.length ? (
                    <>
                      <ProductGrid density={prof?.grid}>{items.map((p, i) => <ProductCard key={`${p.store.slug}-${p.id}`} product={p} slug={p.store.slug} index={i} showStore ratio={ratio} onQuickAdd={setQuick} />)}</ProductGrid>
                      {items.length < (prods.data?.total || 0) && <div className="mt-6 text-center"><Button variant="secondary" loading={busy} onClick={loadMore}>{t('common.loadMore')}</Button></div>}
                    </>
                  ) : <EmptyState title={lang === 'ar' ? 'مفيش منتجات هنا لسه' : 'No products here yet'} body={lang === 'ar' ? 'جرّب قسم تاني أو ابحث بكلمة مختلفة.' : 'Try another section or a different search.'} />}
              </section>
            </div>
          </>
        )}
      </main>
      <QuickAddSheet slug={quick?.store?.slug} product={quick} marketplace onClose={() => setQuick(null)} />
    </div>
  );
}
