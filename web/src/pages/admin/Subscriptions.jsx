import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, CreditCard, Gift, MessageCircle, Save, Wallet } from 'lucide-react';
import { PageHeader, KpiCard, Panel, SearchInput } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtMoney, fmtNum, waLink } from './adminApi.js';

const statusInfo = {
  paid: ['مدفوع', 'bg-success/10 text-success'],
  free: ['شهر مجاني', 'bg-brand/10 text-brand'],
  due: ['مستحق اليوم', 'bg-amber-100 text-amber-800'],
  overdue: ['متأخر', 'bg-sale/10 text-sale'],
  unregistered: ['غير مسجل', 'bg-fg/[0.06] text-muted'],
};
const dateLabel = (value) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('ar-EG', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : 'غير مسجل';
const monthOptions = [1, 2, 3, 6, 12];
const methodLabels = { cash: 'نقدي', bank_transfer: 'تحويل بنكي', wallet: 'محفظة إلكترونية', instapay: 'إنستاباي', other: 'أخرى' };

function reminderFor(item, template) {
  const due = dateLabel(item.dueDate);
  return String(template || '')
    .replaceAll('{store}', item.name_ar)
    .replaceAll('{amount}', fmtMoney(item.monthlyFee))
    .replaceAll('{due_date}', due)
    .replaceAll('{months}', '1');
}

export default function Subscriptions() {
  const { data, error, loading, reload } = useAdminApi('/subscriptions', { every: 60000 });
  const toast = useToast();
  const [settings, setSettings] = useState({ monthlyFee: '0', reminderDays: '5', reminderTemplate: '' });
  const [busy, setBusy] = useState('');
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('payment');
  const [months, setMonths] = useState('1');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [freeMonths, setFreeMonths] = useState('1');
  const [freeNote, setFreeNote] = useState('');
  const [fees, setFees] = useState({});

  useEffect(() => {
    if (data?.settings) setSettings({ monthlyFee: String(data.settings.monthlyFee), reminderDays: String(data.settings.reminderDays), reminderTemplate: data.settings.reminderTemplate });
  }, [data?.settings]);

  const items = data?.items || [];
  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'due' && !['due', 'overdue'].includes(item.status)) return false;
    if (filter === 'paid' && item.status !== 'paid') return false;
    if (filter === 'free' && item.status !== 'free') return false;
    const query = term.trim().toLowerCase();
    return !query || [item.name_ar, item.owner_name, item.phone, item.whatsapp].some((x) => String(x || '').toLowerCase().includes(query));
  }), [items, filter, term]);
  const dueCount = items.filter((x) => ['due', 'overdue'].includes(x.status)).length;
  const paidCount = items.filter((x) => x.status === 'paid').length;
  const freeCount = items.filter((x) => x.status === 'free').length;
  const soonCount = items.filter((x) => x.dueSoon).length;
  const unregisteredCount = items.filter((x) => x.status === 'unregistered').length;

  const saveSettings = async (e) => {
    e.preventDefault(); setBusy('settings');
    try {
      await adminApi('/subscriptions/settings', { method: 'PUT', body: { monthlyFee: Number(settings.monthlyFee), reminderDays: Number(settings.reminderDays), reminderTemplate: settings.reminderTemplate } });
      toast({ title: 'تم حفظ إعدادات الاشتراك والتذكير' }); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };

  const saveFee = async (item) => {
    setBusy(`fee:${item.slug}`);
    try {
      const value = fees[item.slug] ?? (item.monthly_fee_override == null ? '' : String(item.monthly_fee_override));
      await adminApi(`/subscriptions/${item.slug}/fee`, { method: 'PUT', body: { monthlyFeeOverride: value === '' ? null : Number(value) } });
      toast({ title: 'تم تحديث سعر اشتراك المحل' }); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };

  const recordPayment = async (e, item) => {
    e.preventDefault(); setBusy(`payment:${item.slug}`);
    try {
      await adminApi(`/subscriptions/${item.slug}/payment`, { method: 'POST', body: { months: Number(months), amount: amount ? Number(amount) : undefined, method, note } });
      toast({ title: `تم تسجيل تحصيل ${months} ${Number(months) === 1 ? 'شهر' : 'أشهر'}` }); setSelected(null); setAmount(''); setNote(''); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };

  const grantFree = async (e, item) => {
    e.preventDefault(); setBusy(`free:${item.slug}`);
    try {
      await adminApi(`/subscriptions/${item.slug}/free-months`, { method: 'POST', body: { months: Number(freeMonths), note: freeNote } });
      toast({ title: `تم منح ${freeMonths} شهر مجاني لـ${item.name_ar}` }); setSelected(null); setFreeNote(''); reload();
    } catch (x) { toast({ tone: 'error', title: x.message }); }
    setBusy('');
  };

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return <div>
    <PageHeader title="اشتراكات المحلات" subtitle="تابع التحصيل الشهري، سجل الدفعات والأشهر المجانية، وابعت تذكير واتساب جاهز للمحل." />
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KpiCard label="مدفوع حاليًا" value={paidCount} icon={BadgeCheck} tone="brand" format={fmtNum} loading={loading && !data} />
      <KpiCard label="مستحق أو متأخر" value={dueCount} icon={CreditCard} tone="accent" format={fmtNum} loading={loading && !data} />
      <KpiCard label="فترة مجانية حاليًا" value={freeCount} icon={Gift} tone="sky" format={fmtNum} loading={loading && !data} />
      <KpiCard label="موعدهم قرب" value={soonCount} icon={CalendarClock} tone="accent" format={fmtNum} loading={loading && !data} />
      <KpiCard label="اشتراك غير مسجل" value={unregisteredCount} icon={Wallet} tone="neutral" format={fmtNum} loading={loading && !data} />
    </div>

    <Panel title="إعدادات الاشتراك والتذكير" className="mb-5">
      <form onSubmit={saveSettings} className="space-y-4">
        {Number(settings.monthlyFee) === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">حدد سعر الاشتراك الشهري هنا قبل تسجيل أي تحصيل؛ ويمكنك تعيين سعر مختلف لكل محل.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="سعر الاشتراك الشهري الأساسي" hint="يمكن تخصيص سعر مختلف لكل محل أسفل البطاقة."><Input inputMode="numeric" suffix="ج.م" value={settings.monthlyFee} onChange={(e) => setSettings({ ...settings, monthlyFee: e.target.value.replace(/\D/g, '') })} required /></Field>
          <Field label="التذكير قبل الاستحقاق"><Input inputMode="numeric" suffix="يوم" value={settings.reminderDays} onChange={(e) => setSettings({ ...settings, reminderDays: e.target.value.replace(/\D/g, '') })} required /></Field>
        </div>
        <Field label="نص رسالة واتساب الجاهزة" hint="المتغيرات المتاحة: {store} اسم المحل، {amount} المبلغ، {due_date} موعد الاستحقاق، {months} عدد الأشهر."><Textarea rows={3} value={settings.reminderTemplate} onChange={(e) => setSettings({ ...settings, reminderTemplate: e.target.value })} required minLength={10} maxLength={1000} /></Field>
        <Button type="submit" icon={Save} loading={busy === 'settings'}>حفظ إعدادات الاشتراك</Button>
      </form>
    </Panel>

    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {[['all', 'كل المحلات'], ['due', 'مستحق / متأخر'], ['paid', 'مدفوع'], ['free', 'مجاني'], ['unregistered', 'غير مسجل']].map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1.5 text-sm ${filter === key ? 'border-fg bg-fg text-canvas' : 'border-line text-muted'}`}>{label}</button>)}
      </div>
      <SearchInput value={term} onChange={setTerm} placeholder="ابحث باسم المحل أو رقم الهاتف" />
    </div>

    {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : !visible.length ? <EmptyState icon={Wallet} title="مفيش محلات في الاختيار ده" body="غيّر الفلتر أو ابحث باسم محل تاني." /> : <div className="grid gap-4 xl:grid-cols-2">
      {visible.map((item) => {
        const [label, tone] = statusInfo[item.status];
        const isSelected = selected === item.slug;
        const reminder = reminderFor(item, settings.reminderTemplate);
        const phone = item.reminderPhone;
        return <article key={item.id} className="rounded-2xl border border-line bg-elevated p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{item.name_ar}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>{item.dueSoon && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">التجديد قرب</span>}</div><p className="mt-1 text-sm text-muted">صاحب المحل: {item.owner_name || '—'} · {item.phone || 'بدون رقم'}</p></div>
            <div className="text-end"><p className="text-xs text-muted">السعر الشهري</p><p className="text-lg font-bold">{fmtMoney(item.monthlyFee)}</p></div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-fg/[0.035] p-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted">مغطى حتى</p><p className="mt-0.5 font-medium">{dateLabel(item.coveredThrough)}</p></div>
            <div><p className="text-xs text-muted">الاستحقاق التالي</p><p className="mt-0.5 font-medium">{dateLabel(item.dueDate)}</p></div>
            <div><p className="text-xs text-muted">نوع الفترة الحالية</p><p className="mt-0.5 font-medium">{item.status === 'free' ? 'منحة مجانية' : item.status === 'paid' ? 'مدفوعة' : 'غير مغطاة'}</p></div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon={CreditCard} onClick={() => { const close = isSelected && mode === 'payment'; setSelected(close ? null : item.slug); setMode('payment'); setMonths('1'); setAmount(item.monthlyFee ? String(item.monthlyFee) : ''); }}>تسجيل تحصيل</Button>
            <Button size="sm" variant="outline" icon={Gift} onClick={() => { const close = isSelected && mode === 'free'; setSelected(close ? null : item.slug); setMode('free'); setFreeMonths('1'); }}>منح شهر مجاني</Button>
            {phone && item.status !== 'unregistered' && <Button size="sm" variant="outline" icon={MessageCircle} href={waLink(phone, reminder)} target="_blank" rel="noreferrer">تذكير واتساب</Button>}
          </div>

          <div className="mt-4 flex items-end gap-2 border-t border-line pt-4">
            <Field className="flex-1" label="سعر خاص للمحل" hint="اتركه فارغًا لاستخدام السعر الأساسي."><Input inputMode="numeric" suffix="ج.م" placeholder={String(settings.monthlyFee)} value={fees[item.slug] ?? (item.monthly_fee_override == null ? '' : String(item.monthly_fee_override))} onChange={(e) => setFees({ ...fees, [item.slug]: e.target.value.replace(/\D/g, '') })} /></Field>
            <Button size="sm" variant="outline" icon={Save} loading={busy === `fee:${item.slug}`} onClick={() => saveFee(item)}>حفظ السعر</Button>
          </div>

          {isSelected && <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
            <p className="mb-3 text-sm font-semibold text-brand">{mode === 'payment' ? `تسجيل تحصيل لـ${item.name_ar}` : `منح فترة مجانية لـ${item.name_ar}`}</p>
            {mode === 'payment' ? <form onSubmit={(e) => recordPayment(e, item)} className="grid gap-3 sm:grid-cols-2">
              <Field label="عدد الشهور المدفوعة"><Select value={months} onChange={(e) => { setMonths(e.target.value); setAmount(item.monthlyFee ? String(item.monthlyFee * Number(e.target.value)) : ''); }}>{monthOptions.map((n) => <option key={n} value={n}>{n} {n === 1 ? 'شهر' : 'شهور'}</option>)}</Select></Field>
              <Field label="المبلغ المستلم"><Input inputMode="numeric" suffix="ج.م" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required /></Field>
              <Field label="طريقة الدفع"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(methodLabels).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</Select></Field>
              <Field label="ملاحظة أو رقم إيصال"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
              <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={busy === `payment:${item.slug}`}>تأكيد التحصيل وتمديد الاشتراك</Button><Button type="button" variant="outline" onClick={() => setSelected(null)}>إلغاء</Button></div>
            </form> : <form onSubmit={(e) => grantFree(e, item)} className="grid gap-3 sm:grid-cols-2">
              <Field label="عدد الشهور المجانية"><Select value={freeMonths} onChange={(e) => setFreeMonths(e.target.value)}>{monthOptions.map((n) => <option key={n} value={n}>{n} {n === 1 ? 'شهر' : 'شهور'}</option>)}</Select></Field>
              <Field label="سبب المنحة (اختياري)"><Input value={freeNote} onChange={(e) => setFreeNote(e.target.value)} maxLength={300} placeholder="عرض افتتاحي، تعويض..." /></Field>
              <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="outline" icon={Gift} loading={busy === `free:${item.slug}`}>تأكيد المنحة المجانية</Button><Button type="button" variant="outline" onClick={() => setSelected(null)}>إلغاء</Button></div>
            </form>}
          </div>}
        </article>;
      })}
    </div>}

    {!!data?.history?.length && <Panel title="سجل التحصيل والمنح" className="mt-6">
      <div className="divide-y divide-line">{data.history.slice(0, 30).map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><strong>{entry.storeName}</strong><span className="mx-2 text-muted">·</span><span>{entry.kind === 'free' ? 'منحة مجانية' : `تحصيل ${methodLabels[entry.payment_method] || ''}`}</span><span className="mx-2 text-muted">·</span><span>{fmtNum(entry.months)} {entry.months === 1 ? 'شهر' : 'شهور'}</span>{entry.note && <p className="mt-1 text-xs text-muted">{entry.note}</p>}</div><div className="text-end"><p className="font-semibold">{entry.kind === 'free' ? 'مجاني' : fmtMoney(entry.amount)}</p><p className="text-xs text-muted">{dateLabel(entry.covered_from)} — {dateLabel(entry.covered_through)}</p></div></div>)}</div>
    </Panel>}
  </div>;
}
