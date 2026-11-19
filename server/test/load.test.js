import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const dbFile = path.join(os.tmpdir(), `souqna-load-${randomUUID()}.db`);
process.env.DB_FILE = dbFile;
process.env.JWT_SECRET = `load-jwt-secret-${randomUUID()}-min32charslong`;
process.env.ADMIN_KEY = `load-admin-key-${randomUUID()}`;
process.env.SITE_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';

const { app } = await import('../src/index.js');

const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('Load Test: 100 concurrent requests over /api/health with p99 < 500ms and 0% errors', async () => {
  const TOTAL_REQUESTS = 100;
  const latencies = [];
  let errorCount = 0;

  const runRequest = async () => {
    const start = performance.now();
    try {
      const res = await fetch(`${base}/api/health`);
      const duration = performance.now() - start;
      latencies.push(duration);
      if (res.status !== 200) errorCount++;
    } catch {
      errorCount++;
    }
  };

  const tasks = Array.from({ length: TOTAL_REQUESTS }, () => runRequest());
  await Promise.all(tasks);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const errorRate = (errorCount / TOTAL_REQUESTS) * 100;

  console.log(`[load-test] requests: ${TOTAL_REQUESTS}, errors: ${errorCount} (${errorRate}%), p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);

  assert.equal(errorCount, 0, `0% error rate expected, got ${errorCount} errors`);
  assert.ok(p99 < 500, `p99 latency should be < 500ms, got ${p99.toFixed(2)}ms`);
});

test('QA-07 Load Test: 50 concurrent logins with p95 measurement', async () => {
  const { db, insert } = await import('../src/db/index.js');
  const { hashPassword } = await import('../src/lib/auth.js');

  const email = `load-user-${randomUUID().slice(0, 8)}@example.test`;
  const pass = 'CorrectLoginPass#123';
  const hashed = await hashPassword(pass);
  const uid = insert('users', { name: 'Load User', email, password_hash: hashed, role: 'owner', token_version: 1 });
  insert('stores', { owner_id: uid, slug: `load-st-${uid}`, code: 'LD', name_ar: 'محل لود', name_en: 'Load Store', departments: ',men,' });

  const CONCURRENT_LOGINS = 50;
  const latencies = [];
  let errors = 0;

  const runLogin = async () => {
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const dur = performance.now() - t0;
      latencies.push(dur);
      if (res.status !== 200) errors++;
    } catch {
      errors++;
    }
  };

  const tasks = Array.from({ length: CONCURRENT_LOGINS }, () => runLogin());
  await Promise.all(tasks);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log(`[QA-07 login-load-test] 50 concurrent logins: errors=${errors}, p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`);
  assert.equal(errors, 0, 'All 50 concurrent logins must succeed');
  assert.ok(p95 < 5000, `p95 latency under 50 concurrent logins must be < 5000ms, got ${p95.toFixed(2)}ms`);
});
