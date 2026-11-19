import { useState } from 'react';
import { Phone, MessageCircle, Shirt } from 'lucide-react';
import { PageHeader, FilterTabs } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Input, Textarea, Select } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtNum, fmtDateTime, waLink } from './adminApi.js';

export const CUSTOM_STATUS_AR = { new: 'جديد', contacted: 'اتكلمنا معاه', quoted: 'اتبعت السعر', agreed: 'اتفقنا', in_progress: 'بيتنفّذ', done: 'اتسلّم', cancelled: 'ملغي' };
const KIND_AR = { graduation: 'دفعة تخرّج', company: 'شركة', restaurant: 'مطعم / كافيه', team: 'فريق / نادي', event: 'فعالية', other: 'أخرى' };
const TONE = { new: 'warning', contacted: 'info', quoted: 'info', agreed: 'success', in_progress: 'violet', done: 'success', cancelled: 'danger' };

function Row({ r, stores, onChanged }) {
  const toast = useToast();
  const [price, setPrice] = useState(r.agreed_price ?? '');
  const [deposit, setDeposit] = useState(r.deposit ?? '');
  const [note, setNote] = useState(r.admin_note || '');
  const [busy, setBusy] = useState('');
  const patch = async (body, label) => {
    setBusy(label);
    try { await adminApi(`/custom-requests/${r.id}`, { method: 'PATCH', body }); toast({ title: 'اتحفظ' }); onChanged(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };
  const num = (v) => (v === '' ? null : Number(v));
  const moneyDirty = num(price) !== (r.agreed_price ?? null) || num(deposit) !== (r.deposit ?? null);
  return (
    <li className="rounded-2xl border border-line bg-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-semibold"><Shirt className="h-4 w-4 text-brand" />{KIND_AR[r.kind] || r.kind}{r.item ? ` · ${r.item}` : ''}{r.qty ? ` · ${fmtNum(r.qty)} قطعة` : ''}</p>
        <Badge tone={TONE[r.status]} dot>{CUSTOM_STATUS_AR[r.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted"><span dir="ltr">{r.number}</span> · {fmtDateTime(r.created_at)} · يفضّل {r.contact_pref === 'whatsapp' ? 'واتساب' : 'مكالمة'}</p>
      <div className="mt-3 space-y-1 text-sm">
        <p className="whitespace-pre-line">{r.details}</p>
        <p className="text-muted">{[r.budget != null && `الميزانية: ${fmtNum(r.budget)} ج.م`, r.needed_by && `محتاجه: ${r.needed_by}`].filter(Boolean).join(' · ')}</p>
        <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900">{r.name} · <span dir="ltr">{r.phone}</span></p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" icon={Phone} href={`tel:${r.phone}`}><span dir="ltr">{r.phone}</span></Button>
        <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(r.phone, `أهلاً ${r.name}، بخصوص طلب التصميم (${r.number}) من Twist.`)} target="_blank" rel="noreferrer">واتساب</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(CUSTOM_STATUS_AR).map(([s, label]) => <Button key={s} size="xs" variant={r.status === s ? 'primary' : 'outline'} loading={busy === s} onClick={() => r.status !== s && patch({ status: s }, s)}>{label}</Button>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={r.store_id || ''} onChange={(e) => patch({ store_id: e.target.value ? Number(e.target.value) : null }, 'store')} className="!h-10 w-56">
          <option value="">المنفّذ: لسه (محل / ورشة)</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
        </Select>
        {r.store_id && r.store_whatsapp && <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(r.store_whatsapp, `أهلاً ${r.store_name}، عندنا طلب تصميم مخصص (${r.number}): ${r.details}`)} target="_blank" rel="noreferrer">كلّم {r.store_name}</Button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input dir="ltr" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="السعر المتفق عليه" className="!h-10 w-44 text-start" />
        <Input dir="ltr" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ''))} placeholder="العربون" className="!h-10 w-36 text-start" />
        <Button size="sm" variant="outline" loading={busy === 'money'} disabled={!moneyDirty} onClick={() => patch({ agreed_price: num(price), deposit: num(deposit) }, 'money')}>حفظ السعر</Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات داخلية (مش بتظهر للعميل)" />
        <Button size="sm" variant="outline" loading={busy === 'note'} disabled={note === (r.admin_note || '')} onClick={() => patch({ admin_note: note }, 'note')}>حفظ</Button>
      </div>
    </li>
  );
}

export default function CustomRequests() {
  const [status, setStatus] = useState('all');
  const { data, error, loading, reload } = useAdminApi(`/custom-requests?status=${status}`, { every: 60000 });
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const c = data?.counts || {};
  return (
    <div>
      <PageHeader title="تصميمات مخصصة" subtitle="طلبات دفعات التخرّج والشركات والمطاعم والفرق. كلّم العميل، اتفق على السعر، وحدّد المحل أو الورشة اللي هتنفّذ." />
      <div className="mb-4"><FilterTabs value={status} onChange={setStatus} options={[{ value: 'all', label: 'الكل', count: c.all || 0 }, ...Object.entries(CUSTOM_STATUS_AR).map(([v, label]) => ({ value: v, label, count: c[v] || 0 }))]} /></div>
      {loading && !data ? <Skeleton className="h-48 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState icon={Shirt} title="مفيش طلبات" body="لما حد يبعت طلب تصميم من صفحة /custom-design هيظهر هنا." /> : (
        <ul className="space-y-3">{data.items.map((r) => <Row key={r.id} r={r} stores={data.stores || []} onChanged={reload} />)}</ul>
      )}
    </div>
  );
}
