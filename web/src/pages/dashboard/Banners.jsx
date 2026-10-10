import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Plus, Images, Pencil, Trash2, GripVertical, Monitor, Smartphone } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { PageHeader, ListSkeleton } from '../../components/dash/Kit.jsx';
import DesignHelp from '../../components/dash/DesignHelp.jsx';
import MediaUploader from '../../components/dash/MediaUploader.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { IconButton } from '../../components/ui/Button.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Field, Input, Select, Switch, Segmented } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

function Preview({ f, device, lang }) {
  const img = device === 'mobile' ? f.mobile[0] || f.desktop[0] : f.desktop[0];
  const light = f.tone === 'light';
  const title = lang === 'ar' ? f.title_ar : f.title_en;
  const eyebrow = lang === 'ar' ? f.eyebrow_ar : f.eyebrow_en;
  const cta = lang === 'ar' ? f.cta_ar : f.cta_en;
  return (
    <div className={cx('relative mx-auto overflow-hidden rounded-xl bg-surface', device === 'mobile' ? 'aspect-[4/5] w-48' : 'aspect-[2400/1000] w-full')} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {img && <img src={`${img.base}/${img.sizes.find((s) => s.name === 'md')?.name || img.sizes[0].name}.webp`} alt="" className={cx('absolute inset-0 h-full w-full object-cover', f.mirror_rtl && lang === 'ar' && device !== 'mobile' && '-scale-x-100')} />}
      {!light && <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10" />}
      <div className={cx('absolute inset-0 flex p-4', device === 'mobile' ? (light ? 'items-start justify-center text-center' : 'items-end justify-center text-center') : f.align === 'center' ? 'items-center justify-center text-center' : 'items-center')}>
        <div className={cx('max-w-[60%]', device === 'mobile' && 'max-w-full', light ? 'text-neutral-900' : 'text-white')}>
          {eyebrow && <p className="text-[9px] font-semibold tracking-widest opacity-80">{eyebrow}</p>}
          <p className="font-display text-base font-bold leading-tight sm:text-lg">{title || '—'}</p>
          {cta && <span className={cx('mt-2 inline-block rounded-full px-3 py-1 text-[10px] font-semibold', light ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900')}>{cta}</span>}
        </div>
      </div>
    </div>
  );
}

function BannerForm({ open, banner, onClose, onSaved, categories }) {
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const blank = { desktop: [], mobile: [], eyebrow_ar: '', eyebrow_en: '', title_ar: '', title_en: '', subtitle_ar: '', subtitle_en: '', cta_ar: 'تسوّق الآن', cta_en: 'Shop now', link: '/shop', align: 'start', tone: 'dark', mirror_rtl: false, active: true };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [plang, setPlang] = useState(lang);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(banner ? {
      desktop: banner.image ? [banner.image] : [], mobile: banner.mobileImage ? [banner.mobileImage] : [],
      eyebrow_ar: banner.eyebrow.ar, eyebrow_en: banner.eyebrow.en, title_ar: banner.title.ar, title_en: banner.title.en, subtitle_ar: banner.subtitle.ar, subtitle_en: banner.subtitle.en,
      cta_ar: banner.cta.ar, cta_en: banner.cta.en, link: banner.link || '/shop', align: banner.align, tone: banner.tone, mirror_rtl: banner.mirrorRtl, active: banner.active,
    } : blank);
  }, [open, banner]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.desktop.length) { setErrors({ media_id: t('editor.needImage') }); return; }
    setBusy(true);
    try {
      const { desktop, mobile, ...rest } = f;
      const body = { ...rest, media_id: desktop[0].id, mobile_media_id: mobile[0]?.id ?? null };
      const r = await api(banner ? `/owner/banners/${banner.id}` : '/owner/banners', { method: banner ? 'PUT' : 'POST', body });
      onSaved(r.items);
      toast({ title: t('banners.saved') });
      onClose();
    } catch (e) { setErrors(fieldErrors(t, e)); toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusy(false);
  };

  const links = [['/shop', t('store.shopAll')], ['/shop?sort=newest', t('store.newArrivals')], ['/shop?sale=1', t('store.onSale')], ...categories.map((c) => [`/shop?category=${c.slug}`, tr(c.name)])];
  return (
    <Sheet open={open} onClose={onClose} title={banner ? t('common.edit') : t('banners.new')} side="auto" desktop="end" size="lg"
      footer={<Button full size="lg" onClick={save} loading={busy}>{t('common.save')}</Button>}>
      <div className="space-y-6 py-4">
        <div className="rounded-2xl bg-surface p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Segmented size="sm" value={device} onChange={setDevice} options={[{ value: 'desktop', label: <Monitor className="h-4 w-4" aria-label="Desktop" /> }, { value: 'mobile', label: <Smartphone className="h-4 w-4" aria-label="Mobile" /> }]} />
            <Segmented size="sm" value={plang} onChange={setPlang} options={[{ value: 'ar', label: t('banners.ar') }, { value: 'en', label: t('banners.en') }]} />
          </div>
          <Preview f={f} device={device} lang={plang} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('banners.image')} hint={t('banners.imageHint')}>
            <MediaUploader value={f.desktop} onChange={(m) => { setF((x) => ({ ...x, desktop: m.slice(-1) })); setErrors({}); }} kind="banner" max={1} error={errors.media_id} />
          </Field>
          <Field label={t('banners.mobileImage')} hint={t('banners.mobileHint')} optional={t('common.optional')}>
            <MediaUploader value={f.mobile} onChange={(m) => setF((x) => ({ ...x, mobile: m.slice(-1) }))} kind="banner" max={1} />
          </Field>
        </div>
        <DesignHelp what="banner" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('banners.eyebrow')} (AR)`}><Input dir="rtl" value={f.eyebrow_ar} onChange={set('eyebrow_ar')} /></Field>
          <Field label={`${t('banners.eyebrow')} (EN)`}><Input dir="ltr" value={f.eyebrow_en} onChange={set('eyebrow_en')} /></Field>
          <Field optional={t('common.optional')} label={`${t('banners.titleField')} (AR)`} hint={t('banners.textOptional')} error={errors.title_ar}><Input dir="rtl" value={f.title_ar} onChange={set('title_ar')} /></Field>
          <Field optional={t('common.optional')} label={`${t('banners.titleField')} (EN)`} error={errors.title_en}><Input dir="ltr" value={f.title_en} onChange={set('title_en')} /></Field>
          <Field label={`${t('banners.subtitle')} (AR)`}><Input dir="rtl" value={f.subtitle_ar} onChange={set('subtitle_ar')} /></Field>
          <Field label={`${t('banners.subtitle')} (EN)`}><Input dir="ltr" value={f.subtitle_en} onChange={set('subtitle_en')} /></Field>
          <Field label={`${t('banners.cta')} (AR)`}><Input dir="rtl" value={f.cta_ar} onChange={set('cta_ar')} /></Field>
          <Field label={`${t('banners.cta')} (EN)`}><Input dir="ltr" value={f.cta_en} onChange={set('cta_en')} /></Field>
        </div>
        <Field label={t('banners.link')}><Select value={f.link} onChange={set('link')}>{links.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('banners.align')}><Segmented value={f.align} onChange={(v) => setF({ ...f, align: v })} className="w-full [&>button]:flex-1" options={['start', 'center'].map((a) => ({ value: a, label: t(`banners.align.${a}`) }))} /></Field>
          <Field label={t('banners.tone')}><Select value={f.tone} onChange={set('tone')}>{['dark', 'light'].map((x) => <option key={x} value={x}>{t(`banners.tone.${x}`)}</option>)}</Select></Field>
        </div>
        <Switch label={t('banners.mirror')} checked={f.mirror_rtl} onChange={(v) => setF({ ...f, mirror_rtl: v })} />
        <Switch label={t('offers.active')} checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
      </div>
    </Sheet>
  );
}

function Row({ b, onEdit, onDelete, onToggle, onDragEnd, t, tr }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={b} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className="list-none" whileDrag={{ scale: 1.02, boxShadow: '0 20px 40px -20px rgba(0,0,0,.35)' }}>
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <button type="button" onPointerDown={(e) => controls.start(e)} aria-label="Reorder" className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-fg/[0.05] active:cursor-grabbing"><GripVertical className="h-5 w-5" /></button>
          <SmartImage media={b.image} ratio="2400 / 1000" sizes="280px" className="w-full min-w-0 rounded-xl sm:w-64" />
          {b.mobileImage && <SmartImage media={b.mobileImage} ratio="4 / 5" sizes="80px" className="hidden w-[52px] shrink-0 rounded-lg sm:block" />}
        </div>
        <div className="min-w-0 flex-1 px-1 sm:px-0">
          <p className="text-xs font-semibold tracking-wider text-muted">{tr(b.eyebrow)}</p>
          <p className="truncate text-[17px] font-semibold">{tr(b.title)}</p>
          <p className="truncate text-sm text-muted">{tr(b.subtitle)}</p>
          {!b.active && <Badge size="sm" className="mt-2">{t('offers.inactive')}</Badge>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3 sm:border-0 sm:pt-0">
          <Switch checked={b.active} onChange={(v) => onToggle(b, v)} />
          <div className="flex">
            <IconButton size="sm" label={t('common.edit')} icon={Pencil} iconClass="h-4 w-4" onClick={() => onEdit(b)} />
            <IconButton size="sm" label={t('common.delete')} icon={Trash2} iconClass="h-4 w-4 text-sale" onClick={() => onDelete(b)} />
          </div>
        </div>
      </div>
    </Reorder.Item>
  );
}

export default function Banners() {
  const { t, tr } = useI18n();
  const { store } = useAuth();
  const toast = useToast();
  const { data, error, reload, mutate } = useApi('/owner/banners');
  const { data: cats } = useApi('/owner/categories');
  const [form, setForm] = useState({ open: false, banner: null });
  const [del, setDel] = useState(null);
  const items = data?.items || [];
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const refresh = (list) => { mutate({ items: list }); invalidate(`/stores/${store.slug}`); };

  const persistOrder = async (list) => {
    try { const r = await api('/owner/banners-order', { method: 'PUT', body: { ids: list.map((b) => b.id) } }); refresh(r.items); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
  };
  const toggle = async (b, active) => {
    const { image, mobileImage, ...rest } = b;
    try {
      const r = await api(`/owner/banners/${b.id}`, { method: 'PUT', body: { media_id: image.id, mobile_media_id: mobileImage?.id ?? null, eyebrow_ar: rest.eyebrow.ar, eyebrow_en: rest.eyebrow.en, title_ar: rest.title.ar, title_en: rest.title.en, subtitle_ar: rest.subtitle.ar, subtitle_en: rest.subtitle.en, cta_ar: rest.cta.ar, cta_en: rest.cta.en, link: rest.link, align: rest.align, tone: rest.tone, mirror_rtl: rest.mirrorRtl, active } });
      refresh(r.items);
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
  };
  const remove = async () => {
    try { const r = await api(`/owner/banners/${del.id}`, { method: 'DELETE' }); refresh(r.items); toast({ title: t('banners.deleted') }); } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setDel(null);
  };

  return (
    <PageTransition>
      <PageHeader title={t('banners.title')} subtitle={t('banners.modes')} actions={<Button icon={Plus} onClick={() => setForm({ open: true, banner: null })}>{t('banners.new')}</Button>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <ListSkeleton rows={3} /> : !items.length ? (
        <EmptyState icon={Images} title={t('banners.empty')} body={t('banners.emptyBody')} action={<Button icon={Plus} onClick={() => setForm({ open: true, banner: null })}>{t('banners.new')}</Button>} />
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={(list) => mutate({ items: list })} className="space-y-3">
          {items.map((b) => (
            <Row key={b.id} b={b} t={t} tr={tr} onEdit={(x) => setForm({ open: true, banner: x })} onDelete={setDel} onToggle={toggle} onDragEnd={() => persistOrder(itemsRef.current)} />
          ))}
        </Reorder.Group>
      )}
      <BannerForm open={form.open} banner={form.banner} categories={cats?.items || []} onClose={() => setForm({ open: false, banner: null })} onSaved={refresh} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger title={t('common.delete')} body={del ? tr(del.title) : ''} confirmLabel={t('common.delete')} />
    </PageTransition>
  );
}
