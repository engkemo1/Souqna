import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash2, ChevronDown, Plus, X, Check, Eye, Info, Package, Sparkles, Loader2, Search, Pencil, Circle, ExternalLink, CheckCircle2, MessageCircle } from 'lucide-react';
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
  name_ar: '', name_en: '', description_ar: '', description_en: '', price: '', compare_at_price: '', cost: '', sku: '', barcode: '', variantCodes: {},
  category_id: '', audience: '', moda_key: '', style_level: '', badge_text: '', badge_tone: 'brand', status: 'active', featured: false, is_new: false, no_return: false, colors: [], sizes: [], matrix: {}, track_stock: true, stock: 0, low_stock_at: 5,
  media: [], seo_title: '', seo_description: '',
};
const STYLE_LEVELS = [['1', 'بيتي'], ['2', 'كاجوال'], ['3', 'شيك'], ['4', 'رسمي'], ['5', 'سواريه']];

const vkey = (c, s) => `${c || '-'}|${s || '-'}`;
const nz = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').trim();

function fromProduct(p) {
  const matrix = {};
  const ids = {};
  const codes = {};
  for (const v of p.variants) { matrix[vkey(v.color, v.size)] = v.stock; ids[vkey(v.color, v.size)] = v.id; codes[vkey(v.color, v.size)] = { sku: v.sku || '', barcode: v.barcode || '' }; }
  return {
    ...EMPTY,
    name_ar: p.name.ar, name_en: p.name.en && p.name.en !== p.name.ar ? p.name.en : '', description_ar: p.description.ar || '', description_en: p.description.en || '',
    price: String(p.price), compare_at_price: p.compareAt ? String(p.compareAt) : '', cost: p.cost != null ? String(p.cost) : '', sku: p.sku || '', barcode: p.barcode || '', variantCodes: codes,
    category_id: p.categoryId ? String(p.categoryId) : '', audience: p.audience || p.suggestedAudience || '', moda_key: p.modaKey || p.suggestedModaKey || '', style_level: p.styleLevel ? String(p.styleLevel) : '', badge_text: p.badgeText || '', badge_tone: p.badgeTone || 'brand', status: p.status, featured: p.featured, is_new: p.isNewFlag, no_return: !!p.noReturn,
    colors: p.colors, sizes: p.sizes, matrix, variantIds: ids, track_stock: p.trackStock, stock: p.stockCount, low_stock_at: p.lowStockAt,
    media: p.media, seo_title: p.seo.title || '', seo_description: p.seo.description || '',
  };
}

function toPayload(f) {
  const colors = f.colors.length ? f.colors : [null];
  const sizes = f.sizes.length ? f.sizes : [null];
  const variants = (f.colors.length || f.sizes.length)
    ? colors.flatMap((c) => sizes.map((s) => ({ id: f.variantIds?.[vkey(c?.hex, s)] ?? null, color: c?.hex ?? null, size: s, stock: Number(f.matrix[vkey(c?.hex, s)] || 0), ...(f.variantCodes?.[vkey(c?.hex, s)] ? { sku: f.variantCodes[vkey(c?.hex, s)].sku || null, barcode: f.variantCodes[vkey(c?.hex, s)].barcode || null } : {}) })))
    : [];
  return {
    name_ar: f.name_ar, name_en: f.name_en, description_ar: f.description_ar, description_en: f.description_en,
    price: Number(f.price), compare_at_price: f.compare_at_price ? Number(f.compare_at_price) : null, cost: f.cost ? Number(f.cost) : null,
    sku: f.sku || null, barcode: f.barcode || null, category_id: f.category_id ? Number(f.category_id) : null, audience: f.audience || null, moda_key: f.moda_key || null, style_level: f.style_level ? Number(f.style_level) : null, badge_text: f.badge_text.trim() || null, badge_tone: f.badge_text.trim() ? f.badge_tone : null, status: f.status, featured: f.featured, is_new: f.is_new, no_return: f.no_return,
    colors: f.colors, sizes: f.sizes, variants, track_stock: f.track_stock, stock: Number(f.stock || 0), low_stock_at: Number(f.low_stock_at || 0),
    media: f.media.map((m) => m.id), primary_media_id: f.media[0]?.id ?? null, seo_title: f.seo_title || null, seo_description: f.seo_description || null,
  };
}

/* --------------------------------------------------------------- building blocks */

function Card({ id, step, title, hint, done, children, className, bare }) {
  return (
    <section id={id} className={cx('scroll-mt-24 rounded-2xl border bg-elevated transition-colors', done ? 'border-line' : 'border-line', className)}>
      {!bare && <header className="flex items-center gap-3 px-5 pt-5 sm:px-6">
        <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular', done ? 'bg-success text-white' : 'bg-fg/[0.07] text-muted')}>{done ? <Check className="h-4 w-4" strokeWidth={3} /> : step}</span>
        <div className="min-w-0"><h2 className="text-base font-semibold leading-tight">{title}</h2>{hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}</div>
      </header>}
      <div className={cx('px-5 pb-5 sm:px-6 sm:pb-6', bare ? 'pt-5' : 'pt-4')}>{children}</div>
    </section>
  );
}

const chipCls = (on) => cx('inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition active:scale-95', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg');

/** اختيار نوع المنتج على طريقة Amazon: الفئة (لمين؟) ← ابحث أو تصفح الأنواع. من النوع بنحدد القسم والمقاسات تلقائي. */
function TypePicker({ tree, audience, typeKey, onChange, error, suggested, customName, onAddSection }) {
  const { lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('');
  const [open, setOpen] = useState(!typeKey);
  const [adding, setAdding] = useState(null);
  const [busy, setBusy] = useState(false);
  const submitAdd = async () => { setBusy(true); const ok = await onAddSection(adding); setBusy(false); if (ok) { setAdding(null); setQ(''); } };
  useEffect(() => { setOpen(!typeKey); }, [typeKey]);
  if (!tree) return <Skeleton className="h-32 rounded-xl" />;
  const found = tree.families.flatMap((f) => f.types.map((t) => ({ ...t, family: f }))).find((t) => t.key === typeKey);
  const aud = tree.audiences.find((a) => a.key === audience);
  const term = nz(q);
  const avail = tree.families.map((f) => ({ ...f, types: f.types.filter((t) => !audience || t.audiences.includes(audience)) })).filter((f) => f.types.length);
  const activeFam = avail.some((f) => f.key === fam) ? fam : avail[0]?.key;
  const shown = term ? avail.map((f) => ({ ...f, types: f.types.filter((t) => nz(t.ar).includes(term)) })).filter((f) => f.types.length) : avail.filter((f) => f.key === activeFam);
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
          <div className="overflow-hidden rounded-2xl border border-line md:grid md:grid-cols-[12rem_minmax(0,1fr)]">
            {!term && (
              <nav aria-label={L('مجموعات الأنواع', 'Type groups')} className="flex gap-1.5 overflow-x-auto border-b border-line bg-secondary/40 p-2 no-scrollbar md:block md:space-y-1 md:overflow-visible md:border-b-0 md:border-e">
                {avail.map((f) => {
                  const on = f.key === activeFam;
                  return <button key={f.key} type="button" aria-pressed={on} onClick={() => setFam(f.key)} className={cx('flex h-10 shrink-0 items-center justify-between gap-3 rounded-xl px-3.5 text-sm font-semibold transition md:w-full', on ? 'bg-fg text-canvas' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}><span>{f.ar}</span><span className={cx('text-xs font-medium', on ? 'text-canvas/70' : 'text-muted')}>{f.types.length}</span></button>;
                })}
              </nav>
            )}
            <div className={cx('p-3 sm:p-4', term && 'md:col-span-2')}>
              {shown.length === 0 && <p className="py-8 text-center text-sm text-muted">{L('مفيش نوع بالاسم ده. جرّب كلمة تانية أو اتصفح المجموعات.', 'No type matches. Try another word or browse.')}</p>}
              <div className="space-y-5">
                {shown.map((f) => (
                  <div key={f.key}>
                    {term && <p className="mb-2 text-[12.5px] font-semibold text-muted">{f.ar}</p>}
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                      {f.types.map((t) => {
                        const on = typeKey === t.key;
                        return <button key={t.key} type="button" onClick={() => { onChange({ moda_key: t.key }); setOpen(false); setQ(''); }} className={cx('flex min-h-[3rem] items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-start text-sm font-medium transition active:scale-[0.98]', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg hover:bg-fg/[0.03]')}><span>{t.ar}</span>{on && <Check className="h-4 w-4 shrink-0" />}</button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {audience && !(found && !open) && (customName ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success/40 bg-success/5 px-4 py-3">
          <div className="min-w-0"><p className="text-[12.5px] text-muted">{L('قسم جديد في متجرك', 'New section in your store')}</p><p className="truncate text-base font-semibold">{customName}</p></div>
          <Check className="h-5 w-5 shrink-0 text-success" strokeWidth={3} />
        </div>
      ) : adding ? (
        <div className="space-y-2.5 rounded-xl border border-dashed border-line-strong p-3">
          <p className="text-[13px] text-muted">{L('اكتب اسم القسم وإحنا نضيفه في متجرك ونختاره للمنتج ده.', 'Name the new section — we add it to your store and pick it.')}</p>
          <Input value={adding.name} autoFocus onChange={(e) => setAdding({ name: e.target.value })} placeholder={L('مثال: شوز', 'e.g. Shoes')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }} />
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={submitAdd} className="h-10 flex-1 rounded-xl bg-fg text-sm font-semibold text-canvas disabled:opacity-60">{busy ? '…' : L('إضافة واختيار', 'Add & select')}</button><button type="button" onClick={() => setAdding(null)} className="h-10 rounded-xl border border-line-strong px-4 text-sm">{L('إلغاء', 'Cancel')}</button></div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding({ name: q.trim() })} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand/10"><Plus className="h-3.5 w-3.5" />{L('مش لاقي نوعك؟ أضف قسم جديد', 'Can’t find it? Add a new section')}</button>
      ))}
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
  const { data: cats, reload: reloadCats } = useApi('/owner/categories');
  const [newCat, setNewCat] = useState(null); // { name, parent } while the inline "add section" form is open
  const [catBusy, setCatBusy] = useState(false);
  const [customType, setCustomType] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const doDelete = async () => {
    setDeleting(true);
    try {
      const r = await api(`/owner/products/${id}`, { method: 'DELETE' });
      invalidate('/owner/products'); invalidate('/owner/overview'); invalidate(`/stores/${store.slug}`);
      setSaving(true);
      toast({ title: r.archived ? t('products.archived') : t('products.deleted') });
      navigate(`${base}/products`, { replace: true });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); setDeleting(false); setDelOpen(false); }
  };
  const addTypeSection = async ({ name: raw }) => {
    const name = (raw || '').trim();
    if (name.length < 2) { toast({ tone: 'error', title: L('اكتب اسم القسم', 'Enter a section name') }); return false; }
    try {
      const r = await api('/owner/categories', { method: 'POST', body: { name_ar: name, name_en: name, parent_id: null } });
      await reloadCats?.();
      set({ category_id: String(r.category.id), moda_key: '' });
      setCustomType(name);
      toast({ title: r.pending ? L(`اتضاف «${name}» في متجرك. هيظهر في السوق بعد موافقة الإدارة`, `Added “${name}”. It shows on the marketplace once the admin accepts it`) : L(`اتضاف قسم «${name}» في متجرك`, `Added “${name}” to your store`) });
      return true;
    } catch (x) {
      if (x.code === 'section_exists') {
        const ex = (cats?.items || []).find((c) => nz(tr(c.name)) === nz(name) || nz(c.name?.ar) === nz(name));
        if (ex) { set({ category_id: String(ex.id), moda_key: '' }); setCustomType(name); toast({ title: L(`اخترنا قسم «${name}» الموجود عندك`, `Selected your existing “${name}” section`) }); return true; }
      }
      toast({ tone: 'error', title: x.code === 'section_exists' ? L('القسم ده موجود عندك بالفعل', 'This section already exists') : x.code === 'too_many_sections' ? L('وصلت للحد الأقصى من الأقسام الخاصة (12)', 'Custom section limit reached (12)') : (errorMessage ? errorMessage(t, x) : (x.message || 'Error')) });
      return false;
    }
  };
  const addCat = async () => {
    const name = (newCat?.name || '').trim();
    const parent = newCat?.parent || '';
    if (name.length < 2) { toast({ tone: 'error', title: L('اكتب اسم القسم', 'Enter a section name') }); return; }
    setCatBusy(true);
    try {
      const r = await api('/owner/categories', { method: 'POST', body: { name_ar: name, name_en: name, parent_id: parent ? Number(parent) : null } });
      await reloadCats?.();
      set({ category_id: String(r.category.id) });
      setNewCat(null);
      toast({ title: r.pending ? L(`اتضاف «${name}» في متجرك. هيظهر في السوق بعد موافقة الإدارة`, `Added “${name}” to your store. It shows on the marketplace once the admin accepts it`) : L(`اتضاف قسم «${name}» في متجرك`, `Added “${name}” to your store`) });
    } catch (x) { toast({ tone: 'error', title: x.code === 'section_exists' ? L('القسم ده موجود عندك بالفعل', 'This section already exists') : x.code === 'too_many_sections' ? L('وصلت للحد الأقصى من الأقسام الخاصة (12)', 'Custom section limit reached (12)') : (errorMessage ? errorMessage(x) : (x.message || 'Error')) }); } finally { setCatBusy(false); }
  };
  const { data: tree } = useApi('/owner/product-types');
  const [f, setF] = useState(EMPTY);
  const [initial, setInitial] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const [adv, setAdv] = useState(false);
  const [published, setPublished] = useState(null);
  const nameRef = useRef(null);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const dirRef = useRef(1);
  const topRef = useRef(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    topRef.current?.querySelector('[aria-current=step]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [step]);

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
  const aud = tree?.audiences?.find((a) => a.key === f.audience);
  const totalStock = useMemo(() => {
    if (!f.track_stock) return null;
    const rows = f.colors.length ? f.colors : [null];
    const cols = f.sizes.length ? f.sizes : [null];
    if (f.colors.length || f.sizes.length) {
      return rows.reduce((sum, c) => sum + cols.reduce((s2, s) => s2 + Number(f.matrix[vkey(c?.hex, s)] || 0), 0), 0);
    }
    return Number(f.stock || 0);
  }, [f.track_stock, f.colors, f.sizes, f.matrix, f.stock]);

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
    if (status === 'active' && !(f.audience && (f.moda_key || customType))) e.type = L('اختار لمين المنتج ونوعه', 'Pick who it is for and the type');
    if (!f.media.length && status === 'active') e.media = t('editor.needImage');
    setErrors(e);
    return e;
  };

  const save = async (statusOverride) => {
    const status = statusOverride || f.status;
    const e = validate(status);
    if (Object.keys(e).length) {
      const first = e.media ? 'images' : e.type ? 'type' : e.name_ar ? 'name' : 'pricing';
      if (isNew) { const k = { images: 0, type: 1, name: 2, pricing: 3 }[first]; dirRef.current = k > step ? 1 : -1; setStep(k); }
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
      if (isNew) {
        if (status === 'draft') {
          navigate(`${base}/products/${r.product.id}`, { replace: true });
        } else {
          setPublished({
            id: r.product.id,
            slug: r.product.slug,
            name: tr(r.product.name) || f.name_ar,
            price: r.product.price || Number(f.price),
            media: r.product.media?.[0] || f.media[0] || null,
          });
        }
      } else { const x = fromProduct({ ...data.product, ...r.product, audience: f.audience, cost: f.cost ? Number(f.cost) : null, status, featured: f.featured, isNewFlag: f.is_new, categoryId: f.category_id ? Number(f.category_id) : null }); setF(x); setInitial(x); }
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
  const done = { images: f.media.length > 0, type: !!(f.audience && (f.moda_key || customType)), name: f.name_ar.trim().length >= 2, pricing: Number(f.price) > 0 };
  const steps = [['images', L('الصور', 'Photos')], ['type', L('النوع', 'Type')], ['name', L('الاسم', 'Name')], ['pricing', L('السعر', 'Price')]];
  const doneCount = steps.filter(([k]) => done[k]).length;
  const goTo = (k) => document.getElementById(k)?.scrollIntoView({ behavior: 'smooth', block: 'center' });


  const WSTEPS = [
    { k: 'images', short: L('الصور', 'Photos'), title: L('صوّر المنتج', 'Add photos'), lead: L('ارفع صورة أو أكتر من موبايلك. أول صورة هي اللي هتظهر للعميل الأول. وبعد ما ترفع، تقدر تخلّي الذكاء الاصطناعي يكتب الاسم والوصف عنك.', 'Upload one or more photos. The first one is the cover.') },
    { k: 'type', short: L('النوع', 'Type'), title: L('إيه المنتج ده؟', 'What is it?'), lead: L('اختار لمين المنتج وإيه نوعه (تيشرت، فستان…). إحنا هنظبط القسم والمقاسات لوحدنا.', 'Pick who it is for and its type.') },
    { k: 'name', short: L('الاسم', 'Name'), title: L('الاسم والوصف', 'Name & description'), lead: L('اكتب اسم بسيط وواضح يفهمه العميل. الوصف اختياري.', 'A short clear name. Description is optional.') },
    { k: 'pricing', short: L('السعر', 'Price'), title: L('بكام؟', 'Price'), lead: L('اكتب سعر البيع. لو في خصم اكتب السعر قبل الخصم وهنظهره مشطوب.', 'Selling price. Add the old price to show a discount.') },
    { k: 'variants', short: L('الكمية', 'Stock'), title: L('الألوان والمقاسات والكمية', 'Colours, sizes & stock'), lead: L('اختياري. لو المنتج له ألوان أو مقاسات حددها، ولو لأ اكتب الكمية بس وكمّل.', 'Optional. Skip if it has no options.') },
    { k: 'publish', short: L('المراجعة', 'Review'), title: L('راجع وانشر', 'Review & publish'), lead: L('ده شكل المنتج عند العميل. لو تمام اضغط «نشر المنتج»، ولو لسه مش جاهز احفظه كمسودة وكمّله بعدين.', 'Check it, then publish — or save as a draft.') },
  ];
  const stepErr = (i) => {
    const e = {};
    if (i === 0 && !f.media.length) e.media = t('editor.needImage');
    if (i === 1 && !(f.audience && (f.moda_key || customType))) e.type = L('اختار لمين المنتج ونوعه', 'Pick who it is for and the type');
    if (i === 2 && f.name_ar.trim().length < 2) e.name_ar = t('field.required');
    if (i === 3) {
      if (!Number(f.price)) e.price = t('field.price_required');
      else if (f.compare_at_price && Number(f.compare_at_price) <= Number(f.price)) e.compare_at_price = t('field.compare_gt_price');
    }
    return e;
  };
  const gotoStep = (n) => { dirRef.current = n > step ? 1 : -1; setErrors({}); setStep(n); };
  const nextStep = () => {
    const e = stepErr(step);
    if (Object.keys(e).length) { setErrors(e); toast({ tone: 'error', title: Object.values(e)[0] }); return; }
    const n = Math.min(step + 1, WSTEPS.length - 1);
    setMaxStep((m) => Math.max(m, n));
    gotoStep(n);
  };
  const W = WSTEPS[step];
  const wizProgress = (
    <div className="mb-5 rounded-2xl border border-line bg-elevated px-4 py-3.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold">{L(`الخطوة ${step + 1} من ${WSTEPS.length}`, `Step ${step + 1} of ${WSTEPS.length}`)}</span>
        <span className="text-muted">{W.short}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/[0.08]" role="progressbar" aria-valuemin={1} aria-valuemax={WSTEPS.length} aria-valuenow={step + 1}>
        <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${((step + 1) / WSTEPS.length) * 100}%` }} transition={{ type: 'spring', stiffness: 220, damping: 28 }} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {WSTEPS.map((x, i) => {
          const can = i <= maxStep;
          return (
            <button key={x.k} type="button" disabled={!can} onClick={() => gotoStep(i)} aria-current={i === step ? 'step' : undefined}
              className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition', i === step ? 'bg-btn text-on-btn' : i < step ? 'bg-success/10 text-success' : can ? 'bg-fg/[0.06] text-fg' : 'bg-fg/[0.04] text-muted/60')}>
              {i < step ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="tabular">{i + 1}</span>}{x.short}
            </button>
          );
        })}
      </div>
    </div>
  );
  const wizHead = (
    <div className="mb-4 px-1">
      <h2 className="text-xl font-bold leading-tight">{W.title}</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">{W.lead}</p>
    </div>
  );
  const wizBar = (
    <div className={cx('z-20 flex items-center gap-3', desktop ? 'mt-6' : 'fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md')}>
      {step > 0 && <Button variant="outline" className="shrink-0" onClick={() => gotoStep(step - 1)} disabled={saving}>{L('رجوع', 'Back')}</Button>}
      {step < WSTEPS.length - 1 ? (
        <div className="flex flex-1 items-center gap-3">
          {step === 4 && <Button variant="outline" onClick={nextStep}>{L('تخطّي', 'Skip')}</Button>}
          <Button full className={desktop ? 'ms-auto min-w-[160px] w-auto' : undefined} onClick={nextStep}>{L('التالي', 'Next')}</Button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <Button variant="outline" onClick={() => save('draft')} disabled={saving}>{L('حفظ كمسودة', 'Save draft')}</Button>
          <Button full className={desktop ? 'ms-auto min-w-[160px] w-auto' : undefined} onClick={() => save('active')} loading={saving}>{L('نشر المنتج', 'Publish')}</Button>
        </div>
      )}
    </div>
  );

  const header = (
    <PageHeader back={`${base}/products`} title={isNew ? t('editor.new') : tr({ ar: f.name_ar, en: f.name_en || f.name_ar }) || t('editor.edit')}
      subtitle={!isNew && dirty ? <span className="inline-flex items-center gap-1.5 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500" />{t('editor.unsaved')}</span> : null}
      actions={isNew ? null : (
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
    <Card id="publish" bare={isNew} step={6} title={L('النشر', 'Publishing')} done={false}>
      <div className="space-y-5">
        {isNew && (
          <div className="border-b border-line pb-3">
            <h3 className="text-sm font-semibold">{L('خيارات إضافية (اختياري)', 'Additional options (optional)')}</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">{L('تقدر تحدد قسم في متجرك أو تميز المنتج كجديد.', 'You can assign a collection or mark as featured/new.')}</p>
          </div>
        )}
        {!isNew && <Field label={t('editor.status')}>
          <Segmented value={f.status} onChange={(s) => set({ status: s })} className="w-full [&>button]:flex-1" options={['active', 'draft'].map((s) => ({ value: s, label: t(`products.status.${s}`) }))} />
        </Field>}
        {cats?.items && (
          <Field label={L('المجموعة في متجرك', 'Collection in your store')} optional={t('common.optional')} hint={L('بترتّب منتجاتك في صفحة المحل (زي: هوديز، شتوي).', 'Groups products on your store page.')}>
            <Select value={f.category_id} onChange={(e) => set({ category_id: e.target.value })}>
              <option value="">{L('من غير مجموعة', 'No collection')}</option>
              {cats.items.filter((c) => !c.parentId).flatMap((c) => [c, ...cats.items.filter((k) => k.parentId === c.id)]).map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{tr(c.name)}</option>)}
            </Select>
            {newCat ? (
              <div className="mt-3 space-y-2.5 rounded-xl border border-dashed border-line-strong p-3">
                <Input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder={L('اسم القسم الجديد (مثال: هوديز)', 'New section name')} aria-label={L('اسم القسم الجديد', 'New section name')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} />
                {(cats?.items || []).some((c) => !c.parentId) && (
                  <Select value={newCat.parent} onChange={(e) => setNewCat({ ...newCat, parent: e.target.value })}>
                    <option value="">{L('قسم رئيسي مستقل', 'Standalone main section')}</option>
                    {cats.items.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{tr(c.name)}</option>)}
                  </Select>
                )}
                <div className="flex gap-2"><button type="button" disabled={catBusy} onClick={addCat} className="h-10 flex-1 rounded-xl bg-fg text-sm font-semibold text-canvas disabled:opacity-60">{catBusy ? '…' : L('إضافة واختيار', 'Add & select')}</button><button type="button" onClick={() => setNewCat(null)} className="h-10 rounded-xl border border-line-strong px-4 text-sm">{L('إلغاء', 'Cancel')}</button></div>
              </div>
            ) : (
              <button type="button" onClick={() => setNewCat({ name: '', parent: '' })} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand/10"><Plus className="h-3.5 w-3.5" />{L('مش لاقي القسم؟ أضف قسم جديد', 'Add a new section')}</button>
            )}
          </Field>
        )}
        <Switch label={t('editor.featured')} description={t('editor.featuredHint')} checked={f.featured} onChange={(v) => set({ featured: v })} />
        <Switch label={t('editor.markNew')} description={t('editor.markNewHint')} checked={f.is_new} onChange={(v) => set({ is_new: v })} />
        <Switch label={t('editor.noReturn')} description={t('editor.noReturnHint')} checked={f.no_return} onChange={(v) => set({ no_return: v })} />
      </div>
    </Card>
  );

  const main = (
    <div className="min-w-0 space-y-4">
      {(!isNew || step === 0) && (<Card id="images" bare={isNew} step={1} title={L('صور المنتج', 'Product photos')} hint={L('أول صورة هي الغلاف. الصور الواضحة بتبيع أكتر.', 'The first photo is the cover.')} done={done.images}>
        <MediaUploader value={f.media} onChange={(media) => { set({ media }); if (media.length) setErrors((x) => ({ ...x, media: undefined })); }} error={errors.media} />
        {f.media.length > 0 && (
          <button type="button" onClick={aiFill} disabled={aiBusy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-60">
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{L('املا الاسم والوصف والألوان تلقائيًا من الصورة', 'Fill name, description and colours from the photo')}
          </button>
        )}
      </Card>)}

      {(!isNew || step === 1) && (<Card id="type" bare={isNew} step={2} title={L('إيه المنتج؟', 'What is it?')} hint={L('اختار الفئة والنوع مرة واحدة، وإحنا نظبط القسم والمقاسات.', 'Pick it once — we set the department and sizes.')} done={done.type}>
        <TypePicker tree={tree} audience={f.audience} typeKey={f.moda_key} suggested={suggested} error={errors.type} onChange={(p) => { if (p.moda_key) setCustomType(''); set(p); }} customName={customType && !f.moda_key ? customType : ''} onAddSection={addTypeSection} />
      </Card>)}

      {(!isNew || step === 2) && (<Card id="name" bare={isNew} step={3} title={L('الاسم والوصف', 'Name & description')} done={done.name}>
        <div className="space-y-4">
          <Field label={L('اسم المنتج', 'Product name')} error={errors.name_ar} hint={type ? L(`مثال: ${type.ar} ${f.colors[0] ? f.colors[0].name_ar : 'أسود'} قطن`, undefined) : undefined}>
            <Input ref={nameRef} dir="rtl" value={f.name_ar} onChange={(e) => set({ name_ar: e.target.value })} maxLength={120} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }} />
          </Field>
          {!f.name_ar.trim() && (type || aud) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{L('اقتراح بنقرة واحدة:', 'Quick suggestion:')}</span>
              <button
                type="button"
                onClick={() => set({ name_ar: [type?.ar, aud?.ar ? (aud.key === 'men' ? 'رجالي' : aud.key === 'women' ? 'حريمي' : 'أطفال') : null].filter(Boolean).join(' ') })}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/5 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-brand/10 active:scale-95"
              >
                <Sparkles className="h-3 w-3" />
                {[type?.ar, aud?.ar ? (aud.key === 'men' ? 'رجالي' : aud.key === 'women' ? 'حريمي' : 'أطفال') : null].filter(Boolean).join(' ')}
              </button>
            </div>
          )}
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
      </Card>)}

      {(!isNew || step === 3) && (<Card id="pricing" bare={isNew} step={4} title={t('editor.pricing')} done={done.pricing}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('editor.price')} error={errors.price}><Input inputMode="numeric" suffix={t('common.currency')} value={f.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, '') })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }} /></Field>
          <Field label={t('editor.compareAt')} optional={t('common.optional')} hint={!errors.compare_at_price ? t('editor.compareHint') : undefined} error={errors.compare_at_price}><Input inputMode="numeric" suffix={t('common.currency')} value={f.compare_at_price} onChange={(e) => set({ compare_at_price: e.target.value.replace(/\D/g, '') })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }} /></Field>
          {f.compare_at_price && Number(f.compare_at_price) > Number(f.price) && <div className="sm:col-span-2"><span className="rounded-full bg-sale/10 px-3 py-1.5 text-sm font-semibold text-sale">-{Math.round((1 - f.price / f.compare_at_price) * 100)}%</span></div>}
          <Field label={L('سعر التكلفة عليك', 'Cost price')} optional={t('common.optional')} hint={L('خاص بيك فقط لحساب أرباحك — مش هيظهر للعميل نهائيًا.', 'For your eyes only — shoppers will never see this.')}>
            <Input inputMode="numeric" suffix={t('common.currency')} value={f.cost} onChange={(e) => set({ cost: e.target.value.replace(/\D/g, '') })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }} />
          </Field>
          {f.cost && f.price && Number(f.price) > Number(f.cost) && (
            <div className="flex items-center rounded-xl border border-success/30 bg-success/5 p-3.5 text-sm text-success sm:col-span-2">
              <div>
                <span className="font-bold">💰 {L('صافي ربحك في القطعة:', 'Your net profit per piece:')}</span>{' '}
                <span className="font-extrabold tabular text-base">{formatMoney(Number(f.price) - Number(f.cost), lang)}</span>{' '}
                <span className="text-xs font-semibold text-success/80">({margin}% {L('هامش ربح', 'margin')})</span>
              </div>
            </div>
          )}
        </div>
      </Card>)}

      {(!isNew || step === 4) && (<Card id="variants" bare={isNew} step={5} title={L('الألوان والمقاسات والكمية', 'Colours, sizes & stock')} done={f.colors.length > 0 || f.sizes.length > 0 || Number(f.stock) > 0}>
        <div className="space-y-6">
          <VariantsEditor f={f} set={set} sizeKind={sizeKind} typeChosen={!!type} />
          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <Switch label={t('editor.trackStock')} checked={f.track_stock} onChange={(v) => set({ track_stock: v })} />
            {!f.colors.length && !f.sizes.length && f.track_stock && <Field label={t('editor.stock')}><Input inputMode="numeric" value={f.stock} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, '') })} /></Field>}
          </div>
        </div>
      </Card>)}

      {(!isNew) && (<section className="rounded-2xl border border-line bg-elevated">
        <button type="button" onClick={() => setAdv((v) => !v)} aria-expanded={adv} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start sm:px-6">
          <span><span className="text-base font-semibold">{L('إعدادات متقدمة', 'Advanced')}</span><span className="ms-2 text-[13px] text-muted">{L('التكلفة، الكود، الاستخدام، محركات البحث', 'Cost, SKU, use, SEO')}</span></span>
          <ChevronDown className={cx('h-5 w-5 text-muted transition-transform', adv && 'rotate-180')} />
        </button>
        {adv && (
          <div className="space-y-5 border-t border-line px-5 pb-6 pt-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('editor.cost')} hint={t('editor.costHint')} optional={t('common.optional')}><Input inputMode="numeric" suffix={t('common.currency')} value={f.cost} onChange={(e) => set({ cost: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label={t('editor.sku')} optional={t('common.optional')}><Input dir="ltr" value={f.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
              <Field label={L('الباركود', 'Barcode')} optional={t('common.optional')} hint={L('بيربط المنتج بالكاشير', 'Links the product to your cashier')}><Input dir="ltr" value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} /></Field>
              {f.track_stock && <Field label={t('editor.lowStockAt')}><Input inputMode="numeric" value={f.low_stock_at} onChange={(e) => set({ low_stock_at: e.target.value.replace(/\D/g, '') })} /></Field>}
              {margin != null && <p className="rounded-xl bg-secondary px-3 py-2 text-sm font-medium text-brand sm:col-span-3">{t('editor.margin')}: {margin}% · {t('editor.profit')}: {formatMoney(f.price - f.cost, lang)}</p>}
            </div>
            {(f.colors.length > 0 || f.sizes.length > 0) && (
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">{L('أكواد الكاشير لكل لون/مقاس', 'Cashier codes per colour/size')}</summary>
                <p className="mt-1 text-[13px] text-muted">{L('اختياري. الكود أو الباركود اللي بيستخدمه كاشير المحل لكل قطعة، عشان المخزون يتزامن صح.', 'Optional. The code or barcode your cashier uses for each piece, so stock syncs correctly.')}</p>
                <div className="mt-3 space-y-2">
                  {(f.colors.length ? f.colors : [null]).flatMap((c) => (f.sizes.length ? f.sizes : [null]).map((s) => {
                    const key = vkey(c?.hex, s); const cur = f.variantCodes?.[key] || { sku: '', barcode: '' };
                    const setCode = (patch) => set({ variantCodes: { ...f.variantCodes, [key]: { ...cur, ...patch } } });
                    return (
                      <div key={key} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_1fr]">
                        <span className="flex items-center gap-2 text-sm">{c && <span className="h-4 w-4 rounded-full ring-1 ring-line" style={{ background: c.hex }} />}{[c ? (lang === 'ar' ? c.name_ar : c.name_en) : '', s].filter(Boolean).join(' / ')}</span>
                        <Input dir="ltr" placeholder="SKU" value={cur.sku} onChange={(e) => setCode({ sku: e.target.value })} />
                        <Input dir="ltr" placeholder={L('الباركود', 'Barcode')} value={cur.barcode} onChange={(e) => setCode({ barcode: e.target.value })} />
                      </div>
                    );
                  }))}
                </div>
              </details>
            )}
            <Field label={L('مناسب لإيه؟ (بيساعد تويلا ترشّحه للمناسبة الصح)', 'Dress code (helps the stylist match occasions)')} optional={t('common.optional')} hint={styleDefault ? L(`لو سيبتها، بنفترض: ${styleDefault}`, undefined) : undefined}>
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
      </section>)}
    </div>
  );

  const previewCard = (
    f.media[0] && (
        <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
          <img src={`${f.media[0].base}/sm.webp`} alt="" className="aspect-[4/5] w-full object-cover" style={{ backgroundColor: f.media[0].color }} />
          <div className="p-4"><p className="truncate font-medium">{f.name_ar || '—'}</p>
            <p className="mt-1 font-semibold tabular">{f.price ? formatMoney(f.price, lang) : '—'}{f.compare_at_price && <span className="ms-2 text-sm font-normal text-muted line-through">{formatMoney(f.compare_at_price, lang)}</span>}</p></div>
        </div>
    )
  );
  const previewRow = (
    <div className="overflow-hidden rounded-2xl border border-line bg-elevated shadow-sm">
      <div className="flex flex-col gap-4 p-4">
        {f.media[0] ? (
          <div className="relative">
            <img src={`${f.media[0].base}/md.webp`} onError={(e) => { const u = `${f.media[0].base}/sm.webp`; if (e.currentTarget.src !== new URL(u, location.href).href) e.currentTarget.src = u; }} alt="" className="mx-auto aspect-[4/5] w-full max-w-sm rounded-xl object-cover ring-1 ring-line" style={{ backgroundColor: f.media[0].color }} />
            {f.media.length > 1 && (
              <span className="absolute bottom-2 start-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                {L(`${f.media.length} صور`, `${f.media.length} photos`)}
              </span>
            )}
          </div>
        ) : (
          <div className="mx-auto grid aspect-[4/5] w-full max-w-sm place-items-center rounded-xl bg-secondary/50 text-muted ring-1 ring-line">
            <Package className="h-8 w-8" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {(aud || type) ? (
              <p className="text-[12.5px] font-semibold text-brand">
                {[aud ? (lang === 'ar' ? aud.ar : aud.en) : null, type?.ar].filter(Boolean).join(' · ')}
              </p>
            ) : <span />}
            <button type="button" onClick={() => gotoStep(2)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-muted hover:border-brand hover:text-brand transition">
              <Pencil className="h-3 w-3" />
              {L('تعديل', 'Edit')}
            </button>
          </div>
          <h3 className="truncate text-base font-bold text-fg">{f.name_ar || L('بدون اسم', 'Untitled')}</h3>
          {f.name_en && <p className="truncate text-[13px] text-muted">{f.name_en}</p>}
          {f.description_ar && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{f.description_ar}</p>}
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-extrabold tabular text-fg">
              {f.price ? formatMoney(f.price, lang) : '—'}
            </span>
            {f.compare_at_price && Number(f.compare_at_price) > Number(f.price) && (
              <>
                <span className="text-sm font-normal text-muted line-through tabular">
                  {formatMoney(f.compare_at_price, lang)}
                </span>
                <span className="rounded-full bg-sale/10 px-2 py-0.5 text-[11px] font-bold text-sale">
                  -{Math.round((1 - f.price / f.compare_at_price) * 100)}%
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      {(f.colors.length > 0 || f.sizes.length > 0 || totalStock != null) && (
        <div className="border-t border-line bg-secondary/20 p-3">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="text-muted block text-[11px]">{L('الألوان', 'Colours')}</span>
              <span className="font-semibold text-fg mt-0.5 block truncate">
                {f.colors.length > 0 ? L(`${f.colors.length} ألوان`, `${f.colors.length} colours`) : L('افتراضي', 'Default')}
              </span>
            </div>
            <div>
              <span className="text-muted block text-[11px]">{L('المقاسات', 'Sizes')}</span>
              <span className="font-semibold text-fg mt-0.5 block truncate">
                {f.sizes.length > 0 ? f.sizes.join('، ') : L('بدون مقاسات', 'Free size')}
              </span>
            </div>
            <div>
              <span className="text-muted block text-[11px]">{L('المخزون', 'Stock')}</span>
              <span className="font-semibold text-fg mt-0.5 block truncate">
                {totalStock != null ? L(`${totalStock} قطعة`, `${totalStock} pcs`) : L('مستمر', 'Continuous')}
              </span>
            </div>
          </div>
          <div className="mt-2.5 flex justify-center border-t border-line/60 pt-2">
            <button type="button" onClick={() => gotoStep(4)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline">
              <Pencil className="h-3 w-3" />
              {L('تعديل الألوان والمقاسات والكمية', 'Edit variants & stock')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
  const side = (
    <div className="space-y-4 xl:sticky xl:top-6">
      {publishCard}
      {previewCard}
    </div>
  );

  if (isNew) {
    return (
      <div className="pb-32" ref={topRef} style={{ scrollMarginTop: 80 }}>
        {header}
        <div className="mx-auto max-w-2xl">
          {wizProgress}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, x: 28 * dirRef.current * (lang === 'ar' ? -1 : 1) }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 * dirRef.current * (lang === 'ar' ? -1 : 1) }} transition={{ duration: 0.18 }}>
              {wizHead}
              {step === 5 && <div className="mb-4 space-y-4">{previewRow}{publishCard}</div>}
              {step < 5 && main}
            </motion.div>
          </AnimatePresence>
          {wizBar}
        </div>
        <LeaveGuard blocker={blocker} t={t} />
        {published && (
          <PublishSuccessSheet
            published={published}
            store={store}
            onClose={() => navigate(`${base}/products`, { replace: true })}
            onAddAnother={() => {
              setF(EMPTY);
              setInitial(EMPTY);
              setStep(0);
              setMaxStep(0);
              setPublished(null);
            }}
            lang={lang}
            L={L}
            formatMoney={formatMoney}
          />
        )}
      </div>
    );
  }

  return (
    <div className="pb-28">
      {header}
      {progress}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {main}
        {side}
      </div>
      <AnimatePresence>
        {dirty && !desktop && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} className="fixed inset-x-0 bottom-[calc(64px+var(--safe-b))] z-20 flex gap-3 border-t border-line bg-elevated/95 px-4 py-3 backdrop-blur-md">
            <Button variant="outline" onClick={() => setF(initial)}>{t('editor.discard')}</Button>
            <Button full onClick={() => save()} loading={saving}>{t('editor.save')}</Button>
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
      <div className="mt-6 flex justify-center"><button type="button" onClick={() => setDelOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-sale hover:bg-sale/10"><Trash2 className="h-4 w-4" />{L('حذف المنتج', 'Delete product')}</button></div>
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} danger title={t('common.delete')} body={t('products.confirmDelete', { name: tr({ ar: f.name_ar, en: f.name_en || f.name_ar }) })} confirmLabel={t('common.delete')} loading={deleting} onConfirm={doDelete} />
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

function PublishSuccessSheet({ published, store, onClose, onAddAnother, lang, L, formatMoney }) {
  const shareText = L(
    `شوفوا منتجنا الجديد على متجرنا:\n${published.name} بسعر ${formatMoney(published.price, lang)}\n\nطلب ومشاهدة التفاصيل:\n${window.location.origin}/s/${store?.slug}/p/${published.slug}`,
    `Check out our new item:\n${published.name} for ${formatMoney(published.price, lang)}\n\nOrder here:\n${window.location.origin}/s/${store?.slug}/p/${published.slug}`
  );
  return (
    <Sheet open={true} onClose={onClose} title={L('تم النشر بنجاح! 🎉', 'Published successfully! 🎉')} size="md">
      <div className="space-y-5 py-2 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div>
          <h3 className="text-xl font-bold">{L('منتجك معروض الآن في متجرك!', 'Your product is live in your store!')}</h3>
          <p className="mt-1 text-sm text-muted">{published.name} · {formatMoney(published.price, lang)}</p>
        </div>

        <div className="mx-auto max-w-sm rounded-2xl border border-line bg-surface p-3 text-start">
          <div className="flex items-center gap-3">
            {published.media && (
              <img src={`${published.media.base}/sm.webp`} alt="" className="h-16 w-14 rounded-xl object-cover ring-1 ring-line" style={{ backgroundColor: published.media.color }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{published.name}</p>
              <p className="mt-0.5 font-bold tabular text-brand">{formatMoney(published.price, lang)}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-white shadow-sm transition hover:bg-[#20ba59] active:scale-[0.99]"
          >
            <MessageCircle className="h-5 w-5 fill-white text-white" />
            {L('مشاركة فورية على واتساب', 'Share on WhatsApp')}
          </a>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              href={`/s/${store?.slug}/p/${published.slug}`}
              target="_blank"
              icon={ExternalLink}
            >
              {L('معاينة في المتجر', 'View in store')}
            </Button>
            <Button
              variant="secondary"
              onClick={onAddAnother}
              icon={Plus}
            >
              {L('إضافة منتج تاني', 'Add another')}
            </Button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 block w-full text-center text-sm font-semibold text-muted hover:text-fg"
          >
            {L('الذهاب إلى قائمة المنتجات', 'Go to products list')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
