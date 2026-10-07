import Sheet from '../ui/Sheet.jsx';
import { useCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useStore } from '../../lib/store.jsx';
import { CartLines, CartEmpty, CartSummary, FreeShippingMeter } from './CartContents.jsx';

export default function CartDrawer({ slug }) {
  const cart = useCart(slug);
  const { store } = useStore();
  const { t } = useI18n();
  return (
    <Sheet open={cart.isOpen} onClose={cart.close} side="auto" desktop="end" size="md"
      title={`${t('cart.title')}${cart.count ? ` (${cart.count})` : ''}`}
      footer={cart.items.length ? <CartSummary slug={slug} onNavigate={cart.close} /> : null}>
      {cart.items.length ? (
        <div className="pt-4">
          <FreeShippingMeter subtotal={cart.subtotal} threshold={store.freeShippingOver} />
          <CartLines slug={slug} onNavigate={cart.close} />
        </div>
      ) : <CartEmpty slug={slug} onNavigate={cart.close} />}
    </Sheet>
  );
}
