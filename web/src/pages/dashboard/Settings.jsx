import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Palette, ArrowUpRight } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api, upload } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../../components/ui/Field.jsx';
import { ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';

const FIELDS = ['name_ar', 'name_en', 'tagline_ar', 'tagline_en', 'description_ar', 'description_en', 'address_ar', 'address_en', 'category', 'phone', 'whatsapp', 'instagram', 'facebook', 'shipping_fee', 'free_shipping_over', 'offer_badge_ar', 'offer_badge_en'];

function ImageSlot({ label, media, slot, ratio, onUploaded, round }) {
  const { t } = useI18n();
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await upload(`/owner/store/${slot}`, fd);
      onUploaded(r.media);
      toast({ title: t('settings.logoUpdated') });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <button type="button" onClick={() => ref.current?.click()} className={`group relative block w-full overflow-hidden bg-surface ring-1 ring-line ${round ? 'h-28 w-28 rounded-full' : 'rounded-2xl'}`}>
        <SmartImage media={media} ratio={ratio} sizes="400px" />
        <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 [@media(hover:none)]:bg-black/25 [@media(hover:none)]:opacity-100">
          {busy ? <Spinner size={24} /> : <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-sm font-semibold"><Camera className="h-4 w-4" />{t('settings.change')}</span>}
        </span>
      </button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const { setStore } = useAuth();
  const toast = useToast();
  const { data, error, reload, mutate } = useApi('/owner/store');
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState('');

  useEffect(() => {
    if (!data) return;
    const s = data.store;
    const x = ({
      name_ar: s.name.ar, name_en: s.name.en, tagline_ar: s.tagline.ar, tagline_en: s.tagline.en, description_ar: s.description.ar, description_en: s.description.en,
      address_ar: s.address.ar, address_en: s.address.en, category: s.category, phone: s.phone || '', whatsapp: s.whatsapp || '', instagram: s.instagram || '', facebook: s.facebook || '',
      shipping_fee: String(s.shippingFee), free_shipping_over: String(s.freeShippingOver), offer_badge_ar: s.offerBadge?.ar || '', offer_badge_en: s.offerBadge?.en || '',
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
  const onImage = (slot) => (media) => {
    const s = { ...data.store, [slot]: media };
    mutate((d) => ({ ...d, store: s }));
    setStore(s);
    invalidate('/stores/');
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
              <Field label={t('settings.category')}>
                <Select value={f.category} onChange={set('category')}>{['men', 'women', 'kids', 'mixed', 'denim', 'sports', 'accessories'].map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</Select>
              </Field>
            </div>
          </Panel>
          <Panel title={t('settings.contact')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.phone')}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} className="text-start" /></Field>
              <Field label={t('settings.whatsapp')}><Input dir="ltr" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} className="text-start" /></Field>
              <Field label={t('settings.instagram')}><Input dir="ltr" prefix="@" value={f.instagram} onChange={set('instagram')} /></Field>
              <Field label={t('settings.facebook')}><Input dir="ltr" value={f.facebook} onChange={set('facebook')} className="text-start" /></Field>
              <Field label={t('settings.addressAr')}><Input dir="rtl" value={f.address_ar} onChange={set('address_ar')} /></Field>
              <Field label={t('settings.addressEn')}><Input dir="ltr" value={f.address_en} onChange={set('address_en')} /></Field>
            </div>
          </Panel>
          <Panel title={t('settings.shipping')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.shippingFee')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.shipping_fee} onChange={(e) => setF({ ...f, shipping_fee: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label={t('settings.freeOver')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.free_shipping_over} onChange={(e) => setF({ ...f, free_shipping_over: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label={t('settings.badgeAr')} hint={t('settings.badgeHint')}><Input dir="rtl" value={f.offer_badge_ar} onChange={set('offer_badge_ar')} maxLength={30} /></Field>
              <Field label={t('settings.badgeEn')}><Input dir="ltr" value={f.offer_badge_en} onChange={set('offer_badge_en')} maxLength={30} /></Field>
            </div>
          </Panel>
        </div>
        <div className="space-y-4 lg:sticky lg:top-6">
          <Panel title={t('settings.brand')}>
            <div className="space-y-5">
              <ImageSlot label={t('settings.logo')} media={data.store.logo} slot="logo" ratio="1 / 1" round onUploaded={onImage('logo')} />
              <ImageSlot label={t('settings.cover')} media={data.store.cover} slot="cover" ratio="16 / 10" onUploaded={onImage('cover')} />
            </div>
          </Panel>
          <Link to="/dashboard/theme" className="group flex items-center gap-4 rounded-2xl border border-line bg-elevated p-4 transition hover:border-line-strong">
            <span className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ background: `rgb(${data.store.theme.cssVars['--c-primary']})` }}><Palette className="h-5 w-5" /></span>
            <span className="flex-1"><span className="block font-semibold">{t('theme.title')}</span><span className="block text-sm text-muted">{t('settings.theme')}</span></span>
            <ArrowUpRight className="h-5 w-5 text-muted transition group-hover:text-fg rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md md:hidden">
          <Button full onClick={save} loading={busy}>{t('common.save')}</Button>
        </div>
      )}
    </PageTransition>
  );
}
