// Production entry: seeds the demo data on first boot (free hosts often have no persistent disk), then starts the API.
import fs from 'node:fs';
import { config } from './config.js';
if (!fs.existsSync(config.dbFile)) {
  console.log('No database found — seeding demo stores (takes ~3 minutes)…');
  await import('./db/seed.js');
}
await import('./index.js');
