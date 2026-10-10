import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';

/** Hero search: type any product (كوتشي، فستان، شنطة…) and see every store's matching products with prices. */
export default function MarketSearchBar({ initial = '', autoFocus }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { list, label } = useDepartments();
  const [term, setTerm] = useState(initial);
  const go = (e) => { e.preventDefault(); const q = term.trim(); nav(q ? `/search?${new URLSearchParams({ q })}` : '/search'); };
  return (
    <div>
      <form onSubmit={go} role="search" className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus={autoFocus} enterKeyHint="search"
          placeholder={t('search.placeholder')} aria-label={t('search.placeholder')}
          className="h-14 w-full rounded-2xl border border-line-strong bg-elevated ps-12 pe-28 text-base shadow-soft outline-none transition placeholder:text-muted/80 focus:border-ring focus:shadow-ring" />
        <button type="submit" className="absolute end-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-btn px-5 text-sm font-semibold text-on-btn transition active:scale-95">{t('search.go')}</button>
      </form>
      {list.length > 0 && (
        <div className="scroll-x -mx-4 mt-3 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {list.slice(0, 9).map((d) => (
            <Link key={d.slug} to={`/search?department=${d.slug}`} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong bg-elevated px-3.5 text-sm font-medium transition hover:border-fg">{label(d.slug)}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
