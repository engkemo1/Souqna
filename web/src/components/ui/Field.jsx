import { forwardRef, useId, cloneElement, isValidElement } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { cx } from './cx.js';

export function Field({ label, hint, error, optional, children, className, labelEnd, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  const child = isValidElement(children) ? cloneElement(children, { id, 'aria-invalid': !!error || undefined, 'aria-describedby': describedBy, invalid: !!error }) : children;
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium text-fg">
            {label}{optional && <span className="ms-1 font-normal text-muted">({optional})</span>}
          </label>
          {labelEnd}
        </div>
      )}
      {child}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-sale">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
        </p>
      ) : hint ? <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

const base = 'w-full rounded-xl border bg-elevated text-fg placeholder:text-muted/70 transition duration-150 outline-none focus:border-ring focus:shadow-ring disabled:opacity-60';
const border = (invalid) => (invalid ? 'border-sale focus:border-sale' : 'border-line-strong hover:border-fg/30');

export const Input = forwardRef(function Input({ className, invalid, prefix, suffix, size = 'md', ...rest }, ref) {
  const h = size === 'lg' ? 'h-[52px] text-base' : size === 'sm' ? 'h-10 text-sm' : 'h-12 text-base';
  if (prefix || suffix) {
    return (
      <div className={cx('relative flex items-center', className)}>
        {prefix && <span className="pointer-events-none absolute start-3.5 text-sm text-muted">{prefix}</span>}
        <input ref={ref} className={cx(base, border(invalid), h, prefix ? 'ps-12' : 'ps-3.5', suffix ? 'pe-12' : 'pe-3.5')} {...rest} />
        {suffix && <span className="pointer-events-none absolute end-3.5 text-sm text-muted">{suffix}</span>}
      </div>
    );
  }
  return <input ref={ref} className={cx(base, border(invalid), h, 'px-3.5', className)} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(base, border(invalid), 'px-3.5 py-3 text-base leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef(function Select({ className, invalid, children, size = 'md', ...rest }, ref) {
  const h = size === 'sm' ? 'h-10 text-sm' : 'h-12 text-base';
  return (
    <div className={cx('relative', className)}>
      <select ref={ref} className={cx(base, border(invalid), h, 'appearance-none ps-3.5 pe-10')} {...rest}>{children}</select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
});

export function Switch({ checked, onChange, label, description, disabled, id }) {
  const auto = useId();
  const sid = id || auto;
  return (
    <label htmlFor={sid} className={cx('flex cursor-pointer items-start justify-between gap-4', disabled && 'opacity-50')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-base font-medium text-fg">{label}</span>}
          {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
        </span>
      )}
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={sid} type="checkbox" role="switch" className="peer sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-fg/15 transition-colors duration-200 peer-checked:bg-primary peer-focus-visible:shadow-ring" />
        <span className="absolute start-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-spring peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className }) {
  return (
    <label className={cx('inline-flex min-h-[44px] cursor-pointer items-center gap-3 text-base', className)}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} className="h-5 w-5 rounded-md border-line-strong accent-[rgb(var(--c-primary))]" />
      {label}
    </label>
  );
}

/** Segmented control (tabs-like single choice). */
export function Segmented({ value, onChange, options, className, size = 'md', ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('inline-flex rounded-xl bg-fg/[0.06] p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} type="button" onClick={() => onChange(o.value)}
            className={cx('relative rounded-lg font-medium transition-all duration-200', size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-sm',
              active ? 'bg-elevated text-fg shadow-sm' : 'text-muted hover:text-fg')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
