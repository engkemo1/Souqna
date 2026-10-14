import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import LookStage from './LookStage.jsx';
import { cx } from '../ui/cx.js';

/** Home-page section: today's complete looks — photos, pieces, total and add-to-basket, all right here. */
export default function LookOfDay() {
  const { t, lang } = useI18n();
  const { data } = useApi('/look-of-day');
  const { data: feat } = useApi('/marketplace?q=&category=all&sort=featured');
  const [tab, setTab] = useState(0);
  const entries = data?.entries || [];
  if (!entries.length) return null;
  const i = Math.min(tab, entries.length - 1);
  const e = entries[i];
  const avatar = feat?.features?.stylistAvatar || null;
  const tabName = (entry) => `${t(`lod.audience.${entry.audience || (entry.persona === 'her' ? 'women' : 'men')}`)}${entry.age ? ` · ${entry.age}` : ''}`;
  return (
    <section className="container mt-10 sm:mt-14">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-display text-xl font-bold sm:text-2xl"><Sparkles className="h-5 w-5 text-brand" />{e.badge || t('lod.title')}</h2>
        {entries.length > 1 && (
          <div className="scrollbar-none flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-elevated p-1" role="tablist" aria-label={t('lod.title')}>
            {entries.map((x, n) => <button key={`${x.audience || x.persona || 'look'}-${x.age || ''}-${x.occasion || ''}-${n}`} type="button" role="tab" aria-selected={i === n} onClick={() => setTab(n)} className={cx('shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition sm:text-sm', i === n ? 'bg-fg text-canvas shadow-sm' : 'text-muted hover:text-fg')}>{tabName(x)}</button>)}
          </div>
        )}
      </div>
      <LookStage key={`${i}-${e.occasion || ''}`} entry={e} avatar={avatar} headingAs="h3" />
    </section>
  );
}
