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
  const { t, lang } = useI18n();
  const toast = useToast();
  const { store } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [notes, setNotes] = useState('');
  const text = t(`design.waText.${what}`, { name: store?.name?.ar || store?.name?.en || '' });

  const send = async () => {
    setBusy(true);
    try {
      await api('/owner/services/design', { method: 'POST', body: { what, notes: notes.trim() || null } });
      invalidate('/owner/services');
      setSent(true);
      toast({ title: t('design.sent'), description: t('design.sentBody') });
    } catch (x) { toast({ tone: 'error', title: errorMessage(t, x) }); }
    setBusy(false);
  };

  return (
    <div className={`grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-line bg-secondary/40 p-4 text-sm ${className}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand"><Palette className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="break-words font-semibold">{t('design.title')}</p>
        <p className="mt-0.5 break-words text-[13px] leading-relaxed text-muted">{t(`design.body.${what}`)}</p>
      </div>
      {!sent && (
        <label className="col-span-2 block min-w-0 text-[13px] font-medium">
          {lang === 'ar' ? 'تعليماتك للتصميم (اختياري)' : 'Your design instructions (optional)'}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={3} maxLength={500}
            placeholder={lang === 'ar' ? 'مثال: عايزه بألوان الأبيض والذهبي، واكتبوا اسم المحل، ومعاه الصورة اللي رفعتها فوق.' : 'e.g. white and gold colours, include the store name and the photo I uploaded above.'}
            className="mt-1 w-full rounded-xl border border-line bg-elevated p-3 text-sm font-normal outline-none focus:border-fg" />
          <span className="mt-1 block text-xs font-normal text-muted">{lang === 'ar' ? 'ارفع صورتك في خانة الغلاف فوق، واكتب تعليماتك هنا، وفريقنا هيصمم لك على أساسها.' : 'Upload your photo in the cover slot above, write instructions here, and our team will design from them.'}</span>
        </label>
      )}
      <div className="col-span-2 flex min-w-0 flex-wrap gap-2">
        <Button size="sm" icon={Send} loading={busy} disabled={sent} onClick={send}>{sent ? t('design.sentShort') : t('design.request')}</Button>
        <Button variant="outline" size="sm" href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">{t('design.cta')}</Button>
      </div>
    </div>
  );
}
