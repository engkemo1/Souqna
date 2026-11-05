import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { getRecentlyViewed } from '../../lib/recentlyViewed.js';
import ProductRail from './ProductRail.jsx';

/** "Similar to what you looked at": built from the shopper's recently viewed products. Hidden when there is nothing to base it on. */
export default function SimilarViewed() {
  const { lang } = useI18n();
  const [items, setItems] = useState([]);
  useEffect(() => {
    const ids = getRecentlyViewed().slice(0, 6);
    if (!ids.length) return undefined;
    let alive = true;
    api(`/similar?ids=${ids.join(',')}`).then((r) => { if (alive) setItems(r.items || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return <ProductRail title={lang === 'ar' ? 'يعجبك كمان' : 'You may also like'} items={items} />;
}
