import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
};

/** Plain-object rows (node:sqlite returns null-prototype objects). */
const plain = (r) => (r ? { ...r } : r);

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
const args = (p) => (Array.isArray(p) ? p.map(norm) : [Object.fromEntries(Object.entries(p).map(([k, v]) => [k, norm(v)]))]);

export const q = {
  all: (sql, params = []) => stmt(sql).all(...args(params)).map(plain),
  get: (sql, params = []) => plain(stmt(sql).get(...args(params))),
  run: (sql, params = []) => stmt(sql).run(...args(params)),
  val: (sql, params = []) => { const r = stmt(sql).get(...args(params)); return r ? Object.values(r)[0] : null; },
};

/** INSERT from an object — undefined keys are skipped. Returns new id. */
export function insert(table, obj) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  return Number(q.run(sql, keys.map((k) => obj[k])).lastInsertRowid);
}

/** UPDATE by id from an object — undefined keys are skipped. */
export function update(table, id, obj, where = '') {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  if (!keys.length) return 0;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=? ${where}`;
  return q.run(sql, [...keys.map((k) => obj[k]), id]).changes;
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const json = (s, fallback) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};
