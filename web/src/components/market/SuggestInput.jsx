import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Search, Store as StoreIcon, Tag, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useDebounced } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

const KEY = 'souqna.recent-searches.v1';
const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []; } catch { return []; } };
const writeRecent = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable: recent searches simply are not kept */ } };
/** Remember a submitted search so it can be offered again (device-only, never sent anywhere). */
export const saveRecent = (term) => { const t = String(term || '').trim().slice(0, 60); if (t) writeRecent([t, ...readRecent().filter((x) => x !== t)].slice(0, 6)); };

const ICONS = { recent: Clock, product: Search, dept: Tag, store: StoreIcon };

/**
 * Search input with an Amazon-style suggestion list: product names as you type, matching departments and stores,
 * and your recent searches when the box is empty. Keyboard: ↑ ↓ Enter Esc. Must sit inside a `relative` form.
 */
export default function SuggestInput({ value, onChange, className, inputProps = {} }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const nav = useNavigate();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [data, setData] = useState(null);
  const [recent, setRecent] = useState([]);
  const term = value.trim();
  const born = useRef(Date.now()); // an autoFocus on page load must not pop the list open over the content
  const dq = useDebounced(term, 180);

  useEffect(() => {
    if (dq.length < 2) { setData(null); return undefined; }
    let live = true;
    api(`/search/suggest?q=${encodeURIComponent(dq)}`).then((r) => { if (live) setData(r); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [dq]);

  const items = useMemo(() => {
    if (term.length < 2) return recent.map((q) => ({ kind: 'recent', label: q, q }));
    if (!data || dq !== term) return [];
    const name = (n) => n?.[lang] || n?.ar || '';
    return [
      ...data.products.map((p) => ({ kind: 'product', label: name(p.name), q: name(p.name) })),
      ...data.departments.map((d) => ({ kind: 'dept', label: name(d.name), hint: ar ? 'قسم' : 'Department', to: `/search?department=${d.slug}` })),
      ...data.stores.map((s) => ({ kind: 'store', label: name(s.name), hint: ar ? 'محل' : 'Store', to: `/s/${s.slug}` })),
    ];
  }, [term, dq, data, recent, lang, ar]);

  useEffect(() => { setActive(-1); }, [items]);

  const pick = (it) => {
    setOpen(false); setActive(-1);
    if (it.to) { nav(it.to); return; }
    onChange(it.q); saveRecent(it.q);
    nav(`/search?${new URLSearchParams({ q: it.q })}`);
  };
  const clearRecent = () => { writeRecent([]); setRecent([]); };
  const showList = open && items.length > 0;

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (items.length ? (i + 1) % items.length : -1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((i) => (items.length ? (i <= 0 ? items.length - 1 : i - 1) : -1)); }
    else if (e.key === 'Enter' && showList && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <>
      <input
        {...inputProps}
        type="search" autoComplete="off" value={value} className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setRecent(readRecent()); if (Date.now() - born.current > 400) setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />
      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-elevated text-start shadow-lift" onMouseDown={(e) => e.preventDefault()}>
          {term.length < 2 && (
            <div className="flex items-center justify-between px-4 pb-1 pt-3 text-xs font-semibold text-muted">
              <span>{ar ? 'عمليات البحث الأخيرة' : 'Recent searches'}</span>
              <button type="button" onClick={clearRecent} className="inline-flex items-center gap-1 hover:text-fg"><X className="h-3 w-3" />{ar ? 'مسح' : 'Clear'}</button>
            </div>
          )}
          <ul id={listId} role="listbox" className="max-h-80 overflow-y-auto py-1.5">
            {items.map((it, i) => {
              const Icon = ICONS[it.kind];
              return (
                <li key={`${it.kind}-${it.label}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" onClick={() => pick(it)} onMouseEnter={() => setActive(i)}
                    className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition', i === active ? 'bg-secondary' : 'hover:bg-secondary/60')}>
                    <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.hint && <span className="shrink-0 rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted">{it.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
