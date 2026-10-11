import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';
import { cx } from '../ui/cx.js';
import { DEPT_EMOJI } from './DeptStrip.jsx';

const Group = ({ title, children }) => (
  <fieldset className="border-b border-line py-5 first:pt-0 last:border-0">
    <legend className="mb-3 text-sm font-bold">{title}</legend>
    {children}
  </fieldset>
);

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
      <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded border transition', checked ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated')}>{checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Amazon-style filter column: department, price, deal/new/stock/rating toggles and store. State lives in the URL. */
export default function SearchFilters({ params, set, facets, departments, label, activeCount, onClear }) {
  const { t, lang } = useI18n();
  const [min, setMin] = useState(params.get('min') || '');
  const [max, setMax] = useState(params.get('max') || '');
  useEffect(() => { setMin(params.get('min') || ''); setMax(params.get('max') || ''); }, [params]);
  const deptCount = new Map((facets?.departments || []).map((d) => [d.slug, d.n]));
  const dept = params.get('department') || '';
  const applyPrice = (e) => { e?.preventDefault(); set({ min: min && Number(min) > 0 ? String(Math.floor(Number(min))) : '', max: max && Number(max) > 0 ? String(Math.floor(Number(max))) : '' }); };
  const flag = (k) => params.get(k) === '1';

  return (
    <div className="text-fg">
      <Group title={t('search.department')}>
        <ul className="space-y-0.5">
          {[{ slug: '' }, ...departments].map((d) => {
            const n = d.slug ? deptCount.get(d.slug) || 0 : [...deptCount.values()].reduce((a, b) => a + b, 0);
            const on = dept === d.slug;
            return (
              <li key={d.slug || 'all'}>
                <button type="button" onClick={() => set({ department: d.slug })} aria-pressed={on}
                  className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60', !on && d.slug && n === 0 && 'text-muted')}>
                  <span className="flex items-center gap-2"><span aria-hidden="true">{d.slug ? DEPT_EMOJI[d.slug] || '🛍️' : '🛒'}</span>{d.slug ? label(d.slug) : t('search.allDepartments')}</span>
                  <span className="text-xs text-muted">{formatNumber(n, lang)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title={t('search.price')}>
        <form onSubmit={applyPrice} className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min="0" value={min} onChange={(e) => setMin(e.target.value)} placeholder={t('search.min')} aria-label={t('search.min')}
            className="h-10 w-full min-w-0 rounded-lg border border-line-strong bg-elevated px-3 text-base outline-none focus:border-ring" />
          <span className="text-muted">–</span>
          <input type="number" inputMode="numeric" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder={t('search.max')} aria-label={t('search.max')}
            className="h-10 w-full min-w-0 rounded-lg border border-line-strong bg-elevated px-3 text-base outline-none focus:border-ring" />
          <button type="submit" className="h-10 shrink-0 rounded-lg bg-fg px-3.5 text-sm font-semibold text-canvas">{t('search.apply')}</button>
        </form>
      </Group>

      <Group title={t('search.options')}>
        <Toggle checked={flag('sale')} onChange={(v) => set({ sale: v ? '1' : '' })}>{t('search.onSale')}</Toggle>
        <Toggle checked={flag('new')} onChange={(v) => set({ new: v ? '1' : '' })}>{t('search.newOnly')}</Toggle>
        <Toggle checked={flag('in_stock')} onChange={(v) => set({ in_stock: v ? '1' : '' })}>{t('search.inStock')}</Toggle>
        <Toggle checked={flag('rating')} onChange={(v) => set({ rating: v ? '1' : '' })}>{t('search.rating4')}</Toggle>
      </Group>

      {facets?.stores?.length > 0 && (
        <Group title={t('search.stores')}>
          <ul className="space-y-0.5">
            {facets.stores.map((s) => {
              const on = params.get('store') === s.slug;
              return (
                <li key={s.slug}>
                  <button type="button" aria-pressed={on} onClick={() => set({ store: on ? '' : s.slug })}
                    className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>
                    <span className="truncate">{s.name[lang] || s.name.ar}</span><span className="text-xs text-muted">{formatNumber(s.n, lang)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Group>
      )}

      {activeCount > 0 && <button type="button" onClick={onClear} className="mt-2 text-sm font-semibold text-brand hover:underline">{t('search.clearFilters')}</button>}
    </div>
  );
}
