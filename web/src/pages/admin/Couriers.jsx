import { useState } from 'react';
import { Wallet, Phone, Plus, Trash2, Info } from 'lucide-react';
import { PageHeader, Panel, KpiCard, FilterTabs } from '../../components/dash/Kit.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useAdminApi, adminApi, fmtNum, fmtMoney } from './adminApi.js';
import ExportButton from './ExportButton.jsx';

const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });

function Balance({ value }) {
  if (value > 0) return <div className="text-end"><p className="text-[26px] font-bold tabular text-red-600">{fmtMoney(value)}</p><p className="text-xs text-muted">عليه للإدارة</p></div>;
  if (value < 0) return <div className="text-end"><p className="text-[26px] font-bold tabular text-emerald-600">{fmtMoney(-value)}</p><p className="text-xs text-muted">ليه عند الإدارة</p></div>;
  return <div className="text-end"><p className="text-[26px] font-bold tabular text-muted">٠ ج.م</p><p className="text-xs text-muted">متصفّي</p></div>;
}

function SettleForm({ courier, onDone }) {
  const [amount, setAmount] = useState(courier.outstanding > 0 ? String(courier.outstanding) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const n = Math.round(Number(amount));
    if (!n || n < 1) { setErr('اكتب المبلغ اللي استلمته'); return; }
    setBusy(true); setErr('');
    try { await adminApi(`/couriers/${courier.id}/settlements`, { method: 'POST', body: { amount: n, note: note || undefined } }); onDone(); }
    catch (x) { setErr(x.message || 'حصل خطأ'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-fg/[0.04] p-3">
      <label className="min-w-[120px] flex-1"><span className="mb-1 block text-xs text-muted">المبلغ اللي استلمته (ج.م)</span>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-base outline-none focus:border-ring" /></label>
      <label className="min-w-[140px] flex-[2]"><span className="mb-1 block text-xs text-muted">ملاحظة (اختياري)</span>
        <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-3 text-base outline-none focus:border-ring" /></label>
      <button disabled={busy} className="h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'بيتسجل…' : 'سجّل التسليم'}</button>
      {err && <p className="w-full text-sm text-red-600">{err}</p>}
    </form>
  );
}

function CourierCard({ c, onChange }) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(null);
  const remove = async (id) => {
    if (sure !== id) { setSure(id); setTimeout(() => setSure((s) => (s === id ? null : s)), 4000); return; }
    try { await adminApi(`/couriers/settlements/${id}`, { method: 'DELETE' }); onChange(); } catch { /* shown by reload */ }
  };
  return (
    <Panel className="mt-4" bodyClassName="!p-4 sm:!p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold">{c.name}{!c.active && <Badge tone="neutral" size="sm">متوقف</Badge>}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted" dir="ltr"><Phone className="h-3.5 w-3.5" />{c.phone}</p>
          <p className="mt-1 text-xs text-muted">{fmtNum(c.runsTotal)} رحلة اتسلّمت · اتسلّم للإدارة {fmtMoney(c.settledTotal)}</p>
        </div>
        <Balance value={c.outstanding} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-semibold text-brand"><Plus className="h-4 w-4" />سجّل تسليم فلوس</button>
      </div>
      {open && <SettleForm courier={c} onDone={() => { setOpen(false); onChange(); }} />}

      {c.daily.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-line text-xs text-muted">
              <th className="py-2 text-start font-medium">اليوم</th><th className="font-medium">رحلات</th><th className="font-medium">اتحصّل</th><th className="font-medium">اندفع للمحلات</th><th className="font-medium">مطلوب تسليمه</th><th className="font-medium">أجره</th><th className="text-end font-medium">الصافي</th>
            </tr></thead>
            <tbody>
              {c.daily.map((d) => (
                <tr key={d.day} className="border-b border-line/60 text-center tabular">
                  <td className="py-2.5 text-start font-medium">{dayLabel(d.day)}</td>
                  <td>{fmtNum(d.runs)}<span className="text-xs text-muted"> ({fmtNum(d.orders)} طلب)</span></td>
                  <td>{fmtNum(d.collected)}</td><td>{fmtNum(d.storePay)}</td><td>{fmtNum(d.handover)}</td>
                  <td>{fmtNum(d.wage)}{d.wageMissing > 0 && <span className="text-amber-600" title="أجر الرحلة مش متسجل"> ⚠</span>}</td>
                  <td className={`text-end font-semibold ${d.net < 0 ? 'text-emerald-600' : ''}`}>{fmtMoney(d.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-muted">مفيش رحلات اتسلّمت في الفترة دي.</p>}

      {c.settlements.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-sm font-semibold">آخر التسليمات</p>
          <ul className="space-y-1.5">
            {c.settlements.map((s) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span className="tabular font-semibold">{fmtMoney(s.amount)}</span><span className="text-muted">{dayLabel(s.day)}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{s.note}</span>
                <button type="button" onClick={() => remove(s.id)} className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs ${sure === s.id ? 'bg-red-600 text-white' : 'text-muted hover:bg-fg/[0.06]'}`}><Trash2 className="h-3.5 w-3.5" />{sure === s.id ? 'تأكيد المسح' : 'مسح'}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export default function Couriers() {
  const [days, setDays] = useState(14);
  const { data, error, loading, reload } = useAdminApi(`/couriers?days=${days}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;
  const list = data?.couriers || [];
  const owed = list.reduce((a, c) => a + Math.max(0, c.outstanding), 0);
  const due = list.reduce((a, c) => a + Math.max(0, -c.outstanding), 0);
  return (
    <div>
      <PageHeader title="حساب المندوبين" subtitle="كل مندوب حصّل كام، ودفع كام للمحلات، وعليه أو ليه كام عند الإدارة"
        actions={<><FilterTabs value={days} onChange={setDays} options={[{ value: 7, label: '٧ أيام' }, { value: 14, label: '١٤ يوم' }, { value: 30, label: '٣٠ يوم' }]} /><ExportButton kind="couriers" days={days} /></>} />
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="عند المناديب (مطلوب تسليمه)" icon={Wallet} tone="accent" value={owed} format={fmtMoney} loading={L} />
        <KpiCard label="ليهم عند الإدارة" icon={Wallet} tone="brand" value={due} format={fmtMoney} loading={L} />
      </div>
      <div className="mt-4 flex gap-3 rounded-2xl border border-line bg-elevated p-4 text-sm leading-relaxed text-muted">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <p>الحساب: <b className="text-fg">مطلوب تسليمه = اللي اتحصّل من العملاء + حصة المحلات في التوصيل − اللي اندفع للمحلات</b>، وبعدين بيتخصم أجر المندوب. لو الرقم بالسالب يبقى المندوب دفع للمحلات أكتر من اللي حصّله (مثلاً كوبون من المنصة) والإدارة هي اللي ليها عليه. الأرقام تقديرية من بيانات الطلبات، فراجعها مع المندوب أول كام يوم. أجر الرحلة بيتسجل من صفحة التوصيل.</p>
      </div>
      {data?.unassigned?.runs > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">فيه {fmtNum(data.unassigned.runs)} رحلة اتسلّمت من غير ما تحدد المندوب بتاعها، وفلوسها مش داخلة في حساب أي مندوب. حدّد المندوب من صفحة التوصيل.</div>
      )}
      {L ? <Skeleton className="mt-4 h-64 w-full rounded-2xl" /> : !list.length ? <EmptyState icon={Wallet} title="مفيش مناديب" body="ضيف أفراد الدليفري الأول من صفحة أفراد الدليفري." /> : list.map((c) => <CourierCard key={c.id} c={c} onChange={reload} />)}
    </div>
  );
}
