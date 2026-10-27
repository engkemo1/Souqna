import { useState } from 'react';
import { Camera, Eye } from 'lucide-react';
import { PageHeader } from '../../components/dash/Kit.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { cx } from '../../components/ui/cx.js';
import { useAdminApi, fmtDateTime } from './adminApi.js';

const level = (q) => (q == null ? null : q >= 75 ? ['ممتازة', 'bg-emerald-500 text-white'] : q >= 50 ? ['كويسة', 'bg-amber-400 text-neutral-900'] : ['ضعيفة', 'bg-red-500 text-white']);

function Card({ it }) {
  const [orig, setOrig] = useState(false);
  const lv = level(it.quality);
  return (
    <li className="rounded-2xl border border-line bg-elevated p-2.5">
      <div className="relative overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        {orig
          ? <div className="relative aspect-[4/5] bg-neutral-100"><img src={`${it.media.base}/source.jpg`} alt="" className="absolute inset-0 h-full w-full object-contain" loading="lazy" /></div>
          : <SmartImage media={it.media} ratio="4 / 5" sizes="200px" />}
        {lv && <span className={cx('absolute bottom-1.5 end-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm', lv[1])}>{lv[0]} {it.quality}</span>}
      </div>
      <p className="mt-2 truncate text-[13px] font-semibold">{it.store.name}</p>
      <p className="truncate text-xs text-muted">{it.product?.name || 'صورة من غير منتج'}</p>
      <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-muted">
        <span>{fmtDateTime(it.createdAt)}</span>
        {it.quality != null && <button type="button" onClick={() => setOrig((v) => !v)} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 font-semibold hover:bg-fg/[0.05]"><Eye className="h-3.5 w-3.5" />{orig ? 'بعد التحسين' : 'الأصلية'}</button>}
      </div>
    </li>
  );
}

export default function Photos() {
  const [weak, setWeak] = useState(false);
  const { data, error, loading, reload } = useAdminApi(`/photos${weak ? '?weak=1' : ''}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="أحدث الصور" subtitle={`آخر 60 صورة منتجات مع درجة جودتها${data ? ` · إجمالي ${data.total} صورة، منها ${data.weak} ضعيفة` : ''}. الصور القديمة من غير درجة.`} />
      <div className="mb-4 flex gap-2">
        {[[false, 'الكل'], [true, 'الضعيفة بس']].map(([v, label]) => (
          <button key={String(v)} type="button" onClick={() => setWeak(v)} aria-pressed={weak === v} className={cx('rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition', weak === v ? 'bg-fg text-bg ring-fg' : 'ring-line hover:bg-fg/[0.04]')}>{label}</button>
        ))}
      </div>
      {loading && !data ? <Skeleton className="h-48 w-full rounded-2xl" /> : !data?.items.length ? <EmptyState icon={Camera} title="مفيش صور هنا" body="الصور الجديدة هتظهر هنا مع درجة جودتها." /> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{data.items.map((it) => <Card key={it.id} it={it} />)}</ul>
      )}
    </div>
  );
}
