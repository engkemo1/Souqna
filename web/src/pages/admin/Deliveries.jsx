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
  const setSponsorCollected = async (o, collected) => {
    setBusy(`sponsor:${o.id}`);
    try { await adminApi(`/orders/${o.id}/delivery-sponsor`, { method: 'PATCH', body: { collected } }); toast({ title: collected ? 'اتسجل تحصيل مساهمة المحل' : 'اتسجل إن المساهمة لسه متحصلتش' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(null);
  };
  const runKey = (o) => o.delivery_route_id || o.delivery_group || `order:${o.id}`;
  const saveRun = async (o) => {
    const key = runKey(o); const draft = runDraft[key] || {};
    const modeChanged = Boolean(draft.mode && draft.mode !== (o.delivery_mode || 'pooled'));
    setBusy(`run:${key}`);
    try {
      await adminApi('/delivery-runs', { method: 'PATCH', body: {
        orderId: o.id,
        deliveryMode: modeChanged ? draft.mode : undefined,
        courierCost: draft.cost === undefined ? (modeChanged ? null : o.delivery_courier_cost) : (draft.cost === '' ? null : Number(draft.cost)),
        deliveryPersonId: draft.person === undefined ? (modeChanged ? null : (o.delivery_person_id || null)) : (draft.person ? Number(draft.person) : null),
        customerFee: draft.fee === '' || draft.fee == null ? undefined : Number(draft.fee),
      } });
      toast({ title: 'تم تسجيل حساب الرحلة' }); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(null);
  };
  const cancelRejected = async (o) => {
    setBusy(`cancel:${o.delivery_group}`);
    try { await adminApi('/delivery-runs/cancel-rejected', { method: 'POST', body: { orderId: o.id } }); toast({ title: 'تم إلغاء السلة وإرجاع المنتجات للمخزون' }); reload(); }
    catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy(null);
  };
  const courierMessage = (o) => {
    const stores = orders.filter((x) => x.delivery_route_id === runKey(o)).map((x) => `• ${x.store_name} — ${x.store_address || 'العنوان غير مسجل'}${x.store_map ? ` — ${x.store_map}` : ''}`).join('\n');
    const collectionLead = !o.delivery_group || o.delivery_mode !== 'split' || runKey(o) === o.delivery_collection_route_id;
    const amount = o.delivery_mode === 'split' ? (collectionLead ? o.delivery_group_total : 0) : (o.delivery_group_total ?? o.total);
    const collectionNote = o.delivery_mode === 'split'
      ? (collectionLead ? `أنت مندوب التحصيل الأساسي. نسّق وصول كل المسارات أولًا، ثم حصّل إجمالي السلة مرة واحدة: ${fmtMoney(amount)}.` : 'لا تحصّل أي مبلغ. نسّق مع مندوب التحصيل الأساسي، والتسليم والتحصيل يكونان بعد وصول كل المسارات.')
      : `حصّل إجمالي السلة مرة واحدة من العميل: ${fmtMoney(amount)}.`;
    return `أهلاً ${o.delivery_person_name || ''}، عندك مسار توصيل من Twist.\nمحلات الاستلام:\n${stores || `• ${o.store_name}`}\nالعميل: ${o.customer_name} — ${o.phone}\nالعنوان: ${[o.address,o.city,o.governorate].filter(Boolean).join('، ')}\n${collectionNote}\nمن فضلك أكد استلام المهمة.`;
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
                      {o.delivery_group && <p className="mt-2 rounded-lg bg-brand/5 px-3 py-2 text-sm font-medium text-brand">سلة Twist #{o.delivery_group.slice(0, 8).toUpperCase()} · {fmtNum(o.delivery_group_count)} محلات · {o.delivery_mode === 'split' ? `مسار ${fmtNum(o.delivery_route_count)} محل · قيمة طلبات المسار ${fmtMoney(o.delivery_route_cash)}` : `جولة مجمعة · إجمالي التحصيل مرة واحدة ${fmtMoney(o.delivery_group_total)}`}</p>}
                      {o.delivery_group && o.delivery_fee_status !== 'confirmed' && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-3 text-sm"><p className="font-semibold">{o.delivery_fee_status === 'offered' ? `مستنيين موافقة العميل على رسوم ${fmtMoney(o.delivery_fee_quote)}` : o.delivery_fee_status === 'rejected' ? 'العميل رفض الرسوم. تواصل معاه؛ تقدر تبعت سعرًا جديدًا أو تلغي السلة.' : 'رسوم التوصيل غير مؤكدة؛ المحلات تجهز الطلب ثم Twist تحدد السعر.'}</p>{['pending','rejected'].includes(o.delivery_fee_status) && <div className="mt-2 flex flex-wrap items-end gap-2"><Field label="رسوم التوصيل النهائية بعد مراجعة المسار"><Input inputMode="numeric" suffix="ج.م" value={runDraft[runKey(o)]?.fee ?? ''} onChange={(e) => setRunDraft((d) => ({ ...d, [runKey(o)]: { ...d[runKey(o)], fee: e.target.value.replace(/\D/g, '') } }))} /></Field><Button size="sm" disabled={!runDraft[runKey(o)]?.fee} loading={busy === `run:${runKey(o)}`} onClick={() => saveRun(o)}>{o.delivery_fee_status === 'rejected' ? 'إرسال سعر جديد للموافقة' : 'إرسال السعر للعميل للموافقة'}</Button></div>}{o.delivery_fee_status === 'offered' && <Button className="mt-2" size="sm" variant="outline" icon={MessageCircle} href={waLink(o.phone, `أهلاً ${o.customer_name}، رسوم توصيل طلباتك من Twist أصبحت ${o.delivery_fee_quote} ج.م. برجاء مراجعة الطلب والموافقة من هنا: ${window.location.origin}/track/${o.track_token}`)} target="_blank" rel="noreferrer">إرسال السعر ورابط الموافقة واتساب</Button>}{o.delivery_fee_status === 'rejected' && <Button className="mt-2" size="sm" variant="outline" loading={busy === `cancel:${o.delivery_group}`} onClick={() => cancelRejected(o)}>إلغاء السلة وإرجاع المنتجات للمخزون</Button>}</div>}
                      {o.shipping_free ? <div className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success"><p className="font-semibold">المحل مؤهل للشحن المجاني{o.delivery_courier_cost != null ? ` · حصته من تكلفة المسار ${fmtMoney(o.shop_delivery_sponsor_share)}` : ''}</p>{o.delivery_courier_cost != null && o.shop_delivery_sponsor_share > 0 && <label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" checked={o.shop_delivery_sponsor_collected} disabled={busy === `sponsor:${o.id}`} onChange={(e) => setSponsorCollected(o,e.target.checked)} /> تم تحصيل الحصة من المحل فعليًا</label>}</div> : o.shipping > 0 ? <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted">رسوم التوصيل المحصّلة من العميل: {fmtMoney(o.delivery_customer_fee)}</p> : null}
                      {o.id === o.delivery_run_owner_id && <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
                        <p className="mb-2 text-sm font-semibold">توزيع وحساب الرحلة</p>
                        {o.delivery_group && <Field label="طريقة التوصيل" hint={['offered'].includes(o.delivery_fee_status) || (o.delivery_fee_status === 'confirmed' && o.delivery_fee_quote != null) ? 'الخطة اتبعتت للعميل أو وافق عليها؛ تغيير المسارات مقفول عشان السعر يفضل مطابقًا.' : 'المسارات تتقسم حسب مناطق الاستلام التي ضبطها الأدمن في صفحة المحلات.'}><Select disabled={o.delivery_fee_status === 'offered' || (o.delivery_fee_status === 'confirmed' && o.delivery_fee_quote != null)} value={runDraft[runKey(o)]?.mode ?? (o.delivery_mode || 'pooled')} onChange={(e) => setRunDraft((d) => ({ ...d, [runKey(o)]: { ...d[runKey(o)], mode: e.target.value } }))}><option value="pooled">جولة واحدة لكل محلات السلة</option><option value="split">قسّم حسب مناطق المحلات</option></Select></Field>}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="المندوب"><Select value={runDraft[runKey(o)]?.person ?? (o.delivery_person_id || '')} onChange={(e) => setRunDraft((d) => ({ ...d, [runKey(o)]: { ...d[runKey(o)], person: e.target.value } }))}><option value="">اختار المندوب</option>{(peopleData?.items || []).filter((person) => person.active).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.phone}</option>)}</Select></Field>
                          <Field label="اللي هياخده المندوب فعليًا" hint="سجّل تكلفة المشوار مرة واحدة"><Input inputMode="numeric" suffix="ج.م" value={runDraft[runKey(o)]?.cost ?? (o.delivery_courier_cost ?? '')} onChange={(e) => setRunDraft((d) => ({ ...d, [runKey(o)]: { ...d[runKey(o)], cost: e.target.value.replace(/\D/g, '') } }))} /></Field>
                        </div>
                        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" loading={busy === `run:${runKey(o)}`} onClick={() => saveRun(o)}>حفظ التوزيع والحساب</Button>{o.delivery_person_id && (peopleData?.items || []).some((p) => p.id === o.delivery_person_id) && <Button size="sm" variant="outline" icon={MessageCircle} href={waLink((peopleData?.items || []).find((p) => p.id === o.delivery_person_id)?.phone, courierMessage(o))} target="_blank" rel="noreferrer">إرسال تفاصيل للمندوب على واتساب</Button>}</div>
                        {o.delivery_courier_cost != null && <p className="mt-2 text-xs leading-5 text-muted">المندوب: {o.delivery_person_name || 'غير محدد'} · رسوم هذا المسار من العميل: {fmtMoney(o.delivery_route_customer_fee)} · مساهمات المحلات المحصّلة فعلًا: {fmtMoney(o.delivery_sponsored_total)} · الصافي بعد تكلفة المندوب: <strong className={o.delivery_profit < 0 ? 'text-sale' : 'text-success'}>{fmtMoney(o.delivery_profit)}</strong></p>}
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
                        {o.status === 'processing' && (!o.delivery_group || o.delivery_route_ready_count === o.delivery_route_count) && <Button disabled={o.delivery_group && o.delivery_fee_status !== 'confirmed'} loading={busy === o.id} icon={PackageOpen} onClick={() => act(o, 'shipped')}>{o.delivery_group ? 'استلمنا طلبات المسار' : 'استلمناه من المحل'}</Button>}
                        {o.status === 'processing' && o.delivery_group && o.delivery_route_ready_count < o.delivery_route_count && <span className="max-w-40 text-end text-xs text-muted">جاهز {fmtNum(o.delivery_route_ready_count)} من {fmtNum(o.delivery_route_count)} في المسار</span>}
                        {o.status === 'shipped' && o.delivery_mode === 'split' && runKey(o) !== o.delivery_collection_route_id && <span className="max-w-56 text-end text-xs text-muted">لا تحصّل من العميل؛ مندوب المسار الأساسي يجمع إجمالي السلة مرة واحدة بعد وصول كل المسارات.</span>}
                        {o.status === 'shipped' && o.delivery_mode === 'split' && runKey(o) === o.delivery_collection_route_id && !o.delivery_group_all_shipped && <span className="max-w-56 text-end text-xs text-muted">جاهز للتسليم {fmtNum(o.delivery_group_shipped_count)} من {fmtNum(o.delivery_group_count)} مسارات؛ ننتظر وصول الباقي للتحصيل مرة واحدة.</span>}
                        {o.status === 'shipped' && (!o.delivery_group || (o.delivery_mode === 'split' ? runKey(o) === o.delivery_collection_route_id && o.delivery_group_all_shipped : o.delivery_route_shipped_count === o.delivery_route_count)) && <Button variant="brand" loading={busy === o.id} icon={PackageCheck} onClick={() => act(o, 'delivered')}>{o.delivery_mode === 'split' ? 'تسليم السلة والتحصيل مرة واحدة' : o.delivery_group ? 'تم تسليم المسار للعميل' : 'تم التسليم للعميل'}</Button>}
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
