import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { PageHeader, Panel, SearchInput } from '../../components/dash/Kit.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useAdminApi, fmtDateTime } from './adminApi.js';

const METHOD = { POST: ['إضافة', 'success'], PUT: ['تعديل', 'info'], PATCH: ['تعديل', 'info'], DELETE: ['مسح', 'danger'] };

export default function AuditLog() {
  const { data, error, loading, reload } = useAdminApi('/audit?limit=500');
  const [text, setText] = useState('');
  const items = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (data?.items || []).filter((i) => !t || i.path.toLowerCase().includes(t) || (i.fields || '').toLowerCase().includes(t));
  }, [data, text]);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="سجل الحركات" subtitle="كل تعديل اتعمل من لوحة الأدمن: إمتى، وإيه، ونجح ولا لأ" />
      <SearchInput value={text} onChange={setText} placeholder="دوّر في المسار أو اسم الحقل…" className="mb-4" />
      <Panel bodyClassName="!p-0">
        {loading && !data ? <div className="p-5"><Skeleton className="h-48 w-full rounded-xl" /></div> : !items.length ? <EmptyState icon={History} title="مفيش حركات" body="أي تعديل هتعمله من الأدمن هيظهر هنا." compact /> : (
          <ul className="divide-y divide-line">
            {items.map((i) => {
              const [label, tone] = METHOD[i.method] || [i.method, 'neutral'];
              const ok = i.status < 400;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                  <Badge tone={tone} size="sm">{label}</Badge>
                  <span className="min-w-0 flex-1 break-all font-mono text-[13px]" dir="ltr">{i.path}</span>
                  {!ok && <Badge tone="danger" size="sm">فشل {i.status}</Badge>}
                  <span className="text-xs text-muted">{fmtDateTime(i.at)}</span>
                  {i.fields && <span className="w-full text-xs text-muted" dir="ltr">fields: {i.fields}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <p className="mt-3 text-center text-xs text-muted">بيتسجل اسم الحقل بس، مش القيمة. بيتحفظ ١٢٠ يوم.</p>
    </div>
  );
}
