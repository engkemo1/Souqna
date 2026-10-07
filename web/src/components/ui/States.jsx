import { motion } from 'framer-motion';
import { RefreshCw, WifiOff, SearchX } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import Button from './Button.jsx';
import { cx } from './cx.js';

export function EmptyState({ icon: Icon = SearchX, title, body, action, className, art, compact }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className={cx('mx-auto flex max-w-md flex-col items-center text-center', compact ? 'py-10' : 'py-16 sm:py-20', className)}>
      {art || (
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-3 rounded-full bg-primary/[0.07]" />
          <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-elevated text-brand shadow-soft ring-1 ring-line">
            <Icon className="h-7 w-7" strokeWidth={1.6} />
          </div>
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

/** Friendly error — never exposes server internals. */
export function ErrorState({ error, onRetry, className, compact }) {
  const { t } = useI18n();
  const offline = error?.code === 'network';
  return (
    <EmptyState
      compact={compact}
      className={className}
      icon={offline ? WifiOff : RefreshCw}
      title={offline ? t('error.network') : t('error.title')}
      body={offline ? null : t('error.body')}
      action={onRetry && <Button variant="outline" icon={RefreshCw} onClick={onRetry}>{t('common.retry')}</Button>}
    />
  );
}

export function errorMessage(t, error) {
  if (!error) return '';
  const key = `error.${error.code}`;
  const msg = t(key);
  return msg === key ? t('error.body') : msg;
}

/** Map API field errors (codes) to translated strings. */
export function fieldErrors(t, error) {
  if (!error?.fields || typeof error.fields !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(error.fields)) {
    const key = `field.${v}`;
    const msg = t(key);
    out[k] = msg === key ? t('field.required') : msg;
  }
  return out;
}
