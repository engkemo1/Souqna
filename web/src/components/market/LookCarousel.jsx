import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Pause, Play, Plus, RotateCw } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import QuickAddSheet from '../store/QuickAddSheet.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { cx } from '../ui/cx.js';

/* motion — every animation is switched off for visitors who ask for less motion */
const CSS = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes tlk-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
  @keyframes tlk-in { from { opacity: 0; transform: translateY(54px) scale(.94); } to { opacity: 1; transform: none; } }
  @keyframes tlk-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
  @keyframes tlk-breathe { 0%,100% { transform: skewX(-30deg) scaleX(1); } 50% { transform: skewX(-30deg) scaleX(.88); } }
  @keyframes tlk-blob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(44px,-34px) scale(1.18); } }
  @keyframes tlk-slide { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
  @keyframes tlk-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes tlk-sheen { 0%,55% { transform: translateX(-130%) skewX(-20deg); } 100% { transform: translateX(260%) skewX(-20deg); } }
  @keyframes tlk-pop { 0% { transform: scale(.5); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
  .tlk-rise { animation: tlk-rise .8s cubic-bezier(.2,.9,.2,1) both; }
  .tlk-enter { animation: tlk-in .9s cubic-bezier(.2,.9,.2,1) both; }
  .tlk-float { animation: tlk-float 5.5s ease-in-out infinite; }
  .tlk-breathe { animation: tlk-breathe 5.5s ease-in-out infinite; }
  .tlk-blob { animation: tlk-blob 16s ease-in-out infinite; }
  .tlk-slide { animation: tlk-slide .55s cubic-bezier(.2,.9,.2,1) both; }
  .tlk-fill { animation: tlk-fill 4.5s linear both; transform-origin: left; }
  .tlk-sheen { animation: tlk-sheen 4.2s ease-in-out infinite; }
  .tlk-pop { animation: tlk-pop .45s cubic-bezier(.3,1.6,.5,1) both; }
}
`;

const photoOf = (e) => e?.coverImage || e?.images?.[0] || null;
const two = (n) => String(n).padStart(2, '0');

/** Counts a number up/down to its new value (used for the look total). */
function useCountUp(value) {
  const [x, setX] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setX(value); from.current = value; return undefined; }
    const a = from.current; const t0 = performance.now(); let raf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 550); const eased = 1 - (1 - k) ** 3;
      setX(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return x;
}

/**
 * "Try the Look" — a row of models standing on a plain floor, the chosen one in front and sharp, the others smaller and soft.
 * Right column: "In this look" (every piece with its price and a +), "Complete the look" with the total, and "Add full look to bag".
 * Changing the model (tap it, arrows, swipe, ← →, or the timeline) changes the list. Slowly moves on by itself until the visitor touches it.
 */
export default function LookCarousel({ entries, active, onChange, headingAs: Heading = 'h3', visible = 7 }) {
  const { lang, t, tr } = useI18n();
  const ar = lang === 'ar';
  const n = entries.length;
  const [mobile, setMobile] = useState(false);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 639px)'); if (!mq) return undefined;
    const on = () => setMobile(mq.matches); on(); mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const vWanted = Math.max(3, Math.min(7, Math.round(Number(visible)) || 7)); // how many models are on stage at once (3 – 7)
  const v = mobile ? Math.min(vWanted, 3) : vWanted; // on a phone three models keep the section calm and short
  const lo = -Math.floor((v - 1) / 2); const hi = Math.ceil((v - 1) / 2);
  const stepD = Math.min(26, 78 / (v - 1)); const stepM = Math.min(30, 64 / (v - 1));
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(false);
  const [quick, setQuick] = useState(null); // { queue: [product], i }
  const [added, setAdded] = useState([]);
  const start = useRef(null);
  const ring = useRef(null);
  const stage = useRef(null);
  const root = useRef(null);
  const [ready, setReady] = useState(false); // the models walk in the first time the section scrolls into view
  const [shown, setShown] = useState(active); // the list changes a moment after the model, with a quick fade
  const [fade, setFade] = useState(false);
  const [turn, setTurn] = useState(0); // 0 = front, 180 = back (only for looks that have a back photo)
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  useEffect(() => { setTurn(0); }, [active]); // a new model always starts facing front
  const e = entries[shown] || entries[active];
  const go = (to) => onChange(((to % n) + n) % n);
  useEffect(() => {
    if (shown === active) return undefined;
    setFade(true);
    const id = setTimeout(() => { setShown(active); setFade(false); }, 200);
    return () => clearTimeout(id);
  }, [active, shown]);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setReady(true); return undefined; }
    const io = new IntersectionObserver(([en]) => { setInView(en.isIntersecting); if (en.isIntersecting) setReady(true); }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!playing || hover || quick || reduced || n < 2 || !inView) return undefined;
    const id = setTimeout(() => { if (!document.hidden) go(active + 1); else setPlaying(false); }, 4500);
    return () => clearTimeout(id);
  }, [playing, hover, quick, reduced, n, active, inView]); // eslint-disable-line react-hooks/exhaustive-deps

  const picks = (e?.looks || []).map((l) => l.items?.[l.pick || 0]).filter(Boolean);
  const total = Number.isFinite(e?.total) && e.total > 0 ? e.total : picks.reduce((s, p) => s + (p.price || 0), 0);
  const startAdd = (items) => { setPlaying(false); setQuick({ queue: items, i: 0 }); };
  const nextAdd = () => {
    if (!quick) return;
    setAdded((a) => [...new Set([...a, quick.queue[quick.i].id])]);
    if (quick.i + 1 < quick.queue.length) setQuick({ ...quick, i: quick.i + 1 }); else setQuick(null);
  };
  const title = e?.title || e?.occasion || t('lod.title');
  const shownTotal = useCountUp(total);
  const hasBackNow = !!entries[active]?.backImage;
  const flip = () => { setPlaying(false); setTurn((d) => (d > 90 ? 0 : 180)); };
  const touch = () => setPlaying(false); // the visitor took over: stop moving on by itself

  const onKeyDown = (ev) => {
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); touch(); go(active - 1); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); touch(); go(active + 1); }
  };

  return (
    <section ref={root} className="relative isolate overflow-hidden rounded-[28px] border border-line bg-[#f7f6f2] text-[#141414] shadow-[0_18px_55px_-36px_rgba(9,25,20,.35)] lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
      <style>{CSS}</style>
      {/* ───────── the stage ───────── */}
      <div dir="ltr" className="relative min-w-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <span className="tlk-blob absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#ffd9c4]/70 blur-3xl" />
          <span className="tlk-blob absolute -right-12 bottom-0 h-80 w-80 rounded-full bg-[#cfe2ff]/70 blur-3xl" style={{ animationDelay: '-8s' }} />
          <span className="absolute left-1/2 top-[18%] h-[70%] w-[46%] -translate-x-1/2 rounded-full bg-white/70 blur-3xl" />
        </div>
        <div className="pointer-events-none absolute end-4 top-4 z-20 sm:end-8 sm:top-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-[11px] font-semibold tabular-nums text-[#141414] shadow-sm backdrop-blur-md">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping rounded-full bg-[#141414]/50" /><span className="relative h-1.5 w-1.5 rounded-full bg-[#141414]" /></span>
            {two(active + 1)} / {two(n)}
          </span>
        </div>
        <div className="absolute inset-x-0 top-0 z-20 px-4 pt-4 sm:px-8 sm:pt-7">
          <Heading dir={ar ? 'rtl' : 'ltr'} aria-label={ar ? 'جرّب اللوك.' : 'Try the Look.'} className={cx('flex flex-wrap gap-x-[.28em] text-left text-[26px] font-light leading-none tracking-[-0.03em] sm:text-[52px]', ar && 'justify-end')}>
            {(ar ? ['جرّب', 'اللوك.'] : ['Try', 'the', 'Look.']).map((w, i) => <span key={w} aria-hidden="true" className={ready ? 'tlk-rise' : 'opacity-0'} style={{ animationDelay: `${i * 110}ms` }}>{w}</span>)}
          </Heading>
          <p dir={ar ? 'rtl' : 'ltr'} style={{ animationDelay: '380ms' }} className={cx('mt-3 hidden max-w-[34ch] text-left text-[11px] leading-snug text-[#6f6f6a] sm:block sm:text-xs', ready ? 'tlk-rise' : 'opacity-0')}>{ar ? 'اختار موديل، وشوف كل قطعة في اللوك وضيفه كله للسلة.' : 'Pick a model, see every piece in the look and add it all to your bag.'}</p>
        </div>

        <div
          tabIndex={0} role="group" aria-roledescription="carousel" aria-label={ar ? 'اختار اللوك' : 'Pick a look'}
          onKeyDown={onKeyDown}
          onPointerMove={(ev) => {
            if (ev.pointerType !== 'mouse') return;
            const r = ev.currentTarget.getBoundingClientRect();
            stage.current?.style.setProperty('--px', String(Math.max(-1, Math.min(1, (ev.clientX - r.left - r.width / 2) / (r.width / 2))))); // depth shift: far models drift more than near ones
            if (!ring.current) return;
            const onOther = !!ev.target.closest?.('[data-off]:not([data-off="0"])'); // the ring grows over a model you can bring forward
            ring.current.style.opacity = '1';
            ring.current.style.transform = `translate(${ev.clientX - r.left - 22}px, ${ev.clientY - r.top - 22}px) scale(${onOther ? 1.55 : 1})`;
            ring.current.style.background = onOther ? 'rgba(20,20,20,.08)' : 'transparent';
          }}
          onPointerLeave={() => { if (ring.current) ring.current.style.opacity = '0'; stage.current?.style.setProperty('--px', '0'); }}
          onPointerDown={(ev) => { start.current = ev.clientX; }}
          onPointerUp={(ev) => { if (start.current === null) return; const d = ev.clientX - start.current; start.current = null; if (Math.abs(d) > 50) { touch(); go(active + (d < 0 ? 1 : -1)); } }}
          onPointerCancel={() => { start.current = null; }}
          ref={stage}
          style={{ '--step-d': `${stepD}%`, '--step-m': `${stepM}%`, '--w-d': `${Math.min(26, stepD * 1.25)}%`, '--w-m': `${Math.min(34, stepM * 1.3)}%` }}
          className="relative h-[310px] touch-pan-y select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#141414] sm:h-[460px] lg:h-[600px]"
        >
          <span ref={ring} className="pointer-events-none absolute left-0 top-0 z-30 hidden h-11 w-11 rounded-full border border-[#141414]/70 opacity-0 transition-[opacity,background-color] duration-200 sm:block" aria-hidden="true"><span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#141414]" /></span>
          <span className="pointer-events-none absolute bottom-[8%] left-1/2 h-[10%] w-[34%] -translate-x-1/2 rounded-[50%] bg-black/10 blur-2xl" aria-hidden="true" />
          {/* the floor */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26%] bg-gradient-to-b from-transparent to-[#ecebe6]" aria-hidden="true" />
          {entries.map((x, i) => {
            let off = i - active;
            if (off > n / 2) off -= n; else if (off < -n / 2) off += n; // the row loops
            const a = Math.abs(off); const far = off < lo || off > hi;
            const img = photoOf(x);
            const scale = off === 0 ? 1 : a === 1 ? 0.88 : a === 2 ? 0.78 : 0.68;
            const hasBack = off === 0 && !!x.backImage; // only a look with a back photo can be turned
            const turnHandlers = hasBack ? {
              onPointerDown: (ev) => { ev.stopPropagation(); drag.current = { x: ev.clientX, base: turn > 90 ? 180 : 0 }; ev.currentTarget.setPointerCapture?.(ev.pointerId); setDragging(true); setPlaying(false); },
              onPointerMove: (ev) => { if (drag.current) setTurn(Math.max(0, Math.min(180, drag.current.base - (ev.clientX - drag.current.x) * 1.3))); },
              onPointerUp: () => { if (!drag.current) return; drag.current = null; setDragging(false); setTurn((d) => (d > 90 ? 180 : 0)); },
              onPointerCancel: () => { drag.current = null; setDragging(false); setTurn((d) => (d > 90 ? 180 : 0)); },
            } : {};
            return (
              <button
                key={`${x.audience || x.persona || 'look'}-${x.age || ''}-${x.occasion || ''}-${i}`} type="button" tabIndex={-1}
                onClick={() => { if (off !== 0) { touch(); go(i); } }}
                aria-label={x.title || x.occasion || t('lod.title')} aria-current={off === 0 ? 'true' : undefined} aria-hidden={far} data-off={off} {...turnHandlers}
                className={cx('absolute bottom-[17%] h-[64%] w-[var(--w-m)] [--step:var(--step-m)] mix-blend-multiply transition-[transform,filter,opacity,left] duration-[900ms] ease-[cubic-bezier(.22,1.15,.36,1)] motion-reduce:transition-none sm:bottom-[11%] sm:h-[68%] sm:w-[var(--w-d)] sm:[--step:var(--step-d)] lg:h-[70%]', far && 'pointer-events-none', off === 0 ? (hasBack ? 'cursor-grab touch-pan-y active:cursor-grabbing' : 'cursor-default') : 'cursor-pointer')}
                style={{ left: `calc(50% + ${off} * var(--step))`, transform: `translateX(-50%) scale(${scale})`, transformOrigin: '50% 100%', filter: off === 0 ? 'none' : `blur(${a === 1 ? 0.8 : a === 2 ? 1.8 : 2.8}px)`, opacity: far ? 0 : off === 0 ? 1 : a === 1 ? 0.95 : a === 2 ? 0.8 : 0.6, zIndex: 10 - a }}
              >
                <span className="block h-full w-full" style={{ transform: `translateX(calc(var(--px, 0) * ${-14 * (1 + a * 0.55)}px))`, transition: 'transform .5s ease-out' }}>
                  <span className={cx('relative block h-full w-full', ready ? 'tlk-enter' : 'opacity-0')} style={{ animationDelay: `${120 + a * 90}ms` }}>
                    <span className={cx('relative block h-full w-full', off === 0 && 'tlk-float')}>
                      {img && hasBack
                        ? (
                          <span className="block h-full w-full" style={{ perspective: 900 }}>
                            <span className="relative block h-full w-full" style={{ transformStyle: 'preserve-3d', transform: `rotateY(${turn}deg)`, transition: dragging ? 'none' : 'transform .7s cubic-bezier(.22,1.15,.36,1)' }}>
                              <img src={img} alt={turn > 90 ? '' : title} draggable={false} className="absolute inset-0 h-full w-full object-contain object-bottom" style={{ backfaceVisibility: 'hidden' }} />
                              <img src={x.backImage} alt={turn > 90 ? `${title} — ${ar ? 'من الخلف' : 'back view'}` : ''} draggable={false} className="absolute inset-0 h-full w-full object-contain object-bottom" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} />
                            </span>
                          </span>
                        )
                        : img
                        ? <img src={img} alt={off === 0 ? title : ''} draggable={false} loading={a <= 1 ? 'eager' : 'lazy'} className="h-full w-full object-contain object-bottom" />
                        : <span className="grid h-full w-full place-items-center text-6xl font-black text-black/10">{(x.title || x.occasion || '').slice(0, 2)}</span>}
                    </span>
                    {/* soft shadow on the floor, cast to the right like in the reference; drawn over the photo so its white cannot hide it */}
                    <span className={cx('absolute -bottom-2 left-[8%] h-5 w-[110%] rounded-[50%] bg-black/25 blur-md', off === 0 && 'tlk-breathe')} style={{ transform: 'skewX(-30deg)', opacity: off === 0 ? 0.55 : 0.3 }} aria-hidden="true" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* timeline + arrows, bottom of the stage */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 px-4 pb-2 sm:px-8 sm:pb-5">
          <div className="min-w-0 flex-1">
            <p dir="auto" className="mb-2 hidden truncate text-left sm:block text-[11px] font-medium text-[#6f6f6a]"><span className="tabular-nums">{two(active + 1)}</span> — {title}</p>
            <div className="mb-1.5 h-[2px] w-full max-w-[220px] overflow-hidden rounded-full bg-[#141414]/10" aria-hidden="true">
              <span key={`${active}-${playing && !hover && !quick && inView ? 'run' : 'stop'}`} className={cx('block h-full w-full origin-left rounded-full bg-[#141414]', playing && !hover && !quick && inView && !reduced ? 'tlk-fill' : 'scale-x-0')} />
            </div>
            <div className="flex items-end gap-1.5" role="tablist" aria-label={ar ? 'اللوكات' : 'Looks'}>
              {entries.map((x, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={x.title || x.occasion || `${i + 1}`} onClick={() => { touch(); go(i); }} className="group flex h-6 w-3 items-end justify-center">
                  <span className={cx('block w-px transition-all', i === active ? 'h-4 bg-[#141414]' : 'h-2 bg-[#141414]/30 group-hover:bg-[#141414]/60')} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasBackNow && (
              <button type="button" onClick={flip} aria-pressed={turn > 90} className="me-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-black/15 bg-white/80 px-3 text-[12px] font-semibold text-[#141414] shadow-sm backdrop-blur transition hover:bg-white">
                <RotateCw className={cx('h-3.5 w-3.5 transition-transform duration-500', turn > 90 && 'rotate-180')} aria-hidden="true" />
                {turn > 90 ? (ar ? 'من قدام' : 'Front') : (ar ? 'شوف من ورا' : 'See the back')}
              </button>
            )}
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? (ar ? 'وقّف التبديل' : 'Pause') : (ar ? 'شغّل التبديل' : 'Play')} className="grid h-8 w-8 place-items-center text-[#141414] transition hover:opacity-60">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
            <button type="button" onClick={() => { touch(); go(active - 1); }} aria-label={ar ? 'اللوك اللي قبله' : 'Previous look'} className="grid h-8 w-8 place-items-center text-[#141414] transition hover:opacity-60"><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => { touch(); go(active + 1); }} aria-label={ar ? 'اللوك اللي بعده' : 'Next look'} className="grid h-8 w-8 place-items-center text-[#141414] transition hover:opacity-60"><ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* ───────── In this look ───────── */}
      <aside style={{ opacity: fade ? 0 : 1, transition: 'opacity .2s' }} className="flex min-w-0 flex-col border-t border-[#e3e2dc] bg-white lg:border-s lg:border-t-0" aria-live="polite">
        <div className="flex items-baseline justify-between px-4 pb-0 pt-3 sm:px-6 lg:pb-3 lg:pt-5">
          <h4 className="text-[13px] font-semibold">{ar ? 'في اللوك ده' : 'In this look'}</h4>
          <span className="text-[11px] text-[#8b8b86]">{ar ? `${picks.length} قطع` : `${picks.length} ${picks.length === 1 ? 'item' : 'items'}`}</span>
        </div>
        <ul key={shown} className="scrollbar-none flex snap-x gap-3 overflow-x-auto px-4 py-3 lg:block lg:flex-1 lg:snap-none lg:gap-0 lg:divide-y lg:divide-[#ecebe6] lg:overflow-visible lg:border-y lg:border-[#ecebe6] lg:p-0">
          {picks.map((p, idx) => {
            const done = added.includes(p.id);
            return (
              <li key={p.id} className="tlk-slide group/row relative flex w-[128px] shrink-0 snap-start flex-col gap-2 transition-colors lg:w-auto lg:flex-row lg:items-center lg:gap-3.5 lg:px-6 lg:py-3 lg:hover:bg-[#faf9f6]" style={{ animationDelay: `${80 + idx * 90}ms` }}>
                <Link to={`/s/${p.store.slug}/p/${p.slug}`} className="block h-[112px] w-full shrink-0 overflow-hidden rounded-xl bg-[#f3f3f0] lg:h-[68px] lg:w-[68px] transition-transform duration-300 group-hover/row:scale-[1.04]"><SmartImage media={p.image} ratio="1 / 1" className="h-full w-full" sizes="(min-width:1024px) 68px, 128px" /></Link>
                <Link to={`/s/${p.store.slug}/p/${p.slug}`} className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium uppercase tracking-[.12em] text-[#8b8b86] max-lg:hidden">{tr(p.store.name)}</p>
                  <p className="mt-0.5 line-clamp-1 text-[13px] font-medium">{tr(p.name)}</p>
                  <p className="mt-0.5 text-[12px] text-[#4a4a46]">{formatMoney(p.price, lang)}</p>
                </Link>
                <button type="button" onClick={() => startAdd([p])} aria-label={`${ar ? 'أضف' : 'Add'} ${tr(p.name)}`} className={cx('absolute right-1.5 top-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-white/90 shadow-sm backdrop-blur transition lg:static lg:bg-transparent lg:shadow-none', done ? 'border-[#141414] bg-[#141414] text-white' : 'border-[#d9d8d1] text-[#141414] hover:border-[#141414]')}>
                  {done ? <Check key="d" className="tlk-pop h-4 w-4" /> : <Plus className="h-4 w-4 transition-transform duration-300 group-hover/row:rotate-90" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 px-4 pb-4 pt-1 sm:px-6 lg:block lg:pb-5 lg:pt-4">
          <div className="flex items-end justify-between gap-3 max-lg:flex-col max-lg:items-start max-lg:gap-0">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{ar ? 'كمّل اللوك' : 'Complete the look'}</p>
              <p className="mt-0.5 hidden text-[11px] text-[#8b8b86] lg:block">{ar ? `${picks.length} قطع مع بعض` : `All ${picks.length} pieces together`}</p>
            </div>
            <p className="shrink-0 text-[17px] font-semibold tabular-nums">{formatMoney(shownTotal, lang)}</p>
          </div>
          <button type="button" disabled={!picks.length} onClick={() => startAdd(picks)} className="group relative flex h-11 min-w-0 flex-1 items-center justify-between lg:mt-4 lg:h-12 lg:w-full overflow-hidden rounded-[6px] bg-[#141414] px-5 text-[13px] font-medium text-white transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_rgba(0,0,0,.55)] active:translate-y-0 disabled:opacity-40">
            <span className="tlk-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden="true" />
            <span className="relative">{ar ? 'أضف اللوك كله للسلة' : 'Add full look to bag'}</span>
            <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
          </button>
        </div>
      </aside>
      {quick && <QuickAddSheet slug={quick.queue[quick.i].store.slug} product={quick.queue[quick.i]} marketplace step={quick.queue.length > 1 ? `${quick.i + 1}/${quick.queue.length}` : ''} onAdded={nextAdd} onClose={() => setQuick(null)} />}
    </section>
  );
}
