import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { api } from '../../lib/api.js';
import { Field, Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import AuthShell from './AuthShell.jsx';
import InstallStoreApp from '../../components/auth/InstallStoreApp.jsx';
import { useStoreAppManifest } from '../../lib/pwa.js';

// The demo account only exists on a seeded dev database. On the live site it is not shown (and the old demo shops are gone).
const PLATFORM_WA = '201206928670'; // Twist team WhatsApp (same default as the server's PLATFORM_WA)
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === '1';

export default function Login() {
  useStoreAppManifest();
  const { t } = useI18n();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e, creds = form) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds.email.trim(), creds.password);
      navigate(params.get('next') || '/dashboard', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const [waUrl, setWaUrl] = useState('');
  const forgot = async () => {
    const email = form.email.trim();
    const hasEmail = /^\S+@\S+\.\S+$/.test(email);
    const text = `أهلاً Twist، نسيت باسورد لوحة المحل.${hasEmail ? ` الإيميل: ${email}.` : ''} محتاج لينك باسورد جديد.`;
    let url = `https://wa.me/${PLATFORM_WA}?text=${encodeURIComponent(text)}`;
    if (hasEmail) { try { const r = await api('/auth/forgot', { method: 'POST', body: { email } }); if (r?.wa) url = r.wa; } catch { /* the plain WhatsApp link below still works */ } }
    setError(null);
    setWaUrl(url);
    window.location.href = url; // a normal navigation: pop-ups opened after an await are blocked on phones
  };
  const demo = () => { const c = { email: 'ahmed@banhalook.app', password: 'demo1234' }; setForm(c); submit(null, c); };

  useEffect(() => { if (SHOW_DEMO && params.get('demo') === '1' && !user) demo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (user && !busy) return <Navigate to="/dashboard" replace />;
  const fe = fieldErrors(t, error);

  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-bold">{t('auth.loginTitle')}</h1>
      <p className="mt-2 text-muted">{t('auth.loginBody')}</p>

      {SHOW_DEMO && (
      <button type="button" onClick={demo} disabled={busy}
        className="group mt-8 flex w-full items-center gap-4 rounded-2xl border border-dashed border-primary/40 bg-secondary p-4 text-start transition hover:border-primary active:scale-[.99] disabled:opacity-60">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-on-primary"><Sparkles className="h-5 w-5" /></span>
        <span><span className="block font-semibold text-brand">{t('auth.demo')}</span><span className="block text-sm text-muted">{t('auth.demoHint')}</span></span>
      </button>
      )}

      <div className="my-7 flex items-center gap-4 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t('common.or')}<span className="h-px flex-1 bg-line" /></div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t('auth.email')} error={fe.email}><Input type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="text-start" /></Field>
        <Field label={t('auth.password')} error={fe.password}>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="pe-12 text-start" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={t('auth.showPassword')} className="absolute end-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg">{show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
          </div>
        </Field>
        {error && !Object.keys(fe).length && <p role="alert" className="rounded-xl bg-sale/10 px-4 py-3 text-sm font-medium text-sale">{errorMessage(t, error)}</p>}
        <Button type="submit" full size="lg" loading={busy}>{t('auth.signIn')}</Button>
        <button type="button" onClick={forgot} className="w-full text-center text-sm font-medium text-brand hover:underline">نسيت الباسورد؟ كلّم Twist على واتساب</button>
        {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="block w-full rounded-xl bg-secondary px-4 py-3 text-center text-sm font-semibold text-brand">لو واتساب مفتحش، اضغط هنا لفتحه</a>}
      </form>
      <InstallStoreApp className="mt-8" />
      <p className="mt-8 text-center text-sm text-muted">{t('app.name')} · {t('app.tagline')}</p>
    </AuthShell>
  );
}
