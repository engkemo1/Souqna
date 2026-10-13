/**
 * One-off: move every photo that is still on the volume to Cloudflare R2, then free the disk space.
 *   npm run media:to-r2 -w server
 * Safe to re-run; already-moved photos are skipped. Needs the R2_* variables. (The server also does this by itself in the background at start-up.)
 */
import { config } from '../config.js';
import { moveLocalMediaToR2 } from '../lib/media-migrate.js';

const r = await moveLocalMediaToR2();
if (r.skipped) { console.error('R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL).'); process.exit(1); }
console.log(`Done. Moved ${r.moved} photos to R2${r.recovered ? `, re-marked ${r.recovered}` : ''}${r.missing ? `, ${r.missing} had no files anywhere` : ''}. Base: ${config.r2.publicUrl}`);
if (r.stuck) { console.error(`${r.stuck} photo(s) are in R2 but could not be marked yet (database still full?). Free some space and run this command again — it will finish them.`); process.exit(2); }
