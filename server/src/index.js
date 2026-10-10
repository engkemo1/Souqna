import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.js';
import './db/index.js';
import publicRoutes from './routes/public.js';
import ownerRoutes from './routes/owner.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './lib/errors.js';

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
app.use('/api/owner', ownerRoutes);
app.use('/api', publicRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));

// Serve the built web app (single-origin deployment).
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); if (/\/(sw\.js|manifest\.webmanifest|offline\.html)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get('*', (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
}

app.use(errorHandler);

import('./db/index.js').then(({ q }) => q.run("UPDATE users SET role='demo' WHERE email=? AND role='owner'", [config.demoEmail]));
import('./lib/backup.js').then((m) => m.startBackupSchedule());
app.listen(config.port, () => console.log(`Banha Outfit API ready on http://localhost:${config.port}`));
