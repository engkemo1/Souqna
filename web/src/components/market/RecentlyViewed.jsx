import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { getRecentlyViewed } from '../../lib/recentlyViewed.js';
import ProductRail from './ProductRail.jsx';

/** "Continue where you left off": the products this shopper opened last, newest first. Hidden when there are none. */
export default function RecentlyViewed({ exclude }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  useEffect(() => {
    const ids = getRecentlyViewed().filter((id) => id !== exclude);
    if (!ids.length) return undefined;
    let alive = true;
    api(`/search?ids=${ids.join(',')}`).then((r) => {
      if (!alive) return;
      const byId = new Map((r.items || []).map((p) => [p.id, p]));
      setItems(ids.map((id) => byId.get(id)).filter(Boolean));
    }).catch(() => {});
    return () => { alive = false; };
  }, [exclude]);
  return <ProductRail title={t('market.recentlyViewed')} items={items} />;
}
