import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souqna-rel-p2-'));
process.env.DB_FILE = path.join(tmpDir, 'test.sqlite');
process.env.MEDIA_DIR = path.join(tmpDir, 'uploads');
process.env.JWT_SECRET = 'reliability-test-jwt-secret-long-enough-32chars';
process.env.ADMIN_KEY = 'reliability-test-admin-key-16chars';
process.env.NODE_ENV = 'test';

const { app } = await import('../src/index.js');
const { config } = await import('../src/config.js');
const { db: d, tx } = await import('../src/db/index.js');
const { runMigrations } = await import('../src/db/migrations.js');
const { createWarmupServer } = await import('../src/boot.js');
const { runJobWithLock } = await import('../src/lib/job-runner.js');
const { fetchWithRetry, resetCircuits } = await import('../src/lib/http-client.js');
const { redactPii } = await import('../src/lib/logger.js');
const { purgeOrphanMedia } = await import('../src/lib/media.js');
const { runRestoreDrill } = await import('../src/scripts/restore-drill.js');

let server;
let baseUrl;
let storeId;

before(async () => {
  const u = d
    .prepare(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Rel Owner', 'rel@twistegy.com', 'hash', 'owner')`
    )
    .run();
  const ownerId = Number(u.lastInsertRowid);

  const st = d
    .prepare(
      `INSERT INTO stores (owner_id, slug, code, name_ar, name_en, whatsapp, phone, shipping_fee, status)
       VALUES (?, 'rel-store', 'REL', 'متجر الاعتمادية', 'Reliability Store', '01011112222', '01011112222', 30, 'active')`
    )
    .run(ownerId);
  storeId = Number(st.lastInsertRowid);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    d.close();
  } catch {
    // ignore
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup issues on Windows
  }
});

test('1. Warmup server returns 200 on /api/health and 503 on /api/ready; live server returns 200 on both + /api/version', async () => {
  const warmup = createWarmupServer();
  await new Promise((resolve) => warmup.listen(0, '127.0.0.1', resolve));
  const warmUrl = `http://127.0.0.1:${warmup.address().port}`;

  try {
    const hRes = await fetch(`${warmUrl}/api/health`);
    assert.equal(hRes.status, 200);
    const hBody = await hRes.json();
    assert.equal(hBody.ok, true);
    assert.equal(hBody.status, 'starting');

    const rRes = await fetch(`${warmUrl}/api/ready`);
    assert.equal(rRes.status, 503);
    const rBody = await rRes.json();
    assert.equal(rBody.ok, false);
    assert.equal(rBody.status, 'starting');
  } finally {
    await new Promise((resolve) => warmup.close(resolve));
  }

  // Live server endpoints (QA-10: public info disclosure hardened)
  const liveReadyPublic = await fetch(`${baseUrl}/api/ready`);
  assert.equal(liveReadyPublic.status, 200);
  const publicReadyBody = await liveReadyPublic.json();
  assert.equal(publicReadyBody.ok, true);
  assert.equal(publicReadyBody.status, 'ready');
  assert.equal(publicReadyBody.migrations, undefined, 'public /api/ready must not leak migrations count');
  assert.equal(publicReadyBody.workerRole, undefined, 'public /api/ready must not leak workerRole');

  // Admin / internal request gets full diagnostics
  const liveReadyAdmin = await fetch(`${baseUrl}/api/ready`, { headers: { 'x-admin-key': config.adminKey } });
  assert.equal(liveReadyAdmin.status, 200);
  const adminReadyBody = await liveReadyAdmin.json();
  assert.equal(adminReadyBody.ok, true);
  assert.equal(adminReadyBody.db, true);
  assert.ok(adminReadyBody.migrations >= 1);

  // Version endpoint: public hides env & node, admin reveals
  const verResPublic = await fetch(`${baseUrl}/api/version`);
  assert.equal(verResPublic.status, 200);
  const verPublicBody = await verResPublic.json();
  assert.equal(verPublicBody.name, 'twist-store');
  assert.ok(verPublicBody.version);
  assert.equal(verPublicBody.env, undefined, 'public /api/version must not expose environment');
  assert.equal(verPublicBody.node, undefined, 'public /api/version must not expose node version');

  const verResAdmin = await fetch(`${baseUrl}/api/version`, { headers: { 'x-admin-key': config.adminKey } });
  const verAdminBody = await verResAdmin.json();
  assert.ok(verAdminBody.env, 'admin /api/version has env');
  assert.ok(verAdminBody.node, 'admin /api/version has node version');
});

test('2. Schema migrations tracking and nested tx() SAVEPOINT rollback', () => {
  const applied = d.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
  assert.ok(applied.includes('0001_production_indexes'));
  assert.ok(applied.includes('0002_order_idempotency'));
  assert.ok(applied.includes('0003_job_locks'));

  // Re-running migrations is idempotent and returns 0 newly applied
  const rerunCount = runMigrations(d);
  assert.equal(rerunCount, 0);

  // Nested transaction SAVEPOINT partial rollback test
  tx(() => {
    d.prepare("INSERT INTO app_settings (key, value) VALUES ('tx_outer_test', 'kept')").run();
    assert.throws(() => {
      tx(() => {
        d.prepare("INSERT INTO app_settings (key, value) VALUES ('tx_inner_test', 'rolled_back')").run();
        throw new Error('inner failure');
      });
    }, /inner failure/);
  });

  const outerRow = d.prepare("SELECT value FROM app_settings WHERE key = 'tx_outer_test'").get();
  const innerRow = d.prepare("SELECT value FROM app_settings WHERE key = 'tx_inner_test'").get();
  assert.equal(outerRow?.value, 'kept');
  assert.equal(innerRow, undefined);
});

test('3. Atomic stock & coupon limits, idempotencyKey deduplication, and collision-safe order_number', async () => {
  const prod = d
    .prepare(
      `INSERT INTO products (store_id, slug, name_ar, name_en, price, stock, track_stock, status)
       VALUES (?, 'limited-tee', 'تيشيرت محدود', 'Limited Tee', 200, 1, 1, 'active')`
    )
    .run(storeId);
  const productId = Number(prod.lastInsertRowid);

  const v = d
    .prepare(`INSERT INTO variants (product_id, size, color, stock) VALUES (?, 'L', 'أسود', 1)`)
    .run(productId);
  const variantId = Number(v.lastInsertRowid);

  d.prepare(
    `INSERT INTO offers (store_id, type, code, title_ar, title_en, value, usage_limit, usage_count, active)
     VALUES (?, 'fixed', 'ONCE50', 'خصم 50', '50 Off', 50, 1, 0, 1)`
  ).run(storeId);

  // Order 1 with idempotencyKey 'idem-key-001'
  const payload = {
    name: 'أحمد محمد',
    phone: '01099887766',
    governorate: 'القليوبية',
    city: 'وسط البلد',
    address: 'شارع الاستقلال بجوار المحطة',
    coupon: 'ONCE50',
    idempotencyKey: 'idem-key-001',
    items: [{ productId, variantId, qty: 1 }],
  };

  const res1 = await fetch(`${baseUrl}/api/stores/rel-store/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(res1.status, 201);
  const body1 = await res1.json();
  assert.equal(body1.order.total, 180); // 200 - 50 + 30 shipping

  // Retry with exact same idempotencyKey returns existing order (200) without double-charging stock
  const resDup = await fetch(`${baseUrl}/api/stores/rel-store/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(resDup.status, 200);
  const bodyDup = await resDup.json();
  assert.equal(bodyDup.order.duplicate, true);
  assert.equal(bodyDup.order.number, body1.order.number);

  // Stock is now 0; a new order for the same variant must fail with 409
  const resOut = await fetch(`${baseUrl}/api/stores/rel-store/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      idempotencyKey: 'idem-key-002',
    }),
  });
  assert.equal(resOut.status, 409);

  // Restock variant & product to test single-use coupon exhaustion and order_number sequence after deletion
  d.prepare('UPDATE variants SET stock = 5 WHERE id = ?').run(variantId);
  d.prepare('UPDATE products SET stock = 5 WHERE id = ?').run(productId);

  const resCouponExhausted = await fetch(`${baseUrl}/api/stores/rel-store/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      idempotencyKey: 'idem-key-003',
    }),
  });
  assert.equal(resCouponExhausted.status, 409);

  // Insert an order with number REL-10010, delete REL-10001, and verify next order gets REL-10011 (not REL-10002)
  d.prepare(
    `INSERT INTO orders (store_id, number, customer_name, phone, subtotal, total)
     VALUES (?, 'REL-10010', 'Test', '01099887766', 100, 130)`
  ).run(storeId);
  d.prepare(`DELETE FROM orders WHERE store_id = ? AND number = 'REL-10001'`).run(storeId);

  const resSeq = await fetch(`${baseUrl}/api/stores/rel-store/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'أحمد محمد',
      phone: '01099887766',
      governorate: 'القليوبية',
      city: 'وسط البلد',
      address: 'شارع الاستقلال بجوار المحطة',
      items: [{ productId, variantId, qty: 1 }],
    }),
  });
  assert.equal(resSeq.status, 201);
  const bodySeq = await resSeq.json();
  assert.equal(bodySeq.order.number, 'REL-10011');
});

test('4. Job runner enforces mutual exclusion across holders and timeout isolation', async () => {
  const p1 = runJobWithLock(
    'test-exclusive-job',
    async () => {
      await new Promise((r) => setTimeout(r, 80));
      return 'done-1';
    },
    { ttlMs: 5000, holder: 'worker-A' }
  );

  // Trigger overlapping run from worker-B immediately while worker-A holds the lock
  await new Promise((r) => setTimeout(r, 15));
  const secondResult = await runJobWithLock('test-exclusive-job', async () => 'done-2', {
    ttlMs: 5000,
    holder: 'worker-B',
  });
  const firstResult = await p1;

  assert.equal(firstResult.ran, true);
  assert.equal(secondResult.ran, false);
  assert.equal(secondResult.reason, 'locked');

  // Timeout isolation: job exceeding timeoutMs resolves with error instead of crashing
  const slowResult = await runJobWithLock(
    'test-timeout-job',
    async () => {
      await new Promise((r) => setTimeout(r, 200));
    },
    { timeoutMs: 40, holder: 'worker-A' }
  );
  assert.equal(slowResult.ran, true);
  assert.match(slowResult.error, /timed out/i);
});

test('5. HTTP client enforces timeout, retries 5xx, and opens circuit breaker on repeated failures', async () => {
  const http = await import('node:http');
  let attempts = 0;
  let mode = 'recover-on-2';
  const mockSrv = http.createServer((req, res) => {
    attempts++;
    if (mode === 'recover-on-2' && attempts === 1) {
      res.writeHead(503);
      return res.end('unavailable');
    }
    if (mode === 'always-502') {
      res.writeHead(502);
      return res.end('bad gateway');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, attempts }));
  });
  await new Promise((r) => mockSrv.listen(0, '127.0.0.1', r));
  const mockUrl = `http://127.0.0.1:${mockSrv.address().port}`;

  try {
    resetCircuits();
    const res = await fetchWithRetry(
      mockUrl,
      {},
      {
        circuitKey: 'test-svc',
        retries: 2,
        baseDelayMs: 10,
        timeoutMs: 1000,
      }
    );
    assert.equal(res.status, 200);
    assert.equal(attempts, 2);

    // Trigger circuit breaker by failing 5 consecutive calls
    mode = 'always-502';
    for (let i = 0; i < 5; i++) {
      await fetchWithRetry(
        mockUrl,
        {},
        {
          circuitKey: 'breaker-svc',
          retries: 0,
          timeoutMs: 500,
        }
      );
    }

    await assert.rejects(
      () => fetchWithRetry(mockUrl, {}, { circuitKey: 'breaker-svc', retries: 0 }),
      (err) => err.code === 'CIRCUIT_OPEN'
    );
  } finally {
    await new Promise((r) => mockSrv.close(r));
  }
});

test('6. Backup & restore drill verifies restored SQLite integrity', async () => {
  const result = runRestoreDrill();
  assert.equal(result.ok, true);
  assert.equal(result.integrity, 'ok');
  assert.ok(result.counts.stores >= 1);
});

test('7. PII redaction, orphan media GC, and /api/admin/metrics endpoint', async () => {
  const masked = redactPii('Call 01012345678 or Bearer eyJhbGciOiJIUzI1NiJ9.abc.def');
  assert.ok(!masked.includes('12345678'));
  assert.ok(masked.includes('Bearer [REDACTED]'));

  // Orphan media GC test: insert an old unattached media row and a recent unattached media row
  d.prepare(
    `INSERT INTO media (store_id, kind, key, width, height, sizes, original_ext, bytes, attached, created_at)
     VALUES (?, 'product', 'orphan-old-key', 800, 1000, '[]', 'jpg', 1024, 0, datetime('now', '-48 hours'))`
  ).run(storeId);
  d.prepare(
    `INSERT INTO media (store_id, kind, key, width, height, sizes, original_ext, bytes, attached, created_at)
     VALUES (?, 'product', 'orphan-new-key', 800, 1000, '[]', 'jpg', 1024, 0, datetime('now'))`
  ).run(storeId);

  const gcStats = await purgeOrphanMedia({ maxAgeHours: 24 });
  assert.equal(gcStats.purged, 1);
  const oldRow = d.prepare("SELECT id FROM media WHERE key = 'orphan-old-key'").get();
  const newRow = d.prepare("SELECT id FROM media WHERE key = 'orphan-new-key'").get();
  assert.equal(oldRow, undefined);
  assert.ok(newRow?.id);

  // Admin metrics JSON & Prometheus
  const mRes = await fetch(`${baseUrl}/api/admin/metrics`, {
    headers: { 'x-admin-key': process.env.ADMIN_KEY },
  });
  assert.equal(mRes.status, 200);
  const mJson = await mRes.json();
  assert.ok(typeof mJson.requestsTotal === 'number');
  assert.ok(typeof mJson.dbBytes === 'number');
  assert.ok(Array.isArray(mJson.jobs));

  const pRes = await fetch(`${baseUrl}/api/admin/metrics?format=prometheus`, {
    headers: { 'x-admin-key': process.env.ADMIN_KEY },
  });
  assert.equal(pRes.status, 200);
  const pText = await pRes.text();
  assert.match(pText, /twist_http_requests_total/);
  assert.match(pText, /twist_sqlite_db_bytes/);
});
