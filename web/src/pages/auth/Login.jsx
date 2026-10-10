import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import AuthShell from './AuthShell.jsx';

export default function Login() {
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
      await login(creds.email, creds.password);
      navigate(params.get('next') || '/dashboard', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const demo = () => { const c = { email: 'ahmed@banhalook.app', password: 'demo1234' }; setForm(c); submit(null, c); };

  useEffect(() => { if (params.get('demo') === '1' && !user) demo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (user && !busy) return <Navigate to="/dashboard" replace />;
  const fe = fieldErrors(t, error);

  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-bold">{t('auth.loginTitle')}</h1>
      <p className="mt-2 text-muted">{t('auth.loginBody')}</p>

      <button type="button" onClick={demo} disabled={busy}
        className="group mt-8 flex w-full items-center gap-4 rounded-2xl border border-dashed border-primary/40 bg-secondary p-4 text-start transition hover:border-primary active:scale-[.99] disabled:opacity-60">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-on-primary"><Sparkles className="h-5 w-5" /></span>
        <span><span className="block font-semibold text-brand">{t('auth.demo')}</span><span className="block text-sm text-muted">{t('auth.demoHint')}</span></span>
      </button>

      <div className="my-7 flex items-center gap-4 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t('common.or')}<span className="h-px flex-1 bg-line" /></div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t('auth.email')} error={fe.email}><Input type="email" autoComplete="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="text-start" /></Field>
        <Field label={t('auth.password')} error={fe.password}>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="pe-12 text-start" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={t('auth.showPassword')} className="absolute end-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg">{show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
          </div>
        </Field>
        {error && !Object.keys(fe).length && <p role="alert" className="rounded-xl bg-sale/10 px-4 py-3 text-sm font-medium text-sale">{errorMessage(t, error)}</p>}
        <Button type="submit" full size="lg" loading={busy}>{t('auth.signIn')}</Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">Banha Outfit · بنها أوتفيت</p>
    </AuthShell>
  );
}
