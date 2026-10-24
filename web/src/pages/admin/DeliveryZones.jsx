import { useEffect, useMemo, useState } from 'react';
import { MapPin, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Field, Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtMoney } from './adminApi.js';

const num = (v) => Math.max(0, Math.round(Number(v) || 0));
const digits = (v) => v.replace(/\D/g, '');

/** same maths as the server (priceZones) so the table below shows exactly what customers will pay */
function simulate(zones, tiers, extraStopCost, minMargin) {
  const n = zones.length;
  const subtotal = zones.reduce((s, z) => s + z.fee, 0);
  const pct = Math.max(0, ...tiers.filter((t) => t.zones <= n).map((t) => num(t.percent)));
  let fee = Math.round(subtotal * (1 - pct / 100));
  const known = zones.every((z) => z.courierCost > 0);
  const tripCost = known ? Math.max(...zones.map((z) => z.courierCost)) + (n - 1) * extraStopCost : null;
  let capped = false;
  if (tripCost != null) { const floor = Math.min(subtotal, tripCost + minMargin); if (fee < floor) { fee = floor; capped = true; } }
  return { n, subtotal, pct, fee, discount: subtotal - fee, tripCost, profit: tripCost == null ? null : fee - tripCost, capped };
}

export default function DeliveryZones() {
  const { data, error, loading, reload } = useAdminApi('/delivery-zones');
  const toast = useToast();
  const [zones, setZones] = useState([]);
  const [tiers, setTiers] = useState({ 2: '', 3: '', 4: '' });
  const [extra, setExtra] = useState('0');
  const [margin, setMargin] = useState('0');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setZones(data.zones.map((z) => ({ ...z, fee: z.fee ? String(z.fee) : '', courierCost: z.courierCost ? String(z.courierCost) : '' })));
    const t = { 2: '', 3: '', 4: '' };
    for (const x of data.policy.tiers) t[x.zones] = String(x.percent);
    setTiers(t); setExtra(String(data.policy.extraStopCost)); setMargin(String(data.policy.minMargin));
  }, [data]);

  const fallback = data?.fallbackFee || 0;
  const parsed = useMemo(() => zones.map((z) => ({ ...z, fee: num(z.fee) || fallback, courierCost: num(z.courierCost) })), [zones, fallback]);
  const tierList = [2, 3, 4].map((n) => ({ zones: n, percent: num(tiers[n]) }));
  const rows = useMemo(() => {
    const top = [...parsed].sort((a, b) => b.fee - a.fee);
    const out = [];
    for (let n = 2; n <= Math.min(4, top.length); n++) out.push(simulate(top.slice(0, n), tierList, num(extra), num(margin)));
    return out;
  }, [parsed, tiers, extra, margin]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (i, k) => (e) => setZones((zs) => zs.map((z, x) => (x === i ? { ...z, [k]: digits(e.target.value) } : z)));
  const save = async () => {
    setBusy(true);
    try {
      await adminApi('/delivery-zones', { method: 'PUT', body: {
        zones: zones.map((z) => ({ key: z.key, name: z.name, fee: num(z.fee), courierCost: num(z.courierCost) })),
        policy: { tiers: tierList.filter((t) => t.percent > 0), extraStopCost: num(extra), minMargin: num(margin) },
      } });
      toast({ title: 'تم حفظ أسعار المناطق والخصم' }); reload();
    } catch (e) { toast({ tone: 'error', title: e.message }); }
    setBusy(false);
  };
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return <div>
    <PageHeader title="مناطق الاستلام والخصم" subtitle="سعر الدليفري لكل منطقة استلام، والخصم لما العميل يطلب من أكتر من منطقة، مع حماية بتمنع الخصم من إنه يخسّرك." />
    <div className="mb-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">المحلات اللي في نفس المنطقة بتتحسب <b>مرة واحدة</b> (المندوب بيعدّي مكان واحد). المنطقة بتتحدد من خانة "منطقة استلام الطلبات" في تعديل كل محل. لو منطقة سعرها فاضي، بنستخدم سعر منطقة العميل العادي ({fmtMoney(fallback)}).</div>

    <Panel title="أسعار مناطق الاستلام" subtitle={`${zones.length} منطقة`} className="mb-5">
      {loading && !data ? <Skeleton className="h-40 w-full" /> : (
        <ul className="divide-y divide-line">
          {zones.map((z, i) => {
            const fee = num(z.fee) || fallback; const cost = num(z.courierCost); const profit = cost ? fee - cost : null;
            return <li key={z.key} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_150px_150px_110px] sm:items-end">
              <div className="min-w-0"><p className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 shrink-0 text-brand" />{z.name}</p>
                <p className="mt-1 text-xs text-muted">{z.stores.map((s) => s.name).join(' · ')}</p>
                {z.stores.some((s) => s.lat == null) && <p className="mt-1 text-xs text-amber-700">📍 فيه محل بدون موقع على الخريطة</p>}</div>
              <Field label="سعر العميل"><Input inputMode="numeric" suffix="ج.م" value={z.fee} placeholder={String(fallback)} onChange={patch(i, 'fee')} /></Field>
              <Field label="تكلفة المندوب علينا"><Input inputMode="numeric" suffix="ج.م" value={z.courierCost} onChange={patch(i, 'courierCost')} /></Field>
              <p className={`pb-2 text-sm font-semibold ${profit == null ? 'text-muted' : profit < 0 ? 'text-sale' : 'text-emerald-700'}`}>{profit == null ? 'الربح: —' : `الربح: ${profit} ج`}</p>
            </li>;
          })}
          {!zones.length && <li className="py-6 text-center text-sm text-muted">مفيش محلات نشطة لسه.</li>}
        </ul>
      )}
    </Panel>

    <Panel title="خصم الطلب من أكتر من منطقة" className="mb-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[2, 3, 4].map((n) => <Field key={n} label={n === 4 ? '4 مناطق أو أكتر' : `${n === 2 ? 'منطقتين' : '3 مناطق'}`} hint="نسبة خصم على مجموع الأسعار"><Input inputMode="numeric" suffix="%" value={tiers[n]} onChange={(e) => setTiers({ ...tiers, [n]: digits(e.target.value).slice(0, 2) })} /></Field>)}
      </div>
      <div className="mt-5 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-700" />حماية الربح</div>
      <p className="mt-1 text-sm text-muted">الخصم مش هيخلّي سعر العميل ينزل عن تكلفة اللفة الفعلية علينا + أقل ربح. لازم تدخل "تكلفة المندوب" لكل منطقة فوق عشان الحماية تشتغل.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label="تكلفة إضافية لكل منطقة زيادة" hint="كام بيزيد على المندوب لما يعدّي على منطقة تانية في نفس اللفة"><Input inputMode="numeric" suffix="ج.م" value={extra} onChange={(e) => setExtra(digits(e.target.value))} /></Field>
        <Field label="أقل ربح مضمون للفة" hint="الحد الأدنى اللي يفضل لك بعد تكلفة المندوب"><Input inputMode="numeric" suffix="ج.م" value={margin} onChange={(e) => setMargin(digits(e.target.value))} /></Field>
      </div>
    </Panel>

    <Panel title="جدول الربح (مثال بأغلى المناطق)" subtitle="ده بالظبط اللي هيدفعه العميل" className="mb-5">
      {!rows.length ? <p className="text-sm text-muted">محتاج منطقتين على الأقل.</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-start text-xs text-muted"><th className="py-2 text-start font-medium">عدد المناطق</th><th className="text-start font-medium">المجموع</th><th className="text-start font-medium">الخصم</th><th className="text-start font-medium">العميل يدفع</th><th className="text-start font-medium">تكلفتنا</th><th className="text-start font-medium">الربح</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.n} className="border-t border-line">
            <td className="py-2.5 font-semibold">{r.n}</td><td>{r.subtotal}</td>
            <td>{r.pct}%{r.capped && <span className="ms-1 inline-flex items-center gap-0.5 text-xs text-amber-700"><TriangleAlert className="h-3 w-3" />اتقلّل بالحماية</span>}</td>
            <td className="font-bold">{r.fee}</td><td>{r.tripCost ?? '—'}</td>
            <td className={r.profit == null ? 'text-muted' : r.profit < 0 ? 'font-semibold text-sale' : 'font-semibold text-emerald-700'}>{r.profit ?? '—'}</td>
          </tr>)}</tbody></table></div>
      )}
    </Panel>
    <Button onClick={save} loading={busy}>حفظ الكل</Button>
  </div>;
}
