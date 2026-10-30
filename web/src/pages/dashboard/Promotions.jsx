import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History, Plus, Pencil, Copy, Play, Pause, Trash2, Eye, Package, Settings2, Layers, TicketPercent, Flame, CalendarClock, Hourglass, FileText, Percent } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi, invalidate } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { PageHeader, Panel, KpiCard, FilterTabs, SearchInput, ListSkeleton } from '../../components/dash/Kit.jsx';
import Button, { IconButton } from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Field, Input, Select, Segmented } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import OfferVisual from '../../components/promo/OfferVisual.jsx';
import ProductPicker from '../../components/promo/ProductPicker.jsx';
import { PromoAnalytics, PromoHistorySheet } from '../../components/promo/PromoInsights.jsx';
import { STATE_TONE, STATE_LABEL, emptySel, selEmpty } from '../../lib/promo.js';

const refresh = () => { invalidate('/owner/promotions'); };

export default function Promotions() {
  const { t, lang, tr } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState('all');
  const [term, setTerm] = useState('');
  const stats = useApi('/owner/promotions/stats');
  const list = useApi(`/owner/promotions?state=${state}&q=${encodeURIComponent(term)}`);
  const [preview, setPreview] = useState(null);
  const [productsOf, setProductsOf] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [settings, setSettings] = useState(false);
  const [history, setHistory] = useState(false);

  const c = stats.data?.counts || {};
  const perf = stats.data?.performance || {};
  const run = async (key, fn, okTitle) => {
    setBusy(key);
    try { await fn(); refresh(); okTitle && toast({ title: okTitle }); } catch (e) { toast({ tone: 'error', title: e.issues?.[0]?.[lang === 'ar' ? 'ar' : 'en'] || errorMessage(t, e) }); } finally { setBusy(null); }
  };
  const setStatus = (o, status) => run(`s${o.id}`, () => api(`/owner/promotions/${o.id}/status`, { method: 'PATCH', body: { status } }), status === 'active' ? p('تم تفعيل العرض', 'Offer activated') : p('تم إيقاف العرض', 'Offer paused'));
  const dup = (o) => run(`d${o.id}`, async () => { const r = await api(`/owner/promotions/${o.id}/duplicate`, { method: 'POST' }); navigate(`/dashboard/promotions/${r.offer.id}`); }, p('تم النسخ كمسودة', 'Duplicated as draft'));

  const tabs = [
    ['all', p('الكل', 'All'), c.total], ['active', p('نشطة', 'Active'), c.active], ['scheduled', p('مجدولة', 'Scheduled'), c.scheduled],
    ['paused', p('متوقفة', 'Paused'), c.paused], ['expired', p('منتهية', 'Expired'), c.expired], ['draft', p('مسودات', 'Drafts'), c.draft],
  ].map(([value, label, count]) => ({ value, label, count }));

  const items = list.data?.items || [];
  return (
    <PageTransition>
      <PageHeader
        title={p('العروض والخصومات', 'Offers & Discounts')}
        subtitle={p('أنشئ عروضًا مرنة: اشتري X واحصل على Y، باقات، شرائح أسعار والمزيد', 'Build flexible offers: Buy X Get Y, bundles, tiers and more')}
        actions={(
          <>
            <Button variant="secondary" onClick={() => setSettings(true)}><Settings2 className="h-4 w-4" />{p('الإعدادات', 'Settings')}</Button>
            <Button variant="secondary" onClick={() => setHistory(true)}><History className="h-4 w-4" />{p('السجل', 'History')}</Button>
            <Button variant="secondary" onClick={() => setBulk(true)}><Layers className="h-4 w-4" />{p('إضافة منتجات لعروض', 'Bulk assign')}</Button>
            <Button variant="secondary" to="/dashboard/offers"><TicketPercent className="h-4 w-4" />{p('أكواد الخصم', 'Coupon codes')}</Button>
            <Button to="/dashboard/promotions/new"><Plus className="h-4 w-4" />{p('عرض جديد', 'New offer')}</Button>
          </>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={p('إجمالي العروض', 'Total offers')} value={c.total || 0} icon={Percent} loading={stats.loading && !stats.data} />
        <KpiCard label={p('نشطة الآن', 'Active now')} value={c.active || 0} icon={Flame} tone="brand" loading={stats.loading && !stats.data} />
        <KpiCard label={p('مجدولة', 'Scheduled')} value={c.scheduled || 0} icon={CalendarClock} tone="sky" loading={stats.loading && !stats.data} />
        <KpiCard label={p('منتهية', 'Expired')} value={c.expired || 0} icon={Hourglass} tone="accent" loading={stats.loading && !stats.data} />
        <KpiCard label={p('مسودات', 'Drafts')} value={c.draft || 0} icon={FileText} loading={stats.loading && !stats.data} />
        <KpiCard label={p('منتجات مشاركة', 'Participating products')} value={stats.data?.participatingProducts || 0} icon={Package} tone="violet" loading={stats.loading && !stats.data} />
        <KpiCard label={p('طلبات بعروض (30 يوم)', 'Orders with offers (30d)')} value={perf.orders || 0} icon={TicketPercent} loading={stats.loading && !stats.data} />
        <KpiCard label={p('خصومات ممنوحة (30 يوم)', 'Discounts given (30d)')} value={perf.discountGiven || 0} format={(v) => formatMoney(v, lang)} icon={Percent} tone="accent" loading={stats.loading && !stats.data} />
      </div>

      <div className="mb-6"><PromoAnalytics /></div>

      {!!stats.data?.top?.length && (
        <Panel title={p('أفضل العروض أداءً', 'Top performing offers')} className="mb-6">
          <ul className="divide-y divide-line">
            {stats.data.top.map((o) => (
              <li key={o.id ?? o.name.ar} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{tr(o.name)}</span>
                <span className="shrink-0 text-muted tabular">{o.orders} {p('طلب', 'orders')} · {formatMoney(o.discount, lang)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs value={state} onChange={setState} options={tabs} />
        <SearchInput value={term} onChange={setTerm} placeholder={p('ابحث باسم العرض', 'Search offers')} className="sm:w-72" />
      </div>

      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <ListSkeleton rows={3} /> : !items.length ? (
        <EmptyState icon={TicketPercent} title={p('لا توجد عروض هنا بعد', 'No offers here yet')} body={p('ابدأ بإنشاء أول عرض لمتجرك', 'Create your first offer')}
          action={<Button to="/dashboard/promotions/new"><Plus className="h-4 w-4" />{p('عرض جديد', 'New offer')}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => (
            <article key={o.id} className="overflow-hidden rounded-2xl border border-line bg-elevated">
              <Link to={`/dashboard/promotions/${o.id}`} className="block"><OfferVisual offer={o} ratio="16 / 8" compact /></Link>
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{tr(o.name)}</h3>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{o.text ? [tr(o.text.headline), tr(o.text.conditions)].filter(Boolean).join(' — ') : ''}</p>
                  </div>
                  <Badge tone={STATE_TONE[o.state] || 'neutral'} dot size="sm">{STATE_LABEL[o.state]?.[lang === 'ar' ? 0 : 1]}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{o.productCount} {p('منتج', 'products')}</span>
                  {o.startsAt && <span>{p('من', 'From')} {o.startsAt.replace('T', ' ')}</span>}
                  {o.endsAt && <span>{p('إلى', 'To')} {o.endsAt.replace('T', ' ')}</span>}
                  {(o.usageCount > 0 || o.usageLimit) && <span>{p('استخدام', 'Used')} {o.usageCount}{o.usageLimit ? `/${o.usageLimit}` : ''}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
                  <IconButton label={p('تعديل', 'Edit')} icon={Pencil} to={`/dashboard/promotions/${o.id}`} />
                  <IconButton label={p('معاينة', 'Preview')} icon={Eye} onClick={() => setPreview(o)} />
                  <IconButton label={p('المنتجات', 'Products')} icon={Package} onClick={() => setProductsOf(o)} />
                  <IconButton label={p('نسخ', 'Duplicate')} icon={Copy} disabled={busy === `d${o.id}`} onClick={() => dup(o)} />
                  {o.status === 'active'
                    ? <IconButton label={p('إيقاف مؤقت', 'Pause')} icon={Pause} disabled={busy === `s${o.id}`} onClick={() => setStatus(o, 'paused')} />
                    : <IconButton label={p('تفعيل', 'Activate')} icon={Play} disabled={busy === `s${o.id}`} onClick={() => setStatus(o, 'active')} />}
                  <IconButton label={p('حذف', 'Delete')} icon={Trash2} className="ms-auto text-sale" onClick={() => setDel(o)} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Sheet open={!!preview} onClose={() => setPreview(null)} title={preview ? tr(preview.name) : ''} size="md">
        {preview && (
          <div className="space-y-4">
            <OfferVisual offer={preview} />
            {preview.text?.headline && <p className="text-base font-semibold">{tr(preview.text.headline)}</p>}
            {tr(preview.text?.conditions) && <p className="text-sm text-muted">{tr(preview.text.conditions)}</p>}
            {preview.text?.cap && <p className="text-xs text-muted">{tr(preview.text.cap)}</p>}
          </div>
        )}
      </Sheet>

      <PromoHistorySheet open={history} onClose={() => setHistory(false)} />
      <ProductsSheet offer={productsOf} onClose={() => setProductsOf(null)} />

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger title={p('حذف العرض؟', 'Delete this offer?')}
        body={p('لن يتأثر سجل الطلبات السابقة.', 'Past orders keep their history.')} confirmLabel={p('حذف', 'Delete')} loading={busy === 'del'}
        onConfirm={async () => { await run('del', () => api(`/owner/promotions/${del.id}`, { method: 'DELETE' }), p('تم الحذف', 'Deleted')); setDel(null); }} />

      <BulkSheet open={bulk} onClose={() => setBulk(false)} />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </PageTransition>
  );
}

function ProductsSheet({ offer, onClose }) {
  const { lang, tr } = useI18n();
  const { data, error, loading } = useApi(offer ? `/owner/promotions/${offer.id}/products` : null);
  return (
    <Sheet open={!!offer} onClose={onClose} title={offer ? `${lang === 'ar' ? 'منتجات' : 'Products in'} ${tr(offer.name)}` : ''} size="md">
      {error ? <ErrorState error={error} compact /> : loading && !data ? <ListSkeleton rows={4} /> : !data?.items?.length ? (
        <p className="py-8 text-center text-muted">{lang === 'ar' ? 'لا توجد منتجات في هذا العرض' : 'No products in this offer'}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{data.total} {lang === 'ar' ? 'منتج' : 'products'}</p>
          <ul className="divide-y divide-line">
            {data.items.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-fg/[0.06]">{x.image?.url && <img src={x.image.url} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tr(x.name)}</p><p className="text-xs text-muted tabular">{formatMoney(x.price, lang)}</p></div>
                {!x.inStock && <Badge tone="danger" size="sm">{lang === 'ar' ? 'نفد' : 'Out'}</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function BulkSheet({ open, onClose }) {
  const { lang, tr } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const toast = useToast();
  const { data } = useApi(open ? '/owner/promotions' : null);
  const [sel, setSel] = useState(emptySel());
  const [picker, setPicker] = useState(false);
  const [ids, setIds] = useState([]);
  const [mode, setMode] = useState('add');
  const [saving, setSaving] = useState(false);
  const eligible = useMemo(() => (data?.items || []).filter((o) => o.state !== 'expired'), [data]);
  const toggle = (id) => setIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const submit = async () => {
    setSaving(true);
    try {
      await api('/owner/promotions/bulk-assign', { method: 'POST', body: { promotionIds: ids, productIds: sel.products, mode } });
      refresh(); toast({ title: p('تم تحديث العروض', 'Offers updated') }); setSel(emptySel()); setIds([]); onClose();
    } catch (e) { toast({ tone: 'error', title: errorMessage(null, e) || p('تعذر الحفظ', 'Could not save') }); } finally { setSaving(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={p('إضافة منتجات لعروض', 'Bulk assign products')} size="md"
      footer={<Button onClick={submit} loading={saving} disabled={!sel.products.length || !ids.length} className="w-full sm:w-auto">{mode === 'add' ? p('إضافة للعروض المحددة', 'Add to selected offers') : p('إزالة من العروض المحددة', 'Remove from selected offers')}</Button>}>
      <div className="space-y-5">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: p('إضافة', 'Add') }, { value: 'remove', label: p('إزالة', 'Remove') }]} />
        <Field label={p('المنتجات', 'Products')}>
          <Button variant="secondary" type="button" onClick={() => setPicker(true)}>{sel.products.length ? `${sel.products.length} ${p('منتج محدد', 'selected')}` : p('اختر المنتجات', 'Choose products')}</Button>
        </Field>
        <ProductPicker open={picker} onClose={() => setPicker(false)} value={sel} onChange={setSel} productsOnly title={p('اختر المنتجات', 'Choose products')} />
        <div>
          <p className="mb-2 text-sm font-medium">{p('العروض', 'Offers')}</p>
          {!eligible.length ? <p className="text-sm text-muted">{p('لا توجد عروض متاحة', 'No offers available')}</p> : (
            <ul className="space-y-1.5">
              {eligible.map((o) => (
                <li key={o.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-line px-3 hover:bg-fg/[0.03]">
                    <input type="checkbox" checked={ids.includes(o.id)} onChange={() => toggle(o.id)} className="h-5 w-5 accent-[rgb(var(--c-primary))]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{tr(o.name)}</span>
                    <Badge tone={STATE_TONE[o.state]} size="sm">{STATE_LABEL[o.state]?.[lang === 'ar' ? 0 : 1]}</Badge>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">{p('تنطبق الإضافة على العروض التي تعتمد على منتجات محددة.', 'Applies to offers that target specific products.')}</p>
        </div>
      </div>
    </Sheet>
  );
}

function SettingsSheet({ open, onClose }) {
  const { lang } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const toast = useToast();
  const { data } = useApi(open ? '/owner/promotions/settings' : null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const cur = f || (data ? { resolution: data.resolution, maxPerCart: data.maxPerCart ?? '' } : null);
  const save = async () => {
    setSaving(true);
    try {
      await api('/owner/promotions/settings', { method: 'PUT', body: { resolution: cur.resolution, maxPerCart: cur.maxPerCart === '' ? null : Number(cur.maxPerCart) } });
      invalidate('/owner/promotions/settings'); toast({ title: p('تم الحفظ', 'Saved') }); setF(null); onClose();
    } catch (e) { toast({ tone: 'error', title: errorMessage(null, e) }); } finally { setSaving(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={p('إعدادات العروض', 'Offer settings')} size="sm" footer={<Button onClick={save} loading={saving} disabled={!cur}>{p('حفظ', 'Save')}</Button>}>
      {cur && (
        <div className="space-y-5">
          <Field label={p('عند تعارض العروض', 'When offers conflict')} hint={p('يحدد أي عرض يُطبّق عندما يصلح أكثر من عرض لنفس المنتج', 'Decides which offer wins when several fit the same product')}>
            <Select value={cur.resolution} onChange={(e) => setF({ ...cur, resolution: e.target.value })}>
              <option value="best_savings">{p('الأفضل للعميل (أكبر توفير)', 'Best for customer (largest saving)')}</option>
              <option value="priority">{p('حسب الأولوية', 'By priority')}</option>
            </Select>
          </Field>
          <Field label={p('أقصى عدد عروض في السلة', 'Max offers per cart')} optional={p('اختياري', 'optional')}>
            <Input type="number" min="1" max="20" inputMode="numeric" value={cur.maxPerCart} onChange={(e) => setF({ ...cur, maxPerCart: e.target.value })} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
