import { useId, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useI18n } from '../../lib/i18n.jsx';
import { MODA_IMG } from './modaImg.js';

const StatesModa = lazy(() => import('./StatesModa.jsx'));

/**
 * Moda's avatar. Default = the bundled 3D portrait: small sizes are a face-crop circle, the big one (`living`) is the animated portrait
 * (real expression frames: blinks and moves her mouth while talking). An image uploaded from the admin replaces it everywhere with a simpler CSS-animated version.
 */
export default function ModaAvatar({ src, size = 48, talking = false, thinking = false, ring = true, tilt = false, living = false, className = '' }) {
  const { assistantName } = useI18n();
  if (!src && living && size >= 120) {
    return (
      <span className={className} style={{ display: 'inline-block', width: size, height: size }}>
        <Suspense fallback={<span style={{ display: 'block', width: size, height: size }} />}>
          <StatesModa size={size} talking={talking} thinking={thinking} label={assistantName} />
        </Suspense>
      </span>
    );
  }
  return <PhotoAvatar src={src || MODA_IMG} crop={!src} size={size} talking={talking} thinking={thinking} ring={ring} tilt={tilt} className={className} label={assistantName} />;
}

/** uploaded 3D render: breathing + sway, 3D tilt that follows the finger/mouse, sound-wave rings while speaking, orbiting dots while thinking */
function PhotoAvatar({ src, crop, size, talking, thinking, ring, tilt, className, label }) {
  const u = useId().replace(/:/g, '');
  const box = useRef(null);
  useEffect(() => {
    if (!tilt || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    const move = (e) => {
      const el = box.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 260)); const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 260));
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { el.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 12}deg)`; });
    };
    const leave = () => { if (box.current) box.current.style.transform = ''; };
    window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerup', leave);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', leave); cancelAnimationFrame(raf); };
  }, [tilt]);
  const dots = [0, 1, 2];
  return (
    <span className={className} style={{ position: 'relative', display: 'inline-block', width: size, height: size, perspective: size * 4 }}>
      <style>{`
        .p${u}-b{animation:pb${u} 3.8s ease-in-out infinite;transform-origin:50% 100%}
        .p${u}-t{animation:pt${u} .5s ease-in-out infinite alternate}
        .p${u}-r{position:absolute;inset:0;border-radius:9999px;border:2px solid #f0743c;opacity:0;animation:pr${u} 1.6s ease-out infinite}
        .p${u}-d{position:absolute;left:50%;top:50%;width:${Math.max(4, size / 16)}px;height:${Math.max(4, size / 16)}px;margin:-${Math.max(2, size / 32)}px;border-radius:9999px;background:#f0743c;animation:po${u} 1.1s linear infinite}
        @keyframes pb${u}{0%,100%{transform:scale(1) rotate(-1.2deg)}50%{transform:scale(1.04) translateY(-2%) rotate(1.2deg)}}
        @keyframes pt${u}{from{transform:translateY(0) scale(1)}to{transform:translateY(-3%) scale(1.05)}}
        @keyframes pr${u}{0%{transform:scale(.92);opacity:.55}100%{transform:scale(1.35);opacity:0}}
        @keyframes po${u}{from{transform:rotate(0) translateX(${size * 0.56}px)}to{transform:rotate(360deg) translateX(${size * 0.56}px)}}
        @media (prefers-reduced-motion: reduce){.p${u}-b,.p${u}-t,.p${u}-r,.p${u}-d{animation:none}}
      `}</style>
      {talking && <><i className={`p${u}-r`} /><i className={`p${u}-r`} style={{ animationDelay: '.55s' }} /></>}
      {thinking && dots.map((i) => <i key={i} className={`p${u}-d`} style={{ animationDelay: `${-i * 0.37}s` }} />)}
      <span ref={box} style={{ display: 'block', width: '100%', height: '100%', transition: 'transform .25s ease-out', transformStyle: 'preserve-3d' }}>
        <span className={talking ? `p${u}-t` : `p${u}-b`} style={{ display: 'block', width: '100%', height: '100%', borderRadius: '9999px', overflow: 'hidden', background: 'radial-gradient(circle at 30% 22%, #ffd9c2, #ffb08a 55%, #f0743c)', boxShadow: ring ? '0 0 0 2px rgba(255,255,255,.75), 0 6px 18px -6px rgba(240,116,60,.55)' : 'none' }}>
          {crop
            ? <span role="img" aria-label={label} style={{ display: 'block', width: '100%', height: '100%', backgroundImage: `url(${src})`, backgroundSize: '215%', backgroundPosition: '55% 34%', backgroundRepeat: 'no-repeat' }} />
            : <img src={src} alt={label} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 12%', transform: 'scale(1.08)' }} />}
        </span>
      </span>
    </span>
  );
}
