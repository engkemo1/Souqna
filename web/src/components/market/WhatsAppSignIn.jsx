import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import { useBuyer } from '../../lib/buyer.jsx';
import Button from '../ui/Button.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { errorMessage } from '../ui/States.jsx';

/** Sign in with a one-time code sent on WhatsApp: number → code → (name, first time only). */
export default function WhatsAppSignIn({ onPassword, onDone, intro, className }) {
  const { t, lang } = useI18n();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const { acceptSession } = useBuyer();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const id = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(id); }, [wait]);
  const explain = (x) => ({
    phone_invalid: L('اكتب رقم موبايل مصري صحيح (01xxxxxxxxx)', 'Enter a valid Egyptian mobile number'),
    otp_wait: L('استنى شوية قبل ما تطلب كود جديد', 'Wait a little before asking for a new code'),
    otp_wrong: L('الكود مش صح، راجعه وجرب تاني', 'Wrong code, try again'),
    otp_expired: L('الكود خلص وقته، اطلب كود جديد', 'The code expired, ask for a new one'),
    otp_locked: L('محاولات كتير غلط، اطلب كود جديد', 'Too many wrong tries, ask for a new one'),
    wa_send_failed: L('معرفناش نبعت الكود. اتأكد إن الرقم عليه واتساب', 'Could not send the code. Make sure the number has WhatsApp'),
    wa_unavailable: L('الدخول بواتساب مش متاح دلوقتي، ادخل بالباسورد', 'WhatsApp sign-in is unavailable, use your password'),
    too_many_attempts: L('محاولات كتير، استنى دقايق', 'Too many attempts, wait a few minutes'),
  }[x?.fields?.phone === 'phone_invalid' ? 'phone_invalid' : x?.code] || errorMessage(t, x));
  const send = async (e) => {
    e?.preventDefault(); setBusy(true); setMsg('');
    try { const r = await api('/buyer/otp/send', { method: 'POST', body: { phone } }); setStep('code'); setCode(''); setWait(r.resendIn || 45); }
    catch (x) { setMsg(explain(x)); if (x.code === 'otp_wait') setStep('code'); }
    setBusy(false);
  };
  const verify = async (e, withName) => {
    e?.preventDefault(); if (code.length !== 6) return; setBusy(true); setMsg('');
    try {
      const r = await api('/buyer/otp/verify', { method: 'POST', body: { phone, code, ...(withName ? { name } : {}) } });
      if (r.needName) setStep('name'); else { acceptSession(r); onDone?.(r); }
    } catch (x) { setMsg(explain(x)); if (x.code === 'otp_wrong') setCode(''); }
    setBusy(false);
  };
  return (
    <div className={className ?? 'mt-5 space-y-4 rounded-3xl border border-line bg-elevated p-5 sm:p-6'}>
      {intro && <p className="text-sm leading-relaxed text-muted">{intro}</p>}
      {step === 'phone' && (
        <form onSubmit={send} className="space-y-4">
          <Field label={t('acc.phone')} hint={L('هنبعتلك كود على واتساب، من غير باسورد.', 'We send you a code on WhatsApp — no password.')}>
            <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className="text-start" required autoComplete="tel" />
          </Field>
          {msg && <p role="alert" className="text-[13px] font-medium text-sale">{msg}</p>}
          <Button type="submit" size="lg" full loading={busy} icon={MessageCircle}>{L('ابعتلي الكود على واتساب', 'Send me the code on WhatsApp')}</Button>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-muted">{L('بعتنا كود من 6 أرقام على واتساب للرقم', 'We sent a 6-digit code on WhatsApp to')} <b dir="ltr" className="text-fg">{phone}</b></p>
          <Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} aria-label={L('الكود', 'Code')}
            onChange={(e) => { const v = e.target.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 6); setCode(v); }}
            className="text-center text-2xl font-bold tracking-[0.5em]" placeholder="••••••" />
          {msg && <p role="alert" className="text-[13px] font-medium text-sale">{msg}</p>}
          <Button type="submit" size="lg" full loading={busy} disabled={code.length !== 6}>{t('acc.login')}</Button>
          <div className="flex items-center justify-between text-[13px]">
            <button type="button" onClick={() => { setStep('phone'); setMsg(''); }} className="font-semibold text-brand">{L('غيّر الرقم', 'Change number')}</button>
            <button type="button" disabled={wait > 0 || busy} onClick={send} className="font-semibold text-brand disabled:text-muted">{wait > 0 ? L(`ابعت تاني بعد ${wait} ث`, `Resend in ${wait}s`) : L('ابعت الكود تاني', 'Resend code')}</button>
          </div>
        </form>
      )}
      {step === 'name' && (
        <form onSubmit={(e) => verify(e, true)} className="space-y-4">
          <p className="text-sm text-muted">{L('أول مرة تدخل؟ اكتب اسمك وخلاص.', 'First time? Just tell us your name.')}</p>
          <Field label={t('acc.name')}><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" autoFocus /></Field>
          {msg && <p role="alert" className="text-[13px] font-medium text-sale">{msg}</p>}
          <Button type="submit" size="lg" full loading={busy}>{t('acc.register')}</Button>
        </form>
      )}
      {onPassword && <button type="button" onClick={onPassword} className="block w-full text-center text-[13px] font-semibold text-muted hover:text-fg">{L('عندك باسورد؟ ادخل بالباسورد', 'Have a password? Sign in with it')}</button>}
    </div>
  );
}
