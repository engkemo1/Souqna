import { Link } from 'react-router-dom';
import { ArrowLeftRight, X } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useCompare } from '../../lib/compare.js';
import SmartImage from '../ui/SmartImage.jsx';

/** Sticky bar shown while 1–4 products are picked: thumbnails + a button to the side-by-side page. */
export default function CompareBar() {
  const { lang, tr } = useI18n();
  const ar = lang === 'ar';
  const { ids, remove, clear } = useCompare();
  const { data } = useApi(ids.length ? `/compare?ids=${ids.join(',')}` : null, { keepPrevious: false });
  if (!ids.length) return null;
  const byId = new Map((data?.items || []).map((p) => [p.id, p]));
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-elevated/95 px-3 py-2.5 shadow-lift backdrop-blur sm:px-4" role="region" aria-label={ar ? 'مقارنة المنتجات' : 'Compare products'}>
      <div className="container flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {ids.map((id) => {
            const p = byId.get(id);
            return (
              <span key={id} className="relative h-12 w-10 shrink-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-line sm:h-14 sm:w-12">
                {p?.image && <SmartImage media={p.image} alt={tr(p.name)} ratio="4 / 5" sizes="48px" className="h-full w-full" />}
                <button type="button" onClick={() => remove(id)} aria-label={ar ? 'شيل من المقارنة' : 'Remove'} className="absolute end-0 top-0 grid h-5 w-5 place-items-center rounded-bl-lg bg-black/60 text-white"><X className="h-3 w-3" /></button>
              </span>
            );
          })}
          <span className="hidden text-xs text-muted sm:inline">{ar ? `${ids.length} من 4` : `${ids.length} of 4`}</span>
        </div>
        <button type="button" onClick={clear} className="hidden text-xs font-semibold text-muted hover:text-fg sm:inline">{ar ? 'مسح' : 'Clear'}</button>
        <Link to={`/compare?ids=${ids.join(',')}`} aria-disabled={ids.length < 2}
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${ids.length < 2 ? 'pointer-events-none bg-secondary text-muted' : 'bg-btn text-on-btn active:scale-95'}`}>
          <ArrowLeftRight className="h-4 w-4" />{ids.length < 2 ? (ar ? 'اختار منتج تاني' : 'Pick one more') : (ar ? `قارن (${ids.length})` : `Compare (${ids.length})`)}
        </Link>
      </div>
    </div>
  );
}
