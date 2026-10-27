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

/** Which browser / device the owner is on, and the exact "add to home screen" steps for it. Pure text, no side effects. */
export function installGuide(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const ios = /iphone|ipad|ipod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|TikTok|musical_ly|Snapchat|Line\/|Twitter|LinkedInApp|; wv\)/i.test(ua);
  if (inApp) {
    return { browser: 'متصفح التطبيق (فيسبوك / إنستجرام / واتساب…)', inApp: true,
      steps: ['المتصفح اللي جوّا التطبيق مبيسمحش بالتثبيت.', ios ? 'اضغط على ⋯ أو أيقونة المتصفح واختار «فتح في Safari».' : 'اضغط على ⋮ واختار «فتح في Chrome» أو «فتح في المتصفح».', 'بعد ما يفتح، كمّل من نفس الزرار هنا.'] };
  }
  if (ios) {
    if (/CriOS/.test(ua)) return { browser: 'Chrome على الآيفون', steps: ['اضغط أيقونة المشاركة في شريط العنوان (أو ⋯ ثم «مشاركة»).', 'اختار «إضافة إلى الشاشة الرئيسية».', 'اضغط «إضافة» وافتح التطبيق من الأيقونة.', 'لو مش ظاهرة عندك، افتح اللينك في Safari.'] };
    if (/EdgiOS/.test(ua)) return { browser: 'Edge على الآيفون', steps: ['اضغط ⋯ تحت ثم «مشاركة».', 'اختار «إضافة إلى الشاشة الرئيسية».', 'اضغط «إضافة». لو مش ظاهرة، افتح اللينك في Safari.'] };
    if (/FxiOS|OPiOS|OPT\//.test(ua)) return { browser: 'متصفح تاني على الآيفون', steps: ['افتح نفس اللينك في Safari (انسخه من الزرار تحت).', 'اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».', 'اضغط «إضافة».'] };
    return { browser: 'Safari على الآيفون', steps: ['اضغط زرار المشاركة (المربع والسهم) تحت. وعلى الآيباد هتلاقيه فوق.', 'انزل واختار «إضافة إلى الشاشة الرئيسية».', 'اضغط «إضافة» وافتح التطبيق من الأيقونة.'] };
  }
  if (android) {
    if (/SamsungBrowser/.test(ua)) return { browser: 'Samsung Internet', steps: ['اضغط ≡ (القائمة) تحت.', 'اختار «إضافة صفحة إلى» ثم «الشاشة الرئيسية» (أو «تثبيت التطبيق» لو ظهرت).', 'أكّد بـ «إضافة».'] };
    if (/Firefox/.test(ua)) return { browser: 'Firefox على الأندرويد', steps: ['اضغط ⋮ (القائمة).', 'اختار «تثبيت» أو «إضافة إلى الشاشة الرئيسية».', 'أكّد بـ «إضافة».'] };
    if (/EdgA/.test(ua)) return { browser: 'Edge على الأندرويد', steps: ['اضغط ⋯ تحت.', 'اختار «إضافة إلى الهاتف» ثم «الشاشة الرئيسية».', 'أكّد بـ «إضافة».'] };
    if (/OPR\//.test(ua)) return { browser: 'Opera على الأندرويد', steps: ['اضغط ⋮ ثم «الشاشة الرئيسية».', 'أكّد بـ «إضافة».'] };
    return { browser: 'Chrome على الأندرويد', steps: ['اضغط ⋮ فوق.', 'اختار «تثبيت التطبيق» (أو «إضافة إلى الشاشة الرئيسية»).', 'اضغط «تثبيت».'] };
  }
  if (/Edg\//.test(ua)) return { browser: 'Edge على الكمبيوتر', steps: ['اضغط أيقونة التثبيت في آخر شريط العنوان (أو ⋯ ثم «التطبيقات» ثم «تثبيت هذا الموقع كتطبيق»).', 'اضغط «تثبيت».'] };
  if (/Firefox/.test(ua)) return { browser: 'Firefox على الكمبيوتر', steps: ['Firefox على الكمبيوتر مبيثبتش التطبيقات.', 'افتح اللينك في Chrome أو Edge وثبّته من هناك.'] };
  if (/Safari/.test(ua) && !/Chrome|Chromium/.test(ua)) return { browser: 'Safari على الماك', steps: ['من قايمة «ملف» اختار «إضافة إلى Dock».', 'اضغط «إضافة».'] };
  return { browser: 'Chrome على الكمبيوتر', steps: ['اضغط أيقونة التثبيت في آخر شريط العنوان (أو ⋮ ثم «حفظ ومشاركة» ثم «تثبيت الصفحة كتطبيق»).', 'اضغط «تثبيت».'] };
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


/** Shopper phone notifications (order status, price drops, offers). Same service worker as the store owners' alerts. */
export function useBuyerPush() {
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
    if (perm !== 'granted') { await refresh(); return false; }
    const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
    const { key } = await api('/buyer/push/key');
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
    await api('/buyer/push/subscribe', { method: 'POST', body: sub.toJSON() });
    await refresh(); return true;
  }, [refresh]);
  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) { await api('/buyer/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
    await refresh();
  }, [refresh]);
  return { supported, ...state, enable, disable };
}

/** While the shop owner (or the admin) is on their screens, the page installs as its own app and opens on that dashboard. */
export function useAppManifest(href = '/store-app.webmanifest', name = 'لوحة المحل') {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    const title = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const prev = { href: link?.getAttribute('href'), title: title?.getAttribute('content') };
    link?.setAttribute('href', href);
    title?.setAttribute('content', name);
    return () => {
      if (prev.href) link?.setAttribute('href', prev.href);
      if (prev.title) title?.setAttribute('content', prev.title);
    };
  }, [href, name]);
}
export const useStoreAppManifest = () => useAppManifest('/store-app.webmanifest', 'لوحة المحل');

/** Ask the browser not to wipe the saved sign-in when it is short on space. */
export function keepStorage() { try { navigator.storage?.persist?.(); } catch { /* ignore */ } }
