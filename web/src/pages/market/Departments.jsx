import { Link } from 'react-router-dom';
import { ChevronLeft, Flame, Store } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useDepartments } from '../../lib/departments.js';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import { CategoryImage, ThumbChip, deptHref, deptName } from '../../components/market/CategoryCards.jsx';

/** /categories — every main section with its sub-sections one tap away (opened from the «الأقسام» tab on phones). */
export default function Departments() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { list, tops, childrenOf, bySlug } = useDepartments();
  const mains = tops.filter((d) => d.product_count > 0);
  const subs = (d) => {
    const kids = childrenOf(d.slug).filter((c) => c.product_count > 0);
    const extra = d.slug === 'women' ? bySlug.get('women_lingerie') : null; // lingerie sits two levels down — keep it one tap away
    return extra && extra.product_count > 0 && !kids.some((k) => k.slug === extra.slug) ? [...kids, extra] : kids;
  };
  return (
    <div className="min-h-dvh bg-canvas">
      <MarketHeader />
      <main className="container max-w-3xl pb-24 pt-5 sm:pt-8">
        <h1 className="font-display text-2xl font-black text-[#101d3a] sm:text-3xl">{ar ? 'الأقسام' : 'Sections'}</h1>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Link to="/search?sale=1" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#EAF0F8] text-sm font-bold text-brand transition active:scale-[.98]"><Flame className="h-4 w-4" />{ar ? 'عروض بنها' : 'Banha deals'}</Link>
          <Link to="/stores" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#EAF0F8] text-sm font-bold text-brand transition active:scale-[.98]"><Store className="h-4 w-4" />{ar ? 'كل المحلات' : 'All stores'}</Link>
        </div>
        <div className="mt-5 space-y-4">
          {mains.map((d) => (
            <section key={d.slug} className="overflow-hidden rounded-3xl border border-line bg-white shadow-xs">
              <Link to={deptHref(d.slug)} className="flex items-center gap-3 p-3 transition active:bg-secondary/60">
                <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-secondary"><CategoryImage dept={d} sizes="64px" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg font-black text-[#101d3a]">{deptName(d, lang)}</span>
                  <span className="text-xs font-semibold text-muted">{ar ? 'شوف الكل' : 'See all'}</span>
                </span>
                <ChevronLeft className="h-5 w-5 shrink-0 text-muted rtl:rotate-0 ltr:rotate-180" aria-hidden="true" />
              </Link>
              {subs(d).length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-line/60 p-3">
                  {subs(d).map((c) => <ThumbChip key={c.slug} dept={c} />)}
                </div>
              )}
            </section>
          ))}
          {!list.length && <p className="py-10 text-center text-sm text-muted">{ar ? 'بنحمّل الأقسام…' : 'Loading…'}</p>}
        </div>
      </main>
    </div>
  );
}
