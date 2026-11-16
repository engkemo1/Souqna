/**
 * Production entry.
 * Starts a minimal warm-up HTTP server immediately so container liveness probes (/api/health)
 * succeed during initialization, while readiness probes (/api/ready) truthfully return 503
 * until database setup and Express initialization complete.
 * On any fatal setup error, logs the error and exits non-zero (process.exit(1)) so the
 * orchestrator never keeps a broken container running.
 */
import fs from 'node:fs';
import http from 'node:http';
import { config } from './config.js';
import { formatStartupSummary } from './env.js';

export function createWarmupServer() {
  return http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'starting' }));
      return;
    }
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '3' });
    res.end(JSON.stringify({ ok: false, status: 'starting', message: 'Service is initializing' }));
  });
}

async function boot() {
  const warmup = createWarmupServer();
  await new Promise((resolve, reject) => {
    warmup.once('error', reject);
    warmup.listen(config.port, () => {
      console.log(`[boot] warm-up listener on :${config.port} — setting up database…`);
      console.log('[boot] startup summary:', JSON.stringify(formatStartupSummary(config)));
      resolve();
    });
  });

  if (config.env === 'production') {
    if (!config.r2?.bucket || !config.r2?.accessKeyId) {
      console.warn('[boot] WARNING: R2_* not set - uploaded photos live on the local disk.');
    }
    if (!process.env.BACKUP_R2_BUCKET) {
      console.warn('[boot] WARNING: BACKUP_R2_BUCKET not set - the database is not replicated to R2.');
    }
  }

  try {
    if (!fs.existsSync(config.dbFile)) {
      if (config.env === 'production' && !config.allowEmptyDb && !(config.seedDemo && config.allowProdSeed)) {
        throw new Error(
          `Database file ${config.dbFile} does not exist in production. Refusing to boot on an empty database without ALLOW_EMPTY_DB=1.`,
        );
      }
      if (config.seedDemo && (config.env !== 'production' || config.allowProdSeed)) {
        console.log('[boot] SEED_DEMO=1 — seeding demo stores…');
        await import('./db/seed.js');
      }
    }

    const { startServer } = await import('./index.js');
    startServer(warmup);
  } catch (err) {
    console.error('[boot] FATAL setup failed:', err);
    try {
      warmup.close();
    } catch { /* ignore */ }
    process.exit(1);
  }

  if (config.workerRole !== 'web') {
    setTimeout(() => {
      import('./lib/media-migrate.js')
        .then((m) => m.moveLocalMediaToR2({ log: () => {} }))
        .then((r) => {
          if (!r.skipped && (r.moved || r.recovered || r.stuck)) {
            console.log(`[media→r2] moved ${r.moved}, re-marked ${r.recovered}${r.stuck ? `, ${r.stuck} waiting for free disk space` : ''}`);
          }
        })
        .catch((e) => console.warn('[media→r2] skipped:', e.message));
    }, 20_000).unref();
  }
}

if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]) {
  boot();
}
