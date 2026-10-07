/** Shown while a route chunk loads — a calm top progress bar, never a blank screen. */
export default function RouteFallback() {
  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden" role="progressbar" aria-label="Loading">
      <div className="h-full w-1/3 animate-[shimmer_1s_ease-in-out_infinite] bg-primary" style={{ transform: 'translateX(-100%)' }} />
    </div>
  );
}
