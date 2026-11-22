import { customerDepartments } from './lib/departments.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { publicSlug, storedSlug } from './lib/seo-slugs.js';
import { prewarm } from './lib/micro-cache.js';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.js';
import { q, db } from './db/index.js';
import { mediaMap, purgeOrphanMedia } from './lib/media.js';
import { requestObservabilityMiddleware, logger } from './lib/logger.js';
import { stopAllJobs, scheduleManagedInterval } from './lib/job-runner.js';
import publicRoutes, { loadSharedLook } from './routes/public.js';
import ownerRoutes from './routes/owner.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import cashierRoutes from './routes/cashier.js';
import posRoutes from './routes/pos.js';
import posRemoteRoutes from './routes/pos-remote.js';
import { errorHandler } from './lib/errors.js';
import buyerRoutes from './routes/buyer.js';
import waRoutes from './routes/wa.js';
import { prefetchCutoutModel } from './lib/cutout.js';
import { startReservationSweeper } from './lib/reserve.js';
import './lib/wa-products.js'; // registers the WhatsApp → product handler (dormant unless WA_ENABLED=1)
import { startDailySummary } from './lib/daily-summary.js';
import { startSaleExpiry } from './lib/sale-expiry.js';
import { startLateOrderAlerts } from './lib/insights.js';
import { registerDefaultProviders } from './lib/image-providers.js';
import { startIndexNow, indexNowKey } from './lib/indexnow.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

// OpenStreetMap tiles are refused without a Referer, so send the origin (helmet's default is no-referrer)
// Content-Security-Policy: locks framing, base URI, plugins and form targets; resources stay open to https so maps, fonts and media keep working
const r2Origin = config.r2?.publicUrl ? [config.r2.publicUrl] : [];
const siteOrigin = config.siteUrl ? [config.siteUrl] : [];
const CSP = {
  useDefaults: false,
  reportOnly: Boolean(config.cspReportOnly),
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      'blob:',
      'https://accounts.google.com',
      'https://apis.google.com',
      (_req, res) => `'nonce-${res.locals.cspNonce}'`,
    ],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://*.googleusercontent.com', ...siteOrigin, ...r2Origin],
    fontSrc: ["'self'", 'data:'],
    mediaSrc: ["'self'", 'data:', 'blob:', ...r2Origin],
    connectSrc: ["'self'", 'blob:', 'https://accounts.google.com', 'https://nominatim.openstreetmap.org', 'https://*.tile.openstreetmap.org', ...siteOrigin, ...r2Origin],
    workerSrc: ["'self'", 'blob:'],
    manifestSrc: ["'self'"],
    frameSrc: ["'self'", 'https://accounts.google.com', 'https://www.google.com', 'https://maps.google.com'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    reportUri: ['/api/csp-report'],
    upgradeInsecureRequests: [],
  },
};
// Google sign-in opens a popup that hands the token back to this page: helmet's default COOP (same-origin) cuts that link and the popup stays blank.
app.use(helmet({ contentSecurityPolicy: CSP, crossOriginResourcePolicy: { policy: 'cross-origin' }, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self), payment=()');
  next();
});
// Caddy (in front) already gzips/zstds on its own cores; doing it here too would burn the single Node thread. Only compress direct (non-proxied) requests.
app.use(compression({ filter: (req, res) => (req.headers['x-forwarded-for'] ? false : compression.filter(req, res)) }));
const ALLOWED_ORIGINS = new Set([
  config.siteUrl,
  'https://twistegy.com',
  'https://www.twistegy.com',
  ...(process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
]);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const clean = origin.replace(/\/+$/, '');
    if (ALLOWED_ORIGINS.has(clean)) return cb(null, true);
    if (config.env !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(requestObservabilityMiddleware);
app.use(express.json({ limit: '1mb', type: ['application/json', 'application/csp-report', 'application/reports+json'], verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/wa/')) req.rawBody = buf; } }));

app.post('/api/csp-report', (req, res) => {
  const report = req.body?.['csp-report'] || req.body;
  if (report && typeof report === 'object') {
    const blocked = String(report['blocked-uri'] || report.blockedURL || '').slice(0, 200);
    const directive = String(report['violated-directive'] || report.effectiveDirective || '').slice(0, 80);
    if (blocked || directive) console.warn(`[csp-report] directive=${directive} blocked=${blocked}`);
  }
  res.status(204).end();
});

const SITE_ORIGIN = config.siteUrl;
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

// IndexNow ownership proof: the key file Bing fetches to confirm this site owns the key
if (indexNowKey()) app.get(`/${indexNowKey()}.txt`, (_req, res) => res.type('text/plain').send(indexNowKey()));

// pages to announce to search engines: the fixed pages on the first run, then only stores/products created since `since`
function newUrlsSince(since) {
  const urls = since ? [] : [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/join`, `${SITE_ORIGIN}/stores`, ...indexableDepartments().map((d) => `${SITE_ORIGIN}/c/${encodeURIComponent(publicSlug(d.slug))}`)];
  const cond = since ? 'AND s.created_at > ?' : '';
  urls.push(...q.all(`SELECT s.slug FROM stores s WHERE s.status='active' AND s.hidden=0 AND s.search_indexable=1 ${cond}
    AND EXISTS (SELECT 1 FROM products p WHERE p.store_id=s.id AND p.status='active') ORDER BY s.id LIMIT 5000`, since ? [since] : []).map(({ slug }) => `${SITE_ORIGIN}/s/${encodeURIComponent(slug)}`));
  urls.push(...q.all(`SELECT s.slug AS store_slug, p.slug AS product_slug FROM products p JOIN stores s ON s.id=p.store_id
    WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND s.search_indexable=1 ${since ? 'AND p.created_at > ?' : ''} ORDER BY p.id LIMIT 20000`, since ? [since] : [])
    .map(({ store_slug, product_slug }) => `${SITE_ORIGIN}/s/${encodeURIComponent(store_slug)}/p/${encodeURIComponent(product_slug)}`));
  return urls;
}

const isoDate = (d) => (d ? `${String(d).replace(' ', 'T').replace(/Z$/, '')}Z` : null); // sqlite datetime('now') is UTC
// category pages worth indexing: only sections that really contain products (empty ones stay reachable for shoppers but are noindex + out of the sitemap)
const indexableDepartments = () => customerDepartments().filter((d) => d.product_count > 0);
app.get('/sitemap.xml', (_req, res) => {
  const entries = [{ loc: `${SITE_ORIGIN}/` }, { loc: `${SITE_ORIGIN}/join` }, { loc: `${SITE_ORIGIN}/stores` }];
  entries.push(...indexableDepartments().map((d) => ({ loc: `${SITE_ORIGIN}/c/${encodeURIComponent(publicSlug(d.slug))}` })));
  const stores = q.all(`SELECT s.slug, (SELECT MAX(p.updated_at) FROM products p WHERE p.store_id=s.id AND p.status='active') AS lastmod FROM stores s
    WHERE s.status='active' AND s.hidden=0 AND s.search_indexable=1
    AND EXISTS (SELECT 1 FROM products p WHERE p.store_id=s.id AND p.status='active') ORDER BY s.id LIMIT 49990`);
  entries.push(...stores.map(({ slug, lastmod }) => ({ loc: `${SITE_ORIGIN}/s/${encodeURIComponent(slug)}`, lastmod: isoDate(lastmod) })));
  const remaining = 50000 - entries.length;
  if (remaining > 0) entries.push(...q.all(`SELECT s.slug AS store_slug, p.slug AS product_slug, p.updated_at AS lastmod FROM products p
    JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND s.search_indexable=1
    ORDER BY p.id LIMIT ?`, [remaining]).map(({ store_slug, product_slug, lastmod }) =>
    ({ loc: `${SITE_ORIGIN}/s/${encodeURIComponent(store_slug)}/p/${encodeURIComponent(product_slug)}`, lastmod: isoDate(lastmod) })));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => `  <url><loc>${xml(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  res.type('application/xml').set('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600').send(body);
});

// Do not index the demo catalogue or checkout flows. Real stores become indexable
// automatically when they are created; only public, active products enter the sitemap.
app.use((req, res, next) => {
  // internal search results, request forms and store "shop" filter/sort pages are for shoppers, not for Google (they were showing up as thin duplicate pages)
  // private / transactional app screens (also disallowed in robots.txt): never index them if a crawler ignores robots
  if (/^\/(account|market-cart|favorites|market-checkout|market-order-success|login|register|visual|track|admin|dashboard|pos)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex');
  if (req.path === '/search' || req.path === '/request' || req.path.startsWith('/request/') || /^\/s\/[^/]+\/(shop|search|categories|favorites)\/?$/.test(req.path)) res.set('X-Robots-Tag', 'noindex, follow');
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

app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'alive', uptimeSec: Math.round(process.uptime()) }));
app.get('/api/ready', (req, res) => {
  try {
    const dbCheck = q.val('SELECT 1');
    if (dbCheck !== 1) throw new Error('db check failed');
    const isAdmin = Boolean(req.headers['x-admin-key'] && req.headers['x-admin-key'] === config.adminKey);
    if (isAdmin) {
      const migrationsCount = q.val('SELECT COUNT(*) FROM schema_migrations');
      return res.json({
        ok: true,
        status: 'ready',
        db: true,
        migrations: Number(migrationsCount || 0),
        workerRole: config.workerRole,
        r2Configured: Boolean(config.r2?.bucket && config.r2?.accessKeyId),
      });
    }
    res.json({ ok: true, status: 'ready' });
  } catch (err) {
    res.status(503).json({ ok: false, status: 'not_ready' });
  }
});
app.get('/api/version', (req, res) => {
  const isAdmin = Boolean(req.headers['x-admin-key'] && req.headers['x-admin-key'] === config.adminKey);
  const base = {
    name: 'twist-store',
    version: process.env.APP_VERSION || '1.0.0',
    commit: process.env.GIT_SHA || 'dev',
  };
  if (isAdmin) {
    base.env = config.env;
    base.node = process.version;
  }
  res.json(base);
});
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cashier/v1', cashierRoutes);
app.use('/api/pos-remote', posRemoteRoutes); // phone used as a barcode scanner for the cashier on a computer
app.use('/api/pos', posRoutes);
prefetchCutoutModel(); // background-removal model, fetched once per container
startSaleExpiry(); // ends timed discounts on time (price goes back to the old price)
startReservationSweeper(); // releases in-store reservations nobody collected
app.use('/api/wa', waRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api', publicRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));

// Serve the built web app (single-origin deployment).
if (fs.existsSync(config.webDist)) {
  const indexHtmlPath = path.join(config.webDist, 'index.html');
  let cachedIndexHtml = null;
  let cachedIndexMtime = 0;
  let cachedIndexWithBoot = null;
  // The instant-first-paint outline (<!--boot-->…<!--/boot-->) belongs to the home page only: every other page gets the HTML without it.
  const readIndexHtml = (keepBoot = false) => {
    try {
      const stat = fs.statSync(indexHtmlPath);
      if (!cachedIndexHtml || stat.mtimeMs !== cachedIndexMtime) {
        cachedIndexWithBoot = fs.readFileSync(indexHtmlPath, 'utf8');
        cachedIndexHtml = cachedIndexWithBoot.replace(/<!--boot-->[\s\S]*?<!--\/boot-->/, '');
        cachedIndexMtime = stat.mtimeMs;
      }
      return keepBoot ? cachedIndexWithBoot : cachedIndexHtml;
    } catch {
      return (keepBoot ? cachedIndexWithBoot : cachedIndexHtml) || '';
    }
  };
  app.use(express.static(config.webDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); if (/\/(sw\.js|offline\.html)$|\.webmanifest$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const withSeo = (html, { title, description, url, image, h1, intro }) => html
    .replace('<div id="root"></div>', h1 ? `<div id="root"><div style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"><h1>${esc(h1)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}<nav><a href="/">تويست بنها</a> <a href="/stores">محلات الملابس في بنها</a></nav></div></div>` : '<div id="root"></div>')
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${esc(url)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${esc(image)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${esc(title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(description)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${esc(image)}" />`);
  // A URL that does not exist must answer 404 (not 200) so search engines drop it; the page body is still the app so shoppers see the friendly "not found" screen.
  const logNotFound = (req) => {
    try {
      const p = req.originalUrl || req.url || req.path;
      const ref = req.get('referrer') || req.get('referer') || null;
      const ua = req.get('user-agent') || null;
      const ip = req.ip || null;
      q.run('INSERT INTO not_found_logs (path, referrer, user_agent, ip) VALUES (?, ?, ?, ?)', [p, ref, ua, ip]);
    } catch { /* ignore */ }
  };
  const notFoundPage = (res) => res.status(404).set('X-Robots-Tag', 'noindex').set('Cache-Control', 'no-cache').type('html').send(readIndexHtml());
  const ldTag = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
  const withLd = (html, objs) => html.replace('</head>', `${objs.map(ldTag).join('')}</head>`);
  const trunc = (x, n = 155) => { const t = String(x || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
  app.get('/s/:slug/p/:pslug', (req, res, next) => {
    try {
      const red = q.get('SELECT target_path, status_code FROM slug_redirects WHERE source_path=?', [`/s/${req.params.slug}/p/${req.params.pslug}`]);
      if (red) return res.redirect(red.status_code || 301, red.target_path);
    } catch { /* ignore */ }

    const item = q.get(`SELECT p.id, p.status, p.name_ar, p.seo_title, p.seo_description, p.description_ar, p.price, p.stock, p.track_stock, p.rating, p.rating_count, p.sku, s.name_ar AS store_name_ar, s.status AS store_status
      FROM products p JOIN stores s ON s.id=p.store_id
      WHERE s.slug=? AND p.slug=?`, [req.params.slug, req.params.pslug]);

    if (!item || item.store_status !== 'active') {
      logNotFound(req);
      return notFoundPage(res);
    }

    if (item.status === 'archived') {
      logNotFound(req);
      return res.status(410).set('X-Robots-Tag', 'noindex').set('Cache-Control', 'no-cache').type('html').send(readIndexHtml());
    }

    if (item.status !== 'active') {
      logNotFound(req);
      return notFoundPage(res);
    }
    const mediaId = q.get('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [item.id])?.media_id;
    const imageBase = mediaMap([mediaId]).get(mediaId)?.base;
    const url = `${SITE_ORIGIN}${req.path}`;
    const sameName = q.get("SELECT COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE s.slug=? AND p.name_ar=? AND p.status='active'", [req.params.slug, item.name_ar])?.n || 1;
    // same name AND price in the same store (e.g. 3 listings of one dress): number the 2nd, 3rd... so titles/descriptions stay unique
    const twin = sameName > 1 && !item.seo_title ? (q.get("SELECT COUNT(*) AS n FROM products p JOIN stores s ON s.id=p.store_id WHERE s.slug=? AND p.name_ar=? AND p.price=? AND p.status='active' AND p.id<?", [req.params.slug, item.name_ar, item.price, item.id])?.n || 0) : 0;
    const model = twin > 0 ? ` (موديل ${twin + 1})` : '';
    const baseTitle = `${item.seo_title || item.name_ar}${sameName > 1 && !item.seo_title ? ` - ${item.price} ج.م` : ''}${model} | ${item.store_name_ar}`;
    const title = baseTitle.length + 13 > 60 ? baseTitle : `${baseTitle} | Twist بنها`;
    const baseDesc = String(item.seo_description || item.description_ar || '').replace(/\s+/g, ' ').trim();
    const autoDesc = `${item.name_ar}${model} من ${item.store_name_ar} في بنها بسعر ${item.price} ج.م. قارن الأسعار واطلب أونلاين من Twist.`;
    const description = trunc(baseDesc.length >= 70 ? baseDesc : (baseDesc ? `${baseDesc.replace(/[.،]+$/, '')}. ${autoDesc}` : autoDesc));
    const image = imageBase ? `${imageBase.startsWith('http') ? '' : SITE_ORIGIN}${imageBase}/original.jpg` : `${SITE_ORIGIN}/brand/twist-share.png`;
    const html = readIndexHtml();
    const inStock = !item.track_stock || item.stock > 0;
    const product = {
      '@context': 'https://schema.org', '@type': 'Product', name: item.name_ar, image: [image], description,
      brand: { '@type': 'Brand', name: item.store_name_ar },
      ...(item.sku ? { sku: item.sku } : {}),
      offers: { '@type': 'Offer', url, priceCurrency: 'EGP', price: item.price, priceValidUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), itemCondition: 'https://schema.org/NewCondition',
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: item.store_name_ar } },
      ...(item.rating_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: item.rating, reviewCount: item.rating_count } } : {}),
    };
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: item.store_name_ar, item: `${SITE_ORIGIN}/s/${encodeURIComponent(req.params.slug)}` },
      { '@type': 'ListItem', position: 3, name: item.name_ar, item: url }] };
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(withLd(withSeo(html, { title, description, url, image, h1: item.name_ar, intro: description }), [product, crumbs]));
  });
  app.get('/c/:slug', (req, res) => {
    const pub = publicSlug(req.params.slug);
    if (pub !== req.params.slug) return res.redirect(301, `/c/${encodeURIComponent(pub)}`); // an old opaque URL (/c/c18_mvtnfs0s) moves permanently to its readable one
    const all = customerDepartments(); const by = new Map(all.map((d) => [d.slug, d]));
    const d = by.get(storedSlug(req.params.slug));
    const html = readIndexHtml();
    if (!d) return res.status(404).set('X-Robots-Tag', 'noindex').type('html').send(html);
    const trail = []; for (let c = d, i = 0; c && i < 10; c = by.get(c.parent), i++) trail.unshift(c);
    const url = `${SITE_ORIGIN}/c/${encodeURIComponent(publicSlug(d.slug))}`;
    const par = trail.length >= 2 ? trail[trail.length - 2].name.ar : ''; const dn = par && !d.name.ar.includes(par) ? `${d.name.ar} ${par}` : d.name.ar; // same name under two parents (جاكيتات حريمي / رجالي) must not give two identical titles
    const title = d.seo?.title?.ar || `${dn} في بنها | أسعار وموديلات | Twist`;
    const description = d.seo?.description?.ar || d.description?.ar || `تسوق ${dn} من محلات بنها على Twist: قارن الأسعار والموديلات من محلات كتير في مكان واحد واطلب أونلاين بسهولة.`;
    const image = d.images?.hero ? `${d.images.hero.startsWith('http') ? '' : SITE_ORIGIN}${d.images.hero}` : `${SITE_ORIGIN}/brand/twist-share.png`;
    const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: 'الرئيسية', item: `${SITE_ORIGIN}/` }, ...trail.map((c) => ({ name: c.name.ar, item: `${SITE_ORIGIN}/c/${encodeURIComponent(publicSlug(c.slug))}` }))].map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: x.item })) };
    if (!(d.product_count > 0)) res.set('X-Robots-Tag', 'noindex, follow');
    const out = withSeo(html, { title, description, url, image, h1: d.name.ar, intro: description }).replace('</head>', `<script type="application/ld+json" data-twist-breadcrumb="1">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script></head>`);
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(out);
  });
  app.get('/s/:slug', (req, res, next) => {
    const store = q.get("SELECT id, name_ar, description_ar, logo_media_id, cover_media_id FROM stores WHERE slug=? AND status='active' AND hidden=0 AND search_indexable=1", [req.params.slug]);
    if (!store) return q.get("SELECT 1 AS x FROM stores WHERE slug=? AND status='active'", [req.params.slug]) ? next() : notFoundPage(res);
    const images = mediaMap([store.cover_media_id, store.logo_media_id]);
    const imageBase = images.get(store.cover_media_id)?.base || images.get(store.logo_media_id)?.base;
    const url = `${SITE_ORIGIN}${req.path}`;
    const title = `${store.name_ar} | ملابس وأزياء في بنها على Twist`;
    const description = trunc(store.description_ar || `تسوق ملابس وأزياء من ${store.name_ar} في بنها. تصفّح المنتجات واطلب أونلاين عبر Twist.`);
    const image = imageBase ? `${imageBase.startsWith('http') ? '' : SITE_ORIGIN}${imageBase}/original.jpg` : `${SITE_ORIGIN}/brand/twist-share.png`;
    const html = readIndexHtml();
    const storeLd = { '@context': 'https://schema.org', '@type': 'ClothingStore', name: store.name_ar, url, image, description,
      address: { '@type': 'PostalAddress', addressLocality: 'Banha', addressRegion: 'Qalyubia', addressCountry: 'EG' } };
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: store.name_ar, item: url }] };
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(withLd(withSeo(html, { title, description, url, image, h1: store.name_ar, intro: description }), [storeLd, crumbs]));
  });
  app.get('/look-of-day/:index', async (req, res, next) => {
    try {
      const { lookOfDay } = await import('./lib/stylist.js');
      const entries = (await lookOfDay()).entries || [];
      const e = entries[Number(req.params.index) - 1] ?? entries[Number(req.params.index)];
      if (!e) return next();
      const name = e.title || e.occasion || 'لوك اليوم';
      const title = `${name} | لوك كامل من محلات بنها | Twist`;
      const description = trunc(e.description || e.say || `${name}: لوك متكامل من محلات بنها، شوف كل قطعة وسعرها وضيف اللوك كله للسلة على Twist.`);
      const cover = e.coverImage || e.images?.[0];
      const image = cover ? `${String(cover).startsWith('http') ? '' : SITE_ORIGIN}${cover}` : `${SITE_ORIGIN}/brand/twist-share.png`;
      const html = readIndexHtml();
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html')
        .send(withSeo(html, { title, description, url: `${SITE_ORIGIN}${req.path}`, image, h1: name, intro: description }));
    } catch { next(); }
  });
  app.get('/stores', (_req, res) => {
    const title = 'كل محلات الملابس في بنها | Twist';
    const description = 'تصفّح كل محلات الملابس والأزياء في بنها على Twist: رجالي وحريمي وأطفال ورياضي. اختار محلك واطلب أونلاين.';
    const html = readIndexHtml();
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(withSeo(html, { title, description, url: `${SITE_ORIGIN}/stores`, image: `${SITE_ORIGIN}/brand/twist-share.png`, h1: 'كل محلات الملابس في بنها', intro: description }));
  });
  app.get('/join', (_req, res) => {
    const title = 'Twist بنها | افتح متجرك الإلكتروني لمحلك';
    const description = 'Twist منصة بنها للتسوق المحلي. نجهز لمحلات الملابس متجرًا إلكترونيًا باسمها، مع متابعة الطلبات واشتراك شهري بسيط.';
    const html = readIndexHtml();
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(withSeo(html, {
      title, description, url: `${SITE_ORIGIN}/join`, image: `${SITE_ORIGIN}/brand/twist-share.png`, h1: 'افتح متجرك الإلكتروني لمحلك على Twist', intro: description,
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
  // A build file that does not exist (an old name after a deploy) is a 404, never the HTML page: otherwise a browser or
  // the offline cache would keep the page as if it were the script and the screen would break until a reload.
  app.get(/^\/assets\//, (_req, res) => res.status(404).type('text/plain').send('Not found'));
  // first path segment of every page the web app really has (App.jsx); anything else is a 404
  const KNOWN_APP_ROUTES = /^\/(stores|search|c|market-cart|market-checkout|market-order-success|favorites|visual|login|register|setup|track|join|account|look|look-of-day|a|legal|request|play|pos|scan|s|dashboard|admin)(\/|$)/;
  app.get('*', (req, res) => {
    const hit = APP_SHELLS.find(([re]) => re.test(req.path));
    if (/\.[a-z0-9]{2,5}$/i.test(req.path) && !/^\/(s|c|a|look|track)\//.test(req.path)) return res.status(404).type('text/plain').send('Not found'); // a missing file (image, script...) is not an HTML page
    if (!hit && req.path !== '/' && !KNOWN_APP_ROUTES.test(req.path)) return notFoundPage(res); // unknown URL: real 404 + noindex
    if (!hit && req.path === '/') {
      const homeHtml = readIndexHtml(true).replace('<div id="root"></div>', '<div id="root"><div style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"><h1>كل محلات الملابس في بنها في مكان واحد</h1><p>تويست (Twist) بنها: اكتشف الموضة، قارن الأسعار واطلب أونلاين من محلات الملابس.</p><nav><a href="/stores">محلات الملابس في بنها</a></nav></div></div>');
      return res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800').type('html').send(homeHtml);
    }
    if (!hit) {
      // any other app page must not claim the home page as its canonical (index.html's default): point it at itself, query stripped
      const self = `${SITE_ORIGIN}${req.path === '/' ? '/' : req.path.replace(/\/+$/, '')}`;
      const generic = readIndexHtml().replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${esc(self)}" />`).replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${esc(self)}" />`);
      return res.set('Cache-Control', 'no-cache').type('html').send(generic);
    }
    const html = readIndexHtml()
      .replace('<link rel="manifest" href="/manifest.webmanifest" />', `<link rel="manifest" href="${hit[1]}" />`)
      .replace('<meta name="apple-mobile-web-app-title" content="Twist Store" />', `<meta name="apple-mobile-web-app-title" content="${hit[2]}" />`);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });
}

app.use(errorHandler);

if (config.workerRole !== 'web') {
  import('./db/index.js').then(({ q: qDb }) => qDb.run("UPDATE users SET role='demo' WHERE email=? AND role='owner'", [config.demoEmail]));
  import('./lib/backup.js').then((m) => m.startBackupSchedule());
  import('./lib/departments.js').then(async (m) => { const n = m.backfillDepartments(); if (n) console.log(`[departments] filled ${n} product(s) without a department`); const t = await m.backfillProductTypes(); if (t) console.log(`[types] inferred type/audience for ${t} product(s)`); });
  import('./lib/visual.js').then((m) => m.startVisualIndexer());
}
export { app };

let activeHttpServer = null;
let shuttingDown = false;

export async function gracefulShutdown(signal = 'SIGTERM', { exitProcess = false } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('graceful_shutdown_start', { signal });
  stopAllJobs();
  if (activeHttpServer) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 5000);
      t.unref?.();
      activeHttpServer.close(() => {
        clearTimeout(t);
        resolve();
      });
    });
    activeHttpServer = null;
  }
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (err) {
    logger.warn('wal_checkpoint_failed', { error: err.message });
  }
  shuttingDown = false;
  if (exitProcess) process.exit(0);
}

// Allow boot.js to hand us an already-listening server (so the health-check
// listener stays alive during the slow first-boot DB setup).
export function startServer(existingServer) {
  if (config.workerRole !== 'web') {
    startDailySummary();
    startLateOrderAlerts(); // nudges stores (push) and the admin (WhatsApp) about orders nobody answered; LATE_ALERTS=0 turns it off
    startIndexNow(SITE_ORIGIN, newUrlsSince);
    scheduleManagedInterval('orphan_media_cleanup', () => purgeOrphanMedia({ maxAgeHours: 24 }), 6 * 3600_000, { ttlMs: 300_000 });
  }
  registerDefaultProviders(); // registration only — no provider call is made at startup
  if (existingServer) {
    // Reuse the existing bound socket — no new port needed.
    // the warm-up handler answers {status:'starting'} to every request — drop it, or it would keep answering first
    existingServer.removeAllListeners('request');
    existingServer.on('request', app);
    activeHttpServer = existingServer;
    console.log(`Twist API ready on http://localhost:${config.port}`);
  } else {
    activeHttpServer = app.listen(config.port, () => console.log(`Twist API ready on http://localhost:${config.port}`));
  }

  prewarm(config.port, ['/marketplace?q=&category=all&sort=featured', '/departments', '/departments?all=1', '/homepage-ads', '/stylist/prompts', '/look-of-day', '/marketplace/free-shipping']);

  const onSignal = (sig) => {
    gracefulShutdown(sig, { exitProcess: true }).catch(() => process.exit(1));
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  return activeHttpServer;
}

// When executed directly (not imported by boot.js) start normally.
if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
