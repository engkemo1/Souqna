import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, ChevronDown, Lock, Tag, X, ShoppingBag } from 'lucide-react';
import { GOVERNORATES } from '@souqna/shared';
import { useStore, sp } from '../../lib/store.jsx';
import { useCart } from '../../lib/cart.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { rememberOrder } from '../../lib/recentOrders.js';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/format.js';
import { useLocalState } from '../../lib/hooks.js';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { CartEmpty } from '../../components/store/CartContents.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

const PHONE = /^01[0125][0-9]{8}$/;

function Summary({ quote, items, coupon, onApply, onRemove, couponError, applying }) {
  const { t, tr, lang } = useI18n();
  const [code, setCode] = useState('');
  const lines = quote?.lines || items.map((l) => ({ ...l, image: l.image }));
  return (
    <div>
      <ul className="space-y-4">
        {items.map((l, i) => {
          const ql = quote?.lines?.[i];
          return (
            <li key={l.key} className="flex items-center gap-3.5">
              <div className="relative w-16 shrink-0">
                <SmartImage media={l.image} ratio="4 / 5" sizes="64px" className="rounded-xl ring-1 ring-line" />
                <span className="absolute -end-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1 text-xs font-bold text-canvas">{l.qty}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tr(l.name)}</p>
                <p className="text-xs text-muted">{[l.colorName && tr(l.colorName), l.size].filter(Boolean).join(' · ')}</p>
                {ql?.error && <p className="text-xs font-semibold text-sale">{ql.error === 'insufficient_stock' ? t('cart.onlyAvailable', { n: ql.available }) : t('cart.unavailable')}</p>}
              </div>
              <span className="text-sm font-semibold tabular">{formatMoney(l.price * l.qty, lang)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-6">
        {coupon ? (
          <div className="flex items-center justify-between rounded-xl bg-success/10 px-3.5 py-2.5 text-sm text-success">
            <span className="inline-flex items-center gap-2 font-semibold"><Tag className="h-4 w-4" />{t('checkout.couponApplied', { code: coupon.code })}</span>
            <button type="button" onClick={onRemove} aria-label={t('checkout.removeCoupon')} className="grid h-8 w-8 place-items-center rounded-full hover:bg-success/10"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onApply(code.trim()); }}>
            <Input size="sm" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('checkout.couponPlaceholder')} aria-label={t('checkout.coupon')} invalid={!!couponError} className="flex-1 uppercase" dir="ltr" />
            <Button type="submit" variant="outline" size="sm" loading={applying}>{t('checkout.applyCoupon')}</Button>
          </form>
        )}
        {couponError && <p className="mt-2 text-[13px] font-medium text-sale" role="alert">{couponError}</p>}
      </div>

      <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-base">
        <div className="flex justify-between"><dt className="text-muted">{t('cart.subtotal')}</dt><dd className="tabular">{quote ? formatMoney(quote.subtotal, lang) : <Skeleton className="h-4 w-16" />}</dd></div>
        {quote?.discount > 0 && <div className="flex justify-between text-success"><dt>{t('cart.discount')}</dt><dd className="tabular">−{formatMoney(quote.discount, lang)}</dd></div>}
        <div className="flex justify-between"><dt className="text-muted">{t('cart.shipping')}</dt><dd className="tabular">{!quote ? <Skeleton className="h-4 w-12" /> : quote.shipping === 0 ? <span className="font-semibold text-success">{t('common.free')}</span> : formatMoney(quote.shipping, lang)}</dd></div>
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-lg font-semibold"><dt>{t('cart.total')}</dt><dd className="tabular">{quote ? formatMoney(quote.total, lang) : <Skeleton className="h-5 w-20" />}</dd></div>
      </dl>
      {lines && null}
    </div>
  );
}

export default function Checkout() {
  const { store } = useStore();
  const cart = useCart(store.slug);
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [saved, setSaved] = useLocalState('souqna.customer', { name: '', phone: '', governorate: 'Qalyubia', city: lang === 'ar' ? 'بنها' : 'Banha', address: '' });
  const [form, setForm] = useState({ ...saved, notes: '' });
  const [errors, setErrors] = useState({});
  const [quote, setQuote] = useState(null);
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [applying, setApplying] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const formRef = useRef(null);

  const payload = useMemo(() => cart.items.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), [cart.items]);

  const runQuote = async (code) => {
    const q = await api(`/stores/${store.slug}/quote`, { method: 'POST', body: { items: payload, coupon: code || null, phone: PHONE.test(form.phone.trim()) ? form.phone.trim() : null } });
    setQuote(q);
    return q;
  };

  useEffect(() => {
    if (!payload.length) return;
    runQuote(coupon?.code).catch(() => {});
  }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyCoupon = async (code) => {
    setApplying(true);
    setCouponError('');
    try {
      const q = await runQuote(code);
      if (q.couponError) setCouponError(t(`checkout.${q.couponError}`, { v: formatMoney(q.couponMinSubtotal || 0, lang) }));
      else setCoupon(q.coupon);
    } catch (e) { setCouponError(errorMessage(t, e)); }
    setApplying(false);
  };
  // Once the phone is known, re-check phone-bound codes (first-order-only / one use per phone) so the shown total is the real one.
  useEffect(() => {
    if (!coupon || !PHONE.test(form.phone.trim())) return;
    runQuote(coupon.code).then((q) => {
      if (q.couponError) { setCouponError(t(`checkout.${q.couponError}`, { v: formatMoney(q.couponMinSubtotal || 0, lang) })); setCoupon(null); runQuote(null).catch(() => {}); }
    }).catch(() => {});
  }, [form.phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const removeCoupon = () => { setCoupon(null); runQuote(null).catch(() => {}); };

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = t('field.name_required');
    if (!PHONE.test(form.phone.trim())) e.phone = t('field.phone_invalid');
    if (!form.governorate) e.governorate = t('field.governorate_required');
    if (form.city.trim().length < 2) e.city = t('field.city_required');
    if (form.address.trim().length < 6) e.address = t('field.address_required');
    setErrors(e);
    if (Object.keys(e).length) {
      const first = formRef.current?.querySelector(`[name="${Object.keys(e)[0]}"]`);
      first?.focus();
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return !Object.keys(e).length;
  };

  const place = async (e) => {
    e?.preventDefault();
    if (!validate()) return;
    setPlacing(true);
    try {
      const { order } = await api(`/stores/${store.slug}/orders`, { method: 'POST', body: { ...form, phone: form.phone.trim(), coupon: coupon?.code || null, items: payload } });
      setSaved({ name: form.name, phone: form.phone, governorate: form.governorate, city: form.city, address: form.address });
      cart.clear();
      rememberOrder({ number: order.number, token: order.trackToken, store: store.name });
      navigate(sp(store.slug, `order/${order.number}?t=${order.trackToken}`), { replace: true, state: { name: form.name.split(' ')[0], phone: form.phone } });
    } catch (err) {
      setPlacing(false);
      if (err.code?.startsWith('coupon_')) {
        setCouponError(t(`checkout.${err.code}`, { v: '' })); setCoupon(null);
        await runQuote(null).catch(() => {}); setSummaryOpen(true);
        toast({ tone: 'error', title: t(`checkout.${err.code}`, { v: '' }) });
        return;
      }
      if (err.code === 'cart_changed') {
        await runQuote(coupon?.code).catch(() => {});
        setSummaryOpen(true);
      }
      setErrors((x) => ({ ...x, ...fieldErrors(t, err) }));
      toast({ tone: 'error', title: errorMessage(t, err) });
    }
  };

  if (!cart.items.length) return <div className="container"><CartEmpty slug={store.slug} /></div>;
  const total = quote ? formatMoney(quote.total, lang) : '…';
  const blocked = quote?.hasErrors;

  return (
    <PageTransition className="pb-28 lg:pb-0">
      {/* mobile summary toggle */}
      <div className="border-b border-line bg-surface lg:hidden">
        <button type="button" onClick={() => setSummaryOpen((o) => !o)} aria-expanded={summaryOpen} className="container flex h-14 items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-brand"><ShoppingBag className="h-4 w-4" />{t('checkout.review')}<ChevronDown className={cx('h-4 w-4 transition-transform', summaryOpen && 'rotate-180')} /></span>
          <span className="text-base font-semibold tabular">{total}</span>
        </button>
        <AnimatePresence initial={false}>
          {summaryOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <div className="container pb-6 pt-2"><Summary quote={quote} items={cart.items} coupon={coupon} onApply={applyCoupon} onRemove={removeCoupon} couponError={couponError} applying={applying} /></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="container pt-6 sm:pt-10 lg:grid lg:grid-cols-12 lg:items-start lg:gap-12">
        <form ref={formRef} onSubmit={place} noValidate className="lg:col-span-7">
          <h1 className="font-display text-display-sm font-bold">{t('checkout.title')}</h1>

          <section className="mt-8">
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full bg-fg text-xs text-canvas">1</span>{t('checkout.contact')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('checkout.name')} error={errors.name}><Input name="name" autoComplete="name" value={form.name} onChange={set('name')} /></Field>
              <Field label={t('checkout.phone')} hint={t('checkout.phoneHint')} error={errors.phone}>
                <Input name="phone" type="tel" inputMode="numeric" autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" maxLength={11} value={form.phone} onChange={(e) => set('phone')({ target: { value: e.target.value.replace(/\D/g, '') } })} className="text-start" />
              </Field>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full bg-fg text-xs text-canvas">2</span>{t('checkout.delivery')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('checkout.governorate')} error={errors.governorate}>
                <Select name="governorate" value={form.governorate} onChange={set('governorate')}>
                  {GOVERNORATES.map((g) => <option key={g} value={g}>{t(`gov.${g}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('checkout.city')} error={errors.city}><Input name="city" autoComplete="address-level2" value={form.city} onChange={set('city')} /></Field>
              <Field label={t('checkout.address')} hint={t('checkout.addressHint')} error={errors.address} className="sm:col-span-2">
                <Textarea name="address" rows={2} autoComplete="street-address" value={form.address} onChange={set('address')} />
              </Field>
              <Field label={t('checkout.notes')} optional={t('common.optional')} className="sm:col-span-2"><Textarea name="notes" rows={2} value={form.notes} onChange={set('notes')} /></Field>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full bg-fg text-xs text-canvas">3</span>{t('checkout.payment')}</h2>
            <label className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-fg bg-elevated p-4">
              <input type="radio" checked readOnly className="h-5 w-5 accent-[rgb(var(--c-text))]" />
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-on-secondary"><Banknote className="h-5 w-5" /></span>
              <span><span className="block font-semibold">{t('checkout.cod')}</span><span className="block text-sm text-muted">{t('checkout.codBody')}</span></span>
            </label>
          </section>

          <div className="mt-8 hidden lg:block">
            <Button type="submit" size="lg" full loading={placing} disabled={blocked || !quote}>{t('checkout.placeOrder', { v: total })}</Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-muted"><Lock className="h-3.5 w-3.5" />{t('checkout.secure')}</p>
          </div>
        </form>

        <aside className="hidden rounded-3xl border border-line bg-elevated p-6 lg:sticky lg:top-24 lg:col-span-5 lg:block">
          <h2 className="mb-5 text-lg font-semibold">{t('checkout.review')}</h2>
          <Summary quote={quote} items={cart.items} coupon={coupon} onApply={applyCoupon} onRemove={removeCoupon} couponError={couponError} applying={applying} />
        </aside>
      </div>

      {/* mobile sticky place order */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-elevated/95 px-4 pt-3 backdrop-blur-md pb-[calc(12px+var(--safe-b))] lg:hidden">
        <Button size="lg" full loading={placing} disabled={blocked || !quote} onClick={place}>{t('checkout.placeOrder', { v: total })}</Button>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted"><Lock className="h-3 w-3" />{t('checkout.secure')}</p>
      </div>
    </PageTransition>
  );
}
