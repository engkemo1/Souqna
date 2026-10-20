import { useState } from 'react';
import { Phone, MessageCircle, MapPin, PackageCheck, PackageOpen, Banknote } from 'lucide-react';
import { PageHeader, KpiCard } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
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
  const { data: peopleData } = useAdminApi('/delivery-people');
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [runDraft, setRunDraft] = useState({});
  const act = async (o, status) => {
    setBusy(o.id);
    try { await adminApi(`/orders/${o.id}/status`, { method: 'PATCH', body: { status } }); toast({ title: status === 'shipped' ? 'تم الاستلام من المحل' : 'تم التسليم ✅' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(null);
  };
  const runKey = (o) => o.delivery_group || `order:${o.id}`;
  const saveRun = async (o) => {
    const key = runKey(o); const draft = runDraft[key] || {};
    setBusy(`run:${key}`);
    try {
      await adminApi('/delivery-runs', { method: 'PATCH', body: {
        orderId: o.id,
        courierCost: draft.cost === undefined ? o.delivery_courier_cost : (draft.cost === '' ? null : Number(draft.cost)),
        deliveryPersonId: draft.person === undefined ? (o.delivery_person_id || null) : (draft.person ? Number(draft.person) : null),
      } });
      toast({ title: 'تم تسجيل حساب الرحلة' }); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(null);
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const orders = data?.orders || [];
  const deliveredRuns = data?.deliveredRuns || [];
  const reconciledRuns = deliveredRuns.filter((run) => run.profit != null);
  const netDeliveryProfit = reconciledRuns.reduce((sum, run) => sum + run.profit, 0);
  const sum = (st) => orders.filter((o) => o.status === st).reduce((s, o) => s + o.total, 0);
  return (
    <div>
      <PageHeader title="التوصيل علينا" subtitle="طلبات Twist وطلبات المحلات اللي هنوصلها. المحل يجهّز الطلب ويضغط «جاهز للاستلام»، وساعتها يوصلك تنبيه." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="جاهز للاستلام" value={orders.filter((o) => o.status === 'processing').length} icon={PackageOpen} tone="brand" format={fmtNum} loading={loading && !data} />
        <KpiCard label="في الطريق" value={orders.filter((o) => o.status === 'shipped').length} icon={PackageCheck} tone="sky" format={fmtNum} loading={loading && !data} />
        <KpiCard label="كاش هنحصّله (في الطريق)" value={sum('shipped')} icon={Banknote} tone="accent" format={fmtMoney} loading={loading && !data} />
        <KpiCard label="صافي رحلات مسجلة" value={netDeliveryProfit} icon={Banknote} tone={netDeliveryProfit < 0 ? 'accent' : 'brand'} format={fmtMoney} loading={loading && !data} />
      </div>
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !orders.length ? <EmptyState icon={PackageCheck} title="مفيش توصيلات مفتوحة" body="طلبات سلة Twist أو الطلبات اللي يحولها محل هتظهر هنا، وهيوصلك تنبيه لما محل يجهز طلبه للاستلام." /> : (
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
                      <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold" dir="ltr">#{o.number}</span><StatusPill s={o.status} platform /></div>
                      {o.delivery_group && <p className="mt-2 rounded-lg bg-brand/5 px-3 py-2 text-sm font-medium text-brand">سلة Twist #{o.delivery_group.slice(0, 8).toUpperCase()} · {fmtNum(o.delivery_group_count)} محلات · إجمالي التحصيل مرة واحدة {fmtMoney(o.delivery_group_total)}</p>}
                      {o.shipping_free ? <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">المحل مؤهل للشحن المجاني{o.shop_delivery_sponsor_share != null ? ` · نصيب المحل من المندوب ${fmtMoney(o.shop_delivery_sponsor_share)}` : ''}</p> : o.shipping > 0 ? <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted">رسوم سلة Twist المحصّلة من العميل مرة واحدة: {fmtMoney(o.delivery_customer_fee)}</p> : null}
                      {o.id === o.delivery_run_owner_id && <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
                        <p className="mb-2 text-sm font-semibold">حساب الرحلة الواحدة</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="المندوب"><Select value={runDraft[runKey(o)]?.person ?? (o.delivery_person_id || '')} onChange={(e) => setRunDraft((d) => ({ ...d, [runKey(o)]: { ...d[runKey(o)], person: e.target.value } }))}><option value="">اختار المندوب</option>{(peopleData?.items || []).filter((person) => person.active).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.phone}</option>)}</Select></Field>
                          <Field label="اللي هياخده المندوب فعليًا" hint="سجّل تكلفة المشوار مرة واحدة"><Input inputMode="numeric" suffix="ج.م" value={runDraft[runKey(o)]?.cost ?? (o.delivery_courier_cost ?? '')} onChange={(e) => setRunDraft((d) => ({ ...d, [runKey(o)]: { ...d[runKey(o)], cost: e.target.value.replace(/\D/g, '') } }))} /></Field>
                        </div>
                        <Button size="sm" variant="outline" loading={busy === `run:${runKey(o)}`} onClick={() => saveRun(o)}>حفظ حساب الرحلة</Button>
                        {o.delivery_courier_cost != null && <p className="mt-2 text-xs leading-5 text-muted">المندوب: {o.delivery_person_name || 'غير محدد'} · رسوم العميل: {fmtMoney(o.delivery_customer_fee)} · مساهمة المحلات المؤهلة للمجاني: {fmtMoney(o.delivery_sponsored_total)} · صافي التوصيل: <strong className={o.delivery_profit < 0 ? 'text-sale' : 'text-success'}>{fmtMoney(o.delivery_profit)}</strong></p>}
                      </div>}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div><p className="text-xs font-semibold text-muted">استلام من</p><p className="font-medium">{o.store_name}</p><p className="text-[13px] text-muted">{o.store_address || '—'}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">{o.store_phone && <Button size="xs" variant="outline" icon={Phone} href={`tel:${o.store_phone}`}>اتصال</Button>}{o.store_phone && <Button size="xs" variant="outline" icon={MessageCircle} href={waLink(o.store_phone, `أهلاً، بخصوص الطلب ${o.number} — إحنا جايين نستلمه`)} target="_blank" rel="noreferrer">واتساب</Button>}{o.store_map && <Button size="xs" variant="outline" icon={MapPin} href={o.store_map} target="_blank" rel="noreferrer">خريطة</Button>}</div></div>
                        <div><p className="text-xs font-semibold text-muted">تسليم لـ</p><p className="font-medium">{o.customer_name}</p><p className="text-[13px] text-muted">{[o.address, o.city, o.governorate].filter(Boolean).join('، ')}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5"><Button size="xs" variant="outline" icon={Phone} href={`tel:${o.phone}`}>اتصال</Button><Button size="xs" variant="outline" icon={MessageCircle} href={waLink(o.phone, `أهلاً ${o.customer_name}، بنتواصل معاك بخصوص طلبك ${o.number} من ${o.store_name}`)} target="_blank" rel="noreferrer">واتساب</Button></div></div>
                      </div>
                      {o.notes && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">ملاحظة: {o.notes}</p>}
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                        <div className="space-y-1"><div><p className="text-xs text-muted">{o.delivery_group ? 'إجمالي السلة عند العميل' : 'نحصّل من العميل'}</p><p className="text-lg font-bold tabular">{fmtMoney(o.delivery_group ? o.delivery_group_total : o.total)}</p></div></div>
                        {o.status === 'processing' && (!o.delivery_group || o.delivery_group_ready_count === o.delivery_group_count) && <Button loading={busy === o.id} icon={PackageOpen} onClick={() => act(o, 'shipped')}>{o.delivery_group ? 'استلمنا طلبات السلة' : 'استلمناه من المحل'}</Button>}
                        {o.status === 'processing' && o.delivery_group && o.delivery_group_ready_count < o.delivery_group_count && <span className="max-w-40 text-end text-xs text-muted">جاهز {fmtNum(o.delivery_group_ready_count)} من {fmtNum(o.delivery_group_count)} — ننتظر باقي المحلات</span>}
                        {o.status === 'shipped' && (!o.delivery_group || o.delivery_group_shipped_count === o.delivery_group_count) && <Button variant="brand" loading={busy === o.id} icon={PackageCheck} onClick={() => act(o, 'delivered')}>{o.delivery_group ? 'تم تسليم السلة للعميل' : 'تم التسليم للعميل'}</Button>}
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
      {!!deliveredRuns.length && <section className="mt-8 rounded-2xl border border-line bg-elevated p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">آخر الرحلات اللي اتسلمت</h2><span className="text-xs text-muted">الرحلة الواحدة محسوبة مرة واحدة</span></div><ul className="divide-y divide-line">{deliveredRuns.slice(0, 12).map((run) => <li key={run.key} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto]"><span>{run.customerName} · {run.city} · {run.storeCount} محلات · {run.deliveryPersonName || 'مندوب غير محدد'}</span><span>العميل {fmtMoney(run.customerFee)}</span><span>المندوب {run.courierCost == null ? 'لسه متسجلش' : fmtMoney(run.courierCost)}</span><strong className={run.profit == null ? 'text-muted' : run.profit < 0 ? 'text-sale' : 'text-success'}>{run.profit == null ? 'الصافي غير محسوب' : `الصافي ${fmtMoney(run.profit)}`}</strong></li>)}</ul></section>}
    </div>
  );
}
