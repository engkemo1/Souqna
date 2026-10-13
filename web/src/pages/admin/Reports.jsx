import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, Clock, MessageCircle } from 'lucide-react';
import { PageHeader, Panel, KpiCard, FilterTabs } from '../../components/dash/Kit.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useAdminApi, fmtNum, fmtMoney, waLink } from './adminApi.js';

const FLAG_AR = {
  overdue: 'فيه طلبات ما اتردش عليها بقالها أكتر من ساعتين',
  slow: 'بيتأخر في تأكيد الطلبات (أكتر من ساعة في المتوسط)',
  cancels: 'نسبة الإلغاء عالية (٢٠٪ أو أكتر)',
  quiet: 'مفيش ولا طلب في الفترة دي',
};
const mins = (m) => (m == null ? '—' : m < 60 ? `${fmtNum(m)} دقيقة` : `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(m / 60)} ساعة`);

export default function Reports() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAdminApi(`/reports/stores?days=${days}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const t = data?.totals;
  const items = data?.items || [];
  const attention = items.filter((s) => s.flags.length);
  const maxRev = Math.max(1, ...items.map((s) => s.revenue));
  return (
    <div>
      <PageHeader title="تقارير المحلات" subtitle="مين بيبيع أكتر، ومين مش بيرد، ومتوسط وقت التجهيز"
        actions={<FilterTabs value={days} onChange={setDays} options={[{ value: 7, label: '٧ أيام' }, { value: 30, label: '٣٠ يوم' }, { value: 90, label: '٩٠ يوم' }]} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="الطلبات" value={t?.orders} format={fmtNum} loading={loading && !data} />
        <KpiCard label="المبيعات" value={t?.revenue} format={fmtMoney} loading={loading && !data} />
        <KpiCard label="متوسط وقت التأكيد" value={t?.confirmMinutes ?? 0} format={mins} loading={loading && !data} />
        <KpiCard label="نسبة الإلغاء" value={t?.cancelRate} format={(v) => `${fmtNum(v)}%`} loading={loading && !data} />
      </div>

      {attention.length > 0 && (
        <Panel title={`محتاجين متابعة (${fmtNum(attention.length)})`} className="mt-6">
          <ul className="divide-y divide-line">
            {attention.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-[13px] text-muted">{s.flags.map((f) => FLAG_AR[f]).join(' · ')}</p>
                </div>
                {s.phone && <a href={waLink(s.phone, `أهلاً ${s.owner || ''}، بنراجع الأداء على بنها أوتفيت وحبينا نطمن عليك.`)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm hover:bg-fg/[0.05]"><MessageCircle className="h-4 w-4" />واتساب</a>}
                <Link to={`/admin/stores`} className="text-sm text-brand">المحلات</Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="ترتيب المحلات بالمبيعات" className="mt-6" subtitle={`آخر ${fmtNum(days)} يوم، من غير الطلبات الملغية`}>
        {loading && !data ? <Skeleton className="h-48 w-full rounded-xl" /> : !items.length ? <EmptyState icon={BarChart3} title="مفيش محلات" body="" /> : (
          <ul className="divide-y divide-line">
            {items.map((s, i) => (
              <li key={s.id} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-sm text-muted tabular">{fmtNum(i + 1)}</span>
                  <p className="min-w-0 flex-1 truncate font-semibold">{s.name}</p>
                  {s.status !== 'active' && <Badge tone="danger" size="sm">{s.status}</Badge>}
                  <span className="font-semibold tabular">{fmtMoney(s.revenue)}</span>
                </div>
                <div className="ms-9 mt-2 h-1.5 overflow-hidden rounded-full bg-fg/[0.06]"><div className="h-full rounded-full bg-brand" style={{ width: `${(s.revenue / maxRev) * 100}%` }} /></div>
                <p className="ms-9 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                  <span>{fmtNum(s.orders)} طلب</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />تأكيد: {mins(s.confirmMinutes)}</span>
                  <span>توصيل: {s.deliverHours == null ? '—' : `${fmtNum(s.deliverHours)} ساعة`}</span>
                  <span>إلغاء: {fmtNum(s.cancelRate)}٪</span>
                  {s.owed > 0 && <span>مستحق من خصومات المنصة: {fmtMoney(s.owed)}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
