import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cx } from './cx.js';

const ToastContext = createContext(() => {});
let uid = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((opts) => {
    const id = ++uid;
    const item = typeof opts === 'string' ? { title: opts } : opts;
    setToasts((t) => [...t.slice(-2), { id, tone: 'success', duration: 3200, ...item }]);
    setTimeout(() => dismiss(id), item.duration || (item.action ? 5000 : 3200));
    return id;
  }, [dismiss]);

  const value = useMemo(() => toast, [toast]);
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--toast-offset,16px)+var(--safe-b))] z-[95] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:end-6 sm:start-auto sm:top-6 sm:items-end">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = t.icon || icons[t.tone] || Info;
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                role={t.tone === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-3 text-white shadow-lift">
                {t.image ? <img src={t.image} alt="" className="h-11 w-9 shrink-0 rounded-md object-cover" /> : (
                  <Icon className={cx('h-5 w-5 shrink-0', t.tone === 'error' ? 'text-red-400' : t.tone === 'success' ? 'text-emerald-400' : 'text-sky-300')} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{t.title}</p>
                  {t.description && <p className="mt-0.5 truncate text-[13px] text-white/70">{t.description}</p>}
                </div>
                {t.action && (
                  <button type="button" onClick={() => { t.action.onClick(); dismiss(t.id); }} className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline">
                    {t.action.label}
                  </button>
                )}
                <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-me-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
