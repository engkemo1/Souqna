import { useState } from 'react';
import { Truck, Phone, MessageCircle, MapPin, Store as StoreIcon } from 'lucide-react';
import { PageHeader, FilterTabs, SearchInput, Pagination } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDebounced } from '../../lib/hooks.js';
import { adminApi, useAdminApi, fmtMoney, fmtNum, fmtDateTime, ORDER_STATUS_AR, waLink } from './adminApi.js';
import { StatusPill } from './Overview.jsx';

function OrderSheet({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data, error, reload } = useAdminApi(id ? `/orders/${id}` : '/status');
  const o = id ? data?.order : null;
  const [busy, setBusy] = useState(false);
  const setDelivery = async (delivery_by) => {
    setBusy(true);
    try { await adminApi(`/orders/${id}/delivery`, { method: 'PATCH', body: { delivery_by } }); toast({ title: delivery_by === 'platform' ? 'اتحوّل لتوصيل بنها أوتفيت' : 'رجع لتوصيل المحل' }); reload(); onChanged(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(false);
  };
  return (
    <Sheet open={!!id} onClose={onClose} title={o ? `طلب #${o.number}` : 'طلب'} side="end" size="lg">
      {error ? <ErrorState error={error} onRetry={reload} compact /> : !o ? <Skeleton className="my-4 h-64 w-full rounded-2xl" /> : (
        <div className="space-y-5 py-4">
          <div className="flex flex-wrap items-center gap-2"><StatusPill s={o.status} />{o.delivery_by === 'platform' ? <Badge tone="info">🚚 توصيل بنها أوتفيت</Badge> : <Badge>توصيل المحل</Badge>}<span className="text-sm text-muted">{fmtDateTime(o.created_at)}</span></div>
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
            {o.notes && <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">ملاحظة: {o.notes}</p>}
            <div className="mt-2 flex gap-2"><Button size="xs" variant="outline" icon={Phone} href={`tel:${o.phone}`}><span dir="ltr">{o.phone}</span></Button><Button size="xs" variant="outline" icon={MessageCircle} href={waLink(o.phone, `أهلاً ${o.customer_name}، بخصوص طلبك ${o.number} من ${o.store_name}`)} target="_blank" rel="noreferrer">واتساب</Button></div>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="mb-2 text-sm font-semibold">المنتجات</p>
            <ul className="divide-y divide-line">{data.items.map((i, k) => <li key={k} className="flex justify-between gap-3 py-2 text-sm"><span>{fmtNum(i.qty)}× {i.name_ar}{i.size ? ` · ${i.size}` : ''}</span><span className="tabular">{fmtMoney(i.price * i.qty)}</span></li>)}</ul>
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-sm"><div className="flex justify-between text-muted"><span>الشحن</span><span>{fmtMoney(o.shipping)}</span></div>{o.discount > 0 && <div className="flex justify-between text-muted"><span>خصم</span><span>−{fmtMoney(o.discount)}</span></div>}<div className="flex justify-between text-base font-semibold"><span>الإجمالي (كاش)</span><span>{fmtMoney(o.total)}</span></div></div>
          </div>
          <div><p className="mb-2 text-sm font-semibold">سجل الطلب</p>
            <ol className="space-y-2 text-sm">{data.events.map((e, i) => <li key={i} className="flex gap-2"><span className="text-muted">{fmtDateTime(e.created_at)}</span><span className="font-medium">{ORDER_STATUS_AR[e.status] || e.status}</span>{e.note && <span className="text-muted">{e.note === '@handoff' ? '— اتحوّل لتوصيلنا' : e.note === '@store_delivery' ? '— رجع لتوصيل المحل' : `— ${e.note}`}</span>}</li>)}</ol></div>
          {['pending', 'confirmed', 'processing'].includes(o.status) && (
            o.delivery_by === 'platform'
              ? <Button variant="outline" loading={busy} onClick={() => setDelivery('store')}>رجّع التوصيل للمحل</Button>
              : <Button icon={Truck} loading={busy} onClick={() => setDelivery('platform')}>خلّي بنها أوتفيت توصّله</Button>
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
  const dq = useDebounced(term, 300);
  const path = `/orders?${new URLSearchParams({ status, delivery, q: dq, page })}`;
  const { data, error, loading, reload } = useAdminApi(path);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const c = data?.counts || {};
  return (
    <div>
      <PageHeader title="الطلبات" subtitle="كل طلبات كل المحلات" />
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><SearchInput className="flex-1" value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="رقم الطلب أو اسم/تليفون العميل" />
          <Select value={delivery} onChange={(e) => { setDelivery(e.target.value); setPage(1); }} className="sm:w-48" aria-label="التوصيل"><option value="all">كل التوصيل</option><option value="platform">توصيل بنها أوتفيت</option><option value="store">توصيل المحل</option></Select></div>
        <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: 'all', label: 'الكل', count: c.all }, ...Object.entries(ORDER_STATUS_AR).map(([v, label]) => ({ value: v, label, count: c[v] || 0 }))]} />
      </div>
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState title="مفيش طلبات" body="جرّب تغيّر الفلتر." /> : (
        <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
          <ul className="divide-y divide-line">
            {data.items.map((o) => (
              <li key={o.id}><button type="button" onClick={() => setOpen(o.id)} className="flex w-full flex-col gap-2 px-4 py-3.5 text-start hover:bg-fg/[0.025] sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1"><p className="font-semibold"><span dir="ltr">#{o.number}</span> · {o.customer_name}</p><p className="truncate text-[13px] text-muted">{o.store_name} · {o.city || ''} · {fmtDateTime(o.created_at)}</p></div>
                <div className="flex items-center gap-2">{o.delivery_by === 'platform' && <Badge tone="info" size="sm">🚚 توصيلنا</Badge>}<StatusPill s={o.status} /></div>
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
