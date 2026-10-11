import { Camera } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';

/** "البس زي ده": upload a photo of an outfit you saw online and the stylist finds the closest pieces in Banha stores. */
export default function WearThis() {
  const { t } = useI18n();
  const { data: feat } = useApi('/marketplace?q=&category=all&sort=featured');
  if (!feat || feat.features?.stylist === false) return null;
  return (
    <section className="container mt-10">
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('moda:open', { detail: { photo: true, similar: true } }))}
        className="flex w-full items-center gap-4 rounded-3xl border border-brand/30 bg-gradient-to-l from-brand/10 to-transparent p-5 text-start transition hover:border-brand sm:p-6">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand text-white"><Camera className="h-7 w-7" /></span>
        <span className="min-w-0 flex-1"><span className="block font-display text-lg font-bold sm:text-xl">{t('wear.title')}</span><span className="mt-0.5 block text-[13.5px] text-muted sm:text-sm">{t('wear.sub')}</span></span>
        <span className="hidden shrink-0 rounded-full bg-btn px-5 py-2.5 text-sm font-bold text-on-btn sm:inline-block">{t('wear.cta')}</span>
      </button>
    </section>
  );
}
