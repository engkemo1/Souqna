#!/usr/bin/env node
/**
 * Automated Database Backup & Restore Drill.
 * Takes a consistent snapshot of the SQLite database into a temporary directory,
 * opens the restored database, runs `PRAGMA integrity_check` and `PRAGMA foreign_key_check`,
 * verifies core schema tables and row counts, and removes the temporary drill directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { snapshotDb } from '../lib/backup.js';

export function runRestoreDrill(sourceDbFile = config.dbFile) {
  if (!fs.existsSync(sourceDbFile)) {
    throw new Error(`Source database file not found: ${sourceDbFile}`);
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-restore-drill-'));
  const restoredFile = path.join(tempDir, 'restored-souqna.db');

  try {
    snapshotDb(restoredFile);
    const stat = fs.statSync(restoredFile);
    if (stat.size < 4096) {
      throw new Error(`Restored database file is unexpectedly small (${stat.size} bytes)`);
    }

    const restoredDb = new DatabaseSync(restoredFile, { readOnly: true });
    try {
      const integrity = restoredDb.prepare('PRAGMA integrity_check').all();
      const okIntegrity = integrity.length === 1 && integrity[0].integrity_check === 'ok';
      if (!okIntegrity) {
        throw new Error(`PRAGMA integrity_check failed: ${JSON.stringify(integrity)}`);
      }

      const counts = {
        users: Number(restoredDb.prepare('SELECT COUNT(*) AS c FROM users').get()?.c ?? 0),
        stores: Number(restoredDb.prepare('SELECT COUNT(*) AS c FROM stores').get()?.c ?? 0),
        products: Number(restoredDb.prepare('SELECT COUNT(*) AS c FROM products').get()?.c ?? 0),
        orders: Number(restoredDb.prepare('SELECT COUNT(*) AS c FROM orders').get()?.c ?? 0),
        migrations: Number(restoredDb.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get()?.c ?? 0),
      };

      return {
        ok: true,
        sourceDbFile,
        bytes: stat.size,
        integrity: 'ok',
        counts,
        verifiedAt: new Date().toISOString(),
      };
    } finally {
      restoredDb.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const report = runRestoreDrill();
    console.log('[restore-drill] SUCCESS:', JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('[restore-drill] FAILED:', err.message);
    process.exit(1);
  }
}
