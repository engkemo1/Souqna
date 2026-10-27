import { Mail } from 'lucide-react';
import { SOCIAL, CONTACT_EMAIL } from '../../config/contact.js';
import { cx } from '../ui/cx.js';

const Facebook = (p) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" /></svg>;
const Instagram = (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
const TikTok = (p) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.32 2.7 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.4a7.34 7.34 0 0 0 4.3 1.38V7.72s-1.88.09-3.24-1.9z" /></svg>;

const ITEMS = [
  ['Facebook', SOCIAL.facebook, Facebook],
  ['Instagram', SOCIAL.instagram, Instagram],
  ['TikTok', SOCIAL.tiktok, TikTok],
  ['Email', `mailto:${CONTACT_EMAIL}`, Mail],
];

/** Round icon links to Twist's profiles and e-mail. */
export default function SocialLinks({ className, size = 'h-9 w-9' }) {
  return (
    <ul className={cx('flex items-center gap-2', className)}>
      {ITEMS.map(([label, href, Icon]) => (
        <li key={label}>
          <a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} aria-label={label} title={label}
            className={cx('grid place-items-center rounded-full border border-line-strong text-fg transition hover:bg-fg/[0.06] hover:text-brand active:scale-95', size)}>
            <Icon className="h-4 w-4" />
          </a>
        </li>
      ))}
    </ul>
  );
}
