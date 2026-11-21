import { useEffect } from 'react';
import { useCampaigns, refreshCampaigns } from '../../lib/campaigns.js';
import { FallCanvas, TopBar } from './parts.jsx';

const NO_BAR = /^\/(admin|dashboard|pos|cashier|owner|login|auth)(\/|$)/;
const NO_FALL = /^\/(admin|dashboard|pos|cashier|owner|login|auth)(\/|$)|checkout|\/cart(\/|$)|\/track/;

/** Top announcement bar + light falling shapes for the live Twist sale campaigns. Nothing renders when no campaign is live. */
export default function CampaignLayer({ pathname }) {
  const { discount, shipping, soon, offset } = useCampaigns();
  const live = [discount, shipping].filter(Boolean);
  const coming = [soon?.discount, soon?.shipping].filter(Boolean); // announced but not started: top bar + countdown to the start, no falling shapes, no discounts yet
  const startKey = coming.map((c) => c.startsAt).join(',');
  // the moment a countdown-to-start hits zero, re-read the campaigns so it becomes live by itself (second read covers the server's 10 s cache)
  useEffect(() => {
    if (!startKey) return undefined;
    const ms = Math.min(...startKey.split(',').map(Number)) - (Date.now() + offset);
    if (ms > 2_000_000_000) return undefined;
    const t1 = setTimeout(refreshCampaigns, Math.max(1000, ms + 800));
    const t2 = setTimeout(refreshCampaigns, Math.max(1000, ms) + 11_000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [startKey, offset]);
  if (!live.length && !coming.length) return null;
  const bar = NO_BAR.test(pathname) ? [] : [...live, ...coming].filter((c) => c.showBar);
  const fall = NO_FALL.test(pathname) ? null : live.find((c) => c.showFall && c.density !== 'off');
  return (
    <>
      {bar.length > 0 && <TopBar items={bar} offset={offset} />}
      {fall && <FallCanvas c={fall} />}
    </>
  );
}
