import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Palette, ArrowUpRight, Trash2, Eye, EyeOff } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api, upload } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useDashBase } from '../../lib/dashBase.js';
import DesignHelp from '../../components/dash/DesignHelp.jsx';
import { LocationPicker } from '../../components/ui/MapView.jsx';
import PlaceAutocomplete from '../../components/ui/PlaceAutocomplete.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Input, Textarea, Select, Switch } from '../../components/ui/Field.jsx';
import { ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDepartments } from '../../lib/departments.js';
import PageTransition from '../../components/PageTransition.jsx';
import BrandPaletteCard from '../../components/dash/BrandPaletteCard.jsx';
import { ConfirmDialog } from '../../components/ui/Sheet.jsx';

const FIELDS = ['name_ar', 'name_en', 'tagline_ar', 'tagline_en', 'description_ar', 'description_en', 'address_ar', 'address_en', 'departments', 'phone', 'whatsapp', 'map_url', 'lat', 'lng', 'hero_mode', 'photo_style', 'opens_at', 'closes_at', 'day_off', 'return_days', 'reserve_hours', 'instagram', 'facebook', 'tiktok', 'shipping_fee', 'free_shipping_over', 'offer_badge_ar', 'offer_badge_en', 'logo_initials', 'logo_color'];

/** Exchange & return policy: one clear period choice (saved with the page) plus a note on pieces excluded one by one. */
function ReturnsBox({ days, onDays }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data, reload } = useApi('/owner/returns');
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await api('/owner/returns/bulk', { method: 'POST', body: { no_return: false } });
      await reload(); invalidate('/owner/products');
      toast({ title: t('settings.allowReturnAllDone') });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };
  const cur = String(days ?? '');
  const presets = ['0', '1', '3', '7', '14'];
  const values = presets.includes(cur) || cur === '' ? presets : [...presets, cur].sort((a, b) => Number(a) - Number(b));
  const label = (v) => (v === '0' ? t('settings.noReturnChip') : t('settings.dayN', { n: Number(v) }));
  return (
    <div className="sm:col-span-2 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold">{t('settings.returnsTitle')}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">{t('settings.returnDaysHint')}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('settings.returnsTitle')}>
        {values.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={cur === v} onClick={() => onDays(v)}
            className={'h-9 rounded-full px-4 text-[13px] font-semibold ring-1 transition active:scale-95 ' + (cur === v ? 'bg-btn text-on-btn ring-transparent' : 'ring-line hover:bg-fg/[0.05]')}>{label(v)}</button>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{Number(days) > 0 ? t('settings.returnsOn', { n: Number(days) }) : t('settings.returnsOff')}</p>
      {data && data.noReturn > 0 && Number(days) > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-[13px] text-muted">{t('settings.returnsCount', { a: data.noReturn, b: data.total })}</p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={reset}>{t('settings.allowReturnAll')}</Button>
        </div>
      )}
    </div>
  );
}

/** "Reserve & try in store": how long a reserved piece is held for the shopper (0 = feature off). */
function ReserveBox({ hours, hasPlace, onHours }) {
  const { lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const cur = String(hours ?? '24');
  const opts = [['0', L('مقفول', 'Off')], ['6', L('6 ساعات', '6 h')], ['12', L('12 ساعة', '12 h')], ['24', L('يوم', '1 day')], ['48', L('يومين', '2 days')]];
  return (
    <div className="sm:col-span-2 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold">{L('احجزها وجرّبها في المحل', 'Reserve & try in store')}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{L('العميل يحجز القطعة من الموقع، تشيلها له، ييجي يقيسها ويدفع عندك. لو معدّاش، الحجز بيتلغى لوحده والقطعة ترجع للبيع.', 'Shoppers reserve a piece online, you put it aside, they come to try it on and pay in store. If they do not come, it is released automatically.')}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={L('مدة الحجز', 'Hold time')}>
        {opts.map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={cur === v} onClick={() => onHours(v)}
            className={'h-9 rounded-full px-4 text-[13px] font-semibold ring-1 transition active:scale-95 ' + (cur === v ? 'bg-btn text-on-btn ring-transparent' : 'ring-line hover:bg-fg/[0.05]')}>{label}</button>
        ))}
      </div>
      {cur !== '0' && !hasPlace && <p className="mt-2 text-[12.5px] font-medium text-amber-700">{L('عشان الزرار يظهر للعملاء، اكتب عنوان المحل أو حط مكانه على الخريطة.', 'Add your shop address or map pin so shoppers can see this option.')}</p>}
    </div>
  );
}

function HeroModePicker({ value, onChange }) {
  const { t } = useI18n();
  const opts = [['cover', t('settings.heroCover'), t('settings.heroCoverHint')], ['slider', t('settings.heroSlider'), t('settings.heroSliderHint')], ['auto', t('settings.heroAuto'), t('settings.heroAutoHint')]];
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-sm font-medium">{t('settings.heroMode')}</legend>
      <div className="grid gap-2">
        {opts.map(([v, label, hint]) => (
          <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 transition ${value === v ? 'bg-fg/[0.04] ring-fg' : 'ring-line hover:bg-fg/[0.02]'}`}>
            <input type="radio" name="hero_mode" value={v} checked={value === v} onChange={() => onChange(v)} className="mt-1" />
            <span><span className="block text-sm font-semibold">{label}</span><span className="block text-[13px] text-muted">{hint}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PhotoStylePicker({ value, onChange }) {
  const { t } = useI18n();
  const opts = [
    ['white', t('settings.photoWhite'), t('settings.photoWhiteHint'), '#ffffff'],
    ['cream', t('settings.photoCream'), t('settings.photoCreamHint'), '#f5efe6'],
    ['original', t('settings.photoOriginal'), t('settings.photoOriginalHint'), null],
  ];
  return (
    <fieldset className="mt-5">
      <legend className="mb-1 text-sm font-medium">{t('settings.photoStyle')}</legend>
      <p className="mb-2 text-[13px] text-muted">{t('settings.photoStyleNote')}</p>
      <div className="grid gap-2">
        {opts.map(([v, label, hint, bg]) => (
          <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 transition ${value === v ? 'bg-fg/[0.04] ring-fg' : 'ring-line hover:bg-fg/[0.02]'}`}>
            <input type="radio" name="photo_style" value={v} checked={value === v} onChange={() => onChange(v)} className="mt-1" />
            <span className="relative grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-line" style={bg ? { background: bg } : { background: 'linear-gradient(135deg,#9aa4b2,#4b5563 55%,#cbd5e1)' }} aria-hidden="true">
              <span className="h-7 w-6 rounded-[5px] bg-[#1d4e89] shadow-sm" />
            </span>
            <span><span className="block text-sm font-semibold">{label}</span><span className="block text-[13px] text-muted">{hint}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AutoCover({ onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api('/owner/store/cover/auto', { method: 'POST' });
      onDone(r.media);
      toast({ title: 'اتعمل غلاف جديد لمتجرك' });
    } catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); }
    setBusy(false);
  };
  return (
    <button type="button" onClick={run} disabled={busy}
      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-l from-[#FF966F] via-[#F8620A] to-[#B84421] px-4 py-2.5 text-sm font-bold text-[#111] disabled:opacity-60">
      {busy ? 'بنصمم الـ cover…' : 'صمّملي غلافًا أنيقًا من منتجاتي'}
    </button>
  );
}

function ImageSlot({ label, media, slot, ratio, onUploaded, onDelete, deleteBusy, round }) {
  const { t } = useI18n();
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await upload(`/owner/store/${slot}`, fd);
      onUploaded(r.media, r.brand);
      toast({ title: t('settings.logoUpdated') });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <button type="button" onClick={() => ref.current?.click()} className={`group relative block w-full overflow-hidden bg-surface ring-1 ring-line ${round ? 'h-28 w-28 rounded-full' : 'rounded-2xl'}`}>
        <SmartImage media={media} ratio={slot === 'cover' ? 'natural' : ratio} fit={slot === 'cover' ? 'contain' : 'cover'} sizes="400px" />
        <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 [@media(hover:none)]:bg-black/25 [@media(hover:none)]:opacity-100">
          {busy ? <Spinner size={24} /> : <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-sm font-semibold"><Camera className="h-4 w-4" />{t('settings.change')}</span>}
        </span>
      </button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      {media && <button type="button" disabled={busy || deleteBusy} onClick={() => setConfirmDelete(true)} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-sale hover:bg-sale/10 disabled:opacity-50"><Trash2 className="h-4 w-4" />{t('common.delete')}</button>}
      {!media && <p className="mt-2 text-xs text-muted">{t('settings.noImage')}</p>}
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={async () => { if (await onDelete()) setConfirmDelete(false); }} danger loading={deleteBusy} title={t('settings.deleteImageTitle')} body={t('settings.deleteImageBody', { label })} confirmLabel={t('common.delete')} />
    </div>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [v, setV] = useState({ current: '', next: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (v.next.trim().length < 8) { setErr('الباسورد الجديد لازم يكون 8 حروف أو أكتر.'); return; }
    setBusy(true); setErr('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { current: v.current, password: v.next } });
      setV({ current: '', next: '' });
      toast({ title: 'اتغيّر الباسورد' });
    } catch (e2) { setErr(e2.fields?.current ? 'الباسورد الحالي غلط.' : (e2.message || 'حصلت مشكلة، جرّب تاني.')); }
    setBusy(false);
  };
  const attrs = { dir: 'ltr', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, type: show ? 'text' : 'password' };
  return (
    <Panel title="تغيير الباسورد">
      <form onSubmit={submit} className="grid gap-4 sm:max-w-sm">
        <Field label="الباسورد الحالي"><Input {...attrs} autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} /></Field>
        <Field label="الباسورد الجديد" hint="8 حروف أو أكتر">
          <div className="relative">
            <Input {...attrs} autoComplete="new-password" className="pe-12" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />
            <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? 'إخفاء الباسورد' : 'إظهار الباسورد'} className="absolute end-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg">{show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
          </div>
        </Field>
        {err && <p role="alert" className="text-sm font-medium text-sale">{err}</p>}
        <div><Button type="submit" loading={busy} disabled={!v.current || !v.next}>تغيير الباسورد</Button></div>
      </form>
    </Panel>
  );
}

export default function Settings() {
  const dashBase = useDashBase();
  const { t } = useI18n();
  const { setStore } = useAuth();
  const toast = useToast();
  const depts = useDepartments();
  const { data, error, reload, mutate } = useApi('/owner/store');
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState('');
  const [initial, setInitial] = useState('');
  const [brandKey, setBrandKey] = useState(0);

  useEffect(() => {
    if (!data) return;
    const s = data.store;
    const x = ({
      name_ar: s.name.ar, name_en: s.name.en, tagline_ar: s.tagline.ar, tagline_en: s.tagline.en, description_ar: s.description.ar, description_en: s.description.en,
      address_ar: s.address.ar, address_en: s.address.en, departments: s.departments?.length ? s.departments : (s.category && s.category !== 'mixed' ? [s.category] : []), phone: s.phone || '', whatsapp: s.whatsapp || '', map_url: s.mapUrl || '', lat: s.lat ?? '', lng: s.lng ?? '', hero_mode: s.heroMode || 'auto', photo_style: s.photoStyle || 'white', opens_at: s.hours?.open || '', closes_at: s.hours?.close || '', day_off: s.hours?.dayOff ?? '', instagram: s.instagram || '', facebook: s.facebook || '', tiktok: s.tiktok || '',
      return_days: String(s.returnDays ?? 3), reserve_hours: String(s.reserveHours ?? 24), shipping_fee: String(s.shippingFee), free_shipping_over: String(s.freeShippingOver), offer_badge_ar: s.offerBadge?.ar || '', offer_badge_en: s.offerBadge?.en || '',
      logo_initials: s.logoInitials || (s.name.ar || s.name.en || s.code || '').trim().replace(/\s+/g, '').slice(0, 2), logo_color: s.logoColor || '#1B1B1B',
    });
    setF(x);
    setInitial(JSON.stringify(x));
  }, [data?.store?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!f) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  const dirty = JSON.stringify(f) !== initial;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = Object.fromEntries(FIELDS.map((k) => [k, f[k]]));
      body.lat = body.lat === '' || body.lat == null ? null : Number(body.lat);
      body.lng = body.lng === '' || body.lng == null ? null : Number(body.lng);
      body.return_days = Math.min(60, Number(body.return_days || 0));
      body.reserve_hours = Math.min(72, Number(body.reserve_hours || 0));
      body.shipping_fee = Number(body.shipping_fee || 0);
      body.free_shipping_over = Number(body.free_shipping_over || 0);
      body.offer_badge_ar = body.offer_badge_ar || null;
      body.offer_badge_en = body.offer_badge_en || null;
      const r = await api('/owner/store', { method: 'PUT', body });
      setStore(r.store);
      setInitial(JSON.stringify(f));
      mutate((d) => ({ ...d, store: r.store }));
      invalidate('/stores/');
      invalidate('/marketplace');
      toast({ title: t('settings.saved') });
    } catch (e) { setErrors(fieldErrors(t, e)); toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };
  const onImage = (slot) => (media, brand) => {
    if (slot === 'logo') { invalidate('/owner/store'); setBrandKey((k) => k + 1); if (brand?.status === 'applied') toast({ title: 'ألوان المتجر اتحدّثت من اللوجو' }); }
    const s = { ...data.store, [slot]: media };
    mutate((d) => ({ ...d, store: s }));
    setStore(s);
    invalidate('/stores/');
  };
  const deleteImage = async (slot) => {
    setDeleteBusy(slot);
    try {
      await api(`/owner/store/${slot}`, { method: 'DELETE' });
      onImage(slot)(null);
      toast({ title: t('settings.imageDeleted') });
      return true;
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); return false; }
    finally { setDeleteBusy(''); }
  };

  return (
    <PageTransition className="pb-24">
      <PageHeader title={t('settings.title')} actions={<Button onClick={save} loading={busy} disabled={!dirty} className="hidden md:inline-flex">{t('common.save')}</Button>} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title={t('settings.general')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.nameAr')} error={errors.name_ar}><Input dir="rtl" value={f.name_ar} onChange={set('name_ar')} /></Field>
              <Field label={t('settings.nameEn')} error={errors.name_en}><Input dir="ltr" value={f.name_en} onChange={set('name_en')} /></Field>
              <Field label={t('settings.taglineAr')}><Input dir="rtl" value={f.tagline_ar} onChange={set('tagline_ar')} /></Field>
              <Field label={t('settings.taglineEn')}><Input dir="ltr" value={f.tagline_en} onChange={set('tagline_en')} /></Field>
              <Field label={t('settings.descAr')}><Textarea dir="rtl" rows={3} value={f.description_ar} onChange={set('description_ar')} /></Field>
              <Field label={t('settings.descEn')}><Textarea dir="ltr" rows={3} value={f.description_en} onChange={set('description_en')} /></Field>
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm font-medium">{t('settings.departments')}</p>
                <p className="mb-2 text-[13px] text-muted">{t('settings.departmentsHint')}</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.departments')}>
                  {[...depts.list.map((x) => x.slug), ...f.departments.filter((x) => !depts.bySlug.has(x))].map((d) => {
                    const on = f.departments.includes(d);
                    return <button key={d} type="button" aria-pressed={on} onClick={() => setF({ ...f, departments: on ? f.departments.filter((x) => x !== d) : [...f.departments, d] })}
                      className={`h-10 rounded-full border px-4 text-sm font-medium transition active:scale-95 ${on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg'}`}>{depts.label(d)}</button>;
                  })}
                </div>
                {errors.departments && <p className="mt-1 text-sm text-sale">{errors.departments}</p>}
              </div>
            </div>
          </Panel>
          <Panel title="موقع المحل على الخريطة">
            <p className="mb-3 text-sm text-muted">التوصيل دايماً من عندنا (Twist). حدد مكان المحل بالظبط عشان المندوب يستلم الطلبات من عندك، ونحسب سعر الدليفري صح للعميل.</p>
            <LocationPicker
              lat={f.lat === '' ? null : f.lat}
              lng={f.lng === '' ? null : f.lng}
              onChange={(la, ln, place) => setF((prev) => ({
                ...prev,
                lat: la,
                lng: ln,
                map_url: `https://www.google.com/maps?q=${la},${ln}`,
                address_ar: !prev.address_ar?.trim() && place?.shortName ? place.shortName : prev.address_ar,
              }))}
            />
          </Panel>
          <Panel title={t('settings.contact')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.phone')}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} className="text-start" /></Field>
              <Field label={t('settings.whatsapp')}><Input dir="ltr" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} className="text-start" /></Field>
              <Field label={t('settings.opensAt')} error={errors.opens_at}><Input type="time" dir="ltr" value={f.opens_at} onChange={set('opens_at')} /></Field>
              <Field label={t('settings.closesAt')} error={errors.closes_at}><Input type="time" dir="ltr" value={f.closes_at} onChange={set('closes_at')} /></Field>
              <Field label={t('settings.dayOff')}>
                <select className="h-11 w-full rounded-xl border border-line bg-surface px-3" value={f.day_off} onChange={set('day_off')}>
                  <option value="">{t('settings.noDayOff')}</option>
                  {t('analytics.weekdays').split(',').map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </Field>
              <Field label={t('settings.instagram')}><Input dir="ltr" prefix="@" value={f.instagram} onChange={set('instagram')} /></Field>
              <Field label={t('settings.facebook')}><Input dir="ltr" value={f.facebook} onChange={set('facebook')} className="text-start" /></Field>
              <Field label={t('settings.tiktok')}><Input dir="ltr" prefix="@" value={f.tiktok} onChange={set('tiktok')} placeholder="username" /></Field>
              <Field label={t('settings.addressAr')}>
                <PlaceAutocomplete
                  value={f.address_ar}
                  onChange={(v) => setF((prev) => ({ ...prev, address_ar: v }))}
                  onSelect={(place) => {
                    if (place.lat && place.lng) {
                      setF((prev) => ({
                        ...prev,
                        address_ar: place.name || place.shortName || prev.address_ar,
                        lat: place.lat,
                        lng: place.lng,
                        map_url: `https://www.google.com/maps?q=${place.lat},${place.lng}`,
                      }));
                    }
                  }}
                  placeholder="ابحث عن شارع أو معلم (مثلاً: شارع كلية التجارة، مسجد الخضر)…"
                />
              </Field>
              <Field label={t('settings.addressEn')}><Input dir="ltr" value={f.address_en} onChange={set('address_en')} /></Field>
            </div>
          </Panel>
          <Panel title={t('settings.shipping')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.shippingFee')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.shipping_fee} onChange={(e) => setF({ ...f, shipping_fee: e.target.value.replace(/\D/g, '') })} /></Field>
              <div className="sm:col-span-2">
                <Switch checked={Number(f.free_shipping_over) > 0} onChange={(on) => setF({ ...f, free_shipping_over: on ? (Number(f.free_shipping_over) > 0 ? f.free_shipping_over : '1500') : '0' })}
                  label="شحن مجاني لمحلي" description="مقفول لحد ما تفتحه. لو فتحته، الزبون ميدفعش شحن لما طلبه من محلك يوصل للحد اللي تحدده." />
                {Number(f.free_shipping_over) > 0 && (
                  <Field className="mt-3 sm:max-w-xs" label={t('settings.freeOver')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.free_shipping_over} onChange={(e) => setF({ ...f, free_shipping_over: e.target.value.replace(/\D/g, '') })} /></Field>
                )}
              </div>
              <ReturnsBox days={f.return_days} onDays={(v) => setF({ ...f, return_days: v })} />
              <ReserveBox hours={f.reserve_hours} hasPlace={Boolean(f.address_ar || f.map_url || f.lat)} onHours={(v) => setF({ ...f, reserve_hours: v })} />
              <Field label={t('settings.badgeAr')} hint={t('settings.badgeHint')}><Input dir="rtl" value={f.offer_badge_ar} onChange={set('offer_badge_ar')} maxLength={30} /></Field>
              <Field label={t('settings.badgeEn')}><Input dir="ltr" value={f.offer_badge_en} onChange={set('offer_badge_en')} maxLength={30} /></Field>
            </div>
          </Panel>
        </div>
        <div className="space-y-4 lg:sticky lg:top-6">
          <Panel title={t('settings.brand')}>
            <div className="space-y-5">
              <ImageSlot label={t('settings.logo')} media={data.store.logo} slot="logo" ratio="1 / 1" round onUploaded={onImage('logo')} onDelete={() => deleteImage('logo')} deleteBusy={deleteBusy === 'logo'} />
              <BrandPaletteCard key={brandKey} compact />
              <div className="space-y-3 rounded-2xl border border-line p-3">
                <p className="text-sm font-semibold">شعار بالحروف (بدون تكلفة)</p>
                <div className="flex items-end gap-3">
                  <Field label="أول حرفين" hint="عربي أو إنجليزي"><Input maxLength={2} value={f.logo_initials} onChange={(e) => setF({ ...f, logo_initials: [...e.target.value].slice(0, 2).join('') })} /></Field>
                  <label className="grid gap-1 text-sm font-medium">اللون<input aria-label="لون شعار الحروف" type="color" value={f.logo_color} onChange={(e) => setF({ ...f, logo_color: e.target.value })} className="h-11 w-16 cursor-pointer rounded-lg border border-line bg-transparent p-1" /></label>
                  <span className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: f.logo_color }}>{f.logo_initials || data.store.code}</span>
                </div>
                <p className="text-xs text-muted">بيظهر الشعار بالحروف لو مفيش صورة شعار مرفوعة.</p>
              </div>
<div>
                <ImageSlot label={t('settings.cover')} media={data.store.cover} slot="cover" ratio="natural" onUploaded={onImage('cover')} onDelete={() => deleteImage('cover')} deleteBusy={deleteBusy === 'cover'} />
                <AutoCover onDone={onImage('cover')} />
                <DesignHelp what="cover" className="mt-3" />
                <HeroModePicker value={f.hero_mode} onChange={(v) => setF({ ...f, hero_mode: v })} />
                <PhotoStylePicker value={f.photo_style} onChange={(v) => setF({ ...f, photo_style: v })} />
              </div>
            </div>
          </Panel>
          <Link to="/dashboard/theme" className="group flex items-center gap-4 rounded-2xl border border-line bg-elevated p-4 transition hover:border-line-strong">
            <span className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ background: `rgb(${data.store.theme.cssVars['--c-primary']})` }}><Palette className="h-5 w-5" /></span>
            <span className="flex-1"><span className="block font-semibold">{t('theme.title')}</span><span className="block text-sm text-muted">{t('settings.theme')}</span></span>
            <ArrowUpRight className="h-5 w-5 text-muted transition group-hover:text-fg rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
      {dashBase === '/dashboard' && <div className="mt-6"><ChangePassword /></div>}
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md md:hidden">
          <Button full onClick={save} loading={busy}>{t('common.save')}</Button>
        </div>
      )}
    </PageTransition>
  );
}
