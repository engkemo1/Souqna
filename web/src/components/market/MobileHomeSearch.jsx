import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Camera } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';
import SuggestInput, { saveRecent } from './SuggestInput.jsx';

/**
 * Mobile-only search for the home page: a big, thumb-friendly field right under the heading, a camera button inside it
 * (search by photo), and one-tap section chips. When the field scrolls out of view a slim copy sticks under the header.
 * Hidden from the `sm` breakpoint up, where the hero card already has its own search.
 */
export default function MobileHomeSearch() {
  const { lang, t } = useI18n();
  const ar = lang === 'ar';
  const nav = useNavigate();
  const { list, label } = useDepartments();
  const [term, setTerm] = useState('');
  const [stuck, setStuck] = useState(false);
  const anchor = useRef(null);

  useEffect(() => {
    const el = anchor.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.bottom < 80), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One row: the main sections (women / men / kids) first, then the most stocked specific sections.
  const chips = useMemo(() => {
    const mains = list.filter((d) => !d.parent && d.product_count > 0 && ['women', 'men', 'kids'].includes(d.slug));
    const leaves = list
      .filter((d) => d.parent && d.product_count > 0 && !list.some((x) => x.parent === d.slug && x.product_count > 0))
      .sort((a, b) => b.product_count - a.product_count).slice(0, 8);
    return [...mains, ...leaves];
  }, [list]);

  const go = (e) => { e.preventDefault(); const q = term.trim(); saveRecent(q); nav(q ? `/search?${new URLSearchParams({ q })}` : '/search'); };
  const placeholder = ar ? 'ابحث: فستان، كوتشي، شنطة…' : 'Search: dress, sneakers, bag…';
  const photo = ar ? 'البحث بصورة' : 'Search by photo';
  const field = (h) => (
    <form onSubmit={go} role="search" className="relative">
      <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand" aria-hidden="true" />
      <SuggestInput value={term} onChange={setTerm} inputProps={{ enterKeyHint: 'search', placeholder, 'aria-label': t('search.placeholder') }}
        className={`${h} w-full rounded-2xl border-[1.5px] border-line-strong bg-white ps-12 pe-16 text-[15px] shadow-[0_10px_26px_-12px_rgba(3,36,77,.45)] outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15`} />
      <Link to="/visual" aria-label={photo} title={photo} className="absolute end-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl border-[1.5px] border-[#F8620A] bg-[#FFF3EB] text-[#F8620A] transition active:scale-95"><Camera className="h-5 w-5" /></Link>
    </form>
  );

  return (
    <div className="mt-4 sm:hidden">
      <div ref={anchor}>{field('h-14')}</div>
      {chips.length > 0 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none" aria-label={ar ? 'أقسام مقترحة' : 'Suggested sections'}>
          {chips.map((d) => <Link key={d.slug} to={`/search?department=${d.slug}`} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong bg-white px-3.5 text-[13px] font-semibold text-[#03244D] transition active:scale-95">{label(d.slug)}</Link>)}
        </div>
      )}
      {stuck && <div className="fixed inset-x-0 top-16 z-30 border-b border-line bg-white/95 px-4 py-2 backdrop-blur-md sm:hidden">{field('h-11')}</div>}
    </div>
  );
}
