import { Mail } from 'lucide-react';
import { SOCIAL, CONTACT_EMAIL, SALES_WHATSAPP } from '../../config/contact.js';
import { cx } from '../ui/cx.js';

const Facebook = (p) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" /></svg>;
const Instagram = (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
const TikTok = (p) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.32 2.7 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.4a7.34 7.34 0 0 0 4.3 1.38V7.72s-1.88.09-3.24-1.9z" /></svg>;
const WhatsApp = (p) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .17 5.33.17 11.88c0 2.09.55 4.13 1.59 5.93L0 24l6.35-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.17-1.23-6.15-3.42-8.43zM12.06 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.77.99 1-3.67-.24-.38a9.88 9.88 0 0 1-1.52-5.27c0-5.46 4.45-9.9 9.92-9.9 2.65 0 5.13 1.03 7 2.9a9.84 9.84 0 0 1 2.9 7.01c0 5.46-4.45 9.91-9.88 9.91zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" /></svg>;

const ITEMS = [
  ['WhatsApp', `https://wa.me/${SALES_WHATSAPP}`, WhatsApp],
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
