import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { cx } from '../ui/cx.js';

/** "تقرير الأسبوع": numbers from the database + short, concrete advice (AI-written when Twila's provider is on). */
export default function WeeklyReportCard({ className }) {
  const { t, lang } = useI18n();
  const { data, loading } = useApi('/owner/report/weekly');
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false);
  const rep = fresh || data;
  if (loading && !rep) return null;
  if (!rep) return null;
  const f = rep.facts;
  const refresh = async () => { setBusy(true); try { setFresh(await api('/owner/report/weekly?refresh=1')); } catch { /* keep old */ } setBusy(false); };
  return (
    <section className={cx('rounded-2xl border border-line bg-elevated p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5 text-brand" />{t('report.title')}{rep.ai && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">AI</span>}</h2>
        <button type="button" onClick={refresh} disabled={busy} aria-label={t('report.refresh')} className="grid h-8 w-8 place-items-center rounded-full border border-line-strong text-muted hover:text-fg"><RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} /></button>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed">{rep.summary}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[[t('report.orders'), f.orders], [t('report.sales'), formatMoney(f.sales, lang)], [t('report.reviews'), f.newReviews ? `${f.newReviews} (${f.avgRating}★)` : '0']].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-secondary px-2 py-2"><p className="text-[11px] text-muted">{k}</p><p className="text-[14px] font-bold">{v}</p></div>
        ))}
      </div>
      {rep.tips?.length > 0 && <ul className="mt-3 space-y-1.5">{rep.tips.map((x, i) => <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed"><span className="text-brand">•</span><span>{x}</span></li>)}</ul>}
    </section>
  );
}
