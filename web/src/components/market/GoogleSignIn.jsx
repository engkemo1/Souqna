import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useBuyer } from '../../lib/buyer.jsx';

/** "Continue with Google": Google draws the button, we send its ID token to /buyer/google. Renders nothing until the site has a Google client id. */
export default function GoogleSignIn({ clientId, onDone }) {
  const { lang } = useI18n();
  const { acceptSession } = useBuyer();
  const box = useRef(null);
  const [msg, setMsg] = useState('');
  const cb = useRef(null);
  cb.current = async (resp) => {
    setMsg('');
    try { const r = await api('/buyer/google', { method: 'POST', body: { credential: resp.credential } }); acceptSession(r); onDone?.(r); }
    catch (x) { setMsg(x?.code === 'customer_blocked' ? (lang === 'ar' ? 'مش قادرين ندخلك بالحساب ده. كلمنا على واتساب خدمة عملاء Twist.' : 'This account cannot sign in. Please contact Twist support on WhatsApp.') : (lang === 'ar' ? 'معرفناش ندخلك بجوجل. جرّب تاني أو ادخل بالواتساب.' : 'Google sign-in failed. Try again or use WhatsApp.')); }
  };
  useEffect(() => {
    if (!clientId) return undefined;
    let dead = false;
    const init = () => {
      const g = window.google?.accounts?.id;
      if (dead || !g || !box.current) return;
      g.initialize({ client_id: clientId, callback: (r) => cb.current?.(r), auto_select: false, cancel_on_tap_outside: true });
      box.current.innerHTML = '';
      g.renderButton(box.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', width: Math.min(360, Math.max(240, box.current.offsetWidth || 320)), locale: lang === 'ar' ? 'ar' : 'en' });
    };
    if (window.google?.accounts?.id) init();
    else {
      let s = document.querySelector('script[data-gsi]');
      if (!s) { s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.dataset.gsi = '1'; document.head.appendChild(s); }
      s.addEventListener('load', init);
      return () => { dead = true; s.removeEventListener('load', init); };
    }
    return () => { dead = true; };
  }, [clientId, lang]);
  if (!clientId) return null;
  return (
    <div className="mt-5">
      <div ref={box} className="flex min-h-[44px] justify-center" />
      {msg && <p role="alert" className="mt-2 text-center text-[13px] font-medium text-sale">{msg}</p>}
      <div className="my-4 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" />{lang === 'ar' ? 'أو' : 'or'}<span className="h-px flex-1 bg-line" /></div>
    </div>
  );
}
