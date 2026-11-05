import { AlertTriangle, Clock, Truck, Store, CheckCircle2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, Panel, KpiCard } from '../../components/dash/Kit.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useAdminApi, fmtNum, fmtMoney } from './adminApi.js';

const dur = (m) => (m < 60 ? `${fmtNum(m)} دقيقة` : `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(m / 60)} ساعة`);

export default function Alerts() {
  const { data, error, loading, reload } = useAdminApi('/alerts', { every: 60000 });
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;
  const late = data?.late || [], stuck = data?.stuck || [], onb = data?.onboarding || [];
  const stalled = onb.filter((s) => s.stalled);
  return (
    <div>
      <PageHeader title="التنبيهات والمتابعة" subtitle="اللي محتاج تحرك دلوقتي: طلبات متأخرة، توصيل واقف، ومحلات لسه ما كملتش"
        actions={<button type="button" onClick={reload} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium hover:bg-fg/[0.05]"><RefreshCw className="h-4 w-4" />تحديث</button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="طلبات مستنية رد" icon={Clock} tone="accent" value={late.length} format={fmtNum} loading={L} />
        <KpiCard label="توصيل واقف" icon={Truck} tone="violet" value={stuck.length} format={fmtNum} loading={L} />
        <KpiCard label="محلات ناقصة بيانات" icon={Store} tone="sky" value={onb.length} format={fmtNum} loading={L} />
        <KpiCard label="محلات واقفة من غير طلب" icon={AlertTriangle} tone="brand" value={stalled.length} format={fmtNum} loading={L} />
      </div>

      <Panel title="طلبات مستنية رد المحل" className="mt-6" subtitle={data ? `المحل بيجيله تنبيه بعد ${fmtNum(data.thresholds.storeMin)} دقيقة، وإنت بيجيلك واتساب بعد ${fmtNum(data.thresholds.adminMin)} دقيقة (من ٩ص لـ ١١م)` : ''}>
        {L ? <Skeleton className="h-24 w-full rounded-xl" /> : !late.length ? (
          <p className="flex items-center gap-2 py-4 text-emerald-700"><CheckCircle2 className="h-5 w-5" />كل الطلبات متردّ عليها.</p>
        ) : (
          <ul className="divide-y divide-line">
            {late.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${o.level === 'urgent' ? 'text-red-600' : 'text-amber-600'}`} />
                <div className="min-w-0 flex-1"><p className="font-semibold">{o.store} <span className="font-normal text-muted">· {o.number}</span></p><p className="text-[13px] text-muted">{fmtMoney(o.total)} · مستني من {dur(o.minutes)}</p></div>
                {o.pushed && <Badge tone="info" size="sm">اتبعت للمحل تنبيه</Badge>}
                <Badge tone={o.level === 'urgent' ? 'danger' : 'warning'} size="sm">{o.level === 'urgent' ? 'عاجل' : 'متأخر'}</Badge>
                <Link to="/admin/orders" className="text-sm text-brand">الطلبات</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="توصيل واقف" className="mt-6" subtitle="جاهز من أكتر من ساعتين ومحدش استلمه، أو في الطريق من أكتر من ٦ ساعات">
        {L ? <Skeleton className="h-20 w-full rounded-xl" /> : !stuck.length ? (
          <p className="flex items-center gap-2 py-4 text-emerald-700"><CheckCircle2 className="h-5 w-5" />مفيش توصيل واقف.</p>
        ) : (
          <ul className="divide-y divide-line">
            {stuck.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                <Truck className="h-5 w-5 shrink-0 text-violet-600" />
                <p className="min-w-0 flex-1 font-semibold">{o.store} <span className="font-normal text-muted">· {o.number}</span></p>
                <span className="text-sm text-muted">{o.status === 'processing' ? 'جاهز من' : 'في الطريق من'} {dur(Math.round(o.hours * 60))}</span>
                <Link to="/admin/deliveries" className="text-sm text-brand">التوصيل</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="تجهيز المحلات" className="mt-6" subtitle="المحلات اللي لسه ما كملتش بياناتها، والأول اللي واقفة بقالها أيام من غير طلب">
        {L ? <Skeleton className="h-32 w-full rounded-xl" /> : !onb.length ? (
          <EmptyState icon={CheckCircle2} title="كل المحلات جاهزة" body="" compact />
        ) : (
          <ul className="divide-y divide-line">
            {onb.map((s) => (
              <li key={s.id} className="py-4">
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate font-semibold">{s.name}</p>
                  {s.stalled && <Badge tone="danger" size="sm">واقف {fmtNum(s.ageDays)} يوم من غير طلب</Badge>}
                  <span className="text-sm font-semibold tabular">{fmtNum(s.score)}٪</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/[0.06]"><div className="h-full rounded-full bg-brand" style={{ width: `${s.score}%` }} /></div>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {s.missing.map((m) => <span key={m.key} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800">{m.label}{m.detail ? ` (${m.detail})` : ''}</span>)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
