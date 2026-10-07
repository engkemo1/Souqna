import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { onColor } from '@souqna/shared/theme';
import { cx } from '../ui/cx.js';

/** Resolve the selected variant & availability for a product detail payload. */
export function resolveVariant(product, color, size) {
  const vs = product?.variants || [];
  if (!vs.length) return { variant: null, available: product?.trackStock ? product.stockCount : 99, needsSize: false };
  const hasSizes = vs.some((v) => v.size);
  const variant = vs.find((v) => (v.color || null) === (color || null) && (!hasSizes || v.size === size)) || null;
  return { variant, available: variant ? variant.stock : 0, needsSize: hasSizes && !size };
}

export function sizeStock(product, color, size) {
  const v = product.variants.find((x) => (x.color || null) === (color || null) && x.size === size);
  return v ? v.stock : 0;
}

export default function VariantPicker({ product, color, size, onColor: setColor, onSize, sizeError }) {
  const { t, tr } = useI18n();
  const colors = product.colors || [];
  const sizes = product.sizes || [];
  const current = colors.find((c) => c.hex === color);
  return (
    <div className="space-y-6">
      {colors.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-sm">
            <span className="font-semibold">{t('product.color')}:</span> <span className="text-muted">{current ? tr({ ar: current.name_ar, en: current.name_en }) : ''}</span>
          </legend>
          <div className="flex flex-wrap gap-2.5">
            {colors.map((c) => {
              const active = c.hex === color;
              const any = product.variants.some((v) => v.color === c.hex && v.stock > 0);
              return (
                <button key={c.hex} type="button" onClick={() => setColor(c.hex)} aria-pressed={active}
                  aria-label={tr({ ar: c.name_ar, en: c.name_en })} title={tr({ ar: c.name_ar, en: c.name_en })}
                  className={cx('relative grid h-11 w-11 place-items-center rounded-full transition', !any && 'opacity-40')}>
                  {active && <motion.span layoutId={`color-ring-${product.id}`} className="absolute inset-0 rounded-full ring-2 ring-fg" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
                  <span className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: c.hex }}>
                    {active && <Check className="h-4 w-4" style={{ color: onColor(c.hex) }} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      {sizes.length > 0 && !(sizes.length === 1 && sizes[0] === 'One size') && (
        <fieldset>
          <div className="mb-3 flex items-center justify-between">
            <legend className="text-sm font-semibold">{t('product.size')}</legend>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const stock = sizeStock(product, color, s);
              const active = s === size;
              return (
                <button key={s} type="button" disabled={stock <= 0} onClick={() => onSize(s)} aria-pressed={active}
                  title={stock <= 0 ? t('product.soldOutSize') : undefined}
                  className={cx('relative h-11 min-w-[3.25rem] rounded-xl border px-3.5 text-sm font-semibold tabular transition-all duration-200 active:scale-95',
                    active ? 'border-fg bg-fg text-canvas' : 'border-line-strong hover:border-fg',
                    stock <= 0 && 'cursor-not-allowed text-muted/60 line-through decoration-1 hover:border-line-strong')}>
                  {s}
                  {stock > 0 && stock <= 3 && !active && <span className="absolute -top-1.5 end-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-elevated" />}
                </button>
              );
            })}
          </div>
          {sizeError && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2.5 text-sm font-medium text-sale" role="alert">{t('product.pleaseSelectSize')}</motion.p>}
        </fieldset>
      )}
    </div>
  );
}
