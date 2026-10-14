import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Plus, X, Check, Eye, Info, Package, Sparkles, Loader2, Search, Pencil, Circle } from 'lucide-react';
import { onColor } from '@souqna/shared/theme';
import { useApi, useIsDesktop, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useDashBase } from '../../lib/dashBase.js';
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

const PRESET_COLORS = [
  ['#1C1C1E', 'أسود', 'Black'], ['#F4F3EF', 'أبيض', 'White'], ['#8E9096', 'رمادي', 'Grey'], ['#1F2B4D', 'كحلي', 'Navy'], ['#30558F', 'أزرق', 'Blue'],
  ['#B3343A', 'أحمر', 'Red'], ['#6E2433', 'نبيتي', 'Burgundy'], ['#3F7A55', 'أخضر', 'Green'], ['#4E5A3A', 'زيتي', 'Olive'], ['#D9C6A5', 'بيج', 'Beige'],
  ['#7A5634', 'بني', 'Brown'], ['#E2C044', 'أصفر', 'Yellow'], ['#E07A3A', 'برتقالي', 'Orange'], ['#6C4E8C', 'بنفسجي', 'Purple'], ['#E8A5B5', 'بينك', 'Pink'],
];


const EMPTY = {
  name_ar: '', name_en: '', description_ar: '', description_en: '', price: '', compare_at_price: '', cost: '', sku: '',
  category_id: '', audience: '', moda_key: '', style_level: '', badge_text: '', badge_tone: 'brand', status: 'active', featured: false, is_new: false, colors: [], sizes: [], matrix: {}, track_stock: true, stock: 0, low_stock_at: 5,
  media: [], seo_title: '', seo_description: '',
};
const STYLE_LEVELS = [['1', 'بيتي'], ['2', 'كاجوال'], ['3', 'شيك'], ['4', 'رسمي'], ['5', 'سواريه']];

const vkey = (c, s) => `${c || '-'}|${s || '-'}`;
const nz = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').trim();

function fromProduct(p) {
  const matrix = {};
  const ids = {};
  for (const v of p.variants) { matrix[vkey(v.color, v.size)] = v.stock; ids[vkey(v.color, v.size)] = v.id; }
  return {
    ...EMPTY,
    name_ar: p.name.ar, name_en: p.name.en && p.name.en !== p.name.ar ? p.name.en : '', description_ar: p.description.ar || '', description_en: p.description.en || '',
    price: String(p.price), compare_at_price: p.compareAt ? String(p.compareAt) : '', cost: p.cost != null ? String(p.cost) : '', sku: p.sku || '',
    category_id: p.categoryId ? String(p.categoryId) : '', audience: p.audience || p.suggestedAudience || '', moda_key: p.modaKey || p.suggestedModaKey || '', style_level: p.styleLevel ? String(p.styleLevel) : '', badge_text: p.badgeText || '', badge_tone: p.badgeTone || 'brand', status: p.status, featured: p.featured, is_new: p.isNewFlag,
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
    sku: f.sku || null, category_id: f.category_id ? Number(f.category_id) : null, audience: f.audience || null, moda_key: f.moda_key || null, style_level: f.style_level ? Number(f.style_level) : null, badge_text: f.badge_text.trim() || null, badge_tone: f.badge_text.trim() ? f.badge_tone : null, status: f.status, featured: f.featured, is_new: f.is_new,
    colors: f.colors, sizes: f.sizes, variants, track_stock: f.track_stock, stock: Number(f.stock || 0), low_stock_at: Number(f.low_stock_at || 0),
    media: f.media.map((m) => m.id), primary_media_id: f.media[0]?.id ?? null, seo_title: f.seo_title || null, seo_description: f.seo_description || null,
  };
}

/* --------------------------------------------------------------- building blocks */

function Card({ id, step, title, hint, done, children, className }) {
  return (
    <section id={id} className={cx('scroll-mt-24 rounded-2xl border bg-elevated transition-colors', done ? 'border-line' : 'border-line', className)}>
      <header className="flex items-center gap-3 px-5 pt-5 sm:px-6">
        <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular', done ? 'bg-success text-white' : 'bg-fg/[0.07] text-muted')}>{done ? <Check className="h-4 w-4" strokeWidth={3} /> : step}</span>
        <div className="min-w-0"><h2 className="text-base font-semibold leading-tight">{title}</h2>{hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}</div>
      </header>
      <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

const chipCls = (on) => cx('inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition active:scale-95', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg');

/** اختيار نوع المنتج على طريقة Amazon: الفئة (لمين؟) ← ابحث أو تصفح الأنواع. من النوع بنحدد القسم والمقاسات تلقائي. */
function TypePicker({ tree, audience, typeKey, onChange, error, suggested }) {
  const { lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('all');
  const [open, setOpen] = useState(!typeKey);
  useEffect(() => { setOpen(!typeKey); }, [typeKey]);
  if (!tree) return <Skeleton className="h-32 rounded-xl" />;
  const found = tree.families.flatMap((f) => f.types.map((t) => ({ ...t, family: f }))).find((t) => t.key === typeKey);
  const aud = tree.audiences.find((a) => a.key === audience);
  const term = nz(q);
  const list = tree.families.map((f) => ({ ...f, types: f.types.filter((t) => (!audience || t.audiences.includes(audience)) && (!term || nz(t.ar).includes(term))) })).filter((f) => f.types.length && (fam === 'all' || fam === f.key || term));
  const pickAudience = (key) => { const cur = found; onChange({ audience: key, moda_key: cur && !cur.audiences.includes(key) ? '' : typeKey }); };
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">{L('المنتج لمين؟', 'Who is it for?')}</p>
        <div className="flex flex-wrap gap-2" role="group">
          {tree.audiences.map((a) => <button key={a.key} type="button" aria-pressed={audience === a.key} onClick={() => pickAudience(a.key)} className={chipCls(audience === a.key)}>{lang === 'ar' ? a.ar : a.en}</button>)}
        </div>
      </div>
      {found && !open ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-secondary/40 px-4 py-3">
          <div className="min-w-0"><p className="text-[13px] text-muted">{[aud?.ar, found.family.ar].filter(Boolean).join(' › ')}</p><p className="truncate text-base font-semibold">{found.ar}</p>{suggested && <p className="mt-0.5 text-[12.5px] text-amber-700">{L('اقتراح من اسم المنتج — راجعه', 'Suggested from the name — please check')}</p>}</div>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand/10"><Pencil className="h-3.5 w-3.5" />{L('تغيير', 'Change')}</button>
        </div>
      ) : !audience ? (
        <p className="rounded-xl bg-secondary/50 px-4 py-3 text-sm text-muted">{L('اختار الفئة الأول وهتظهرلك الأنواع المناسبة.', 'Pick who it is for first and the matching types will show.')}</p>
      ) : (
        <div className="space-y-3">
          <div className="relative"><Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} className="ps-10" placeholder={L('ابحث عن النوع: قميص، جزمة، فستان…', 'Search type: shirt, shoes, dress…')} aria-label={L('بحث في الأنواع', 'Search types')} /></div>
          {!term && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {[{ key: 'all', ar: L('الكل', 'All') }, ...tree.families.filter((f) => f.types.some((t) => t.audiences.includes(audience)))].map((f) => <button key={f.key} type="button" onClick={() => setFam(f.key)} className={cx('h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition', fam === f.key ? 'bg-brand text-white' : 'bg-fg/[0.06] text-muted hover:text-fg')}>{f.ar}</button>)}
            </div>
          )}
          <div className="max-h-[22rem] space-y-4 overflow-y-auto rounded-xl pe-1">
            {list.length === 0 && <p className="py-6 text-center text-sm text-muted">{L('مفيش نوع بالاسم ده. جرّب كلمة تانية أو اتصفح الأقسام.', 'No type matches. Try another word or browse.')}</p>}
            {list.map((f) => (
              <div key={f.key}>
                {(fam === 'all' || term) && <p className="mb-1.5 text-[12.5px] font-semibold text-muted">{f.ar}</p>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {f.types.map((t) => <button key={t.key} type="button" onClick={() => { onChange({ moda_key: t.key }); setOpen(false); setQ(''); }} className={cx('min-h-[2.75rem] rounded-xl border px-3 py-2 text-start text-sm font-medium transition active:scale-[0.98]', typeKey === t.key ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>{t.ar}</button>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[13px] font-medium text-sale">{error}</p>}
    </div>
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


function VariantsEditor({ f, set, sizeKind, typeChosen }) {
  const { t, tr, lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [picker, setPicker] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [fill, setFill] = useState('');
  const toggleSize = (s) => set({ sizes: f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s] });
  const toggleColor = ([hex, ar, en]) => set({ colors: f.colors.some((c) => c.hex.toUpperCase() === hex) ? f.colors.filter((c) => c.hex.toUpperCase() !== hex) : [...f.colors, { hex, name_ar: ar, name_en: en }] });
  const rows = f.colors.length ? f.colors : [null];
  const cols = f.sizes.length ? f.sizes : [null];
  const total = rows.reduce((sum, c) => sum + cols.reduce((s2, s) => s2 + Number(f.matrix[vkey(c?.hex, s)] || 0), 0), 0);
  const setCell = (c, s, v) => set({ matrix: { ...f.matrix, [vkey(c?.hex, s)]: v.replace(/\D/g, '') } });
  const hasMatrix = (f.colors.length || f.sizes.length) && f.track_stock;
  const kindSizes = sizeKind?.sizes || [];
  const extra = f.sizes.filter((s) => !kindSizes.includes(s));
  const noSizes = typeChosen && sizeKind && kindSizes.length === 0;
  const customColors = f.colors.filter((c) => !PRESET_COLORS.some(([h]) => h === c.hex.toUpperCase()));

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2.5 text-sm font-medium">{t('editor.colors')} <span className="font-normal text-muted">· {L('اختار كل الألوان المتاحة', 'tick every colour you have')}</span></p>
        <div className="flex flex-wrap gap-2.5">
          {PRESET_COLORS.map((p) => {
            const on = f.colors.some((c) => c.hex.toUpperCase() === p[0]);
            return (
              <button key={p[0]} type="button" onClick={() => toggleColor(p)} aria-pressed={on} title={lang === 'ar' ? p[1] : p[2]} className="flex w-14 flex-col items-center gap-1 text-[11.5px] text-muted">
                <span className={cx('grid h-10 w-10 place-items-center rounded-full ring-1 ring-inset ring-black/10 transition active:scale-90', on && 'ring-2 ring-offset-2 ring-fg ring-offset-elevated')} style={{ background: p[0] }}>{on && <Check className="h-4 w-4" style={{ color: onColor(p[0]) }} strokeWidth={3} />}</span>
                <span className={cx('w-full truncate text-center', on && 'font-semibold text-fg')}>{lang === 'ar' ? p[1] : p[2]}</span>
              </button>
            );
          })}
          {customColors.map((c) => (
            <button key={c.hex} type="button" onClick={() => set({ colors: f.colors.filter((x) => x.hex !== c.hex) })} className="flex w-14 flex-col items-center gap-1 text-[11.5px] font-semibold text-fg" aria-label={t('common.delete')}>
              <span className="grid h-10 w-10 place-items-center rounded-full ring-2 ring-offset-2 ring-fg ring-offset-elevated" style={{ background: c.hex }}><X className="h-4 w-4" style={{ color: onColor(c.hex) }} strokeWidth={3} /></span>
              <span className="w-full truncate text-center">{tr({ ar: c.name_ar, en: c.name_en })}</span>
            </button>
          ))}
          <button type="button" onClick={() => setPicker(true)} className="flex w-14 flex-col items-center gap-1 text-[11.5px] font-semibold text-brand"><span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-line-strong"><Plus className="h-4 w-4" /></span>{L('لون تاني', 'Other')}</button>
        </div>
      </div>

      {noSizes ? (
        <p className="rounded-xl bg-secondary/50 px-4 py-3 text-sm text-muted">{L('النوع ده من غير مقاسات — اكتب الكمية بس.', 'This type has no sizes — just enter the quantity.')}</p>
      ) : (
        <div>
          <p className="mb-2.5 text-sm font-medium">{t('editor.sizes')} {sizeKind && <span className="font-normal text-muted">· {sizeKind.ar}</span>}</p>
          {!typeChosen && <p className="mb-2 text-[13px] text-amber-700">{L('اختار نوع المنتج فوق عشان تظهرلك المقاسات المناسبة له.', 'Pick the product type above to see its sizes.')}</p>}
          <div className="flex flex-wrap gap-2">
            {kindSizes.map((s) => { const on = f.sizes.includes(s); return <button key={s} type="button" onClick={() => toggleSize(s)} aria-pressed={on} className={cx('h-10 min-w-[3rem] rounded-xl border px-3 text-sm font-semibold transition active:scale-95', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>{s}</button>; })}
            {extra.map((s) => <button key={s} type="button" onClick={() => toggleSize(s)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-fg bg-fg px-3 text-sm font-semibold text-canvas">{s}<X className="h-3.5 w-3.5" /></button>)}
          </div>
          <form className="mt-2.5 flex max-w-xs gap-2" onSubmit={(e) => { e.preventDefault(); const s = customSize.trim(); if (s && !f.sizes.includes(s)) set({ sizes: [...f.sizes, s] }); setCustomSize(''); }}>
            <Input size="sm" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder={t('editor.customSize')} maxLength={12} />
            <Button type="submit" size="sm" variant="outline" icon={Plus} aria-label={t('common.add')} />
          </form>
        </div>
      )}

      {hasMatrix ? (
        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{L('الكمية المتاحة', 'Quantity in stock')} <span className="text-muted">· {t('editor.totalStock', { n: total })}</span></p>
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
  const base = useDashBase();
  const { id } = useParams();
  const isNew = !id;
  const { t, tr, lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const { store } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const { data, error, loading, reload } = useApi(isNew ? null : `/owner/products/${id}`, { keepPrevious: false });
  const { data: cats } = useApi('/owner/categories');
  const { data: tree } = useApi('/owner/product-types');
  const [f, setF] = useState(EMPTY);
  const [initial, setInitial] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const [adv, setAdv] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (data?.product) {
      const x = fromProduct(data.product); setF(x); setInitial(x);
      setSuggested(Boolean((!data.product.audience && data.product.suggestedAudience) || (!data.product.modaKey && data.product.suggestedModaKey)));
      setShowEn(Boolean(x.name_en || x.description_en));
    }
    if (isNew) { setF(EMPTY); setInitial(EMPTY); setSuggested(false); }
  }, [data, isNew]);

  const set = (patch) => {
    setF((x) => ({ ...x, ...patch }));
    if ('audience' in patch || 'moda_key' in patch) setSuggested(false);
    setErrors((e) => { const n = { ...e }; for (const k of Object.keys(patch)) { delete n[k]; if (k === 'audience' || k === 'moda_key') delete n.type; } return n; });
  };
  const types = useMemo(() => (tree ? tree.families.flatMap((fm) => fm.types.map((ty) => ({ ...ty, family: fm }))) : []), [tree]);
  const type = types.find((ty) => ty.key === f.moda_key) || null;
  const sizeKind = tree && type ? tree.sizeKinds[type.sizeKind[f.audience || 'unisex']] : null;
  const styleDefault = type?.style ? STYLE_LEVELS.find(([v]) => Number(v) === type.style)?.[1] : null;

  const [aiBusy, setAiBusy] = useState(false);
  const aiFill = async () => {
    const first = f.media[0]; if (!first || aiBusy) return;
    setAiBusy(true);
    try {
      const { suggestion: a } = await api('/owner/ai/product', { method: 'POST', body: { mediaId: first.id, hint: f.name_ar || undefined } });
      const patch = {};
      if (!f.name_ar.trim() && a.name_ar) patch.name_ar = a.name_ar;
      if (!f.name_en.trim() && a.name_en) { patch.name_en = a.name_en; setShowEn(true); }
      if (!f.description_ar.trim() && a.description_ar) patch.description_ar = a.description_ar;
      if (!f.description_en.trim() && a.description_en) patch.description_en = a.description_en;
      if (!f.colors.length && a.colors?.length) patch.colors = a.colors.map((n) => PRESET_COLORS.find((p) => p[2] === n)).filter(Boolean).map(([hex, ar, en]) => ({ hex, name_ar: ar, name_en: en }));
      if (!f.audience && a.department) { const m = { men: 'men', women: 'women', kids: 'kids' }[a.department]; if (m) patch.audience = m; }
      set(patch); toast({ title: t('editor.aiFilled') });
    } catch (err) { toast({ tone: 'error', title: errorMessage(t, err) }); }
    setAiBusy(false);
  };

  const dirty = useMemo(() => JSON.stringify(toPayload(f)) !== JSON.stringify(toPayload(initial)), [f, initial]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  const validate = (status) => {
    const e = {};
    if (f.name_ar.trim().length < 2) e.name_ar = t('field.required');
    if (!Number(f.price)) e.price = t('field.price_required');
    if (f.compare_at_price && Number(f.compare_at_price) <= Number(f.price)) e.compare_at_price = t('field.compare_gt_price');
    if (status === 'active' && !(f.audience && f.moda_key)) e.type = L('اختار لمين المنتج ونوعه', 'Pick who it is for and the type');
    if (!f.media.length && status === 'active') e.media = t('editor.needImage');
    setErrors(e);
    return e;
  };

  const save = async (statusOverride) => {
    const status = statusOverride || f.status;
    const e = validate(status);
    if (Object.keys(e).length) {
      const first = e.media ? 'images' : e.type ? 'type' : e.name_ar ? 'name' : 'pricing';
      setTimeout(() => { document.getElementById(first)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first === 'name') nameRef.current?.focus({ preventScroll: true }); }, 60);
      toast({ tone: 'error', title: Object.values(e)[0] || t('error.validation_failed') });
      return;
    }
    setSaving(true);
    try {
      const r = await api(isNew ? '/owner/products' : `/owner/products/${id}`, { method: isNew ? 'POST' : 'PUT', body: toPayload({ ...f, status }) });
      invalidate('/owner/products');
      invalidate('/owner/overview');
      invalidate(`/stores/${store.slug}`);
      setInitial({ ...f, status });
      toast({ title: isNew ? (status === 'draft' ? L('اتحفظ كمسودة', 'Saved as draft') : t('editor.created')) : t('editor.saved'), image: r.product.media?.[0] ? `${r.product.media[0].base}/thumb.webp` : undefined });
      if (isNew) navigate(`${base}/products/${r.product.id}`, { replace: true });
      else { const x = fromProduct({ ...data.product, ...r.product, audience: f.audience, cost: f.cost ? Number(f.cost) : null, status, featured: f.featured, isNewFlag: f.is_new, categoryId: f.category_id ? Number(f.category_id) : null }); setF(x); setInitial(x); }
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
  const done = { images: f.media.length > 0, type: !!(f.audience && f.moda_key), name: f.name_ar.trim().length >= 2, pricing: Number(f.price) > 0 };
  const steps = [['images', L('الصور', 'Photos')], ['type', L('النوع', 'Type')], ['name', L('الاسم', 'Name')], ['pricing', L('السعر', 'Price')]];
  const doneCount = steps.filter(([k]) => done[k]).length;
  const goTo = (k) => document.getElementById(k)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const header = (
    <PageHeader back={`${base}/products`} title={isNew ? t('editor.new') : tr({ ar: f.name_ar, en: f.name_en || f.name_ar }) || t('editor.edit')}
      subtitle={!isNew && dirty ? <span className="inline-flex items-center gap-1.5 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500" />{t('editor.unsaved')}</span> : null}
      actions={(
        <div className="hidden gap-2 md:flex">
          {!isNew && data?.product && <Button variant="outline" icon={Eye} href={`/s/${store.slug}/p/${data.product.slug}`} target="_blank" rel="noreferrer">{t('editor.preview')}</Button>}
          {isNew && <Button variant="outline" onClick={() => save('draft')} disabled={saving}>{L('حفظ كمسودة', 'Save draft')}</Button>}
          <Button onClick={() => save()} loading={saving} disabled={!isNew && !dirty}>{isNew ? t('editor.publish') : t('editor.save')}</Button>
        </div>
      )} />
  );

  const progress = (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto rounded-2xl border border-line bg-elevated px-3 py-2.5">
      {steps.map(([k, label], i) => (
        <button key={k} type="button" onClick={() => goTo(k)} className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition', done[k] ? 'bg-success/10 text-success' : 'bg-fg/[0.06] text-muted hover:text-fg')}>
          {done[k] ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Circle className="h-3 w-3" />}{i + 1}. {label}
        </button>
      ))}
      <span className="ms-auto shrink-0 ps-2 text-[12.5px] text-muted tabular">{doneCount}/{steps.length}</span>
    </div>
  );

  const publishCard = (
    <Card id="publish" step={6} title={L('النشر', 'Publishing')} done={false}>
      <div className="space-y-5">
        <Field label={t('editor.status')}>
          <Segmented value={f.status} onChange={(s) => set({ status: s })} className="w-full [&>button]:flex-1" options={['active', 'draft'].map((s) => ({ value: s, label: t(`products.status.${s}`) }))} />
        </Field>
        {cats?.items?.length > 0 && (
          <Field label={L('المجموعة في متجرك', 'Collection in your store')} optional={t('common.optional')} hint={L('بترتّب منتجاتك في صفحة المحل (زي: هوديز، شتوي).', 'Groups products on your store page.')}>
            <Select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}>
              <option value="">{L('من غير مجموعة', 'No collection')}</option>
              {cats.items.map((c) => <option key={c.id} value={c.id}>{tr(c.name)}</option>)}
            </Select>
          </Field>
        )}
        <Switch label={t('editor.featured')} description={t('editor.featuredHint')} checked={f.featured} onChange={(v) => set({ featured: v })} />
        <Switch label={t('editor.markNew')} description={t('editor.markNewHint')} checked={f.is_new} onChange={(v) => set({ is_new: v })} />
      </div>
    </Card>
  );

  const main = (
    <div className="min-w-0 space-y-4">
      <Card id="images" step={1} title={L('صور المنتج', 'Product photos')} hint={L('أول صورة هي الغلاف. الصور الواضحة بتبيع أكتر.', 'The first photo is the cover.')} done={done.images}>
        <MediaUploader value={f.media} onChange={(media) => { set({ media }); if (media.length) setErrors((x) => ({ ...x, media: undefined })); }} error={errors.media} />
        {f.media.length > 0 && (
          <button type="button" onClick={aiFill} disabled={aiBusy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-60">
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{L('املا الاسم والوصف والألوان تلقائيًا من الصورة', 'Fill name, description and colours from the photo')}
          </button>
        )}
      </Card>

      <Card id="type" step={2} title={L('إيه المنتج؟', 'What is it?')} hint={L('اختار الفئة والنوع مرة واحدة، وإحنا نظبط القسم والمقاسات.', 'Pick it once — we set the department and sizes.')} done={done.type}>
        <TypePicker tree={tree} audience={f.audience} typeKey={f.moda_key} suggested={suggested} error={errors.type} onChange={set} />
      </Card>

      <Card id="name" step={3} title={L('الاسم والوصف', 'Name & description')} done={done.name}>
        <div className="space-y-4">
          <Field label={L('اسم المنتج', 'Product name')} error={errors.name_ar} hint={type ? L(`مثال: ${type.ar} ${f.colors[0] ? f.colors[0].name_ar : 'أسود'} قطن`, undefined) : undefined}>
            <Input ref={nameRef} dir="rtl" value={f.name_ar} onChange={(e) => set({ name_ar: e.target.value })} maxLength={120} />
          </Field>
          <Field label={L('وصف قصير', 'Short description')} optional={t('common.optional')} hint={L('الخامة، الاستخدام، أي تفصيلة مهمة.', 'Fabric, use, any key detail.')}>
            <Textarea dir="rtl" rows={3} value={f.description_ar} onChange={(e) => set({ description_ar: e.target.value })} />
          </Field>
          {showEn ? (
            <div className="grid gap-4 rounded-xl border border-line bg-secondary/30 p-4 sm:grid-cols-2">
              <Field label={t('editor.nameEn')} optional={t('common.optional')} error={errors.name_en}><Input dir="ltr" value={f.name_en} onChange={(e) => set({ name_en: e.target.value })} /></Field>
              <Field label={t('editor.descEn')} optional={t('common.optional')}><Textarea dir="ltr" rows={2} value={f.description_en} onChange={(e) => set({ description_en: e.target.value })} /></Field>
            </div>
          ) : <button type="button" onClick={() => setShowEn(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><Plus className="h-4 w-4" />{L('إضافة اسم ووصف بالإنجليزي (اختياري)', 'Add English name & description (optional)')}</button>}
        </div>
      </Card>

      <Card id="pricing" step={4} title={t('editor.pricing')} done={done.pricing}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('editor.price')} error={errors.price}><Input inputMode="numeric" suffix={t('common.currency')} value={f.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label={t('editor.compareAt')} optional={t('common.optional')} hint={!errors.compare_at_price ? t('editor.compareHint') : undefined} error={errors.compare_at_price}><Input inputMode="numeric" suffix={t('common.currency')} value={f.compare_at_price} onChange={(e) => set({ compare_at_price: e.target.value.replace(/\D/g, '') })} /></Field>
          {f.compare_at_price && Number(f.compare_at_price) > Number(f.price) && <div className="sm:col-span-2"><span className="rounded-full bg-sale/10 px-3 py-1.5 text-sm font-semibold text-sale">-{Math.round((1 - f.price / f.compare_at_price) * 100)}%</span></div>}
        </div>
      </Card>

      <Card id="variants" step={5} title={L('الألوان والمقاسات والكمية', 'Colours, sizes & stock')} done={f.colors.length > 0 || f.sizes.length > 0 || Number(f.stock) > 0}>
        <div className="space-y-6">
          <VariantsEditor f={f} set={set} sizeKind={sizeKind} typeChosen={!!type} />
          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <Switch label={t('editor.trackStock')} checked={f.track_stock} onChange={(v) => set({ track_stock: v })} />
            {!f.colors.length && !f.sizes.length && f.track_stock && <Field label={t('editor.stock')}><Input inputMode="numeric" value={f.stock} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, '') })} /></Field>}
          </div>
        </div>
      </Card>

      <section className="rounded-2xl border border-line bg-elevated">
        <button type="button" onClick={() => setAdv((v) => !v)} aria-expanded={adv} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start sm:px-6">
          <span><span className="text-base font-semibold">{L('إعدادات متقدمة', 'Advanced')}</span><span className="ms-2 text-[13px] text-muted">{L('التكلفة، الكود، الاستخدام، محركات البحث', 'Cost, SKU, use, SEO')}</span></span>
          <ChevronDown className={cx('h-5 w-5 text-muted transition-transform', adv && 'rotate-180')} />
        </button>
        {adv && (
          <div className="space-y-5 border-t border-line px-5 pb-6 pt-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('editor.cost')} hint={t('editor.costHint')} optional={t('common.optional')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.cost} onChange={(e) => set({ cost: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label={t('editor.sku')} optional={t('common.optional')}><Input dir="ltr" value={f.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
              {f.track_stock && <Field label={t('editor.lowStockAt')}><Input inputMode="numeric" value={f.low_stock_at} onChange={(e) => set({ low_stock_at: e.target.value.replace(/\D/g, '') })} /></Field>}
              {margin != null && <p className="rounded-xl bg-secondary px-3 py-2 text-sm font-medium text-brand sm:col-span-3">{t('editor.margin')}: {margin}% · {t('editor.profit')}: {formatMoney(f.price - f.cost, lang)}</p>}
            </div>
            <Field label={L('مناسب لإيه؟ (بيساعد مودة ترشّحه للمناسبة الصح)', 'Dress code (helps the stylist match occasions)')} optional={t('common.optional')} hint={styleDefault ? L(`لو سيبتها، بنفترض: ${styleDefault}`, undefined) : undefined}>
              <div className="flex flex-wrap gap-2" role="group">
                {[['', L('تلقائي', 'Auto')], ...STYLE_LEVELS].map(([v, label]) => <button key={v} type="button" aria-pressed={f.style_level === v} onClick={() => set({ style_level: v })} className={chipCls(f.style_level === v)}>{label}</button>)}
              </div>
            </Field>
            <Field label={L('شارة مميزة على المنتج', 'Highlight badge')} optional={t('common.optional')} hint={L('جملة قصيرة تظهر على صورة المنتج: "قطن مصري 100%"، "الأكثر طلبًا"، "آخر قطعتين".', 'A short label shown on the product photo.')}>
              <div className="space-y-2.5">
                <Input maxLength={24} value={f.badge_text} onChange={(e) => set({ badge_text: e.target.value })} placeholder={L('مثلاً: الأكثر طلبًا', 'e.g. Best seller')} />
                {f.badge_text.trim() && (
                  <div className="flex flex-wrap items-center gap-2" role="group">
                    {[['brand', L('لون المحل', 'Store colour'), 'bg-primary text-on-primary'], ['sale', L('أحمر', 'Red'), 'bg-sale text-white'], ['dark', L('أسود', 'Black'), 'bg-neutral-900 text-white'], ['gold', L('ذهبي', 'Gold'), 'bg-amber-400 text-neutral-900'], ['green', L('أخضر', 'Green'), 'bg-emerald-600 text-white']].map(([v, label, cls]) => (
                      <button key={v} type="button" aria-pressed={f.badge_tone === v} onClick={() => set({ badge_tone: v })} className={cx('rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95', cls, f.badge_tone === v ? 'ring-2 ring-fg ring-offset-2 ring-offset-canvas' : 'opacity-70')}>{label}</button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <div className="space-y-4 border-t border-line pt-5">
              <p className="text-sm font-semibold">{t('editor.seo')}</p>
              <Field label={t('editor.seoTitle')} hint={`${(f.seo_title || f.name_ar).length}/70`}><Input value={f.seo_title} maxLength={70} placeholder={f.name_ar} onChange={(e) => set({ seo_title: e.target.value })} /></Field>
              <Field label={t('editor.seoDesc')} hint={`${(f.seo_description || '').length}/170`}><Textarea rows={3} maxLength={170} value={f.seo_description} placeholder={f.description_ar.slice(0, 160)} onChange={(e) => set({ seo_description: e.target.value })} /></Field>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const side = (
    <div className="space-y-4 xl:sticky xl:top-6">
      {publishCard}
      {f.media[0] && (
        <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
          <img src={`${f.media[0].base}/sm.webp`} alt="" className="aspect-[4/5] w-full object-cover" style={{ backgroundColor: f.media[0].color }} />
          <div className="p-4"><p className="truncate font-medium">{f.name_ar || '—'}</p>
            <p className="mt-1 font-semibold tabular">{f.price ? formatMoney(f.price, lang) : '—'}{f.compare_at_price && <span className="ms-2 text-sm font-normal text-muted line-through">{formatMoney(f.compare_at_price, lang)}</span>}</p></div>
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-28">
      {header}
      {progress}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {main}
        {side}
      </div>
      <AnimatePresence>
        {(isNew || dirty) && !desktop && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 flex gap-3 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md">
            {isNew ? <Button variant="outline" onClick={() => save('draft')} disabled={saving}>{L('مسودة', 'Draft')}</Button> : <Button variant="outline" onClick={() => setF(initial)}>{t('editor.discard')}</Button>}
            <Button full onClick={() => save()} loading={saving}>{isNew ? t('editor.publish') : t('editor.save')}</Button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dirty && !isNew && desktop && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 start-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-neutral-900 py-2.5 pe-2.5 ps-5 text-white shadow-lift rtl:translate-x-1/2 lg:start-[calc(50%+132px)]">
            <span className="text-sm font-medium">{t('editor.unsaved')}</span>
            <button type="button" onClick={() => setF(initial)} className="h-10 rounded-xl px-4 text-sm font-semibold text-white/80 hover:bg-white/10">{t('editor.discard')}</button>
            <Button variant="white" size="sm" onClick={() => save()} loading={saving}>{t('common.save')}</Button>
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
