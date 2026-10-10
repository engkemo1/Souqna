import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useIsPresent } from 'framer-motion';
import { X } from 'lucide-react';
import { useLockBody, useMediaQuery } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from './cx.js';

const ease = [0.22, 1, 0.36, 1];

/** While the overlay animates out it must not swallow taps meant for the page underneath (e.g. re-opening the cart). */
function Layer({ className, children }) {
  const present = useIsPresent();
  return <div className={className} style={present ? undefined : { pointerEvents: 'none' }}>{children}</div>;
}

/**
 * One overlay primitive for the whole product:
 *   side="bottom"  mobile bottom sheet (drag-to-dismiss)
 *   side="end"     side drawer (cart, filters on desktop)
 *   side="center"  dialog
 *   side="auto"    bottom on phones, `desktop` (end|center) from 640px
 */
export default function Sheet({ open, onClose, title, description, children, footer, side = 'auto', desktop = 'center', size = 'md', className, bodyClassName, hideHeader }) {
  const isSm = useMediaQuery('(min-width: 640px)');
  const { isRtl, t } = useI18n();
  const resolved = side === 'auto' ? (isSm ? desktop : 'bottom') : side;
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const titleId = useId();
  const drag = useDragControls();
  useLockBody(open);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => closeRef.current?.();

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const id = setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 40);
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.();
      if (e.key === 'Tab' && panelRef.current) {
        const els = panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); document.removeEventListener('keydown', onKey); restoreRef.current?.focus?.({ preventScroll: true }); };
  }, [open]);

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
  const drawerW = { sm: 'w-[380px]', md: 'w-[440px]', lg: 'w-[560px]', xl: 'w-[720px]' };
  const off = isRtl ? '-100%' : '100%';
  const variants = {
    bottom: { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } },
    end: { initial: { x: off }, animate: { x: 0 }, exit: { x: off } },
    center: { initial: { opacity: 0, scale: 0.96, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97, y: 8 } },
  }[resolved];

  const panelCls = {
    bottom: 'fixed inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] pb-safe',
    end: cx('fixed inset-y-0 end-0 max-w-[100vw]', drawerW[size]),
    center: cx('relative w-full max-h-[88dvh] rounded-3xl', widths[size]),
  }[resolved];

  return createPortal(
    <AnimatePresence>
      {open && (
        <Layer className={cx('fixed inset-0 z-[80]', resolved === 'center' && 'grid place-items-center p-4')}>
          <motion.div className="absolute inset-0 bg-neutral-950/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={close} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            {...variants}
            transition={{ duration: 0.42, ease }}
            drag={resolved === 'bottom' ? 'y' : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) close(); }}
            className={cx('flex flex-col overflow-hidden bg-elevated text-fg shadow-sheet outline-none', panelCls, className)}
          >
            {resolved === 'bottom' && (
              <div className="flex cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing" onPointerDown={(e) => drag.start(e)}>
                <span className="h-1.5 w-10 rounded-full bg-fg/15" />
              </div>
            )}
            {!hideHeader && (title || onClose) && (
              <div className={cx('flex items-start justify-between gap-4 px-5 sm:px-6', resolved === 'bottom' ? 'pb-3 pt-1' : 'border-b border-line py-4')}
                onPointerDown={resolved === 'bottom' ? (e) => drag.start(e) : undefined}>
                <div className="min-w-0">
                  {title && <h2 id={titleId} className="text-lg font-semibold leading-tight">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                </div>
                <button type="button" onClick={close} aria-label={t('common.close')} className="-me-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-fg/[0.06] hover:text-fg">
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6', bodyClassName)}>{children}</div>
            {footer && <div className="border-t border-line bg-elevated px-5 py-4 sm:px-6">{footer}</div>}
          </motion.div>
        </Layer>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, danger, loading, children }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={title} size="sm" side="auto" desktop="center"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-5 font-semibold text-fg hover:bg-fg/[0.06]">{t('common.cancel')}</button>
          <button type="button" onClick={onConfirm} disabled={loading} className={cx('h-11 rounded-xl px-5 font-semibold transition active:scale-[.97] disabled:opacity-60', danger ? 'bg-sale text-white' : 'bg-btn text-on-btn')}>
            {loading ? t('common.saving') : confirmLabel}
          </button>
        </div>
      )}>
      <div className="pb-4 text-base text-muted">{body}{children}</div>
    </Sheet>
  );
}
