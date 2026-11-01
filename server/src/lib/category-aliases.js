/**
 * Category migration history + backward-compatible URL aliases (additive tables; nothing existing is altered).
 * An alias always points at a department id (never at another alias), so redirect loops are impossible by construction.
 * Aliases are created only from an explicit mapping; an alias is refused when it equals a live department slug.
 */
export const CATEGORY_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS category_migrations (
  id INTEGER PRIMARY KEY,
  run_key TEXT NOT NULL,
  old_department_id INTEGER, old_name_ar TEXT, old_slug TEXT NOT NULL DEFAULT '',
  new_department_id INTEGER, new_name_ar TEXT, new_slug TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('rename','reparent','create','move_products','deactivate','activate','alias')),
  reason TEXT,
  affected_products INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('planned','committed','verified','rolled_back','failed')),
  reversal_of INTEGER REFERENCES category_migrations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (run_key, type, old_slug, new_slug)
);
CREATE INDEX IF NOT EXISTS idx_catmig_old ON category_migrations(old_slug);
CREATE INDEX IF NOT EXISTS idx_catmig_new ON category_migrations(new_department_id);
CREATE INDEX IF NOT EXISTS idx_catmig_run ON category_migrations(run_key);
CREATE TABLE IF NOT EXISTS category_aliases (
  id INTEGER PRIMARY KEY,
  alias TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('slug_ar','slug_en','legacy_id','path')),
  department_id INTEGER NOT NULL REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (alias, kind)
);
CREATE INDEX IF NOT EXISTS idx_catalias_dept ON category_aliases(department_id);
`;

export const normAlias = (s) => { let v = String(s ?? ''); try { v = decodeURIComponent(v); } catch { /* keep raw */ } return v.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '-'); };
const KINDS = ['slug_ar', 'slug_en', 'legacy_id', 'path'];

export function addAlias(db, { alias, kind, to_slug, reason = null }) {
  const a = normAlias(alias);
  if (!a) return { ok: false, error: 'empty alias' };
  if (!KINDS.includes(kind)) return { ok: false, error: 'invalid kind' };
  const dest = db.prepare('SELECT id, slug, active FROM departments WHERE slug=?').get(to_slug);
  if (!dest) return { ok: false, error: `destination ${to_slug} does not exist` };
  if (!dest.active) return { ok: false, error: `destination ${to_slug} is inactive` };
  if (db.prepare('SELECT 1 FROM departments WHERE slug=? AND active=1').get(a)) return { ok: false, error: `alias "${a}" equals a live department slug` };
  const ex = db.prepare('SELECT department_id, status FROM category_aliases WHERE alias=? AND kind=?').get(a, kind);
  if (ex && ex.department_id !== dest.id) return { ok: false, error: `alias "${a}" already points elsewhere` };
  if (ex) return { ok: true, skipped: 'exists', alias: a };
  db.prepare('INSERT INTO category_aliases (alias, kind, department_id, reason) VALUES (?,?,?,?)').run(a, kind, dest.id, reason);
  return { ok: true, alias: a, to: dest.slug };
}

/** Canonical ACTIVE department for an old URL segment, or null. A live department slug always wins over an alias. */
export function resolveAlias(db, raw) {
  const a = normAlias(raw);
  if (!a) return null;
  const rows = db.prepare(`SELECT d.slug FROM category_aliases x JOIN departments d ON d.id=x.department_id WHERE x.alias=? AND x.status='active' AND d.active=1`).all(a);
  const slugs = [...new Set(rows.map((r) => r.slug))];
  return slugs.length === 1 ? slugs[0] : null; // conflicting aliases resolve to nothing rather than guessing
}
