import { useEffect, useRef, useState } from 'react';

/** Counts up to `value` with an ease-out curve. Respects reduced motion. */
export default function AnimatedNumber({ value = 0, format = (n) => n, duration = 900 }) {
  const [n, setN] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setN(value); return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - p) ** 4;
      setN(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tabular">{format(n)}</span>;
}
