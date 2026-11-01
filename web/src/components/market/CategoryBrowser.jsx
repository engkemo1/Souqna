import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useDepartments } from '../../lib/departments.js';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';
import { emojiFor } from '../../lib/deptIcons.js';

/** Visual avatar for a top-level section: photo when there is one, otherwise the section icon on a soft tint. */
function Avatar({ dept, size = 'lg' }) {
  const [err, setErr] = useState(false);
  const url = dept?.images?.card || dept?.image || null;
  const dim = size === 'lg' ? 'h-[68px] w-[68px] sm:h-[84px] sm:w-[84px]' : 'h-10 w-10';
  return (
    <span className={cx('relative block shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#EAF0F8] to-[#F8E9DD]', dim)}>
      {url && !err
        ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
        : <span className={cx('grid h-full w-full place-items-center', size === 'lg' ? 'text-3xl' : 'text-lg')} aria-hidden="true">{emojiFor(dept)}</span>}
    </span>
  );
}

/**
 * Premium category navigation: a rail of round section tiles, then a panel for the chosen section with its
 * sub-sections grouped (level 2 as headings, level 3 as chips). Works for any depth of tree.
 */
export default function CategoryBrowser({ value, onChange }) {
  const { lang, t } = useI18n();
  const { tops, childrenOf, bySlug, label } = useDepartments();
  const [expanded, setExpanded] = useState(false);

  const rootOf = (slug) => { let s = slug; for (let i = 0; s && i < 6 && bySlug.get(s)?.parent; i++) s = bySlug.get(s).parent; return s; };
  const root = value === 'all' ? null : rootOf(value);
  const rootDept = root ? bySlug.get(root) : null;
  const groups = useMemo(() => (root ? childrenOf(root).map((c) => ({ c, kids: childrenOf(c.slug) })) : []), [root, childrenOf]);
  const flatCount = groups.reduce((n, g) => n + 1 + g.kids.length, 0);
  const LIMIT = 4;
  const shown = expanded ? groups : groups.slice(0, LIMIT);
  const select = (slug) => { setExpanded(false); onChange(slug); };
  const allLabel = lang === 'ar' ? 'الكل' : 'All';

  const Chip = ({ slug, children }) => {
    const on = value === slug;
    return (
      <button type="button" onClick={() => onChange(slug)} aria-pressed={on}
        className={cx('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition',
          on ? 'border-brand bg-btn text-on-btn shadow-sm' : 'border-line-strong bg-white text-[#43516a] hover:border-brand hover:text-brand')}>
        {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{children}
      </button>
    );
  };

  return (
    <div className="mb-8">
      <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t('settings.category')}>
        <div className="flex min-w-max snap-x gap-4 sm:min-w-0 sm:flex-wrap sm:gap-x-6 sm:gap-y-5">
          <button type="button" role="tab" aria-selected={value === 'all'} onClick={() => select('all')} className="group flex w-[78px] shrink-0 snap-start flex-col items-center gap-2 text-center sm:w-[100px]">
            <span className={cx('grid h-[68px] w-[68px] place-items-center rounded-full bg-btn text-2xl text-on-btn transition sm:h-[84px] sm:w-[84px]', value === 'all' ? 'ring-[3px] ring-brand ring-offset-2' : 'opacity-90 group-hover:-translate-y-1')} aria-hidden="true">🛍️</span>
            <span className={cx('text-[13px] font-bold leading-tight', value === 'all' ? 'text-brand' : 'text-fg')}>{t('cat.all')}</span>
          </button>
          {tops.map((d) => {
            const on = root === d.slug;
            return (
              <button key={d.slug} type="button" role="tab" aria-selected={on} onClick={() => select(d.slug)} className="group flex w-[78px] shrink-0 snap-start flex-col items-center gap-2 text-center focus:outline-none sm:w-[100px]">
                <span className={cx('rounded-full transition duration-300', on ? 'ring-[3px] ring-brand ring-offset-2' : 'group-hover:-translate-y-1 group-hover:shadow-[0_12px_24px_-10px_rgba(3,36,77,0.35)] group-focus-visible:ring-2 group-focus-visible:ring-brand')}><Avatar dept={d} /></span>
                <span className={cx('line-clamp-2 text-[12.5px] font-bold leading-tight sm:text-[13.5px]', on ? 'text-brand' : 'text-fg')}>{label(d.slug)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rootDept && (
        <div className="mt-5 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <Avatar dept={rootDept} size="sm" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-black leading-tight sm:text-xl">{label(root)}</h2>
              {rootDept.description?.[lang] || rootDept.description?.ar ? <p className="mt-0.5 line-clamp-1 text-xs text-muted sm:text-sm">{rootDept.description[lang] || rootDept.description.ar}</p> : null}
            </div>
            <button type="button" onClick={() => onChange('all')} className="ms-auto text-xs font-bold text-muted hover:text-brand">{lang === 'ar' ? 'مسح الاختيار' : 'Clear'}</button>
          </div>

          {groups.length > 0 && (
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              <div className="flex flex-wrap gap-2"><Chip slug={root}>{allLabel} · {label(root)}</Chip></div>
              {shown.map(({ c, kids }) => (
                <div key={c.slug}>
                  {kids.length > 0 ? (
                    <>
                      <button type="button" onClick={() => onChange(c.slug)} className={cx('mb-2 text-sm font-black transition hover:text-brand', value === c.slug ? 'text-brand' : 'text-fg')}>{label(c.slug)}</button>
                      <div className="flex flex-wrap gap-2">{kids.map((k) => <Chip key={k.slug} slug={k.slug}>{label(k.slug)}</Chip>)}</div>
                    </>
                  ) : <div className="flex flex-wrap gap-2"><Chip slug={c.slug}>{label(c.slug)}</Chip></div>}
                </div>
              ))}
              {groups.length > LIMIT && (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-1 text-sm font-bold text-brand">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {expanded ? (lang === 'ar' ? 'عرض أقل' : 'Show less') : (lang === 'ar' ? `عرض كل الأقسام (${flatCount})` : `Show all (${flatCount})`)}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
