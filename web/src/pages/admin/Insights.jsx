import { useState } from 'react';
import { TrendingUp, Search, Users, Award, Wallet, Zap, ShieldCheck } from 'lucide-react';
import { PageHeader, Panel, KpiCard, FilterTabs } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useAdminApi, fmtNum, fmtMoney } from './adminApi.js';
import ExportButton from './ExportButton.jsx';

const BADGE = { fast: ['سريع الرد', 'success', Zap], reliable: ['ملتزم', 'info', ShieldCheck], top_rated: ['تقييم عالي', 'violet', Award] };
const BRAND = '#F8620A';
const num1 = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(n);

function Row({ label, value, tone, strong }) {
  return <li className="flex items-center justify-between gap-3 py-2.5"><span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span><span className={`tabular ${strong ? 'text-lg font-bold' : 'font-semibold'} ${tone === 'neg' ? 'text-red-600' : tone === 'pos' ? 'text-emerald-600' : ''}`}>{value}</span></li>;
}

export default function Insights() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAdminApi(`/insights?days=${days}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;
  const rev = data?.revenue, cu = data?.customers, se = data?.search;
  const maxFunnel = Math.max(1, ...(data?.funnel || []).map((s) => s.n));
  const maxCity = Math.max(1, ...(cu?.cities || []).map((c) => c.orders));
  return (
    <div>
      <PageHeader title="تحليلات السوق" subtitle="الإيراد، رحلة الشراء، اللي الناس بتدوّر عليه، والعملاء، وترتيب المحلات"
        actions={<><FilterTabs value={days} onChange={setDays} options={[{ value: 7, label: '٧ أيام' }, { value: 30, label: '٣٠ يوم' }, { value: 90, label: '٩٠ يوم' }]} /><ExportButton kind="orders" days={days} label="تصدير الطلبات" /></>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="إجمالي المبيعات" icon={TrendingUp} tone="brand" value={rev?.gmv} format={fmtMoney} loading={L} />
        <KpiCard label="عدد الطلبات" icon={Wallet} tone="sky" value={rev?.orders} format={fmtNum} loading={L} />
        <KpiCard label="متوسط الطلب" icon={Wallet} tone="violet" value={cu?.avgOrder} format={fmtMoney} loading={L} />
        <KpiCard label="عملاء راجعين" icon={Users} tone="accent" value={cu?.repeatRate} format={(v) => `${fmtNum(v)}٪`} loading={L} hint={cu ? `${fmtNum(cu.total)} عميل في الفترة` : null} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="إيراد المنصة (تقديري)" subtitle="من أرقام الطلبات والاشتراكات المسجّلة">
          {L ? <Skeleton className="h-48 w-full rounded-xl" /> : (
            <ul className="divide-y divide-line text-[15px]">
              <Row label="رسوم التوصيل من العملاء" value={fmtMoney(rev.deliveryFees)} />
              <Row label="حصة المحلات في التوصيل" value={fmtMoney(rev.sponsors)} />
              <Row label="أجور المناديب" value={`− ${fmtMoney(rev.courierCosts)}`} tone="neg" />
              <Row label="اشتراكات المحلات المدفوعة" value={fmtMoney(rev.subscriptions)} />
              <Row label="خصومات المنصة (كوبونات)" value={`− ${fmtMoney(rev.platformDiscounts)}`} tone="neg" />
              <Row label="الصافي التقديري" value={fmtMoney(rev.net)} tone={rev.net >= 0 ? 'pos' : 'neg'} strong />
            </ul>
          )}
          {rev?.wageMissingRuns > 0 && <p className="mt-3 text-xs text-amber-700">فيه {fmtNum(rev.wageMissingRuns)} رحلة أجرها مش متسجل، فالصافي أعلى من الحقيقي. سجّل الأجر من صفحة التوصيل.</p>}
        </Panel>

        <Panel title="رحلة الشراء" subtitle="الناس بتقع فين؟">
          {L ? <Skeleton className="h-48 w-full rounded-xl" /> : (
            <ul className="space-y-4">
              {data.funnel.map((s) => (
                <li key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{s.label}</span><span className="tabular text-muted">{fmtNum(s.n)}{s.ofPrev != null && <b className="ms-2 text-fg">{fmtNum(s.ofPrev)}٪ من اللي قبله</b>}</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-fg/[0.06]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (s.n / maxFunnel) * 100)}%`, background: BRAND }} /></div>
                </li>
              ))}
              <li className="text-xs text-muted">تتبع الزيارات وصفحة الشراء بدأ من أول نشر، فالأرقام القديمة ممكن تبان ناقصة.</li>
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="الناس بتدوّر على إيه ومش بتلاقيه" className="mt-6" subtitle="كلمات بحث نتيجتها صفر، وده طلب حقيقي تقدر تقوله للمحلات يوفروه"
        action={<ExportButton kind="search-gaps" days={days} label="تصدير" />}>
        {L ? <Skeleton className="h-40 w-full rounded-xl" /> : !se.gaps.length ? <p className="py-4 text-muted">لسه مفيش كلمات بدون نتيجة.</p> : (
          <div className="grid gap-6 md:grid-cols-2">
            <ul className="divide-y divide-line">
              {se.gaps.map((g) => <li key={g.term} className="flex items-center justify-between gap-3 py-2.5"><span className="flex min-w-0 items-center gap-2"><Search className="h-4 w-4 shrink-0 text-muted" /><span className="truncate font-medium">{g.term}</span></span><Badge tone="danger" size="sm">{fmtNum(g.misses)} مرة</Badge></li>)}
            </ul>
            <div>
              <p className="mb-2 text-sm font-semibold">أكتر كلمات بتتبحث</p>
              <ul className="divide-y divide-line">{se.top.map((g) => <li key={g.term} className="flex items-center justify-between gap-3 py-2"><span className="truncate">{g.term}</span><span className="tabular text-sm text-muted">{fmtNum(g.searches)}</span></li>)}</ul>
              <p className="mt-3 text-xs text-muted">{fmtNum(se.totals.searches)} عملية بحث، منها {fmtNum(se.totals.misses)} من غير نتيجة.</p>
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="العملاء" subtitle="بيتحسبوا برقم التليفون، والسلة المقسومة على كذا محل بتتحسب شراء واحد">
          {L ? <Skeleton className="h-40 w-full rounded-xl" /> : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-fg/[0.04] p-3"><p className="text-xl font-bold tabular">{fmtNum(cu.newCustomers)}</p><p className="text-xs text-muted">عملاء جداد</p></div>
                <div className="rounded-xl bg-fg/[0.04] p-3"><p className="text-xl font-bold tabular">{fmtNum(cu.returning)}</p><p className="text-xs text-muted">راجعين</p></div>
                <div className="rounded-xl bg-fg/[0.04] p-3"><p className="text-xl font-bold tabular">{num1(cu.ordersPerCustomer)}</p><p className="text-xs text-muted">شراء لكل عميل</p></div>
              </div>
              <p className="mb-2 mt-5 text-sm font-semibold">أكتر المناطق طلباً</p>
              <ul className="space-y-2.5">
                {cu.cities.map((c) => (
                  <li key={c.city}><div className="mb-1 flex justify-between text-sm"><span>{c.city}</span><span className="tabular text-muted">{fmtNum(c.orders)}</span></div><div className="h-2 overflow-hidden rounded-full bg-fg/[0.06]"><div className="h-full rounded-full bg-brand" style={{ width: `${(c.orders / maxCity) * 100}%` }} /></div></li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="ترتيب المحلات" subtitle="درجة من ١٠٠: سرعة الرد ٤٠٪ · قلة الإلغاء ٣٥٪ · التقييم ٢٥٪" action={<ExportButton kind="stores" days={days} label="تصدير" />}>
          {L ? <Skeleton className="h-40 w-full rounded-xl" /> : (
            <ul className="divide-y divide-line">
              {data.scorecard.map((s, i) => (
                <li key={s.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-xs font-semibold tabular">{fmtNum(i + 1)}</span>
                    <p className="min-w-0 flex-1 truncate font-semibold">{s.name}</p>
                    <span className={`text-lg font-bold tabular ${s.score == null ? 'text-muted' : s.score >= 80 ? 'text-emerald-600' : s.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{s.score == null ? '—' : fmtNum(s.score)}</span>
                  </div>
                  <p className="ms-10 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    <span>{fmtNum(s.orders)} طلب</span>
                    <span>تأكيد: {s.confirmMinutes == null ? '—' : `${fmtNum(s.confirmMinutes)} د`}</span>
                    <span>إلغاء: {fmtNum(s.cancelRate)}٪</span>
                    {s.ratingCount > 0 && <span>★ {num1(s.rating)} ({fmtNum(s.ratingCount)})</span>}
                    {s.badges.map((b) => { const [label, tone, Icon] = BADGE[b]; return <Badge key={b} tone={tone} size="sm"><Icon className="h-3 w-3" />{label}</Badge>; })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
