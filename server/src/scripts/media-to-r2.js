/**
 * One-off: move every photo that is still on the volume to Cloudflare R2, then free the disk space.
 *   npm run media:to-r2 -w server
 * Safe to re-run; already-moved photos are skipped. Needs the R2_* variables.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { q } from '../db/index.js';
import { r2Enabled } from '../lib/r2.js';
import { mediaDirFor, publishToR2 } from '../lib/media.js';

if (!r2Enabled) { console.error('R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL).'); process.exit(1); }
const rows = q.all('SELECT * FROM media WHERE remote=0');
let moved = 0, missing = 0;
for (const m of rows) {
  const dir = mediaDirFor(m.store_id, m.key);
  try { await fs.access(path.join(dir, 'original.jpg')); } catch { missing++; continue; }
  await publishToR2(m.store_id, m.key, dir);
  q.run('UPDATE media SET remote=1 WHERE id=?', [m.id]);
  moved++;
  if (moved % 25 === 0) console.log(`… ${moved}/${rows.length}`);
}
console.log(`Done. Moved ${moved} photos to R2${missing ? `, ${missing} had no local files` : ''}. Base: ${config.r2.publicUrl}`);
