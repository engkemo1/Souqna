import { useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../ui/Toast.jsx';
import Input from '../ui/Input.jsx';
import Button from '../ui/Button.jsx';
import { Field } from '../ui/Field.jsx';
import { Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';

export default function ForcedPasswordChangeModal() {
  const { mustChangePassword, changePassword, logout } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!mustChangePassword) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.trim().length < 8) {
      setErr('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (password !== confirm) {
      setErr('تأكيد كلمة المرور غير متطابق.');
      return;
    }
    setBusy(true);
    try {
      await changePassword({ current, password });
      toast({ title: 'تم تغيير كلمة المرور بنجاح ✅' });
    } catch (e2) {
      setErr(e2.fields?.current ? 'كلمة المرور الحالية غير صحيحة.' : (e2.message || 'فشل تغيير كلمة المرور، حاول مجدداً.'));
    } finally {
      setBusy(false);
    }
  };

  const attrs = { dir: 'ltr', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, type: show ? 'text' : 'password' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center gap-3 text-sale">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sale/10">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-fg">تغيير كلمة المرور إلزامي</h2>
            <p className="text-xs text-muted">يرجى تعيين كلمة مرور جديدة لحسابك للمتابعة.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="كلمة المرور الحالية (المؤقتة)">
            <Input
              {...attrs}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>

          <Field label="كلمة المرور الجديدة" hint="8 أحرف أو أكثر">
            <div className="relative">
              <Input
                {...attrs}
                autoComplete="new-password"
                className="pe-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShow((x) => !x)}
                aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute end-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg"
              >
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </Field>

          <Field label="تأكيد كلمة المرور الجديدة">
            <Input
              {...attrs}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>

          {err && (
            <div className="flex items-center gap-2 rounded-xl border border-sale/30 bg-sale/10 p-3 text-sm text-sale" role="alert">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 pt-2">
            <Button type="submit" loading={busy} disabled={!current || !password || !confirm}>
              تحديث كلمة المرور
            </Button>
            <button
              type="button"
              onClick={logout}
              className="mt-1 text-center text-xs font-medium text-muted hover:text-fg"
            >
              تسجيل الخروج
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
