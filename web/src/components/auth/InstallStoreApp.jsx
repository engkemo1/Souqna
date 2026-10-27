import { useState } from 'react';
import { Download, Share, SquarePlus, Smartphone } from 'lucide-react';
import { useInstall } from '../../lib/pwa.js';
import { cx } from '../ui/cx.js';

/** "Put the store dashboard on my phone's home screen". Android installs in one tap; iPhone gets the 2-step hint. */
export default function InstallStoreApp({ className }) {
  const { installed, canPrompt, ios, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  return (
    <div className={cx('rounded-2xl border border-line bg-elevated p-4', className)}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-brand"><Smartphone className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><p className="font-semibold">ثبّت لوحة المحل على موبايلك</p><p className="text-sm text-muted">أيقونة على الشاشة الرئيسية، وتفضل مسجّل دخولك لحد ما تعمل خروج.</p></div>
      </div>
      {canPrompt ? (
        <button type="button" onClick={install} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-btn font-semibold text-on-btn"><Download className="h-4 w-4" />تثبيت التطبيق</button>
      ) : (
        <>
          <button type="button" onClick={() => setHelp((v) => !v)} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-btn font-semibold text-on-btn"><Download className="h-4 w-4" />إزاي أثبّته؟</button>
          {help && (ios ? (
            <ol className="mt-3 space-y-2 text-sm text-muted">
              <li className="flex items-center gap-2"><span className="font-bold text-fg">1</span> افتح الصفحة في Safari واضغط <Share className="inline h-4 w-4" /> مشاركة.</li>
              <li className="flex items-center gap-2"><span className="font-bold text-fg">2</span> اختار <SquarePlus className="inline h-4 w-4" /> «إضافة إلى الشاشة الرئيسية».</li>
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">من قائمة المتصفح (⋮) اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». لو بتفتح من واتساب أو فيسبوك، افتح اللينك في Chrome الأول.</p>
          ))}
        </>
      )}
    </div>
  );
}
