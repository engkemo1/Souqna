/* Banha Outfit service worker: offline fallback, reusable public images, and order push notifications.
 * API responses are deliberately left to the network so prices, stock, carts, and orders stay live. */
const VERSION = 'bo-sw-v2';
const IMAGE_CACHE = 'bo-images-v1';
const MAX_CACHED_IMAGES = 180;
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bo-') && k !== VERSION && k !== IMAGE_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Product images have immutable, unique media URLs. Keep only public image GETs,
  // with no query string or authorization header, so signed/private URLs are excluded.
  if (req.destination === 'image' && !req.headers.has('authorization') && !req.headers.has('range')) {
    const url = new URL(req.url);
    if (url.protocol !== 'https:' || url.search) return;
    e.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      const response = await fetch(req);
      // Opaque responses are normal for public cross-origin image hosts.
      if (response.ok || response.type === 'opaque') {
        await cache.put(req, response.clone());
        const keys = await cache.keys();
        if (keys.length > MAX_CACHED_IMAGES) {
          await Promise.all(keys.slice(0, keys.length - MAX_CACHED_IMAGES).map((key) => cache.delete(key)));
        }
      }
      return response;
    })());
  }
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
