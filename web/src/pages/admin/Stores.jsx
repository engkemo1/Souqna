import { useMemo, useState } from 'react';
import { Plus, ExternalLink, LogIn, Link2, Package, Trash2, Pin, Copy, Pencil, Search, Check, X, ChevronDown } from 'lucide-react';
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
import { LocationPicker } from '../../components/ui/MapView.jsx';
import PlaceAutocomplete from '../../components/ui/PlaceAutocomplete.jsx';

const nzAr = (x) => String(x || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();

/** أقسام المحل: أقسام رئيسية قابلة للطي، بحث سريع، وملخص بالمختار (زي لوحات التجار الكبرى). */
const DeptPicker = ({ value, onChange, depts }) => {
  const act = useMemo(() => depts.list.filter((d) => d.active), [depts.list]);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState({});
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name: '', parent: '' });
  const [busy, setBusy] = useState(false);
  const kids = (slug) => act.filter((d) => d.parent === slug);
  const subtree = (slug) => [slug, ...kids(slug).flatMap((k) => subtree(k.slug))];
  const toggle = (slug) => onChange(value.includes(slug) ? value.filter((x) => x !== slug) : [...value, slug]);
  const tops = act.filter((d) => !d.parent);
  const t = nzAr(term);
  const Box = ({ on }) => <span className={cx('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-canvas')}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>;
  const Row = ({ d, depth = 0, sub }) => {
    const on = value.includes(d.slug);
    return (
      <button type="button" aria-pressed={on} onClick={() => toggle(d.slug)} style={{ paddingInlineStart: 8 + depth * 18 }}
        className={cx('flex min-h-[2.5rem] w-full items-center gap-2.5 rounded-lg pe-2 text-start text-sm transition hover:bg-fg/[0.05]', on && 'bg-fg/[0.06] font-semibold')}>
        <Box on={on} /><span className="min-w-0 flex-1 truncate">{d.name_ar}{sub && <span className="ms-2 text-xs font-normal text-muted">{sub}</span>}</span>
      </button>
    );
  };
  const Nested = ({ d, depth }) => <>{kids(d.slug).map((k) => <div key={k.slug}><Row d={k} depth={depth} /><Nested d={k} depth={depth + 1} /></div>)}</>;
  const known = new Set(act.map((d) => d.slug));
  const orphans = value.filter((v) => !known.has(v));
  const addDept = async () => {
    const name = nf.name.trim();
    if (name.length < 2) { toast({ tone: 'error', title: 'اكتب اسم القسم' }); return; }
    setBusy(true);
    try {
      const slug = `custom_${Date.now().toString(36)}`;
      await adminApi('/departments', { method: 'POST', body: { name_ar: name, name_en: name, slug, sizes: [], parent: nf.parent || null } });
      await depts.reload?.();
      onChange([...new Set([...value, slug])]);
      if (nf.parent) setOpen((o) => ({ ...o, [nf.parent]: true }));
      setNf({ name: '', parent: nf.parent }); setAdding(false); setTerm('');
      toast({ title: `اتضاف قسم «${name}» واتختار` });
    } catch (x) { toast({ tone: 'error', title: x.message || 'مقدرناش نضيف القسم' }); } finally { setBusy(false); }
  };
  const hits = t ? act.filter((d) => nzAr(d.name_ar).includes(t)) : [];
  return (
    <div className="space-y-3" role="group">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={term} onChange={(e) => setTerm(e.target.value)} className="ps-10" placeholder="ابحث عن قسم: فساتين، جزم، عبايات…" aria-label="بحث في الأقسام" />
      </div>
      {value.length > 0 && (
        <div className="rounded-xl bg-secondary/50 p-3">
          <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold">المختار ({value.length})</p><button type="button" onClick={() => onChange([])} className="text-[13px] font-semibold text-sale hover:underline">مسح الكل</button></div>
          <div className="flex flex-wrap gap-1.5">{value.map((v) => <button key={v} type="button" onClick={() => toggle(v)} className="inline-flex h-7 items-center gap-1 rounded-full bg-canvas px-2.5 text-xs font-medium ring-1 ring-line-strong hover:ring-sale">{depts.label(v)}<X className="h-3 w-3 text-muted" /></button>)}</div>
        </div>
      )}
      {t ? (
        <div className="rounded-xl border border-line p-1.5">
          {hits.length === 0 ? <p className="py-6 text-center text-sm text-muted">مفيش قسم بالاسم ده.</p> : hits.map((d) => <Row key={d.slug} d={d} sub={d.parent ? depts.label(d.parent) : null} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {tops.map((top) => {
            const all = subtree(top.slug); const picked = all.filter((x) => value.includes(x)).length;
            const isOpen = open[top.slug] ?? picked > 0; const hasKids = kids(top.slug).length > 0;
            const topOn = value.includes(top.slug);
            return (
              <div key={top.slug} className="overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center gap-1 pe-2">
                  <button type="button" onClick={() => setOpen({ ...open, [top.slug]: !isOpen })} aria-expanded={isOpen} className="flex min-h-[3rem] flex-1 items-center gap-2 px-3 text-start">
                    <ChevronDown className={cx('h-4 w-4 shrink-0 text-muted transition-transform', !isOpen && 'rtl:rotate-90 -rotate-90')} />
                    <span className="flex-1 text-[15px] font-bold">{top.name_ar}</span>
                    {hasKids && <span className="text-xs text-muted">{all.length - 1} قسم</span>}
                    {picked > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1.5 text-[11px] font-bold text-canvas">{picked}</span>}
                  </button>
                  <button type="button" aria-pressed={topOn} onClick={() => toggle(top.slug)} className={cx('h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition', topOn ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>{topOn ? 'كل الأقسام ✓' : 'كل الأقسام'}</button>
                </div>
                {isOpen && hasKids && (
                  <div className="grid gap-x-2 gap-y-0.5 border-t border-line bg-secondary/20 p-2 sm:grid-cols-2">
                    {kids(top.slug).map((k) => <div key={k.slug}><Row d={k} /><Nested d={k} depth={1} /></div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {adding ? (
        <div className="space-y-2.5 rounded-2xl border border-dashed border-line-strong p-3">
          <p className="text-sm font-semibold">إضافة قسم جديد</p>
          <Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder={term ? `اسم القسم (مثال: ${term})` : 'اسم القسم بالعربي'} aria-label="اسم القسم الجديد" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDept(); } }} />
          <select value={nf.parent} onChange={(e) => setNf({ ...nf, parent: e.target.value })} aria-label="يتبع قسم" className="h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-sm">
            <option value="">قسم رئيسي (مستقل)</option>
            {act.filter((d) => !d.parent).map((d) => <option key={d.slug} value={d.slug}>تحت: {d.name_ar}</option>)}
          </select>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={addDept} className="h-10 flex-1 rounded-xl bg-fg text-sm font-semibold text-canvas disabled:opacity-60">{busy ? '…' : 'إضافة واختيار'}</button><button type="button" onClick={() => setAdding(false)} className="h-10 rounded-xl border border-line-strong px-4 text-sm">إلغاء</button></div>
        </div>
      ) : (
        <button type="button" onClick={() => { setAdding(true); setNf({ name: term.trim(), parent: '' }); }} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm font-semibold text-muted transition hover:border-fg hover:text-fg"><Plus className="h-4 w-4" />{t && hits.length === 0 ? `مش لاقي «${term.trim()}»؟ أضفه كقسم جديد` : 'مش لاقي القسم؟ أضف قسم جديد'}</button>
      )}
      {orphans.length > 0 && <div className="flex flex-wrap gap-2">{orphans.map((d) => <button key={d} type="button" onClick={() => toggle(d)} className="h-8 rounded-full border border-line-strong px-3 text-xs">{depts.label(d)} ✕</button>)}</div>}
      {!depts.list.length && <p className="text-sm text-muted">جارٍ التحميل…</p>}
    </div>
  );
};

function CreateSheet({ open, onClose, onDone, depts }) {
  const toast = useToast();
  const empty = { store_name: '', owner_name: '', email: '', phone: '', whatsapp: '', address: '', map_url: '', opens_at: '10:00', closes_at: '23:00', departments: [], auto_whatsapp: false };
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
      const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== ''));
      const r = await adminApi('/stores', { method: 'POST', body });
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
            <Field label="العنوان" optional>
              <PlaceAutocomplete
                value={f.address}
                onChange={(v) => setF((prev) => ({ ...prev, address: v }))}
                onSelect={(place) => {
                  if (place.lat && place.lng) {
                    setF((prev) => ({
                      ...prev,
                      address: place.name || place.shortName || prev.address,
                      lat: place.lat,
                      lng: place.lng,
                      map_url: `https://www.google.com/maps?q=${place.lat},${place.lng}`,
                    }));
                  }
                }}
                placeholder="ابحث عن شارع أو معلم (مثلاً: شارع كلية التجارة، مسجد الخضر)…"
              />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium">موقع المحل على الخريطة</p>
              <LocationPicker
                lat={f.lat ?? null}
                lng={f.lng ?? null}
                onChange={(la, ln, place) => setF((prev) => ({
                  ...prev,
                  lat: la,
                  lng: ln,
                  map_url: `https://www.google.com/maps?q=${la},${ln}`,
                  address: !prev.address?.trim() && place?.shortName ? place.shortName : prev.address,
                }))}
                height={220}
              />
            </div>
            <Field label="بيفتح الساعة"><Input type="time" dir="ltr" value={f.opens_at} onChange={set('opens_at')} /></Field>
            <Field label="بيقفل الساعة"><Input type="time" dir="ltr" value={f.closes_at} onChange={set('closes_at')} /></Field>
          </div>
          <div><p className="mb-2 text-sm font-medium">أقسام المحل (واحد أو أكتر)</p><DeptPicker depts={depts} value={f.departments} onChange={(v) => setF({ ...f, departments: v })} />{errs.departments && <p className="mt-1 text-sm text-sale">{errs.departments}</p>}</div>
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
  if (store && key !== store.slug) { setKey(store.slug); setLink(null); setDel(''); setF({ slug: store.slug, name_ar: store.name_ar, name_en: store.name_en, phone: store.phone || '', delivery_zone: store.delivery_zone || '', departments: store.departments, lat: store.lat ?? null, lng: store.lng ?? null, hidden: store.hidden, show_when_empty: store.show_when_empty, featured: store.featured, auto_whatsapp: store.auto_whatsapp, suspended: store.status !== 'active', owner_disabled: store.owner_disabled, sort_order: store.sort_order, logo_initials: store.logo_initials || (store.name_ar || store.name_en || '').trim().replace(/\s+/g, '').slice(0, 2), logo_color: store.logo_color || '#1B1B1B' }); }
  if (!store || !f) return <Sheet open={false} onClose={onClose} />;
  const patch = async (body, label) => {
    setBusy(label || 'save');
    try { await adminApi(`/stores/${store.slug}`, { method: 'PATCH', body }); onChanged(); return true; } catch (x) { toast({ tone: 'error', title: x.fields?.phone ? 'رقم تليفون غير صحيح' : x.fields?.slug === 'slug_taken' ? 'الرابط ده مستخدم في متجر تاني' : x.fields?.slug ? 'رابط غير صالح' : x.message }); return false; } finally { setBusy(''); }
  };
  const save = async () => {
    if (!f.departments.length) { toast({ tone: 'error', title: 'اختار قسم واحد على الأقل' }); return; }
    const newSlug = String(f.slug || '').trim().toLowerCase();
    if (newSlug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(newSlug)) { toast({ tone: 'error', title: 'رابط المتجر: حروف إنجليزية وأرقام وشرطات بس' }); return; }
    const ok = await patch({ ...(newSlug && newSlug !== store.slug ? { slug: newSlug } : {}), name_ar: f.name_ar, name_en: f.name_en, phone: f.phone, delivery_zone: f.delivery_zone, departments: f.departments, lat: f.lat ?? null, lng: f.lng ?? null, hidden: f.hidden, show_when_empty: f.show_when_empty, featured: f.featured, auto_whatsapp: f.auto_whatsapp, status: f.suspended ? 'suspended' : 'active', owner_disabled: f.owner_disabled, sort_order: Number(f.sort_order) || 0, logo_initials: f.logo_initials, logo_color: f.logo_color });
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
            <Field label="رابط المتجر" hint={`twistegy.com/s/${f.slug || ''} — الرابط القديم بيحوّل للجديد تلقائي`}><Input dir="ltr" value={f.slug || ''} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="text-start" /></Field>
            <Field label="رقم التليفون"><Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="text-start" /></Field>
            <Field label="ترتيب الظهور" hint="الأصغر يظهر الأول"><Input type="number" dir="ltr" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="mb-3 text-sm font-semibold">شعار بالحروف</p>
            <div className="flex items-end gap-3">
              <Field label="أول حرفين"><Input maxLength={2} value={f.logo_initials} onChange={(e) => setF({ ...f, logo_initials: [...e.target.value].slice(0, 2).join('') })} /></Field>
              <label className="grid gap-1 text-sm font-medium">اللون<input aria-label="لون شعار الحروف" type="color" value={f.logo_color} onChange={(e) => setF({ ...f, logo_color: e.target.value })} className="h-11 w-16 cursor-pointer rounded-lg border border-line bg-transparent p-1" /></label>
              <span className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: f.logo_color }}>{f.logo_initials || (store.name_ar || store.name_en || '').trim().replace(/\s+/g, '').slice(0, 2)}</span>
            </div>
            <p className="mt-2 text-xs text-muted">يظهر لو مفيش صورة شعار مرفوعة للمحل.</p>
          </div>
          <div><p className="mb-2 text-sm font-medium">الأقسام</p><DeptPicker depts={depts} value={f.departments} onChange={(v) => setF({ ...f, departments: v })} /></div>
          <div><p className="mb-2 text-sm font-medium">موقع المحل على الخريطة</p><LocationPicker lat={f.lat} lng={f.lng} onChange={(la, ln) => setF({ ...f, lat: la, lng: ln })} height={220} /></div>
          <Field label="منطقة استلام الطلبات" hint="اكتب نفس المنطقة للمحلات القريبة التي يمكن للمندوب جمع طلباتها في جولة واحدة. اتركها فارغة لو المحل يحتاج مسارًا منفصلًا.">
            <PlaceAutocomplete
              value={f.delivery_zone || ''}
              onChange={(v) => setF({ ...f, delivery_zone: v })}
              placeholder="مثال: وسط بنها، كفر الجزار، شبرا الخيمة…"
            />
          </Field>
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <Switch checked={!f.hidden} onChange={(v) => setF({ ...f, hidden: !v })} label="ظاهر في الصفحة الرئيسية" />
            <Switch checked={!!f.show_when_empty} onChange={(v) => setF({ ...f, show_when_empty: v })} label="إظهار حتى لو فاضي" />
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
  const counts = useMemo(() => ({ all: stores.length, active: stores.filter((s) => s.status === 'active' && !s.hidden).length, hidden: stores.filter((s) => s.hidden).length, suspended: stores.filter((s) => s.status !== 'active').length, platform: stores.filter((s) => s.lat == null).length }), [stores]);
  const shown = stores.filter((s) => {
    if (tab === 'active' && !(s.status === 'active' && !s.hidden)) return false;
    if (tab === 'hidden' && !s.hidden) return false;
    if (tab === 'suspended' && s.status === 'active') return false;
    if (tab === 'platform' && s.lat != null) return false;
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
        <FilterTabs value={tab} onChange={setTab} options={[{ value: 'all', label: 'الكل', count: counts.all }, { value: 'active', label: 'ظاهر', count: counts.active }, { value: 'hidden', label: 'مخفي', count: counts.hidden }, { value: 'suspended', label: 'موقوف', count: counts.suspended }, { value: 'platform', label: 'بدون موقع', count: counts.platform }]} />
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
                      {s.lat == null && <Badge tone="warning" size="sm">📍 بدون موقع</Badge>}
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
