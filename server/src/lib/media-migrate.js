/**
 * Move photos that are still on the volume to Cloudflare R2 and free the disk. Safe to re-run, safe when the volume is completely full.
 * Order per photo: 1) upload every file to R2, 2) delete the local copy (only after the upload succeeded — this frees space),
 * 3) mark the photo `remote=1` (retried at the end if the database was still full).
 * A photo whose local copy is already gone but which exists in R2 (an interrupted earlier run) is only re-marked.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { q } from '../db/index.js';
import { r2Enabled, r2Put, r2Get } from './r2.js';
import { mediaDirFor } from './media.js';

export async function moveLocalMediaToR2({ log = console.log, put = r2Put, get = r2Get, enabled = r2Enabled } = {}) {
  if (!enabled) return { skipped: true, moved: 0, recovered: 0, missing: 0, stuck: 0 };
  const rows = q.all('SELECT * FROM media WHERE remote=0');
  let moved = 0, missing = 0, recovered = 0, stuck = 0; const retry = [];
  const mark = (m) => { try { q.run('UPDATE media SET remote=1 WHERE id=?', [m.id]); return true; } catch { return false; } };
  for (const m of rows) {
    const dir = mediaDirFor(m.store_id, m.key);
    let files = [];
    try { files = await fs.readdir(dir); } catch { /* no local folder */ }
    if (!files.includes('original.jpg')) {
      try { await get(`${m.store_id}/${m.key}/original.jpg`); if (mark(m)) recovered++; else retry.push(m); } catch { missing++; }
      continue;
    }
    for (const f of files) await put(`${m.store_id}/${m.key}/${f}`, await fs.readFile(path.join(dir, f)));
    await fs.rm(dir, { recursive: true, force: true }); // everything is safely in R2 → frees the disk first
    if (!mark(m)) retry.push(m);
    moved++;
    if (moved % 25 === 0) log(`… ${moved}/${rows.length}`);
  }
  for (const m of retry) { if (mark(m)) recovered++; else stuck++; }
  return { skipped: false, moved, recovered, missing, stuck };
}
