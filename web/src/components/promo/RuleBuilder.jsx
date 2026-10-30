import { Plus, Trash2, Layers } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { Field, Input, Select, Segmented } from '../ui/Field.jsx';
import Button, { IconButton } from '../ui/Button.jsx';
import { SelectorField } from './ProductPicker.jsx';
import { emptySel } from '../../lib/promo.js';
import { cx } from '../ui/cx.js';

const num = (v, min = 0) => { const n = Number(String(v).replace(/\D/g, '')); return Number.isFinite(n) ? Math.max(min, n) : min; };
const usePt = () => { const { lang } = useI18n(); return (ar, en) => (lang === 'ar' ? ar : en); };
const NumInput = ({ value, onChange, min = 1, suffix, className }) => <Input className={className} inputMode="numeric" suffix={suffix} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : num(e.target.value, 0))} onBlur={() => onChange(Math.max(min, Number(value) || min))} />;

/* ------------------------------------------------------------------ WHEN: conditions with AND / OR */

const COND_DEFAULT = {
  min_qty: { kind: 'min_qty', value: 2, scope: 'qualifying' },
  min_subtotal: { kind: 'min_subtotal', value: 500, scope: 'cart' },
  has_products: { kind: 'has_products', selector: emptySel(), min_qty: 1 },
};

export function ConditionsBuilder({ value, onChange, depth = 1 }) {
  const p = usePt();
  const g = value || { logic: 'and', items: [] };
  const set = (items) => onChange(items.length ? { ...g, items } : null);
  const upd = (i, it) => set(g.items.map((x, k) => (k === i ? it : x)));
  const add = (kind) => set([...g.items, structuredClone(COND_DEFAULT[kind])]);
  const addGroup = () => set([...g.items, { logic: 'or', items: [structuredClone(COND_DEFAULT.min_qty)] }]);
  const KIND = { min_qty: p('كمية القطع', 'Quantity of items'), min_subtotal: p('مبلغ الطلب', 'Order amount'), has_products: p('اشترى منتجات محددة', 'Bought specific products') };
  return (
    <div className={cx('space-y-3', depth > 1 && 'rounded-2xl border border-dashed border-line-strong p-3')}>
      {g.items.length > 1 && (
        <div className="flex items-center gap-2 text-sm"><span className="text-muted">{p('يتحقق', 'Match')}</span>
          <Segmented size="sm" value={g.logic} onChange={(v) => onChange({ ...g, logic: v })} options={[{ value: 'and', label: p('كل الشروط (و)', 'ALL (AND)') }, { value: 'or', label: p('أي شرط (أو)', 'ANY (OR)') }]} /></div>
      )}
      {g.items.map((it, i) => (
        <div key={i} className="rounded-xl border border-line bg-elevated p-3">
          {it.items ? (
            <div className="space-y-2"><ConditionsBuilder depth={depth + 1} value={it} onChange={(v) => (v ? upd(i, v) : set(g.items.filter((_, k) => k !== i)))} /></div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={p('الشرط', 'Condition')} className="min-w-[150px] flex-1">
                <Select value={it.kind} onChange={(e) => upd(i, structuredClone(COND_DEFAULT[e.target.value]))}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
              {it.kind !== 'has_products' && (
                <>
                  <Field label={p('على', 'Counted on')} className="min-w-[150px] flex-1">
                    <Select value={it.scope} onChange={(e) => upd(i, { ...it, scope: e.target.value })}><option value="qualifying">{p('المنتجات المشمولة', 'Included products')}</option><option value="cart">{p('كل السلة', 'Whole cart')}</option></Select>
                  </Field>
                  <Field label={it.kind === 'min_qty' ? p('على الأقل (قطع)', 'At least (items)') : p('على الأقل (ج.م)', 'At least (EGP)')} className="w-32"><NumInput value={it.value} onChange={(v) => upd(i, { ...it, value: v })} /></Field>
                </>
              )}
              {it.kind === 'has_products' && <Field label={p('عدد القطع', 'Items')} className="w-28"><NumInput value={it.min_qty} onChange={(v) => upd(i, { ...it, min_qty: v })} /></Field>}
              <IconButton size="sm" label="remove" icon={Trash2} iconClass="h-4 w-4 text-sale" onClick={() => set(g.items.filter((_, k) => k !== i))} />
            </div>
          )}
          {it.kind === 'has_products' && <div className="mt-3"><SelectorField value={it.selector} onChange={(s) => upd(i, { ...it, selector: s })} label={p('المنتجات المطلوب شراؤها', 'Products that must be bought')} /></div>}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="secondary" icon={Plus} onClick={() => add('min_qty')}>{p('كمية', 'Quantity')}</Button>
        <Button size="xs" variant="secondary" icon={Plus} onClick={() => add('min_subtotal')}>{p('مبلغ', 'Amount')}</Button>
        <Button size="xs" variant="secondary" icon={Plus} onClick={() => add('has_products')}>{p('منتجات محددة', 'Products')}</Button>
        {depth < 2 && <Button size="xs" variant="secondary" icon={Layers} onClick={addGroup}>{p('مجموعة شروط', 'Group')}</Button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ THEN: effects */

const PICKS = (p) => [
  ['cheapest', p('أرخص قطعة', 'Cheapest item')], ['second_cheapest', p('ثاني أرخص قطعة', 'Second cheapest')],
  ['most_expensive', p('أغلى قطعة', 'Most expensive item')], ['second_most_expensive', p('ثاني أغلى قطعة', 'Second most expensive')],
];

export const EFFECT_DEFAULTS = {
  percent_off: { kind: 'percent_off', percent: 20, apply_to: 'all' },
  fixed_off: { kind: 'fixed_off', amount: 100, per: 'cart' },
  buy_x_get_y: { kind: 'buy_x_get_y', buy: 2, get: 1, reward_pick: 'cheapest', reward_mode: 'percent', reward_value: 100 },
  group_price: { kind: 'group_price', qty: 3, price: 500, pick: 'most_expensive' },
  tiers: { kind: 'tiers', mode: 'percent', tiers: [{ qty: 2, value: 10 }, { qty: 3, value: 20 }] },
  bundle: { kind: 'bundle', price: 700, slots: [{ sel: emptySel(), qty: 1 }, { sel: emptySel(), qty: 1 }] },
  gift: { kind: 'gift', gifts: [], choose: 1, qty: 1, repeat: false },
};

export function EffectEditor({ effect: e, onChange, rewardSeparate }) {
  const p = usePt();
  const set = (patch) => onChange({ ...e, ...patch });
  switch (e.kind) {
    case 'buy_x_get_y':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={p('اشتري (X)', 'Buy (X)')} hint={p('عدد القطع المدفوعة', 'Paid items')}><NumInput value={e.buy} onChange={(v) => set({ buy: v })} /></Field>
            <Field label={p('واحصل على (Y)', 'Get (Y)')} hint={p('عدد قطع المكافأة', 'Reward items')}><NumInput value={e.get} onChange={(v) => set({ get: v })} /></Field>
          </div>
          <Field label={p('أي قطعة تكون المكافأة؟', 'Which item is the reward?')} hint={rewardSeparate ? p('من منتجات المكافأة المحددة', 'Chosen among the reward products') : p('من بين القطع المشمولة', 'Chosen among the included items')}>
            <Select value={e.reward_pick} onChange={(ev) => set({ reward_pick: ev.target.value })}>{PICKS(p).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={p('طريقة خصم المكافأة', 'Reward pricing')}>
              <Select value={e.reward_mode} onChange={(ev) => set({ reward_mode: ev.target.value, reward_value: ev.target.value === 'percent' ? 100 : ev.target.value === 'fixed_off' ? 50 : 0 })}>
                <option value="percent">{p('نسبة خصم (100% = مجانًا)', 'Percent off (100% = free)')}</option><option value="fixed_off">{p('مبلغ خصم ثابت', 'Fixed amount off')}</option><option value="final_price">{p('سعر نهائي مخصص', 'Custom final price')}</option>
              </Select>
            </Field>
            <Field label={e.reward_mode === 'percent' ? '%' : p('ج.م', 'EGP')}><NumInput min={0} value={e.reward_value} onChange={(v) => set({ reward_value: v })} /></Field>
          </div>
        </div>
      );
    case 'group_price':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={p('عدد القطع', 'Items')}><NumInput min={2} value={e.qty} onChange={(v) => set({ qty: v })} /></Field>
          <Field label={p('السعر الإجمالي (ج.م)', 'Total price (EGP)')}><NumInput min={0} value={e.price} onChange={(v) => set({ price: v })} /></Field>
          <Field label={p('تطبيق على', 'Apply to')}><Select value={e.pick} onChange={(ev) => set({ pick: ev.target.value })}><option value="most_expensive">{p('الأغلى أولًا (أفضل للعميل)', 'Priciest first (best for shopper)')}</option><option value="cheapest">{p('الأرخص أولًا', 'Cheapest first')}</option></Select></Field>
        </div>
      );
    case 'percent_off':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={p('نسبة الخصم %', 'Discount %')}><NumInput value={e.percent} onChange={(v) => set({ percent: Math.min(100, v) })} /></Field>
          <Field label={p('يُطبق على', 'Applies to')}><Select value={e.apply_to} onChange={(ev) => set({ apply_to: ev.target.value })}><option value="all">{p('كل المنتجات المشمولة', 'All included items')}</option>{PICKS(p).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          {e.apply_to !== 'all' && <Field label={p('حجم المجموعة', 'Group size')} hint={p('اختياري - يتكرر لكل مجموعة', 'Optional - repeats per group')}><NumInput value={e.group_size ?? ''} onChange={(v) => set({ group_size: v === '' ? null : v })} /></Field>}
        </div>
      );
    case 'fixed_off':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={p('مبلغ الخصم (ج.م)', 'Discount (EGP)')}><NumInput value={e.amount} onChange={(v) => set({ amount: v })} /></Field>
          <Field label={p('طريقة الخصم', 'How')}><Select value={e.per} onChange={(ev) => set({ per: ev.target.value })}><option value="cart">{p('مرة واحدة على المنتجات المشمولة', 'Once on the included items')}</option><option value="unit">{p('على كل قطعة', 'On every item')}</option></Select></Field>
        </div>
      );
    case 'tiers': {
      const upd = (i, patch) => set({ tiers: e.tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
      return (
        <div className="space-y-3">
          <Field label={p('نوع الشرائح', 'Tier type')}>
            <Select value={e.mode} onChange={(ev) => set({ mode: ev.target.value })}><option value="percent">{p('نسبة خصم لكل شريحة', 'Percent off per tier')}</option><option value="fixed_off">{p('مبلغ خصم لكل شريحة', 'Amount off per tier')}</option><option value="total_price">{p('سعر إجمالي لكل كمية', 'Total price per quantity')}</option></Select>
          </Field>
          {e.tiers.map((t, i) => (
            <div key={i} className="flex items-end gap-3">
              <Field label={p('عند شراء (قطع)', 'When buying (items)')} className="flex-1"><NumInput value={t.qty} onChange={(v) => upd(i, { qty: v })} /></Field>
              <Field label={e.mode === 'percent' ? '%' : e.mode === 'fixed_off' ? p('خصم ج.م', 'Off EGP') : p('السعر ج.م', 'Price EGP')} className="flex-1"><NumInput min={e.mode === 'total_price' ? 0 : 1} value={t.value} onChange={(v) => upd(i, { value: v })} /></Field>
              <IconButton size="sm" label="remove" icon={Trash2} iconClass="h-4 w-4 text-sale" disabled={e.tiers.length < 2} onClick={() => set({ tiers: e.tiers.filter((_, k) => k !== i) })} />
            </div>
          ))}
          <Button size="xs" variant="secondary" icon={Plus} onClick={() => set({ tiers: [...e.tiers, { qty: (e.tiers.at(-1)?.qty || 1) + 1, value: e.mode === 'percent' ? Math.min(100, (e.tiers.at(-1)?.value || 0) + 10) : e.tiers.at(-1)?.value || 0 }] })}>{p('إضافة شريحة', 'Add tier')}</Button>
        </div>
      );
    }
    case 'bundle':
      return (
        <div className="space-y-3">
          <Field label={p('سعر الباقة (ج.م)', 'Bundle price (EGP)')} className="max-w-xs"><NumInput min={0} value={e.price} onChange={(v) => set({ price: v })} /></Field>
          {e.slots.map((s, i) => (
            <div key={i} className="rounded-2xl border border-line p-3">
              <div className="mb-2 flex items-end gap-3">
                <Field label={p(`الخانة ${i + 1} - عدد القطع`, `Slot ${i + 1} - items`)} className="w-40"><NumInput value={s.qty} onChange={(v) => set({ slots: e.slots.map((x, k) => (k === i ? { ...x, qty: v } : x)) })} /></Field>
                <IconButton size="sm" label="remove" icon={Trash2} iconClass="h-4 w-4 text-sale" disabled={e.slots.length < 3} onClick={() => set({ slots: e.slots.filter((_, k) => k !== i) })} />
              </div>
              <SelectorField value={s.sel} onChange={(sel) => set({ slots: e.slots.map((x, k) => (k === i ? { ...x, sel } : x)) })} label={p('المنتجات أو القسم المسموح باختيارها', 'Products or category allowed in this slot')} />
            </div>
          ))}
          <Button size="xs" variant="secondary" icon={Plus} disabled={e.slots.length >= 8} onClick={() => set({ slots: [...e.slots, { sel: emptySel(), qty: 1 }] })}>{p('إضافة خانة', 'Add slot')}</Button>
        </div>
      );
    case 'gift':
      return (
        <div className="space-y-3">
          <SelectorField productsOnly value={{ all: false, products: e.gifts, categories: [] }} onChange={(s) => set({ gifts: s.products })} label={p('منتجات الهدية (لو أكتر من واحد يختار العميل)', 'Gift products (shopper picks one if several)')} emptyLabel={p('اختار منتج الهدية', 'Choose the gift')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={p('عدد قطع الهدية', 'Gift quantity')}><NumInput value={e.qty} onChange={(v) => set({ qty: Math.min(5, v) })} /></Field>
            <Field label={p('تتكرر؟', 'Repeat?')}><Select value={e.repeat ? 'y' : 'n'} onChange={(ev) => set({ repeat: ev.target.value === 'y' })}><option value="n">{p('هدية واحدة لكل طلب', 'One gift per order')}</option><option value="y">{p('تتكرر مع كل مضاعف للكمية', 'Repeat for every multiple')}</option></Select></Field>
          </div>
          {e.repeat && <Field label={p('تتكرر كل (قطع)', 'Every (items)')} className="max-w-xs"><NumInput value={e.every ?? 1} onChange={(v) => set({ every: v })} /></Field>}
        </div>
      );
    default: return null;
  }
}

/** THEN for custom offers: one or several actions. */
export function ActionsBuilder({ effect, onChange }) {
  const p = usePt();
  const list = effect.kind === 'multi' ? effect.effects : [effect];
  const commit = (arr) => onChange(arr.length === 1 ? arr[0] : { kind: 'multi', effects: arr });
  const LABEL = { percent_off: p('خصم بنسبة', 'Percent discount'), fixed_off: p('خصم بمبلغ', 'Fixed discount'), buy_x_get_y: p('اشتري X واحصل على Y', 'Buy X get Y'), group_price: p('سعر ثابت لمجموعة', 'Group price'), tiers: p('شرائح كمية', 'Quantity tiers'), bundle: p('باقة', 'Bundle'), gift: p('هدية مجانية', 'Free gift') };
  return (
    <div className="space-y-3">
      {list.map((e, i) => (
        <div key={i} className="rounded-2xl border border-line p-4">
          <div className="mb-3 flex items-end gap-3">
            <Field label={p(`الإجراء ${i + 1}`, `Action ${i + 1}`)} className="flex-1">
              <Select value={e.kind} onChange={(ev) => commit(list.map((x, k) => (k === i ? structuredClone(EFFECT_DEFAULTS[ev.target.value]) : x)))}>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            {list.length > 1 && <IconButton size="sm" label="remove" icon={Trash2} iconClass="h-4 w-4 text-sale" onClick={() => commit(list.filter((_, k) => k !== i))} />}
          </div>
          <EffectEditor effect={e} onChange={(ne) => commit(list.map((x, k) => (k === i ? ne : x)))} />
        </div>
      ))}
      {list.length < 4 && <Button size="xs" variant="secondary" icon={Plus} onClick={() => commit([...list, structuredClone(EFFECT_DEFAULTS.percent_off)])}>{p('إضافة إجراء آخر', 'Add another action')}</Button>}
    </div>
  );
}
