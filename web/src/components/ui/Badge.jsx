import { cx } from './cx.js';

const TONES = {
  neutral: 'bg-fg/[0.07] text-fg',
  brand: 'bg-primary text-on-primary',
  accent: 'bg-accent text-on-accent',
  sale: 'bg-sale text-on-sale',
  success: 'bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-600/25',
  warning: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-600/25',
  danger: 'bg-red-100 text-red-900 ring-1 ring-inset ring-red-600/25',
  info: 'bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-600/25',
  violet: 'bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-600/25',
  white: 'bg-white/95 text-neutral-900 shadow-sm backdrop-blur',
  dark: 'bg-neutral-900/85 text-white backdrop-blur',
};

export default function Badge({ tone = 'neutral', className, children, dot, size = 'md' }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold', size === 'sm' ? 'h-5 px-2 text-xs' : 'h-6 px-2.5 text-xs', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE = { pending: 'warning', confirmed: 'info', processing: 'violet', shipped: 'info', delivered: 'success', cancelled: 'danger' };
export function StatusBadge({ status, t, size }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'} dot size={size}>{t(`status.${status}`)}</Badge>;
}
