/**
 * Versioned, idempotent, transactional SQLite migration runner.
 * All migrations are strictly additive (no DROP or destructive rewrites).
 */

export const MIGRATIONS = [
  {
    version: '0001_production_indexes',
    name: 'Composite indexes for hot product, order, and customer queries',
    up(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_store_status_created ON orders(store_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_products_store_status_featured ON products(store_id, status, featured DESC, sold_count DESC);
        CREATE INDEX IF NOT EXISTS idx_customers_store_phone ON customers(store_id, phone);
        CREATE INDEX IF NOT EXISTS idx_customers_store_last_order ON customers(store_id, last_order_at DESC);
      `);
    },
  },
  {
    version: '0002_order_idempotency',
    name: 'Add idempotency_key to orders to prevent duplicate checkouts on network retries',
    up(db) {
      const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
      if (!cols.includes('idempotency_key')) {
        db.exec('ALTER TABLE orders ADD COLUMN idempotency_key TEXT');
      }
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_idempotency ON orders(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL');
    },
  },
  {
    version: '0003_job_locks',
    name: 'Ensure job_locks table exists for background task coordination',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS job_locks (
          name TEXT PRIMARY KEY,
          holder TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          last_run_at TEXT,
          last_status TEXT,
          last_error TEXT
        )
      `);
    },
  },
];

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const checkStmt = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
  let count = 0;

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      m.up(db);
      checkStmt.run(m.version, m.name);
      db.exec('COMMIT');
      count++;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw new Error(`[migrations] Failed applying ${m.version} (${m.name}): ${err.message}`);
    }
  }
  return count;
}
