import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '../../lib/i18n.jsx';
import AnimatedNumber from '../ui/AnimatedNumber.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { cx } from '../ui/cx.js';

export function PageHeader({ title, subtitle, actions, back, className }) {
  const { isRtl, t } = useI18n();
  const navigate = useNavigate();
  const Back = isRtl ? ArrowRight : ArrowLeft;
  return (
    <div className={cx('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {back && (
          <button type="button" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(back))} className="-ms-2 mb-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted hover:bg-fg/[0.05] hover:text-fg">
            <Back className="h-4 w-4" />{t('common.back')}
          </button>
        )}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, bodyClassName, subtitle }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border border-line bg-elevated', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-5 sm:px-6">
          <div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
          {action}
        </div>
      )}
      <div className={cx('p-5 sm:p-6', title && 'pt-4 sm:pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ to, children }) {
  return <Link to={to} className="shrink-0 text-sm font-semibold text-brand hover:underline">{children}</Link>;
}

export function Delta({ value, suffix = '%', inverse }) {
  if (value == null) return null;
  const up = value >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span dir="ltr" className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular', good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
      <Icon className="h-3.5 w-3.5" />{up ? '+' : '−'}{Math.abs(value)}{suffix}
    </span>
  );
}

export function KpiCard({ label, value, format, delta, deltaSuffix, icon: Icon, loading, tone = 'neutral', hint }) {
  const tones = { neutral: 'bg-fg/[0.05] text-fg', brand: 'bg-secondary text-brand', accent: 'bg-orange-50 text-orange-700', violet: 'bg-violet-50 text-violet-700', sky: 'bg-sky-50 text-sky-700' };
  return (
    <div className="rounded-2xl border border-line bg-elevated p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-muted sm:text-sm">{label}</p>
        {Icon && <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl', tones[tone])}><Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" /></span>}
      </div>
      {loading ? <Skeleton className="mt-3 h-7 w-24" /> : (
        <p className="mt-2 truncate text-[22px] font-semibold tracking-tight sm:mt-3 sm:text-[26px]"><AnimatedNumber value={value} format={format} /></p>
      )}
      <div className="mt-2 flex min-h-[22px] flex-wrap items-center gap-2">
        {loading ? <Skeleton className="h-4 w-14" /> : delta != null && <Delta value={delta} suffix={deltaSuffix} />}
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
    </div>
  );
}

/** Scrollable status chips with counts — tabs on desktop, swipeable on mobile. */
export function FilterTabs({ value, onChange, options, className }) {
  return (
    <div className={cx('scroll-x -mx-4 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0', className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(o.value)}
            className={cx('relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition', active ? 'text-canvas' : 'bg-elevated text-fg ring-1 ring-inset ring-line hover:ring-line-strong')}>
            {active && <motion.span layoutId={`tabs-${options.length}`} className="absolute inset-0 rounded-full bg-fg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="relative">{o.label}</span>
            {o.count != null && <span className={cx('relative rounded-full px-1.5 text-xs tabular', active ? 'bg-white/20' : 'bg-fg/[0.06] text-muted')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  const { t, isRtl } = useI18n();
  if (pages <= 1) return null;
  const Prev = isRtl ? ChevronRight : ChevronLeft;
  const Next = isRtl ? ChevronLeft : ChevronRight;
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <p className="text-sm text-muted">{t('common.page', { p: page, n: pages })}</p>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('common.previous')} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-elevated transition hover:border-line-strong disabled:opacity-40"><Prev className="h-4 w-4" /></button>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('common.next')} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-elevated transition hover:border-line-strong disabled:opacity-40"><Next className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className }) {
  return (
    <div className={cx('relative', className)}>
      <svg className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="h-11 w-full rounded-xl border border-line-strong bg-elevated ps-10 pe-3 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-ring focus:shadow-ring" />
    </div>
  );
}

export function ListSkeleton({ rows = 6 }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-elevated">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
