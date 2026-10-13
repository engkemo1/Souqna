import { Link, useParams } from 'react-router-dom';
import { Sparkles, ShoppingBag, Camera } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { ErrorState } from '../../components/ui/States.jsx';

/** A look someone shared from Moda: the pieces, the total, and a way into each product. */
export default function LookShare() {
  const { token } = useParams();
  const { t, tr, lang } = useI18n();
  const { data, error, loading } = useApi(`/look-share/${token}`);
  return (
    <div className="min-h-screen bg-bg">
      <MarketHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-5">
        {loading && <Skeleton className="h-64 w-full rounded-2xl" />}
        {error && <ErrorState error={error} />}
        {data && (
          <>
            <p className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">{data.kind === 'visual' ? <Camera className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{data.kind === 'visual' ? t('look.fromVisual') : t('look.from')}</p>
            <h1 className="mt-1 text-xl font-extrabold">{data.title || (data.kind === 'visual' ? t('look.visualTitle') : t('look.title'))}</h1>
            {!data.pieces.length && <p className="mt-6 text-muted">{t('look.gone')}</p>}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.pieces.map((p) => (
                <Link key={p.id} to={`/s/${p.store.slug}/p/${p.slug}`} className="rounded-2xl border border-line bg-elevated p-2 transition hover:border-fg">
                  <SmartImage media={p.image} ratio="4 / 5" className="rounded-xl" sizes="(max-width:640px) 45vw, 220px" />
                  {p.label && <p className="mt-2 text-[11.5px] font-bold text-brand">{p.label}</p>}
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug">{tr(p.name)}</p>
                  <p className="text-[14px] font-bold text-sale">{formatMoney(p.price, lang)}</p>
                  <p className="truncate text-[11px] text-muted">{tr(p.store.name)}</p>
                </Link>
              ))}
            </div>
            {data.kind !== 'visual' && data.pieces.length > 0 && <p className="mt-4 text-[15px] font-bold">{t('stylist.total', { p: formatMoney(data.total, lang) })}</p>}
            {data.kind === 'visual'
              ? <Link to="/visual" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-btn px-5 py-2.5 text-[14px] font-bold text-on-btn"><Camera className="h-4 w-4" />{t('look.tryYours')}</Link>
              : <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('moda:open', { detail: { ask: t('look.askMore') } }))} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-btn px-5 py-2.5 text-[14px] font-bold text-on-btn"><ShoppingBag className="h-4 w-4" />{t('look.askModa')}</button>}
          </>
        )}
      </main>
    </div>
  );
}
