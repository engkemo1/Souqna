import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { waNumber } from '@souqna/shared/layout';
import { openNow } from './VisitCard.jsx';

/** زر واتساب عايم بهوية المحل: على صفحة المنتج بيبعت لينك المنتج جاهز، وبيوضّح لو المحل متاح للرد دلوقتي. */
export default function SmartWhatsApp({ hasBottomNav }) {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const { pathname } = useLocation();
  const cfg = store?.customization?.whatsapp;
  const num = waNumber(store?.whatsapp);
  if (!cfg?.enabled || !num) return null;
  const ar = lang === 'ar';
  const onProduct = /\/p\//.test(pathname);
  const base = (ar ? cfg.message_ar : cfg.message_en) || cfg.message_ar || cfg.message_en
    || (ar ? `أهلاً ${tr(store.name)}، عندي استفسار` : `Hi ${tr(store.name)}, I have a question`);
  const text = onProduct ? `${ar ? 'أهلاً، بسأل عن المقاس واللون المتاح لهذا الموديل:' : 'Hi, I am asking about the size/colour for this item:'} ${window.location.href}` : base;
  const open = openNow(store.hours);
  return (
    <a href={`https://wa.me/${num}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
      aria-label={ar ? 'كلّم المحل على واتساب' : 'Chat with the store on WhatsApp'}
      style={{ bottom: hasBottomNav ? 'calc(var(--bottom-nav-h) + var(--safe-b) + 16px)' : 'calc(var(--safe-b) + 16px)' }}
      className="fixed end-4 z-40 flex items-center gap-2 rounded-full bg-[#25D366] py-2.5 pe-4 ps-3 text-neutral-900 shadow-lg transition hover:brightness-95 active:scale-95">
      <MessageCircle className="h-6 w-6 shrink-0" />
      <span className="flex flex-col text-start leading-tight">
        <span className="text-[13px] font-bold">{ar ? 'واتساب' : 'WhatsApp'}</span>
        {open !== null && <span className="text-[10.5px] opacity-95">{open ? (ar ? 'متاحين للرد دلوقتي' : 'Replying now') : (ar ? 'هنرد في مواعيد الشغل' : 'We reply in working hours')}</span>}
      </span>
    </a>
  );
}
