import { Camera } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { familyLabel } from '../../lib/visualLabels.js';
import { cx } from '../ui/cx.js';

/** "الناس بتدوّر على إيه؟": pieces customers photographed in visual search that nobody in Banha could match. */
export default function DemandCard({ className }) {
  const { t, lang } = useI18n();
  const { data } = useApi('/owner/visual-demand');
  const items = data?.enabled === false ? [] : (data?.items || []);
  if (!items.length) return null;
  return (
    <section className={cx('rounded-2xl border border-line bg-elevated p-5', className)}>
      <h2 className="flex items-center gap-2 font-semibold"><Camera className="h-5 w-5 text-brand" />{t('demand.title')}</h2>
      <p className="mt-1 text-[13px] text-muted">{t('demand.sub', { n: data.totals?.people || 0 })}</p>
      <ul className="mt-3 divide-y divide-line">
        {items.map((x) => (
          <li key={`${x.family}-${x.color}`} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold">{familyLabel(x.family, x.label, lang)}{x.colorLabel ? ` · ${x.colorLabel[lang === 'ar' ? 'ar' : 'en']}` : ''}</p>
              <p className="text-[12px] text-muted">{t('demand.people', { n: x.people })}</p>
            </div>
            <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold', x.have ? 'bg-secondary text-muted' : 'bg-brand/10 text-brand')}>{x.have ? t('demand.have', { n: x.have }) : t('demand.none')}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{t('demand.tip')}</p>
    </section>
  );
}
