import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferredPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; window.dispatchEvent(new Event('bo:installable')); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; window.dispatchEvent(new Event('bo:installable')); });
}

/** Install-to-home-screen state. `canPrompt` = the browser offers a native install dialog; `ios` = needs the manual Share → Add steps. */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((x) => x + 1); window.addEventListener('bo:installable', f); return () => window.removeEventListener('bo:installable', f); }, []);
  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null; tick((x) => x + 1);
    return r?.outcome === 'accepted';
  }, []);
  return { installed: isStandalone(), canPrompt: !!deferredPrompt, ios: isIOS(), install };
}

/** New-order push notifications for this device. */
export function usePush() {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [state, setState] = useState({ ready: false, enabled: false, permission: supported ? Notification.permission : 'unsupported' });

  const refresh = useCallback(async () => {
    if (!supported) return setState({ ready: true, enabled: false, permission: 'unsupported' });
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState({ ready: true, enabled: !!sub && Notification.permission === 'granted', permission: Notification.permission });
    } catch { setState({ ready: true, enabled: false, permission: Notification.permission }); }
  }, [supported]);
  useEffect(() => { refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { await refresh(); return { ok: false, reason: 'denied' }; }
    const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
    const { key } = await api('/owner/push/key');
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
    await api('/owner/push/subscribe', { method: 'POST', body: sub.toJSON() });
    await refresh();
    return { ok: true };
  }, [refresh]);

  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) { await api('/owner/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
    await refresh();
  }, [refresh]);

  const test = useCallback(() => api('/owner/push/test', { method: 'POST', body: {} }), []);
  return { supported, ...state, enable, disable, test };
}
