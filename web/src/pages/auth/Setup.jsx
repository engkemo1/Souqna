import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, tokenStore } from '../../lib/api.js';
import Brand from '../../components/market/Brand.jsx';

export default function Setup() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/auth/setup/${token}`).then(setInfo).catch((e) => setError(e.message || 'اللينك ده مش شغال.'));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('الباسورد لازم يكون 8 حروف أو أكتر.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api(`/auth/setup/${token}`, { method: 'POST', body: { password } });
      tokenStore.set(r.token);
      window.location.assign('/dashboard');
    } catch (err) { setError(err.message || 'حصلت مشكلة، جرّب تاني.'); setBusy(false); }
  };

  return (
    <div dir="rtl" className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-black/5">
        <Brand className="mb-6" />
        {!info && !error && <p className="text-muted">جاري التحميل…</p>}
        {error && !info && <p className="text-red-700">{error}</p>}
        {info && (
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <h1 className="text-xl font-semibold">أهلاً {info.name}</h1>
              <p className="mt-1 text-sm text-muted">فعّل حساب متجر {info.store}. اختار باسورد تدخل بيه لوحة المحل.</p>
            </div>
            <label className="grid gap-1 text-sm">الإيميل<input className="rounded-lg border px-3 py-2" value={info.email} readOnly dir="ltr" /></label>
            <label className="grid gap-1 text-sm">الباسورد الجديد<input className="rounded-lg border px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required dir="ltr" autoComplete="new-password" /></label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="rounded-full bg-black py-2.5 font-semibold text-white disabled:opacity-60">{busy ? '…' : 'تفعيل ودخول اللوحة'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
