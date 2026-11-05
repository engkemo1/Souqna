import { Flame, FileText, PackageX, RefreshCw, CheckCircle2 } from 'lucide-react';
import { PageHeader, Panel, KpiCard } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { useAdminApi, fmtNum } from './adminApi.js';
import ExportButton from './ExportButton.jsx';

export default function Growth() {
  const { data, error, loading, reload } = useAdminApi('/growth', { every: 120000 });
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const L = loading && !data;
  const trending = data?.trending || [], seo = data?.seo || [], oos = data?.outOfStock || [], weak = data?.weakStores || [];
  return (
    <div>
      <PageHeader title="النمو وصحة الكتالوج" subtitle="منتجات بتشدّ زيارات، ومحلات محتاجة تكمّل بيانات منتجاتها"
        actions={<button type="button" onClick={reload} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium hover:bg-fg/[0.05]"><RefreshCw className="h-4 w-4" />تحديث</button>} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="منتجات صاعدة" icon={Flame} tone="accent" value={trending.length} format={fmtNum} loading={L} />
        <KpiCard label="محلات ناقصة وصف/SEO" icon={FileText} tone="sky" value={seo.length} format={fmtNum} loading={L} />
        <KpiCard label="محلات فيها منتج خلص" icon={PackageX} tone="violet" value={oos.length} format={fmtNum} loading={L} />
      </div>

      <Panel title="منتجات الأسبوع الأكتر مشاهدة" className="mt-6" subtitle="آخر ٧ أيام مقابل الأسبوع اللي قبله (٥ مشاهدات أو أكتر)">
        {L ? <Skeleton className="h-24 w-full rounded-xl" /> : !trending.length ? <p className="py-4 text-muted">لسه مفيش بيانات كفاية.</p> : (
          <ul className="divide-y divide-line">
            {trending.map((p) => (
              <li key={`${p.storeSlug}/${p.slug}`} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name}</p><p className="text-[13px] text-muted">{p.store}</p></div>
                {p.lowStock && <Badge tone="warning" size="sm">المخزون قليل</Badge>}
                {p.growth != null && <Badge tone={p.growth >= 0 ? 'success' : 'danger'} size="sm">{p.growth >= 0 ? '↑' : '↓'} {fmtNum(Math.abs(p.growth))}٪</Badge>}
                <span className="w-20 text-end text-sm font-semibold tabular-nums">{fmtNum(p.views)} مشاهدة</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="محلات منتجاتها ناقصة بيانات" className="mt-6" subtitle="الوصف و عنوان/وصف البحث بيفرقوا في ظهور المنتج على جوجل">
        {L ? <Skeleton className="h-24 w-full rounded-xl" /> : !seo.length ? (
          <p className="flex items-center gap-2 py-4 text-emerald-700"><CheckCircle2 className="h-5 w-5" />كل المنتجات مكتملة.</p>
        ) : (
          <ul className="divide-y divide-line">
            {seo.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <p className="min-w-0 flex-1 font-semibold">{s.name}</p>
                <span className="text-sm text-muted">{fmtNum(s.noDesc)} من {fmtNum(s.products)} من غير وصف</span>
                <span className="text-sm text-muted">{fmtNum(s.noSeo)} من غير SEO</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="شرائح العملاء" className="mt-6" subtitle="للكوبونات والعروض. الملفات فيها أسماء وأرقام عملاء، استخدمها بحذر وللعملاء اللي وافقوا على استلام رسائل بس">
        {L ? <Skeleton className="h-16 w-full rounded-xl" /> : (
          <ul className="divide-y divide-line">
            <li className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="font-semibold">عملاء كرروا الشراء</p><p className="text-[13px] text-muted">{fmtNum(data?.segments?.repeat || 0)} من {fmtNum(data?.segments?.customers || 0)} عميل</p></div><ExportButton kind="segment-repeat" label="تصدير" /></li>
            <li className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="font-semibold">عملاء بطّلوا يشتروا (٣٠ يوم+)</p><p className="text-[13px] text-muted">{fmtNum(data?.segments?.lapsed || 0)} عميل</p></div><ExportButton kind="segment-lapsed" label="تصدير" /></li>
          </ul>
        )}
      </Panel>

      <Panel title="محلات تقييمها منخفض" className="mt-6" subtitle="محلات ليها ٣ تقييمات أو أكتر، الأضعف أولاً. الأرقام بتساعدك تتواصل مع صاحب المحل قبل ما العملاء يبعدوا">
        {L ? <Skeleton className="h-16 w-full rounded-xl" /> : !weak.length ? (
          <p className="py-4 text-muted">لسه مفيش محلات عندها تقييمات كفاية.</p>
        ) : (
          <ul className="divide-y divide-line">
            {weak.map((s) => (<li key={s.id} className="flex items-center gap-3 py-3"><p className="min-w-0 flex-1 font-semibold">{s.name}</p><span className="text-sm tabular">{Number(s.rating).toFixed(1)} ★</span><span className="text-sm text-muted">{fmtNum(s.ratingCount)} تقييم</span>{s.low30 > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{fmtNum(s.low30)} سلبي آخر ٣٠ يوم</span>}</li>))}
          </ul>
        )}
      </Panel>

      <Panel title="منتجات خلصت" className="mt-6" subtitle="المحل بيجيله تنبيه مرة في اليوم">
        {L ? <Skeleton className="h-16 w-full rounded-xl" /> : !oos.length ? (
          <p className="flex items-center gap-2 py-4 text-emerald-700"><CheckCircle2 className="h-5 w-5" />مفيش منتج خالص.</p>
        ) : (
          <ul className="divide-y divide-line">
            {oos.map((s) => (<li key={s.id} className="flex items-center gap-3 py-3"><p className="min-w-0 flex-1 font-semibold">{s.name}</p><span className="text-sm text-muted">{fmtNum(s.n)} منتج</span></li>))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
