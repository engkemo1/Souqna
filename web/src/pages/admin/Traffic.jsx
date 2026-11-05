import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Users, CalendarDays, Globe, RefreshCw, AlertTriangle, Store, Clock, Share2 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { PageHeader, Panel, KpiCard, FilterTabs, Delta } from '../../components/dash/Kit.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useAdminApi, fmtNum } from './adminApi.js';

const BRAND = '#F8620A';
const NAVY = '#03244D';
const SOURCE_AR = { whatsapp: 'واتساب', instagram: 'إنستجرام', facebook: 'فيسبوك', tiktok: 'تيك توك', google: 'بحث جوجل', direct: 'دخول مباشر', other: 'مصادر تانية' };
const SOURCE_COLOR = { whatsapp: '#1FA855', instagram: '#D6336C', facebook: '#2F5D9B', tiktok: '#111827', google: '#F59E0B', direct: BRAND, other: '#9CA3AF' };
const dayLabel = (d, opt = { day: 'numeric', month: 'short' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ar-EG', opt);
const hourLabel = (h) => `${new Intl.NumberFormat('ar-EG').format(h % 12 === 0 ? 12 : h % 12)}${h < 12 ? 'ص' : 'م'}`;

function Tip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-sm shadow-lift">
      <p className="mb-1 text-xs text-muted">{mode === 'hour' ? `الساعة ${hourLabel(label)}` : dayLabel(label, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 font-semibold tabular"><span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke }} />{fmtNum(p.value)} <span className="text-xs font-normal text-muted">{p.dataKey === 'uniques' ? 'زائر مختلف' : 'زيارة'}</span></p>
      ))}
    </div>
  );
}

function DailyChart({ daily }) {
  return (
    <div style={{ height: 260 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={daily} margin={{ top: 8, right: 14, left: 14, bottom: 0 }}>
          <defs>
            <linearGradient id="trFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity={0.25} /><stop offset="100%" stopColor={BRAND} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(var(--c-border))" />
          <XAxis dataKey="day" reversed tickLine={false} axisLine={false} interval={1} tick={{ fontSize: 12, fill: 'rgb(var(--c-muted))' }} tickFormatter={(d) => dayLabel(d)} dy={8} />
          <YAxis orientation="right" tickLine={false} axisLine={false} width={34} allowDecimals={false} tick={{ fontSize: 12, fill: 'rgb(var(--c-muted))' }} tickFormatter={(v) => fmtNum(v)} />
          <Tooltip content={<Tip />} cursor={{ stroke: 'rgb(var(--c-border-strong))', strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="visits" stroke={BRAND} strokeWidth={2.5} fill="url(#trFill)" dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff', fill: BRAND }} animationDuration={900} />
          <Area type="monotone" dataKey="uniques" stroke={NAVY} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 3, stroke: '#fff', fill: NAVY }} animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function HoursChart({ hours }) {
  const max = Math.max(...hours.map((h) => h.visits));
  return (
    <div style={{ height: 200 }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={hours} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--c-border))" />
          <XAxis dataKey="hour" reversed tickLine={false} axisLine={false} interval={2} tick={{ fontSize: 11, fill: 'rgb(var(--c-muted))' }} tickFormatter={hourLabel} dy={6} />
          <YAxis hide />
          <Tooltip content={<Tip mode="hour" />} cursor={{ fill: 'rgb(var(--c-text) / 0.04)' }} />
          <Bar dataKey="visits" radius={[5, 5, 2, 2]} animationDuration={800}>
            {hours.map((h) => <Cell key={h.hour} fill={max > 0 && h.visits === max ? BRAND : '#F8C9A8'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Spark({ values }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-9 items-end gap-[3px]" dir="ltr" aria-hidden>
      {values.map((v, i) => <span key={i} className="w-[7px] rounded-sm" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: i === values.length - 1 ? BRAND : '#F8C9A8', opacity: v ? 1 : 0.4 }} />)}
    </div>
  );
}

const Stat = ({ label, value, strong }) => (
  <div className="min-w-0 text-center">
    <p className={`tabular text-[17px] ${strong ? 'font-bold text-brand' : 'font-semibold'}`}>{fmtNum(value)}</p>
    <p className="text-[11px] text-muted">{label}</p>
  </div>
);

export default function Traffic() {
  const { data, error, loading, reload } = useAdminApi('/traffic', { every: 60000 });
  const [sort, setSort] = useState('week');
  const cards = data?.cards;
  const stores = useMemo(() => [...(data?.stores || [])].sort((a, b) => b[sort] - a[sort] || b.total - a.total), [data, sort]);
  const maxSource = Math.max(1, ...(data?.sources || []).map((s) => s.visits));
  const totalSource = (data?.sources || []).reduce((a, s) => a + s.visits, 0);
  const peak = data?.hours ? data.hours.reduce((m, h) => (h.visits > m.visits ? h : m), { hour: 0, visits: 0 }) : null;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;

  return (
    <div>
      <PageHeader title="الزيارات" subtitle="كام واحد دخل الموقع، وكل محل جاله كام زيارة"
        actions={<button type="button" onClick={reload} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium hover:bg-fg/[0.05]"><RefreshCw className="h-4 w-4" />تحديث</button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="النهارده" icon={Eye} tone="brand" value={cards?.today.visits} format={fmtNum} loading={L}
          delta={cards?.today.delta} hint={cards ? `${fmtNum(cards.today.uniques)} زائر مختلف · مقارنة بأمس لنفس الساعة` : null} />
        <KpiCard label="أمس" icon={CalendarDays} tone="sky" value={cards?.yesterday.visits} format={fmtNum} loading={L}
          hint={cards ? `${fmtNum(cards.yesterday.uniques)} زائر مختلف` : null} />
        <KpiCard label="آخر ٧ أيام" icon={Users} tone="violet" value={cards?.week.visits} format={fmtNum} loading={L}
          delta={cards?.week.delta} hint={cards ? `${fmtNum(cards.week.uniques)} زائر مختلف · مقارنة بالأسبوع اللي قبله` : null} />
        <KpiCard label="الإجمالي لحد دلوقتي" icon={Globe} tone="accent" value={cards?.total.visits} format={fmtNum} loading={L}
          hint={cards ? `${fmtNum(cards.total.uniques)} زائر مختلف${data?.since ? ` · من ${dayLabel(data.since, { day: 'numeric', month: 'long' })}` : ''}` : null} />
      </div>

      <Panel title="آخر ١٤ يوم" className="mt-6" subtitle="البرتقالي: عدد الزيارات · الخط الكحلي: عدد الزوار المختلفين"
        action={data && <span className="hidden text-sm text-muted sm:block">زيارة = دخول واحد للموقع، والزائر المختلف بيتحسب مرة واحدة في اليوم</span>}>
        {L ? <Skeleton className="h-[260px] w-full rounded-xl" /> : <DailyChart daily={data.daily} />}
      </Panel>

      <Panel title="كل محل وعدد زواره" className="mt-6" subtitle="زيارات صفحة المحل نفسها (دخول واحد لكل جلسة)"
        action={<FilterTabs value={sort} onChange={setSort} options={[{ value: 'today', label: 'النهارده' }, { value: 'week', label: '٧ أيام' }, { value: 'total', label: 'الإجمالي' }]} />}>
        {L ? <Skeleton className="h-48 w-full rounded-xl" /> : !stores.length ? <EmptyState icon={Store} title="مفيش محلات" body="" /> : (
          <ul className="divide-y divide-line">
            {stores.map((s, i) => (
              <li key={s.id} className="py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-sm font-semibold tabular">{fmtNum(i + 1)}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/s/${s.slug}`} target="_blank" className="block truncate font-semibold hover:text-brand">{s.name}</Link>
                    {s.status !== 'active' && <span className="text-xs text-red-600">{s.status}</span>}
                  </div>
                  <Delta value={s.change} />
                  <Spark values={s.spark} />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-fg/[0.035] px-2 py-2.5">
                  <Stat label="النهارده" value={s.today} strong />
                  <Stat label="أمس" value={s.yesterday} />
                  <Stat label="٧ أيام" value={s.week} />
                  <Stat label="الإجمالي" value={s.total} />
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                  <span>آخر ٧ أيام:</span><span className="font-medium text-fg">{fmtNum(s.week)} زيارة</span><span>←</span>
                  <span className="font-medium text-fg">{fmtNum(s.productViews)} مشاهدة منتج</span><span>←</span>
                  <span className="font-medium text-fg">{fmtNum(s.orders)} طلب</span>
                  {s.conversion != null && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-brand">تحويل {new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(s.conversion)}٪</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="الناس جايه منين؟" subtitle="آخر ٧ أيام" action={<Share2 className="h-5 w-5 text-muted" />}>
          {L ? <Skeleton className="h-48 w-full rounded-xl" /> : !totalSource ? <p className="py-6 text-center text-muted">لسه مفيش بيانات كفاية</p> : (
            <ul className="space-y-3">
              {data.sources.map((s) => (
                <li key={s.source}>
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{SOURCE_AR[s.source] || s.source}</span><span className="tabular text-muted">{fmtNum(s.visits)} · {fmtNum((s.visits / totalSource) * 100)}٪</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-fg/[0.06]"><div className="h-full rounded-full" style={{ width: `${(s.visits / maxSource) * 100}%`, background: SOURCE_COLOR[s.source] || BRAND }} /></div>
                </li>
              ))}
              <li className="pt-1 text-xs text-muted">عشان المصدر يبان صح، حط <b dir="ltr">?src=whatsapp</b> أو <b dir="ltr">?src=instagram</b> آخر اللينك في الإعلانات والرسايل.</li>
            </ul>
          )}
        </Panel>

        <Panel title="أوقات الذروة" subtitle="مجموع آخر ٧ أيام بتوقيت القاهرة" action={<Clock className="h-5 w-5 text-muted" />}>
          {L ? <Skeleton className="h-48 w-full rounded-xl" /> : (
            <>
              <HoursChart hours={data.hours} />
              {peak?.visits > 0 && <p className="mt-3 text-sm text-muted">أكتر وقت فيه زوار: <b className="text-fg">الساعة {hourLabel(peak.hour)}</b> — ده أنسب وقت تنزل فيه إعلان أو عرض.</p>}
            </>
          )}
        </Panel>
      </div>

      {data?.quiet?.length > 0 && (
        <Panel title={`محلات محتاجة اهتمام (${fmtNum(data.quiet.length)})`} className="mt-6" subtitle="مفيش زيارات الأسبوع ده، أو الزيارات وقعت للنص أو أقل">
          <ul className="divide-y divide-line">
            {data.quiet.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <p className="min-w-0 flex-1 font-semibold">{s.name}</p>
                <span className="text-[13px] text-muted">{s.reason === 'none' ? 'مفيش ولا زيارة آخر ٧ أيام' : `${fmtNum(s.week)} زيارة بعد ما كانت ${fmtNum(s.prevWeek)}`}</span>
                <Link to="/admin/reports" className="text-sm text-brand">التقارير</Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {data?.since && <p className="mt-6 text-center text-xs text-muted">تتبع زيارات الموقع بدأ من {dayLabel(data.since, { day: 'numeric', month: 'long', year: 'numeric' })}. زيارات المحلات الأقدم محفوظة في أرقام كل محل.</p>}
    </div>
  );
}
