import { useState } from 'react';
import { Star, EyeOff, Eye } from 'lucide-react';
import { useApi, invalidate } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { Stars } from '../../components/store/ReviewsSection.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PageTransition from '../../components/PageTransition.jsx';
import { pickSrc } from '../../lib/image.js';

export default function Reviews() {
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useApi('/owner/reviews');
  const [busy, setBusy] = useState(0);
  const toggle = async (r) => {
    setBusy(r.id);
    try { await api(`/owner/reviews/${r.id}`, { method: 'PATCH', body: { status: r.status === 'published' ? 'hidden' : 'published' } }); invalidate('/owner/reviews'); reload(); }
    catch { toast({ tone: 'error', title: t('error.body') }); }
    setBusy(0);
  };
  return (
    <PageTransition>
      <PageHeader title={t('dash.reviews')} subtitle={t('rev.ctaSub')} />
      {error && !data ? <ErrorState error={error} onRetry={reload} /> : !data ? <Skeleton className="h-48 w-full rounded-2xl" /> : !data.items.length ? <EmptyState icon={Star} title={t('dash.reviews')} body={t('rev.empty')} /> : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id}><Panel>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2"><Stars value={r.rating} /><span className="font-semibold">{r.name}</span><span className="text-sm text-muted">· {tr(r.product.name)}</span>{r.status === 'hidden' && <Badge tone="neutral">{t('rev.dash.hidden')}</Badge>}</div>
                <Button size="xs" variant="outline" icon={r.status === 'published' ? EyeOff : Eye} loading={busy === r.id} onClick={() => toggle(r)}>{r.status === 'published' ? t('rev.dash.hide') : t('rev.dash.show')}</Button>
              </div>
              {r.comment && <p className="mt-2 whitespace-pre-line text-[15px]">{r.comment}</p>}
              {r.photos.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{r.photos.map((p) => <a key={p.id} href={pickSrc(p, 900, 'jpg')} target="_blank" rel="noreferrer" className="block w-20 overflow-hidden rounded-xl"><SmartImage media={p} ratio="1 / 1" sizes="80px" /></a>)}</div>}
            </Panel></li>
          ))}
        </ul>
      )}
    </PageTransition>
  );
}
