import { useState } from 'react';
import { Plus, Pencil, Trash2, Ticket } from 'lucide-react';
import { PageHeader } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Switch, Segmented } from '../../components/ui/Field.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtNum, fmtMoney } from './adminApi.js';

const EMPTY = { code: '', type: 'percentage', value: 10, max_discount: '', min_subtotal: 0, first_order_only: false, per_phone_limit: 1, title_ar: '', title_en: '', starts_at: '', ends_at: '', usage_limit: '', promoted: false, active: true };
const TYPE_AR = { percentage: 'نسبة %', fixed: 'مبلغ ثابت', free_shipping: 'شحن مجاني' };
const describe = (c) => (c.type === 'percentage' ? `خصم ${c.value}%${c.max_discount ? ` (حتى ${fmtMoney(c.max_discount)})` : ''}` : c.type === 'fixed' ? `خصم ${fmtMoney(c.value)}` : 'شحن مجاني');
const num = (v) => (v === '' || v == null ? null : Number(v));

function CouponSheet({ coupon, onClose, onSaved }) {
  const toast = useToast();
  const isNew = coupon === 'new';
  const [f, setF] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  if (coupon !== last) { setLast(coupon); setF(coupon ? (isNew ? { ...EMPTY } : { ...EMPTY, ...coupon, max_discount: coupon.max_discount ?? '', usage_limit: coupon.usage_limit ?? '', starts_at: coupon.starts_at || '', ends_at: coupon.ends_at || '' }) : null); setErrs({}); }
  const open = !!coupon;
  const save = async (e) => {
    e?.preventDefault(); setBusy(true); setErrs({});
    const body = { code: f.code, type: f.type, value: Number(f.value) || 0, max_discount: num(f.max_discount), min_subtotal: Number(f.min_subtotal) || 0, first_order_only: f.first_order_only, per_phone_limit: Number(f.per_phone_limit) || 1, title_ar: f.title_ar, title_en: f.title_en, starts_at: f.starts_at || null, ends_at: f.ends_at || null, usage_limit: num(f.usage_limit), promoted: f.promoted, active: f.active };
    try {
      await (isNew ? adminApi('/coupons', { method: 'POST', body }) : adminApi(`/coupons/${coupon.id}`, { method: 'PUT', body }));
      toast({ title: isNew ? 'اتضاف الكوبون' : 'اتحفظ' }); onSaved(); onClose();
    } catch (x) {
      const m = { code_taken: 'الكود ده مستخدم', code_invalid: 'حروف إنجليزي وأرقام (3 إلى 20)، مثال: WELCOME10', percent_range: 'النسبة من 1 إلى 100', value_required: 'اكتب قيمة الخصم' };
      setErrs(Object.fromEntries(Object.entries(x.fields || {}).map(([k, v]) => [k, m[v] || 'قيمة غير صحيحة'])));
      toast({ tone: 'error', title: x.message });
    }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={isNew ? 'كوبون جديد' : `تعديل: ${coupon?.code || ''}`} side="end" size="lg"
      footer={<div className="flex gap-2"><Button full loading={busy} onClick={save}>{isNew ? 'إضافة الكوبون' : 'حفظ'}</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>}>
      {f && (
        <form onSubmit={save} className="space-y-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الكود" error={errs.code}><Input dir="ltr" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" className="text-start uppercase" /></Field>
            <Field label="النوع"><Segmented value={f.type} onChange={(v) => setF({ ...f, type: v })} className="w-full [&>button]:flex-1" options={Object.entries(TYPE_AR).map(([value, label]) => ({ value, label }))} /></Field>
            {f.type !== 'free_shipping' && <Field label={f.type === 'percentage' ? 'النسبة %' : 'قيمة الخصم (ج.م)'} error={errs.value}><Input type="number" dir="ltr" min={1} max={f.type === 'percentage' ? 100 : undefined} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} className="text-start" /></Field>}
            {f.type === 'percentage' && <Field label="أقصى خصم (ج.م)" hint="اختياري — يحميك من خصم كبير على طلب كبير"><Input type="number" dir="ltr" min={1} value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} className="text-start" /></Field>}
            <Field label="أقل قيمة للطلب (ج.م)"><Input type="number" dir="ltr" min={0} value={f.min_subtotal} onChange={(e) => setF({ ...f, min_subtotal: e.target.value })} className="text-start" /></Field>
            <Field label="العنوان (عربي)" error={errs.title_ar}><Input required value={f.title_ar} onChange={(e) => setF({ ...f, title_ar: e.target.value })} placeholder="خصم أول طلب" /></Field>
            <Field label="العنوان (إنجليزي)" error={errs.title_en}><Input dir="ltr" required value={f.title_en} onChange={(e) => setF({ ...f, title_en: e.target.value })} placeholder="First order discount" className="text-start" /></Field>
            <Field label="يبدأ في" hint="اختياري"><Input type="date" dir="ltr" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
            <Field label="ينتهي في" hint="اختياري"><Input type="date" dir="ltr" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
            <Field label="أقصى عدد استخدامات" hint="اختياري — فاضي = من غير حد"><Input type="number" dir="ltr" min={1} value={f.usage_limit} onChange={(e) => setF({ ...f, usage_limit: e.target.value })} className="text-start" /></Field>
            <Field label="كام مرة لنفس التليفون"><Input type="number" dir="ltr" min={1} value={f.per_phone_limit} onChange={(e) => setF({ ...f, per_phone_limit: e.target.value })} className="text-start" /></Field>
          </div>
          <Switch checked={f.first_order_only} onChange={(v) => setF({ ...f, first_order_only: v })} label="لأول طلب بس" description="العميل اللي طلب قبل كده (بنفس رقم التليفون) مش هيقدر يستخدمه" />
          <Switch checked={f.promoted} onChange={(v) => setF({ ...f, promoted: v })} label="اعرضه في الصفحة الرئيسية" description="شريط صغير فوق صفحة كل المحلات بيعلن عن الكود (كوبون واحد بس يتعرض)" />
          <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="الكوبون مفعّل" />
          <p className="rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900">الخصم ده على حساب بنها أوتفيت: المحل بياخد حقه كامل ولازم تعوّضه الفرق. كل طلب بيتسجل فيه قيمة الخصم عشان تحاسب المحلات.</p>
        </form>
      )}
    </Sheet>
  );
}

export default function Coupons() {
  const { data, error, loading, reload } = useAdminApi('/coupons');
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const remove = async (c) => {
    if (!window.confirm(`حذف كوبون "${c.code}"؟`)) return;
    try { const r = await adminApi(`/coupons/${c.id}`, { method: 'DELETE' }); toast({ title: r.deactivated ? 'اتوقف (مستخدم قبل كده، فاتحفظ في السجل)' : 'اتحذف' }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); }
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const list = data?.items || [];
  return (
    <div>
      <PageHeader title="الكوبونات" subtitle="أكواد خصم من بنها أوتفيت بتشتغل على كل المحلات (كوبونات المحل الواحد بيعملها صاحب المحل من لوحته)" actions={<Button icon={Plus} onClick={() => setEdit('new')}>كوبون جديد</Button>} />
      {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !list.length ? <EmptyState icon={Ticket} title="مفيش كوبونات" body="أضف أول كوبون، مثلاً خصم أول طلب." /> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <li key={c.id} className="flex flex-col rounded-2xl border border-line bg-elevated p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-mono text-lg font-bold" dir="ltr">{c.code}</p><p className="truncate text-[13px] text-muted">{c.title_ar}</p></div>
                <div className="flex flex-col items-end gap-1">{!c.active && <Badge tone="danger" size="sm">متوقف</Badge>}{c.promoted && c.active && <Badge tone="info" size="sm">معروض</Badge>}</div>
              </div>
              <p className="mt-2 text-sm font-semibold">{describe(c)}</p>
              <p className="mt-1 text-[13px] text-muted">{[c.min_subtotal ? `لطلبات فوق ${fmtMoney(c.min_subtotal)}` : null, c.first_order_only ? 'أول طلب بس' : null, c.ends_at ? `لحد ${c.ends_at}` : null].filter(Boolean).join(' · ') || 'من غير شروط'}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-surface p-2.5"><p className="text-[12px] text-muted">اتستخدم</p><p className="font-semibold">{fmtNum(c.usage_count)}{c.usage_limit ? ` / ${fmtNum(c.usage_limit)}` : ''}</p></div>
                <div className="rounded-xl bg-surface p-2.5"><p className="text-[12px] text-muted">مستحق للمحلات</p><p className="font-semibold">{fmtMoney(c.discount_total)}</p></div>
              </div>
              <div className="mt-4 flex gap-2 border-t border-line pt-3">
                <Button size="xs" variant="outline" icon={Pencil} onClick={() => setEdit(c)}>تعديل</Button>
                <Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => remove(c)}>حذف</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <CouponSheet coupon={edit} onClose={() => setEdit(null)} onSaved={reload} />
    </div>
  );
}
