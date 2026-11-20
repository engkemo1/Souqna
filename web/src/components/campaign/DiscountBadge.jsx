import { useCampaigns } from '../../lib/campaigns.js';
import { look } from '../../lib/campaignTheme.js';

/** "-30%" pill. Red as always — except for products inside a live Twist sale campaign, where it takes the campaign's colours. */
export default function DiscountBadge({ pct, campaign, className = '' }) {
  const { discount } = useCampaigns();
  if (!pct) return null;
  if (campaign && discount) {
    const l = look(discount);
    return <span className={`rounded-full px-2 py-0.5 text-xs font-black tabular-nums shadow-sm ${className}`} style={{ background: l.c2, color: '#111' }} dir="ltr">-{pct}%</span>;
  }
  return <span className={`rounded-full bg-sale px-2 py-0.5 text-xs font-bold text-on-sale tabular ${className}`}>-{pct}%</span>;
}
