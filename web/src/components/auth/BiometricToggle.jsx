import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { bioSupported, bioEnabled, bioEnable, bioDisable } from '../../lib/biometric.js';
import { Switch } from '../ui/Field.jsx';
import { cx } from '../ui/cx.js';

/** Turn the fingerprint / Face ID lock on or off for this phone. */
export default function BiometricToggle({ className }) {
  const { user } = useAuth();
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(() => !!user && bioEnabled(user.id));
  const [err, setErr] = useState('');
  useEffect(() => { bioSupported().then(setOk); }, []);
  if (!ok || !user) return null;
  const change = async (v) => {
    setErr('');
    if (!v) { bioDisable(); setOn(false); return; }
    try { await bioEnable(user); setOn(true); } catch { setErr('ماتفعّلتش. اتأكد إن البصمة أو قفل الشاشة متظبطين في الموبايل.'); }
  };
  return (
    <div className={cx('rounded-2xl border border-line bg-elevated p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-brand"><Fingerprint className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><Switch checked={on} onChange={change} label="قفل اللوحة بالبصمة / Face ID" description="لما تفتح التطبيق يطلب بصمتك. حسابك يفضل مسجّل لحد ما تعمل خروج." /></div>
      </div>
      {err && <p role="alert" className="mt-2 text-sm font-medium text-sale">{err}</p>}
    </div>
  );
}
