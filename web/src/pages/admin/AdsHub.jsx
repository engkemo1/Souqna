import { Suspense, lazy, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import Skeleton from '../../components/ui/Skeleton.jsx';

const Campaigns = lazy(() => import('./FeaturedAds.jsx'));
const Advertisers = lazy(() => import('./Advertisers.jsx'));

/**
 * One ads page. The campaign is the ad; "external advertiser" is just a choice inside the campaign form (step 1).
 * Advertiser profiles (logo, page, report) live in the folded section underneath so there is no separate page to hunt for.
 */
export default function AdsHub() {
  const [sp] = useSearchParams();
  const [open, setOpen] = useState(sp.get('tab') === 'advertisers');
  return (
    <div className="space-y-8">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}><Campaigns /></Suspense>
      <section id="advertisers" className="rounded-2xl border border-line bg-elevated">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-start">
          <span><b className="block">المعلنون الخارجيون</b><span className="text-sm text-muted">عملاء مش عندهم محل على تويست. ضيف بياناتهم هنا، وبعدها اختار «معلن خارجي» وانت بتعمل حملة.</span></span>
          <ChevronDown className={`h-5 w-5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="border-t border-line p-4"><Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}><Advertisers /></Suspense></div>}
      </section>
    </div>
  );
}
