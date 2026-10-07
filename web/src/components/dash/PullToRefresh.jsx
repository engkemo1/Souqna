import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cx } from '../ui/cx.js';

/** Touch pull-to-refresh for list screens on phones. */
export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef(null);
  const THRESH = 72;

  useEffect(() => {
    const down = (e) => { if (window.scrollY <= 0 && !busy) start.current = e.touches[0].clientY; };
    const move = (e) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy > 0 && window.scrollY <= 0) setPull(Math.min(120, dy * 0.5));
      else setPull(0);
    };
    const up = async () => {
      if (start.current == null) return;
      start.current = null;
      if (pull >= THRESH * 0.75) {
        setBusy(true);
        setPull(56);
        try { await onRefresh(); } finally { setTimeout(() => { setBusy(false); setPull(0); }, 400); }
      } else setPull(0);
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('touchstart', down); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
  }, [pull, busy, onRefresh]);

  return (
    <div>
      <div className="flex justify-center overflow-hidden transition-[height] duration-200 md:hidden" style={{ height: pull }} aria-hidden={!pull}>
        <span className={cx('mt-3 grid h-9 w-9 place-items-center rounded-full bg-elevated shadow-soft ring-1 ring-line', busy && 'animate-spin')} style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)` }}>
          <RefreshCw className="h-4 w-4 text-brand" />
        </span>
      </div>
      {children}
    </div>
  );
}
