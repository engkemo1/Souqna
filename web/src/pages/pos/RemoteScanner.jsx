import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X, ScanBarcode, Monitor, WifiOff } from 'lucide-react';
import { useTheme, DASHBOARD_THEME } from '../../lib/theme.js';
import CameraScanner from '../../components/pos/CameraScanner.jsx';

const API = (token, p = '') => `/api/pos-remote/${encodeURIComponent(token)}${p}`;

/**
 * The phone's page when it is used as a barcode scanner for the cashier on a computer (opened from the QR).
 * Each code goes to the cashier screen, which answers what it did; the phone shows it, beeps and vibrates.
 */
export default function RemoteScanner() {
  useTheme(DASHBOARD_THEME);
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | invalid | blocked
  const [store, setStore] = useState('');
  const [screen, setScreen] = useState(false);
  const [log, setLog] = useState([]);
  const [manual, setManual] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const audio = useRef(null);
  const [camKey, setCamKey] = useState(0);
  // the camera stops when the phone locks or the page is hidden; start it again when the cashier comes back,
  // and keep the screen awake while scanning
  useEffect(() => {
    let lock = null;
    const awake = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ } };
    awake();
    const onVis = () => { if (document.visibilityState === 'visible') { setCamKey((k) => k + 1); awake(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, []);

  const hello = useCallback(async () => {
    try {
      const res = await fetch(API(token));
      if (res.status === 404) { setState('invalid'); return; }
      if (res.status === 403) { setState('blocked'); return; }
      const d = await res.json();
      setStore(d.store); setScreen(!!d.screen); setState('ready');
    } catch { /* offline: try again later */ }
  }, [token]);
  useEffect(() => {
    hello();
    const id = setInterval(hello, 15000); // also tells the computer the phone is still here
    const on = () => { setOnline(true); hello(); }; const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { clearInterval(id); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [hello]);

  const beep = (ok) => {
    try {
      const ctx = audio.current || (audio.current = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = ok ? 1250 : 330; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.09 : 0.25));
    } catch { /* no sound */ }
    try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch { /* no vibration */ }
  };

  const send = useCallback(async (code) => {
    const at = Date.now();
    setLog((l) => [{ at, code, state: 'sending', text: '' }, ...l].slice(0, 12));
    const set = (patch) => setLog((l) => l.map((x) => (x.at === at ? { ...x, ...patch } : x)));
    try {
      const res = await fetch(API(token, '/scan'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      if (res.status === 404) { setState('invalid'); return; }
      if (res.status === 429) { set({ state: 'bad', text: 'بالراحة شوية… امسح تاني' }); beep(false); return; }
      const d = await res.json();
      if (!d.delivered) { setScreen(false); set({ state: 'bad', text: 'شاشة الكاشير على الكمبيوتر مقفولة. افتحها وامسح تاني.' }); beep(false); return; }
      setScreen(true);
      if (!d.answer) { set({ state: 'ok', text: 'وصل للكاشير' }); beep(true); return; }
      set({ state: d.answer.ok ? 'ok' : 'bad', text: d.answer.text }); beep(d.answer.ok);
    } catch { set({ state: 'bad', text: 'مفيش نت على الموبايل' }); beep(false); }
  }, [token]);

  const box = 'mx-auto w-full max-w-md px-4';
  if (state === 'invalid' || state === 'blocked') return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center text-fg" dir="rtl"><div className="max-w-sm">
      <ScanBarcode className="mx-auto h-10 w-10 text-muted" />
      <h1 className="mt-3 text-xl font-bold">{state === 'invalid' ? 'اللينك ده مبقاش شغال' : 'الكاشير مش متاح للمحل ده دلوقتي'}</h1>
      <p className="mt-2 text-muted">{state === 'invalid' ? 'افتح الكاشير على الكمبيوتر، دوس «موبايل كقارئ»، وامسح الكود الجديد.' : 'كلّم فريق Twist.'}</p>
    </div></div>);

  return (
    <div className="min-h-dvh bg-canvas pb-8 text-fg" dir="rtl">
      <header className="border-b border-line bg-elevated py-3"><div className={box}>
        <h1 className="text-lg font-bold">قارئ باركود · {store || '…'}</h1>
        <p className={'mt-1 inline-flex items-center gap-1.5 text-sm font-medium ' + (!online ? 'text-amber-700' : screen ? 'text-success' : 'text-sale')}>
          {!online ? <WifiOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          {!online ? 'مفيش نت على الموبايل' : screen ? 'متوصل بالكاشير على الكمبيوتر' : 'شاشة الكاشير على الكمبيوتر مقفولة'}
        </p>
      </div></header>
      <main className={box + ' mt-4 space-y-4'}>
        {state === 'loading' ? <p className="py-10 text-center text-muted">بنجهّز…</p> : <CameraScanner key={camKey} continuous onCode={send} />}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = manual.trim(); if (c) { send(c); setManual(''); } }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder="أو اكتب الكود بإيدك" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-elevated px-3 text-base" />
          <button type="submit" className="h-12 rounded-xl bg-btn px-4 font-semibold text-on-btn">ابعت</button>
        </form>
        {log.length > 0 && (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-elevated">
            {log.map((x) => (
              <li key={x.at} className="flex items-start gap-2.5 p-3 text-sm">
                <span className={'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ' + (x.state === 'ok' ? 'bg-success text-white' : x.state === 'bad' ? 'bg-sale text-white' : 'bg-fg/10')}>
                  {x.state === 'ok' ? <Check className="h-4 w-4" /> : x.state === 'bad' ? <X className="h-4 w-4" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-fg/40" />}
                </span>
                <div className="min-w-0"><p className="font-mono text-xs text-muted" dir="ltr">{x.code}</p><p className="font-medium">{x.text || 'بيتبعت…'}</p></div>
              </li>))}
          </ul>)}
        <p className="text-center text-xs text-muted">خلي الصفحة دي مفتوحة والموبايل مش مقفول. الموبايل والكمبيوتر لازم يكون عليهم نت.</p>
      </main>
    </div>
  );
}
