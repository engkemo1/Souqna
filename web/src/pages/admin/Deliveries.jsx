import { useState } from 'react';
import { Phone, MessageCircle, MapPin, PackageCheck, PackageOpen, Banknote } from 'lucide-react';
import { PageHeader, KpiCard } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtMoney, fmtNum, fmtDateTime, waLink } from './adminApi.js';
import { StatusPill } from './Overview.jsx';

const GROUPS = [
  { key: 'processing', title: 'جاهز للاستلام من المحل', hint: 'روح استلمه' },
  { key: 'shipped', title: 'معانا في الطريق للعميل', hint: 'سلّم وحصّل الكاش' },
  { key: 'confirmed', title: 'المحل بيجهزه', hint: 'لسه مش جاهز' },
  { key: 'pending', title: 'جديد — المحل لسه مأكدش', hint: '' },
];

export default function Deliveries() {
  const { data, error, loading, reload } = useAdminApi('/deliveries', { every: 30000 });
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const act = async (o, status) => {
    setBusy(o.id);
    try { await adminApi(`/orders/${o.id}/status`, { method: 'PATCH', body: { status } }); toast({ title: status === 'shipped' ? 'تم الاستلام من المحل' : 'تم التسليم ✅' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(null);
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const orders = data?.orders || [];
  const sum = (st) => orders.filter((o) => o.status === st).reduce((s, o) => s + o.total, 0);
  return (
    <div>
      <PageHeader title="التوصيل علينا" subtitle="الطلبات اللي لازم نستلمها من المحلات ونوصلها — بتتحدّث لوحدها" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="جاهز للاستلام" value={orders.filter((o) => o.status === 'processing').length} icon={PackageOpen} tone="brand" format={fmtNum} loading={loading && !data} />
        <KpiCard label="في الطريق" value={orders.filter((o) => o.status === 'shipped').length} icon={PackageCheck} tone="sky" format={fmtNum} loading={loading && !data} />
        <KpiCard label="كاش هنحصّله (في الطريق)" value={sum('shipped')} icon={Banknote} tone="accent" format={fmtMoney} loading={loading && !data} />
      </div>
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !orders.length ? <EmptyState icon={PackageCheck} title="مفيش توصيلات مفتوحة" body="لما محل يحوّل طلب لينا هيظهر هنا وهيجيلك تنبيه." /> : (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const list = orders.filter((o) => o.status === g.key);
            if (!list.length) return null;
            return (
              <section key={g.key}>
                <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold">{g.title}<span className="text-sm font-normal text-muted">{fmtNum(list.length)} {g.hint && `· ${g.hint}`}</span></h2>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {list.map((o) => (
                    <li key={o.id} className="rounded-2xl border border-line bg-elevated p-4">
                      <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold" dir="ltr">#{o.number}</span><StatusPill s={o.status} /></div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div><p className="text-xs font-semibold text-muted">استلام من</p><p className="font-medium">{o.store_name}</p><p className="text-[13px] text-muted">{o.store_address || '—'}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">{o.store_phone && <Button size="xs" variant="outline" icon={Phone} href={`tel:${o.store_phone}`}>اتصال</Button>}{o.store_phone && <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(o.store_phone, `أهلاً، بخصوص الطلب ${o.number} — إحنا جايين نستلمه`)} target="_blank" rel="noreferrer">واتساب</Button>}{o.store_map && <Button size="xs" variant="outline" icon={MapPin} href={o.store_map} target="_blank" rel="noreferrer">خريطة</Button>}</div></div>
                        <div><p className="text-xs font-semibold text-muted">تسليم لـ</p><p className="font-medium">{o.customer_name}</p><p className="text-[13px] text-muted">{[o.address, o.city, o.governorate].filter(Boolean).join('، ')}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5"><Button size="xs" variant="outline" icon={Phone} href={`tel:${o.phone}`}>اتصال</Button><Button size="xs" variant="outline" icon={MessageCircle} href={waLink(o.phone, `أهلاً ${o.customer_name}، طلبك ${o.number} من ${o.store_name} في الطريق ليك`)} target="_blank" rel="noreferrer">واتساب</Button></div></div>
                      </div>
                      {o.notes && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">ملاحظة: {o.notes}</p>}
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                        <div><p className="text-xs text-muted">نحصّل كاش</p><p className="text-lg font-bold tabular">{fmtMoney(o.total)}</p></div>
                        {o.status === 'processing' && <Button loading={busy === o.id} icon={PackageOpen} onClick={() => act(o, 'shipped')}>استلمناه من المحل</Button>}
                        {o.status === 'shipped' && <Button variant="brand" loading={busy === o.id} icon={PackageCheck} onClick={() => act(o, 'delivered')}>تم التسليم للعميل</Button>}
                        {(o.status === 'pending' || o.status === 'confirmed') && <span className="text-sm text-muted">{fmtDateTime(o.handoff_at || o.created_at)}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
