import { useState } from 'react';
import { LocateFixed, Route } from 'lucide-react';
import { DeliveryMap, ZONE_COLORS } from '../ui/MapView.jsx';
import { formatMoney } from '../../lib/format.js';

/**
 * Checkout delivery explainer: a map with one coloured pin per pickup zone + the price of each zone,
 * then the multi-zone discount, so the customer sees exactly why the delivery costs what it does.
 */
export default function DeliveryBreakdown({ breakdown, lang }) {
  const ar = lang === 'ar';
  const [dest, setDest] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!breakdown?.zones?.length) return null;
  const { zones, subtotal, percent, discount, total } = breakdown;
  const multi = zones.length > 1;
  const hasCoords = zones.some((z) => z.stores.some((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)));
  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition((p) => { setBusy(false); setDest({ lat: p.coords.latitude, lng: p.coords.longitude }); }, () => setBusy(false), { timeout: 10000 });
  };
  const m = (n) => formatMoney(n, lang);
  return (
    <div className="mt-4 rounded-2xl border border-line bg-fg/[0.02] p-3 sm:p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Route className="h-4 w-4" />{multi ? (ar ? `طلبك من ${zones.length} مناطق — مندوب واحد يلمّهم` : `Your order spans ${zones.length} pickup areas — one courier collects them`) : (ar ? 'استلام الطلب من منطقة واحدة' : 'Pickup from one area')}</p>
      {hasCoords && <>
        <DeliveryMap zones={zones} dest={dest} height={230} destLabel={ar ? 'عنوانك' : 'Your address'} />
        <button type="button" onClick={locate} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"><LocateFixed className="h-3.5 w-3.5" />{busy ? '…' : (ar ? 'اعرض موقعي على الخريطة' : 'Show my location')}</button>
      </>}
      <ul className="mt-3 space-y-2 text-sm">
        {zones.map((z, i) => (
          <li key={z.key} className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }}>{i + 1}</span>
              <span className="min-w-0"><span className="block font-medium">{z.name}</span><span className="block truncate text-xs text-muted">{z.stores.map((s) => (ar ? s.name_ar : s.name_en || s.name_ar)).join(' · ')}</span></span></span>
            <span className="shrink-0 font-semibold">{m(z.fee)}</span>
          </li>
        ))}
      </ul>
      {multi ? (
        <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">{ar ? 'مجموع المناطق' : 'Areas total'}</span><span className={discount > 0 ? 'text-muted line-through' : ''}>{m(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between font-semibold text-emerald-700"><span>{ar ? `خصم لفة واحدة (${percent}%)` : `Single-trip discount (${percent}%)`}</span><span>−{m(discount)}</span></div>}
          <div className="flex justify-between font-bold"><span>{ar ? 'توصيل Twist' : 'Twist delivery'}</span><span>{m(total)}</span></div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">{zones[0].stores.length > 1 ? (ar ? 'المحلات في نفس المنطقة، فبتدفع سعر توصيل واحد.' : 'All shops are in the same area, so you pay one delivery price.') : (ar ? 'توصيل من Twist.' : 'Delivered by Twist.')}</p>
      )}
    </div>
  );
}
