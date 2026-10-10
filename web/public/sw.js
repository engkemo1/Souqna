/* Banha Outfit service worker: installable app shell (offline fallback) + order push notifications.
 * It never caches API responses or product data — orders and stock must always be live. */
const VERSION = 'bo-sw-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode !== 'navigate') return; // everything else goes straight to the network
  e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'بنها أوتفيت', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'بنها أوتفيت', {
    body: d.body || '', icon: '/brand/icon-192.png', badge: '/brand/badge-96.png', tag: d.tag || undefined, renotify: !!d.tag,
    dir: 'rtl', lang: 'ar', vibrate: [120, 60, 120], data: { url: d.url || '/dashboard/orders' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/dashboard/orders';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
