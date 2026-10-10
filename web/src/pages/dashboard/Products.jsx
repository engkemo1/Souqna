import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Package, LayoutGrid, List, Pencil, Zap, Trash2, ExternalLink } from 'lucide-react';
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
function QuickEdit({ product, onClose, onSaved }) {
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
    setForm({ price: product.price, compare_at_price: product.compareAt || '', status: product.status, stock: product.stock });
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
  const [params, setParams] = useSearchParams();
  const tab = params.get('stock') || params.get('status') || 'all';
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('list');
  const [quick, setQuick] = useState(null);
  const [del, setDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const q = useDebounced(term.trim(), 300);
  useEffect(() => setPage(1), [tab, q, category, sort]);

  const query = useMemo(() => {
    const p = { q, sort, page, limit: 24 };
    if (['active', 'draft'].includes(tab)) p.status = tab;
    if (['low', 'out'].includes(tab)) p.stock = tab;
    if (category) p.category = category;
    return `/owner/products?${new URLSearchParams(p)}`;
  }, [q, sort, page, tab, category]);
  const { data, error, loading, reload, mutate } = useApi(query);
  const { data: cats } = useApi('/owner/categories');

  const setTab = (v) => setParams(v === 'all' ? {} : ['low', 'out'].includes(v) ? { stock: v } : { status: v }, { replace: true });
  const onSaved = (id, patch) => mutate((d) => ({ ...d, items: d.items.map((p) => (p.id === id ? { ...p, ...patch, compareAt: patch.compareAt ?? p.compareAt } : p)) }));

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
        actions={<Button icon={Plus} to={`${base}/products/new`} className="hidden md:inline-flex">{t('products.add')}</Button>} />

      {noProductsAtAll ? (
        <EmptyState icon={Package} title={t('products.empty')} body={t('products.emptyBody')} action={<Button size="lg" icon={Plus} to={`${base}/products/new`}>{t('products.add')}</Button>} />
      ) : (
        <>
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
                      <th className="w-32 py-3 pe-5" />
                    </tr></thead>
                    <tbody className="divide-y divide-line">
                      {data.items.map((p) => (
                        <tr key={p.id} className="group transition hover:bg-fg/[0.02]">
                          <td className="py-3 ps-5">
                            <Link to={`${base}/products/${p.id}`} className="flex items-center gap-3.5">
                              <SmartImage media={p.image} ratio="4 / 5" sizes="56px" className="w-12 shrink-0 rounded-lg" />
                              <span className="min-w-0"><span className="block max-w-[320px] truncate font-medium group-hover:text-brand">{tr(p.name)}</span>
                                <span className="block text-[13px] text-muted">{p.category ? tr(p.category) : '—'}{p.variantCount ? ` · ${t('products.variants', { n: p.variantCount })}` : ''}</span></span>
                            </Link>
                          </td>
                          <td className="py-3"><StatusPill status={p.status} t={t} /></td>
                          <td className="py-3"><StockPill p={p} t={t} lang={lang} /></td>
                          <td className="py-3"><span className="font-semibold tabular">{formatMoney(p.price, lang)}</span>{p.compareAt && <span className="ms-2 text-xs text-muted line-through tabular">{formatMoney(p.compareAt, lang)}</span>}</td>
                          <td className="py-3 text-sm tabular text-muted">{formatNumber(p.sold, lang)}</td>
                          <td className="py-3 pe-5">
                            <div className="flex justify-end gap-1 opacity-60 transition group-hover:opacity-100">
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
                <div className={cx('grid gap-3', desktop ? 'grid-cols-4 gap-5 xl:grid-cols-5' : 'sm:grid-cols-2')}>
                  {data.items.map((p) => desktop ? (
                    <div key={p.id} className="group overflow-hidden rounded-2xl border border-line bg-elevated">
                      <Link to={`${base}/products/${p.id}`} className="relative block"><SmartImage media={p.image} ratio="4 / 5" sizes="20vw" imgClassName="group-hover:scale-[1.03]" />
                        <span className="absolute start-2.5 top-2.5"><StatusPill status={p.status} t={t} /></span></Link>
                      <div className="p-3.5">
                        <p className="truncate font-medium">{tr(p.name)}</p>
                        <div className="mt-1.5 flex items-center justify-between"><span className="font-semibold tabular">{formatMoney(p.price, lang)}</span><StockPill p={p} t={t} lang={lang} /></div>
                        <div className="mt-3 flex gap-2"><Button size="xs" variant="secondary" full icon={Zap} onClick={() => setQuick(p)}>{t('products.quickEdit')}</Button></div>
                      </div>
                    </div>
                  ) : (
                    <div key={p.id} className="flex items-center gap-3.5 rounded-2xl border border-line bg-elevated p-3">
                      <Link to={`${base}/products/${p.id}`} className="shrink-0"><SmartImage media={p.image} ratio="4 / 5" sizes="80px" className="w-[68px] rounded-xl" /></Link>
                      <Link to={`${base}/products/${p.id}`} className="min-w-0 flex-1">
                        <p className="truncate font-medium">{tr(p.name)}</p>
                        <p className="mt-0.5 font-semibold tabular">{formatMoney(p.price, lang)}{p.compareAt && <span className="ms-2 text-xs font-normal text-muted line-through">{formatMoney(p.compareAt, lang)}</span>}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">{p.status !== 'active' && <StatusPill status={p.status} t={t} />}<StockPill p={p} t={t} lang={lang} /></div>
                      </Link>
                      <button type="button" onClick={() => setQuick(p)} aria-label={t('products.quickEdit')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-brand transition active:scale-90"><Zap className="h-5 w-5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <Pagination page={data.page} pages={data.pages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          )}
        </>
      )}

      <QuickEdit product={quick} onClose={() => setQuick(null)} onSaved={onSaved} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger title={t('common.delete')} body={del ? t('products.confirmDelete', { name: tr(del.name) }) : ''}
        confirmLabel={t('common.delete')} loading={deleting} onConfirm={doDelete} />
      {/* storefront link for context */}
      <a href={`/s/${store.slug}/shop`} target="_blank" rel="noreferrer" className="mt-8 hidden items-center gap-1.5 text-sm font-medium text-muted hover:text-fg md:inline-flex"><ExternalLink className="h-4 w-4" />{t('dash.viewStore')}</a>
    </PageTransition>
  );
}
