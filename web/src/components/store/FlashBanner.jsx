import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useStore, sp } from '../../lib/store.jsx';
import { useI18n } from '../../lib/i18n.jsx';

const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

/** عدّاد عرض حقيقي: بينتهي فعلًا في الموعد اللي صاحب المحل حدده وبعدها البانر بيختفي (مفيش عدّاد بيتجدد). */
export default function FlashBanner() {
  const { store } = useStore();
  const { tr, lang } = useI18n();
  const f = store?.customization?.flash;
  const end = f?.endsAt ? new Date(f.endsAt).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!f?.enabled || !end) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [f?.enabled, end]);
  if (!f?.enabled || !end || end <= now) return null;
  const left = Math.floor((end - now) / 1000);
  const d = Math.floor(left / 86400); const hh = Math.floor((left % 86400) / 3600); const mm = Math.floor((left % 3600) / 60); const ss = left % 60;
  const title = (lang === 'ar' ? f.title_ar : f.title_en) || f.title_ar || f.title_en || (lang === 'ar' ? 'عرض لفترة محدودة' : 'Limited-time offer');
  const to = sp(store.slug, f.target === 'new' ? 'shop?sort=newest' : f.target === 'shop' ? 'shop' : 'shop?sale=1');
  const cells = [...(d > 0 ? [[d, lang === 'ar' ? 'يوم' : 'd']] : []), [hh, lang === 'ar' ? 'ساعة' : 'h'], [mm, lang === 'ar' ? 'دقيقة' : 'm'], [ss, lang === 'ar' ? 'ثانية' : 's']];
  return (
    <div className="container mt-8 sm:mt-12">
      <Link to={to} className="flex flex-col items-center justify-between gap-4 rounded-3xl bg-primary px-5 py-5 text-on-primary sm:flex-row sm:px-8" aria-label={title}>
        <span className="flex items-center gap-3 font-display text-lg font-bold sm:text-2xl"><Zap className="h-6 w-6 shrink-0 text-accent" />{title}</span>
        <span className="flex items-center gap-2" dir="ltr" role="timer" aria-live="off">
          {cells.map(([v, l]) => (
            <span key={l} className="grid min-w-[56px] place-items-center rounded-xl bg-on-primary/15 px-2 py-1.5">
              <span className="font-mono text-xl font-bold tabular-nums sm:text-2xl">{pad(v)}</span>
              <span className="text-[10px] opacity-75">{l}</span>
            </span>
          ))}
        </span>
      </Link>
    </div>
  );
}
