import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.js';
import './db/index.js';
import publicRoutes, { loadSharedLook } from './routes/public.js';
import ownerRoutes from './routes/owner.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './lib/errors.js';
import buyerRoutes from './routes/buyer.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Media renditions are content-addressed → cache forever (CDN friendly).
app.use('/media', express.static(config.mediaDir, { immutable: true, maxAge: '365d', fallthrough: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api', publicRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));

// Serve the built web app (single-origin deployment).
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); if (/\/(sw\.js|manifest\.webmanifest|offline\.html)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  // shared looks get their own preview card (WhatsApp / Facebook read the OG tags, not the SPA)
  app.get('/look/:token', (req, res, next) => {
    try {
      const look = loadSharedLook(req.params.token);
      if (!look || !look.pieces.length) return next();
      const origin = `${req.protocol}://${req.get('host')}`;
      const m = look.pieces[0].image;
      const sz = m ? ([...m.sizes].sort((a, b) => a.width - b.width).find((x) => x.width >= 600) || m.sizes[m.sizes.length - 1]) : null;
      const img = m && sz ? `${m.base.startsWith('http') ? '' : origin}${m.base}/${sz.name}.jpg` : `${origin}/brand/app-icon.png`;
      const visual = look.kind === 'visual';
      const title = visual ? (look.title || 'لقيت دول في محلات بنها') : `${look.title || 'لوك من بنها أوتفيت'} · ${look.pieces.length} قطع`;
      const desc = visual ? `${look.pieces.slice(0, 4).map((p) => `${p.name.ar || p.name.en || p.name} — ${p.price} ج.م`).join(' | ')}` : `${look.pieces.map((p) => p.name.ar || p.name.en || p.name).join(' + ')} — ${look.total} ج.م`;
      const tags = `<meta property="og:type" content="website" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:image" content="${esc(img)}" /><meta property="og:url" content="${esc(origin + req.originalUrl)}" /><meta name="twitter:card" content="summary_large_image" />`;
      const html = fs.readFileSync(path.join(config.webDist, 'index.html'), 'utf8').replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>${tags}`);
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    } catch (e) { next(); }
  });
  app.get('*', (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
}

app.use(errorHandler);

import('./db/index.js').then(({ q }) => q.run("UPDATE users SET role='demo' WHERE email=? AND role='owner'", [config.demoEmail]));
import('./lib/backup.js').then((m) => m.startBackupSchedule());
import('./lib/visual.js').then((m) => m.startVisualIndexer());
app.listen(config.port, () => console.log(`Banha Outfit API ready on http://localhost:${config.port}`));
