import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Spinner from './Spinner.jsx';
import { cx } from './cx.js';

const VARIANTS = {
  primary: 'bg-btn text-on-btn border border-btn-outline hover:brightness-110 shadow-sm',
  brand: 'bg-primary text-on-primary hover:brightness-110 shadow-sm',
  secondary: 'bg-surface text-fg border border-line hover:bg-fg/[0.06]',
  outline: 'bg-transparent text-fg border border-line-strong hover:bg-fg/[0.04] hover:border-fg/40',
  ghost: 'bg-transparent text-fg hover:bg-fg/[0.06]',
  danger: 'bg-sale text-white hover:brightness-110',
  'danger-ghost': 'bg-transparent text-sale hover:bg-sale/10',
  white: 'bg-white text-neutral-900 hover:bg-white/90 shadow-sm',
};
const SIZES = {
  xs: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  sm: 'h-10 px-4 text-sm gap-2 rounded-xl',
  md: 'h-11 px-5 text-base gap-2 rounded-xl',
  lg: 'h-[52px] px-7 text-base gap-2.5 rounded-2xl',
};

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, icon: Icon, iconEnd: IconEnd, full, className, children, to, href, type = 'button', ...rest },
  ref,
) {
  const cls = cx(
    'relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold',
    'transition-[transform,filter,background-color,border-color,box-shadow] duration-200 ease-out active:scale-[.97]',
    'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-ring',
    VARIANTS[variant], SIZES[size], full && 'w-full', className,
  );
  const content = (
    <>
      {loading && <span className="absolute inset-0 grid place-items-center"><Spinner /></span>}
      <span className={cx('inline-flex items-center gap-[inherit]', loading && 'invisible')}>
        {Icon && <Icon className="h-[1.15em] w-[1.15em] shrink-0" strokeWidth={2} aria-hidden="true" />}
        {children}
        {IconEnd && <IconEnd className="h-[1.15em] w-[1.15em] shrink-0 flip-rtl" strokeWidth={2} aria-hidden="true" />}
      </span>
    </>
  );
  if (to) return <Link ref={ref} to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a ref={ref} href={href} className={cls} {...rest}>{content}</a>;
  return <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{content}</button>;
});

export default Button;

export const IconButton = forwardRef(function IconButton({ label, icon: Icon, className, size = 'md', variant = 'ghost', badge, to, iconClass, ...rest }, ref) {
  const s = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-12 w-12' }[size];
  const cls = cx(
    'relative inline-grid shrink-0 place-items-center rounded-full transition duration-200 active:scale-90 focus-visible:outline-none focus-visible:shadow-ring',
    variant === 'ghost' && 'hover:bg-fg/[0.07]',
    variant === 'surface' && 'bg-elevated/90 shadow-soft backdrop-blur hover:bg-elevated',
    variant === 'outline' && 'border border-line hover:bg-fg/[0.05]',
    s, className,
  );
  const inner = (
    <>
      <Icon className={cx('h-[22px] w-[22px]', iconClass)} strokeWidth={1.75} aria-hidden="true" />
      {badge}
    </>
  );
  if (to) return <Link ref={ref} to={to} aria-label={label} title={label} className={cls} {...rest}>{inner}</Link>;
  return <button ref={ref} type="button" aria-label={label} title={label} className={cls} {...rest}>{inner}</button>;
});
