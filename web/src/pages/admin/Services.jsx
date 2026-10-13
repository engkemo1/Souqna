import { useState } from 'react';
import { Phone, MessageCircle, Camera, Palette } from 'lucide-react';
import { PageHeader, FilterTabs } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Textarea } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtNum, fmtDateTime, waLink } from './adminApi.js';

export const SERVICE_STATUS_AR = { new: 'جديد', contacted: 'اتواصلنا', scheduled: 'اتحدد ميعاد', done: 'تم', cancelled: 'ملغي' };
const TONE = { new: 'warning', contacted: 'info', scheduled: 'violet', done: 'success', cancelled: 'danger' };

function Row({ r, onChanged }) {
  const toast = useToast();
  const [note, setNote] = useState(r.admin_note || '');
  const [busy, setBusy] = useState('');
  const patch = async (body, label) => {
    setBusy(label);
    try { await adminApi(`/services/${r.id}`, { method: 'PATCH', body }); toast({ title: 'اتحفظ' }); onChanged(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const phone = r.phone || r.store_phone;
  const isDesign = r.type?.startsWith('design');
  return (
    <li className="rounded-2xl border border-line bg-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-semibold">{isDesign ? <Palette className="h-4 w-4 text-brand" /> : <Camera className="h-4 w-4 text-brand" />}{r.store_name}{isDesign && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-semibold text-brand">{r.type === 'design_banner' ? 'تصميم بنر' : 'تصميم غلاف'}</span>}</p>
        <Badge tone={TONE[r.status]} dot>{SERVICE_STATUS_AR[r.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">{isDesign
        ? `${fmtDateTime(r.created_at)} · المحل عايز تعرضله أشكال وتصاميم يختار منها`
        : `${r.plan === 'monthly' ? 'اشتراك شهري' : 'مرة واحدة'} · ${r.items_count ? `${fmtNum(r.items_count)} منتج تقريباً` : 'عدد المنتجات غير محدد'} · ${r.preferred_date ? `التاريخ المفضل ${r.preferred_date}` : 'أي وقت'} · ${fmtDateTime(r.created_at)}`}</p>
      {r.store_address && <p className="mt-0.5 text-sm text-muted">{r.store_address}</p>}
      {r.notes && <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">{r.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {phone && <Button size="xs" variant="outline" icon={Phone} href={`tel:${phone}`}><span dir="ltr">{phone}</span></Button>}
        {phone && <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(phone, `أهلاً ${r.store_name}، بخصوص طلب التصوير الاحترافي من بنها أوتفيت`)} target="_blank" rel="noreferrer">واتساب</Button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(SERVICE_STATUS_AR).map(([s, label]) => <Button key={s} size="xs" variant={r.status === s ? 'primary' : 'outline'} loading={busy === s} onClick={() => r.status !== s && patch({ status: s }, s)}>{label}</Button>)}
      </div>
      <div className="mt-3 flex gap-2">
        <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة للمحل (بتظهر له في لوحته): السعر، الميعاد…" />
        <Button size="sm" variant="outline" loading={busy === 'note'} disabled={note === (r.admin_note || '')} onClick={() => patch({ admin_note: note }, 'note')}>حفظ</Button>
      </div>
    </li>
  );
}

export default function Services() {
  const [status, setStatus] = useState('all');
  const { data, error, loading, reload } = useAdminApi(`/services?status=${status}`, { every: 60000 });
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const c = data?.counts || {};
  return (
    <div>
      <PageHeader title="الخدمات" subtitle="طلبات التصوير الاحترافي وتصميم البنرات والأغلفة من المحلات" />
      <div className="mb-4"><FilterTabs value={status} onChange={setStatus} options={[{ value: 'all', label: 'الكل', count: c.all || 0 }, ...Object.entries(SERVICE_STATUS_AR).map(([v, label]) => ({ value: v, label, count: c[v] || 0 }))]} /></div>
      {loading && !data ? <Skeleton className="h-48 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState icon={Camera} title="مفيش طلبات" body="لما محل يطلب التصوير من لوحته هيظهر هنا وهيجيلك تنبيه وواتساب." /> : (
        <ul className="space-y-3">{data.items.map((r) => <Row key={r.id} r={r} onChanged={reload} />)}</ul>
      )}
    </div>
  );
}
