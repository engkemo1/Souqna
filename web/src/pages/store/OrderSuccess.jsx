import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Copy, PhoneCall, Package, Truck, PackageSearch } from 'lucide-react';
import { trackUrl } from '../../lib/recentOrders.js';
import { useStore, sp } from '../../lib/store.jsx';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import Button from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

export default function OrderSuccess() {
  const { number } = useParams();
  const { state } = useLocation();
  const { store } = useStore();
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const [params] = useSearchParams();
  const token = params.get('t');
  const { data, error, reload } = useApi(token ? `/track/${token}` : null);
  const o = data?.order;
  const name = state?.name || o?.firstName || '';

  return (
    <div className="container max-w-2xl pt-10 sm:pt-16">
      <div className="text-center">
        <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success text-white shadow-lift">
          <motion.svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5, ease: 'easeOut' }} />
          </motion.svg>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-6 font-display text-display-sm font-bold">{t('success.title')}</motion.h1>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-3 text-base text-muted">{t('success.body', { name })}</motion.p>
      </div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-8 rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{t('success.orderNumber')}</p>
            <p className="mt-0.5 font-mono text-xl font-bold tracking-wide" dir="ltr">{number}</p>
          </div>
          <div className="flex items-center gap-2">
            {o && <StatusBadge status={o.status} t={t} />}
            <button type="button" onClick={() => { navigator.clipboard?.writeText(number); toast({ title: t('common.copied') }); }} aria-label={t('common.copy')} className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg/[0.06]"><Copy className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h2 className="mb-4 text-sm font-semibold">{t('success.whatsNext')}</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[[PhoneCall, t('success.step1')], [Package, t('success.step2')], [Truck, t('success.step3')]].map(([Icon, label], i) => (
              <li key={label} className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${i === 0 ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'}`}><Icon className="h-[18px] w-[18px]" /></span>
                <span className="text-sm">{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          {!token ? <div className="text-center text-sm text-muted"><Link className="font-semibold text-brand" to="/track">{t('track.title')}</Link></div> : error ? <ErrorState error={error} onRetry={reload} compact /> : !o ? (
            <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="flex gap-3"><Skeleton className="h-16 w-14 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>
          ) : (
            <>
              <ul className="space-y-3">
                {o.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <SmartImage media={it.image} ratio="4 / 5" sizes="56px" className="w-14 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tr(it.name)}</p><p className="text-xs text-muted">{[it.size, `× ${it.qty}`].filter(Boolean).join(' · ')}</p></div>
                    <span className="text-sm font-semibold tabular">{formatMoney(it.price * it.qty, lang)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between"><dt className="text-muted">{t('cart.subtotal')}</dt><dd className="tabular">{formatMoney(o.subtotal, lang)}</dd></div>
                {o.discount > 0 && <div className="flex justify-between text-success"><dt>{t('cart.discount')}</dt><dd className="tabular">−{formatMoney(o.discount, lang)}</dd></div>}
                <div className="flex justify-between"><dt className="text-muted">{t('cart.shipping')}</dt><dd className="tabular">{o.shipping ? formatMoney(o.shipping, lang) : t('common.free')}</dd></div>
                <div className="flex justify-between text-base font-semibold"><dt>{t('cart.total')}</dt><dd className="tabular">{formatMoney(o.total, lang)}</dd></div>
              </dl>
              <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted">{o.city} — {t(`gov.${o.governorate}`)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line p-4">
                <PackageSearch className="h-5 w-5 text-brand" />
                <p className="min-w-0 flex-1 text-sm font-semibold">{t('track.link')}</p>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(trackUrl(token)); toast({ title: t('common.copied') }); }} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold hover:bg-fg/[0.05]"><Copy className="h-3.5 w-3.5" />{t('track.copyLink')}</button>
                <Link to={`/track/${token}`} className="rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-on-primary">{t('track.open')}</Link>
              </div>
            </>
          )}
        </div>
      </motion.div>

      <div className="mt-8 flex justify-center pb-10"><Button size="lg" to={sp(store.slug, 'shop')}>{t('success.continue')}</Button></div>
    </div>
  );
}
