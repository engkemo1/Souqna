import { Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney } from '../../lib/format.js';
import { cx } from './cx.js';

export function Price({ value, compareAt, size = 'md', className, showSave }) {
  const { lang, t } = useI18n();
  const s = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-xl sm:text-2xl', xl: 'text-2xl sm:text-3xl' }[size];
  return (
    <div className={cx('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <span className={cx('font-semibold tabular', s, compareAt ? 'text-sale' : 'text-fg')}>{formatMoney(value, lang)}</span>
      {compareAt ? <span className={cx('tabular text-muted line-through decoration-1', size === 'sm' ? 'text-xs' : 'text-sm')}>{formatMoney(compareAt, lang)}</span> : null}
      {showSave && compareAt ? <span className="rounded-full bg-sale/10 px-2 py-0.5 text-xs font-semibold text-sale">{t('product.save', { v: formatMoney(compareAt - value, lang) })}</span> : null}
    </div>
  );
}

export function ColorDots({ colors = [], max = 4, size = 'sm', className }) {
  const { tr, t } = useI18n();
  if (!colors.length) return null;
  const shown = colors.slice(0, max);
  const d = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div className={cx('flex items-center gap-1.5', className)}>
      {shown.map((c) => (
        <span key={c.hex} title={tr({ ar: c.name_ar, en: c.name_en })} className={cx('rounded-full ring-1 ring-inset ring-black/10', d)} style={{ backgroundColor: c.hex }} />
      ))}
      {colors.length > max && <span className="text-xs text-muted">{t('product.color.more', { n: colors.length - max })}</span>}
      <span className="sr-only">{colors.map((c) => tr({ ar: c.name_ar, en: c.name_en })).join(', ')}</span>
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = 20, size = 'md', label = 'Quantity' }) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  const w = size === 'sm' ? 'w-9' : 'w-11';
  return (
    <div className={cx('inline-flex items-center rounded-full border border-line-strong bg-elevated', h)} role="group" aria-label={label}>
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(value - 1)} className={cx('grid h-full place-items-center rounded-full transition hover:bg-fg/[0.06] active:scale-90 disabled:opacity-30', w)}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="relative w-7 overflow-hidden text-center font-semibold tabular" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} className="block" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.18 }}>{value}</motion.span>
        </AnimatePresence>
      </span>
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)} className={cx('grid h-full place-items-center rounded-full transition hover:bg-fg/[0.06] active:scale-90 disabled:opacity-30', w)}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
