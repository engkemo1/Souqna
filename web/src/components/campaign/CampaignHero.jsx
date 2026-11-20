import { useEffect, useState } from 'react';
import { useCampaigns } from '../../lib/campaigns.js';
import { look } from '../../lib/campaignTheme.js';
import { HeroBanner } from './parts.jsx';

const EVERY = 6500;

/**
 * One wide horizontal banner at the top of the marketplace home. When both a discount and a free-shipping campaign are live,
 * they take turns (slide + fade), with dots to jump; it pauses while the shopper hovers/touches it. One banner = no motion.
 */
export default function CampaignHero() {
  const { discount, shipping, offset } = useCampaigns();
  const items = [discount, shipping].filter((c) => c && c.showHero);
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const n = items.length;
  useEffect(() => {
    if (n < 2 || hold) return undefined;
    const id = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % n); }, EVERY);
    return () => clearInterval(id);
  }, [n, hold]);
  if (!n) return null;
  const cur = i % n;
  return (
    <div className="container pt-3 sm:pt-4" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onTouchStart={() => setHold(true)} onTouchEnd={() => setTimeout(() => setHold(false), 4000)} onFocusCapture={() => setHold(true)} onBlurCapture={() => setHold(false)}>
      <div className="relative">
        {/* every slide sits in the same grid cell, so the box is as tall as the tallest one and nothing jumps */}
        <div className="grid" style={{ overflow: 'hidden', borderRadius: '1.5rem' }}>
          {items.map((c, k) => {
            const on = k === cur;
            const dir = k < cur ? -1 : 1;
            return (
              <div key={c.id} aria-hidden={!on} inert={on ? undefined : ''} style={{ gridArea: '1 / 1', display: 'flex', opacity: on ? 1 : 0, transform: on ? 'none' : `translateX(${dir * 6}%)`, transition: 'opacity .7s ease, transform .7s cubic-bezier(.22,.8,.3,1)', pointerEvents: on ? 'auto' : 'none' }}>
                <HeroBanner c={c} offset={offset} />
              </div>
            );
          })}
        </div>
        {n > 1 && (
          <div className="absolute bottom-2.5 start-1/2 z-20 flex -translate-x-1/2 gap-1.5 rtl:translate-x-1/2" role="tablist" aria-label="العروض">
            {items.map((c, k) => (
              <button key={c.id} type="button" role="tab" aria-selected={k === cur} aria-label={c.kind === 'shipping' ? 'الشحن المجاني' : 'التخفيضات'} onClick={() => setI(k)} className="h-1.5 rounded-full transition-all" style={{ width: k === cur ? 22 : 7, background: look(items[cur]).c2, opacity: k === cur ? 1 : 0.5 }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
