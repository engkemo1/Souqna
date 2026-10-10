import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/index.js';
import { config } from '../config.js';

const day = () => new Date().toISOString().slice(0, 10);

/** Consistent snapshot of the live database (safe while the server is running). */
export function snapshotDb(dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.rmSync(dest);
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  return dest;
}

/** Mirror photos: copy only files that are new or changed (size/mtime). Never deletes from the mirror. */
function mirrorMedia(src, dst) {
  let copied = 0, total = 0;
  if (!fs.existsSync(src)) return { copied, total };
  const walk = (a, b) => {
    fs.mkdirSync(b, { recursive: true });
    for (const e of fs.readdirSync(a, { withFileTypes: true })) {
      const from = path.join(a, e.name), to = path.join(b, e.name);
      if (e.isDirectory()) { walk(from, to); continue; }
      total++;
      const s = fs.statSync(from), t = fs.existsSync(to) ? fs.statSync(to) : null;
      if (!t || t.size !== s.size || t.mtimeMs < s.mtimeMs) { fs.copyFileSync(from, to); copied++; }
    }
  };
  walk(src, dst);
  return { copied, total };
}

export function runBackup(dir = config.backupDir) {
  if (!dir) throw new Error('BACKUP_DIR is not set');
  const root = path.resolve(dir);
  const dbDir = path.join(root, 'db');
  const file = snapshotDb(path.join(dbDir, `souqna-${day()}.db`));
  const media = mirrorMedia(config.mediaDir, path.join(root, 'media'));
  // retention: keep the newest N daily database copies
  const old = fs.readdirSync(dbDir).filter((f) => /^souqna-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(Math.max(1, config.backupKeepDays));
  for (const f of old) fs.rmSync(path.join(dbDir, f));
  const info = { at: new Date().toISOString(), file, bytes: fs.statSync(file).size, media, removed: old.length };
  fs.writeFileSync(path.join(root, 'last-backup.json'), JSON.stringify(info, null, 2));
  return info;
}

export const lastBackup = () => {
  if (!config.backupDir) return null;
  try { return JSON.parse(fs.readFileSync(path.join(path.resolve(config.backupDir), 'last-backup.json'), 'utf8')); } catch { return null; }
};

/** In-process daily schedule: runs shortly after boot (if the last backup is >20 h old), then every 24 h. */
export function startBackupSchedule() {
  if (!config.backupDir) return;
  const go = () => { try { const i = runBackup(); console.log(`backup ok: ${i.file} (+${i.media.copied} photo(s))`); } catch (e) { console.warn('backup failed:', e.message); } };
  const last = lastBackup();
  if (!last || Date.now() - Date.parse(last.at) > 20 * 3600e3) setTimeout(go, 30e3).unref();
  setInterval(go, 24 * 3600e3).unref();
}
