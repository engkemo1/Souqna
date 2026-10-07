import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useI18n } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import AuthShell from './AuthShell.jsx';

export default function Register() {
  const { t } = useI18n();
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', store_name: '', phone: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [local, setLocal] = useState({});
  if (user && !busy) return <Navigate to="/dashboard" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const l = {};
    if (form.name.trim().length < 2) l.name = t('field.required');
    if (form.store_name.trim().length < 2) l.store_name = t('field.required');
    if (!/^01[0125][0-9]{8}$/.test(form.phone)) l.phone = t('field.phone_invalid');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) l.email = t('field.email_invalid');
    if (form.password.length < 8) l.password = t('field.password_short');
    setLocal(l);
    if (Object.keys(l).length) return;
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };
  const fe = { ...fieldErrors(t, error), ...local };

  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-medium">{t('auth.registerTitle')}</h1>
      <p className="mt-2 text-muted">{t('auth.registerBody')}</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.name')} error={fe.name}><Input autoComplete="name" value={form.name} onChange={set('name')} /></Field>
          <Field label={t('auth.storeName')} error={fe.store_name}><Input value={form.store_name} onChange={set('store_name')} /></Field>
        </div>
        <Field label={t('auth.phone')} error={fe.phone}><Input type="tel" inputMode="numeric" dir="ltr" maxLength={11} placeholder="01xxxxxxxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} className="text-start" /></Field>
        <Field label={t('auth.email')} error={fe.email}><Input type="email" autoComplete="email" dir="ltr" value={form.email} onChange={set('email')} className="text-start" /></Field>
        <Field label={t('auth.password')} error={fe.password} hint={t('field.password_short')}><Input type="password" autoComplete="new-password" dir="ltr" value={form.password} onChange={set('password')} className="text-start" /></Field>
        {error && !Object.keys(fieldErrors(t, error)).length && <p role="alert" className="rounded-xl bg-sale/10 px-4 py-3 text-sm font-medium text-sale">{errorMessage(t, error)}</p>}
        <Button type="submit" full size="lg" loading={busy}>{t('auth.create')}</Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">{t('auth.haveAccount')} <Link to="/login" className="font-semibold text-brand hover:underline">{t('auth.login')}</Link></p>
    </AuthShell>
  );
}
