import OrderCommentsView from '../../components/OrderCommentsView.jsx';
import { useState } from 'react';
import { Truck, Phone, MessageCircle, MapPin, Store as StoreIcon, Pencil, Undo2 } from 'lucide-react';
import { PageHeader, FilterTabs, SearchInput, Pagination } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Select, Input, Textarea, Checkbox } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDebounced } from '../../lib/hooks.js';
import { adminApi, useAdminApi, fmtMoney, fmtNum, fmtDateTime, ORDER_STATUS_AR, waLink } from './adminApi.js';
import { StatusPill } from './Overview.jsx';

const EDIT_FIELDS = [['customer_name', 'اسم العميل'], ['phone', 'التليفون'], ['governorate', 'المحافظة'], ['city', 'المدينة'], ['address', 'العنوان'], ['notes', 'ملاحظات']];

/** Admin controls: status override (cancel needs a confirm), edit customer details, record returns. */
function AdminControls({ o, items, reload, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [edit, setEdit] = useState(null);
  const [ret, setRet] = useState(null);
  const [preview, setPreview] = useState(null);
  const cancelled = o.status === 'cancelled';
  const done = (title) => { toast({ title }); setSure(false); setStatus(''); setNote(''); reload(); onChanged(); };
  const fail = (x) => toast({ tone: 'error', title: x.message });
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (x) { fail(x); } setBusy(false); };
  const changeStatus = () => run(async () => { await adminApi(`/orders/${o.id}/admin-status`, { method: 'PATCH', body: { status, note: note || undefined } }); done(`الحالة بقت: ${ORDER_STATUS_AR[status]}`); });
  const saveEdit = () => run(async () => {
    const body = {}; EDIT_FIELDS.forEach(([k]) => { if ((edit[k] ?? '') !== (o[k] ?? '')) body[k] = edit[k]; });
    if (!Object.keys(body).length) { setEdit(null); return; }
    await adminApi(`/orders/${o.id}/details`, { method: 'PATCH', body }); setEdit(null); done('اتحفظت بيانات الطلب');
  });
  const retBody = (dryRun) => ({ items: Object.entries(ret.qty).filter(([, n]) => n > 0).map(([itemId, qty]) => ({ itemId: Number(itemId), qty })), reason: ret.reason || undefined, restock: ret.restock, dryRun });
  const previewReturn = () => run(async () => { setPreview(await adminApi(`/orders/${o.id}/returns`, { method: 'POST', body: retBody(true) })); });
  const doReturn = () => run(async () => { await adminApi(`/orders/${o.id}/returns`, { method: 'POST', body: retBody(false) }); setRet(null); setPreview(null); done('اتسجّل المرتجع'); });
  const canReturn = ['shipped', 'delivered'].includes(o.status);
  const options = Object.entries(ORDER_STATUS_AR).filter(([v]) => v !== o.status && !(o.status === 'delivered' && v === 'cancelled'));
  return (
    <div className="space-y-4 rounded-2xl border border-brand/30 bg-brand/[0.03] p-4">
      <p className="text-sm font-semibold">تحكم الأدمن</p>
      {cancelled ? <p className="text-sm text-muted">الطلب ملغي والمخزون رجع. الإلغاء نهائي ومينفعش يتغيّر.</p> : (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setSure(false); }} className="sm:w-48" aria-label="الحالة الجديدة"><option value="">غيّر الحالة…</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'cancelled' ? 'سبب الإلغاء' : 'ملاحظة (اختياري)'} maxLength={250} className="flex-1" />
          </div>
          {status && (status === 'cancelled' && !sure
            ? <Button variant="outline" onClick={() => setSure(true)}>إلغاء الطلب…</Button>
            : <Button loading={busy} onClick={changeStatus}>{status === 'cancelled' ? 'تأكيد الإلغاء ورجوع المخزون (نهائي)' : `تحويل إلى: ${ORDER_STATUS_AR[status]}`}</Button>)}
          {o.status === 'delivered' && <p className="text-xs text-muted">الطلب اتسلّم: لو في مرتجع سجّله من تحت بدل الإلغاء.</p>}
        </div>
      )}
      {!cancelled && (edit ? (
        <div className="space-y-2 border-t border-line pt-3">
          {EDIT_FIELDS.map(([k, label]) => <label key={k} className="block text-sm"><span className="text-muted">{label}</span>{k === 'notes' || k === 'address' ? <Textarea rows={2} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /> : <Input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} dir={k === 'phone' ? 'ltr' : undefined} />}</label>)}
          <div className="flex gap-2"><Button loading={busy} onClick={saveEdit}>حفظ</Button><Button variant="outline" onClick={() => setEdit(null)}>إلغاء</Button></div>
          <p className="text-xs text-muted">تعديل بيانات العميل والتوصيل بس. المنتجات والمبالغ مش بتتغيّر من هنا.</p>
        </div>
      ) : <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEdit(Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, o[k] ?? ''])))}>عدّل بيانات الطلب</Button>)}
      {canReturn && (ret ? (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold">مرتجع</p>
          {items.map((i) => { const left = i.qty - (i.returned_qty || 0); return (
            <div key={i.id} className="flex items-center justify-between gap-3 text-sm"><span>{i.name_ar}{i.size ? ` · ${i.size}` : ''} <span className="text-muted">(متاح {fmtNum(left)})</span></span>
              <Input type="number" min={0} max={left} disabled={left < 1} value={ret.qty[i.id] || 0} onChange={(e) => { setPreview(null); setRet({ ...ret, qty: { ...ret.qty, [i.id]: Math.max(0, Math.min(left, Number(e.target.value) || 0)) } }); }} className="w-20" aria-label="الكمية" /></div>); })}
          <Input value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} placeholder="سبب المرتجع" maxLength={300} />
          <Checkbox checked={ret.restock} onChange={(v) => { setPreview(null); setRet({ ...ret, restock: v }); }} label="رجّع الكمية للمخزون" />
          {preview && <p className="rounded-xl bg-fg/[0.04] p-3 text-sm font-medium">المبلغ المسترد: {fmtMoney(preview.refund)}</p>}
          <div className="flex gap-2">{preview ? <Button loading={busy} onClick={doReturn}>تأكيد المرتجع</Button> : <Button loading={busy} disabled={!Object.values(ret.qty).some((n) => n > 0)} onClick={previewReturn}>احسب المبلغ</Button>}<Button variant="outline" onClick={() => { setRet(null); setPreview(null); }}>إلغاء</Button></div>
        </div>
      ) : <Button size="sm" variant="outline" icon={Undo2} onClick={() => setRet({ qty: {}, reason: '', restock: true })}>سجّل مرتجع</Button>)}
    </div>
  );
}

function BlockCustomer({ o, blocked, reload, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const set = async (b) => {
    setBusy(true);
    try { await adminApi(`/customers/${encodeURIComponent(o.phone)}`, { method: 'PUT', body: { blocked: b, reason: b ? reason || undefined : '' } }); toast({ title: b ? 'العميل اتبلوك' : 'اتفك البلوك' }); setOpen(false); setReason(''); reload(); onChanged(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  if (blocked) return <div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone="danger">🚫 العميل ده متبلوك</Badge><Button size="xs" variant="outline" loading={busy} onClick={() => set(false)}>فك البلوك</Button></div>;
  if (!open) return <div className="mt-3"><Button size="xs" variant="outline" onClick={() => setOpen(true)}>🚫 بلوك العميل</Button></div>;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب البلوك (اختياري)" maxLength={200} />
      <p className="text-xs text-muted">الرقم ده مش هيقدر يعمل طلبات أو حجوزات أو يسجّل دخول. الطلبات الحالية مبتتأثرش.</p>
      <div className="flex gap-2"><Button size="xs" loading={busy} onClick={() => set(true)}>تأكيد البلوك</Button><Button size="xs" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button></div>
    </div>
  );
}

function adminNote(n) {
  if (n.startsWith('@edit:')) return `الأدمن عدّل: ${n.slice(6).trim()}`;
  if (n.startsWith('@admin return:')) return `الأدمن سجّل مرتجع (${n.slice(14)} ج)`;
  if (n.startsWith('@admin')) return `الأدمن${n.slice(6) ? `: ${n.slice(6).replace(/^[\s:]+/, '')}` : ''}`;
  return n;
}

function OrderSheet({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data, error, reload } = useAdminApi(id ? `/orders/${id}` : '/status');
  const o = id ? data?.order : null;
  const [busy, setBusy] = useState(false);
  const setDelivery = async (delivery_by) => {
    setBusy(true);
    try { await adminApi(`/orders/${id}/delivery`, { method: 'PATCH', body: { delivery_by } }); toast({ title: delivery_by === 'platform' ? 'اتحوّل لتوصيل Twist' : 'رجع لتوصيل المحل' }); reload(); onChanged(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  return (
    <Sheet open={!!id} onClose={onClose} title={o ? `طلب #${o.number}` : 'طلب'} side="end" size="lg">
      {error ? <ErrorState error={error} onRetry={reload} compact /> : !o ? <Skeleton className="my-4 h-64 w-full rounded-2xl" /> : (
        <div className="space-y-5 py-4">
          <div className="flex flex-wrap items-center gap-2"><StatusPill s={o.status} platform={o.delivery_by === 'platform'} />{o.delivery_by === 'platform' ? <Badge tone="info">🚚 توصيل Twist</Badge> : <Badge>توصيل المحل</Badge>}<span className="text-sm text-muted">{fmtDateTime(o.created_at)}</span></div>
          <div className="rounded-2xl border border-line p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><StoreIcon className="h-4 w-4" />المحل (الاستلام)</p>
            <p className="font-medium">{o.store_name}</p><p className="text-sm text-muted">{o.store_address || '—'}</p>
            <div className="mt-2 flex gap-2">
              {o.store_phone && <Button size="xs" variant="outline" icon={Phone} href={`tel:${o.store_phone}`}>{o.store_phone}</Button>}
              {o.store_phone && <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(o.store_phone, `بخصوص الطلب ${o.number}`)} target="_blank" rel="noreferrer">واتساب</Button>}
              {o.store_map && <Button size="xs" variant="outline" icon={MapPin} href={o.store_map} target="_blank" rel="noreferrer">الخريطة</Button>}
            </div>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" />العميل (التسليم)</p>
            <p className="font-medium">{o.customer_name}</p>
            <p className="text-sm text-muted">{[o.address, o.city, o.governorate].filter(Boolean).join('، ')}</p>
            <div className="mt-2"><OrderCommentsView ar general={o.notes} stores={(data.storeNotes || []).map((n) => ({ name: n.store_name, text: n.note }))} /></div>
            <div className="mt-2 flex gap-2"><Button size="xs" variant="outline" icon={Phone} href={`tel:${o.phone}`}><span dir="ltr">{o.phone}</span></Button><Button size="xs" variant="outline" icon={MessageCircle} href={waLink(o.phone, `أهلاً ${o.customer_name}، بخصوص طلبك ${o.number} من ${o.store_name}`)} target="_blank" rel="noreferrer">واتساب</Button></div>
            <BlockCustomer o={o} blocked={!!data.customerBlocked} reload={reload} onChanged={onChanged} />
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="mb-2 text-sm font-semibold">المنتجات</p>
            <ul className="divide-y divide-line">{data.items.map((i, k) => <li key={k} className="flex justify-between gap-3 py-2 text-sm"><span>{fmtNum(i.qty)}× {i.name_ar}{i.size ? ` · ${i.size}` : ''}{i.returned_qty > 0 && <span className="text-danger"> (مرتجع {fmtNum(i.returned_qty)})</span>}</span><span className="tabular">{fmtMoney(i.price * i.qty)}</span></li>)}</ul>
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-sm"><div className="flex justify-between text-muted"><span>الشحن</span><span>{o.shipping_free ? 'مجاني للعميل' : o.shipping ? fmtMoney(o.shipping) : 'ضمن رسوم السلة المشتركة'}</span></div>{o.discount > 0 && <div className="flex justify-between text-muted"><span>خصم</span><span>−{fmtMoney(o.discount)}</span></div>}<div className="flex justify-between text-base font-semibold"><span>الإجمالي من العميل</span><span>{fmtMoney(o.total)}</span></div></div>
          </div>
          <div><p className="mb-2 text-sm font-semibold">سجل الطلب</p>
            <ol className="space-y-2 text-sm">{data.events.map((e, i) => <li key={i} className="flex gap-2"><span className="text-muted">{fmtDateTime(e.created_at)}</span><span className="font-medium">{ORDER_STATUS_AR[e.status] || e.status}</span>{e.note && <span className="text-muted">{e.note === '@handoff' ? '— اتحوّل لتوصيلنا' : e.note === '@store_delivery' ? '— رجع لتوصيل المحل' : `— ${adminNote(e.note)}`}</span>}</li>)}</ol></div>
          <AdminControls key={`${o.id}-${o.status}`} o={o} items={data.items} reload={reload} onChanged={onChanged} />
          {o.delivery_group && o.delivery_by === 'platform' ? (
            <p className="rounded-xl bg-brand/5 p-3 text-sm font-medium text-brand">توصيل سلة Twist موحّد لكل المحلات، ومش ممكن تحويل جزء منها لتوصيل المحل.</p>
          ) : ['pending', 'confirmed', 'processing'].includes(o.status) && (
            o.delivery_by === 'platform'
              ? <Button variant="outline" loading={busy} onClick={() => setDelivery('store')}>رجّع التوصيل للمحل</Button>
              : <Button icon={Truck} loading={busy} onClick={() => setDelivery('platform')}>خلّي Twist توصّله</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

export default function Orders() {
  const [status, setStatus] = useState('all');
  const [delivery, setDelivery] = useState('all');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [picked, setPicked] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkSure, setBulkSure] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const dq = useDebounced(term, 300);
  const path = `/orders?${new URLSearchParams({ status, delivery, q: dq, page, ...(from && { from }), ...(to && { to }), ...(min && { min }), ...(max && { max }) })}`;
  const { data, error, loading, reload } = useAdminApi(path);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const c = data?.counts || {};
  const resetPick = () => { setPicked([]); setBulkSure(false); setBulkStatus(''); setBulkNote(''); };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pageIds = (data?.items || []).map((o) => o.id);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
  const refilter = (fn) => (v) => { fn(v); setPage(1); resetPick(); };
  const runBulk = async () => {
    setBulkBusy(true);
    try {
      const r = await adminApi('/orders/bulk', { method: 'POST', body: { ids: picked, status: bulkStatus, note: bulkNote || undefined } });
      toast({ tone: r.failed.length ? 'error' : undefined, title: `اتغيّر ${fmtNum(r.done)} طلب${r.failed.length ? ` · فشل ${fmtNum(r.failed.length)}: ${r.failed[0].message || r.failed[0].code}` : ''}` });
      setPicked(r.failed.map((f) => f.id)); setBulkSure(false); setBulkStatus(''); setBulkNote(''); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBulkBusy(false);
  };
  return (
    <div>
      <PageHeader title="الطلبات" subtitle="كل طلبات كل المحلات" />
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><SearchInput className="flex-1" value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="رقم الطلب أو اسم/تليفون العميل" />
          <Select value={delivery} onChange={(e) => { setDelivery(e.target.value); setPage(1); }} className="sm:w-48" aria-label="التوصيل"><option value="all">كل التوصيل</option><option value="platform">توصيل Twist</option><option value="store">توصيل المحل</option></Select></div>
        <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); resetPick(); }} options={[{ value: 'all', label: 'الكل', count: c.all }, ...Object.entries(ORDER_STATUS_AR).map(([v, label]) => ({ value: v, label, count: c[v] || 0 }))]} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input type="date" value={from} onChange={(e) => refilter(setFrom)(e.target.value)} aria-label="من تاريخ" />
          <Input type="date" value={to} onChange={(e) => refilter(setTo)(e.target.value)} aria-label="إلى تاريخ" />
          <Input type="number" min={0} value={min} onChange={(e) => refilter(setMin)(e.target.value)} placeholder="أقل مبلغ" />
          <Input type="number" min={0} value={max} onChange={(e) => refilter(setMax)(e.target.value)} placeholder="أعلى مبلغ" />
        </div>
      </div>
      {picked.length > 0 && (
        <div className="sticky top-2 z-10 mb-3 space-y-2 rounded-2xl border border-brand/40 bg-elevated p-3 shadow-lg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-semibold">{fmtNum(picked.length)} طلب محدد</span>
            <Select value={bulkStatus} onChange={(e) => { setBulkStatus(e.target.value); setBulkSure(false); }} className="sm:w-44" aria-label="الحالة الجديدة"><option value="">غيّر الحالة لـ…</option>{Object.entries(ORDER_STATUS_AR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <Input value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} placeholder="ملاحظة / سبب (اختياري)" maxLength={250} className="flex-1" />
            {bulkStatus && (bulkStatus === 'cancelled' && !bulkSure ? <Button variant="outline" onClick={() => setBulkSure(true)}>إلغاء الطلبات…</Button> : <Button loading={bulkBusy} onClick={runBulk}>{bulkStatus === 'cancelled' ? 'تأكيد الإلغاء (نهائي)' : 'نفّذ'}</Button>)}
            <Button variant="outline" onClick={resetPick}>إلغاء التحديد</Button>
          </div>
          <p className="text-xs text-muted">كل طلب بيتنفّذ لوحده: اللي مينفعش (ملغي أو متسلّم والمطلوب إلغاء) بيتسيب ويتعرض سببه.</p>
        </div>
      )}
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState title="مفيش طلبات" body="جرّب تغيّر الفلتر." /> : (
        <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
          <label className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm text-muted"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? picked.filter((id) => !pageIds.includes(id)) : [...new Set([...picked, ...pageIds])])} className="h-4 w-4 accent-[rgb(var(--c-primary))]" />تحديد كل الصفحة</label>
          <ul className="divide-y divide-line">
            {data.items.map((o) => (
              <li key={o.id} className="flex items-center"><input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`تحديد طلب ${o.number}`} className="ms-4 h-4 w-4 shrink-0 accent-[rgb(var(--c-primary))]" /><button type="button" onClick={() => setOpen(o.id)} className="flex w-full flex-col gap-2 px-4 py-3.5 text-start hover:bg-fg/[0.025] sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1"><p className="font-semibold"><span dir="ltr">#{o.number}</span> · {o.customer_name}</p><p className="truncate text-[13px] text-muted">{o.store_name} · {o.city || ''} · {fmtDateTime(o.created_at)}</p></div>
                <div className="flex items-center gap-2">{o.delivery_by === 'platform' && <Badge tone="info" size="sm">🚚 توصيلنا</Badge>}<StatusPill s={o.status} platform={o.delivery_by === 'platform'} /></div>
                <span className="font-semibold tabular sm:w-28 sm:text-end">{fmtMoney(o.total)}</span>
              </button></li>
            ))}
          </ul>
        </div>
      )}
      <Pagination page={data?.page || 1} pages={data?.pages || 1} onChange={setPage} />
      <OrderSheet id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}
