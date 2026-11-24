import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';

/**
 * Mobile-only one-tap section chips for the home page. The search field itself now lives in the sticky header (MarketHeader),
 * so it stays visible while scrolling. Hidden from the `sm` breakpoint up.
 */
export default function MobileHomeSearch() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { list, label } = useDepartments();
  // One row: the main sections (women / men / kids) first, then the most stocked specific sections.
  const chips = useMemo(() => {
    const mains = list.filter((d) => !d.parent && d.product_count > 0 && ['women', 'men', 'kids'].includes(d.slug));
    const leaves = list
      .filter((d) => d.parent && d.product_count > 0 && !list.some((x) => x.parent === d.slug && x.product_count > 0))
      .sort((a, b) => b.product_count - a.product_count).slice(0, 8);
    return [...mains, ...leaves];
  }, [list]);
  if (!chips.length) return null;

  return (
    <div className="mt-4 sm:hidden">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none" aria-label={ar ? 'أقسام مقترحة' : 'Suggested sections'}>
          {chips.map((d) => <Link key={d.slug} to={`/search?department=${d.slug}`} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong bg-white px-3.5 text-[13px] font-semibold text-[#03244D] transition active:scale-95">{label(d.slug)}</Link>)}
        </div>
    </div>
  );
}
