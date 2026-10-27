import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.js';
import { q } from './db/index.js';
import { mediaMap } from './lib/media.js';
import publicRoutes, { loadSharedLook } from './routes/public.js';
import ownerRoutes from './routes/owner.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import cashierRoutes from './routes/cashier.js';
import posRoutes from './routes/pos.js';
import { errorHandler } from './lib/errors.js';
import buyerRoutes from './routes/buyer.js';
import { startDailySummary } from './lib/daily-summary.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// OpenStreetMap tiles are refused without a Referer, so send the origin (helmet's default is no-referrer)
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const SITE_ORIGIN = 'https://twistegy.com';
const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /dashboard',
    'Disallow: /account',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /market-cart',
    'Disallow: /market-checkout',
    'Disallow: /market-order-success',
    'Disallow: /track',
    'Disallow: /favorites',
    'Disallow: /visual',
    'Disallow: /s/*/cart',
    'Disallow: /s/*/checkout',
    'Disallow: /s/*/order/',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n'));
});

app.get('/sitemap.xml', (_req, res) => {
  const urls = [
    `${SITE_ORIGIN}/`,
    `${SITE_ORIGIN}/join`,
  ];
  const stores = q.all(`SELECT s.id, s.slug FROM stores s WHERE s.status='active' AND s.hidden=0 AND s.search_indexable=1
    AND EXISTS (SELECT 1 FROM products p WHERE p.store_id=s.id AND p.status='active') ORDER BY s.id LIMIT 49998`);
  urls.push(...stores.map(({ slug }) => `${SITE_ORIGIN}/s/${encodeURIComponent(slug)}`));
  const remaining = 50000 - urls.length;
  if (remaining > 0) urls.push(...q.all(`SELECT s.slug AS store_slug, p.slug AS product_slug FROM products p
    JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND s.search_indexable=1
    ORDER BY p.id LIMIT ?`, [remaining]).map(({ store_slug, product_slug }) =>
    `${SITE_ORIGIN}/s/${encodeURIComponent(store_slug)}/p/${encodeURIComponent(product_slug)}`));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((loc) => `  <url><loc>${xml(loc)}</loc></url>`).join('\n')}\n</urlset>`;
  res.type('application/xml').set('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600').send(body);
});

// Do not index the demo catalogue or checkout flows. Real stores become indexable
// automatically when they are created; only public, active products enter the sitemap.
app.use((req, res, next) => {
  if (req.path === '/stores') res.set('X-Robots-Tag', 'noindex, follow');
  if (req.path.startsWith('/s/')) {
    const [, , slug, ...tail] = req.path.split('/');
    let decodedSlug = '';
    try { decodedSlug = decodeURIComponent(slug || ''); } catch { /* malformed path: keep it out of search */ }
    const store = decodedSlug ? q.get("SELECT search_indexable FROM stores WHERE slug=? AND status='active' AND hidden=0", [decodedSlug]) : null;
    if (!store?.search_indexable || tail[0] === 'cart' || tail[0] === 'checkout' || tail[0] === 'order') res.set('X-Robots-Tag', 'noindex, follow');
  }
  next();
});

// Media renditions are content-addressed → cache forever (CDN friendly).
app.use('/media', express.static(config.mediaDir, { immutable: true, maxAge: '365d', fallthrough: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cashier/v1', cashierRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api', publicRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));

// Serve the built web app (single-origin deployment).
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); if (/\/(sw\.js|offline\.html)$|\.webmanifest$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const withSeo = (html, { title, description, url, image }) => html
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${esc(url)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${esc(image)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${esc(image)}" />`);
  app.get('/s/:slug/p/:pslug', (req, res, next) => {
    const item = q.get(`SELECT p.id, p.name_ar, p.seo_title, p.seo_description, p.description_ar, s.name_ar AS store_name_ar
      FROM products p JOIN stores s ON s.id=p.store_id
      WHERE s.slug=? AND s.status='active' AND s.hidden=0 AND s.search_indexable=1 AND p.slug=? AND p.status='active'`, [req.params.slug, req.params.pslug]);
    if (!item) return next();
    const mediaId = q.get('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [item.id])?.media_id;
    const imageBase = mediaMap([mediaId]).get(mediaId)?.base;
    const url = `${SITE_ORIGIN}${req.path}`;
    const title = `${item.seo_title || item.name_ar} | ${item.store_name_ar} | Twist بنها`;
    const description = item.seo_description || item.description_ar || `${item.name_ar} من ${item.store_name_ar} على Twist بنها.`;
    const image = imageBase ? `${imageBase.startsWith('http') ? '' : SITE_ORIGIN}${imageBase}/original.jpg` : `${SITE_ORIGIN}/brand/twist-share.png`;
    const html = fs.readFileSync(path.join(config.webDist, 'index.html'), 'utf8');
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(withSeo(html, { title, description, url, image }));
  });
  app.get('/s/:slug', (req, res, next) => {
    const store = q.get("SELECT id, name_ar, description_ar, logo_media_id, cover_media_id FROM stores WHERE slug=? AND status='active' AND hidden=0 AND search_indexable=1", [req.params.slug]);
    if (!store) return next();
    const images = mediaMap([store.cover_media_id, store.logo_media_id]);
    const imageBase = images.get(store.cover_media_id)?.base || images.get(store.logo_media_id)?.base;
    const url = `${SITE_ORIGIN}${req.path}`;
    const title = `${store.name_ar} | ملابس وأزياء في بنها على Twist`;
    const description = store.description_ar || `تسوق من ${store.name_ar} في بنها عبر Twist.`;
    const image = imageBase ? `${imageBase.startsWith('http') ? '' : SITE_ORIGIN}${imageBase}/original.jpg` : `${SITE_ORIGIN}/brand/twist-share.png`;
    const html = fs.readFileSync(path.join(config.webDist, 'index.html'), 'utf8');
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(withSeo(html, { title, description, url, image }));
  });
  app.get('/join', (_req, res) => {
    const title = 'Twist بنها | افتح متجرك الإلكتروني لمحلك';
    const description = 'Twist منصة بنها للتسوق المحلي. نجهز لمحلات الملابس متجرًا إلكترونيًا باسمها، مع متابعة الطلبات واشتراك شهري من غير عمولة على البيع.';
    const html = fs.readFileSync(path.join(config.webDist, 'index.html'), 'utf8');
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(withSeo(html, {
      title, description, url: `${SITE_ORIGIN}/join`, image: `${SITE_ORIGIN}/brand/twist-share.png`,
    }));
  });
  // shared looks get their own preview card (WhatsApp / Facebook read the OG tags, not the SPA)
  app.get('/look/:token', (req, res, next) => {
    try {
      const look = loadSharedLook(req.params.token);
      if (!look || !look.pieces.length) return next();
      const origin = `${req.protocol}://${req.get('host')}`;
      const m = look.pieces[0].image;
      const sz = m ? ([...m.sizes].sort((a, b) => a.width - b.width).find((x) => x.width >= 600) || m.sizes[m.sizes.length - 1]) : null;
      const img = m && sz ? `${m.base.startsWith('http') ? '' : origin}${m.base}/original.jpg` : `${origin}/brand/twist-share.png`;
      const visual = look.kind === 'visual';
      const title = visual ? (look.title || 'لقيت دول في محلات بنها') : `${look.title || 'لوك من Twist'} · ${look.pieces.length} قطع`;
      const desc = visual ? `${look.pieces.slice(0, 4).map((p) => `${p.name.ar || p.name.en || p.name} — ${p.price} ج.م`).join(' | ')}` : `${look.pieces.map((p) => p.name.ar || p.name.en || p.name).join(' + ')} — ${look.total} ج.م`;
      const tags = `<meta property="og:type" content="website" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:image" content="${esc(img)}" /><meta property="og:url" content="${esc(origin + req.originalUrl)}" /><meta name="twitter:card" content="summary_large_image" />`;
      const html = fs.readFileSync(path.join(config.webDist, 'index.html'), 'utf8').replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>${tags}`);
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    } catch (e) { next(); }
  });
  // The owner's and the admin's screens install as their own apps. The right manifest is written into the page by the server,
  // so "Add to home screen" opens the dashboard / admin even before any script has run.
  const APP_SHELLS = [
    [/^\/(login|dashboard)(\/|$)/, '/store-app.webmanifest', 'لوحة المحل'],
    [/^\/admin(\/|$)/, '/admin-app.webmanifest', 'إدارة Twist'],
  ];
  app.get('*', (req, res) => {
    const hit = APP_SHELLS.find(([re]) => re.test(req.path));
    if (!hit) return res.sendFile(path.join(config.webDist, 'index.html'));
    const html = fs.readFileSync(path.join(config.webDist, 'index.html'), 'utf8')
      .replace('<link rel="manifest" href="/manifest.webmanifest" />', `<link rel="manifest" href="${hit[1]}" />`)
      .replace('<meta name="apple-mobile-web-app-title" content="Twist Store" />', `<meta name="apple-mobile-web-app-title" content="${hit[2]}" />`);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });
}

app.use(errorHandler);

import('./db/index.js').then(({ q }) => q.run("UPDATE users SET role='demo' WHERE email=? AND role='owner'", [config.demoEmail]));
import('./lib/backup.js').then((m) => m.startBackupSchedule());
import('./lib/departments.js').then(async (m) => { const n = m.backfillDepartments(); if (n) console.log(`[departments] filled ${n} product(s) without a department`); const t = await m.backfillProductTypes(); if (t) console.log(`[types] inferred type/audience for ${t} product(s)`); });
import('./lib/visual.js').then((m) => m.startVisualIndexer());
export { app };

// Allow boot.js to hand us an already-listening server (so the health-check
// listener stays alive during the slow first-boot DB setup).
export function startServer(existingServer) {
  startDailySummary();
  if (existingServer) {
    // Reuse the existing bound socket — no new port needed.
    // the warm-up handler answers {status:'starting'} to every request — drop it, or it would keep answering first
    existingServer.removeAllListeners('request');
    existingServer.on('request', app);
    console.log(`Twist API ready on http://localhost:${config.port}`);
  } else {
    app.listen(config.port, () => console.log(`Twist API ready on http://localhost:${config.port}`));
  }
}

// When executed directly (not imported by boot.js) start normally.
if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
