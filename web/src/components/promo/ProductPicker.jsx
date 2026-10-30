import { useEffect, useMemo, useState } from 'react';
import { Search, X, Check, FolderTree, Package, Store, ChevronDown } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, useDebounced } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Input, Select, Checkbox, Segmented, Switch } from '../ui/Field.jsx';
import SmartImage from '../ui/SmartImage.jsx';
import Badge from '../ui/Badge.jsx';
import { selEmpty } from '../../lib/promo.js';
import { cx } from '../ui/cx.js';

const PAGE = 30;

/** Fetch a few products by id (for chips / summaries). */
function useProductsById(ids) {
  const key = ids.length ? `/owner/promotions/products/search?ids=${ids.slice(0, 12).join(',')}&limit=12` : null;
  const { data } = useApi(key);
  return data?.items || [];
}

/** Summary of a selection with a button that opens the picker. */
export function SelectorField({ value, onChange, label, hint, productsOnly = false, allowAll = true, emptyLabel }) {
  const { lang } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const [open, setOpen] = useState(false);
  const shown = useProductsById(value.products);
  const { data: cats } = useApi('/owner/promotions/categories');
  const catName = (id) => { const c = cats?.items.find((x) => x.id === id); return c ? (lang === 'ar' ? c.name.ar : c.name.en || c.name.ar) : `#${id}`; };
  const remove = (kind, id) => onChange({ ...value, [kind]: value[kind].filter((x) => x !== id) });
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold">{label}</p>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}</div>
        <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>{selEmpty(value) ? p('اختيار', 'Choose') : p('تعديل', 'Edit')}</Button>
      </div>
      {value.all ? <Badge tone="brand"><Store className="h-3.5 w-3.5" />{p('كل منتجات المتجر', 'All store products')}</Badge>
        : selEmpty(value) ? <p className="text-sm text-muted">{emptyLabel || p('لم يتم اختيار شيء', 'Nothing selected')}</p>
          : (
            <div className="flex flex-wrap gap-2">
              {value.categories.map((id) => <Chip key={`c${id}`} icon={FolderTree} onRemove={() => remove('categories', id)}>{catName(id)}</Chip>)}
              {value.products.slice(0, 12).map((id) => { const pr = shown.find((x) => x.id === id); return <Chip key={`p${id}`} image={pr?.image} onRemove={() => remove('products', id)}>{pr ? (lang === 'ar' ? pr.name.ar : pr.name.en || pr.name.ar) : `#${id}`}</Chip>; })}
              {value.products.length > 12 && <Badge>+{value.products.length - 12}</Badge>}
            </div>
          )}
      {!selEmpty(value) && !value.all && <p className="mt-2 text-xs text-muted">{p(`${value.products.length} منتج · ${value.categories.length} قسم`, `${value.products.length} products · ${value.categories.length} categories`)}</p>}
      <ProductPicker open={open} onClose={() => setOpen(false)} value={value} onChange={onChange} productsOnly={productsOnly} allowAll={allowAll} title={label} />
    </div>
  );
}

function Chip({ children, onRemove, icon: Icon, image }) {
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-elevated py-1 ps-1.5 pe-1 text-xs font-medium">
      {image ? <SmartImage media={image} ratio="1 / 1" className="h-5 w-5 rounded-full" sizes="20px" /> : Icon ? <Icon className="h-3.5 w-3.5 text-muted" /> : null}
      <span className="truncate">{children}</span>
      <button type="button" onClick={onRemove} aria-label="remove" className="grid h-5 w-5 place-items-center rounded-full hover:bg-fg/10"><X className="h-3 w-3" /></button>
    </span>
  );
}

export default function ProductPicker({ open, onClose, value, onChange, productsOnly, allowAll, title }) {
  const { lang } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const [tab, setTab] = useState('products');
  const [draft, setDraft] = useState(value);
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState('');
  const [minP, setMinP] = useState(''); const [maxP, setMaxP] = useState(''); const [avail, setAvail] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const q = useDebounced(term, 250);
  const { data: cats } = useApi(open ? '/owner/promotions/categories' : null);
  const known = useMemo(() => new Map(), []);

  useEffect(() => { if (open) { setDraft(value); setTab(value.all ? 'all' : 'products'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = (extra = {}) => new URLSearchParams({ q, ...(cat ? { category: cat } : {}), ...(minP ? { minPrice: minP } : {}), ...(maxP ? { maxPrice: maxP } : {}), ...(avail ? { availability: avail } : {}), limit: PAGE, ...extra }).toString();
  useEffect(() => { setOffset(0); }, [q, cat, minP, maxP, avail, open]);
  useEffect(() => {
    if (!open || tab !== 'products') return undefined;
    let dead = false; setLoading(true);
    api(`/owner/promotions/products/search?${qs({ offset })}`).then((d) => {
      if (dead) return; d.items.forEach((x) => known.set(x.id, x)); setTotal(d.total); setRows((r) => (offset ? [...r, ...d.items] : d.items)); setLoading(false);
    }).catch(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [open, tab, q, cat, minP, maxP, avail, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = new Set(draft.products);
  const toggle = (id) => setDraft((d) => ({ ...d, all: false, products: d.products.includes(id) ? d.products.filter((x) => x !== id) : [...d.products, id] }));
  const pageAll = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const togglePage = () => setDraft((d) => ({ ...d, all: false, products: pageAll ? d.products.filter((id) => !rows.some((r) => r.id === id)) : [...new Set([...d.products, ...rows.map((r) => r.id)])] }));
  const selectAllMatching = async () => {
    setBusyAll(true); const ids = [];
    try { for (let o = 0; o < Math.min(total, 2000); o += 100) { const d = await api(`/owner/promotions/products/search?${qs({ offset: o, limit: 100 })}`); ids.push(...d.items.map((x) => x.id)); } } catch { /* partial is fine */ }
    setDraft((d) => ({ ...d, all: false, products: [...new Set([...d.products, ...ids])] })); setBusyAll(false);
  };
  const toggleCat = (id) => setDraft((d) => ({ ...d, all: false, categories: d.categories.includes(id) ? d.categories.filter((x) => x !== id) : [...d.categories, id] }));
  const done = () => { onChange(draft); onClose(); };
  const tops = (cats?.items || []).filter((c) => !c.parentId);
  const kids = (id) => (cats?.items || []).filter((c) => c.parentId === id);
  const nm = (c) => (lang === 'ar' ? c.name.ar : c.name.en || c.name.ar);
  const tabs = [{ value: 'products', label: p('منتجات', 'Products') }, ...(productsOnly ? [] : [{ value: 'categories', label: p('أقسام', 'Categories') }]), ...(allowAll && !productsOnly ? [{ value: 'all', label: p('كل المتجر', 'Whole store') }] : [])];

  return (
    <Sheet open={open} onClose={onClose} title={title} side="auto" desktop="end" size="lg"
      footer={<div className="flex items-center justify-between gap-3"><span className="text-sm text-muted tabular">{draft.all ? p('كل المنتجات', 'All products') : p(`${draft.products.length} منتج · ${draft.categories.length} قسم`, `${draft.products.length} products · ${draft.categories.length} categories`)}</span><Button size="lg" onClick={done}>{p('تم', 'Done')}</Button></div>}>
      <div className="space-y-4 py-3">
        <Segmented value={tab} onChange={(v) => { setTab(v); if (v === 'all') setDraft({ ...draft, all: true }); else if (draft.all) setDraft({ ...draft, all: false }); }} options={tabs} ariaLabel="mode" />
        {tab === 'all' && <Switch checked={draft.all} onChange={(v) => setDraft({ ...draft, all: v })} label={p('كل منتجات المتجر تدخل في العرض', 'Every product in the store is included')} description={p('المنتجات المستثناة تظل خارج العرض.', 'Excluded products stay out.')} />}
        {tab === 'products' && (
          <>
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="ps-10" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={p('ابحث بالاسم أو كود المنتج (SKU)', 'Search by name or SKU')} /></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="category"><option value="">{p('كل الأقسام', 'All categories')}</option>{(cats?.items || []).map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{nm(c)}</option>)}</Select>
              <Input inputMode="numeric" value={minP} onChange={(e) => setMinP(e.target.value.replace(/\D/g, ''))} placeholder={p('أقل سعر', 'Min price')} />
              <Input inputMode="numeric" value={maxP} onChange={(e) => setMaxP(e.target.value.replace(/\D/g, ''))} placeholder={p('أعلى سعر', 'Max price')} />
              <Select value={avail} onChange={(e) => setAvail(e.target.value)} aria-label="availability"><option value="">{p('كل الحالات', 'Any stock')}</option><option value="in">{p('متاح', 'In stock')}</option><option value="out">{p('نفد', 'Out of stock')}</option></Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Checkbox checked={pageAll} onChange={togglePage} label={p('تحديد المعروض', 'Select shown')} />
              <button type="button" onClick={selectAllMatching} disabled={busyAll || !total} className="font-semibold text-brand disabled:opacity-50">{busyAll ? '…' : p(`تحديد كل النتائج (${total})`, `Select all ${total} results`)}</button>
              {draft.products.length > 0 && <button type="button" onClick={() => setDraft({ ...draft, products: [] })} className="font-semibold text-sale">{p('مسح التحديد', 'Clear')}</button>}
            </div>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => toggle(r.id)} className={cx('flex w-full items-center gap-3 p-2.5 text-start transition hover:bg-fg/[0.03]', sel.has(r.id) && 'bg-primary/[0.06]')}>
                    <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md border-2', sel.has(r.id) ? 'border-primary bg-primary text-on-primary' : 'border-line-strong')}>{sel.has(r.id) && <Check className="h-3.5 w-3.5" />}</span>
                    <SmartImage media={r.image} ratio="1 / 1" className="h-12 w-12 shrink-0 rounded-lg" sizes="48px" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{lang === 'ar' ? r.name.ar : r.name.en || r.name.ar}</span><span className="block truncate text-xs text-muted" dir="ltr">{r.sku || r.barcode || `#${r.id}`}</span></span>
                    <span className="text-end text-sm tabular"><span className="block font-semibold">{formatMoney(r.price, lang)}</span>{!r.inStock && <span className="text-xs text-sale">{p('نفد', 'Out')}</span>}</span>
                  </button>
                </li>
              ))}
              {!rows.length && !loading && <li className="p-6 text-center text-sm text-muted">{p('لا توجد منتجات مطابقة', 'No matching products')}</li>}
              {loading && <li className="p-4 text-center text-sm text-muted">…</li>}
            </ul>
            {rows.length < total && !loading && <Button full variant="secondary" icon={ChevronDown} onClick={() => setOffset(rows.length)}>{p('عرض المزيد', 'Load more')}</Button>}
          </>
        )}
        {tab === 'categories' && (
          <ul className="space-y-1">
            {tops.map((c) => (
              <li key={c.id}>
                <Checkbox checked={draft.categories.includes(c.id)} onChange={() => toggleCat(c.id)} label={<span>{nm(c)} <span className="text-xs text-muted">({c.products})</span></span>} />
                {kids(c.id).length > 0 && <div className="ms-7 mt-1 space-y-1 border-s border-line ps-3">{kids(c.id).map((k) => <Checkbox key={k.id} checked={draft.categories.includes(k.id)} onChange={() => toggleCat(k.id)} label={<span>{nm(k)} <span className="text-xs text-muted">({k.products})</span></span>} />)}</div>}
              </li>
            ))}
            <p className="pt-2 text-xs text-muted">{p('اختيار قسم رئيسي يشمل كل أقسامه الفرعية.', 'Choosing a main category includes all its sub-categories.')}</p>
          </ul>
        )}
      </div>
    </Sheet>
  );
}
