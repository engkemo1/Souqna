import { useState } from 'react';
import { Pencil, Phone, Plus, Trash2, Truck, UserRound, X } from 'lucide-react';
import { Field, Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi } from './adminApi.js';

const blank = { name: '', phone: '' };

export default function DeliveryPeople() {
  const { data, error, loading, reload } = useAdminApi('/delivery-people');
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setForm(blank); setEditing(null); };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await adminApi(editing ? `/delivery-people/${editing}` : '/delivery-people', { method: editing ? 'PATCH' : 'POST', body: form });
      toast({ title: editing ? 'تم تحديث بيانات المندوب' : 'تم تسجيل المندوب' });
      reset(); reload();
    } catch (e) {
      toast({ tone: 'error', title: e.code === 'validation_failed' ? (e.fields?.phone === 'phone_taken' ? 'رقم الموبايل مسجل قبل كده' : 'راجع الاسم ورقم الموبايل') : e.message });
    }
    setBusy(false);
  };
  const edit = (person) => { setEditing(person.id); setForm({ name: person.name, phone: person.phone }); };
  const remove = async (person) => {
    if (!window.confirm(`حذف ${person.name} من قائمة أفراد الدليفري؟`)) return;
    try { await adminApi(`/delivery-people/${person.id}`, { method: 'DELETE' }); toast({ title: 'تم حذف المندوب' }); reload(); }
    catch (e) { toast({ tone: 'error', title: e.message }); }
  };

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return <div>
    <PageHeader title="أفراد الدليفري" subtitle="سجّل بيانات الأشخاص المسؤولين عن استلام الطلبات وتوصيلها من Twist" />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <Panel title={editing ? 'تعديل بيانات المندوب' : 'تسجيل مندوب جديد'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="اسم المندوب"><Input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={80} /></Field>
          <Field label="رقم الموبايل" hint="رقم مصري يبدأ بـ 010 أو 011 أو 012 أو 015"><Input dir="ltr" inputMode="tel" autoComplete="tel" placeholder="01xxxxxxxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></Field>
          <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy} icon={editing ? Pencil : Plus}>{editing ? 'حفظ التعديلات' : 'تسجيل المندوب'}</Button>{editing && <Button type="button" variant="outline" icon={X} onClick={reset}>إلغاء</Button>}</div>
        </form>
      </Panel>

      <Panel title="قائمة المندوبين" subtitle={`${data?.items?.length || 0} مسجل`}>
        {loading && !data ? <Skeleton className="h-40 w-full" /> : !data?.items?.length ? <EmptyState icon={Truck} title="لسه مفيش مندوبين" body="سجّل أول شخص مسؤول عن توصيل طلبات Twist." /> : (
          <ul className="divide-y divide-line">
            {data.items.map((person) => <li key={person.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-brand"><UserRound className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{person.name}</p><a href={`tel:${person.phone}`} dir="ltr" className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><Phone className="h-3.5 w-3.5" />{person.phone}</a></div>
              <div className="flex shrink-0 gap-1"><button type="button" onClick={() => edit(person)} aria-label={`تعديل ${person.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-fg/[0.06] hover:text-fg"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(person)} aria-label={`حذف ${person.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-sale/10 hover:text-sale"><Trash2 className="h-4 w-4" /></button></div>
            </li>)}
          </ul>
        )}
      </Panel>
    </div>
  </div>;
}
