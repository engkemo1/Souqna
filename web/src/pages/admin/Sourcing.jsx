import { useState } from 'react';
import { Phone, MessageCircle, PackagePlus, ExternalLink } from 'lucide-react';
import { PageHeader, FilterTabs } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Input, Textarea } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtNum, fmtDateTime, waLink } from './adminApi.js';

export const SRC_STATUS_AR = { new: 'جديد', quoted: 'اتبعت السعر', approved: 'العميل وافق', ordered: 'اتطلب', arrived: 'وصل (للمعاينة)', delivered: 'اتسلّم', cancelled: 'ملغي' };
const TONE = { new: 'warning', quoted: 'info', approved: 'success', ordered: 'violet', arrived: 'info', delivered: 'success', cancelled: 'danger' };

function Row({ r, onChanged }) {
  const toast = useToast();
  const [price, setPrice] = useState(r.quote_price ?? '');
  const [note, setNote] = useState(r.admin_note || '');
  const [busy, setBusy] = useState('');
  const patch = async (body, label) => {
    setBusy(label);
    try { await adminApi(`/sourcing/${r.id}`, { method: 'PATCH', body }); toast({ title: 'اتحفظ' }); onChanged(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const address = [r.address, r.city, r.governorate].filter(Boolean).join('، ');
  const trackLink = `${location.origin}/request/${r.track_token}`;
  return (
    <li className="rounded-2xl border border-line bg-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-semibold"><PackagePlus className="h-4 w-4 text-brand" />{r.title}</p>
        <Badge tone={TONE[r.status]} dot>{SRC_STATUS_AR[r.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted"><span dir="ltr">{r.number}</span> · {fmtDateTime(r.created_at)}{r.source === 'moda' ? ' · من مودة' : r.source === 'search' ? ' · من البحث' : ''}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {r.photo && <a href={r.photo} target="_blank" rel="noreferrer"><img src={r.photo} alt="" className="h-24 w-24 rounded-xl object-cover" /></a>}
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          {r.details && <p className="whitespace-pre-line">{r.details}</p>}
          <p className="text-muted">{[r.size && `المقاس: ${r.size}`, r.color && `اللون: ${r.color}`, r.budget != null && `الميزانية: ${fmtNum(r.budget)} ج.م`].filter(Boolean).join(' · ')}</p>
          {r.link && <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand"><ExternalLink className="h-3.5 w-3.5" />لينك المنتج</a>}
          <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900">{r.name} · <span dir="ltr">{r.phone}</span><br />{address}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" icon={Phone} href={`tel:${r.phone}`}><span dir="ltr">{r.phone}</span></Button>
        <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(r.phone, `أهلاً ${r.name}، بخصوص طلبك (${r.title}) من بنها أوتفيت. تابع الطلب من هنا: ${trackLink}`)} target="_blank" rel="noreferrer">واتساب</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(SRC_STATUS_AR).map(([s, label]) => <Button key={s} size="xs" variant={r.status === s ? 'primary' : 'outline'} loading={busy === s} onClick={() => r.status !== s && patch({ status: s }, s)}>{label}</Button>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input dir="ltr" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="السعر للعميل (ج.م)" className="!h-10 w-44 text-start" />
        <Button size="sm" variant="outline" loading={busy === 'quote'} disabled={price === '' || Number(price) === r.quote_price} onClick={() => patch({ quote_price: Number(price), status: r.status === 'new' ? 'quoted' : r.status }, 'quote')}>ابعت السعر</Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="رسالة للعميل (بتظهر في صفحة متابعة طلبه): المدة المتوقعة، تفاصيل…" />
        <Button size="sm" variant="outline" loading={busy === 'note'} disabled={note === (r.admin_note || '')} onClick={() => patch({ admin_note: note }, 'note')}>حفظ</Button>
      </div>
    </li>
  );
}

export default function Sourcing() {
  const [status, setStatus] = useState('all');
  const { data, error, loading, reload } = useAdminApi(`/sourcing?status=${status}`, { every: 60000 });
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const c = data?.counts || {};
  return (
    <div>
      <PageHeader title="طلبات من برّه بنها" subtitle="حاجات الزباين مش لاقيينها في المحلات. ابعتلهم السعر، جيبها، وهو يعاينها قبل ما يستلم ويدفع." />
      <div className="mb-4"><FilterTabs value={status} onChange={setStatus} options={[{ value: 'all', label: 'الكل', count: c.all || 0 }, ...Object.entries(SRC_STATUS_AR).map(([v, label]) => ({ value: v, label, count: c[v] || 0 }))]} /></div>
      {loading && !data ? <Skeleton className="h-48 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState icon={PackagePlus} title="مفيش طلبات" body="لما عميل يطلب حاجة مش موجودة في بنها هتظهر هنا." /> : (
        <ul className="space-y-3">{data.items.map((r) => <Row key={r.id} r={r} onChanged={reload} />)}</ul>
      )}
    </div>
  );
}
