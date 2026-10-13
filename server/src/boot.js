// Production entry. First boot on an empty persistent volume:
//   1) if the image already contains a seeded database (built during `docker build`), copy it onto the volume — takes seconds;
//   2) otherwise seed from scratch (slow, ~3 minutes).
// After that the volume's data is used as-is, so redeploys never wipe products, orders or photos.
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';

if (!fs.existsSync(config.dbFile)) {
  const bakedDb = path.join(ROOT, 'data', 'souqna.db');
  const bakedMedia = path.join(ROOT, 'data', 'media');
  if (path.resolve(bakedDb) !== path.resolve(config.dbFile) && fs.existsSync(bakedDb)) {
    console.log('Empty volume — copying the seeded demo data from the image…');
    fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
    fs.copyFileSync(bakedDb, config.dbFile);
    if (fs.existsSync(bakedMedia) && path.resolve(bakedMedia) !== path.resolve(config.mediaDir)) fs.cpSync(bakedMedia, config.mediaDir, { recursive: true });
  } else {
    console.log('No database found — seeding demo stores (takes ~3 minutes)…');
    await import('./db/seed.js');
  }
}
await import('./index.js');

// Photos still on the volume (e.g. the demo seed) move to Cloudflare R2 in the background, so the small volume only ever holds the database.
// Needs the R2_* variables; does nothing without them. Safe to repeat (see lib/media-migrate.js).
setTimeout(() => {
  import('./lib/media-migrate.js').then((m) => m.moveLocalMediaToR2({ log: () => {} }))
    .then((r) => { if (!r.skipped && (r.moved || r.recovered || r.stuck)) console.log(`[media→r2] moved ${r.moved}, re-marked ${r.recovered}${r.stuck ? `, ${r.stuck} waiting for free disk space` : ''}`); })
    .catch((e) => console.warn('[media→r2] skipped:', e.message));
}, 20_000).unref();
