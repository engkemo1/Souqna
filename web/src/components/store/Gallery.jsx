import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Expand } from 'lucide-react';
import SmartImage from '../ui/SmartImage.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useCanHover, useLockBody } from '../../lib/hooks.js';
import { pickSrc } from '../../lib/image.js';
import { cx } from '../ui/cx.js';

/** Scroll-snap carousel index tracking that works in both LTR and RTL. */
function useSnapIndex(ref, count) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf;
    const fn = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setIndex(Math.max(0, Math.min(count - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)))));
    };
    el.addEventListener('scroll', fn, { passive: true });
    return () => { el.removeEventListener('scroll', fn); cancelAnimationFrame(raf); };
  }, [ref, count]);
  const scrollTo = useCallback((i, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollTo({ left: (rtl ? -1 : 1) * i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, [ref]);
  return [index, scrollTo];
}

export default function Gallery({ media = [], name, galleryRef }) {
  const { t, isRtl } = useI18n();
  const canHover = useCanHover();
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [zoom, setZoom] = useState(null); // {x,y} percent while hovering
  const trackRef = useRef(null);
  const [mIndex, scrollTo] = useSnapIndex(trackRef, media.length);
  const ratio = media[0] ? `${media[0].w} / ${media[0].h}` : '4 / 5';
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  useEffect(() => { setActive(0); scrollTo(0, false); }, [media, scrollTo]);
  const go = (d) => setActive((i) => (i + d + media.length) % media.length);

  if (!media.length) return <div className="aspect-[4/5] rounded-3xl bg-surface" />;

  return (
    <div ref={galleryRef}>
      {/* ---------- mobile / tablet: native swipe ---------- */}
      <div className="relative -mx-4 sm:mx-0 lg:hidden">
        <div ref={trackRef} className="scroll-x sm:rounded-3xl" aria-label={name}>
          {media.map((m, i) => (
            <button key={m.id} type="button" onClick={() => setLightbox(i)} className="w-full shrink-0 snap-center snap-always" aria-label={`${t('product.zoom')} — ${t('product.image', { n: i + 1, total: media.length })}`}>
              <SmartImage media={m} ratio={ratio} sizes="(min-width:640px) 80vw, 100vw" priority={i === 0} alt={i === 0 ? name : ''} className="bg-surface" />
            </button>
          ))}
        </div>
        {media.length > 1 && (
          <>
            <div dir="ltr" className="pointer-events-none absolute end-4 top-4 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur tabular" aria-live="polite">
              {mIndex + 1} / {media.length}
            </div>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {media.map((m, i) => (
                <button key={m.id} type="button" onClick={() => scrollTo(i)} aria-label={t('product.image', { n: i + 1, total: media.length })}
                  className={cx('h-1.5 rounded-full transition-all duration-300', i === mIndex ? 'w-6 bg-neutral-900' : 'w-1.5 bg-neutral-900/30')} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---------- desktop: thumbnails + hover zoom ---------- */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[76px_1fr] xl:grid-cols-[88px_1fr]">
        <div className="no-scrollbar flex max-h-[calc(100vh-140px)] flex-col gap-3 overflow-y-auto" role="tablist" aria-label={name}>
          {media.map((m, i) => (
            <button key={m.id} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)}
              className={cx('relative overflow-hidden rounded-xl transition duration-200', i === active ? 'ring-2 ring-fg ring-offset-2 ring-offset-canvas' : 'opacity-70 hover:opacity-100')}>
              <SmartImage media={m} ratio={ratio} sizes="96px" />
            </button>
          ))}
        </div>
        <div className="group/main relative">
          <div
            className={cx('relative overflow-hidden rounded-3xl bg-surface', canHover ? 'cursor-zoom-in' : 'cursor-pointer')}
            style={{ aspectRatio: ratio }}
            onMouseMove={(e) => {
              if (!canHover) return;
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
            onClick={() => setLightbox(active)}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div key={media[active].id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <SmartImage media={media[active]} ratio={ratio} sizes="(min-width:1280px) 46vw, 52vw" priority={active === 0} alt={name} className="h-full" />
              </motion.div>
            </AnimatePresence>
            {zoom && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-no-repeat"
                style={{ backgroundImage: `url(${pickSrc(media[active], 1400)})`, backgroundSize: '220%', backgroundPosition: `${zoom.x}% ${zoom.y}%`, backgroundColor: media[active].color }} />
            )}
            <span className="pointer-events-none absolute bottom-4 end-4 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-neutral-900 opacity-0 shadow-sm backdrop-blur transition group-hover/main:opacity-100">
              <Expand className="h-3.5 w-3.5" />{t('product.zoom')}
            </span>
          </div>
          {media.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={t('common.previous')} className="absolute start-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-neutral-900 opacity-0 shadow-soft backdrop-blur transition hover:bg-white group-hover/main:opacity-100 focus-visible:opacity-100"><PrevIcon className="h-5 w-5" /></button>
              <button type="button" onClick={() => go(1)} aria-label={t('common.next')} className="absolute end-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-neutral-900 opacity-0 shadow-soft backdrop-blur transition hover:bg-white group-hover/main:opacity-100 focus-visible:opacity-100"><NextIcon className="h-5 w-5" /></button>
            </>
          )}
        </div>
      </div>

      <Lightbox media={media} name={name} index={lightbox} onClose={(i) => { setLightbox(null); if (typeof i === 'number') { setActive(i); scrollTo(i, false); } }} />
    </div>
  );
}

/* ------------------------------------------------------------------ fullscreen viewer */

function Lightbox({ media, index, onClose, name }) {
  const open = index !== null;
  const { t, isRtl } = useI18n();
  const trackRef = useRef(null);
  const [cur, scrollTo] = useSnapIndex(trackRef, media.length);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  useLockBody(open);

  useEffect(() => { if (open) requestAnimationFrame(() => scrollTo(index, false)); }, [open, index, scrollTo]);
  useEffect(() => { setZoomed(false); }, [cur]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(cur);
      if (e.key === 'ArrowRight') scrollTo(Math.min(media.length - 1, cur + (isRtl ? -1 : 1)));
      if (e.key === 'ArrowLeft') scrollTo(Math.max(0, cur + (isRtl ? 1 : -1)));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, cur, media.length, onClose, scrollTo, isRtl]);

  const toggleZoom = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
    setZoomed((z) => !z);
  };
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex flex-col bg-neutral-950 text-white" role="dialog" aria-modal="true" aria-label={name}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
            <span dir="ltr" className="text-sm font-medium text-white/80 tabular">{cur + 1} / {media.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setZoomed((z) => !z)} aria-label={t('product.zoom')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10">
                {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => onClose(cur)} aria-label={t('common.close')} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10"><X className="h-6 w-6" /></button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <div ref={trackRef} className={cx('scroll-x h-full', zoomed && '!overflow-hidden')}>
              {media.map((m, i) => (
                <div key={m.id} className="relative grid h-full w-full shrink-0 snap-center snap-always place-items-center overflow-hidden px-2 sm:px-16">
                  <motion.img
                    src={pickSrc(m, 1400)}
                    alt={`${name} — ${t('product.image', { n: i + 1, total: media.length })}`}
                    loading={Math.abs(i - (index ?? 0)) <= 1 ? 'eager' : 'lazy'}
                    draggable={false}
                    onDoubleClick={toggleZoom}
                    onClick={(e) => { if (window.matchMedia('(hover: hover)').matches) toggleZoom(e); }}
                    onMouseMove={(e) => {
                      if (!zoomed || i !== cur) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
                    }}
                    drag={zoomed && i === cur && !window.matchMedia('(hover: hover)').matches}
                    dragConstraints={{ left: -200, right: 200, top: -260, bottom: 260 }}
                    animate={{ scale: zoomed && i === cur ? 2.4 : 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                    style={{ transformOrigin: origin }}
                    className={cx('max-h-full max-w-full select-none object-contain', zoomed && i === cur ? 'cursor-zoom-out' : 'cursor-zoom-in')}
                  />
                </div>
              ))}
            </div>
            {media.length > 1 && !zoomed && (
              <>
                <button type="button" disabled={cur === 0} onClick={() => scrollTo(cur - 1)} aria-label={t('common.previous')} className="absolute start-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-30 sm:grid"><PrevIcon className="h-6 w-6" /></button>
                <button type="button" disabled={cur === media.length - 1} onClick={() => scrollTo(cur + 1)} aria-label={t('common.next')} className="absolute end-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-30 sm:grid"><NextIcon className="h-6 w-6" /></button>
              </>
            )}
          </div>
          <div className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 py-4 pb-safe">
            {media.map((m, i) => (
              <button key={m.id} type="button" onClick={() => scrollTo(i)} aria-label={t('product.image', { n: i + 1, total: media.length })}
                className={cx('w-12 shrink-0 overflow-hidden rounded-lg transition sm:w-14', i === cur ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-90')}>
                <SmartImage media={m} ratio={`${m.w} / ${m.h}`} sizes="64px" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
