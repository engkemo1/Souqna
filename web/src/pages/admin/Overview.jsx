import { Link } from 'react-router-dom';
import { Store, Banknote, Truck, Package, Clock, Camera } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PageHeader, Panel, KpiCard } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useAdminApi, fmtMoney, fmtNum, fmtDateTime, ORDER_STATUS_AR, useAdminDepartments } from './adminApi.js';

const STATUS_TONE = { pending: 'warning', confirmed: 'info', processing: 'violet', shipped: 'info', delivered: 'success', cancelled: 'danger' };
export const StatusPill = ({ s }) => <Badge tone={STATUS_TONE[s] || 'neutral'} dot>{ORDER_STATUS_AR[s] || s}</Badge>;

export default function Overview() {
  const { data, error, loading, reload } = useAdminApi('/overview', { every: 60000 });
  const depts = useAdminDepartments();
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const t = data?.totals;
  const k = (label, value, icon, tone, hint, format) => <KpiCard label={label} value={value ?? 0} icon={icon} tone={tone} hint={hint} loading={loading && !data} format={format || fmtNum} />;
  const maxDept = Math.max(1, ...(data?.departments || []).map((d) => d.count));
  return (
    <div>
      <PageHeader title="نظرة عامة" subtitle="أرقام المنصة كلها في مكان واحد" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {k('مبيعات اليوم', t?.revenueToday, Banknote, 'brand', `${fmtNum(t?.ordersToday)} طلب النهاردة`, fmtMoney)}
        {k('إجمالي المبيعات', t?.revenue, Banknote, 'neutral', `${fmtNum(t?.orders)} طلب`, fmtMoney)}
        {k('المحلات النشطة', t?.stores, Store, 'violet', t ? `${fmtNum(t.storesHidden)} مخفي · ${fmtNum(t.storesSuspended)} موقوف` : '')}
        {k('المنتجات', t?.products, Package, 'sky', t ? `${fmtNum(t.customers)} عميل` : '')}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-4">
        {k('طلبات جديدة', t?.pending, Clock, 'accent', 'مستنية تأكيد المحل')}
        {k('توصيل علينا — مفتوح', t?.deliveriesOpen, Truck, 'brand', t ? `${fmtNum(t.deliveriesReady)} جاهز للاستلام · ${fmtNum(t.deliveriesDone)} اتسلّم` : '')}
        {k('كاش معانا في الطريق', t?.cashToCollect, Banknote, 'accent', 'نحصّله من العملاء', fmtMoney)}
        <Link to="/admin/services" className="contents">{k('طلبات خدمات جديدة', t?.servicesNew, Camera, 'violet', 'الخدمات')}</Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="المبيعات — آخر 14 يوم" className="lg:col-span-2">
          <div style={{ height: 260 }} dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.series || []} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                <defs><linearGradient id="ovFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#FF5A1F" stopOpacity={0.28} /><stop offset="100%" stopColor="#FF5A1F" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="rgb(var(--c-border))" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis hide />
                <Tooltip formatter={(v, n) => [n === 'sales' ? fmtMoney(v) : fmtNum(v), n === 'sales' ? 'المبيعات' : 'الطلبات']} labelFormatter={(l) => l} />
                <Area type="monotone" dataKey="sales" stroke="#FF5A1F" strokeWidth={2.5} fill="url(#ovFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="أحسن المحلات" subtitle="آخر 14 يوم">
          {data?.topStores?.length ? (
            <ol className="space-y-3">
              {data.topStores.map((s, i) => (
                <li key={s.slug} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-sm font-bold">{fmtNum(i + 1)}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{s.name_ar}</p><p className="text-[13px] text-muted">{fmtNum(s.orders)} طلب</p></div>
                  <span className="font-semibold tabular">{fmtMoney(s.revenue)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="py-6 text-center text-sm text-muted">لسه مفيش مبيعات في الفترة دي.</p>}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="آخر الطلبات" className="lg:col-span-2" action={<Link to="/admin/orders" className="text-sm font-semibold text-brand hover:underline">كل الطلبات</Link>} bodyClassName="!px-0 !pb-2">
          <ul className="divide-y divide-line">
            {(data?.recent || []).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold"><span dir="ltr">#{o.number}</span> · {o.customer_name}</p>
                  <p className="truncate text-[13px] text-muted">{o.store_name} · {fmtDateTime(o.created_at)}{o.delivery_by === 'platform' ? ' · 🚚 توصيلنا' : ''}</p>
                </div>
                <StatusPill s={o.status} />
                <span className="w-24 text-end font-semibold tabular">{fmtMoney(o.total)}</span>
              </li>
            ))}
            {!data?.recent?.length && <li className="px-6 py-8 text-center text-sm text-muted">مفيش طلبات لسه.</li>}
          </ul>
        </Panel>

        <Panel title="الأقسام على المنصة" subtitle="عدد المحلات في كل قسم">
          <ul className="space-y-2.5">
            {(data?.departments || []).map((d) => (
              <li key={d.id}>
                <div className="mb-1 flex justify-between text-sm"><span>{depts.label(d.id)}</span><span className="font-semibold tabular">{fmtNum(d.count)}</span></div>
                <div className="h-2 rounded-full bg-fg/[0.06]"><div className="h-2 rounded-full bg-primary" style={{ width: `${(d.count / maxDept) * 100}%` }} /></div>
              </li>
            ))}
            {!data?.departments?.length && <p className="py-6 text-center text-sm text-muted">—</p>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
