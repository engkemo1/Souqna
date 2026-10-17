import { useStore } from '../../lib/store.jsx';
import { exchangeLabel, exchangeSentence } from '../../lib/returns.js';
import { useI18n } from '../../lib/i18n.jsx';
import { SEASONS } from '@souqna/shared/layout';

/** شريط نصوص متحرك (ستريت وير / عروض): من إعلان المحل ومزاياه وموسمه. بيقف لو المستخدم مفضّل تقليل الحركة. */
export default function TickerStrip() {
  const { store } = useStore();
  const { lang, t } = useI18n();
  const c = store?.customization || {};
  const season = SEASONS[c.design?.season];
  const pickL = (ar, en) => (lang === 'ar' ? ar : en) || ar || en;
  const items = [
    c.announcement?.enabled ? pickL(c.announcement.text_ar, c.announcement.text_en) : '',
    season ? pickL(season.announce_ar, season.announce_en) : '',
    ...((c.trustBadges?.items || []).map((it) => pickL(it.title_ar, it.title_en))),
  ].filter(Boolean);
  const list = items.length ? items : [t('store.cod'), exchangeLabel(t, store)].filter(Boolean);
  const row = [...list, ...list, ...list, ...list];
  return (
    <div className="overflow-hidden bg-accent py-2.5 text-on-accent" aria-hidden="true">
      <div className="ticker-track flex w-max gap-10 whitespace-nowrap text-[13px] font-semibold">
        {row.map((x, i) => <span key={i} className="flex items-center gap-10">{x}<span className="opacity-60">✦</span></span>)}
      </div>
    </div>
  );
}
