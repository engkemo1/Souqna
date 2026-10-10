/**
 * Backup the database (consistent snapshot) and the product photos.
 *   BACKUP_DIR=/path/to/backups npm run backup -w server
 * Run it from a daily cron / scheduled task, or just set BACKUP_DIR and let the server do it every 24 h.
 * Restore: stop the server, copy db/souqna-YYYY-MM-DD.db over DB_FILE and the media/ folder over MEDIA_DIR.
 */
import { runBackup } from '../lib/backup.js';
try { const i = runBackup(process.env.BACKUP_DIR || undefined); console.log(`OK  ${i.file}  (${(i.bytes / 1048576).toFixed(1)} MB)  photos: ${i.media.copied} new of ${i.media.total}`); }
catch (e) { console.error('Backup failed:', e.message); process.exit(1); }
