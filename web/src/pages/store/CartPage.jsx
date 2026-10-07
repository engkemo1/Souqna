import { useStore } from '../../lib/store.jsx';
import { useCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { CartLines, CartEmpty, CartSummary, FreeShippingMeter } from '../../components/store/CartContents.jsx';
import { TrustStrip } from '../../components/store/StoreChrome.jsx';
import PageTransition from '../../components/PageTransition.jsx';

export default function CartPage() {
  const { store } = useStore();
  const cart = useCart(store.slug);
  const { t } = useI18n();
  return (
    <PageTransition className="container pt-6 sm:pt-10">
      <h1 className="mb-6 font-display text-display-sm font-medium">{t('cart.title')}{cart.count > 0 && <span className="ms-2 align-middle text-base font-normal text-muted">({cart.count})</span>}</h1>
      {!cart.items.length ? <CartEmpty slug={store.slug} /> : (
        <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className="lg:col-span-7">
            <FreeShippingMeter subtotal={cart.subtotal} threshold={store.freeShippingOver} />
            <CartLines slug={store.slug} />
          </div>
          <aside className="mt-6 rounded-3xl border border-line bg-elevated p-5 sm:p-6 lg:sticky lg:top-24 lg:col-span-5 lg:mt-0">
            <h2 className="mb-4 text-lg font-semibold">{t('checkout.review')}</h2>
            <CartSummary slug={store.slug} />
          </aside>
        </div>
      )}
      {cart.items.length > 0 && <TrustStrip className="mt-10" />}
    </PageTransition>
  );
}
