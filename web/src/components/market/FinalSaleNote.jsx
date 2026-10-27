import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';

/** Before the shopper orders: lists the pieces in the basket that cannot be exchanged (unless they arrive with a defect). Silent when there are none. */
export default function FinalSaleNote({ items, className = '' }) {
  const { t, tr } = useI18n();
  const [list, setList] = useState([]);
  const key = (items || []).map((l) => `${l.storeSlug || l.slug}:${l.productId}`).sort().join(',');
  useEffect(() => {
    if (!key) { setList([]); return undefined; }
    let off = false;
    const body = { items: [...new Set(key.split(','))].map((k) => { const [slug, id] = k.split(':'); return { slug, productId: Number(id) }; }) };
    api('/marketplace/final-sale', { method: 'POST', body }).then((r) => { if (!off) setList(r.items || []); }).catch(() => { if (!off) setList([]); });
    return () => { off = true; };
  }, [key]);
  if (!list.length) return null;
  const names = list.slice(0, 3).map((x) => tr(x.name)).join('، ');
  return (
    <p className={'flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 ' + className} role="note">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{t('cart.finalSale', { names })}{list.length > 3 ? ' ' + t('cart.finalSaleMore', { n: list.length - 3 }) : ''}</span>
    </p>
  );
}
