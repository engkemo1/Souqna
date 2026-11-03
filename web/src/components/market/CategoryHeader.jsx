import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import SmartImage from '../ui/SmartImage.jsx';

/** Breadcrumb + title + description + sub-section tiles for a department page. Everything comes from the department tree (one source of truth). */
export default function CategoryHeader({ department, bySlug, childrenOf, onPick }) {
  const { lang } = useI18n();
  const d = bySlug.get(department);
  if (!d) return null;
  const nm = (x) => x.name?.[lang] || x.name?.ar;
  const trail = []; for (let c = d, i = 0; c && i < 5; c = bySlug.get(c.parent), i++) trail.unshift(c);
  const kids = childrenOf(d.slug);
  const desc = d.description?.[lang] || d.description?.ar || '';
  return (
    <header className="mb-6">
      <nav aria-label="breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-muted">
        <Link to="/" className="hover:text-fg hover:underline">{lang === 'ar' ? 'الرئيسية' : 'Home'}</Link>
        {trail.map((c, i) => (
          <span key={c.slug} className="inline-flex items-center gap-1"><ChevronLeft className="h-3.5 w-3.5 rtl:rotate-0 ltr:rotate-180" aria-hidden />
            {i === trail.length - 1 ? <span aria-current="page" className="font-semibold text-fg">{nm(c)}</span> : <button type="button" onClick={() => onPick(c.slug)} className="hover:text-fg hover:underline">{nm(c)}</button>}
          </span>
        ))}
      </nav>
      <h1 className="font-display text-2xl font-bold sm:text-3xl">{nm(d)}</h1>
      {desc && <p className="mt-1.5 max-w-2xl text-sm text-muted">{desc}</p>}
      {kids.length > 0 && (
        <div className="lg:hidden scroll-x -mx-4 mt-4 gap-2.5 px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="list">
          {kids.map((k) => (
            <button key={k.slug} role="listitem" type="button" onClick={() => onPick(k.slug)} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line-strong bg-elevated py-1.5 ps-1.5 pe-4 text-sm font-semibold transition hover:border-fg">
              <span className="h-8 w-8 overflow-hidden rounded-full bg-secondary">{k.image ? <SmartImage media={k.image} ratio="1 / 1" sizes="32px" className="h-full w-full object-cover" /> : <img src="/departments/category-placeholder.png" alt="" loading="lazy" className="h-full w-full object-cover" />}</span>{nm(k)}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
