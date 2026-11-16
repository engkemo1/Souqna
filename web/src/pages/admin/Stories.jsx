import { useMemo, useState } from 'react';
import { Trash2, Search } from 'lucide-react';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';
import { adminApi, useAdminApi, fmtNum } from './adminApi.js';

export default function AdminStories() {
  const toast = useToast();
  const { data, error, loading, reload } = useAdminApi('/stories');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState('');
  const stores = data?.stores || [];
  const shown = useMemo(() => stores.filter((s) => !term.trim() || `${s.name.ar} ${s.name.en} ${s.slug}`.toLowerCase().includes(term.trim().toLowerCase())), [stores, term]);
  const enabledCount = stores.filter((s) => s.enabled).length;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const call = async (key, path, body, ok) => {
    setBusy(key);
    try { await adminApi(path, { method: body === undefined ? 'DELETE' : 'PUT', body }); reload(); if (ok) toast({ title: ok }); } catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); }
    setBusy('');
  };

  return (
    <div>
      <PageHeader title="ستوري المحلات" subtitle="انت اللي بتحدد أنهي محل يقدر ينزل ستوري (صورة أو فيديو) على الصفحة الرئيسية. كله مقفول افتراضيًا، والستوري بتختفي بعد 24 ساعة."
        actions={<div className="flex gap-2">
          <button type="button" disabled={!!busy} onClick={() => call('all', '/stories/stores', { enabled: true }, 'اتفعلت لكل المحلات')} className="rounded-lg bg-fg px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-50">فعّلها للكل</button>
          <button type="button" disabled={!!busy} onClick={() => call('none', '/stories/stores', { enabled: false }, 'اتقفلت لكل المحلات')} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50">اقفلها للكل</button>
        </div>} />

      <Panel title={`المحلات (${fmtNum(enabledCount)} مفعّل من ${fmtNum(stores.length)})`}>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="دوّر على محل" className="w-full rounded-xl border border-line bg-canvas py-2.5 pe-3 ps-9 text-sm" />
        </div>
        {loading && !data ? <Skeleton className="h-48 w-full rounded-xl" /> : (
          <ul className="divide-y divide-line">
            {shown.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.name.ar}</p>
                  <p className="text-xs text-muted">{s.active ? `${fmtNum(s.active)} ستوري شغال دلوقتي` : 'مفيش ستوري شغال'}</p>
                </div>
                <button type="button" role="switch" aria-checked={s.enabled} aria-label={s.name.ar} disabled={busy === s.slug}
                  onClick={() => call(s.slug, `/stories/stores/${s.slug}`, { enabled: !s.enabled })}
                  className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50', s.enabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600')}>
                  <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', s.enabled ? 'start-[1.375rem]' : 'start-0.5')} />
                </button>
              </li>
            ))}
            {!shown.length && <li className="py-6 text-center text-sm text-muted">مفيش محلات.</li>}
          </ul>
        )}
      </Panel>

      <Panel className="mt-6" title={`الستوري الشغال دلوقتي (${fmtNum(data?.items?.length || 0)})`} subtitle="لو في محتوى مش مناسب امسحه من هنا.">
        {!data?.items?.length ? <p className="py-6 text-center text-sm text-muted">مفيش ستوري شغال.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {data.items.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                {s.kind === 'video'
                  ? <video src={s.video.src} poster={s.video.poster || undefined} preload="metadata" muted playsInline controls className="aspect-[9/16] w-full bg-black object-cover" />
                  : s.kind === 'text'
                    ? <div className="flex aspect-[9/16] w-full items-center justify-center p-3 text-center" style={{ backgroundColor: s.bg || '#1B1B1B' }}><span className="line-clamp-6 text-sm font-extrabold text-white" dir="auto">{s.caption}</span></div>
                    : <SmartImage media={s.image} ratio="9 / 16" sizes="200px" className="w-full" />}
                <div className="space-y-1 p-2">
                  <p className="truncate text-xs font-semibold">{s.store.name}</p>
                  {s.kind !== 'text' && s.caption && <p className="line-clamp-2 text-xs">{s.caption}</p>}
                  <button type="button" disabled={busy === `d${s.id}`} onClick={() => call(`d${s.id}`, `/stories/${s.id}`, undefined, 'اتمسح')} className="inline-flex items-center gap-1 text-xs text-red-600"><Trash2 className="h-3.5 w-3.5" />مسح</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
