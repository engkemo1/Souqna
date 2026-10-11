import { Link } from 'react-router-dom';
import { PackagePlus, ArrowLeft } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/** "Not in Banha? We get it for you" — home page strip and empty-search prompt. */
export default function RequestBanner({ title, className = '', query }) {
  const { t, isRtl } = useI18n();
  return (
    <section className={`container ${className}`}>
      <Link to={query ? `/request?title=${encodeURIComponent(query)}&from=search` : '/request'} className="flex items-center gap-4 rounded-3xl border border-line bg-gradient-to-br from-secondary to-elevated p-5 transition hover:border-fg/30 sm:p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-on-primary"><PackagePlus className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><p className="font-display text-lg font-bold">{title || t('req.banner.title')}</p><p className="mt-0.5 text-sm text-muted">{t('req.banner.body')}</p></div>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand sm:inline-flex">{t('req.banner.cta')}<ArrowLeft className={`h-4 w-4 ${isRtl ? '' : 'rotate-180'}`} /></span>
      </Link>
    </section>
  );
}
