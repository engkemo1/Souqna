import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronLeft } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { formatNumber } from '../../lib/format.js';
import { cx } from '../ui/cx.js';
import { DEPT_EMOJI } from './DeptStrip.jsx';

/** مجموعة فلتر قابلة للطي (زي نون/أمازون): العنوان بيقفل ويفتح، وعدد المختار ظاهر جنب العنوان */
function Group({ title, children, badge = 0, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line py-4 first:pt-0 last:border-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 py-1 text-start">
        <span className="flex items-center gap-2 text-sm font-bold">{title}{badge > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1 text-xs font-semibold text-canvas">{badge}</span>}</span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-muted transition-transform', open ? '' : '-rotate-90')} aria-hidden="true" />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

/** أول N عنصر بس، وزرار "عرض المزيد" (القوايم الطويلة زي المحلات والأنواع) */
function ShowMore({ items, limit = 6, render, lang, keepOpen = () => false }) {
  const [all, setAll] = useState(false);
  const mustShow = items.filter(keepOpen).length;
  const shown = all ? items : items.filter((x, i) => i < limit || keepOpen(x));
  return (
    <>
      {shown.map(render)}
      {items.length > Math.max(limit, mustShow) && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 px-2.5 py-1.5 text-sm font-semibold text-brand hover:underline">
          {all ? (lang === 'ar' ? 'عرض أقل' : 'Show less') : (lang === 'ar' ? `عرض المزيد (${items.length - limit})` : `Show more (${items.length - limit})`)}
        </button>
      )}
    </>
  );
}

const SIZE_GROUP_LABEL = { shoes: ['مقاس الحذاء', 'Shoe size'], num: ['مقاس رقمي (بنطلون / بدلة)', 'Numeric size'], letters: ['مقاس حروف', 'Letter size'] };
const DISCOUNT_BANDS = [20, 30, 50, 70];


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
  const chosenSizes = list('sizes'); const chosenColors = list('colors'); const chosenMaterials = list('material');

  return (
    <div className="text-fg">
      <Group title={t('search.department')}>
        {dept && deptBy.get(dept) && (
          <button type="button" onClick={() => set({ department: deptBy.get(dept).parent || '' })} className="mb-1.5 flex items-center gap-1 px-2.5 py-1.5 text-sm font-semibold text-brand hover:underline">
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {deptBy.get(dept).parent ? (lang === 'ar' ? `الرجوع إلى ${label(deptBy.get(dept).parent)}` : `Back to ${label(deptBy.get(dept).parent)}`) : (lang === 'ar' ? 'كل الأقسام' : 'All departments')}
          </button>
        )}
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
        <Group title={t('search.category')} badge={params.get('category') ? 1 : 0}>
          <ul className="space-y-0.5">
            <ShowMore items={facets.categories} limit={8} lang={lang} keepOpen={(c) => params.get('category') === c.key} render={(c) => {
              const on = params.get('category') === c.key;
              return (
                <li key={c.key}>
                  <button type="button" aria-pressed={on} onClick={() => set({ category: on ? '' : c.key })}
                    className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>
                    <span className="truncate">{c.name[lang] || c.name.ar}</span><span className="text-xs text-muted">{formatNumber(c.n, lang)}</span>
                  </button>
                </li>
              );
            }} />
          </ul>
        </Group>
      )}
      {(facets?.sizes?.length > 0 || chosenSizes.length > 0) && (() => {
        const all = [...new Map([...(facets?.sizes || []), ...chosenSizes.filter((z) => !(facets?.sizes || []).some((x) => x.size === z)).map((z) => ({ size: z, grp: 'letters' }))].map((x) => [`${x.grp}:${x.size}`, x])).values()];
        const grps = ['shoes', 'num', 'letters'].filter((g) => all.some((x) => x.grp === g));
        return (
          <Group title={t('search.size')} badge={chosenSizes.length}>
            {grps.map((g) => (
              <div key={g} className="mb-3 last:mb-0">
                {grps.length > 1 && <p className="mb-1.5 text-xs font-semibold text-muted">{SIZE_GROUP_LABEL[g][lang === 'ar' ? 0 : 1]}</p>}
                <div className="flex flex-wrap gap-2">
                  {all.filter((x) => x.grp === g).map((x) => {
                    const on = chosenSizes.includes(x.size);
                    return <button key={`${g}:${x.size}`} type="button" aria-pressed={on} onClick={() => toggleIn('sizes', x.size)} className={cx('h-10 min-w-11 rounded-lg border px-3 text-sm font-semibold transition', on ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg')}>{x.size}</button>;
                  })}
                </div>
              </div>
            ))}
          </Group>
        );
      })()}
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

      {(facets?.materials?.length > 0 || chosenMaterials.length > 0) && (
        <Group title={lang === 'ar' ? 'الخامة' : 'Material'} badge={chosenMaterials.length}>
          <ShowMore items={facets?.materials || []} limit={6} lang={lang} keepOpen={(m) => chosenMaterials.includes(m.key)} render={(m) => (
            <Toggle key={m.key} checked={chosenMaterials.includes(m.key)} onChange={() => toggleIn('material', m.key)}>
              <span className="flex flex-1 items-center justify-between gap-2"><span>{m.name[lang] || m.name.ar}</span><span className="text-xs text-muted">{formatNumber(m.n, lang)}</span></span>
            </Toggle>
          )} />
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

      <Group title={lang === 'ar' ? 'نسبة الخصم' : 'Discount'} badge={params.get('discount') ? 1 : 0} defaultOpen={!!params.get('discount')}>
        <ul className="space-y-0.5">
          {DISCOUNT_BANDS.map((d) => {
            const on = params.get('discount') === String(d);
            return (
              <li key={d}>
                <button type="button" aria-pressed={on} onClick={() => set({ discount: on ? '' : String(d), sale: '' })}
                  className={cx('w-full rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>
                  {lang === 'ar' ? `خصم ${formatNumber(d, lang)}٪ أو أكثر` : `${d}% off or more`}
                </button>
              </li>
            );
          })}
        </ul>
      </Group>
      <Group title={lang === 'ar' ? 'التقييم' : 'Rating'} badge={params.get('rating') ? 1 : 0} defaultOpen={!!params.get('rating')}>
        <ul className="space-y-0.5">
          {[['4', 4], ['3', 3]].map(([v, n]) => {
            const on = (params.get('rating') === v) || (v === '4' && params.get('rating') === '1');
            return (
              <li key={v}>
                <button type="button" aria-pressed={on} onClick={() => set({ rating: on ? '' : v })}
                  className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>
                  <span className="text-amber-500" aria-hidden="true">{'★'.repeat(n)}<span className="text-line-strong">{'★'.repeat(5 - n)}</span></span>
                  <span>{lang === 'ar' ? 'فأكثر' : '& up'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Group>
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
      </Group>

      {facets?.stores?.length > 0 && (
        <Group title={t('search.stores')} badge={params.get('store') ? 1 : 0}>
          <ul className="space-y-0.5">
            <ShowMore items={facets.stores} limit={6} lang={lang} keepOpen={(x) => params.get('store') === x.slug} render={(x) => {
              const on = params.get('store') === x.slug;
              return (
                <li key={x.slug}>
                  <button type="button" aria-pressed={on} onClick={() => set({ store: on ? '' : x.slug })}
                    className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition', on ? 'bg-secondary font-bold' : 'hover:bg-secondary/60')}>
                    <span className="truncate">{x.name[lang] || x.name.ar}</span><span className="text-xs text-muted">{formatNumber(x.n, lang)}</span>
                  </button>
                </li>
              );
            }} />
          </ul>
        </Group>
      )}
      {activeCount > 0 && <button type="button" onClick={onClear} className="mt-2 text-sm font-semibold text-brand hover:underline">{t('search.clearFilters')}</button>}
    </div>
  );
}
