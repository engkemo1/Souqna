import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import ModaAvatar from './ModaAvatar.jsx';
import LookSet from './LookSet.jsx';
import { cx } from '../ui/cx.js';

/** Home-page card: today's look, picked daily by the stylist from real products (one for her, one for him). */
export default function LookOfDay() {
  const { t, lang } = useI18n();
  const { data } = useApi('/look-of-day');
  const { data: feat } = useApi('/marketplace?q=&category=all&sort=featured');
  const [tab, setTab] = useState(0);
  const entries = data?.entries || [];
  if (!entries.length) return null;
  const e = entries[Math.min(tab, entries.length - 1)];
  const name = feat?.features?.stylistName?.[lang] || feat?.features?.stylistName?.ar || t('stylist.defaultName');
  const avatar = feat?.features?.stylistAvatar || null;
  const tabName = (p) => (p === 'her' ? t('lod.her') : t('lod.him'));
  return (
    <section className="container mt-12">
      <div className="overflow-hidden rounded-3xl border border-line bg-elevated p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ModaAvatar src={avatar} size={52} />
            <div>
              <h2 className="font-display text-xl font-bold leading-tight sm:text-2xl">{t('lod.title')}</h2>
              <p className="text-[13px] text-muted">{t('lod.by', { n: name })}{e.occasion ? ` · ${e.occasion}` : ''}</p>
            </div>
          </div>
          {entries.length > 1 && (
            <div className="inline-flex rounded-full bg-secondary p-1" role="tablist">
              {entries.map((x, i) => <button key={x.persona} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={cx('rounded-full px-4 py-1.5 text-sm font-semibold transition', tab === i ? 'bg-fg text-canvas' : 'text-muted')}>{tabName(x.persona)}</button>)}
            </div>
          )}
        </div>
        {e.say && <p className="mt-4 flex items-start gap-2 text-[15px] leading-relaxed"><Sparkles className="mt-1 h-4 w-4 shrink-0 text-brand" />{e.say}</p>}
        <div key={e.persona}><LookSet data={e} name={name} /></div>
      </div>
    </section>
  );
}
