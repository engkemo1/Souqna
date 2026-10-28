/* Twist service worker: offline fallback, reusable public images, order push notifications, and the offline cashier.
 * API responses are deliberately left to the network so prices, stock, carts, and orders stay live.
 * The cashier (/pos) is the one screen that must open with no internet at all, so its page and its hashed build files are kept. */
const VERSION = 'bo-sw-v5';
const IMAGE_CACHE = 'bo-images-v1';
const ASSET_CACHE = 'bo-assets-v1';
const SHELL_CACHE = 'bo-shell-v1';
const KEEP = [VERSION, IMAGE_CACHE, ASSET_CACHE, SHELL_CACHE];
const MAX_CACHED_IMAGES = 180;
const MAX_CACHED_ASSETS = 400;
const OFFLINE = '/offline.html';
const POS_SHELL = '/pos';
const isPos = (pathname) => pathname === '/pos' || pathname.startsWith('/pos/');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bo-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/** The cashier page: network first (so a new deploy shows up), but never wait long on a bad connection. */
async function posShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(POS_SHELL);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cached ? 3500 : 15000);
  try {
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) cache.put(POS_SHELL, res.clone()).catch(() => {});
    return res;
  } catch {
    clearTimeout(timer);
    return cached || (await caches.match(OFFLINE)) || Response.error();
  }
}

/** A real build file, never the HTML page a missing file can come back as (after a deploy the old names are gone). */
const realAsset = (res) => res.ok && !String(res.headers.get('content-type') || '').includes('text/html');

/** Build files have a hash in their name, so a cached copy is always the right copy. */
async function hashedAsset(req) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (realAsset(res)) { cache.put(req, res.clone()).then(() => trim(cache, MAX_CACHED_ASSETS)).catch(() => {}); }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    if (url.origin === self.location.origin && isPos(url.pathname)) { e.respondWith(posShell(req)); return; }
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) { e.respondWith(hashedAsset(req)); return; }

  // Product images have immutable, unique media URLs. Keep only public image GETs,
  // with no query string or authorization header, so signed/private URLs are excluded.
  if (req.destination === 'image' && !req.headers.has('authorization') && !req.headers.has('range')) {
    if (url.protocol !== 'https:' || url.search) return;
    e.respondWith((async () => {
      let cache;
      try {
        cache = await caches.open(IMAGE_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
      } catch {
        // A disabled/full browser cache must never prevent an image from loading.
        return fetch(req);
      }

      const response = await fetch(req);
      // Opaque responses are normal for public cross-origin image hosts. Storage is
      // best-effort: quota errors still return the successfully fetched image.
      if (response.ok || response.type === 'opaque') {
        try {
          await cache.put(req, response.clone());
          await trim(cache, MAX_CACHED_IMAGES);
        } catch { /* keep the network response usable if storage is unavailable */ }
      }
      return response;
    })());
  }
});

/* The page that is open when the worker first takes control has already loaded its files without us.
 * The cashier screen sends us what it loaded so the very first visit is enough to work offline afterwards. */
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'cache-pos') return;
  const reply = (ok) => { try { e.source?.postMessage({ type: 'pos-cache', ok }); } catch { /* the page went away */ } };
  e.waitUntil((async () => {
    try {
      const assets = await caches.open(ASSET_CACHE);
      const urls = (d.urls || []).filter((u) => { try { const x = new URL(u, self.location.origin); return x.origin === self.location.origin && x.pathname.startsWith('/assets/'); } catch { return false; } });
      await Promise.all(urls.map(async (u) => { if (!(await assets.match(u))) { const r = await fetch(u); if (realAsset(r)) await assets.put(u, r); } }));
      const shell = await caches.open(SHELL_CACHE);
      const page = await fetch(POS_SHELL, { cache: 'no-cache' });
      if (page.ok) await shell.put(POS_SHELL, page);
      reply(page.ok);
    } catch { reply(false); }
  })());
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Twist', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Twist', {
    body: d.body || '', icon: '/brand/twist-192.png', badge: '/brand/badge-96.png', tag: d.tag || undefined, renotify: !!d.tag,
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
