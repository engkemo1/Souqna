import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Store, Camera, Heart, User } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

/** Phone-only bottom navigation: the five things a shopper actually does. The camera (search by photo) is the raised centre action. */
export default function MobileBottomNav() {
  const { t, lang } = useI18n();
  const { pathname } = useLocation();

  // keep the page content clear of the fixed bar (phones only)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => { document.body.style.paddingBottom = mq.matches ? 'calc(4.25rem + env(safe-area-inset-bottom))' : ''; };
    apply(); mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); document.body.style.paddingBottom = ''; };
  }, []);

  const items = [
    { to: '/', icon: Home, label: lang === 'ar' ? 'الرئيسية' : 'Home', on: pathname === '/' },
    { to: '/stores', icon: Store, label: lang === 'ar' ? 'المحلات' : 'Stores', on: pathname.startsWith('/stores') },
    { to: '/visual', icon: Camera, label: lang === 'ar' ? 'بالصورة' : 'By photo', on: pathname.startsWith('/visual'), main: true },
    { to: '/favorites', icon: Heart, label: t('store.favorites'), on: pathname.startsWith('/favorites') },
    { to: '/account', icon: User, label: t('acc.title'), on: pathname.startsWith('/account') },
  ];

  return (
    <nav aria-label={lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'} className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_-12px_rgba(20,33,61,.25)] backdrop-blur-md md:hidden">
      <ul className="mx-auto grid h-[4.25rem] max-w-md grid-cols-5 items-end px-2">
        {items.map(({ to, icon: Icon, label, on, main }) => (
          <li key={to} className="flex justify-center">
            <Link to={to} aria-current={on ? 'page' : undefined} className="group flex w-full flex-col items-center gap-1 pb-2 text-[11px] font-semibold">
              {main ? (
                <span className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-[0_10px_24px_-6px_rgba(244,81,0,.55)] ring-4 ring-white transition active:scale-95"><Icon className="h-6 w-6" strokeWidth={2} /></span>
              ) : (
                <span className={cx('grid h-8 w-12 place-items-center rounded-full transition', on ? 'bg-brand/10 text-brand' : 'text-[#5b6679] group-active:bg-fg/5')}><Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.25 : 1.75} /></span>
              )}
              <span className={cx(on || main ? 'text-brand' : 'text-[#5b6679]')}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
