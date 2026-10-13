import { useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import ModaAvatar from './ModaAvatar.jsx';
import LookSet from './LookSet.jsx';
import { cx } from '../ui/cx.js';

/** Home-page card: today's complete looks for different audiences and ages. */
export default function LookOfDay() {
  const { t, lang, assistantName: name } = useI18n();
  const { data } = useApi('/look-of-day');
  const { data: feat } = useApi('/marketplace?q=&category=all&sort=featured');
  const [tab, setTab] = useState(0);
  const entries = data?.entries || [];
  if (!entries.length) return null;
  const e = entries[Math.min(tab, entries.length - 1)];
  const avatar = feat?.features?.stylistAvatar || null;
  const tabName = (entry) => `${t(`lod.audience.${entry.audience || (entry.persona === 'her' ? 'women' : 'men')}`)}${entry.age ? ` · ${entry.age}` : ''}`;
  return (
    <section className="container mt-10 sm:mt-14">
      <div className="overflow-hidden rounded-[28px] border border-brand/20 bg-elevated shadow-sm">
        <div className="bg-gradient-to-l from-brand/10 via-secondary/50 to-elevated p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <ModaAvatar src={avatar} size={56} />
              <div className="min-w-0">
                <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-elevated/80 px-2.5 py-1 text-[11px] font-semibold text-brand">
                  <Sparkles className="h-3.5 w-3.5" />{e.badge || t('lod.todayTag')}
                </div>
                <h2 className="font-display text-xl font-bold leading-tight sm:text-2xl">{e.title || t('lod.title')}</h2>
                <p className="mt-1 text-[12px] text-muted sm:text-[13px]">{tabName(e)}{e.occasion ? ' · ' + e.occasion : ''} · {t('lod.by', { n: name })}</p>
                {e.description && <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted sm:text-[13px]">{e.description}</p>}
              </div>
            </div>
            {entries.length > 1 && (
              <div className="flex max-w-full flex-wrap justify-end gap-1 rounded-2xl border border-line bg-elevated/80 p-1" role="tablist" aria-label={t('lod.title')}>
                {entries.map((x, i) => <button key={`${x.audience || x.persona || 'look'}-${x.age || ''}-${x.occasion || ''}-${i}`} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={cx('max-w-full rounded-full px-3 py-2 text-xs font-semibold transition sm:text-sm', tab === i ? 'bg-fg text-canvas shadow-sm' : 'text-muted hover:text-fg')}>{tabName(x)}</button>)}
              </div>
            )}
          </div>
        </div>
        <div className="px-4 pb-5 sm:px-6 sm:pb-7">
          {e.say && <p className="flex items-start gap-2 rounded-2xl border border-brand/15 bg-brand/5 px-4 py-3 text-[14px] leading-relaxed sm:text-[15px]"><Sparkles className="mt-1 h-4 w-4 shrink-0 text-brand" />{e.say}</p>}
          <div key={`${e.audience || e.persona || 'look'}-${e.age || ''}-${e.occasion || ''}-${tab}`}><LookSet data={e} name={name} /></div>
          <Link to={`/look-of-day/${tab}`} className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand/40 px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand hover:text-white"><span>{lang === 'ar' ? 'شوف صفحة اللوك كاملة' : 'View the full look'}</span><ArrowLeft className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  );
}
