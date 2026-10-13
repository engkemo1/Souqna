import { Link, Navigate, useLocation } from 'react-router-dom';
import { Check, PackageSearch, Store } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Button from '../../components/ui/Button.jsx';

export default function MarketOrderSuccess() {
  const { state } = useLocation();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  if (!state?.orders?.length) return <Navigate to="/" replace />;
  return <div className="min-h-dvh"><MarketHeader /><main className="container max-w-2xl py-12 sm:py-20">
    <div className="text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success"><Check className="h-8 w-8" /></span><h1 className="mt-5 font-display text-2xl font-bold">{ar ? `طلبك وصل يا ${state.name || ''}` : `Your order is in, ${state.name || ''}`}</h1><p className="mt-2 text-sm leading-6 text-muted">{ar ? 'قسمنا مشترياتك لطلبات مستقلة عشان كل محل يجهز منتجاته. هتتابعي كل شحنة لوحدها.' : 'Your basket is split into separate store orders so each shop can prepare its items. Track each shipment separately.'}</p></div>
    <div className="mt-8 space-y-3">{state.orders.map((order) => <section key={order.number} className="flex items-center gap-3 rounded-2xl border border-line bg-elevated p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-brand"><Store className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{order.store?.[lang] || order.store?.ar || order.storeSlug}</p><p className="mt-1 text-xs text-muted">{ar ? 'رقم الطلب' : 'Order'}: <bdi dir="ltr">{order.number}</bdi></p></div><div className="text-end"><strong className="text-sm">{formatMoney(order.total, lang)}</strong><Link to={`/track/${order.trackToken}`} className="mt-1 flex items-center justify-end gap-1 text-xs font-semibold text-brand"><PackageSearch className="h-3.5 w-3.5" />{ar ? 'تابعي الشحنة' : 'Track order'}</Link></div></section>)}</div>
    <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center"><Button to="/account" variant="outline">{ar ? 'طلباتي' : 'My orders'}</Button><Button to="/search">{ar ? 'كمّلي تسوق' : 'Continue shopping'}</Button></div>
  </main></div>;
}
