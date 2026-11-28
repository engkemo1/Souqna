import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Package, LayoutGrid, List, Pencil, Zap, Trash2, ExternalLink, ShoppingBag, QrCode, Camera, Hourglass, CheckSquare, Check, X, Percent, Tag, Eye, EyeOff } from 'lucide-react';
import { useApi, useDebounced, useIsDesktop, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useDashBase } from '../../lib/dashBase.js';
import { formatMoney, formatNumber } from '../../lib/format.js';
import { PageHeader, FilterTabs, Pagination, SearchInput, ListSkeleton } from '../../components/dash/Kit.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { IconButton } from '../../components/ui/Button.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Field, Input, Select, Segmented } from '../../components/ui/Field.jsx';
import { QtyStepper } from '../../components/ui/Commerce.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState, errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import QrShare from '../../components/dash/QrShare.jsx';
import SaleEnd from '../../components/dash/SaleEnd.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { cx } from '../../components/ui/cx.js';

function StockPill({ p, t, lang }) {
  if (!p.trackStock) return <span className="text-sm text-muted">{t('products.noStockTracking')}</span>;
  if (p.stockStatus === 'out') return <Badge tone="danger" dot>{t('product.outOfStock')}</Badge>;
  if (p.stockStatus === 'low') return <Badge tone="warning" dot>{t('products.inStockUnits', { n: formatNumber(p.stock, lang) })}</Badge>;
  return <span className="text-sm tabular text-fg">{t('products.inStockUnits', { n: formatNumber(p.stock, lang) })}</span>;
}

function StatusPill({ status, t }) {
  const tone = { active: 'success', draft: 'neutral', archived: 'neutral' }[status];
  return <Badge tone={tone} dot>{t(`products.status.${status}`)}</Badge>;
}

/** Bottom-sheet quick edit: price, compare-at, status and stock per variant — built for phones. */
function QuickEdit({ product, onClose, onSaved, onDelete }) {
  const base = useDashBase();
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const { data } = useApi(product ? `/owner/products/${product.id}` : null, { keepPrevious: false });
  const full = data?.product;
  const [form, setForm] = useState(null);
  const [stocks, setStocks] = useState({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!product) return;
    setForm({ price: product.price, compare_at_price: product.compareAt || '', sale_ends_at: product.saleEndsAt || null, status: product.status, stock: product.stock });
    setErrors({});
  }, [product]);
  useEffect(() => { if (full) setStocks(Object.fromEntries(full.variants.map((v) => [v.id, v.stock]))); }, [full]);

  if (!product || !form) return <Sheet open={false} onClose={onClose} />;
  const hasVariants = full?.variants?.length > 0;

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = { price: Number(form.price), compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null, status: form.status };
      if (form.compare_at_price && Number(form.compare_at_price) > Number(form.price)) body.sale_ends_at = form.sale_ends_at ? Number(form.sale_ends_at) : null;
      if (!hasVariants && full) body.stock = Number(form.stock);
      let r = await api(`/owner/products/${product.id}`, { method: 'PATCH', body });
      if (hasVariants) {
        for (const v of full.variants) {
          if (stocks[v.id] !== v.stock) r = { product: { ...r.product, ...(await api(`/owner/variants/${v.id}`, { method: 'PATCH', body: { stock: stocks[v.id] } })).product } };
        }
      }
      invalidate('/owner/products');
      invalidate('/owner/overview');
      onSaved(product.id, r.product);
      toast({ title: t('products.updated') });
      onClose();
    } catch (e) {
      setErrors(fieldErrors(t, e));
      if (!e.fields) toast({ tone: 'error', title: errorMessage(t, e) });
    }
    setBusy(false);
  };

  const colorName = (hex) => {
    const c = full?.colors?.find((x) => x.hex === hex);
    return c ? tr({ ar: c.name_ar, en: c.name_en }) : '';
  };

  return (
    <Sheet open={!!product} onClose={onClose} title={t('products.quickEdit')} description={tr(product.name)} side="auto" desktop="end" size="md"
      footer={<div className="flex gap-3"><Button variant="outline" to={`${base}/products/${product.id}`} icon={Pencil}>{t('common.edit')}</Button><Button full onClick={save} loading={busy}>{t('common.save')}</Button></div>}>
      <div className="space-y-5 py-4">
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
          <SmartImage media={product.image} ratio="1 / 1" sizes="56px" className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="min-w-0"><p className="truncate font-semibold">{tr(product.name)}</p><p className="text-sm text-muted" dir="ltr">{product.sku}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('editor.price')} error={errors.price}><Input inputMode="numeric" suffix={t('common.currency')} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label={t('editor.compareAt')} error={errors.compare_at_price}><Input inputMode="numeric" suffix={t('common.currency')} value={form.compare_at_price} onChange={(e) => setForm({ ...form, compare_at_price: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        {form.compare_at_price && Number(form.compare_at_price) > Number(form.price) && <SaleEnd value={form.sale_ends_at} onChange={(v) => setForm({ ...form, sale_ends_at: v })} error={errors.sale_ends_at} L={(a, e) => (lang === 'ar' ? a : e)} lang={lang} />}
        <Field label={t('editor.status')}>
          <Segmented value={form.status} onChange={(s) => setForm({ ...form, status: s })} className="w-full [&>button]:flex-1"
            options={['active', 'draft'].map((s) => ({ value: s, label: t(`products.status.${s}`) }))} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium">{t('editor.inventory')}</p>
          {!full ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div> : hasVariants ? (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {full.variants.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5 text-sm">
                    {v.color && <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10" style={{ background: v.color }} />}
                    <span className="truncate">{colorName(v.color)}</span>
                    {v.size && <span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 text-xs font-semibold">{v.size}</span>}
                  </span>
                  <QtyStepper size="sm" min={0} max={9999} value={stocks[v.id] ?? 0} onChange={(n) => setStocks((s) => ({ ...s, [v.id]: n }))} />
                </li>
              ))}
            </ul>
          ) : (
            <QtyStepper min={0} max={9999} value={Number(form.stock) || 0} onChange={(n) => setForm({ ...form, stock: n })} />
          )}
        </div>
        {onDelete && <button type="button" onClick={() => onDelete(product)} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sale/40 text-sm font-semibold text-sale transition active:scale-[.98]"><Trash2 className="h-4 w-4" />{t('common.delete')}</button>}
      </div>
    </Sheet>
  );
}

/** "تم البيع": record a piece sold in the physical shop so it leaves the stock. */
function SellSheet({ product, onClose, onSold }) {
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const { data } = useApi(product ? `/owner/products/${product.id}` : null, { keepPrevious: false });
  const full = data?.product;
  const [stocks, setStocks] = useState({});
  const [busyId, setBusyId] = useState(null);
  useEffect(() => { if (full) setStocks(Object.fromEntries(full.variants.map((v) => [v.id, v.stock]))); }, [full]);
  if (!product) return <Sheet open={false} onClose={onClose} />;
  const hasVariants = full?.variants?.length > 0;
  const colorName = (hex) => { const c = full?.colors?.find((x) => x.hex === hex); return c ? tr({ ar: c.name_ar, en: c.name_en }) : ''; };

  const sell = async (variantId) => {
    setBusyId(variantId ?? 'one');
    try {
      const r = await api(`/owner/products/${product.id}/sell`, { method: 'POST', body: variantId ? { variantId } : {} });
      if (r.variant) setStocks((s) => ({ ...s, [r.variant.id]: r.variant.stock }));
      onSold(product.id, { stock: r.product.stock, stockStatus: r.product.stockStatus, sold: r.product.sold });
      invalidate('/owner/products');
      invalidate('/owner/overview');
      const left = hasVariants ? r.variant?.stock : r.product.stock;
      toast({ title: product.trackStock && left <= 0 ? t('products.sellOut') : product.trackStock ? t('products.sellDone', { n: formatNumber(left, lang) }) : t('products.sell') });
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setBusyId(null);
  };
  const cur = hasVariants ? null : (product.stock);

  return (
    <Sheet open={!!product} onClose={onClose} title={t('products.sellTitle')} description={tr(product.name)} side="auto" desktop="end" size="md">
      <div className="space-y-4 py-4">
        <p className="text-sm text-muted">{t('products.sellHint')}</p>
        {!full ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div> : hasVariants ? (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {full.variants.map((v) => {
              const left = stocks[v.id] ?? v.stock;
              const empty = full.trackStock && left <= 0;
              return (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5 text-sm">
                    {v.color && <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10" style={{ background: v.color }} />}
                    <span className="truncate">{colorName(v.color)}</span>
                    {v.size && <span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 text-xs font-semibold">{v.size}</span>}
                    {full.trackStock && <span className="text-xs text-muted tabular">× {formatNumber(left, lang)}</span>}
                  </span>
                  <Button size="sm" icon={ShoppingBag} disabled={empty} loading={busyId === v.id} onClick={() => sell(v.id)}>{t('products.sellOne')}</Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-3">
            {!product.trackStock && <p className="text-sm text-muted">{t('products.sellNoTrack')}</p>}
            <Button size="lg" full icon={ShoppingBag} disabled={product.trackStock && cur <= 0} loading={busyId === 'one'} onClick={() => sell()}>{t('products.sellOne')}</Button>
            {product.trackStock && cur <= 0 && <p className="text-center text-sm text-sale">{t('products.sellEmpty')}</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

const weakQ = (p) => typeof p.image?.q === 'number' && p.image.q < 50;
function SaleTag({ p, onSaved }) {
  const { lang } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ar = lang === 'ar';
  if (!p.saleEndsAt || !p.compareAt) return null;
  const left = p.saleEndsAt - Date.now();
  if (left <= 0) return null;
  const d = Math.floor(left / 86400e3), h = Math.floor((left % 86400e3) / 3600e3);
  const txt = d > 0 ? (ar ? `${formatNumber(d, lang)} يوم` : `${d}d`) : (ar ? `${formatNumber(Math.max(1, h), lang)} ساعة` : `${Math.max(1, h)}h`);
  const extend = async (e) => {
    e.preventDefault(); e.stopPropagation(); setBusy(true);
    try {
      const r = await api(`/owner/products/${p.id}`, { method: 'PATCH', body: { sale_ends_at: Math.max(p.saleEndsAt, Date.now()) + 3 * 86400e3 } });
      onSaved(p.id, r.product);
      toast({ title: ar ? 'تم تمديد الخصم ٣ أيام' : 'Discount extended by 3 days' });
    } catch (err) { toast({ tone: 'error', title: ar ? 'تعذّر تمديد الخصم' : 'Could not extend' }); }
    setBusy(false);
  };
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 text-xs">
      <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', left < 86400e3 ? 'bg-sale text-white' : 'bg-sale/10 text-sale')}><Hourglass className="h-3 w-3" aria-hidden="true" />{ar ? `الخصم ينتهي بعد ${txt}` : `Ends in ${txt}`}</span>
      <button type="button" onClick={extend} disabled={busy} className="rounded-full border border-line px-2 py-0.5 font-medium text-brand hover:border-brand disabled:opacity-50">{ar ? '+٣ أيام' : '+3 days'}</button>
    </span>
  );
}

function WeakDot({ t }) {
  return <span title={t('products.weakPhoto')} className="absolute bottom-2.5 start-2.5 inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-0.5 text-[11px] font-medium text-white"><Camera className="h-3 w-3" />{t('products.weakPhoto')}</span>;
}
function WeakTag({ p, t }) {
  return weakQ(p) ? <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-200"><Camera className="h-3 w-3" />{t('products.weakPhoto')}</span> : null;
}

/** Round tick shown on a product while selecting several of them. */
function SelBox({ on, className }) {
  return <span aria-hidden="true" className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition', on ? 'border-brand bg-brand text-white' : 'border-line bg-elevated/90', className)}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>;
}

/** Put the selected products on sale by a percentage (optionally for a limited time). The old price stays as the compare-at price. */
function BulkDiscountSheet({ open, items, onClose, onDone }) {
  const { lang } = useI18n();
  const toast = useToast();
  const ar = lang === 'ar';
  const L = (a, e) => (ar ? a : e);
  const [pct, setPct] = useState(20);
  const [custom, setCustom] = useState('');
  const [endsAt, setEndsAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const value = custom !== '' ? Number(custom) : pct;
  const valid = Number.isInteger(value) && value >= 1 && value <= 90;
  const sample = items[0];
  const original = sample ? (sample.compareAt && sample.compareAt > sample.price ? sample.compareAt : sample.price) : 0;
  const go = async () => {
    setBusy(true);
    try {
      const r = await api('/owner/products/bulk', { method: 'POST', body: { ids: items.map((x) => x.id), action: 'discount', percent: value, endsAt } });
      toast({ title: L(`اتطبّق خصم ${formatNumber(value, lang)}% على ${formatNumber(r.done, lang)} منتج`, `${value}% off applied to ${r.done} products`) });
      onDone(r); onClose();
    } catch (e) { toast({ tone: 'error', title: e.message || L('مقدرتش أطبّق الخصم', 'Could not apply the discount') }); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={L(`خصم على ${formatNumber(items.length, lang)} منتج`, `Discount ${items.length} products`)} side="end" size="md"
      footer={<Button full loading={busy} disabled={!valid} onClick={go}>{L('طبّق الخصم', 'Apply discount')}</Button>}>
      <div className="space-y-5 py-4">
        <div>
          <p className="mb-2 text-sm font-medium">{L('نسبة الخصم', 'Discount')}</p>
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 25, 30, 40, 50].map((v) => (
              <button key={v} type="button" onClick={() => { setPct(v); setCustom(''); }} className={cx('rounded-full border px-4 py-2 text-sm font-semibold tabular transition', custom === '' && pct === v ? 'border-brand bg-brand/10 text-brand' : 'border-line hover:border-brand')}>{formatNumber(v, lang)}%</button>
            ))}
          </div>
          <Field label={L('أو اكتب نسبة تانية', 'Or type another')} hint={L('من 1 لـ 90', '1 to 90')}><Input inputMode="numeric" suffix="%" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
        </div>
        {sample && valid && (
          <p className="rounded-xl bg-fg/[0.04] p-3 text-sm">{L('مثال: ', 'Example: ')}<b>{tr1(sample)}</b> — <span className="text-muted line-through tabular">{formatMoney(original, lang)}</span> ← <b className="tabular text-sale">{formatMoney(Math.max(1, Math.round((original * (100 - value)) / 100)), lang)}</b></p>
        )}
        <SaleEnd value={endsAt} onChange={setEndsAt} L={L} lang={lang} />
        <p className="text-xs text-muted">{L('المنتج اللي عليه خصم بالفعل بيتخصم من سعره الأصلي، مش من سعر الخصم.', 'A product already on sale is discounted from its original price, not stacked.')}</p>
      </div>
    </Sheet>
  );
}
const tr1 = (p) => (typeof p.name === 'string' ? p.name : p.name?.ar || p.name?.en || '');

/** Add the selected products to one or more existing offers of the shop. */
function BulkOfferSheet({ open, ids, base, onClose, onDone }) {
  const { lang } = useI18n();
  const toast = useToast();
  const ar = lang === 'ar';
  const L = (a, e) => (ar ? a : e);
  const { data, error } = useApi('/owner/promotions', { enabled: open });
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState(false);
  // "new offer" made right here: name + kind + value → created active with the selected products
  const [mk, setMk] = useState(false);
  const [nName, setNName] = useState('');
  const [nKind, setNKind] = useState('percent');
  const [nVal, setNVal] = useState('');
  const list = (data?.items || []).filter((o) => o.state !== 'expired');
  const toggle = (id) => setPick((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const val = parseInt(nVal, 10) || 0;
  const newOk = mk && nName.trim().length >= 2 && val >= 1 && (nKind === 'percent' ? val <= 90 : val <= 100000);
  const canGo = pick.length > 0 || newOk;
  const go = async () => {
    setBusy(true);
    try {
      let made = false;
      if (mk) {
        if (!newOk) { toast({ tone: 'error', title: L('اكتب اسم العرض وقيمة الخصم', 'Enter the offer name and value') }); setBusy(false); return; }
        const effect = nKind === 'percent' ? { kind: 'percent_off', percent: val, apply_to: 'all' } : { kind: 'fixed_off', amount: val, per: 'unit' };
        await api('/owner/promotions', { method: 'POST', body: {
          name_ar: nName.trim(), type: nKind === 'percent' ? 'percentage' : 'fixed_amount', status: 'active',
          def: { v: 1, qualify: { all: false, products: ids, categories: [] }, effect },
        } });
        made = true;
      }
      if (pick.length) await api('/owner/promotions/bulk-assign', { method: 'POST', body: { promotionIds: pick, productIds: ids, mode: 'add' } });
      invalidate('/owner/promotions');
      const n = pick.length + (made ? 1 : 0);
      toast({ title: L(`اتضافوا ${formatNumber(ids.length, lang)} منتج لـ ${formatNumber(n, lang)} عرض`, `${ids.length} products added to ${n} offer(s)`) });
      setPick([]); setMk(false); setNName(''); setNVal(''); onDone(); onClose();
    } catch (e) { toast({ tone: 'error', title: e.message || L('مقدرتش أضيفهم للعرض', 'Could not add them') }); }
    setBusy(false);
  };
  const name = (o) => (typeof o.name === 'string' ? o.name : (ar ? o.name?.ar : o.name?.en) || o.name?.ar || o.name?.en || '');
  return (
    <Sheet open={open} onClose={onClose} title={L(`ضيف ${formatNumber(ids.length, lang)} منتج لعرض`, `Add ${ids.length} products to an offer`)} side="end" size="md"
      footer={<Button full loading={busy} disabled={!canGo} onClick={go}>{mk && pick.length ? L('اعمل العرض وضيفهم', 'Create & add') : mk ? L('اعمل العرض', 'Create offer') : L('ضيفهم', 'Add them')}</Button>}>
      <div className="space-y-2 py-4">
        <button type="button" onClick={() => setMk((v) => !v)} className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-start transition', mk ? 'border-brand bg-brand/5' : 'border-dashed border-line hover:border-brand')}>
          <SelBox on={mk} />
          <span className="min-w-0 flex-1"><span className="block font-medium">{L('عرض جديد', 'New offer')}</span><span className="block text-xs text-muted">{L('اعمله من هنا في ثانية وهيتفعّل على المنتجات المحددة', 'Create it here in seconds')}</span></span>
          <Plus className="h-4 w-4 text-muted" />
        </button>
        {mk && (
          <div className="space-y-3 rounded-xl border border-line bg-surface p-3.5">
            <Field label={L('اسم العرض', 'Offer name')}><Input value={nName} maxLength={80} placeholder={L('مثال: خصم الشتاء', 'e.g. Winter sale')} onChange={(e) => setNName(e.target.value)} /></Field>
            <Segmented value={nKind} onChange={setNKind} options={[{ value: 'percent', label: L('نسبة %', 'Percent %') }, { value: 'fixed', label: L('مبلغ ثابت', 'Fixed amount') }]} />
            <Field label={nKind === 'percent' ? L('نسبة الخصم', 'Discount') : L('قيمة الخصم على القطعة', 'Amount off per item')} hint={nKind === 'percent' ? L('من 1 لـ 90', '1 to 90') : ''}>
              <Input inputMode="numeric" suffix={nKind === 'percent' ? '%' : L('ج.م', 'EGP')} value={nVal} onChange={(e) => setNVal(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </Field>
            <p className="text-xs text-muted">{L('العرض بيشتغل فورًا، وتقدر تعدّل مدته وشروطه بعدين من صفحة العروض.', 'Goes live now; edit dates and rules later in Offers.')}</p>
          </div>
        )}
        {list.length > 0 && <p className="pt-2 text-xs font-medium text-muted">{L('أو اختار من عروضك (تقدر تختار أكتر من عرض)', 'Or pick from your offers (several allowed)')}</p>}
        {error ? <p className="text-sm text-sale">{L('مقدرتش أحمّل العروض', 'Could not load offers')}</p> : !data ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />) : list.map((o) => (
          <button key={o.id} type="button" onClick={() => toggle(o.id)} className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-start transition', pick.includes(o.id) ? 'border-brand bg-brand/5' : 'border-line hover:border-brand')}>
            <SelBox on={pick.includes(o.id)} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{name(o)}</span>{o.text && <span className="block truncate text-xs text-muted">{typeof o.text === 'string' ? o.text : (ar ? o.text.ar : o.text.en) || ''}</span>}</span>
            <Badge tone={o.state === 'live' || o.state === 'active' ? 'success' : 'neutral'}>{o.state}</Badge>
          </button>
        ))}
      </div>
    </Sheet>
  );
}


export default function Products() {
  const base = useDashBase();
  const { t, tr, lang } = useI18n();
  const { store } = useAuth();
  const toast = useToast();
  const desktop = useIsDesktop();
  const [qrP, setQrP] = useState(null);
  const storeSlug = base.startsWith('/admin/manage/') ? base.split('/')[3] : store?.slug;
  const [params, setParams] = useSearchParams();
  const tab = params.get('stock') || params.get('status') || 'all';
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('list');
  const [weakOnly, setWeakOnly] = useState(false);
  const [quick, setQuick] = useState(null);
  const [sellP, setSellP] = useState(null);
  const [del, setDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // select several products → discount / add to an offer / hide
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const q = useDebounced(term.trim(), 300);
  useEffect(() => setPage(1), [tab, q, category, sort, weakOnly]);
  useEffect(() => { setSel([]); }, [tab, q, category, weakOnly]);

  const query = useMemo(() => {
    const p = { q, sort, page, limit: 24 };
    if (['active', 'draft'].includes(tab)) p.status = tab;
    if (['low', 'out'].includes(tab)) p.stock = tab;
    if (category) p.category = category;
    if (weakOnly) p.photo = 'weak';
    return `/owner/products?${new URLSearchParams(p)}`;
  }, [q, sort, page, tab, category, weakOnly]);
  const { data, error, loading, reload, mutate } = useApi(query);
  const { data: cats } = useApi('/owner/categories');

  const setTab = (v) => setParams(v === 'all' ? {} : ['low', 'out'].includes(v) ? { stock: v } : { status: v }, { replace: true });
  const onSaved = (id, patch) => mutate((d) => ({ ...d, items: d.items.map((p) => (p.id === id ? { ...p, ...patch, compareAt: 'compareAt' in patch ? patch.compareAt : p.compareAt } : p)) }));

  const pick = (e, id) => { if (!selecting) return; e.preventDefault(); e.stopPropagation(); setSel((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])); };
  const stopSelecting = () => { setSelecting(false); setSel([]); };
  const pageIds = data?.items.map((p) => p.id) || [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.includes(id));
  const selItems = (data?.items || []).filter((p) => sel.includes(p.id));
  const bulkDone = (r) => { if (r?.products) { const by = new Map(r.products.map((x) => [x.id, x])); mutate((d) => ({ ...d, items: d.items.map((p) => (by.has(p.id) ? { ...p, price: by.get(p.id).price, compareAt: by.get(p.id).compareAt, saleEndsAt: by.get(p.id).saleEndsAt, status: by.get(p.id).status } : p)) })); } invalidate('/owner/products'); stopSelecting(); };
  const bulkSimple = async (body, msgAr, msgEn) => {
    setBulkBusy(true);
    try {
      const r = await api('/owner/products/bulk', { method: 'POST', body: { ids: sel, ...body } });
      toast({ title: (lang === 'ar' ? msgAr : msgEn).replace('{n}', formatNumber(r.done, lang)) });
      bulkDone(r);
    } catch (e) { toast({ tone: 'error', title: e.message || errorMessage(t, e) }); }
    setBulkBusy(false);
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const r = await api(`/owner/products/${del.id}`, { method: 'DELETE' });
      mutate((d) => ({ ...d, items: d.items.filter((p) => p.id !== del.id), total: d.total - 1 }));
      invalidate('/owner/products');
      toast({ title: r.archived ? t('products.archived') : t('products.deleted') });
      setDel(null);
    } catch (e) { toast({ tone: 'error', title: errorMessage(t, e) }); }
    setDeleting(false);
  };

  const c = data?.counts;
  const noProductsAtAll = c && c.all === 0;

  return (
    <PageTransition>
      <PageHeader title={t('products.title')} subtitle={c ? `${formatNumber(c.all, lang)} ${t('dash.totalProducts')}` : ' '}
        actions={<div className="flex gap-2">{!noProductsAtAll && <Button variant={selecting ? 'secondary' : 'outline'} icon={selecting ? X : CheckSquare} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? (lang === 'ar' ? 'إلغاء التحديد' : 'Cancel') : (lang === 'ar' ? 'تحديد منتجات' : 'Select')}</Button>}<Button icon={Plus} to={`${base}/products/new`} className="hidden md:inline-flex">{t('products.add')}</Button></div>} />

      {noProductsAtAll ? (
        <EmptyState icon={Package} title={t('products.empty')} body={t('products.emptyBody')} action={<Button size="lg" icon={Plus} to={`${base}/products/new`}>{t('products.add')}</Button>} />
      ) : (
        <>
          {(c?.weak > 0 || weakOnly) && (
            <button type="button" onClick={() => setWeakOnly((v) => !v)} className="mb-3 flex w-full items-center gap-2.5 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-start text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
              <Camera className="h-4 w-4 shrink-0" />
              <span className="flex-1">{weakOnly ? t('products.weakShowAll') : t('products.weakBanner', { n: formatNumber(c?.weak || 0, lang) })}</span>
              <span className="shrink-0 font-semibold underline-offset-2 hover:underline">{weakOnly ? t('common.all') : t('products.weakReview')}</span>
            </button>
          )}
          <FilterTabs value={tab} onChange={setTab} options={[
            { value: 'all', label: t('common.all'), count: c?.all },
            { value: 'active', label: t('products.status.active'), count: c?.active },
            { value: 'draft', label: t('products.status.draft'), count: c?.draft },
            { value: 'low', label: t('products.filter.low'), count: c?.low },
            { value: 'out', label: t('products.filter.out'), count: c?.out },
          ]} />
          <div className="mb-5 mt-4 flex flex-col gap-2 sm:flex-row">
            <SearchInput value={term} onChange={setTerm} placeholder={t('products.search')} className="flex-1" />
            <div className="flex gap-2">
              <Select size="sm" value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 sm:w-44 [&_select]:h-11" aria-label={t('editor.category')}>
                <option value="">{t('dash.categories')}: {t('common.all')}</option>
                {cats?.items.map((x) => <option key={x.id} value={x.id}>{tr(x.name)}</option>)}
              </Select>
              <Select size="sm" value={sort} onChange={(e) => setSort(e.target.value)} className="flex-1 sm:w-44 [&_select]:h-11" aria-label={t('common.sort')}>
                {['newest', 'best', 'price_asc', 'price_desc', 'stock'].map((s) => <option key={s} value={s}>{s === 'stock' ? t('products.stock') : t(`shop.sort.${s}`)}</option>)}
              </Select>
              <Segmented value={view} onChange={setView} className="hidden lg:inline-flex [&>button]:h-9" ariaLabel="View"
                options={[{ value: 'list', label: <List className="h-4 w-4" aria-label={t('products.list')} /> }, { value: 'grid', label: <LayoutGrid className="h-4 w-4" aria-label={t('products.grid')} /> }]} />
            </div>
          </div>

          {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <ListSkeleton /> : !data.items.length ? (
            <EmptyState icon={Package} title={t('products.emptyFilter')} action={<Button variant="outline" onClick={() => { setTerm(''); setCategory(''); setTab('all'); }}>{t('common.clearAll')}</Button>} />
          ) : (
            <div className={cx('transition-opacity', loading && 'opacity-60')}>
              {desktop && view === 'list' ? (
                <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
                  <table className="w-full min-w-[720px]">
                    <thead><tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="py-3 ps-5 text-start font-semibold">{t('dash.products')}</th>
                      <th className="py-3 text-start font-semibold">{t('editor.status')}</th>
                      <th className="py-3 text-start font-semibold">{t('products.stock')}</th>
                      <th className="py-3 text-start font-semibold">{t('products.price')}</th>
                      <th className="py-3 text-start font-semibold">{t('products.sold')}</th>
                      <th className="w-40 py-3 pe-5" />
                    </tr></thead>
                    <tbody className="divide-y divide-line">
                      {data.items.map((p) => (
                        <tr key={p.id} className={cx('group transition hover:bg-fg/[0.02]', selecting && 'cursor-pointer', sel.includes(p.id) && 'bg-brand/5')} onClick={selecting ? (e) => pick(e, p.id) : undefined}>
                          <td className="py-3 ps-5">
                            <Link to={`${base}/products/${p.id}`} onClick={(e) => pick(e, p.id)} className="flex items-center gap-3.5">
                              {selecting && <SelBox on={sel.includes(p.id)} />}
                              <SmartImage media={p.image} ratio="4 / 5" sizes="56px" className="w-12 shrink-0 rounded-lg" />
                              <span className="min-w-0"><span className="block max-w-[320px] truncate font-medium group-hover:text-brand">{tr(p.name)}</span>
                                <span className="block text-[13px] text-muted">{p.category ? tr(p.category) : '—'}{p.variantCount ? ` · ${t('products.variants', { n: p.variantCount })}` : ''}<WeakTag p={p} t={t} /></span></span>
                            </Link>
                          </td>
                          <td className="py-3"><StatusPill status={p.status} t={t} /></td>
                          <td className="py-3"><StockPill p={p} t={t} lang={lang} /></td>
                          <td className="py-3"><span className="font-semibold tabular">{formatMoney(p.price, lang)}</span>{p.compareAt && <span className="ms-2 text-xs text-muted line-through tabular">{formatMoney(p.compareAt, lang)}</span>}<span className="block"><SaleTag p={p} onSaved={onSaved} /></span></td>
                          <td className="py-3 text-sm tabular text-muted">{formatNumber(p.sold, lang)}</td>
                          <td className="py-3 pe-5">
                            <div className="flex justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                              <IconButton size="sm" label={t('products.sell')} icon={ShoppingBag} onClick={() => setSellP(p)} iconClass="h-[18px] w-[18px] text-brand" />
                              <IconButton size="sm" label={t('qr.productTitle')} icon={QrCode} onClick={() => setQrP(p)} iconClass="h-[18px] w-[18px]" />
                              <IconButton size="sm" label={t('products.quickEdit')} icon={Zap} onClick={() => setQuick(p)} iconClass="h-[18px] w-[18px]" />
                              <IconButton size="sm" label={t('common.edit')} icon={Pencil} to={`${base}/products/${p.id}`} iconClass="h-[18px] w-[18px]" />
                              <IconButton size="sm" label={t('common.delete')} icon={Trash2} onClick={() => setDel(p)} iconClass="h-[18px] w-[18px] text-sale" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={cx('grid gap-3', desktop ? 'grid-cols-4 gap-5 xl:grid-cols-5' : 'grid-cols-[minmax(0,1fr)] sm:grid-cols-2')}>
                  {data.items.map((p) => desktop ? (
                    <div key={p.id} className={cx('group overflow-hidden rounded-2xl border bg-elevated', sel.includes(p.id) ? 'border-brand ring-2 ring-brand/40' : 'border-line')}>
                      <Link to={`${base}/products/${p.id}`} onClick={(e) => pick(e, p.id)} className="relative block">{selecting && <SelBox on={sel.includes(p.id)} className="absolute end-2.5 top-2.5 z-10" />}<SmartImage media={p.image} ratio="4 / 5" sizes="20vw" imgClassName="group-hover:scale-[1.03]" />
                        <span className="absolute start-2.5 top-2.5"><StatusPill status={p.status} t={t} /></span>{weakQ(p) && <WeakDot t={t} />}</Link>
                      <div className="p-3.5">
                        <p className="truncate font-medium">{tr(p.name)}</p>
                        <div className="mt-1.5 flex items-center justify-between"><span className="font-semibold tabular">{formatMoney(p.price, lang)}</span><StockPill p={p} t={t} lang={lang} /></div>
                        <div className="mt-3 flex gap-2"><Button size="xs" full icon={ShoppingBag} onClick={() => setSellP(p)}>{t('products.sell')}</Button><Button size="xs" variant="secondary" full icon={Zap} onClick={() => setQuick(p)}>{t('products.quickEdit')}</Button><Button size="xs" variant="secondary" icon={QrCode} aria-label={t('qr.productTitle')} onClick={() => setQrP(p)} /></div>
                      </div>
                    </div>
                  ) : (
                    <div key={p.id} className={cx('rounded-2xl border bg-elevated p-3', sel.includes(p.id) ? 'border-brand ring-2 ring-brand/40' : 'border-line')}>
                      <div className="flex items-center gap-3.5">
                        {selecting && <button type="button" onClick={(e) => pick(e, p.id)} aria-label="select" className="shrink-0"><SelBox on={sel.includes(p.id)} /></button>}
                        <Link to={`${base}/products/${p.id}`} onClick={(e) => pick(e, p.id)} className="shrink-0"><SmartImage media={p.image} ratio="4 / 5" sizes="80px" className="w-[68px] rounded-xl" /></Link>
                        <Link to={`${base}/products/${p.id}`} onClick={(e) => pick(e, p.id)} className="min-w-0 flex-1">
                          <p className="truncate font-medium">{tr(p.name)}</p>
                          <p className="mt-0.5 font-semibold tabular">{formatMoney(p.price, lang)}{p.compareAt && <span className="ms-2 text-xs font-normal text-muted line-through">{formatMoney(p.compareAt, lang)}</span>}</p>
                          <SaleTag p={p} onSaved={onSaved} />
                          {weakQ(p) && <p className="mt-1"><WeakTag p={p} t={t} /></p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">{p.status !== 'active' && <StatusPill status={p.status} t={t} />}<StockPill p={p} t={t} lang={lang} /></div>
                        </Link>
                        <button type="button" onClick={() => setQrP(p)} aria-label={t('qr.productTitle')} className="grid h-10 w-10 shrink-0 place-items-center self-start rounded-xl bg-secondary text-muted transition active:scale-90"><QrCode className="h-[18px] w-[18px]" /></button>
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-3">
                        <button type="button" onClick={() => setSellP(p)} className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-btn text-[12px] font-semibold text-on-btn transition active:scale-95"><ShoppingBag className="h-[18px] w-[18px]" />{t('products.sell')}</button>
                        <button type="button" onClick={() => setQuick(p)} className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-secondary text-[12px] font-semibold text-brand transition active:scale-95"><Zap className="h-[18px] w-[18px]" />{t('products.quickEdit')}</button>
                        <Link to={`${base}/products/${p.id}`} className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-secondary text-[12px] font-semibold text-fg transition active:scale-95"><Pencil className="h-[18px] w-[18px]" />{t('common.edit')}</Link>
                        <button type="button" onClick={() => setDel(p)} className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-sale/10 text-[12px] font-semibold text-sale transition active:scale-95"><Trash2 className="h-[18px] w-[18px]" />{t('common.delete')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Pagination page={data.page} pages={data.pages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          )}
        </>
      )}

      {selecting && (
        <div className="fixed inset-x-3 bottom-[84px] z-40 mx-auto max-w-3xl rounded-2xl border border-line bg-elevated p-3 shadow-xl md:bottom-5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{sel.length ? (lang === 'ar' ? `${formatNumber(sel.length, lang)} منتج متحدد` : `${sel.length} selected`) : (lang === 'ar' ? 'اضغط على المنتجات اللي عايزها' : 'Tap the products you want')}</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setSel(allOnPage ? [] : pageIds)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-brand">{allOnPage ? (lang === 'ar' ? 'شيل الكل' : 'Clear') : (lang === 'ar' ? 'حدد كل الصفحة' : 'Select page')}</button>
              <button type="button" onClick={stopSelecting} aria-label="cancel" className="grid h-7 w-7 place-items-center rounded-full border border-line"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Button size="sm" icon={Percent} disabled={!sel.length} onClick={() => setSheet('discount')}>{lang === 'ar' ? 'خصم %' : 'Discount'}</Button>
            <Button size="sm" variant="secondary" icon={Tag} disabled={!sel.length} onClick={() => setSheet('offer')}>{lang === 'ar' ? 'ضيف لعرض' : 'Add to offer'}</Button>
            <Button size="sm" variant="outline" disabled={!sel.length || bulkBusy} onClick={() => bulkSimple({ action: 'clear_discount' }, 'اتشال الخصم من {n} منتج', 'Discount removed from {n} products')}>{lang === 'ar' ? 'شيل الخصم' : 'Remove discount'}</Button>
            <Button size="sm" variant="outline" icon={EyeOff} disabled={!sel.length || bulkBusy} onClick={() => bulkSimple({ action: 'status', status: 'draft' }, 'اتخفّى {n} منتج', '{n} products hidden')}>{lang === 'ar' ? 'إخفاء' : 'Hide'}</Button>
            <Button size="sm" variant="outline" icon={Eye} disabled={!sel.length || bulkBusy} onClick={() => bulkSimple({ action: 'status', status: 'active' }, 'اتظهر {n} منتج', '{n} products shown')}>{lang === 'ar' ? 'إظهار' : 'Show'}</Button>
          </div>
        </div>
      )}
      <BulkDiscountSheet open={sheet === 'discount'} items={selItems} onClose={() => setSheet(null)} onDone={bulkDone} />
      <BulkOfferSheet open={sheet === 'offer'} ids={sel} base={base} onClose={() => setSheet(null)} onDone={bulkDone} />
      <SellSheet product={sellP && (data?.items.find((x) => x.id === sellP.id) || sellP)} onClose={() => setSellP(null)} onSold={onSaved} />
      <QuickEdit product={quick} onClose={() => setQuick(null)} onSaved={onSaved} onDelete={(p) => { setQuick(null); setTimeout(() => setDel(p), 150); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger title={t('common.delete')} body={del ? t('products.confirmDelete', { name: tr(del.name) }) : ''}
        confirmLabel={t('common.delete')} loading={deleting} onConfirm={doDelete} />
      {/* storefront link for context */}
      {qrP && <QrShare open onClose={() => setQrP(null)} kind="product" url={`${window.location.origin}/s/${storeSlug}/p/${qrP.slug}`} name={tr(qrP.name)} price={qrP.price} storeName={store ? tr(store.name) : storeSlug} />}
      <a href={`/s/${storeSlug}/shop`} target="_blank" rel="noreferrer" className="mt-8 hidden items-center gap-1.5 text-sm font-medium text-muted hover:text-fg md:inline-flex"><ExternalLink className="h-4 w-4" />{t('dash.viewStore')}</a>
    </PageTransition>
  );
}
