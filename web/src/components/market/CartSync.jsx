import { useEffect, useRef } from 'react';
import { api } from '../../lib/api.js';
import { useBuyer } from '../../lib/buyer.jsx';
import { useMarketCart } from '../../lib/cart.jsx';

/** Tells the server what a signed-in shopper has in the cart (summary only) so a reminder can be sent if the order is never finished. Renders nothing. */
export default function CartSync() {
  const { buyer } = useBuyer() || {};
  const { items } = useMarketCart();
  const sent = useRef(false);
  const sig = JSON.stringify(items.map((l) => [l.productId, l.qty, l.price]));
  useEffect(() => {
    if (!buyer?.id) return undefined;
    if (!items.length && !sent.current) return undefined;
    const id = setTimeout(() => {
      const lines = items.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price, name: typeof l.name === 'object' ? (l.name?.ar || l.name?.en || '') : (l.name || '') }));
      sent.current = lines.length > 0;
      api('/buyer/cart-snapshot', lines.length ? { method: 'PUT', body: { lines } } : { method: 'DELETE' }).catch(() => {});
    }, 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyer?.id, sig]);
  return null;
}
