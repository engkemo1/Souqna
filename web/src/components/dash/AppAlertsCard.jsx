import { useState } from 'react';
import { Bell, BellOff, Smartphone, Share, Check } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { usePush, useInstall } from '../../lib/pwa.js';
import { useDashBase } from '../../lib/dashBase.js';
import Button from '../ui/Button.jsx';
import { useToast } from '../ui/Toast.jsx';

/** Turn the dashboard into an app on the phone + get a notification the moment an order arrives. */
export default function AppAlertsCard({ className = '', hideWhenDone = false }) {
  const { t } = useI18n();
  const toast = useToast();
  const base = useDashBase();
  const push = usePush();
  const inst = useInstall();
  const [busy, setBusy] = useState(false);
  if (base !== '/dashboard') return null; // admin managing a store: never register the admin's device on a store

  const onEnable = async () => {
    setBusy(true);
    try {
      const r = await push.enable();
      if (r.ok) toast({ title: t('pwa.enabled'), description: t('pwa.enabledBody') });
      else toast({ tone: 'error', title: t('pwa.denied') });
    } catch { toast({ tone: 'error', title: t('pwa.failed') }); }
    setBusy(false);
  };
  const onTest = async () => {
    setBusy(true);
    try { const r = await push.test(); toast({ title: r.delivered ? t('pwa.testSent') : t('pwa.testNone') }); } catch { toast({ tone: 'error', title: t('pwa.failed') }); }
    setBusy(false);
  };

  const needsInstallForPush = inst.ios && !inst.installed; // iPhone only allows push from the installed app
  const allDone = inst.installed && push.enabled;
  if (hideWhenDone && (allDone || !push.ready || (push.supported === false && !inst.ios && !inst.canPrompt))) return null;
  return (
    <div className={`rounded-2xl border border-line bg-elevated p-4 sm:p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand">{push.enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{allDone ? t('pwa.allDone') : t('pwa.title')}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{t('pwa.body')}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!inst.installed && inst.canPrompt && <Button size="sm" variant="outline" icon={Smartphone} onClick={inst.install}>{t('pwa.install')}</Button>}
        {push.supported && !needsInstallForPush && !push.enabled && push.permission !== 'denied' && <Button size="sm" icon={Bell} loading={busy} onClick={onEnable}>{t('pwa.enable')}</Button>}
        {push.enabled && (<>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-semibold text-emerald-800"><Check className="h-3.5 w-3.5" />{t('pwa.on')}</span>
          <Button size="sm" variant="outline" loading={busy} onClick={onTest}>{t('pwa.test')}</Button>
          <Button size="sm" variant="ghost" onClick={push.disable}>{t('pwa.off')}</Button>
        </>)}
      </div>

      {needsInstallForPush && <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface p-3 text-[13px] text-muted"><Share className="mt-0.5 h-4 w-4 shrink-0" />{t('pwa.iosSteps')}</p>}
      {push.permission === 'denied' && <p className="mt-3 rounded-xl bg-red-50 p-3 text-[13px] text-red-800">{t('pwa.blocked')}</p>}
      {!push.supported && !inst.ios && <p className="mt-3 rounded-xl bg-surface p-3 text-[13px] text-muted">{t('pwa.unsupported')}</p>}
    </div>
  );
}
