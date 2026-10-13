import { Ticket } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';

/** Banha Outfit's promoted coupon (set from the admin), shown above the marketplace. Tap to copy the code. */
export default function PromoBar() {
  const { t, tr, lang } = useI18n();
  const { data } = useApi('/promo');
  const p = data?.promo;
  if (!p) return null;
  const what = p.type === 'percentage' ? t('promo.percent', { v: p.value }) : p.type === 'fixed' ? t('promo.fixed', { v: formatMoney(p.value, lang) }) : t('promo.freeShip');
  const copy = () => { try { navigator.clipboard?.writeText(p.code); } catch { /* ignore */ } };
  return (
    <div className="bg-[#FF5A1F] text-white">
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-[13px] font-semibold sm:text-sm">
        <Ticket className="h-4 w-4" />
        <span>{tr(p.title)} — {what}{p.firstOrderOnly ? ` (${t('promo.firstOrder')})` : ''}{p.minSubtotal ? ` · ${t('promo.min', { v: formatMoney(p.minSubtotal, lang) })}` : ''}</span>
        <button type="button" onClick={copy} className="rounded-full bg-white/20 px-3 py-0.5 font-mono tracking-wide hover:bg-white/30" dir="ltr" title={t('common.copy')}>{p.code}</button>
      </div>
    </div>
  );
}
