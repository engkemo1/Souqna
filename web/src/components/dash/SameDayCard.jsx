import { useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import Button from '../ui/Button.jsx';
import { Input } from '../ui/Field.jsx';
import { errorMessage } from '../ui/States.jsx';
import { useToast } from '../ui/Toast.jsx';
import { cx } from '../ui/cx.js';

/** The store decides, day by day, whether it delivers today. It switches itself off at the cut-off and at midnight. */
export default function SameDayCard({ className }) {
  const { t, lang } = useI18n();
  const { store, setStore } = useAuth();
  const toast = useToast();
  const [until, setUntil] = useState(store?.sameDayUntil || '18:00');
  const [busy, setBusy] = useState(false);
  if (!store) return null;
  const on = !!store.sameDay;
  const fmt = (hm) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${hm}:00`));
  const send = async (turnOn) => {
    setBusy(true);
    try { const r = await api('/owner/store/same-day', { method: 'PUT', body: { on: turnOn, until } }); setStore(r.store); toast({ title: t('sameday.dash.saved'), tone: 'success' }); }
    catch (x) { toast({ tone: 'error', title: x.fields?.until === 'time_passed' ? t('sameday.dash.passed') : errorMessage(t, x) }); }
    setBusy(false);
  };
  return (
    <section className={cx('rounded-2xl border p-5', on ? 'border-emerald-300 bg-emerald-50' : 'border-line bg-elevated', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', on ? 'bg-emerald-600 text-white' : 'bg-secondary text-brand')}><Zap className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="font-semibold">{t('sameday.dash.title')}</h2>
            <p className="mt-0.5 text-sm text-muted">{on ? t('sameday.dash.active', { time: fmt(store.sameDayUntil) }) : store.sameDaySet ? t('sameday.dash.passed') : t('sameday.dash.body')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!on && <label className="flex items-center gap-2 text-sm text-muted">{t('sameday.dash.until')}<Input type="time" dir="ltr" value={until} onChange={(e) => setUntil(e.target.value)} className="!h-10 w-32" /></label>}
          {on ? <Button variant="outline" size="sm" loading={busy} onClick={() => send(false)}>{t('sameday.dash.off')}</Button> : <Button size="sm" loading={busy} onClick={() => send(true)}>{t('sameday.dash.on')}</Button>}
        </div>
      </div>
    </section>
  );
}
