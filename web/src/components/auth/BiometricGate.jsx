import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { bioEnabled, bioUnlock, bioUnlocked, bioLock, noteHidden, awayLong } from '../../lib/biometric.js';
import { useStoreAppManifest } from '../../lib/pwa.js';
import { BrandMark } from '../market/Brand.jsx';

/** Wraps the dashboard. If the owner turned on the fingerprint lock, it asks for it when the app opens. */
export default function BiometricGate({ children }) {
  useStoreAppManifest();
  const { user, logout } = useAuth();
  const armed = !!user && bioEnabled(user.id);
  const [locked, setLocked] = useState(() => armed && !bioUnlocked());
  const [err, setErr] = useState('');

  const unlock = useCallback(async () => {
    setErr('');
    try { await bioUnlock(); setLocked(false); } catch { setErr('ماتأكدش. جرّب تاني.'); }
  }, []);

  useEffect(() => { if (armed && !bioUnlocked()) setLocked(true); }, [armed]);
  useEffect(() => { if (locked) unlock(); }, [locked, unlock]);
  useEffect(() => {
    if (!armed) return undefined;
    const onVis = () => {
      if (document.hidden) noteHidden();
      else if (awayLong()) { bioLock(); setLocked(true); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [armed]);

  if (!armed || !locked) return children;
  return (
    <div dir="rtl" className="fixed inset-0 z-[100] grid place-items-center bg-canvas px-6 text-center">
      <div className="w-full max-w-xs">
        <BrandMark className="mx-auto h-12 w-auto" />
        <p className="mt-6 text-lg font-semibold">لوحة المحل مقفولة</p>
        <p className="mt-1 text-sm text-muted">أكّد بصمتك أو وشك أو قفل الموبايل عشان تفتح.</p>
        <button type="button" onClick={unlock} className="mx-auto mt-8 grid h-24 w-24 place-items-center rounded-full bg-secondary text-brand transition active:scale-95" aria-label="فتح بالبصمة"><Fingerprint className="h-12 w-12" /></button>
        {err && <p role="alert" className="mt-4 text-sm font-medium text-sale">{err}</p>}
        <button type="button" onClick={logout} className="mx-auto mt-10 inline-flex items-center gap-2 text-sm text-muted hover:text-fg"><LogOut className="h-4 w-4" />دخول بحساب تاني</button>
      </div>
    </div>
  );
}
