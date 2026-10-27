import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Check, PackageSearch, Store, MessageCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { SALES_WHATSAPP } from '../../config/contact.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Button from '../../components/ui/Button.jsx';

export default function MarketOrderSuccess() {
  const { state } = useLocation();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  if (!state?.orders?.length) return <Navigate to="/" replace />;
  const total = state.orders.reduce((sum, order) => sum + order.total, 0);
  const shipping = state.orders.reduce((sum, order) => sum + (order.shipping || 0), 0);
  const feePending = state.orders.some((order) => order.deliveryFeeStatus === 'pending');

  const numbersText = state.orders.map((o) => `• ${o.store?.[lang] || o.store?.ar || o.storeSlug}: رقم ${o.number} (${formatMoney(o.total, lang)})`).join('\n');
  const waMsg = [
    `طلب جديد من Twist 🛍️`,
    `الاسم: ${state.name || ''}`,
    state.phone ? `الموبايل: ${state.phone}` : null,
    `-----------------------`,
    `تفاصيل الطلبات:\n${numbersText}`,
    `-----------------------`,
    `الإجمالي: ${formatMoney(total, lang)}`,
  ].filter(Boolean).join('\n');
  const waUrl = `https://api.whatsapp.com/send?phone=${SALES_WHATSAPP}&text=${encodeURIComponent(waMsg)}`;

  useEffect(() => {
    if (state?.autoOpenWa && waUrl) {
      const timer = setTimeout(() => {
        window.open(waUrl, '_blank');
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [state?.autoOpenWa, waUrl]);

  return <div className="min-h-dvh"><MarketHeader /><main className="container max-w-2xl py-12 sm:py-20">
    <div className="text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success"><Check className="h-8 w-8" /></span><h1 className="mt-5 font-display text-2xl font-bold">{ar ? `طلبك وصل يا ${state.name || ''}` : `Your order is in, ${state.name || ''}`}</h1><p className="mt-2 text-sm leading-6 text-muted">{ar ? 'كل محل هيجهز منتجاته في طلب مستقل، وTwist هتجمع الطلبات بعد ما تبقى جاهزة وتوصلها لك.' : 'Each store prepares a separate order. Twist collects the orders once they are ready and delivers them to you.'}</p>{feePending && <p className="mx-auto mt-4 max-w-lg rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{ar ? 'رسوم التوصيل لسه مش مؤكدة. بعد تجهيز الطلبات وتحديد المسار، هنبعتلك السعر النهائي للموافقة قبل إرسال المندوب.' : 'Delivery is not priced yet. After the stores prepare your orders and Twist plans the route, we will send the final fee for approval before dispatch.'}</p>}</div>

    {/* WhatsApp confirmation banner */}
    <div className="mt-6 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-4 sm:p-5 text-center">
      <p className="text-base font-bold text-fg">
        {ar ? 'تأكيد واستلام أسرع لطلبك عبر واتساب 💬' : 'Faster confirmation via WhatsApp 💬'}
      </p>
      <p className="mt-1 text-xs sm:text-sm text-muted">
        {ar
          ? 'اضغط هنا لإرسال تفاصيل طلبك لإدارة Twist على واتساب مباشرة لتأكيد الاستلام وبدء التجهيز فوراً.'
          : 'Tap below to send your order details directly to Twist team on WhatsApp for instant confirmation.'}
      </p>
      <a
        href={waUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-white shadow-sm transition hover:bg-[#20ba59] active:scale-[0.99] sm:w-auto sm:px-8"
      >
        <MessageCircle className="h-5 w-5 fill-white text-white" />
        {ar ? 'إرسال تفاصيل الطلب على واتساب' : 'Send order to WhatsApp'}
      </a>
    </div>

    <div className="mt-8 space-y-3">{state.orders.map((order) => <section key={order.number} className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-brand"><Store className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{order.store?.[lang] || order.store?.ar || order.storeSlug}</p><p className="mt-1 text-xs text-muted">{ar ? 'رقم الطلب' : 'Order'}: <bdi dir="ltr">{order.number}</bdi></p></div><div className="text-end"><strong className="text-sm">{formatMoney(order.total, lang)}</strong>{order.shipping > 0 && <p className="mt-1 text-[11px] text-muted">{ar ? 'حصة رسوم توصيل Twist مرة واحدة' : 'Shared Twist delivery fee'}</p>}<Link to={`/track/${order.trackToken}`} className="mt-1 flex items-center justify-end gap-1 text-xs font-semibold text-brand"><PackageSearch className="h-3.5 w-3.5" />{ar ? 'تابعي الشحنة' : 'Track order'}</Link></div></section>)}</div>
    <section className="mt-4 rounded-2xl border border-line bg-elevated p-4">{!feePending && <div className="flex justify-between text-sm"><span className="text-muted">{ar ? 'توصيل Twist (مرة واحدة)' : 'Twist delivery (one fee)'}</span><span>{shipping ? formatMoney(shipping, lang) : (ar ? 'مجاني' : 'Free')}</span></div>}<div className="mt-2 flex justify-between border-t border-line pt-3 font-bold"><span>{feePending ? (ar ? 'قيمة المنتجات حاليًا' : 'Items subtotal so far') : (ar ? 'إجمالي الطلبات' : 'Order total')}</span><span>{formatMoney(total, lang)}{feePending && <span className="ms-1 text-xs font-normal text-muted">+</span>}</span></div><p className="mt-2 text-xs text-muted">{feePending ? (ar ? 'رسوم التوصيل هتتحدد لاحقًا، ومش مطلوب منك دفعها قبل موافقتك.' : 'Delivery will be priced later; you will not be asked to pay before approving it.') : (ar ? 'هتدفع الإجمالي مرة واحدة لمندوب Twist عند الاستلام.' : 'Pay the total once to the Twist courier on delivery.')}</p></section>
    <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center"><Button to="/track" variant="outline">{ar ? 'تتبّع طلبي برقم الموبايل' : 'Track by phone number'}</Button><Button to="/account" variant="outline">{ar ? 'طلباتي' : 'My orders'}</Button><Button to="/search">{ar ? 'كمّلي تسوق' : 'Continue shopping'}</Button></div>
  </main></div>;
}
