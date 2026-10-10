import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PackageSearch, Copy, Share2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { getRecentOrders, rememberOrder, trackUrl } from '../../lib/recentOrders.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import TrackView from '../../components/track/TrackView.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { ErrorState, errorMessage } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const STATUS_TONE = { pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-sky-100 text-sky-800', processing: 'bg-violet-100 text-violet-800', shipped: 'bg-sky-100 text-sky-800', delivered: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-red-100 text-red-700' };

function Shell({ children }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <MarketHeader />
      <main className="container max-w-xl pb-16 pt-6 sm:pt-10">{children}</main>
    </div>
  );
}

/** /track/<token> — private link. */
function ByToken({ token }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useApi(`/track/${token}`);
  useEffect(() => { if (data?.order) rememberOrder({ number: data.order.number, token, store: data.order.store.name }); }, [data, token]);
  const link = trackUrl(token);
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: t('track.title'), url: link }); else { await navigator.clipboard.writeText(link); toast({ title: t('common.copied') }); } } catch { /* cancelled */ }
  };
  return (
    <Shell>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{t('track.title')}</h1>
      <div className="mt-5">
        {error ? (error.status === 404
          ? <div className="rounded-3xl border border-line bg-elevated p-6 text-center"><p className="font-semibold">{t('track.notFound')}</p><Button className="mt-4" to="/track">{t('track.tryNumber')}</Button></div>
          : <ErrorState error={error} onRetry={reload} compact />)
          : !data ? <div className="space-y-4"><Skeleton className="h-72 w-full rounded-3xl" /><Skeleton className="h-48 w-full rounded-3xl" /></div>
          : (<><TrackView order={data.order} />
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line p-4 text-sm">
              <p className="text-muted">{t('track.saveLink')}</p>
              <Button size="sm" variant="outline" icon={navigator.share ? Share2 : Copy} onClick={share}>{navigator.share ? t('track.share') : t('common.copy')}</Button>
            </div></>)}
      </div>
    </Shell>
  );
}

/** /track — number + phone, plus orders remembered on this device. */
function Lookup() {
  const { t, tr } = useI18n();
  const [f, setF] = useState({ number: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState(null);
  const [recent, setRecent] = useState([]);
  useEffect(() => { setRecent(getRecentOrders()); }, []);
  // live status for the remembered orders
  const [live, setLive] = useState({});
  useEffect(() => {
    let alive = true;
    getRecentOrders().forEach((o) => api(`/track/${o.token}`).then((r) => alive && setLive((x) => ({ ...x, [o.token]: r.order.status }))).catch(() => {}));
    return () => { alive = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const { order } = await api('/track/lookup', { method: 'POST', body: { number: f.number.trim(), phone: f.phone.trim() } });
      rememberOrder({ number: order.number, token: order.token, store: order.store.name });
      setFound(order);
    } catch (x) { setErr(x.status === 404 ? t('track.notFoundPair') : errorMessage(t, x)); }
    setBusy(false);
  };

  if (found) return <Shell><button type="button" onClick={() => setFound(null)} className="mb-4 text-sm font-semibold text-brand">← {t('track.another')}</button><TrackView order={found} /></Shell>;
  return (
    <Shell>
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-brand"><PackageSearch className="h-7 w-7" /></span>
        <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{t('track.title')}</h1>
        <p className="mt-2 text-muted">{t('track.sub')}</p>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <Field label={t('success.orderNumber')}><Input dir="ltr" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="LA-10005" className="text-start" autoCapitalize="characters" required /></Field>
        <Field label={t('track.phone')}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="01XXXXXXXXX" className="text-start" required /></Field>
        {err && <p role="alert" className="text-[13px] font-medium text-sale">{err}</p>}
        <Button type="submit" size="lg" full loading={busy}>{t('track.go')}</Button>
      </form>
      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t('track.recent')}</h2>
          <ul className="space-y-2">
            {recent.map((o) => (
              <li key={o.token}>
                <Link to={`/track/${o.token}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-elevated p-4 transition hover:border-fg/30">
                  <div><p className="font-mono font-semibold" dir="ltr">{o.number}</p><p className="text-[13px] text-muted">{o.store ? tr(o.store) : ''}</p></div>
                  {live[o.token] && <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${STATUS_TONE[live[o.token]]}`}>{t(`track.s.${live[o.token]}`)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

export default function Track() {
  const { token } = useParams();
  return token ? <ByToken token={token} /> : <Lookup />;
}
