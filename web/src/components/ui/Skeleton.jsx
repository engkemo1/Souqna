import { cx } from './cx.js';

export default function Skeleton({ className, style, circle }) {
  return <div aria-hidden="true" style={style} className={cx('skeleton', circle && 'rounded-full', className)} />;
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-3.5" style={{ width: `${i === lines - 1 ? 60 : 100 - i * 8}%` }} />)}
    </div>
  );
}
