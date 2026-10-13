// Production entry. First boot on an empty persistent volume:
//   1) if the image already contains a seeded database (built during `docker build`), copy it onto the volume — takes seconds;
//   2) otherwise seed from scratch (slow, ~3 minutes).
// After that the volume's data is used as-is, so redeploys never wipe products, orders or photos.
//
// IMPORTANT: We start a minimal HTTP server IMMEDIATELY so Railway's health-check
// passes within seconds. The DB copy / seed runs in the background. The minimal
// server is replaced by the full Express app once setup is done.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config, ROOT } from './config.js';

// --- 1. Spin up a tiny health-check server right away -------------------
// Railway probes GET / (or /api/health). We answer 200 immediately so the
// platform never times out during the slow first-boot setup.
const warmup = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, status: 'starting' }));
});
warmup.listen(config.port, () =>
  console.log(`[boot] health-check listener on :${config.port} — setting up database…`)
);

// --- 2. DB setup (may be slow on a fresh empty volume) ------------------
try {
  if (!fs.existsSync(config.dbFile)) {
    const bakedDb = path.join(ROOT, 'data', 'souqna.db');
    const bakedMedia = path.join(ROOT, 'data', 'media');
    if (path.resolve(bakedDb) !== path.resolve(config.dbFile) && fs.existsSync(bakedDb)) {
      console.log('Empty volume — copying the seeded demo data from the image…');
      fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
      fs.copyFileSync(bakedDb, config.dbFile);
      if (fs.existsSync(bakedMedia) && path.resolve(bakedMedia) !== path.resolve(config.mediaDir))
        fs.cpSync(bakedMedia, config.mediaDir, { recursive: true });
    } else {
      console.log('No database found — seeding demo stores (takes ~3 minutes)…');
      await import('./db/seed.js');
    }
  }

  // --- 3. Load the real Express app and take over the port ---------------
  const { startServer } = await import('./index.js');
  startServer(warmup);
} catch (err) {
  console.error('[boot] setup failed:', err);
  // Keep the warmup server running so Railway doesn't crash-loop; log the error.
}

// --- 4. Migrate local media → R2 in the background ----------------------
// Needs the R2_* variables; does nothing without them. Safe to repeat.
setTimeout(() => {
  import('./lib/media-migrate.js').then((m) => m.moveLocalMediaToR2({ log: () => {} }))
    .then((r) => { if (!r.skipped && (r.moved || r.recovered || r.stuck)) console.log(`[media→r2] moved ${r.moved}, re-marked ${r.recovered}${r.stuck ? `, ${r.stuck} waiting for free disk space` : ''}`); })
    .catch((e) => console.warn('[media→r2] skipped:', e.message));
}, 20_000).unref();
