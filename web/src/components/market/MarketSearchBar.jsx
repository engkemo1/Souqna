import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Camera } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';
import SuggestInput, { saveRecent } from './SuggestInput.jsx';

/** Hero search: type any product (كوتشي، فستان، شنطة…) and see every store's matching products with prices. */
export default function MarketSearchBar({ initial = '', autoFocus, chips = true }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { list, label } = useDepartments();
  const [term, setTerm] = useState(initial);
  const go = (e) => { e.preventDefault(); const q = term.trim(); saveRecent(q); nav(q ? `/search?${new URLSearchParams({ q })}` : '/search'); };
  return (
    <div>
      <form onSubmit={go} role="search" className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <SuggestInput value={term} onChange={setTerm} inputProps={{ autoFocus, enterKeyHint: 'search', placeholder: t('search.placeholder'), 'aria-label': t('search.placeholder') }}
          className="h-14 w-full rounded-2xl border border-line-strong bg-elevated ps-12 pe-28 text-base shadow-soft outline-none transition placeholder:text-muted/80 focus:border-ring focus:shadow-ring" />
        <button type="submit" className="absolute end-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-btn px-5 text-sm font-semibold text-white transition active:scale-95">{t('search.go')}</button>
      </form>
      {chips && (
        <Link to="/visual" className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-bold text-brand transition hover:brightness-95 active:scale-95">
          <Camera className="h-[18px] w-[18px]" />{t('visual.cta')}
        </Link>
      )}
      {chips && list.length > 0 && (
        <div className="scroll-x -mx-4 mt-3 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {list.slice(0, 9).map((d) => (
            <Link key={d.slug} to={`/search?department=${d.slug}`} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong bg-elevated px-3.5 text-sm font-medium transition hover:border-fg">{label(d.slug)}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
