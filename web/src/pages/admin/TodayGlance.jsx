import { Link } from 'react-router-dom';
import { Eye, ShoppingBag, Clock, Truck, Wallet } from 'lucide-react';
import { Delta } from '../../components/dash/Kit.jsx';
import { useAdminApi, fmtNum, fmtMoney } from './adminApi.js';

function Chip({ to, icon: Icon, label, value, sub, tone }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-elevated p-3.5 transition hover:border-line-strong">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block truncate text-[13px] text-muted">{label}</span><span className="block truncate text-lg font-bold tabular">{value}</span>{sub}</span>
    </Link>
  );
}

/** One-line "today" strip for the top of the admin home. Silent if the endpoint fails, so it can never break the page. */
export default function TodayGlance() {
  const { data } = useAdminApi('/today', { every: 60000 });
  if (!data) return null;
  const warn = data.late > 0 || data.stuck > 0;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Chip to="/admin/traffic" icon={Eye} label="زيارات النهارده" value={fmtNum(data.visits.today)} tone="bg-secondary text-brand"
        sub={<span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">{fmtNum(data.visits.uniques)} زائر{data.visits.delta != null && <Delta value={data.visits.delta} />}</span>} />
      <Chip to="/admin/orders" icon={ShoppingBag} label="طلبات النهارده" value={fmtNum(data.orders.count)} tone="bg-sky-50 text-sky-700" sub={<span className="block truncate text-xs text-muted">{fmtMoney(data.orders.gmv)}</span>} />
      <Chip to="/admin/alerts" icon={warn ? Clock : Truck} label="محتاج متابعة" value={fmtNum(data.late + data.stuck)} tone={warn ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
        sub={<span className="block truncate text-xs text-muted">{warn ? `${fmtNum(data.late)} طلب متأخر · ${fmtNum(data.stuck)} توصيل واقف` : 'كله ماشي تمام'}</span>} />
      <Chip to="/admin/couriers" icon={Wallet} label="فلوس عند المناديب" value={fmtMoney(data.couriersOwed)} tone="bg-orange-50 text-orange-700"
        sub={data.couriersDue > 0 ? <span className="block truncate text-xs text-muted">ليهم {fmtMoney(data.couriersDue)} عندنا</span> : null} />
    </div>
  );
}
