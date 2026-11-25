import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Check, X } from 'lucide-react';
import { look, hypeFor, hypeStage, hasOwnHype, isStack } from '../../lib/campaignTheme.js';

const HYPE_SEED = Math.floor(Math.random() * 1000); // each visit starts on a different line
import { useCountdown } from '../../lib/campaigns.js';

const two = new Intl.NumberFormat('ar-EG', { minimumIntegerDigits: 2, useGrouping: false });
const one = new Intl.NumberFormat('ar-EG', { useGrouping: false });
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.perf === 'low'; } catch { return false; } }; // weak devices (lib/perf.js) skip the falling shapes too

const CSS = `
@keyframes twTruck{0%{transform:translateX(-170px)}100%{transform:translateX(calc(100cqw + 40px))}}
@keyframes twRoad{to{background-position:-48px 0}}
@keyframes twSpin{to{transform:rotate(360deg)}}
@keyframes twBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes twSpeed{0%{opacity:0;transform:translateX(18px) scaleX(.4)}40%{opacity:.8}100%{opacity:0;transform:translateX(-26px) scaleX(1)}}
@keyframes twPulse{0%,100%{transform:scale(1) rotate(-4deg)}50%{transform:scale(1.07) rotate(-4deg)}}
@keyframes twShine{0%{transform:translateX(-120%) skewX(-18deg)}60%,100%{transform:translateX(320%) skewX(-18deg)}}
@keyframes twFloat{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-10px) rotate(6deg)}}
@keyframes twPing{0%{box-shadow:0 0 0 0 var(--ping,rgba(255,255,255,.5))}75%,100%{box-shadow:0 0 0 9px transparent}}
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

function Cells({ end, offset }) {
  const t = useCountdown(end, offset);
  const cells = [t.d > 0 && [t.d, 'يوم'], [t.h, 'ساعة'], [t.m, 'دقيقة'], [t.s, 'ثانية']].filter(Boolean);
  return (
    <div className="flex items-start gap-1 sm:gap-2" dir="rtl" aria-label="الوقت المتبقي">
      {cells.map(([n, label], i) => (
        <Fragment key={label}>
          {i > 0 && <span aria-hidden="true" className="pt-1.5 text-base font-black opacity-35 sm:pt-3 sm:text-2xl">:</span>}
          <div className="min-w-[46px] rounded-xl px-1.5 py-1.5 text-center sm:min-w-[92px] sm:rounded-2xl sm:px-3 sm:py-3.5" style={{ background: 'linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.04))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14), inset 0 1px 0 rgba(255,255,255,.2), 0 12px 26px -14px rgba(0,0,0,.7)' }}>
            <div className="font-display text-xl font-black tabular-nums leading-none sm:text-[44px]" dir="ltr">{two.format(n)}</div>
            <div className="mt-1 text-[10px] font-medium opacity-60 sm:mt-1.5 sm:text-[11px]">{label}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

const startText = (ms) => { try { return new Date(ms).toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }); } catch { return ''; } };

const text = (c) => {
  const ship = c.kind === 'shipping';
  const head = c.headline || (ship ? 'الشحن علينا' : look(c).emoji && (c.name || 'تخفيضات'));
  if (c.phase === 'soon') return { head, sub: `هيبدأ ${startText(c.startsAt)}` };
  const stack = isStack(c);
  const sub = c.sub || (ship ? `شحن مجاني على طلباتك${c.min ? ` من ${one.format(c.min)} جنيه` : ''}` : stack ? (c.percent ? `خصم المحل + ${one.format(c.percent)}% إضافية من تويست` : 'خصم المحل + خصم إضافي من تويست') : c.percent ? `خصم ${one.format(c.percent)}% على كل المنتجات` : 'خصومات على كل المنتجات');
  return { head, sub };
};

/** The round badge. Admin picks: 'all' (X% on ALL products, default) · 'percent' (up to X%) · 'custom' · 'none'. */
const badgeOf = (c) => {
  if (c.kind === 'shipping') return null;
  const b = c.badge || {};
  const mode = b.mode || 'all';
  const pct = c.percent ? `${one.format(c.percent)}%` : '٪';
  if (mode === 'none') return null;
  if (mode === 'custom') return b.title ? { top: b.sub || '', big: b.title, bottom: '', small: b.title.length > 5 } : null;
  if (mode === 'percent') return { top: 'خصم حتى', big: pct, bottom: '' };
  if (isStack(c)) return c.percent ? { top: 'خصم تويست', big: pct, bottom: 'فوق خصم المحل', mTop: 'فوق خصم المحل' } : null; // no % typed in the admin yet = no seal (nothing claims a number); never says «on everything»: it is an extra on top of what the shop already took off
  return { top: 'خصم', big: pct, bottom: 'على كل المنتجات', mTop: 'خصم على الكل' };
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

/** One short hype line that follows the clock: before the start → while running → final hours. */
function Hype({ c, offset }) {
  const soon = c.phase === 'soon';
  const t = useCountdown(soon ? c.startsAt : c.endsAt, offset);
  const stage = hypeStage(soon, t.left, (c.endsAt - t.left) - c.startsAt); // live: now = endsAt − left
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setTurn((x) => x + 1); }, 9000); // the line changes every few seconds while the shopper looks at the banner
    return () => clearInterval(id);
  }, []);
  const line = hypeFor(c, stage, HYPE_SEED + turn);
  if (!line) return null;
  return <p key={`${stage}-${hasOwnHype(c, stage) ? 0 : (HYPE_SEED + turn) % 4}`} className="mt-2 max-w-xl text-[13px] font-extrabold leading-snug sm:mt-3 sm:text-lg" style={{ color: look(c).c2, animation: 'twFade .5s ease' }}>{line}</p>;
}

/** The round seal (gold disc + slowly turning hairline ring). Admin picks what it says (see badgeOf). */
function Seal({ bd, l, gold }) {
  return (
    <div aria-hidden="true" className="relative grid h-[196px] w-[196px] place-items-center">
      <div className="absolute inset-3 rounded-full opacity-50 blur-2xl" style={{ background: l.c2 }} />
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 0deg, ${l.c2}, transparent 38%, ${l.c2}99 66%, transparent)`, WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))', animation: 'twSpin 16s linear infinite' }} />
      <div className="relative grid h-[160px] w-[160px] place-items-center rounded-full font-display font-black" style={{ background: gold, color: '#1b1305', boxShadow: `inset 0 2px 0 rgba(255,255,255,.65), inset 0 -16px 30px rgba(0,0,0,.14), 0 22px 44px -14px ${l.c2}b3` }}>
        <div className="absolute inset-2 rounded-full" style={{ boxShadow: 'inset 0 0 0 1.5px rgba(27,19,5,.14)' }} />
        <span className="relative text-center leading-none">
          {bd.top && <span className="block text-[15px] font-extrabold tracking-[.18em] opacity-75">{bd.top}</span>}
          <span className={`block ${bd.top ? 'mt-1' : ''} ${bd.small ? 'text-[38px] tracking-tight' : 'text-[58px]'}`} dir="ltr">{bd.big}</span>
          {bd.bottom && <span className="mt-2 block text-[12.5px] font-extrabold opacity-85">{bd.bottom}</span>}
        </span>
      </div>
    </div>
  );
}

/** Big banner. `preview` = rendered inside the admin (no router link, no fixed positioning). */
export function HeroBanner({ c, offset = 0, preview = false }) {
  useCss();
  const l = look(c);
  const ship = c.kind === 'shipping';
  const { head, sub } = text(c);
  const bd = l.art ? null : badgeOf(c); // a picture banner already says it — no seal on top of the artwork
  const chips = (c.badge?.chips || []).filter(Boolean).slice(0, 4);
  const soon = c.phase === 'soon'; // announced, not started yet: countdown to the START, no shopping button
  const gold = `linear-gradient(150deg, color-mix(in srgb, ${l.c2} 52%, #fff) 0%, ${l.c2} 50%, color-mix(in srgb, ${l.c2} 80%, #000) 100%)`;
  const bg = `radial-gradient(60% 130% at 9% 50%, ${l.c2}40 0%, transparent 64%), radial-gradient(45% 80% at 100% 0%, ${l.c2}16 0%, transparent 70%), linear-gradient(120deg, color-mix(in srgb, ${l.c1} 90%, #fff) 0%, ${l.c1} 55%, color-mix(in srgb, ${l.c1} 72%, #000) 100%)`;
  const Cta = preview ? 'span' : Link;
  const cta = (extra = '') => (soon
    ? <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold sm:px-5 sm:py-3 sm:text-sm ${extra}`} style={{ background: 'rgba(255,255,255,.09)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22)' }}><Bell className="h-4 w-4" style={{ color: l.c2 }} aria-hidden="true" />استعد</span>
    : <Cta {...(preview ? {} : { to: ship ? '/search' : '/search?sale=1' })} className={`inline-flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pe-1.5 ps-4 text-[13px] font-black transition active:scale-95 sm:ps-6 sm:text-sm sm:hover:brightness-105 ${extra}`} style={{ background: gold, color: '#1b1305', boxShadow: `0 14px 30px -12px ${l.c2}b3` }}>{ship ? 'ابدأ التسوق' : 'تسوق العروض'}<span className="grid h-7 w-7 place-items-center rounded-full bg-[#1b1305] text-white sm:h-8 sm:w-8"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></span></Cta>);
  return (
    <section className="tw-anim relative isolate flex flex-1 flex-col justify-center overflow-hidden rounded-[22px] text-white sm:rounded-[28px]" style={{ background: bg, containerType: 'inline-size', boxShadow: `0 28px 64px -30px ${l.c1}, inset 0 0 0 1px rgba(255,255,255,.08)` }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.1) 1px, transparent 1.3px)', backgroundSize: '22px 22px', WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 50%, transparent 100%)', maskImage: 'linear-gradient(90deg, transparent 0%, #000 50%, transparent 100%)' }} />
      {l.art && (
        <>
          <img aria-hidden="true" alt="" src={l.art} fetchPriority="high" decoding="async" className="pointer-events-none absolute end-0 top-0 h-[84%] w-[84%] object-cover object-left opacity-90 ltr:-scale-x-100 sm:inset-y-0 sm:h-full sm:w-[60%] sm:opacity-100" style={{ WebkitMaskImage: 'linear-gradient(to right, #000 52%, transparent 100%), linear-gradient(to bottom, #000 62%, transparent 100%)', maskImage: 'linear-gradient(to right, #000 52%, transparent 100%), linear-gradient(to bottom, #000 62%, transparent 100%)', WebkitMaskComposite: 'source-in', maskComposite: 'intersect' }} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 sm:hidden" style={{ background: 'linear-gradient(0deg, rgba(8,8,8,.92) 0%, rgba(8,8,8,.5) 38%, transparent 66%), linear-gradient(270deg, rgba(8,8,8,.82) 0%, rgba(8,8,8,.45) 42%, transparent 78%)' }} />
        </>
      )}
      {!l.art && (
        <svg aria-hidden="true" viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full" fill="none">
          <g stroke={l.c2} strokeLinecap="round">
            <circle cx="70" cy="150" r="150" strokeWidth="1.5" opacity=".22" />
            <circle cx="70" cy="150" r="205" strokeWidth="1.5" opacity=".14" />
            <circle cx="70" cy="150" r="260" strokeWidth="1.5" opacity=".08" />
            <path d="M330 -10 L250 310 M370 -10 L290 310 M410 -10 L330 310" strokeWidth="1" opacity=".1" />
          </g>
          <g fill={l.c2} fontFamily="Cairo, sans-serif" fontWeight="900">
            <text x="470" y="120" fontSize="150" opacity=".07" transform="rotate(-12 470 120)">%</text>
            <text x="540" y="290" fontSize="110" opacity=".06" transform="rotate(10 540 290)">٪</text>
            <text x="250" y="60" fontSize="60" opacity=".08">%</text>
          </g>
        </svg>
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${l.c2}aa, transparent)` }} />
      <div className="relative z-10 flex flex-col gap-3.5 px-4 pb-4 pt-4 sm:flex-row sm:items-center sm:gap-14 sm:px-12 sm:py-10">
        {bd && (
          <div aria-hidden="true" className="absolute start-3 top-3 grid h-[64px] w-[64px] place-items-center rounded-full font-display font-black sm:hidden" style={{ background: gold, color: '#1b1305', boxShadow: `inset 0 1.5px 0 rgba(255,255,255,.65), 0 8px 20px -8px ${l.c2}b3, 0 0 0 3px ${l.c2}33` }}>
            <span className="text-center leading-none">{(bd.mTop || bd.top) && <span className="block text-[8px] font-bold opacity-70">{bd.mTop || bd.top}</span>}<span className={bd.small ? 'text-[15px]' : 'text-[22px]'} dir="ltr">{bd.big}</span></span>
          </div>
        )}
        <div className={`min-w-0 sm:max-w-[520px] ${bd ? 'ps-[76px] sm:ps-0' : ''}`}>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold sm:text-xs" style={{ background: 'rgba(255,255,255,.07)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.16)', color: l.c2, '--ping': `${l.c2}99` }}>
            <span className="h-2 w-2 rounded-full" style={{ background: l.c2, animation: 'twPing 1.8s ease-out infinite' }} />
            {soon ? 'قريباً' : ship ? 'شحن مجاني' : 'عرض لفترة محدودة'}
          </span>
          <h2 className="mt-2.5 font-display text-[28px] font-black leading-[1.1] tracking-tight sm:mt-4 sm:text-[56px]" style={{ textShadow: '0 2px 24px rgba(0,0,0,.35)' }}>{head}</h2>
          <p className="mt-1.5 max-w-xl text-[13px] leading-snug text-white/75 sm:mt-3 sm:text-lg">{sub}</p>
          <Hype c={c} offset={offset} />
          {chips.length > 0 && (
            <ul className="mt-5 hidden flex-wrap gap-2 sm:flex">
              {chips.map((x, i) => (<li key={i} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold" style={{ background: 'rgba(255,255,255,.07)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)' }}><Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: l.c2 }} aria-hidden="true" />{x}</li>))}
            </ul>
          )}
          <div className="mt-6 hidden sm:block">{cta()}</div>
        </div>
        <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-start sm:justify-center sm:gap-4">
          <div className="flex flex-col gap-1.5 sm:gap-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold text-white/70 sm:text-xs"><span aria-hidden="true" className="hidden h-px w-6 sm:block" style={{ background: l.c2 }} />{soon ? 'هيبدأ بعد' : 'ينتهي بعد'}</span>
            <Cells end={soon ? c.startsAt : c.endsAt} offset={offset} />
          </div>
          <div className="sm:hidden">{cta()}</div>
        </div>
        {bd && <div className="hidden shrink-0 sm:ms-auto sm:block"><Seal bd={bd} l={l} gold={gold} /></div>}
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
