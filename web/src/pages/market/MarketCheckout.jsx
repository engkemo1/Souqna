import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Banknote, Lock, ShoppingBag, Store } from 'lucide-react';
import { GOVERNORATES } from '@souqna/shared';
import { useMarketCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { api } from '../../lib/api.js';
import { useLocalState } from '../../lib/hooks.js';
import { rememberOrder } from '../../lib/recentOrders.js';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const PHONE = /^01[0125][0-9]{8}$/;

export default function MarketCheckout() {
  const cart = useMarketCart();
  const { lang, t } = useI18n();
  const ar = lang === 'ar';
  const navigate = useNavigate();
  const toast = useToast();
  const [saved, setSaved] = useLocalState('souqna.customer', { name: '', phone: '', governorate: 'Qalyubia', city: ar ? 'بنها' : 'Banha', address: '' });
  const [form, setForm] = useState({ ...saved, notes: '' });
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => Object.values(cart.items.reduce((acc, line) => {
    (acc[line.storeSlug] ||= { slug: line.storeSlug, name: line.storeName, items: [] }).items.push(line);
    return acc;
  }, {})), [cart.items]);
  const groupKey = JSON.stringify(groups.map((g) => [g.slug, g.items.map((i) => [i.productId, i.variantId, i.qty])]));

  useEffect(() => {
    let alive = true;
    if (!groups.length) { setQuotes(null); return () => { alive = false; }; }
    setQuotes(null); setError('');
    Promise.all(groups.map(async (group) => {
      const quote = await api(`/stores/${group.slug}/quote`, { method: 'POST', body: { items: group.items.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })) } });
      return [group.slug, quote];
    })).then((rows) => { if (alive) setQuotes(Object.fromEntries(rows)); })
      .catch(() => { if (alive) setError(ar ? 'مش قادرين نراجع الأسعار والتوفر دلوقتي. جرّب تاني.' : 'We could not verify prices and availability. Please try again.'); });
    return () => { alive = false; };
  }, [groupKey, ar]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const quoteRows = groups.map((g) => ({ group: g, quote: quotes?.[g.slug] }));
  const hasErrors = quoteRows.some(({ quote }) => quote?.hasErrors);
  const subtotal = quoteRows.reduce((sum, row) => sum + (row.quote?.subtotal || 0), 0);
  const shipping = quoteRows.reduce((sum, row) => sum + (row.quote?.shipping || 0), 0);
  const total = subtotal + shipping;

  const placeOrder = async (event) => {
    event.preventDefault(); setError('');
    if (form.name.trim().length < 2 || !PHONE.test(form.phone.trim()) || !form.city.trim() || form.address.trim().length < 6) {
      setError(ar ? 'راجع الاسم ورقم الموبايل والمدينة والعنوان، واكتب رقم موبايل مصري صحيح.' : 'Please check your name, Egyptian mobile number, city and address.'); return;
    }
    if (!quotes || hasErrors) { setError(ar ? 'في منتج اتغير توفره أو سعره. راجع السلة وحاول تاني.' : 'An item changed in price or availability. Review your basket and try again.'); return; }
    setBusy(true);
    try {
      const result = await api('/marketplace/orders', { method: 'POST', body: {
        name: form.name.trim(), phone: form.phone.trim(), governorate: form.governorate, city: form.city.trim(), address: form.address.trim(), notes: form.notes.trim(),
        stores: groups.map((g) => ({ slug: g.slug, items: g.items.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })) })),
      } });
      setSaved({ name: form.name, phone: form.phone, governorate: form.governorate, city: form.city, address: form.address });
      for (const order of result.orders) rememberOrder({ number: order.number, token: order.trackToken, store: order.store?.[lang] || order.store?.ar || order.storeSlug });
      cart.clear();
      navigate('/market-order-success', { replace: true, state: { orders: result.orders, name: form.name.split(' ')[0] } });
    } catch (e) {
      setError(e.code === 'cart_changed' ? (ar ? 'في منتج خلص أو اتغيرت كميته. حدّث السلة وحاول تاني.' : 'An item sold out or its stock changed. Update your basket and try again.') : (ar ? 'الطلب ماكملش. راجع البيانات وحاول تاني.' : 'The order could not be completed. Please check your details and try again.'));
      setBusy(false);
    }
  };

  if (!cart.items.length) return <div className="min-h-dvh"><MarketHeader /><main className="container py-16 text-center"><ShoppingBag className="mx-auto h-10 w-10 text-muted" /><p className="mt-3 font-semibold">{ar ? 'سلة طِلّة فاضية' : 'Your marketplace basket is empty'}</p><Button to="/search" className="mt-5">{ar ? 'اكتشف المنتجات' : 'Explore products'}</Button></main></div>;

  return <div className="min-h-dvh"><MarketHeader /><main className="container max-w-6xl py-7 sm:py-10">
    <Link to="/market-cart" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-fg"><ArrowRight className="h-4 w-4" />{ar ? 'الرجوع للسلة' : 'Back to basket'}</Link>
    <h1 className="mb-7 font-display text-2xl font-bold sm:text-3xl">{ar ? 'إتمام طلب من كذا محل' : 'Checkout from multiple stores'}</h1>
    <div className="grid gap-8 lg:grid-cols-12">
      <form onSubmit={placeOrder} className="space-y-7 lg:col-span-7">
        <section className="rounded-3xl border border-line bg-elevated p-5 sm:p-6"><h2 className="mb-5 font-semibold">{ar ? 'بيانات التوصيل' : 'Delivery details'}</h2><div className="grid gap-4 sm:grid-cols-2">
          <Field label={ar ? 'الاسم بالكامل' : 'Full name'}><Input autoComplete="name" value={form.name} onChange={set('name')} required minLength={2} /></Field>
          <Field label={ar ? 'رقم الموبايل' : 'Mobile number'}><Input dir="ltr" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} required placeholder="01xxxxxxxxx" /></Field>
          <Field label={ar ? 'المحافظة' : 'Governorate'}><Select value={form.governorate} onChange={set('governorate')}>{GOVERNORATES.map((g) => <option key={g} value={g}>{t(`gov.${g}`)}</option>)}</Select></Field>
          <Field label={ar ? 'المدينة أو المنطقة' : 'City or area'}><Input autoComplete="address-level2" value={form.city} onChange={set('city')} required /></Field>
          <Field label={ar ? 'العنوان بالتفصيل' : 'Full address'} className="sm:col-span-2"><Textarea rows={2} autoComplete="street-address" value={form.address} onChange={set('address')} required minLength={6} /></Field>
          <Field label={ar ? 'ملاحظات' : 'Notes'} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        </div></section>
        <section className="flex items-center gap-4 rounded-3xl border-2 border-fg bg-elevated p-4"><Banknote className="h-6 w-6 shrink-0" /><span><strong className="block">{ar ? 'الدفع عند الاستلام' : 'Cash on delivery'}</strong><span className="text-sm text-muted">{ar ? 'هتدفعي لكل طلب عند استلام شحنته.' : 'Pay for each store order when its package arrives.'}</span></span></section>
        {error && <p role="alert" className="rounded-xl bg-sale/10 p-3 text-sm text-sale">{error}</p>}
        <Button type="submit" size="lg" full loading={busy} disabled={!quotes || hasErrors}>{ar ? `تأكيد ${groups.length} طلب · ${formatMoney(total, lang)}` : `Confirm ${groups.length} orders · ${formatMoney(total, lang)}`}</Button>
        <p className="flex items-center justify-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" />{ar ? 'كل محل هيستلم طلبه ويديره بشكل منفصل.' : 'Each store receives and manages its own order.'}</p>
      </form>
      <aside className="h-fit rounded-3xl border border-line bg-elevated p-5 sm:p-6 lg:sticky lg:top-24 lg:col-span-5"><h2 className="mb-5 flex items-center gap-2 font-semibold"><ShoppingBag className="h-5 w-5" />{ar ? 'ملخص الطلبات' : 'Order summary'}</h2>
        <div className="space-y-5">{quoteRows.map(({ group, quote }) => <section key={group.slug} className="border-b border-line pb-4 last:border-0"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Store className="h-4 w-4" />{group.name?.[lang] || group.name?.ar || group.slug}</h3><div className="flex justify-between text-sm"><span className="text-muted">{ar ? 'المنتجات' : 'Items'}</span><span>{quote ? formatMoney(quote.subtotal, lang) : '…'}</span></div><div className="mt-1 flex justify-between text-sm"><span className="text-muted">{ar ? 'الشحن' : 'Shipping'}</span><span>{!quote ? '…' : quote.shipping ? formatMoney(quote.shipping, lang) : (ar ? 'مجاني' : 'Free')}</span></div>{group.items.slice(0, 3).map((line) => <div key={line.key} className="mt-3 flex items-center gap-3"><SmartImage media={line.image} ratio="4 / 5" sizes="40px" className="w-10 rounded-lg" /><span className="min-w-0 flex-1 truncate text-xs">{line.name?.[lang] || line.name?.ar || line.name} × {line.qty}</span><span className="text-xs">{formatMoney(line.price * line.qty, lang)}</span></div>)}{quote?.hasErrors && <p className="mt-2 text-xs font-medium text-sale">{ar ? 'في منتج غير متاح أو كميته أكبر من المخزون.' : 'An item is unavailable or exceeds stock.'}</p>}</section>)}</div>
        <div className="mt-4 flex justify-between border-t border-line pt-4 text-lg font-bold"><span>{ar ? 'الإجمالي' : 'Total'}</span><span>{quotes ? formatMoney(total, lang) : '…'}</span></div><p className="mt-2 text-xs leading-5 text-muted">{ar ? 'الشحن بيتحسب منفصل لكل محل. أكواد الخصم الخاصة بالمحلات مش بتتطبق على السلة العامة.' : 'Shipping is calculated per store. Store-specific coupons are not available in the marketplace basket.'}</p>
      </aside>
    </div>
  </main></div>;
}
