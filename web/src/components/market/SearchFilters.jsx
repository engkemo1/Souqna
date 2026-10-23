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

const PRICE_BANDS = [[0, 200], [200, 500], [500, 1000], [1000, 2000], [2000, 0]];

/** Amazon-style filter column: department, price, deal/new/stock/rating toggles and store. State lives in the URL. */
const AUDIENCE_LABEL = { men: ['رجالي', 'Men'], women: ['حريمي', 'Women'], boys: ['ولادي', 'Boys'], girls: ['بناتي', 'Girls'], kids: ['أطفال', 'Kids'], unisex: ['للجنسين', 'Unisex'] };

export default function SearchFilters({ params, set, facets, departments, label, activeCount, onClear }) {
  const { t, lang } = useI18n();
  const [min, setMin] = useState(params.get('min') || '');
  const [max, setMax] = useState(params.get('max') || '');
  useEffect(() => { setMin(params.get('min') || ''); setMax(params.get('max') || ''); }, [params]);
  const deptCount = new Map((facets?.departments || []).map((d) => [d.slug, d.n]));
  const dept = params.get('department') || '';
  const deptBy = new Map(departments.map((d) => [d.slug, d]));
  const deptChain = new Set(); // القسم المختار + كل أجداده: ولادهم بيتفتحوا تحته
  for (let s = dept, i = 0; s && i < 4; s = deptBy.get(s)?.parent, i++) deptChain.add(s);
  const audTop = { men: 'men', women: 'women', boys: 'kids', girls: 'kids', kids: 'kids' }[params.get('audience') || ''];
  if (audTop) deptChain.add(audTop); // داخل رجالي: أقسام الرجالي كلها ظاهرة (تيشيرتات، بدل، جلاليب…) مش بس الأقسام الرئيسية
  const applyPrice = (e) => { e?.preventDefault(); set({ min: min && Number(min) > 0 ? String(Math.floor(Number(min))) : '', max: max && Number(max) > 0 ? String(Math.floor(Number(max))) : '' }); };
  const flag = (k) => params.get(k) === '1';
  const list = (k) => (params.get(k) || '').split(',').filter(Boolean);
  const toggleIn = (k, v) => { const cur = list(k); set({ [k]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',') }); };
  const chosenSizes = list('sizes'); const chosenColors = list('colors');

  return (
    <div className="text-fg">
      <Group title={t('search.department')}>
        <ul className="space-y-0.5">
          {[{ slug: '' }, ...departments].filter((d) => !d.slug || d.slug === dept || (!d.parent ? ((deptCount.get(d.slug) || 0) > 0 && !(facets?.audiences?.length > 1 && ['men', 'women', 'kids'].includes(d.slug))) : (deptChain.has(d.parent) && (deptCount.get(d.slug) || 0) > 0))).map((d) => {
            const n = d.slug ? deptCount.get(d.slug) || 0 : departments.filter((x) => !x.parent).reduce((a, x) => a + (deptCount.get(x.slug) || 0), 0);
            const on = dept === d.slug;
            return (
              <li key={d.slug || 'all'} style={d.parent ? { paddingInlineStart: 14 } : undefined}>
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

      {facets?.audiences?.length > 1 && (
        <Group title={lang === 'ar' ? 'لمين؟' : 'For'}>
          <div className="flex flex-wrap gap-1.5">
            {facets.audiences.map((a) => {
              const on = params.get('audience') === a.key;
              return <button key={a.key} type="button" aria-pressed={on} onClick={() => set({ audience: on ? '' : a.key, category: '' })}
                className={cx('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line-strong hover:border-fg')}>{AUDIENCE_LABEL[a.key]?.[lang === 'ar' ? 0 : 1] || a.key}<span className={cx('text-xs', on ? 'text-canvas/70' : 'text-muted')}>{formatNumber(a.n, lang)}</span></button>;
            })}
          </div>
        </Group>
      )}

      {facets?.categories?.length > 0 && (
        <Group title={t('search.category')}>
          <ul className="space-y-0.5">
            {facets.categories.map((c) => {
              const on = params.get('category') === c.key;
              return (
                <li key={c.key}>
                  <button type="button" aria-pressed={on} onClick={() => set({ category: on ? '' : c.key })}
                    className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>
                    <span className="truncate">{c.name[lang] || c.name.ar}</span><span className="text-xs text-muted">{formatNumber(c.n, lang)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Group>
      )}

      <Group title={t('search.price')}>
        <ul className="mb-3 space-y-0.5">
          {PRICE_BANDS.map(([lo, hi]) => {
            const on = (params.get('min') || '') === (lo ? String(lo) : '') && (params.get('max') || '') === (hi ? String(hi) : '');
            const text = !lo ? t('search.under', { n: formatNumber(hi, lang) }) : !hi ? t('search.above', { n: formatNumber(lo, lang) }) : `${formatNumber(lo, lang)} – ${formatNumber(hi, lang)}`;
            return (
              <li key={`${lo}-${hi}`}>
                <button type="button" aria-pressed={on} onClick={() => set({ min: on || !lo ? '' : String(lo), max: on || !hi ? '' : String(hi) })}
                  className={cx('w-full rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>{text}</button>
              </li>
            );
          })}
        </ul>
        <form onSubmit={applyPrice} className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min="0" value={min} onChange={(e) => setMin(e.target.value)} placeholder={t('search.min')} aria-label={t('search.min')}
            className="h-10 w-full min-w-0 rounded-lg border border-line-strong bg-elevated px-3 text-base outline-none focus:border-ring" />
          <span className="text-muted">–</span>
          <input type="number" inputMode="numeric" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder={t('search.max')} aria-label={t('search.max')}
            className="h-10 w-full min-w-0 rounded-lg border border-line-strong bg-elevated px-3 text-base outline-none focus:border-ring" />
          <button type="submit" className="h-10 shrink-0 rounded-lg bg-fg px-3.5 text-sm font-semibold text-canvas">{t('search.apply')}</button>
        </form>
      </Group>

      {(facets?.sizes?.length > 0 || chosenSizes.length > 0) && (
        <Group title={t('search.size')}>
          <div className="flex flex-wrap gap-2">
            {[...new Map([...(facets?.sizes || []), ...chosenSizes.map((z) => ({ size: z }))].map((x) => [x.size, x])).values()].map((x) => {
              const on = chosenSizes.includes(x.size);
              return <button key={x.size} type="button" aria-pressed={on} onClick={() => toggleIn('sizes', x.size)} className={cx('h-10 min-w-11 rounded-lg border px-3 text-sm font-semibold transition', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong bg-elevated hover:border-fg')}>{x.size}</button>;
            })}
          </div>
        </Group>
      )}

      {(facets?.colors?.length > 0 || chosenColors.length > 0) && (
        <Group title={t('search.color')}>
          <div className="flex flex-wrap gap-2.5">
            {[...new Map([...(facets?.colors || []), ...chosenColors.map((h) => ({ hex: h }))].map((x) => [x.hex, x])).values()].map((c) => {
              const on = chosenColors.includes(c.hex);
              return <button key={c.hex} type="button" aria-pressed={on} aria-label={c.name || c.hex} title={c.name || c.hex} onClick={() => toggleIn('colors', c.hex)}
                className={cx('relative grid h-9 w-9 place-items-center rounded-full border-2 transition', on ? 'border-fg' : 'border-line-strong hover:border-fg')}><span className="block h-6 w-6 rounded-full border border-black/10" style={{ background: c.hex }} />{on && <Check className="absolute h-3.5 w-3.5 mix-blend-difference text-white" strokeWidth={3} />}</button>;
            })}
          </div>
        </Group>
      )}

      <Group title={t('search.newArrivals')}>
        <ul className="space-y-0.5">
          {['7', '30', '90'].map((d) => {
            const on = params.get('new') === d || (d === '30' && params.get('new') === '1');
            return (
              <li key={d}>
                <button type="button" aria-pressed={on} onClick={() => set({ new: on ? '' : d })}
                  className={cx('w-full rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>{t('search.lastDays', { n: formatNumber(Number(d), lang) })}</button>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title={t('search.options')}>
        <Toggle checked={flag('same_day')} onChange={(v) => set({ same_day: v ? '1' : '' })}>{t('sameday.filter')}</Toggle>
        <Toggle checked={flag('sale')} onChange={(v) => set({ sale: v ? '1' : '' })}>{t('search.onSale')}</Toggle>
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
