import { useState } from 'react';
import { Palette, Send } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidate } from '../../lib/hooks.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import Button from '../ui/Button.jsx';
import { errorMessage } from '../ui/States.jsx';
import { useToast } from '../ui/Toast.jsx';
import { SALES_WHATSAPP } from '../../config/contact.js';

/**
 * "Want a custom design?" card — the team prepares options (banner / cover) and the store owner picks one.
 * Two ways in: a tracked request (lands in the admin Services page + alert) and a WhatsApp chat.
 */
export default function DesignHelp({ what = 'banner', className = '' }) {
  const { t } = useI18n();
  const toast = useToast();
  const { store } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const text = t(`design.waText.${what}`, { name: store?.name?.ar || store?.name?.en || '' });

  const send = async () => {
    setBusy(true);
    try {
      await api('/owner/services/design', { method: 'POST', body: { what } });
      invalidate('/owner/services');
      setSent(true);
      toast({ title: t('design.sent'), description: t('design.sentBody') });
    } catch (x) { toast({ tone: 'error', title: errorMessage(t, x) }); }
    setBusy(false);
  };

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-line bg-secondary/40 p-4 text-sm sm:flex-row sm:items-center ${className}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand"><Palette className="h-5 w-5" /></span>
      <div className="flex-1">
        <p className="font-semibold">{t('design.title')}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{t(`design.body.${what}`)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Send} loading={busy} disabled={sent} onClick={send}>{sent ? t('design.sentShort') : t('design.request')}</Button>
        <Button variant="outline" size="sm" href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">{t('design.cta')}</Button>
      </div>
    </div>
  );
}
