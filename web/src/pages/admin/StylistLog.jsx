import { useState } from 'react';
import { MessageCircle, Gauge, CheckCircle2, Clock } from 'lucide-react';
import { PageHeader, Panel, KpiCard, FilterTabs } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useAdminApi, fmtNum } from './adminApi.js';

const KIND = { shop: 'نتائج منتجات', faq: 'أسئلة خدمة', advice: 'نصايح وعناية', clarify: 'أسئلة توضيح', none: 'مفيش نتيجة', fallback: 'مفهمتش', greeting: 'تحية وشكر', photo: 'صور', other: 'أخرى' };
const sec = (ms) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format((ms || 0) / 1000)} ث`;

export default function StylistLog() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAdminApi(`/stylist-log?days=${days}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;
  const kinds = Object.entries(data?.kinds || {}).sort((a, b) => b[1] - a[1]);
  const maxKind = Math.max(1, ...kinds.map(([, n]) => n));
  return (
    <div>
      <PageHeader title="أسئلة تويلا وسرعتها" subtitle="الأسئلة الحقيقية اللي العملاء كتبوها (من غير أرقام تليفونات)، واللي تويلا ملقتش لها رد، وزمن الرد"
        actions={<FilterTabs value={days} onChange={setDays} options={[{ value: 7, label: '٧ أيام' }, { value: 30, label: '٣٠ يوم' }, { value: 90, label: '٩٠ يوم' }]} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="عدد الرسايل" icon={MessageCircle} tone="brand" value={data?.total} format={fmtNum} loading={L} />
        <KpiCard label="اتجاوبت فعلًا" icon={CheckCircle2} tone="sky" value={data?.answeredRate} format={(v) => `${fmtNum(v)}٪`} loading={L} />
        <KpiCard label="متوسط زمن الرد" icon={Clock} tone="violet" value={data?.latency?.avg} format={sec} loading={L} />
        <KpiCard label="أبطأ ١٠٪ من الردود" icon={Gauge} tone="accent" value={data?.latency?.p95} format={sec} loading={L} hint={data ? `أقصى زمن ${sec(data.latency.max)}` : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="أسئلة ملقتش لها رد" subtitle="دي أهم حاجة تتضاف لتويلا: اللي اتكررت أكتر فوق">
          {L ? <Skeleton className="h-48 w-full rounded-xl" /> : !data?.lost?.length ? <p className="py-6 text-center text-sm text-muted">مفيش أسئلة من غير رد في الفترة دي.</p> : (
            <ul className="divide-y divide-line">
              {data.lost.map((x, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span dir="auto" className="min-w-0 flex-1 truncate">{x.text}</span>
                  <span className="shrink-0 text-xs text-muted">{x.kind === 'none' ? 'مفيش نتيجة' : 'مفهمتش'}</span>
                  <span className="tabular shrink-0 font-bold">{fmtNum(x.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="الردود الأبطأ" subtitle="لو الأرقام كبيرة غالبًا السبب موديل اللغة الاحتياطي">
          {L ? <Skeleton className="h-48 w-full rounded-xl" /> : !data?.slow?.length ? <p className="py-6 text-center text-sm text-muted">لسه مفيش بيانات.</p> : (
            <ul className="divide-y divide-line">
              {data.slow.map((x, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span dir="auto" className="min-w-0 flex-1 truncate">{x.text}</span>
                  <span className="shrink-0 text-xs text-muted">{KIND[x.kind] || x.kind}</span>
                  <span className="tabular shrink-0 font-bold">{sec(x.ms)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="الرسايل حسب النوع">
          {L ? <Skeleton className="h-40 w-full rounded-xl" /> : (
            <ul className="space-y-2.5">
              {kinds.map(([k, n]) => (
                <li key={k} className="text-sm">
                  <div className="flex justify-between"><span>{KIND[k] || k}</span><span className="tabular font-semibold">{fmtNum(n)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-fg/[0.06]"><div className="h-full rounded-full bg-brand" style={{ width: `${(n / maxKind) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="أكتر الأسئلة والنصايح استخدامًا">
          {L ? <Skeleton className="h-40 w-full rounded-xl" /> : !data?.top?.length ? <p className="py-6 text-center text-sm text-muted">لسه مفيش بيانات.</p> : (
            <ul className="divide-y divide-line">
              {data.top.map((x) => <li key={x.ref} className="flex justify-between gap-3 py-2 text-sm"><span dir="ltr" className="truncate text-muted">{x.ref}</span><span className="tabular font-bold">{fmtNum(x.n)}</span></li>)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
