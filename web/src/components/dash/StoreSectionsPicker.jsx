import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Input } from '../ui/Field.jsx';
import { cx } from '../ui/cx.js';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';

const nz = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * "What does the store sell?" — the section tree, grouped by main section. Open a group to tick what you sell in it.
 * Selected sections are summarised on top (tap × to remove). `depts` is the useDepartments() result; value = array of slugs.
 */
export default function StoreSectionsPicker({ depts, value, onChange }) {
  const { lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const sel = useMemo(() => new Set(value), [value]);
  const kids = useMemo(() => { const m = new Map(); for (const d of depts.list) { const k = d.parent && depts.bySlug.has(d.parent) ? d.parent : ''; (m.get(k) || m.set(k, []).get(k)).push(d); } return m; }, [depts.list, depts.bySlug]);
  const roots = kids.get('') || [];
  const toggle = (slug) => onChange(sel.has(slug) ? value.filter((x) => x !== slug) : [...value, slug]);
  // flatten one group into rows with their depth
  const rowsOf = (root) => { const out = []; const walk = (d, depth) => { out.push({ d, depth }); (kids.get(d.slug) || []).forEach((c) => walk(c, depth + 1)); }; walk(root, 0); return out; };
  const countIn = (root) => rowsOf(root).filter((r) => sel.has(r.d.slug)).length;
  const term = nz(q);
  const hits = term ? depts.list.filter((d) => nz(`${d.name?.ar} ${d.name?.en} ${depts.pathLabel(d.slug)}`).includes(term)).slice(0, 30) : [];
  const unknown = value.filter((x) => !depts.bySlug.has(x));
  const Row = ({ d, depth = 0, showPath = false }) => {
    const on = sel.has(d.slug);
    return (
      <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(d.slug)} style={{ paddingInlineStart: `${0.75 + depth * 1.1}rem` }}
        className={cx('flex min-h-[2.75rem] w-full items-center gap-2.5 rounded-lg pe-3 text-start text-sm transition hover:bg-fg/[0.04]', on && 'bg-fg/[0.05] font-semibold')}>
        <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong')}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
        <span className="min-w-0"><span className="block truncate">{depts.label(d.slug)}</span>{showPath && <span className="block truncate text-[12px] font-normal text-muted">{depts.pathLabel(d.slug)}</span>}</span>
      </button>
    );
  };
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="rounded-xl border border-line bg-secondary/30 p-3">
          <p className="mb-2 text-[12.5px] font-semibold text-muted">{L(`اللي بتبيعه (${value.length})`, `You sell (${value.length})`)}</p>
          <div className="flex flex-wrap gap-1.5">
            {value.map((s) => <button key={s} type="button" onClick={() => toggle(s)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 text-[13px] font-medium text-canvas" aria-label={`${L('إزالة', 'Remove')} ${depts.label(s)}`}>{depts.label(s)}<X className="h-3.5 w-3.5 opacity-80" /></button>)}
          </div>
        </div>
      )}
      <div className="relative"><Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} className="ps-10" placeholder={L('ابحث عن قسم: فساتين، مكياج، أحذية…', 'Search a section…')} /></div>
      {term ? (
        <div className="rounded-xl border border-line p-1.5">{hits.length ? hits.map((d) => <Row key={d.slug} d={d} showPath />) : <p className="py-4 text-center text-sm text-muted">{L('مفيش قسم بالاسم ده.', 'No such section.')}</p>}</div>
      ) : (
        <div className="space-y-2">
          {roots.map((r) => {
            const n = countIn(r); const isOpen = open[r.slug] ?? n > 0; const rows = rowsOf(r);
            return (
              <div key={r.slug} className="overflow-hidden rounded-xl border border-line">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [r.slug]: !isOpen })} className="flex min-h-[3rem] w-full items-center justify-between gap-3 bg-surface px-4 text-start">
                  <span className="font-semibold">{depts.label(r.slug)}</span>
                  <span className="flex items-center gap-2">{n > 0 && <span className="rounded-full bg-fg px-2 py-0.5 text-[12px] font-bold text-canvas">{formatNumber(n, lang)} {L('مختارة', 'selected')}</span>}<ChevronDown className={cx('h-4 w-4 text-muted transition', isOpen && 'rotate-180')} /></span>
                </button>
                {isOpen && <div className="grid gap-0.5 border-t border-line p-1.5 sm:grid-cols-2">{rows.map(({ d, depth }) => <Row key={d.slug} d={d} depth={depth} />)}</div>}
              </div>
            );
          })}
        </div>
      )}
      {unknown.length > 0 && <p className="text-[12.5px] text-muted">{L('أقسام مختارة مش في الشجرة:', 'Selected but not in the tree:')} {unknown.join('، ')}</p>}
    </div>
  );
}
