import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n.jsx';

/**
 * Honest progress for the photo search.
 *  - 0–12 %  : the real upload progress of the photo
 *  - 12–95 % : the analysis, paced by how long the last searches really took on this phone (see visualTiming), so the bar
 *              moves fast when the server is fast and never stalls at one spot; it only reaches 100 % when the answer arrives.
 */
const UPLOAD_SHARE = 12;
const CAP = 95;

export default function SearchProgress({ uploadPct = 0, analysisStart = 0, expectedMs = 6000 }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 150); return () => clearInterval(id); }, []);

  const analysing = analysisStart > 0;
  const elapsed = analysing ? Math.max(0, now - analysisStart) : 0;
  const x = elapsed / expectedMs; // 1 = "as long as usual"
  const pct = analysing
    ? Math.min(CAP, UPLOAD_SHARE + (CAP - UPLOAD_SHARE) * (1 - Math.exp(-1.6 * x)))
    : Math.min(UPLOAD_SHARE, (uploadPct / 100) * UPLOAD_SHARE);

  const stage = !analysing ? t('visual.stageUpload') : x < 0.35 ? t('visual.stageLook') : x < 0.8 ? t('visual.stageMatch') : t('visual.stageRank');
  const remaining = Math.ceil((expectedMs - elapsed) / 1000);
  const eta = !analysing ? '' : remaining > 1 ? t('visual.eta', { n: remaining }) : x < 1.8 ? t('visual.almost') : t('visual.slow');

  return (
    <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={stage}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted">
        <span className="truncate">{stage}</span>
        <span className="shrink-0 tabular-nums font-semibold text-fg">{Math.round(pct)}%{eta ? ` · ${eta}` : ''}</span>
      </div>
    </div>
  );
}
