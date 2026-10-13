import { ArrowLeft, Camera } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/** Upload an outfit photo and let the stylist find the closest real products in Banha stores. */
export default function WearThis({ className = '' }) {
  const { t } = useI18n();
  return (
    <section className={className}>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('moda:open', { detail: { photo: true, similar: true } }))}
        className="group relative flex h-full min-h-[190px] w-full flex-col overflow-hidden rounded-3xl border border-brand/25 bg-gradient-to-br from-brand/[0.08] via-elevated to-elevated p-5 text-start shadow-[0_8px_24px_rgba(20,33,61,.04)] transition hover:border-brand/50 hover:shadow-[0_12px_30px_rgba(20,33,61,.09)] sm:p-6">
        <span className="pointer-events-none absolute -end-8 -top-10 h-36 w-36 rounded-full bg-brand/[0.08] transition group-hover:scale-110" />
        <span className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-sm"><Camera className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block font-display text-base font-bold leading-snug sm:text-lg">{t('wear.title')}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted sm:text-[13px]">{t('wear.sub')}</span>
          </span>
        </span>
        <span className="relative mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-btn px-4 py-2.5 text-xs font-bold text-on-btn transition group-hover:brightness-95 sm:text-[13px]">{t('wear.cta')}<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></span>
      </button>
    </section>
  );
}
