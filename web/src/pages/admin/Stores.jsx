import { useMemo, useState } from 'react';
import { Plus, ExternalLink, LogIn, Link2, Package, Trash2, Pin, Copy, Pencil } from 'lucide-react';
import { PageHeader, FilterTabs, SearchInput } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Switch, Segmented } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';
import { tokenStore } from '../../lib/api.js';
import { adminApi, useAdminApi, fmtMoney, fmtNum, fmtDateTime, useAdminDepartments } from './adminApi.js';

const DeptPicker = ({ value, onChange, depts }) => (
  <div className="flex flex-wrap gap-2" role="group">
    {[...depts.list.filter((d) => d.active).map((d) => d.slug), ...value.filter((v) => !depts.list.some((d) => d.slug === v && d.active))].map((d) => {
      const on = value.includes(d);
      return <button key={d} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
        className={cx('h-9 rounded-full border px-3.5 text-sm font-medium transition active:scale-95', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>{depts.label(d)}</button>;
    })}
    {!depts.list.length && <p className="text-sm text-muted">جارٍ التحميل…</p>}
  </div>
);

function CreateSheet({ open, onClose, onDone, depts }) {
  const toast = useToast();
  const empty = { store_name: '', owner_name: '', email: '', phone: '', whatsapp: '', address: '', map_url: '', opens_at: '10:00', closes_at: '23:00', departments: [], delivery_mode: 'store', auto_whatsapp: false };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [link, setLink] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.departments.length) { setErrs({ departments: 'اختار قسم واحد على الأقل' }); return; }
    setBusy(true); setErrs({});
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== '' && k !== 'delivery_mode'));
      const r = await adminApi('/stores', { method: 'POST', body });
      if (f.delivery_mode === 'platform') await adminApi(`/stores/${r.slug}`, { method: 'PATCH', body: { delivery_mode: 'platform' } });
      setLink({ slug: r.slug, url: r.setup.url, expires: r.setup.expires });
      onDone();
    } catch (x) {
      setErrs(Object.fromEntries(Object.entries(x.fields || {}).map(([k, v]) => [k, v === 'email_taken' ? 'الإيميل ده مستخدم' : v === 'phone_invalid' ? 'رقم مصري صحيح (01xxxxxxxxx)' : 'قيمة غير صحيحة'])));
      toast({ tone: 'error', title: x.message });
    }
    setBusy(false);
  };
  const close = () => { setLink(null); setF(empty); setErrs({}); onClose(); };
  return (
    <Sheet open={open} onClose={close} title="إضافة محل جديد" side="end" size="lg">
      {link ? (
        <div className="space-y-4 py-4">
          <p className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">تم إنشاء المحل ✅ ابعت اللينك ده لصاحب المحل عشان يختار الباسورد (صالح 7 أيام ولمرة واحدة).</p>
          <Input dir="ltr" readOnly value={link.url} onFocus={(e) => e.target.select()} />
          <div className="flex gap-2">
            <Button icon={Copy} onClick={() => { navigator.clipboard?.writeText(link.url); toast({ title: 'اتنسخ' }); }}>نسخ اللينك</Button>
            <Button variant="outline" onClick={close}>تمام</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المحل" error={errs.store_name}><Input required minLength={2} value={f.store_name} onChange={set('store_name')} /></Field>
            <Field label="اسم الصاحب" error={errs.owner_name}><Input required minLength={2} value={f.owner_name} onChange={set('owner_name')} /></Field>
            <Field label="إيميل الدخول" error={errs.email}><Input type="email" dir="ltr" required value={f.email} onChange={set('email')} className="text-start" /></Field>
            <Field label="رقم التليفون" error={errs.phone}><Input dir="ltr" inputMode="tel" required pattern="01[0125][0-9]{8}" value={f.phone} onChange={set('phone')} className="text-start" /></Field>
            <Field label="واتساب المحل (لو مختلف)" optional error={errs.whatsapp}><Input dir="ltr" inputMode="tel" pattern="01[0125][0-9]{8}" value={f.whatsapp} onChange={set('whatsapp')} className="text-start" /></Field>
            <Field label="العنوان" optional><Input value={f.address} onChange={set('address')} placeholder="شارع ...، بنها" /></Field>
            <Field label="لينك اللوكيشن (جوجل ماب)" optional error={errs.map_url} className="sm:col-span-2"><Input dir="ltr" type="url" value={f.map_url} onChange={set('map_url')} placeholder="https://maps.app.goo.gl/..." className="text-start" /></Field>
            <Field label="بيفتح الساعة"><Input type="time" dir="ltr" value={f.opens_at} onChange={set('opens_at')} /></Field>
            <Field label="بيقفل الساعة"><Input type="time" dir="ltr" value={f.closes_at} onChange={set('closes_at')} /></Field>
          </div>
          <div><p className="mb-2 text-sm font-medium">أقسام المحل (واحد أو أكتر)</p><DeptPicker depts={depts} value={f.departments} onChange={(v) => setF({ ...f, departments: v })} />{errs.departments && <p className="mt-1 text-sm text-sale">{errs.departments}</p>}</div>
          <div><p className="mb-2 text-sm font-medium">التوصيل</p>
            <Segmented value={f.delivery_mode} onChange={(v) => setF({ ...f, delivery_mode: v })} options={[{ value: 'store', label: 'المحل بيوصّل' }, { value: 'platform', label: 'بنها أوتفيت توصّل' }]} />
          </div>
          <Switch checked={f.auto_whatsapp} onChange={(v) => setF({ ...f, auto_whatsapp: v })} label="إشعار واتساب تلقائي للمحل" description="يتطلب واتساب API متوصل" />
          <Button type="submit" full loading={busy}>إنشاء المحل + لينك التفعيل</Button>
        </form>
      )}
    </Sheet>
  );
}

function ProductsSheet({ store, onClose }) {
  const toast = useToast();
  const { data, error, reload } = useAdminApi(store ? `/stores/${store.slug}/products` : '/status');
  const toggle = async (p) => {
    try { await adminApi(`/stores/${store.slug}/products/${p.id}`, { method: 'PATCH', body: { featured: !p.featured } }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  return (
    <Sheet open={!!store} onClose={onClose} title={store ? `منتجات ${store.name_ar}` : ''} description="المنتجات المثبتة بتظهر الأول في صفحة المحل." side="end" size="lg">
      {error ? <ErrorState error={error} onRetry={reload} compact /> : !store || !data?.products ? <Skeleton className="my-4 h-40 w-full rounded-2xl" /> : (
        <ul className="divide-y divide-line">
          {data.products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.name_ar}</p><p className="text-[13px] text-muted">{fmtMoney(p.price)} · مخزون {fmtNum(p.stock)}{p.status !== 'active' ? ` · ${p.status}` : ''}</p></div>
              <Button size="xs" variant={p.featured ? 'brand' : 'outline'} icon={Pin} onClick={() => toggle(p)}>{p.featured ? 'مثبت' : 'تثبيت'}</Button>
            </li>
          ))}
          {!data.products.length && <li className="py-8 text-center text-sm text-muted">مفيش منتجات.</li>}
        </ul>
      )}
    </Sheet>
  );
}

function EditSheet({ store, onClose, onChanged, depts }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState('');
  const [prod, setProd] = useState(null);
  const [del, setDel] = useState('');
  const [link, setLink] = useState(null);
  if (store && key !== store.slug) { setKey(store.slug); setLink(null); setDel(''); setF({ name_ar: store.name_ar, name_en: store.name_en, phone: store.phone || '', departments: store.departments, delivery_mode: store.delivery_mode, hidden: store.hidden, featured: store.featured, auto_whatsapp: store.auto_whatsapp, suspended: store.status !== 'active', owner_disabled: store.owner_disabled, sort_order: store.sort_order }); }
  if (!store || !f) return <Sheet open={false} onClose={onClose} />;
  const patch = async (body, label) => {
    setBusy(label || 'save');
    try { await adminApi(`/stores/${store.slug}`, { method: 'PATCH', body }); onChanged(); return true; } catch (x) { toast({ tone: 'error', title: x.fields?.phone ? 'رقم تليفون غير صحيح' : x.message }); return false; } finally { setBusy(''); }
  };
  const save = async () => {
    if (!f.departments.length) { toast({ tone: 'error', title: 'اختار قسم واحد على الأقل' }); return; }
    const ok = await patch({ name_ar: f.name_ar, name_en: f.name_en, phone: f.phone, departments: f.departments, delivery_mode: f.delivery_mode, hidden: f.hidden, featured: f.featured, auto_whatsapp: f.auto_whatsapp, status: f.suspended ? 'suspended' : 'active', owner_disabled: f.owner_disabled, sort_order: Number(f.sort_order) || 0 });
    if (ok) { toast({ title: 'اتحفظ' }); onClose(); }
  };
  const setup = async () => { try { const r = await adminApi(`/stores/${store.slug}/setup-link`, { method: 'POST', body: {} }); setLink(r.url); navigator.clipboard?.writeText(r.url); toast({ title: 'اتعمل لينك تفعيل واتنسخ' }); } catch (x) { toast({ tone: 'error', title: x.message }); } };
  const loginAs = async () => { try { const { token } = await adminApi(`/stores/${store.slug}/login-as`, { method: 'POST', body: {} }); tokenStore.set(token); window.open('/dashboard', '_blank'); } catch (x) { toast({ tone: 'error', title: x.message }); } };
  const remove = async () => { try { await adminApi(`/stores/${store.slug}`, { method: 'DELETE', body: { confirm: del } }); toast({ title: 'اتحذف' }); onChanged(); onClose(); } catch (x) { toast({ tone: 'error', title: x.message }); } };
  return (
    <>
      <Sheet open={!prod} onClose={onClose} title={store.name_ar} description={`${store.slug} · ${store.owner_name} · ${store.owner_email}`} side="end" size="lg"
        footer={<div className="flex gap-2"><Button full loading={busy === 'save'} onClick={save}>حفظ التعديلات</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>}>
        <div className="space-y-5 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['طلبات', fmtNum(store.orders_count)], ['مبيعات', fmtMoney(store.revenue)], ['منتجات', fmtNum(store.products_count)], ['آخر طلب', fmtDateTime(store.last_order_at)]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-fg/[0.04] p-3"><p className="text-xs text-muted">{l}</p><p className="mt-0.5 truncate text-sm font-semibold">{v}</p></div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم (عربي)"><Input value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></Field>
            <Field label="الاسم (إنجليزي)"><Input dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} className="text-start" /></Field>
            <Field label="رقم التليفون"><Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="text-start" /></Field>
            <Field label="ترتيب الظهور" hint="الأصغر يظهر الأول"><Input type="number" dir="ltr" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
          </div>
          <div><p className="mb-2 text-sm font-medium">الأقسام</p><DeptPicker depts={depts} value={f.departments} onChange={(v) => setF({ ...f, departments: v })} /></div>
          <div><p className="mb-2 text-sm font-medium">التوصيل</p>
            <Segmented value={f.delivery_mode} onChange={(v) => setF({ ...f, delivery_mode: v })} options={[{ value: 'store', label: 'المحل بيوصّل' }, { value: 'platform', label: 'بنها أوتفيت توصّل' }]} /></div>
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <Switch checked={!f.hidden} onChange={(v) => setF({ ...f, hidden: !v })} label="ظاهر في الصفحة الرئيسية" />
            <Switch checked={f.featured} onChange={(v) => setF({ ...f, featured: v })} label="محل مميز ★" />
            <Switch checked={f.auto_whatsapp} onChange={(v) => setF({ ...f, auto_whatsapp: v })} label="إشعار واتساب تلقائي للمحل" />
            <Switch checked={f.suspended} onChange={(v) => setF({ ...f, suspended: v })} label="إيقاف المحل" description="بيختفي من الموقع والعملاء مش هيقدروا يطلبوا" />
            <Switch checked={f.owner_disabled} onChange={(v) => setF({ ...f, owner_disabled: v })} label="تعطيل دخول الصاحب" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={ExternalLink} href={`/s/${store.slug}`} target="_blank" rel="noreferrer">صفحة المحل</Button>
            <Button size="sm" variant="outline" icon={LogIn} onClick={loginAs}>ادخل لوحته</Button>
            <Button size="sm" variant="outline" icon={Link2} onClick={setup}>لينك تفعيل / إعادة باسورد</Button>
            <Button size="sm" icon={Package} to={`/admin/manage/${store.slug}/products`}>إدارة المنتجات</Button>
            <Button size="sm" variant="outline" icon={Pin} onClick={() => setProd(store)}>تثبيت منتجات</Button>
          </div>
          {link && <Input dir="ltr" readOnly value={link} onFocus={(e) => e.target.select()} />}
          <details className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-sale">حذف المحل نهائياً</summary>
            <p className="mt-2 text-[13px] text-muted">هيتحذف المحل ومنتجاته وطلباته وحساب صاحبه ومش هيترجع. اكتب <b dir="ltr">{store.slug}</b> للتأكيد.</p>
            <div className="mt-3 flex gap-2"><Input dir="ltr" value={del} onChange={(e) => setDel(e.target.value)} /><Button variant="danger" icon={Trash2} disabled={del !== store.slug} onClick={remove}>حذف</Button></div>
          </details>
        </div>
      </Sheet>
      <ProductsSheet store={prod} onClose={() => setProd(null)} />
    </>
  );
}

export default function Stores() {
  const { data, error, loading, reload } = useAdminApi('/stores');
  const depts = useAdminDepartments();
  const [tab, setTab] = useState('all');
  const [term, setTerm] = useState('');
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState(null);
  const stores = data?.stores || [];
  const counts = useMemo(() => ({ all: stores.length, active: stores.filter((s) => s.status === 'active' && !s.hidden).length, hidden: stores.filter((s) => s.hidden).length, suspended: stores.filter((s) => s.status !== 'active').length, platform: stores.filter((s) => s.delivery_mode === 'platform').length }), [stores]);
  const shown = stores.filter((s) => {
    if (tab === 'active' && !(s.status === 'active' && !s.hidden)) return false;
    if (tab === 'hidden' && !s.hidden) return false;
    if (tab === 'suspended' && s.status === 'active') return false;
    if (tab === 'platform' && s.delivery_mode !== 'platform') return false;
    const x = term.trim().toLowerCase();
    return !x || [s.name_ar, s.name_en, s.slug, s.owner_name, s.owner_email, s.phone].some((v) => String(v || '').toLowerCase().includes(x));
  });
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const live = edit ? stores.find((s) => s.slug === edit.slug) || edit : null;
  return (
    <div>
      <PageHeader title="المحلات" subtitle={`${fmtNum(stores.length)} محل على المنصة`} actions={<Button icon={Plus} onClick={() => setCreate(true)}>محل جديد</Button>} />
      <div className="mb-4 space-y-3">
        <SearchInput value={term} onChange={setTerm} placeholder="ابحث بالاسم أو الإيميل أو التليفون" />
        <FilterTabs value={tab} onChange={setTab} options={[{ value: 'all', label: 'الكل', count: counts.all }, { value: 'active', label: 'ظاهر', count: counts.active }, { value: 'hidden', label: 'مخفي', count: counts.hidden }, { value: 'suspended', label: 'موقوف', count: counts.suspended }, { value: 'platform', label: 'توصيلنا', count: counts.platform }]} />
      </div>
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !shown.length ? <EmptyState title="مفيش محلات" body="جرّب بحث تاني أو أضف محل جديد." /> : (
        <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
          <ul className="divide-y divide-line">
            {shown.map((s) => (
              <li key={s.slug}>
                <button type="button" onClick={() => setEdit(s)} className="flex w-full flex-col gap-2 px-4 py-3.5 text-start transition hover:bg-fg/[0.025] sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{s.name_ar}
                      {s.status !== 'active' && <Badge tone="danger" size="sm">موقوف</Badge>}
                      {s.hidden && <Badge size="sm">مخفي</Badge>}
                      {s.featured && <Badge tone="warning" size="sm">★ مميز</Badge>}
                      {s.delivery_mode === 'platform' && <Badge tone="info" size="sm">🚚 توصيلنا</Badge>}
                      {s.owner_disabled && <Badge tone="danger" size="sm">الدخول معطّل</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">{s.owner_name} · {s.owner_email} · {s.phone}</p>
                    <p className="mt-1 flex flex-wrap gap-1">{(s.departments.length ? s.departments : [s.category]).map((d) => <span key={d} className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-xs">{depts.label(d)}</span>)}</p>
                  </div>
                  <div className="flex shrink-0 gap-6 text-sm sm:text-end">
                    <div><p className="text-xs text-muted">طلبات</p><p className="font-semibold tabular">{fmtNum(s.orders_count)}</p></div>
                    <div><p className="text-xs text-muted">منتجات</p><p className="font-semibold tabular">{fmtNum(s.products_count)}</p></div>
                    <div className="min-w-24"><p className="text-xs text-muted">مبيعات</p><p className="font-semibold tabular">{fmtMoney(s.revenue)}</p></div>
                    <Pencil className="hidden h-4 w-4 self-center text-muted sm:block" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <CreateSheet depts={depts} open={create} onClose={() => setCreate(false)} onDone={reload} />
      <EditSheet depts={depts} store={live} onClose={() => setEdit(null)} onChanged={reload} />
    </div>
  );
}
