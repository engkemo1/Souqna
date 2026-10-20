import { useEffect, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { GOVERNORATES } from '@souqna/shared';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtMoney } from './adminApi.js';

const blank = { governorate: GOVERNORATES[0], city: '', fee: '', distanceKm: '' };

export default function DeliveryRates() {
  const { data, error, loading, reload } = useAdminApi('/delivery-rates');
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [pricing, setPricing] = useState({ baseFee: '50', includedKm: '2', perKm: '10' });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.pricing) setPricing({ baseFee: String(data.pricing.baseFee), includedKm: String(data.pricing.includedKm), perKm: String(data.pricing.perKm) }); }, [data?.pricing]);
  const reset = () => { setForm(blank); setEditing(null); };
  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await adminApi(editing ? `/delivery-rates/${editing}` : '/delivery-rates', { method: editing ? 'PATCH' : 'POST', body: { governorate: form.governorate, city: form.city, fee: form.fee === '' ? undefined : Number(form.fee), distanceKm: form.distanceKm === '' ? null : Number(form.distanceKm) } });
      toast({ title: editing ? 'تم تحديث رسوم المنطقة' : 'تمت إضافة رسوم المنطقة' }); reset(); reload();
    } catch (e) {
      toast({ tone: 'error', title: e.fields?.city === 'area_taken' ? 'فيه رسوم مسجلة للمنطقة دي بالفعل' : e.message });
    }
    setBusy(false);
  };
  const edit = (item) => { setEditing(item.id); setForm({ governorate: item.governorate, city: item.city, fee: item.distanceKm == null ? String(item.fee) : '', distanceKm: item.distanceKm == null ? '' : String(item.distanceKm) }); };
  const savePricing = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await adminApi('/delivery-rates/pricing', { method: 'PUT', body: { baseFee: Number(pricing.baseFee), includedKm: Number(pricing.includedKm), perKm: Number(pricing.perKm) } });
      toast({ title: 'تم حفظ طريقة حساب رسوم المسافة' }); reload();
    } catch (e) { toast({ tone: 'error', title: e.message }); }
    setBusy(false);
  };
  const remove = async (item) => {
    if (!window.confirm(`حذف رسوم ${item.city || item.governorate}؟`)) return;
    try { await adminApi(`/delivery-rates/${item.id}`, { method: 'DELETE' }); toast({ title: 'تم حذف سعر المنطقة' }); reload(); }
    catch (e) { toast({ tone: 'error', title: e.message }); }
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return <div>
    <PageHeader title="رسوم التوصيل حسب المنطقة" subtitle="رسوم واحدة للعميل عن رحلة المندوب كلها، مع تقسيم نصيب الشحن المجاني بين المحلات المؤهلة." />
    <div className="mb-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">المسافات المسجلة تقريبية بخط مستقيم من وسط بنها وليست مسافة طريق. سعر المدينة له الأولوية، وبعده المحافظة، ثم السعر الافتراضي. لو العميل كتب منطقة غير مسجلة، يظهر السعر الأساسي الذي تحدده هنا حتى تضيف سعرًا دقيقًا لها. رسوم المنطقة تقدير للرحلة؛ سجّل تكلفة المندوب الفعلية من صفحة «التوصيل علينا» لمراجعة صافي الرحلة ونصيب المحلات التي فعّلت الشحن المجاني.</div>
    <Panel title="طريقة حساب المسافة" className="mb-5">
      <form onSubmit={savePricing} className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <Field label="السعر الأساسي"><Input inputMode="numeric" suffix="ج.م" value={pricing.baseFee} onChange={(e) => setPricing({ ...pricing, baseFee: e.target.value.replace(/\D/g, '') })} required /></Field>
        <Field label="المسافة المشمولة"><Input inputMode="decimal" suffix="كم" value={pricing.includedKm} onChange={(e) => setPricing({ ...pricing, includedKm: e.target.value.replace(/[^\d.]/g, '') })} required /></Field>
        <Field label="لكل كيلومتر إضافي (تقريب لأعلى)"><Input inputMode="numeric" suffix="ج.م" value={pricing.perKm} onChange={(e) => setPricing({ ...pricing, perKm: e.target.value.replace(/\D/g, '') })} required /></Field>
        <div className="sm:col-span-3"><Button type="submit" loading={busy}>حفظ طريقة الحساب</Button></div>
      </form>
    </Panel>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
      <Panel title={editing ? 'تعديل رسوم المنطقة' : 'إضافة رسوم لمنطقة'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="المحافظة"><Select value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value, city: e.target.value === '*' ? '*' : '' })}><option value="*">باقي المناطق (السعر الافتراضي)</option>{GOVERNORATES.map((gov) => <option key={gov} value={gov}>{gov}</option>)}</Select></Field>
          <Field label="المدينة أو المنطقة" hint={form.governorate === '*' ? 'السعر سيُستخدم للمناطق التي ليس لها سعر محدد' : 'اتركها فارغة لتطبيق السعر على المحافظة كلها'}><Input value={form.city === '*' ? '' : form.city} disabled={form.governorate === '*'} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={60} /></Field>
          <Field label="المسافة من وسط بنها" hint="اتركها فارغة لإدخال سعر ثابت بدل حساب المسافة"><Input inputMode="decimal" suffix="كم" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: e.target.value.replace(/[^\d.]/g, ''), fee: '' })} /></Field>
          {!form.distanceKm && <Field label="أو رسوم ثابتة للمنطقة"><Input inputMode="numeric" suffix="ج.م" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value.replace(/\D/g, '') })} /></Field>}
          <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy} icon={editing ? Pencil : Plus}>{editing ? 'حفظ التعديل' : 'إضافة السعر'}</Button>{editing && <Button type="button" variant="outline" icon={X} onClick={reset}>إلغاء</Button>}</div>
        </form>
      </Panel>
      <Panel title="الأسعار المسجلة" subtitle={`${data?.items?.length || 0} منطقة`}>
        {loading && !data ? <Skeleton className="h-40 w-full" /> : !data?.items?.length ? <EmptyState icon={MapPin} title="لسه مفيش أسعار مناطق" body="المناطق غير المسجلة تستخدم السعر الأساسي الذي تحدده فوق." /> : (
          <ul className="divide-y divide-line">{data.items.map((item) => <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><MapPin className="h-4 w-4 shrink-0 text-brand" /><div className="min-w-0 flex-1"><p className="font-medium">{item.governorate === '*' ? 'السعر الافتراضي — باقي المناطق' : item.city ? `${item.city}، ${item.governorate}` : item.governorate}</p><p className="text-sm text-muted">{item.distanceKm == null ? '' : `${item.distanceKm} كم من بنها · `}{fmtMoney(item.fee)}</p></div><button type="button" onClick={() => edit(item)} aria-label="تعديل السعر" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-fg/[0.06]"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(item)} aria-label="حذف السعر" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-sale/10 hover:text-sale"><Trash2 className="h-4 w-4" /></button></li>)}</ul>
        )}
      </Panel>
    </div>
  </div>;
}
