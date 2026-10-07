import { useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Plus, X, Check, Eye, Info, Package } from 'lucide-react';
import { onColor } from '@souqna/shared/theme';
import { useApi, useIsDesktop, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { formatMoney } from '../../lib/format.js';
import { PageHeader } from '../../components/dash/Kit.jsx';
import MediaUploader from '../../components/dash/MediaUploader.jsx';
import { Field, Input, Textarea, Select, Switch, Segmented } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';

const SIZE_SETS = [['XS', 'S', 'M', 'L', 'XL', 'XXL'], ['28', '30', '32', '34', '36', '38', '40'], ['One size']];
const PRESET_COLORS = [
  ['#1C1C1E', 'أسود', 'Black'], ['#F4F3EF', 'أبيض', 'White'], ['#8E9096', 'رمادي', 'Grey'], ['#1F2B4D', 'كحلي', 'Navy'], ['#30558F', 'أزرق', 'Blue'],
  ['#B3343A', 'أحمر', 'Red'], ['#6E2433', 'نبيتي', 'Burgundy'], ['#3F7A55', 'أخضر', 'Green'], ['#4E5A3A', 'زيتي', 'Olive'], ['#D9C6A5', 'بيج', 'Beige'],
  ['#7A5634', 'بني', 'Brown'], ['#E2C044', 'أصفر', 'Yellow'], ['#E07A3A', 'برتقالي', 'Orange'], ['#6C4E8C', 'بنفسجي', 'Purple'], ['#E8A5B5', 'بينك', 'Pink'],
];

const EMPTY = {
  name_ar: '', name_en: '', description_ar: '', description_en: '', price: '', compare_at_price: '', cost: '', sku: '',
  category_id: '', status: 'active', featured: false, is_new: false, colors: [], sizes: [], matrix: {}, track_stock: true, stock: 0, low_stock_at: 5,
  media: [], seo_title: '', seo_description: '',
};

const vkey = (c, s) => `${c || '-'}|${s || '-'}`;

function fromProduct(p) {
  const matrix = {};
  const ids = {};
  for (const v of p.variants) { matrix[vkey(v.color, v.size)] = v.stock; ids[vkey(v.color, v.size)] = v.id; }
  return {
    ...EMPTY,
    name_ar: p.name.ar, name_en: p.name.en, description_ar: p.description.ar || '', description_en: p.description.en || '',
    price: String(p.price), compare_at_price: p.compareAt ? String(p.compareAt) : '', cost: p.cost != null ? String(p.cost) : '', sku: p.sku || '',
    category_id: p.categoryId ? String(p.categoryId) : '', status: p.status, featured: p.featured, is_new: p.isNewFlag,
    colors: p.colors, sizes: p.sizes, matrix, variantIds: ids, track_stock: p.trackStock, stock: p.stockCount, low_stock_at: p.lowStockAt,
    media: p.media, seo_title: p.seo.title || '', seo_description: p.seo.description || '',
  };
}

function toPayload(f) {
  const colors = f.colors.length ? f.colors : [null];
  const sizes = f.sizes.length ? f.sizes : [null];
  const variants = (f.colors.length || f.sizes.length)
    ? colors.flatMap((c) => sizes.map((s) => ({ id: f.variantIds?.[vkey(c?.hex, s)] ?? null, color: c?.hex ?? null, size: s, stock: Number(f.matrix[vkey(c?.hex, s)] || 0) })))
    : [];
  return {
    name_ar: f.name_ar, name_en: f.name_en, description_ar: f.description_ar, description_en: f.description_en,
    price: Number(f.price), compare_at_price: f.compare_at_price ? Number(f.compare_at_price) : null, cost: f.cost ? Number(f.cost) : null,
    sku: f.sku || null, category_id: f.category_id ? Number(f.category_id) : null, status: f.status, featured: f.featured, is_new: f.is_new,
    colors: f.colors, sizes: f.sizes, variants, track_stock: f.track_stock, stock: Number(f.stock || 0), low_stock_at: Number(f.low_stock_at || 0),
    media: f.media.map((m) => m.id), primary_media_id: f.media[0]?.id ?? null, seo_title: f.seo_title || null, seo_description: f.seo_description || null,
  };
}

/* --------------------------------------------------------------- sections */

function Section({ id, title, children, collapsible, open, onToggle, done }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-line bg-elevated">
      {collapsible ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start">
          <span className="flex items-center gap-2.5 text-base font-semibold">{done && <span className="grid h-5 w-5 place-items-center rounded-full bg-success text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>}{title}</span>
          <ChevronDown className={cx('h-5 w-5 text-muted transition-transform', open && 'rotate-180')} />
        </button>
      ) : <h2 className="px-5 pt-5 text-base font-semibold sm:px-6">{title}</h2>}
      <AnimatePresence initial={false}>
        {(!collapsible || open) && (
          <motion.div initial={collapsible ? { height: 0, opacity: 0 } : false} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className={cx('px-5 pb-5 sm:px-6 sm:pb-6', collapsible ? 'pt-1' : 'pt-4')}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ColorPicker({ open, onClose, onAdd, existing }) {
  const { t, lang } = useI18n();
  const [custom, setCustom] = useState({ hex: '#2F4A3A', name_ar: '', name_en: '' });
  return (
    <Sheet open={open} onClose={onClose} title={t('editor.addColor')} side="auto" desktop="center" size="md"
      footer={<Button full disabled={!custom.name_ar || !custom.name_en} onClick={() => { onAdd({ ...custom, hex: custom.hex.toUpperCase() }); onClose(); }}>{t('common.add')}</Button>}>
      <div className="grid grid-cols-5 gap-3 py-4">
        {PRESET_COLORS.map(([hex, ar, en]) => {
          const used = existing.some((c) => c.hex.toUpperCase() === hex);
          return (
            <button key={hex} type="button" disabled={used} onClick={() => { onAdd({ hex, name_ar: ar, name_en: en }); onClose(); }}
              className="flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-xs transition hover:bg-fg/[0.04] disabled:opacity-30">
              <span className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-inset ring-black/10" style={{ background: hex }}>{used && <Check className="h-4 w-4" style={{ color: onColor(hex) }} />}</span>
              <span className="truncate">{lang === 'ar' ? ar : en}</span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-line py-4">
        <p className="mb-3 text-sm font-semibold">{t('theme.custom')}</p>
        <div className="flex items-end gap-3">
          <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-line" style={{ background: custom.hex }}>
            <input type="color" value={custom.hex} onChange={(e) => setCustom({ ...custom, hex: e.target.value })} className="absolute inset-0 opacity-0" aria-label="Colour" />
          </label>
          <Field label={t('editor.colorNameAr')} className="flex-1"><Input size="sm" value={custom.name_ar} onChange={(e) => setCustom({ ...custom, name_ar: e.target.value })} /></Field>
          <Field label={t('editor.colorNameEn')} className="flex-1"><Input size="sm" value={custom.name_en} onChange={(e) => setCustom({ ...custom, name_en: e.target.value })} /></Field>
        </div>
      </div>
    </Sheet>
  );
}

function VariantsEditor({ f, set }) {
  const { t, tr } = useI18n();
  const [picker, setPicker] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [fill, setFill] = useState('');
  const toggleSize = (s) => set({ sizes: f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s] });
  const rows = f.colors.length ? f.colors : [null];
  const cols = f.sizes.length ? f.sizes : [null];
  const total = rows.reduce((sum, c) => sum + cols.reduce((s2, s) => s2 + Number(f.matrix[vkey(c?.hex, s)] || 0), 0), 0);
  const setCell = (c, s, v) => set({ matrix: { ...f.matrix, [vkey(c?.hex, s)]: v.replace(/\D/g, '') } });
  const hasMatrix = f.colors.length || f.sizes.length;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2.5 text-sm font-medium">{t('editor.colors')}</p>
        <div className="flex flex-wrap gap-2">
          {f.colors.map((c) => (
            <span key={c.hex} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong ps-1.5 pe-1 text-sm font-medium">
              <span className="h-7 w-7 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c.hex }} />
              {tr({ ar: c.name_ar, en: c.name_en })}
              <button type="button" onClick={() => set({ colors: f.colors.filter((x) => x.hex !== c.hex) })} aria-label={t('common.delete')} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-sale"><X className="h-4 w-4" /></button>
            </span>
          ))}
          <button type="button" onClick={() => setPicker(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-4 text-sm font-semibold text-brand hover:border-primary"><Plus className="h-4 w-4" />{t('editor.addColor')}</button>
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-sm font-medium">{t('editor.sizes')}</p>
        <div className="space-y-2.5">
          {SIZE_SETS.map((set_, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              {set_.map((s) => {
                const on = f.sizes.includes(s);
                return <button key={s} type="button" onClick={() => toggleSize(s)} aria-pressed={on} className={cx('h-10 min-w-[3rem] rounded-xl border px-3 text-sm font-semibold transition active:scale-95', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>{s}</button>;
              })}
            </div>
          ))}
          <form className="flex max-w-xs gap-2" onSubmit={(e) => { e.preventDefault(); const s = customSize.trim(); if (s && !f.sizes.includes(s)) set({ sizes: [...f.sizes, s] }); setCustomSize(''); }}>
            <Input size="sm" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder={t('editor.customSize')} maxLength={12} />
            <Button type="submit" size="sm" variant="outline" icon={Plus} aria-label={t('common.add')} />
          </form>
          {f.sizes.filter((s) => !SIZE_SETS.flat().includes(s)).length > 0 && (
            <div className="flex flex-wrap gap-2">{f.sizes.filter((s) => !SIZE_SETS.flat().includes(s)).map((s) => (
              <button key={s} type="button" onClick={() => toggleSize(s)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-fg bg-fg px-3 text-sm font-semibold text-canvas">{s}<X className="h-3.5 w-3.5" /></button>
            ))}</div>
          )}
        </div>
      </div>

      {hasMatrix ? (
        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('editor.variantMatrix')} <span className="text-muted">· {t('editor.totalStock', { n: total })}</span></p>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const m = {}; rows.forEach((c) => cols.forEach((s) => { m[vkey(c?.hex, s)] = fill; })); set({ matrix: m }); }}>
              <Input size="sm" inputMode="numeric" value={fill} onChange={(e) => setFill(e.target.value.replace(/\D/g, ''))} className="w-20" aria-label={t('editor.fillAll')} placeholder="0" />
              <Button type="submit" size="sm" variant="secondary">{t('editor.fillAll')}</Button>
            </form>
          </div>
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-line text-sm">
              <thead><tr className="bg-surface">
                <th className="sticky start-0 z-10 bg-surface px-3 py-2.5 text-start font-medium text-muted" />
                {cols.map((s) => <th key={s ?? '-'} className="px-2 py-2.5 text-center font-semibold">{s ?? t('editor.stock')}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c?.hex ?? '-'} className="border-t border-line">
                    <th className="sticky start-0 z-10 whitespace-nowrap border-t border-line bg-elevated px-3 py-2 text-start font-medium">
                      {c ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c.hex }} />{tr({ ar: c.name_ar, en: c.name_en })}</span> : t('editor.stock')}
                    </th>
                    {cols.map((s) => (
                      <td key={s ?? '-'} className="border-t border-line px-1.5 py-1.5 text-center">
                        <input inputMode="numeric" value={f.matrix[vkey(c?.hex, s)] ?? ''} onChange={(e) => setCell(c, s, e.target.value)} placeholder="0" aria-label={`${c?.name_en || ''} ${s || ''}`}
                          className={cx('h-10 w-16 rounded-lg border bg-elevated text-center tabular outline-none transition focus:border-ring focus:shadow-ring', Number(f.matrix[vkey(c?.hex, s)] || 0) === 0 ? 'border-line text-muted' : 'border-line-strong font-semibold')} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <ColorPicker open={picker} onClose={() => setPicker(false)} existing={f.colors} onAdd={(c) => set({ colors: [...f.colors, c] })} />
    </div>
  );
}

/* --------------------------------------------------------------- page */

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { t, tr, lang } = useI18n();
  const { store } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const { data, error, loading, reload } = useApi(isNew ? null : `/owner/products/${id}`, { keepPrevious: false });
  const { data: cats } = useApi('/owner/categories');
  const [f, setF] = useState(EMPTY);
  const [initial, setInitial] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState({ basic: true, images: true });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (data?.product) { const x = fromProduct(data.product); setF(x); setInitial(x); }
    if (isNew) { setF(EMPTY); setInitial(EMPTY); }
  }, [data, isNew]);

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const dirty = useMemo(() => JSON.stringify(toPayload(f)) !== JSON.stringify(toPayload(initial)), [f, initial]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  const validate = () => {
    const e = {};
    if (f.name_ar.trim().length < 2) e.name_ar = t('field.required');
    if (f.name_en.trim().length < 2) e.name_en = t('field.required');
    if (!Number(f.price)) e.price = t('field.price_required');
    if (f.compare_at_price && Number(f.compare_at_price) <= Number(f.price)) e.compare_at_price = t('field.compare_gt_price');
    if (!f.media.length && f.status === 'active') e.media = t('editor.needImage');
    setErrors(e);
    return e;
  };

  const save = async () => {
    const e = validate();
    if (Object.keys(e).length) {
      const firstSection = e.media ? 'images' : e.price || e.compare_at_price ? 'pricing' : 'basic';
      setOpen((o) => ({ ...o, [firstSection]: true }));
      if (!desktop && isNew) setStep(STEPS.findIndex((s) => s.id === firstSection));
      setTimeout(() => document.getElementById(firstSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      toast({ tone: 'error', title: t('error.validation_failed') });
      return;
    }
    setSaving(true);
    try {
      const r = await api(isNew ? '/owner/products' : `/owner/products/${id}`, { method: isNew ? 'POST' : 'PUT', body: toPayload(f) });
      invalidate('/owner/products');
      invalidate('/owner/overview');
      invalidate(`/stores/${store.slug}`);
      setInitial(f);
      toast({ title: isNew ? t('editor.created') : t('editor.saved'), image: r.product.media?.[0] ? `${r.product.media[0].base}/thumb.webp` : undefined });
      if (isNew) navigate(`/dashboard/products/${r.product.id}`, { replace: true });
      else { const x = fromProduct({ ...data.product, ...r.product, cost: f.cost ? Number(f.cost) : null, status: f.status, featured: f.featured, isNewFlag: f.is_new, categoryId: f.category_id ? Number(f.category_id) : null }); setF(x); setInitial(x); }
    } catch (err) {
      const fe = fieldErrors(t, err);
      setErrors(fe);
      toast({ tone: 'error', title: errorMessage(t, err) });
    }
    setSaving(false);
  };

  if (error) return error.status === 404 ? <EmptyState icon={Package} title={t('editor.notFound')} /> : <ErrorState error={error} onRetry={reload} />;
  if (!isNew && loading && !data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-60" /><div className="grid gap-4 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div><Skeleton className="h-72 rounded-2xl" /></div></div>;
  }

  const margin = f.cost && f.price ? Math.round(((f.price - f.cost) / f.price) * 100) : null;
  const S = {
    basic: (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('editor.nameAr')} error={errors.name_ar}><Input dir="rtl" value={f.name_ar} onChange={(e) => set({ name_ar: e.target.value })} /></Field>
        <Field label={t('editor.nameEn')} error={errors.name_en}><Input dir="ltr" value={f.name_en} onChange={(e) => set({ name_en: e.target.value })} /></Field>
        <Field label={t('editor.descAr')} optional={t('common.optional')}><Textarea dir="rtl" rows={4} value={f.description_ar} onChange={(e) => set({ description_ar: e.target.value })} /></Field>
        <Field label={t('editor.descEn')} optional={t('common.optional')}><Textarea dir="ltr" rows={4} value={f.description_en} onChange={(e) => set({ description_en: e.target.value })} /></Field>
      </div>
    ),
    images: <MediaUploader value={f.media} onChange={(media) => { set({ media }); if (media.length) setErrors((x) => ({ ...x, media: undefined })); }} error={errors.media} />,
    pricing: (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('editor.price')} error={errors.price}><Input inputMode="numeric" suffix={t('common.currency')} value={f.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label={t('editor.compareAt')} hint={!errors.compare_at_price ? t('editor.compareHint') : undefined} error={errors.compare_at_price}><Input inputMode="numeric" suffix={t('common.currency')} value={f.compare_at_price} onChange={(e) => set({ compare_at_price: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label={t('editor.cost')} hint={t('editor.costHint')} optional={t('common.optional')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.cost} onChange={(e) => set({ cost: e.target.value.replace(/\D/g, '') })} /></Field>
        {(margin != null || (f.compare_at_price && Number(f.compare_at_price) > Number(f.price))) && (
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            {margin != null && <span className="rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-brand">{t('editor.margin')}: {margin}% · {t('editor.profit')}: {formatMoney(f.price - f.cost, lang)}</span>}
            {f.compare_at_price && Number(f.compare_at_price) > Number(f.price) && <span className="rounded-full bg-sale/10 px-3 py-1.5 text-sm font-semibold text-sale">-{Math.round((1 - f.price / f.compare_at_price) * 100)}%</span>}
          </div>
        )}
      </div>
    ),
    variants: (
      <div className="space-y-6">
        <VariantsEditor f={f} set={set} />
        <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Switch label={t('editor.trackStock')} checked={f.track_stock} onChange={(v) => set({ track_stock: v })} />
          {!f.colors.length && !f.sizes.length && f.track_stock && <Field label={t('editor.stock')}><Input inputMode="numeric" value={f.stock} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, '') })} /></Field>}
          {f.track_stock && <Field label={t('editor.lowStockAt')}><Input inputMode="numeric" value={f.low_stock_at} onChange={(e) => set({ low_stock_at: e.target.value.replace(/\D/g, '') })} /></Field>}
          <Field label={t('editor.sku')} optional={t('common.optional')}><Input dir="ltr" value={f.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
        </div>
      </div>
    ),
    publishing: (
      <div className="space-y-5">
        <Field label={t('editor.status')}>
          <Segmented value={f.status} onChange={(s) => set({ status: s })} className="w-full [&>button]:flex-1" options={['active', 'draft'].map((s) => ({ value: s, label: t(`products.status.${s}`) }))} />
        </Field>
        <Field label={t('editor.category')}>
          <Select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}>
            <option value="">{t('editor.noCategory')}</option>
            {cats?.items.map((c) => <option key={c.id} value={c.id}>{tr(c.name)}</option>)}
          </Select>
        </Field>
        <Switch label={t('editor.featured')} description={t('editor.featuredHint')} checked={f.featured} onChange={(v) => set({ featured: v })} />
        <Switch label={t('editor.markNew')} description={t('editor.markNewHint')} checked={f.is_new} onChange={(v) => set({ is_new: v })} />
      </div>
    ),
    seo: (
      <div className="space-y-4">
        <Field label={t('editor.seoTitle')} hint={`${(f.seo_title || f.name_en).length}/70`}><Input value={f.seo_title} maxLength={70} placeholder={tr({ ar: f.name_ar, en: f.name_en })} onChange={(e) => set({ seo_title: e.target.value })} /></Field>
        <Field label={t('editor.seoDesc')} hint={`${(f.seo_description || '').length}/170`}><Textarea rows={3} maxLength={170} value={f.seo_description} placeholder={tr({ ar: f.description_ar, en: f.description_en }).slice(0, 160)} onChange={(e) => set({ seo_description: e.target.value })} /></Field>
        <div className="rounded-xl border border-line p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <p className="mb-2 text-xs font-semibold text-muted">{t('editor.seoPreview')}</p>
          <p className="truncate text-xs text-emerald-800" dir="ltr">souqna.app › s › {store.slug} › p</p>
          <p className="mt-0.5 truncate text-lg leading-snug text-[#1a0dab]">{f.seo_title || tr({ ar: f.name_ar, en: f.name_en }) || '—'} · {tr(store.name)}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{f.seo_description || tr({ ar: f.description_ar, en: f.description_en }) || '—'}</p>
        </div>
      </div>
    ),
  };

  const STEPS = [
    { id: 'images', title: t('editor.images') },
    { id: 'basic', title: t('editor.basic') },
    { id: 'pricing', title: t('editor.pricing') },
    { id: 'variants', title: t('editor.variants') },
    { id: 'publishing', title: t('editor.publishing') },
    { id: 'seo', title: t('editor.seo') },
  ];
  const doneMap = { images: f.media.length > 0, basic: f.name_ar && f.name_en, pricing: Number(f.price) > 0, variants: true, publishing: true, seo: !!(f.seo_title || f.seo_description) };
  const header = (
    <PageHeader back="/dashboard/products" title={isNew ? t('editor.new') : tr({ ar: f.name_ar, en: f.name_en }) || t('editor.edit')}
      subtitle={!isNew && dirty ? <span className="inline-flex items-center gap-1.5 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500" />{t('editor.unsaved')}</span> : null}
      actions={(
        <div className="hidden gap-2 md:flex">
          {!isNew && data?.product && <Button variant="outline" icon={Eye} href={`/s/${store.slug}/p/${data.product.slug}`} target="_blank" rel="noreferrer">{t('editor.preview')}</Button>}
          <Button onClick={save} loading={saving} disabled={!isNew && !dirty}>{isNew ? t('editor.publish') : t('editor.save')}</Button>
        </div>
      )} />
  );

  /* ---------- mobile, new product → guided steps ---------- */
  if (!desktop && isNew) {
    const cur = STEPS[step];
    const last = step === STEPS.length - 1;
    return (
      <div className="pb-24">
        {header}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">{cur.title}</span><span className="text-muted tabular">{t('editor.stepOf', { n: step + 1, total: STEPS.length })}</span></div>
          <div className="flex gap-1.5">{STEPS.map((s, i) => <button key={s.id} type="button" onClick={() => setStep(i)} aria-label={s.title} className={cx('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-fg/10')} />)}</div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={cur.id} id={cur.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
            className="rounded-2xl border border-line bg-elevated p-5">{S[cur.id]}</motion.div>
        </AnimatePresence>
        <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 flex gap-3 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md">
          {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>{t('common.back')}</Button>}
          {last ? <Button full onClick={save} loading={saving}>{t('editor.publish')}</Button> : <Button full onClick={() => setStep(step + 1)}>{t('common.next')}</Button>}
        </div>
        <LeaveGuard blocker={blocker} t={t} />
      </div>
    );
  }

  /* ---------- mobile edit → collapsible ---------- */
  if (!desktop) {
    return (
      <div className="pb-24">
        {header}
        <div className="space-y-3">
          {STEPS.map((s) => (
            <Section key={s.id} id={s.id} title={s.title} collapsible open={!!open[s.id]} done={doneMap[s.id]} onToggle={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>{S[s.id]}</Section>
          ))}
        </div>
        <AnimatePresence>
          {dirty && (
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 flex gap-3 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md">
              <Button variant="outline" onClick={() => setF(initial)}>{t('editor.discard')}</Button>
              <Button full onClick={save} loading={saving}>{t('editor.save')}</Button>
            </motion.div>
          )}
        </AnimatePresence>
        <LeaveGuard blocker={blocker} t={t} />
      </div>
    );
  }

  /* ---------- desktop: organised sections + sticky side ---------- */
  return (
    <div className="pb-24">
      {header}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Section id="basic" title={t('editor.basic')}>{S.basic}</Section>
          <Section id="images" title={t('editor.images')}>{S.images}</Section>
          <Section id="pricing" title={t('editor.pricing')}>{S.pricing}</Section>
          <Section id="variants" title={`${t('editor.variants')} & ${t('editor.inventory')}`}>{S.variants}</Section>
          <Section id="seo" title={t('editor.seo')}>{S.seo}</Section>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:sticky xl:top-6 xl:block xl:space-y-5">
          <Section id="publishing" title={t('editor.publishing')}>{S.publishing}</Section>
          {f.media[0] && (
            <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
              <img src={`${f.media[0].base}/sm.webp`} alt="" className="aspect-[4/5] w-full object-cover" style={{ backgroundColor: f.media[0].color }} />
              <div className="p-4"><p className="truncate font-medium">{tr({ ar: f.name_ar, en: f.name_en }) || '—'}</p>
                <p className="mt-1 font-semibold tabular">{f.price ? formatMoney(f.price, lang) : '—'}{f.compare_at_price && <span className="ms-2 text-sm font-normal text-muted line-through">{formatMoney(f.compare_at_price, lang)}</span>}</p></div>
            </div>
          )}
          <p className="flex gap-2 text-[13px] text-muted"><Info className="h-4 w-4 shrink-0" />{t('editor.imagesHint')}</p>
        </div>
      </div>
      <AnimatePresence>
        {dirty && !isNew && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 start-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-neutral-900 py-2.5 pe-2.5 ps-5 text-white shadow-lift rtl:translate-x-1/2 lg:start-[calc(50%+132px)]">
            <span className="text-sm font-medium">{t('editor.unsaved')}</span>
            <button type="button" onClick={() => setF(initial)} className="h-10 rounded-xl px-4 text-sm font-semibold text-white/80 hover:bg-white/10">{t('editor.discard')}</button>
            <Button variant="white" size="sm" onClick={save} loading={saving}>{t('common.save')}</Button>
          </motion.div>
        )}
      </AnimatePresence>
      <LeaveGuard blocker={blocker} t={t} />
    </div>
  );
}

function LeaveGuard({ blocker, t }) {
  return (
    <ConfirmDialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} danger
      title={t('editor.unsaved')} body={t('editor.discard') + '?'} confirmLabel={t('editor.discard')} />
  );
}
