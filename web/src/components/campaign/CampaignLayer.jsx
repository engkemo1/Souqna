import { useCampaigns } from '../../lib/campaigns.js';
import { FallCanvas, TopBar } from './parts.jsx';

const NO_BAR = /^\/(admin|dashboard|pos|cashier|owner|login|auth)(\/|$)/;
const NO_FALL = /^\/(admin|dashboard|pos|cashier|owner|login|auth)(\/|$)|checkout|\/cart(\/|$)|\/track/;

/** Top announcement bar + light falling shapes for the live Twist sale campaigns. Nothing renders when no campaign is live. */
export default function CampaignLayer({ pathname }) {
  const { discount, shipping, offset } = useCampaigns();
  const live = [discount, shipping].filter(Boolean);
  if (!live.length) return null;
  const bar = NO_BAR.test(pathname) ? [] : live.filter((c) => c.showBar);
  const fall = NO_FALL.test(pathname) ? null : live.find((c) => c.showFall && c.density !== 'off');
  return (
    <>
      {bar.length > 0 && <TopBar items={bar} offset={offset} />}
      {fall && <FallCanvas c={fall} />}
    </>
  );
}
