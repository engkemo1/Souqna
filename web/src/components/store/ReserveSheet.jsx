import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MapPin, MessageCircle, Store, Clock } from 'lucide-react';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useBuyer } from '../../lib/buyer.jsx';
import { formatMoney } from '../../lib/format.js';
import { rememberOrder } from '../../lib/recentOrders.js';
import { errorMessage, fieldErrors } from '../ui/States.jsx';
import { useApi } from '../../lib/hooks.js';
import WhatsAppSignIn from '../market/WhatsAppSignIn.jsx';

const KEY = 'souqna.reserve.contact';
const loadContact = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

/** Directions link for the shop: its own Google Maps link, else its pin, else nothing. */
export function mapsLink(s) {
  if (s?.mapUrl) return s.mapUrl;
  if (s?.lat != null && s?.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  return null;
}

/** "Reserve & try in store": hold the chosen piece for a few hours, try it on in the shop and pay there. */
export default function ReserveSheet({ open, onClose, store, product, variant, color, size, qty }) {
  const { t, tr, lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const { buyer } = useBuyer() || {};
  const { data: otp } = useApi(open ? '/buyer/otp/available' : null);
  // once WhatsApp sign-in is live, the number must be proved by a code first (no fake reservations)
  const needVerify = Boolean(otp?.whatsapp) && !buyer?.phoneVerified;
  const lockedPhone = otp?.whatsapp && buyer?.phoneVerified ? buyer.phone : null;
  const [f, setF] = useState({ name: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const hours = store.reserveHours || 24;

  useEffect(() => {
    if (!open) return;
    const saved = loadContact();
    setF({ name: buyer?.name || saved.name || '', phone: buyer?.phone || saved.phone || '' });
    setErrors({}); setMsg(''); setDone(null);
  }, [open, buyer]);

  const until = (iso) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({}); setMsg('');
    try {
      const r = await api(`/stores/${store.slug}/reserve`, { method: 'POST', body: { name: f.name, phone: (lockedPhone || f.phone).replace(/\D/g, '').replace(/^20/, '0'), items: [{ productId: product.id, variantId: variant?.id ?? null, qty }] } });
      try { localStorage.setItem(KEY, JSON.stringify({ name: f.name, phone: f.phone })); } catch { /* private mode */ }
      rememberOrder({ number: r.reservation.number, token: r.reservation.trackToken, store: tr(store.name) });
      setDone(r);
    } catch (x) {
      setErrors(x.code === 'reserve_blocked' ? {} : fieldErrors(t, x));
      setMsg({
        too_many_reservations: L('عندك حجوزات مستنياك في المحل ده بالفعل.', 'You already have reservations waiting at this store.'),
        reserve_off: L('المحل ده مش بيستقبل حجوزات دلوقتي.', 'This store is not taking reservations right now.'),
        reserve_blocked: L(`الحجز موقوف على الرقم ده لحد ${x.fields?.until ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long' }).format(new Date(x.fields.until)) : 'فترة'}، لأنه اتحجز قبل كده مرتين ومحدش عدّى. تقدر تطلب بالتوصيل عادي.`, 'Reservations are paused for this number because it did not show up twice. You can still order for delivery.'),
        verify_phone: L('أكّد رقمك بالكود الأول.', 'Confirm your number with the code first.'),
        cart_changed: L('القطعة دي خلصت أو المقاس مش متاح. اختار مقاس تاني.', 'This piece or size is no longer available.'),
      }[x.code] || (x.fields ? '' : errorMessage(t, x)));
    }
    setBusy(false);
  };

  const image = product.media?.[0] || product.image;
  const details = [color && product.colors?.find((c) => c.hex === color) ? tr({ ar: product.colors.find((c) => c.hex === color).name_ar, en: product.colors.find((c) => c.hex === color).name_en }) : null, size].filter(Boolean).join(' · ');

  if (done) {
    const s = done.store;
    const map = mapsLink(s);
    const wa = s.whatsapp ? `https://wa.me/2${s.whatsapp.replace(/\D/g, '').replace(/^2?0/, '0')}?text=${encodeURIComponent(L(`أهلاً، حجزت ${tr(product.name)} (رقم ${done.reservation.number}) وهعدّي أقيسه`, `Hi, I reserved ${tr(product.name)} (no. ${done.reservation.number}) and will come to try it`))}` : null;
    return (
      <Sheet open={open} onClose={onClose} title={L('طلب الحجز وصل للمحل', 'Request sent to the shop')} size="sm" side="auto" desktop="center">
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500 text-white"><Clock className="h-5 w-5" /></span>
            <div className="text-sm leading-relaxed">
              <p className="font-semibold">{L(`مستنيين ${tr(s.name)} يأكد إن القطعة موجودة`, `Waiting for ${tr(s.name)} to confirm the piece is there`)}</p>
              <p className="mt-1">{L(`أول ما يأكد، هيشيلها لك ${done.reservation.holdHours} ساعة. متنزلش قبل التأكيد، وتابعه من «تابع الحجز». لو مأكدش لحد ${until(done.reservation.confirmBy)} الطلب بيتلغى لوحده.`, `Once confirmed, it is held for you for ${done.reservation.holdHours} hours. Don't go before the confirmation; follow it via “Follow the reservation”. If not confirmed by ${until(done.reservation.confirmBy)}, the request is cancelled.`)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-line p-4 text-sm">
            <p className="text-muted">{L('رقم الحجز', 'Reservation no.')}</p>
            <p className="font-mono text-lg font-bold" dir="ltr">{done.reservation.number}</p>
            {tr(s.address) && <p className="mt-3 flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr(s.address)}</p>}
            {s.hours && <p className="mt-2 flex items-center gap-2 text-muted"><Clock className="h-4 w-4 shrink-0" />{L(`مفتوح من ${s.hours.open} لـ ${s.hours.close}`, `Open ${s.hours.open}–${s.hours.close}`)}</p>}
          </div>
          <div className="grid gap-2">
            {map && <Button full variant="outline" icon={MapPin} href={map} target="_blank" rel="noreferrer">{L('مكان المحل على الخريطة', 'Shop on the map')}</Button>}
            {wa && <Button full variant="outline" icon={MessageCircle} href={wa} target="_blank" rel="noreferrer">{L('كلّم المحل على واتساب', 'Message the shop on WhatsApp')}</Button>}
            <Button full to={`/track/${done.reservation.trackToken}`} icon={Check}>{L('تابع الحجز', 'Follow the reservation')}</Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={L('احجزها وجرّبها في المحل', 'Reserve & try in store')} description={L(`المحل بيأكد إن القطعة موجودة، وبعدها يشيلها لك ${hours} ساعة. مفيش دفع دلوقتي.`, `The shop confirms the piece is there, then holds it for ${hours} hours. Nothing to pay now.`)} size="sm" side="auto" desktop="center"
      footer={needVerify ? null : <Button type="submit" form="reserve-form" full size="lg" loading={busy} icon={Store}>{L('ابعت طلب الحجز', 'Send reservation request')}</Button>}>
      {needVerify ? (
        <WhatsAppSignIn className="space-y-4 py-4" intro={L('عشان نحمي المحلات من الحجوزات الوهمية، أكّد رقمك مرة واحدة بكود هيوصلك على واتساب.', 'To protect shops from fake reservations, confirm your number once with a WhatsApp code.')} />
      ) : (
      <form id="reserve-form" onSubmit={submit} className="space-y-4 py-4">
        <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3">
          {image && <SmartImage media={image} ratio="4 / 5" sizes="64px" className="w-14 shrink-0 rounded-xl" />}
          <div className="min-w-0">
            <p className="truncate font-semibold">{tr(product.name)}</p>
            {details && <p className="text-[13px] text-muted">{details}{qty > 1 ? ` · ${qty}×` : ''}</p>}
            <p className="mt-0.5 font-semibold tabular">{formatMoney(product.price * qty, lang)}</p>
          </div>
        </div>
        <Field label={t('acc.name')} error={errors.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} autoComplete="name" /></Field>
        <Field label={t('acc.phone')} error={errors.phone} hint={L('المحل هيكلمك عليه لو حاجة اتغيّرت.', 'The shop calls you on it if anything changes.')}>
          <Input dir="ltr" inputMode="tel" value={lockedPhone || f.phone} readOnly={!!lockedPhone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="01XXXXXXXXX" className="text-start" required autoComplete="tel" />
        </Field>
        {msg && <p role="alert" className="text-[13px] font-medium text-sale">{msg}</p>}
      </form>
      )}
    </Sheet>
  );
}
