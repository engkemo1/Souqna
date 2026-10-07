import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Share2, Check, ShoppingBag, ChevronDown, Star, Truck, RefreshCcw, Banknote, PackageX } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useFavorites } from '../../lib/cart.jsx';
import { formatNumber } from '../../lib/format.js';
import Gallery from '../../components/store/Gallery.jsx';
import VariantPicker, { resolveVariant } from '../../components/store/VariantPicker.jsx';
import { useAddToCart } from '../../components/store/useAddToCart.js';
import ProductCard from '../../components/store/ProductCard.jsx';
import QuickAddSheet from '../../components/store/QuickAddSheet.jsx';
import { SectionHeader } from './StoreHome.jsx';
import { Price, QtyStepper } from '../../components/ui/Commerce.jsx';
import Skeleton, { SkeletonText } from '../../components/ui/Skeleton.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Button, { IconButton } from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

function Accordion({ title, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between py-4 text-start text-[15px] font-semibold">
        {title}
        <ChevronDown className={cx('h-5 w-5 transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="pb-5 text-[15px] leading-relaxed text-muted">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddButton({ state, disabled, onClick, label, size = 'lg', className }) {
  const { t } = useI18n();
  return (
    <Button size={size} full disabled={disabled} onClick={onClick} className={cx('overflow-hidden', state === 'done' && '!bg-success !border-success !text-white', className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} className="inline-flex items-center gap-2" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.18 }}>
          {state === 'done' ? <><Check className="h-5 w-5" strokeWidth={2.5} />{t('product.added')}</> : state === 'busy' ? t('product.adding') : <><ShoppingBag className="h-5 w-5" />{label}</>}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

function ProductSkeleton() {
  return (
    <div className="container pt-4 lg:grid lg:grid-cols-12 lg:gap-12 lg:pt-10" aria-busy="true">
      <div className="-mx-4 sm:mx-0 lg:col-span-7"><Skeleton className="aspect-[4/5] w-full rounded-none sm:rounded-3xl" /></div>
      <div className="mt-6 space-y-5 lg:col-span-5 lg:mt-0">
        <Skeleton className="h-8 w-3/4" /><Skeleton className="h-6 w-1/3" />
        <div className="flex gap-2.5 pt-4">{[0, 1, 2].map((i) => <Skeleton key={i} circle className="h-11 w-11" />)}</div>
        <div className="flex gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-14 rounded-xl" />)}</div>
        <Skeleton className="h-[52px] w-full rounded-2xl" />
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}

export default function Product() {
  const { pslug } = useParams();
  const { store } = useStore();
  const { t, tr, lang } = useI18n();
  const { data, error, loading, reload } = useApi(`/stores/${store.slug}/products/${pslug}`);
  const favs = useFavorites(store.slug);
  const toast = useToast();
  const add = useAddToCart(store.slug);
  const p = data?.product;
  const [color, setColor] = useState(null);
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [addState, setAddState] = useState('idle');
  const [quick, setQuick] = useState(null);
  const galleryRef = useRef(null);
  const ctaRef = useRef(null);
  const [ctaVisible, setCtaVisible] = useState(true);

  useEffect(() => {
    if (!p) return;
    const first = p.colors.find((c) => p.variants.some((v) => v.color === c.hex && v.stock > 0)) || p.colors[0];
    setColor(first?.hex || null);
    setSize(p.sizes.length === 1 ? p.sizes[0] : null);
    setQty(1);
    setSizeError(false);
    document.title = `${tr(p.name)} · ${tr(store.name)}`;
  }, [p, tr, store.name]);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setCtaVisible(e.isIntersecting), { rootMargin: '0px 0px -40px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [p]);

  if (error) {
    return error.status === 404
      ? <EmptyState icon={PackageX} title={t('error.notFound')} body={t('error.notFoundBody')} action={<Button to={sp(store.slug, 'shop')}>{t('store.shopAll')}</Button>} />
      : <ErrorState error={error} onRetry={reload} />;
  }
  if (loading && !p) return <ProductSkeleton />;
  if (!p) return null;

  const { variant, available, needsSize } = resolveVariant(p, color, size);
  const soldOut = p.stock === 'out';
  const fav = favs.has(p.id);

  const onAdd = () => {
    if (needsSize) {
      setSizeError(true);
      ctaRef.current?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (available <= 0) return;
    setAddState('busy');
    setTimeout(() => {
      add({ product: p, variant, color, size, qty: Math.min(qty, available), fromEl: galleryRef.current });
      setAddState('done');
      setTimeout(() => setAddState('idle'), 1600);
    }, 280);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: tr(p.name), url });
      else { await navigator.clipboard.writeText(url); toast({ title: t('common.copied') }); }
    } catch { /* cancelled */ }
  };

  const ctaLabel = soldOut || (!needsSize && available <= 0) ? t('product.outOfStock') : t('product.addToCart');
  const ctaDisabled = soldOut || (!needsSize && available <= 0) || addState === 'busy';

  return (
    <PageTransition key={p.id}>
      <nav aria-label="Breadcrumb" className="container hidden pt-8 text-sm text-muted lg:block">
        <ol className="flex items-center gap-2">
          <li><Link to={sp(store.slug)} className="hover:text-fg">{t('store.home')}</Link></li>
          <li aria-hidden="true">/</li>
          {p.category && <><li><Link to={sp(store.slug, `shop?category=${p.category.slug}`)} className="hover:text-fg">{tr(p.category.name)}</Link></li><li aria-hidden="true">/</li></>}
          <li className="truncate text-fg" aria-current="page">{tr(p.name)}</li>
        </ol>
      </nav>

      <div className="container pt-0 sm:pt-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-10 lg:pt-6 xl:gap-16">
        <div className="lg:sticky lg:top-24 lg:col-span-7">
          <Gallery media={p.media} name={tr(p.name)} galleryRef={galleryRef} />
        </div>

        <section className="pt-5 sm:pt-8 lg:col-span-5 lg:pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {p.discount > 0 && <span className="rounded-full bg-sale px-2.5 py-0.5 text-xs font-bold text-white">-{p.discount}%</span>}
                {p.isNew && <span className="rounded-full bg-fg px-2.5 py-0.5 text-xs font-semibold text-canvas">{t('product.new')}</span>}
                {p.category && <Link to={sp(store.slug, `shop?category=${p.category.slug}`)} className="text-xs font-medium text-muted hover:text-fg">{tr(p.category.name)}</Link>}
              </div>
              <h1 className="font-display text-[1.65rem] font-medium leading-tight sm:text-3xl xl:text-[2.1rem]">{tr(p.name)}</h1>
              <div className="mt-2.5 flex items-center gap-1.5 text-sm">
                <span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cx('h-4 w-4', i <= Math.round(p.rating) ? 'fill-amber-400 text-amber-400' : 'text-line-strong')} />)}</span>
                <span className="font-semibold">{p.rating}</span>
                <span className="text-muted">· {t('product.reviews', { n: formatNumber(p.ratingCount, lang) })}</span>
              </div>
            </div>
            <div className="-me-2 flex shrink-0">
              <IconButton label={t('common.share')} icon={Share2} onClick={share} />
              <IconButton label={fav ? t('product.removeFavorite') : t('product.addFavorite')} icon={Heart} aria-pressed={fav}
                iconClass={cx(fav && 'fill-sale text-sale animate-pop')} onClick={() => { const added = favs.toggle(p.id); toast({ title: added ? t('fav.added') : t('fav.removed'), tone: 'info', icon: Heart, duration: 1800 }); }} />
            </div>
          </div>

          <Price value={p.price} compareAt={p.compareAt} size="xl" showSave className="mt-5" />

          <div className="mt-7">
            <VariantPicker product={p} color={color} size={size} onColor={(c) => { setColor(c); setSize(p.sizes.length === 1 ? p.sizes[0] : null); }}
              onSize={(s) => { setSize(s); setSizeError(false); }} sizeError={sizeError} />
          </div>

          <AnimatePresence>
            {!needsSize && available > 0 && available <= 5 && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>
                {t('product.onlyLeft', { n: available })}
              </motion.p>
            )}
          </AnimatePresence>

          <div ref={ctaRef} className="mt-7 flex items-center gap-3">
            <QtyStepper value={qty} onChange={setQty} max={Math.max(1, Math.min(20, available || 1))} label={t('product.quantity')} />
            <div className="flex-1"><AddButton state={addState} disabled={ctaDisabled} onClick={onAdd} label={ctaLabel} /></div>
          </div>

          <ul className="mt-7 grid gap-3 rounded-2xl bg-secondary p-4 text-sm text-on-secondary">
            <li className="flex items-center gap-3"><Truck className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />{t('store.delivery')}</li>
            <li className="flex items-center gap-3"><Banknote className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />{t('store.cod')}</li>
            <li className="flex items-center gap-3"><RefreshCcw className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />{t('store.exchange')}</li>
          </ul>

          <div className="mt-6 border-t border-line">
            <Accordion title={t('product.description')} defaultOpen><p className="whitespace-pre-line">{tr(p.description)}</p></Accordion>
            <Accordion title={t('product.details')}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                <dt>{t('product.sku')}</dt><dd className="font-medium text-fg" dir="ltr">{p.sku}</dd>
                {p.category && <><dt>{t('editor.category')}</dt><dd className="font-medium text-fg">{tr(p.category.name)}</dd></>}
                {p.sizes.length > 0 && <><dt>{t('product.size')}</dt><dd className="font-medium text-fg">{p.sizes.join(' · ')}</dd></>}
              </dl>
            </Accordion>
            <Accordion title={t('product.shipping')}><p>{t('product.shippingBody')}</p></Accordion>
          </div>
        </section>
      </div>

      {data.related?.length > 0 && (
        <section className="container mt-16 sm:mt-24">
          <SectionHeader title={t('product.related')} />
          <div className="scroll-x -mx-4 gap-3 px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 sm:overflow-visible sm:px-0 xl:grid-cols-4">
            {data.related.slice(0, 8).map((r, i) => (
              <div key={r.id} className="w-[46%] shrink-0 snap-start sm:w-auto sm:[&:nth-child(n+7)]:hidden xl:[&:nth-child(n+7)]:block">
                <ProductCard product={r} slug={store.slug} onQuickAdd={setQuick} index={i} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* mobile sticky purchase bar */}
      <AnimatePresence>
        {!ctaVisible && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-elevated/95 px-4 pt-3 backdrop-blur-md pb-[calc(12px+var(--safe-b))] lg:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-muted">{tr(p.name)}{size && size !== 'One size' ? ` · ${size}` : ''}</p>
                <Price value={p.price} compareAt={p.compareAt} size="sm" />
              </div>
              <div className="w-[52%] max-w-[240px]"><AddButton size="md" state={addState} disabled={ctaDisabled} onClick={onAdd} label={needsSize ? t('product.selectSize') : ctaLabel} /></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="h-24 lg:hidden" />
      <QuickAddSheet slug={store.slug} product={quick} onClose={() => setQuick(null)} />
    </PageTransition>
  );
}
