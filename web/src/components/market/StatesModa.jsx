import { useEffect, useRef, useState } from 'react';
import { MODA_IMG } from './modaImg.js';

// pieces cut from Moda's expression sheet and aligned to the main portrait (1254px design space): [file, x, y, w, h]
const P = {
  eyeL: ['eyeL_c', 414, 372, 212, 136],
  eyeR: ['eyeR_c', 626, 324, 204, 144],
  m1: ['m1', 498, 475, 304, 180],
  m2: ['m2', 498, 475, 304, 180],
  m3: ['m3', 498, 475, 304, 180],
  smile: ['smile', 498, 475, 304, 180],
};
const MOUTHS = ['m1', 'm2', 'm3', 'smile', 'm2', 'm1', 'm3'];
const D = 1254;

/** Moda built from real expression frames: blinks, mouth moves while she talks, gentle sway. No WebGL, just stacked images. */
export default function StatesModa({ size = 220, talking = false, thinking = false, src = MODA_IMG }) {
  const [eyes, setEyes] = useState(false);
  const [mouth, setMouth] = useState(null);
  const talkRef = useRef(talking);
  talkRef.current = talking;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let t1; let alive = true;
    const loop = () => {
      t1 = setTimeout(() => {
        if (!alive) return;
        setEyes(true);
        setTimeout(() => { if (alive) setEyes(false); }, 120);
        if (Math.random() < 0.2) setTimeout(() => { if (alive) { setEyes(true); setTimeout(() => alive && setEyes(false), 130); } }, 330);
        loop();
      }, 2200 + Math.random() * 2800);
    };
    loop();
    return () => { alive = false; clearTimeout(t1); };
  }, []);

  useEffect(() => {
    if (!talking) { setMouth(null); return undefined; }
    let i = Math.floor(Math.random() * MOUTHS.length);
    const id = setInterval(() => {
      i = (i + 1 + Math.floor(Math.random() * 3)) % MOUTHS.length;
      setMouth(Math.random() < 0.14 ? null : MOUTHS[i]);
    }, 130);
    return () => clearInterval(id);
  }, [talking]);

  const k = size / D;
  const piece = (key, on, fade = 60) => {
    const [f, x, y, w, h] = P[key];
    return <img key={key} src={`/moda/f_${f}.webp`} alt="" draggable={false} style={{ position: 'absolute', left: x * k, top: y * k, width: w * k, height: h * k, opacity: on ? 1 : 0, transition: `opacity ${fade}ms linear`, pointerEvents: 'none' }} />;
  };
  return (
    <span role="img" aria-label="Moda" style={{ position: 'relative', display: 'inline-block', width: size, height: size, animation: `modaSway${thinking ? 'T' : ''} ${thinking ? 2.4 : 5.2}s ease-in-out infinite`, transformOrigin: '50% 100%' }}>
      <style>{`
        @keyframes modaSway{0%,100%{transform:rotate(-.8deg) scale(1)}50%{transform:rotate(.8deg) scale(1.015) translateY(-.6%)}}
        @keyframes modaSwayT{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(-1deg) translateY(-.6%)}}
        @media (prefers-reduced-motion: reduce){span[role=img]{animation:none!important}}
      `}</style>
      <img src={src} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {['m1', 'm2', 'm3', 'smile'].map((m) => piece(m, mouth === m, 70))}
      {piece('eyeL', eyes)}
      {piece('eyeR', eyes)}
    </span>
  );
}
