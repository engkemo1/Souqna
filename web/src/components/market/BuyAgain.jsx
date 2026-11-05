import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useBuyer } from '../../lib/buyer.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import ProductRail from './ProductRail.jsx';

/** "Buy again": things a signed-in shopper already received and that can still be bought. Hidden when signed out or when there are none. */
export default function BuyAgain() {
  const { lang } = useI18n();
  const { buyer } = useBuyer() || {};
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!buyer?.id) { setItems([]); return undefined; }
    let alive = true;
    api('/buyer/buy-again').then((r) => { if (alive) setItems(r.items || []); }).catch(() => {});
    return () => { alive = false; };
  }, [buyer?.id]);
  if (!items.length) return null;
  return <ProductRail title={lang === 'ar' ? 'اشتريتها قبل كده' : 'Buy it again'} items={items} />;
}
