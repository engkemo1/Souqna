import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play, ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { srcSet } from '../../lib/image.js';
import Skeleton from '../ui/Skeleton.jsx';
import { cx } from '../ui/cx.js';

const DURATION = 6500;
const ease = [0.22, 1, 0.36, 1];

function BannerPicture({ banner, priority, isRtl }) {
  const d = banner.image;
  const m = banner.mobileImage || d;
  const [loaded, setLoaded] = useState(false);
  const flip = banner.mirrorRtl && isRtl;
  return (
    <div className="absolute inset-0" style={{ backgroundColor: d?.color }}>
      {d?.lqip && <img src={d.lqip} alt="" aria-hidden="true" className={cx('absolute inset-0 h-full w-full scale-110 object-cover blur-2xl transition-opacity duration-700', loaded && 'opacity-0')} />}
      <picture>
        <source media="(max-width: 639px)" type="image/webp" srcSet={srcSet(m, 'webp')} sizes="100vw" />
        <source media="(max-width: 639px)" srcSet={srcSet(m, 'jpg')} sizes="100vw" />
        <source type="image/webp" srcSet={srcSet(d, 'webp')} sizes="100vw" />
        <img
          src={`${d.base}/${d.sizes.at(-1).name}.jpg`}
          srcSet={srcSet(d, 'jpg')}
          sizes="100vw"
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          fetchpriority={priority ? 'high' : undefined}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cx('absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
            'object-[50%_100%] sm:object-[var(--pos)]', loaded ? 'opacity-100' : 'opacity-0', flip && 'sm:-scale-x-100')}
          style={{ '--pos': banner.align === 'center' ? '50% 30%' : '100% 100%' }}
        />
      </picture>
    </div>
  );
}

export default function HeroSlider({ banners, slug }) {
  const { t, tr, isRtl } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const n = banners.length;
  const timer = useRef(null);
  const go = useCallback((i) => setIndex(((i % n) + n) % n), [n]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);
  const running = !paused && !hovering && n > 1;

  useEffect(() => {
    if (!running) return undefined;
    timer.current = setTimeout(next, DURATION);
    return () => clearTimeout(timer.current);
  }, [running, next, index]);

  useEffect(() => {
    const onVis = () => setHovering(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!n) return null;
  const b = banners[index];
  const light = b.tone === 'light'; // light imagery → dark text
  const center = b.align === 'center';
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;
  const link = b.link?.startsWith('/') ? `/s/${slug}${b.link}` : b.link || `/s/${slug}/shop`;
  const hasText = Boolean(tr(b.title) || tr(b.subtitle) || tr(b.cta) || tr(b.eyebrow));

  return (
    <section
      aria-roledescription="carousel"
      aria-label={tr(b.title) || 'banner'}
      className="group/hero relative isolate overflow-hidden bg-surface"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') (isRtl ? prev : next)();
        if (e.key === 'ArrowLeft') (isRtl ? next : prev)();
      }}
    >
      <motion.div
        className="relative aspect-[4/5] w-full touch-pan-y sm:aspect-[16/9] md:aspect-[21/10] lg:aspect-[2400/1000] lg:max-h-[78vh]"
        drag={n > 1 ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={(_, info) => {
          if (Math.abs(info.offset.x) < 60) return;
          const forward = isRtl ? info.offset.x > 0 : info.offset.x < 0;
          forward ? next() : prev();
        }}
      >
        <AnimatePresence initial={false} mode="sync">
          <motion.div key={b.id} className="absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease }}
            aria-roledescription="slide" aria-label={t('store.slide', { n: index + 1 })}>
            <motion.div className="absolute inset-0" initial={{ scale: 1.06 }} animate={{ scale: 1 }} transition={{ duration: 7, ease: 'easeOut' }}>
              <BannerPicture banner={b} priority={index === 0} isRtl={isRtl} />
            </motion.div>
            {!hasText && <Link to={link} className="absolute inset-0 z-[1]" aria-label={t('store.shopAll')} />}
            {!light && hasText && <div className={cx('absolute inset-0', center ? 'bg-gradient-to-t from-black/70 via-black/20 to-black/10' : 'bg-gradient-to-t from-black/65 via-black/10 to-transparent sm:bg-gradient-to-r sm:from-black/60 sm:via-black/20 sm:to-transparent rtl:sm:bg-gradient-to-l')} />}

            <div className={cx('absolute inset-0 flex', !hasText && 'hidden',
              light ? 'items-start pt-10 sm:items-center sm:pt-0' : center ? 'items-end pb-16 sm:pb-20 lg:pb-24' : 'items-end pb-16 sm:items-center sm:pb-0',
              center ? 'justify-center text-center' : 'justify-center text-center sm:justify-start sm:text-start')}>
              <div className={cx('container', !center && 'sm:flex')}>
                <motion.div
                  initial="hidden" animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.25 } } }}
                  className={cx('mx-auto max-w-[22rem] sm:max-w-[min(42%,34rem)]', center ? 'sm:max-w-2xl' : 'sm:mx-0', light ? 'text-neutral-900' : 'text-white')}
                >
                  {tr(b.eyebrow) && (
                    <motion.p variants={item} className={cx('mb-3 text-xs font-semibold tracking-[0.2em] sm:mb-4 sm:text-[13px]', light ? 'text-neutral-600' : 'text-white/85')}>{tr(b.eyebrow)}</motion.p>
                  )}
                  <motion.h2 variants={item} className={cx('font-display font-bold', center ? 'text-display-sm lg:text-[3.25rem] lg:leading-[1.05]' : 'text-display', light ? 'text-neutral-900' : 'text-white')}>{tr(b.title)}</motion.h2>
                  {tr(b.subtitle) && <motion.p variants={item} className={cx('mt-3 text-base leading-relaxed sm:mt-5 sm:text-lg', light ? 'text-neutral-700' : 'text-white/85')}>{tr(b.subtitle)}</motion.p>}
                  {tr(b.cta) && (
                    <motion.div variants={item} className="mt-6 sm:mt-8">
                      <Link to={link} className={cx('group/cta inline-flex h-12 items-center gap-2.5 rounded-full px-7 text-base font-semibold shadow-sm transition active:scale-[.97]',
                        light ? 'bg-neutral-900 text-white hover:bg-neutral-800' : 'bg-white text-neutral-900 hover:bg-white/90')}>
                        {tr(b.cta)}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover/cta:-translate-x-0.5" />
                      </Link>
                    </motion.div>
                  )}
                </motion.div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {n > 1 && (
        <>
          <button type="button" onClick={prev} aria-label={t('common.previous')}
            className="absolute start-5 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-neutral-900 opacity-0 shadow-soft backdrop-blur transition hover:bg-white group-hover/hero:opacity-100 focus-visible:opacity-100 lg:grid">
            <PrevIcon className="h-5 w-5" />
          </button>
          <button type="button" onClick={next} aria-label={t('common.next')}
            className="absolute end-5 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-neutral-900 opacity-0 shadow-soft backdrop-blur transition hover:bg-white group-hover/hero:opacity-100 focus-visible:opacity-100 lg:grid">
            <NextIcon className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3 sm:bottom-6">
            <div className="flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-2 backdrop-blur-md">
              {banners.map((x, i) => (
                <button key={x.id} type="button" onClick={() => go(i)} aria-label={t('store.slide', { n: i + 1 })} aria-current={i === index}
                  className="relative grid h-6 place-items-center px-0.5">
                  <span className={cx('relative block h-1.5 overflow-hidden rounded-full bg-white/45 transition-all duration-500', i === index ? 'w-8' : 'w-1.5')}>
                    {i === index && (
                      <span key={`${index}-${running}`} className="absolute inset-y-0 start-0 rounded-full bg-white"
                        style={{ width: running ? undefined : '100%', animation: running ? `hero-progress ${DURATION}ms linear forwards` : 'none' }} />
                    )}
                  </span>
                </button>
              ))}
              <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? t('store.play') : t('store.pause')} className="ms-1 grid h-6 w-6 place-items-center rounded-full text-white/90 hover:text-white">
                {paused ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
              </button>
            </div>
          </div>
        </>
      )}
      <style>{'@keyframes hero-progress{from{width:0}to{width:100%}}'}</style>
    </section>
  );
}

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } } };

export function HeroSkeleton() {
  return <Skeleton className="aspect-[4/5] w-full rounded-none sm:aspect-[16/9] md:aspect-[21/10] lg:aspect-[2400/1000] lg:max-h-[78vh]" />;
}
