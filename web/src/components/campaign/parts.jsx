import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { look } from '../../lib/campaignTheme.js';
import { useCountdown } from '../../lib/campaigns.js';

const two = new Intl.NumberFormat('ar-EG', { minimumIntegerDigits: 2, useGrouping: false });
const one = new Intl.NumberFormat('ar-EG', { useGrouping: false });
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const CSS = `
@keyframes twTruck{0%{transform:translateX(-170px)}100%{transform:translateX(calc(100cqw + 40px))}}
@keyframes twRoad{to{background-position:-48px 0}}
@keyframes twSpin{to{transform:rotate(360deg)}}
@keyframes twBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes twSpeed{0%{opacity:0;transform:translateX(18px) scaleX(.4)}40%{opacity:.8}100%{opacity:0;transform:translateX(-26px) scaleX(1)}}
@keyframes twPulse{0%,100%{transform:scale(1) rotate(-4deg)}50%{transform:scale(1.07) rotate(-4deg)}}
@keyframes twShine{0%{transform:translateX(-120%) skewX(-18deg)}60%,100%{transform:translateX(320%) skewX(-18deg)}}
@keyframes twFloat{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-10px) rotate(6deg)}}
@keyframes twFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.tw-anim,.tw-anim *{animation:none !important}}
`;
let cssIn = false;
function useCss() {
  useEffect(() => {
    if (cssIn || document.getElementById('tw-camp-css')) { cssIn = true; return; }
    const s = document.createElement('style'); s.id = 'tw-camp-css'; s.textContent = CSS; document.head.appendChild(s); cssIn = true;
  }, []);
}

/** Light falling shapes. `contained` = fill the parent (admin preview) instead of the whole screen. Off for reduced-motion, hidden tabs. */
export function FallCanvas({ c, contained = false }) {
  const ref = useRef(null);
  const l = look(c);
  const glyphKey = l.glyphs.join('|');
  useEffect(() => {
    const cv = ref.current;
    if (!cv || reduced() || !l.count) return undefined;
    const ctx = cv.getContext('2d');
    let w = 0; let h = 0; let raf = 0; let last = performance.now(); let parts = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const make = (top) => ({
      x: Math.random() * w, y: top ? -30 - Math.random() * 60 : Math.random() * h,
      s: 16 + Math.random() * 14, vy: (24 + Math.random() * 34) * l.speed, amp: 8 + Math.random() * 18, ph: Math.random() * 6.28, fr: 0.5 + Math.random() * 0.9,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.2, g: l.glyphs[Math.floor(Math.random() * l.glyphs.length)], a: 0.4 + Math.random() * 0.4,
      col: Math.random() < 0.55 ? l.c2 : l.c1, // the site is light: never white shapes (they would vanish)
    });
    const size = () => {
      const r = cv.getBoundingClientRect();
      if (parts.length && Math.abs(r.width - w) < 2 && Math.abs(r.height - h) < 2) return; // page content growing must not reshuffle the falling shapes
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(l.count * (w < 640 ? 0.6 : 1));
      parts = Array.from({ length: n }, () => make(false));
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(contained ? cv.parentElement : document.documentElement);
    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = t; return; }
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.y += p.vy * dt; p.ph += p.fr * dt; p.r += p.vr * dt;
        if (p.y > h + 30) parts[i] = make(true);
        const x = p.x + Math.sin(p.ph) * p.amp;
        ctx.save(); ctx.translate(x, p.y); ctx.rotate(Math.sin(p.r) * 0.5); ctx.globalAlpha = p.col === l.c1 ? p.a * 0.6 : p.a;
        ctx.font = `${p.s}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif`;
        ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = p.col; ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 2;
        ctx.fillText(p.g, 0, 0); ctx.restore();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyphKey, l.c2, l.count, l.speed, contained]);
  if (reduced() || !l.count) return null;
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none" style={{ position: contained ? 'absolute' : 'fixed', inset: 0, width: '100%', height: '100%', zIndex: contained ? 1 : 60 }} />;
}

function Cells({ end, offset, size = 'lg' }) {
  const t = useCountdown(end, offset);
  const cells = [t.d > 0 && [t.d, 'يوم'], [t.h, 'ساعة'], [t.m, 'دقيقة'], [t.s, 'ثانية']].filter(Boolean);
  const big = size === 'lg';
  return (
    <div className="flex items-stretch gap-1.5 sm:gap-2" dir="rtl" aria-label="الوقت المتبقي">
      {cells.map(([n, label]) => (
        <div key={label} className={`rounded-xl text-center backdrop-blur ${big ? 'min-w-[46px] px-1.5 py-1 sm:min-w-[64px] sm:px-3 sm:py-2' : 'min-w-[44px] px-1.5 py-1'}`} style={{ background: 'rgba(255,255,255,.14)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22)' }}>
          <div className={`font-display font-black tabular-nums leading-none ${big ? 'text-xl sm:text-3xl' : 'text-lg'}`} dir="ltr">{two.format(n)}</div>
          <div className={`mt-0.5 opacity-80 sm:mt-1 ${big ? 'text-[10px] sm:text-[11px]' : 'text-[10px]'}`}>{label}</div>
        </div>
      ))}
    </div>
  );
}

const startText = (ms) => { try { return new Date(ms).toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

const text = (c) => {
  const ship = c.kind === 'shipping';
  const head = c.headline || (ship ? 'الشحن علينا' : look(c).emoji && (c.name || 'تخفيضات'));
  if (c.phase === 'soon') return { head, sub: `هيبدأ ${startText(c.startsAt)} — جهّز سلتك من دلوقتي` };
  const sub = c.sub || (ship ? `شحن مجاني على طلباتك${c.min ? ` من ${one.format(c.min)} جنيه` : ''}` : c.percent ? `خصم ${one.format(c.percent)}% على كل المنتجات` : 'خصومات على كل المنتجات');
  return { head, sub };
};

function Truck() {
  return (
    <svg viewBox="0 0 132 64" aria-hidden="true" className="h-[44px] w-[90px] sm:h-[64px] sm:w-[132px]" style={{ animation: 'twBob .5s ease-in-out infinite' }}>
      <rect x="2" y="8" width="82" height="40" rx="6" fill="#fff" />
      <rect x="2" y="8" width="82" height="40" rx="6" fill="none" stroke="rgba(0,0,0,.12)" />
      <path d="M86 20h22l16 16v12H86z" fill="#fff" stroke="rgba(0,0,0,.12)" />
      <path d="M94 24h12l10 10H94z" fill="#9BD4FF" />
      <text x="43" y="34" textAnchor="middle" fontSize="15" fontWeight="900" fill="#111" fontFamily="system-ui,sans-serif">Twist</text>
      {[28, 100].map((cx) => (
        <g key={cx} transform={`translate(${cx} 52)`}><g style={{ animation: 'twSpin .5s linear infinite', transformOrigin: '0 0' }}><circle r="9" fill="#222" /><circle r="3.5" fill="#bbb" /><rect x="-1" y="-8" width="2" height="16" fill="#555" /></g></g>
      ))}
    </svg>
  );
}

/** Big animated banner. `preview` = rendered inside the admin (no router link, no fixed positioning). */
export function HeroBanner({ c, offset = 0, preview = false }) {
  useCss();
  const l = look(c);
  const ship = c.kind === 'shipping';
  const { head, sub } = text(c);
  const soon = c.phase === 'soon'; // announced, not started yet: countdown to the START, no shopping button
  const grad = `linear-gradient(to left, ${l.c1} 0%, ${l.c1} 58%, color-mix(in srgb, ${l.c2} 38%, ${l.c1}) 100%)`; // text side stays solid → always readable
  const Cta = preview ? 'span' : Link;
  return (
    <section className="tw-anim relative flex flex-1 flex-col justify-center overflow-hidden rounded-3xl text-white" style={{ background: grad, containerType: 'inline-size', boxShadow: '0 18px 50px -20px rgba(0,0,0,.45)' }}>
      <div aria-hidden="true" className="absolute -top-24 -end-16 h-64 w-64 rounded-full blur-3xl" style={{ background: l.c2, opacity: 0.28 }} />
      <div aria-hidden="true" className="absolute -bottom-28 -start-20 h-64 w-64 rounded-full blur-3xl" style={{ background: l.c2, opacity: 0.16 }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-0 w-1/4" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent)', animation: 'twShine 6s ease-in-out infinite' }} />
      {l.glyphs.filter((g) => !/[\d%٪]/.test(g)).slice(0, 4).map((g, i) => (
        <span key={i} aria-hidden="true" className="absolute select-none text-2xl opacity-40 sm:text-3xl sm:opacity-60" style={{ top: `${14 + (i * 23) % 60}%`, insetInlineEnd: `${6 + i * 11}%`, animation: `twFloat ${4 + i}s ease-in-out ${i * 0.4}s infinite` }}>{g}</span>
      ))}
      <div className="relative z-10 flex flex-col gap-2.5 px-4 pb-4 pt-4 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 sm:px-10 sm:py-9">
        {!ship && (
          <div aria-hidden="true" className="absolute start-3 top-3 grid h-[66px] w-[66px] place-items-center rounded-full font-display font-black sm:hidden" style={{ background: l.c2, color: '#111', animation: 'twPulse 2.6s ease-in-out infinite', boxShadow: `0 0 0 4px ${l.c2}33, 0 0 0 9px ${l.c2}1a` }}>
            <span className="text-center leading-none"><span className="block text-[9px] font-bold opacity-70">خصم حتى</span><span className="text-[22px]" dir="ltr">{c.percent ? `${one.format(c.percent)}%` : '٪'}</span></span>
          </div>
        )}
        <div className={!ship ? 'ps-[78px] sm:ps-0' : ''}>
          <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold sm:px-3 sm:py-1 sm:text-xs" style={{ background: l.c2, color: '#111' }}>{soon ? '⏳ قريباً' : <>{l.emoji} {ship ? 'شحن مجاني' : 'عرض لفترة محدودة'}</>}</div>
          <h2 className="mt-2 font-display text-[26px] font-black leading-tight sm:mt-3 sm:text-5xl">{head}</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-snug opacity-90 sm:mt-2 sm:text-lg">{sub}</p>
        </div>
        <div className="flex items-center justify-between gap-2 sm:col-start-1 sm:mt-2 sm:justify-start sm:gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold opacity-85 sm:text-xs">{soon ? 'هيبدأ بعد' : 'ينتهي بعد'}</span>
            <Cells end={soon ? c.startsAt : c.endsAt} offset={offset} />
          </div>
          {soon
            ? <span className="shrink-0 rounded-full px-4 py-2 text-[13px] font-black sm:px-5 sm:py-2.5 sm:text-sm" style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.3)' }}>استعد ⏰</span>
            : <Cta {...(preview ? {} : { to: ship ? '/search' : '/search?sale=1' })} className="shrink-0 rounded-full px-4 py-2 text-[13px] font-black shadow-lg transition active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm sm:hover:scale-[1.03]" style={{ background: l.c2, color: '#111' }}>{ship ? 'ابدأ التسوق' : 'تسوق العروض'} ←</Cta>}
        </div>
        {!ship && (
          <div className="hidden sm:absolute sm:end-10 sm:top-1/2 sm:block sm:-translate-y-1/2" aria-hidden="true">
            <div className="grid h-40 w-40 place-items-center rounded-full font-display font-black" style={{ background: l.c2, color: '#111', animation: 'twPulse 2.6s ease-in-out infinite', boxShadow: `0 0 0 8px ${l.c2}33, 0 0 0 18px ${l.c2}1a` }}>
              <span className="text-center leading-none"><span className="block text-xs font-bold opacity-70">خصم حتى</span><span className="text-5xl" dir="ltr">{c.percent ? `${one.format(c.percent)}%` : '٪'}</span></span>
            </div>
          </div>
        )}
      </div>
      {ship && (
        <div aria-hidden="true" dir="ltr" className="relative h-[52px] overflow-hidden sm:h-[78px]">
          <div className="absolute inset-x-0 bottom-0 h-3" style={{ background: 'rgba(0,0,0,.35)' }} />
          <div className="absolute inset-x-0 bottom-[5px] h-[2px]" style={{ backgroundImage: 'linear-gradient(90deg,rgba(255,255,255,.7) 50%,transparent 50%)', backgroundSize: '48px 2px', animation: 'twRoad .6s linear infinite' }} />
          <div className="absolute bottom-3 start-0" style={{ animation: 'twTruck 9s linear infinite' }}>
            {[0, 1, 2].map((i) => (<span key={i} className="absolute top-5 h-[3px] w-10 rounded-full bg-white" style={{ insetInlineStart: -18 - i * 6, top: 14 + i * 12, animation: `twSpeed 1s ease-out ${i * 0.18}s infinite` }} />))}
            <Truck />
          </div>
        </div>
      )}
    </section>
  );
}

/** Thin bar above every page. Rotates between messages when both campaigns run. Can be dismissed (per session). */
export function TopBar({ items, offset = 0, preview = false }) {
  useCss();
  const [i, setI] = useState(0);
  const [gone, setGone] = useState(() => { try { return sessionStorage.getItem('tw.bar.off') === items.map((x) => x.id + (x.phase || '')).join(','); } catch { return false; } });
  useEffect(() => {
    if (items.length < 2) return undefined;
    const id = setInterval(() => setI((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, [items.length]);
  const c = items.length ? items[i % items.length] : null;
  const soon = c?.phase === 'soon';
  const t = useCountdownInline(soon ? c?.startsAt : c?.endsAt, offset); // hook first, before any early return
  if (!c || (gone && !preview)) return null;
  const l = look(c);
  const { head, sub } = text(c);
  return (
    <div role="region" aria-label="عرض" className="tw-anim relative z-[36] text-white" style={{ background: `linear-gradient(to left, ${l.c1}, ${l.c1} 60%, color-mix(in srgb, ${l.c2} 38%, ${l.c1}))` }}>
      <div className="container flex items-center justify-center gap-x-3 gap-y-0.5 py-1.5 text-center text-[12.5px] font-bold sm:text-sm">
        <span key={`${c.id}${c.phase || ''}`} className="flex min-w-0 flex-wrap items-center justify-center gap-x-2" style={{ animation: 'twFade .4s ease' }}>
          <span aria-hidden="true">{l.emoji}</span>
          <span className="truncate">{head}{soon ? ' — قريباً' : ''}</span>
          <span className="hidden font-medium opacity-90 sm:inline">· {sub}</span>
        </span>
        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums" dir="rtl" style={{ background: l.c2, color: '#111' }}>{soon ? 'يبدأ بعد ' : ''}<span dir="ltr" className="inline-block">{t}</span></span>
      </div>
      {!preview && <button type="button" aria-label="إخفاء" onClick={() => { setGone(true); try { sessionStorage.setItem('tw.bar.off', items.map((x) => x.id + (x.phase || '')).join(',')); } catch { /* ignore */ } }} className="absolute end-1 top-1/2 -translate-y-1/2 rounded-full p-1 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

function useCountdownInline(end, offset) {
  const t = useCountdown(end, offset);
  const hms = `${two.format(t.h)}:${two.format(t.m)}:${two.format(t.s)}`;
  return t.d > 0 ? `${one.format(t.d)} ي ${hms}` : hms;
}
