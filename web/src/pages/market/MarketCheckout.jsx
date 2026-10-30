import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Banknote, Lock, ShoppingBag, Store, MapPin, Tag, X } from 'lucide-react';
import { GOVERNORATES } from '@souqna/shared';
import { useMarketCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { api } from '../../lib/api.js';
import { useLocalState } from '../../lib/hooks.js';
import { rememberOrder } from '../../lib/recentOrders.js';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import FinalSaleNote from '../../components/market/FinalSaleNote.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import DeliveryBreakdown from '../../components/market/DeliveryBreakdown.jsx';
import { loadGifts } from '../../lib/promoClient.js';
import { GiftRows, AppliedOffers } from '../../components/promo/CartOffers.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import PlaceAutocomplete from '../../components/ui/PlaceAutocomplete.jsx';
import { CheckoutLocationPicker, reverseGeocode } from '../../components/ui/MapView.jsx';
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
  const [coords, setCoords] = useState(null);
  const [quotes, setQuotes] = useState(null);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [quoteVersion, setQuoteVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState(null);
  const [codes, setCodes] = useState({});
  const [couponMsg, setCouponMsg] = useState('');
  const [applying, setApplying] = useState(false);
  const groups = useMemo(() => Object.values(cart.items.reduce((acc, line) => {
    (acc[line.storeSlug] ||= { slug: line.storeSlug, name: line.storeName, items: [] }).items.push(line);
    return acc;
  }, {})), [cart.items]);
  const groupKey = JSON.stringify(groups.map((g) => [g.slug, g.items.map((i) => [i.productId, i.variantId, i.qty])]));
  const phoneForQuote = PHONE.test(form.phone.trim()) ? form.phone.trim() : '';
  const couponErrorText = (code, min) => ({
    coupon_invalid: ar ? 'الكود ده مش صحيح.' : 'This code is not valid.',
    coupon_expired: ar ? 'الكود ده انتهى.' : 'This code has expired.',
    coupon_not_started: ar ? 'الكود ده لسه مابدأش.' : 'This code has not started yet.',
    coupon_used_up: ar ? 'الكود ده خلص عدد مرات استخدامه.' : 'This code has been used up.',
    coupon_first_order_only: ar ? 'الكود ده لأول طلب بس.' : 'This code is for first orders only.',
    coupon_already_used: ar ? 'انت استخدمت الكود ده قبل كده.' : 'You already used this code.',
    coupon_min_subtotal: ar ? `الكود ده بيشتغل لما المنتجات توصل ${formatMoney(min || 0, lang)}.` : `This code needs at least ${formatMoney(min || 0, lang)} in items.`,
    coupon_one_store: ar ? 'الكود ده بيطبّق على محل واحد في السلة.' : 'This code applies to one store in the basket.',
  }[code] || (ar ? 'مش قادرين نطبّق الكود.' : 'The code could not be applied.'));

  useEffect(() => {
    let alive = true;
    if (!groups.length) { setQuotes(null); return () => { alive = false; }; }
    setQuotes(null);
    const ask = (group, code) => api(`/stores/${group.slug}/quote`, { method: 'POST', body: { items: group.items.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), gifts: loadGifts(group.slug), ...(code ? { coupon: code } : {}), ...(phoneForQuote ? { phone: phoneForQuote } : {}) } });
    (async () => {
      let rows = await Promise.all(groups.map(async (group) => [group.slug, await ask(group, appliedCode)]));
      let used = Object.fromEntries(groups.map((g) => [g.slug, appliedCode || null]));
      if (appliedCode) {
        const ok = rows.filter(([, qt]) => qt.coupon);
        if (!ok.length) {
          const bad = rows.map(([, qt]) => qt).find((qt) => qt.couponError && qt.couponError !== 'coupon_invalid') || rows[0][1];
          if (alive) { setCouponMsg(couponErrorText(bad.couponError, bad.couponMinSubtotal)); setAppliedCode(null); }
          return;
        }
        // A fixed-amount / free-delivery Twist code is one gift per basket: give it to the biggest store only.
        if (ok.length > 1 && ok.some(([, qt]) => qt.coupon.source === 'platform' && qt.coupon.type !== 'percentage')) {
          const best = ok.reduce((m, r) => (r[1].subtotal > m[1].subtotal ? r : m))[0];
          rows = await Promise.all(rows.map(async ([slug, qt]) => (qt.coupon && slug !== best ? [slug, await ask(groups.find((g) => g.slug === slug), null)] : [slug, qt])));
          used = Object.fromEntries(rows.map(([slug, qt]) => [slug, qt.coupon ? appliedCode : null]));
        } else used = Object.fromEntries(rows.map(([slug, qt]) => [slug, qt.coupon ? appliedCode : null]));
        if (alive) setCouponMsg('');
      }
      if (alive) { setQuotes(Object.fromEntries(rows)); setCodes(used); }
    })().catch(() => { if (alive) setError(ar ? 'مش قادرين نراجع الأسعار والتوفر دلوقتي. جرّب تاني.' : 'We could not verify prices and availability. Please try again.'); });
    return () => { alive = false; };
  }, [groupKey, ar, quoteVersion, appliedCode, phoneForQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    if (!groups.length || form.city.trim().length < 2) { setDeliveryQuote(null); return () => { alive = false; }; }
    setDeliveryQuote(null);
    const timer = setTimeout(() => {
      api('/marketplace/delivery-fee', { method: 'POST', body: { governorate: form.governorate, city: form.city.trim(), ...(phoneForQuote ? { phone: phoneForQuote } : {}), stores: groups.map((g) => ({ slug: g.slug, gifts: loadGifts(g.slug), items: g.items.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), ...(codes[g.slug] ? { coupon: codes[g.slug] } : {}) })) } })
        .then((fee) => { if (alive) setDeliveryQuote(fee); })
        .catch(() => { if (alive) setError(ar ? 'مش قادرين نحدد رسوم التوصيل للمنطقة دي. جرّب تاني.' : 'We could not calculate delivery for this area. Please try again.'); });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [groupKey, ar, form.governorate, form.city, quoteVersion, JSON.stringify(codes), phoneForQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (event) => { setError(''); setForm((f) => ({ ...f, [key]: event.target.value })); };

  const handleLocationChange = async (lat, lng, details) => {
    setCoords({ lat, lng });
    if (details?.primaryName || details?.name) {
      const cityName = details.city || (details.shortName || details.name?.split(',')[0]);
      setForm((f) => ({
        ...f,
        city: cityName || f.city,
        address: f.address.trim() ? f.address : (details.secondaryName || details.primaryName || f.address),
      }));
    } else {
      try {
        const place = await reverseGeocode(lat, lng);
        if (place) {
          setForm((f) => ({
            ...f,
            city: place.city || f.city,
            address: f.address.trim() ? f.address : (place.primaryName || f.address),
          }));
        }
      } catch {
        // geocode fallback
      }
    }
  };

  const quoteRows = groups.map((g) => ({ group: g, quote: quotes?.[g.slug] }));
  const hasErrors = quoteRows.some(({ quote }) => quote?.hasErrors);
  const subtotal = quoteRows.reduce((sum, row) => sum + (row.quote?.subtotal || 0), 0);
  const discount = quoteRows.reduce((sum, row) => sum + (row.quote?.discount || 0), 0);
  const promoSaved = quoteRows.reduce((sum, row) => sum + (row.quote?.promoDiscount || 0), 0);
  const codeSaved = discount - promoSaved;
  const needsDeliveryFee = quoteRows.some(({ quote }) => (quote?.shipping || 0) > 0);
  const feePending = false;
  const shipping = needsDeliveryFee && !feePending ? (deliveryQuote?.fee || 0) : 0;
  const total = subtotal - discount + shipping;

  const applyCode = (event) => {
    event.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setApplying(true); setCouponMsg('');
    setAppliedCode(code);
    setTimeout(() => setApplying(false), 600);
  };
  const removeCode = () => { setAppliedCode(null); setCouponMsg(''); setCodeInput(''); };

  const placeOrder = async (event) => {
    event.preventDefault(); setError('');
    if (form.name.trim().length < 2 || !PHONE.test(form.phone.trim()) || !form.city.trim() || form.address.trim().length < 6) {
      setError(ar ? 'راجع الاسم ورقم الموبايل والمدينة والعنوان، واكتب رقم موبايل مصري صحيح.' : 'Please check your name, Egyptian mobile number, city and address.'); return;
    }
    if (!quotes || !deliveryQuote || hasErrors) { setError(ar ? 'راجع توفر المنتجات ورسوم التوصيل للمنطقة، وحاول تاني.' : 'Review item availability and delivery fee for this area, then try again.'); return; }
    setBusy(true);
    try {
      const result = await api('/marketplace/orders', { method: 'POST', body: {
        name: form.name.trim(), phone: form.phone.trim(), governorate: form.governorate, city: form.city.trim(), address: form.address.trim(), notes: form.notes.trim(),
        ...(feePending ? {} : { expectedShipping: shipping }), expectedTotal: total,
        stores: groups.map((g) => ({ slug: g.slug, gifts: loadGifts(g.slug), items: g.items.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), ...(codes[g.slug] ? { coupon: codes[g.slug] } : {}) })),
      } });
      setSaved({ name: form.name, phone: form.phone, governorate: form.governorate, city: form.city, address: form.address });
      for (const order of result.orders) rememberOrder({ number: order.number, token: order.trackToken, store: order.store?.[lang] || order.store?.ar || order.storeSlug });
      cart.clear();
      navigate('/market-order-success', { replace: true, state: { orders: result.orders, name: form.name.split(' ')[0], phone: form.phone, autoOpenWa: true } });
    } catch (e) {
      if (e.code?.startsWith('coupon_')) { setCouponMsg(couponErrorText(e.code)); setAppliedCode(null); setError(couponErrorText(e.code)); setBusy(false); return; }
      if (e.code === 'delivery_fee_changed' || e.code === 'cart_changed') setQuoteVersion((version) => version + 1);
      setError(e.code === 'delivery_fee_changed' ? (ar ? 'الإجمالي اتغيّر بعد تحديث الأسعار. راجع المبلغ الجديد وأكّد تاني.' : 'The total changed after prices were updated. Review the new amount and confirm again.') : e.code === 'cart_changed' ? (ar ? 'في منتج خلص أو اتغيرت كميته. حدّث السلة وحاول تاني.' : 'An item sold out or its stock changed. Update your basket and try again.') : (ar ? 'الطلب ماكملش. راجع البيانات وحاول تاني.' : 'The order could not be completed. Please check your details and try again.'));
      setBusy(false);
    }
  };

  if (!cart.items.length) return <div className="min-h-dvh"><MarketHeader /><main className="container py-16 text-center"><ShoppingBag className="mx-auto h-10 w-10 text-muted" /><p className="mt-3 font-semibold">{ar ? 'سلة Twist فاضية' : 'Your marketplace basket is empty'}</p><Button to="/search" className="mt-5">{ar ? 'اكتشف المنتجات' : 'Explore products'}</Button></main></div>;

  return <div className="min-h-dvh"><MarketHeader /><main className="container max-w-6xl py-7 sm:py-10">
    <Link to="/market-cart" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-fg"><ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />{ar ? 'الرجوع للسلة' : 'Back to basket'}</Link>
    <h1 className="mb-7 font-display text-2xl font-bold sm:text-3xl">{groups.length > 1 ? (ar ? `إتمام الطلب من ${groups.length} محلات` : `Checkout from ${groups.length} stores`) : (ar ? 'إتمام الطلب' : 'Checkout')}</h1>
    <div className="grid gap-8 lg:grid-cols-12">
      <form onSubmit={placeOrder} className="space-y-7 lg:col-span-7">
        <section className="rounded-3xl border border-line bg-elevated p-5 sm:p-6"><h2 className="mb-5 font-semibold">{ar ? 'بيانات التوصيل' : 'Delivery details'}</h2><div className="grid gap-4 sm:grid-cols-2">
          <Field label={ar ? 'الاسم بالكامل' : 'Full name'}><Input autoComplete="name" value={form.name} onChange={set('name')} required minLength={2} /></Field>
          <Field label={ar ? 'رقم الموبايل' : 'Mobile number'}><Input dir="ltr" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} required placeholder="01xxxxxxxxx" /></Field>
          <Field label={ar ? 'المحافظة' : 'Governorate'}><Select value={form.governorate} onChange={set('governorate')}>{GOVERNORATES.map((g) => <option key={g} value={g}>{t(`gov.${g}`)}</option>)}</Select></Field>
          <Field label={ar ? 'المدينة أو المنطقة' : 'City or area'}><PlaceAutocomplete value={form.city} onChange={(v) => { setError(''); setForm((f) => ({ ...f, city: v })); }} onSelect={(place) => { if (place?.lat && place?.lng) setCoords({ lat: place.lat, lng: place.lng }); }} placeholder={ar ? 'اكتب اسم المدينة أو المنطقة…' : 'Type city or area name…'} /></Field>
          <Field label={ar ? 'العنوان بالتفصيل' : 'Full address'} className="sm:col-span-2"><Textarea rows={2} autoComplete="street-address" value={form.address} onChange={set('address')} required minLength={6} /></Field>
          <Field label={ar ? 'ملاحظات' : 'Notes'} className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
          <div className="sm:col-span-2 pt-1">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-brand" />
                {ar ? 'موقع التوصيل على الخريطة' : 'Delivery location on map'}
              </span>
              <span className="text-xs text-muted">
                {coords ? (ar ? '✓ تم تحديد موقعك' : '✓ Location pinned') : (ar ? 'اضغط على مكانك أو استخدم موقعي الحالي' : 'Tap map or use GPS')}
              </span>
            </div>
            <CheckoutLocationPicker
              lat={coords?.lat}
              lng={coords?.lng}
              onChange={handleLocationChange}
              height={220}
              label={ar ? 'موقعي الحالي' : 'My location'}
            />
          </div>
        </div></section>
        <section className="flex items-center gap-4 rounded-3xl border-2 border-fg bg-elevated p-4"><Banknote className="h-6 w-6 shrink-0" /><span><strong className="block">{ar ? 'الدفع عند الاستلام' : 'Cash on delivery'}</strong><span className="text-sm text-muted">{feePending ? (ar ? 'رسوم التوصيل لسه مش مؤكدة. Twist هتتواصل معاك بالسعر النهائي قبل إرسال المندوب.' : 'Delivery is not priced yet. Twist will contact you with the final fee before dispatch.') : (ar ? 'هتدفعي إجمالي طلبك مرة واحدة لمندوب Twist.' : 'Pay the order total once to the Twist courier.')}</span></span></section>
        <FinalSaleNote items={cart.items} />
        {error && <p role="alert" className="rounded-xl bg-sale/10 p-3 text-sm text-sale">{error}</p>}
        <Button type="submit" size="lg" full loading={busy} disabled={!quotes || !deliveryQuote || hasErrors}>{feePending ? (ar ? `إرسال الطلب · ${formatMoney(subtotal, lang)} منتجات` : `Place order · ${formatMoney(subtotal, lang)} items`) : groups.length > 1 ? (ar ? `تأكيد ${groups.length} طلبات · ${formatMoney(total, lang)}` : `Confirm ${groups.length} orders · ${formatMoney(total, lang)}`) : (ar ? `تأكيد الطلب · ${formatMoney(total, lang)}` : `Place order · ${formatMoney(total, lang)}`)}</Button>
        <p className="flex items-center justify-center gap-2 text-xs text-muted"><Lock className="h-3.5 w-3.5" />{ar ? 'كل محل هيستلم طلبه ويديره بشكل منفصل.' : 'Each store receives and manages its own order.'}</p>
      </form>
      <aside className="h-fit rounded-3xl border border-line bg-elevated p-5 sm:p-6 lg:sticky lg:top-24 lg:col-span-5"><h2 className="mb-5 flex items-center gap-2 font-semibold"><ShoppingBag className="h-5 w-5" />{ar ? 'ملخص الطلبات' : 'Order summary'}</h2>
        <div className="space-y-5">{quoteRows.map(({ group, quote }) => <section key={group.slug} className="border-b border-line pb-4 last:border-0"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Store className="h-4 w-4" />{group.name?.[lang] || group.name?.ar || group.slug}</h3><div className="flex justify-between text-sm"><span className="text-muted">{ar ? 'المنتجات' : 'Items'}</span><span>{quote ? formatMoney(quote.subtotal, lang) : '…'}</span></div>{quote && <p className="mt-1 text-xs text-muted">{quote.shipping === 0 ? (ar ? 'المحل مؤهل للشحن المجاني؛ قد تظل هناك رسوم واحدة لمحلات أخرى في السلة.' : 'This store qualifies for free shipping; another store may still make one shared basket fee.') : (ar ? 'المحل لم يصل لحد الشحن المجاني؛ رسوم التوصيل تُحسب مرة واحدة للسلة كلها.' : 'This store has not reached its free-shipping threshold; delivery is charged once for the whole basket.')}</p>}{group.items.slice(0, 3).map((line) => { const current = quote?.lines?.find((item) => item.productId === line.productId && (item.variantId || null) === (line.variantId || null)); return <div key={line.key} className="mt-3 flex items-center gap-3"><SmartImage media={line.image} ratio="4 / 5" sizes="40px" className="w-10 rounded-lg" /><span className="min-w-0 flex-1 truncate text-xs">{line.name?.[lang] || line.name?.ar || line.name} × {line.qty}</span><span className="text-xs">{current?.promoDiscount ? <><s className="me-1 text-muted">{formatMoney((current.price) * line.qty, lang)}</s><span className="font-semibold text-success">{formatMoney(current.price * line.qty - current.promoDiscount, lang)}</span></> : formatMoney((current?.price ?? line.price) * line.qty, lang)}</span></div>;})}{quote && <div className="mt-3 space-y-2"><GiftRows quote={quote} /><AppliedOffers quote={quote} /></div>}{quote?.hasErrors && <p className="mt-2 text-xs font-medium text-sale">{ar ? 'في منتج غير متاح أو كميته أكبر من المخزون.' : 'An item is unavailable or exceeds stock.'}</p>}</section>)}</div>
        <div className="mt-4 border-t border-line pt-4">
          {appliedCode && codeSaved > 0 ? (
            <div className="flex items-center justify-between rounded-xl bg-success/10 px-3 py-2.5 text-sm text-success">
              <span className="inline-flex items-center gap-2 font-semibold"><Tag className="h-4 w-4" />{ar ? `كود ${appliedCode} اتطبّق` : `Code ${appliedCode} applied`}</span>
              <button type="button" onClick={removeCode} aria-label={ar ? 'شيل الكود' : 'Remove code'} className="grid h-8 w-8 place-items-center rounded-full hover:bg-success/10"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <form onSubmit={applyCode} className="flex gap-2">
              <Input dir="ltr" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} placeholder={ar ? 'عندك كود خصم؟' : 'Discount code'} aria-label={ar ? 'كود الخصم' : 'Discount code'} className="flex-1 uppercase" autoCapitalize="characters" spellCheck={false} />
              <Button type="submit" variant="outline" loading={applying} disabled={!codeInput.trim()}>{ar ? 'تطبيق' : 'Apply'}</Button>
            </form>
          )}
          {couponMsg && <p role="alert" className="mt-2 text-[13px] font-medium text-sale">{couponMsg}</p>}
        </div>
        <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm"><div className="flex justify-between"><span className="text-muted">{ar ? 'المنتجات' : 'Items'}</span><span>{quotes ? formatMoney(subtotal, lang) : '…'}</span></div>{promoSaved > 0 && <div className="flex justify-between text-success"><span>{ar ? 'خصم العروض' : 'Offers discount'}</span><span>- {formatMoney(promoSaved, lang)}</span></div>}{codeSaved > 0 && <div className="flex justify-between text-success"><span>{ar ? 'خصم الكود' : 'Code discount'}</span><span>- {formatMoney(codeSaved, lang)}</span></div>}<div className="flex justify-between"><span className="text-muted">{ar ? `توصيل Twist إلى ${form.city || 'منطقتك'}` : `Twist delivery to ${form.city || 'your area'}`}</span><span>{quotes && deliveryQuote ? (shipping ? formatMoney(shipping, lang) : (ar ? 'مجاني' : 'Free')) : '…'}</span></div><div className="flex justify-between text-lg font-bold"><span>{ar ? 'الإجمالي' : 'Total'}</span><span>{quotes && deliveryQuote ? formatMoney(total, lang) : '…'}</span></div></div>
        {deliveryQuote?.breakdown && <DeliveryBreakdown breakdown={deliveryQuote.breakdown} dest={coords} lang={lang} />}
      </aside>
    </div>
  </main></div>;
}
