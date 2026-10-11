import { ArrowLeft, Camera } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';

/** Upload an outfit photo and let the stylist find the closest real products in Banha stores. */
export default function WearThis({ className = '' }) {
  const { t } = useI18n();
  return (
    <section className={className}>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('moda:open', { detail: { photo: true, similar: true } }))}
        className="group relative flex h-full min-h-[190px] w-full flex-col justify-between overflow-hidden rounded-3xl border border-brand/25 bg-gradient-to-br from-brand/10 via-elevated to-elevated p-5 text-start transition hover:border-brand/60 hover:shadow-sm sm:p-6">
        <span className="pointer-events-none absolute -end-8 -top-10 h-36 w-36 rounded-full bg-brand/10 transition group-hover:scale-110" />
        <span className="relative flex w-full items-start justify-between gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-sm"><Camera className="h-6 w-6" /></span>
          <span className="inline-flex items-center gap-2 rounded-full bg-btn px-4 py-2 text-[12px] font-bold text-on-btn transition group-hover:translate-x-[-2px] sm:text-[13px]">{t('wear.cta')}<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></span>
        </span>
        <span className="relative mt-5 block">
          <span className="block font-display text-lg font-bold sm:text-xl">{t('wear.title')}</span>
          <span className="mt-1 block max-w-xl text-[13px] leading-relaxed text-muted sm:text-sm">{t('wear.sub')}</span>
        </span>
      </button>
    </section>
  );
}
