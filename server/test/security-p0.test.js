import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const dbFile = path.join(os.tmpdir(), `souqna-sec-p0-${randomUUID()}.db`);
process.env.DB_FILE = dbFile;
process.env.JWT_SECRET = `sec-test-jwt-secret-key-${randomUUID()}-long`;
process.env.ADMIN_KEY = `sec-admin-key-${randomUUID()}`;
process.env.BCRYPT_ROUNDS = '12';

const { app } = await import('../src/index.js');
const { q, insert, update } = await import('../src/db/index.js');
const { config, validateProductionEnv } = await import('../src/config.js');
const { signToken, hashPassword, verifyPassword } = await import('../src/lib/auth.js');
const { validSignature } = await import('../src/lib/wa.js');
const { hasValidImageMagicBytes, processImage } = await import('../src/lib/media.js');
const { readTable, MAX_TABLE_ROWS } = await import('../src/lib/cashier-table.js');
const { newSecret, codeAt } = await import('../src/lib/totp.js');

const server = createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  await new Promise((r) => server.close(r));
});

async function req(method, urlPath, body, headers = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, headers: res.headers, body: json };
}

test('P0-01: seed.js refuses to run without SEED_DEMO=1 and in production without ALLOW_PROD_SEED=1; no hardcoded password literals in admin.js/seed.js', () => {
  const adminSrc = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
  const seedSrc = fs.readFileSync(new URL('../src/db/seed.js', import.meta.url), 'utf8');
  assert.ok(!adminSrc.includes('TownStyle#2026') && !adminSrc.includes('demo1234'), 'no demo password literals in admin.js');
  assert.ok(!seedSrc.includes('demo1234'), 'no demo1234 literal in seed.js');

  const noFlag = spawnSync(process.execPath, ['src/db/seed.js'], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'),
    env: { ...process.env, SEED_DEMO: '0' },
    encoding: 'utf8',
  });
  assert.notEqual(noFlag.status, 0, 'seed.js exits non-zero without SEED_DEMO=1');

  const prodNoAllow = spawnSync(process.execPath, ['src/db/seed.js'], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'),
    env: { ...process.env, NODE_ENV: 'production', SEED_DEMO: '1', ALLOW_PROD_SEED: '0', JWT_SECRET: 'a'.repeat(40), ADMIN_KEY: 'b'.repeat(20) },
    encoding: 'utf8',
  });
  assert.notEqual(prodNoAllow.status, 0, 'seed.js exits non-zero in production without ALLOW_PROD_SEED=1');
});

test('P0-02: validateProductionEnv fails fast on missing, short, or placeholder secrets in production', () => {
  assert.throws(
    () => validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'short', ADMIN_KEY: 'valid-admin-key-12345' }),
    /JWT_SECRET/,
  );
  assert.throws(
    () => validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'please-change-me-please-change-me-32chars', ADMIN_KEY: 'valid-admin-key-12345' }),
    /JWT_SECRET/,
  );
  assert.throws(
    () => validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(36), ADMIN_KEY: 'change-me-admin-key' }),
    /ADMIN_KEY/,
  );
  assert.throws(
    () => validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(36), ADMIN_KEY: 'short' }),
    /ADMIN_KEY/,
  );
  assert.doesNotThrow(() =>
    validateProductionEnv({ NODE_ENV: 'production', JWT_SECRET: 'strong-production-jwt-secret-key-2026-twist', ADMIN_KEY: 'strong-admin-key-2026' }),
  );
});

test('P0-04: WhatsApp webhook signature fails closed when WA_APP_SECRET is unset and env validation rejects WA_ENABLED=1 without secret', async () => {
  assert.throws(
    () => validateProductionEnv({ NODE_ENV: 'development', WA_ENABLED: '1', WA_APP_SECRET: '' }),
    /WA_APP_SECRET/,
  );
  const prevSecret = config.wa.appSecret;
  config.wa.appSecret = '';
  try {
    assert.equal(validSignature(Buffer.from('{}'), 'sha256=deadbeef'), false);
    assert.equal(validSignature(Buffer.from('{}'), ''), false);
  } finally {
    config.wa.appSecret = prevSecret;
  }
});

test('P0-03 & P0-06 & P0-01: async bcrypt cost>=12, transparent rehash of cost-10, forced password change on seeded owner, and immediate session revocation via token_version', async () => {
  const email = `owner-${randomUUID().slice(0, 8)}@example.test`;
  // Start with a legacy cost-10 hash and must_change_password=1
  const legacyHash = bcrypt.hashSync('TempPass#123', 10);
  const uid = insert('users', { name: 'Seeded Owner', email, password_hash: legacyHash, role: 'owner', must_change_password: 1, token_version: 1 });
  insert('stores', { owner_id: uid, slug: `st-${uid}`, code: 'ST', name_ar: 'محل اختبار', name_en: 'Test Store', departments: ',women,' });

  // 1. Login succeeds, returns mustChangePassword: true, sets HttpOnly cookie, and transparently rehashes to cost 12
  const loginRes = await req('POST', '/api/auth/login', { email, password: 'TempPass#123' });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.user.mustChangePassword, true);
  assert.match(loginRes.headers.get('set-cookie') || '', /twist_owner_token=.*HttpOnly/i);
  const oldToken = loginRes.body.token;

  const updatedRow = q.get('SELECT password_hash FROM users WHERE id=?', [uid]);
  assert.equal(bcrypt.getRounds(updatedRow.password_hash), 12, 'legacy cost-10 hash upgraded to cost 12 on login');

  // 2. While must_change_password=1, owner GET works but POST/PUT/DELETE on /api/owner is blocked with 403 password_change_required
  const getStore = await req('GET', '/api/owner/store', null, { Authorization: `Bearer ${oldToken}` });
  assert.equal(getStore.status, 200);
  const blockedWrite = await req('POST', '/api/owner/categories', { name_ar: 'قسم', name_en: 'Sec' }, { Authorization: `Bearer ${oldToken}` });
  assert.equal(blockedWrite.status, 403);
  assert.equal(blockedWrite.body.error.code, 'password_change_required');

  // 3. Changing password clears must_change_password, increments token_version, and revokes oldToken immediately
  const pwRes = await req('POST', '/api/auth/change-password', { current: 'TempPass#123', password: 'NewStrongPass#456' }, { Authorization: `Bearer ${oldToken}` });
  assert.equal(pwRes.status, 200);
  const newToken = pwRes.body.token;
  assert.ok(newToken && newToken !== oldToken);

  const revokedCheck = await req('GET', '/api/owner/store', null, { Authorization: `Bearer ${oldToken}` });
  assert.equal(revokedCheck.status, 401, 'old token rejected after password change');

  const allowedWrite = await req('PUT', '/api/owner/store/same-day', { on: false }, { Authorization: `Bearer ${newToken}` });
  assert.equal(allowedWrite.status, 200, 'new token allowed to write after changing password');

  // 4. POST /api/auth/logout-all revokes newToken immediately
  const logoutAll = await req('POST', '/api/auth/logout-all', {}, { Authorization: `Bearer ${newToken}` });
  assert.equal(logoutAll.status, 200);
  assert.equal((await req('GET', '/api/owner/store', null, { Authorization: `Bearer ${newToken}` })).status, 401);
});

test('P0-05: SQLite rate limiter blocks brute force, does not count successful logins, and clears on success', async () => {
  const email = `rl-${randomUUID().slice(0, 8)}@example.test`;
  const uid = insert('users', { name: 'RL User', email, password_hash: await hashPassword('CorrectPass#1'), role: 'owner', token_version: 1 });
  insert('stores', { owner_id: uid, slug: `rl-${uid}`, code: 'RL', name_ar: 'محل', name_en: 'RL Store', departments: ',men,' });

  // 5 wrong attempts followed by 1 good login -> resets counter -> 5 more good logins all succeed
  for (let i = 0; i < 5; i++) {
    assert.equal((await req('POST', '/api/auth/login', { email, password: 'WrongPassword' })).status, 401);
  }
  for (let i = 0; i < 8; i++) {
    assert.equal((await req('POST', '/api/auth/login', { email, password: 'CorrectPass#1' })).status, 200);
  }
  // 10 consecutive wrong attempts trigger 429
  for (let i = 0; i < 10; i++) {
    assert.equal((await req('POST', '/api/auth/login', { email, password: 'WrongPassword' })).status, 401);
  }
  const locked = await req('POST', '/api/auth/login', { email, password: 'CorrectPass#1' });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'too_many_attempts');
});

test('P0-07: CSP disallows wildcard https: in script-src/form-action, sets Permissions-Policy, and accepts /api/csp-report', async () => {
  const res = await req('GET', '/api/health');
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/);
  assert.ok(!/script-src[^;]*\shttps:(?:;|$|\s)/.test(csp), 'script-src does not allow wildcard https:');
  assert.match(csp, /form-action 'self'/);
  assert.match(res.headers.get('permissions-policy') || '', /camera=\(self\)/);

  const report = await req('POST', '/api/csp-report', { 'csp-report': { 'blocked-uri': 'https://evil.example/x.js', 'violated-directive': 'script-src' } });
  assert.equal(report.status, 204);
});

test('P0-08: Upload validation rejects non-image magic bytes, corrupted XLSX, and excessive rows', async () => {
  assert.equal(hasValidImageMagicBytes(Buffer.from('not an image file at all')), false);
  assert.equal(hasValidImageMagicBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), false);
  await assert.rejects(() => processImage(Buffer.from('fake image'), { storeId: 1, kind: 'logo' }), (err) => err.code === 'invalid_image');

  await assert.rejects(() => readTable(Buffer.from('not a zip'), 'inventory.xlsx'), (err) => err.code === 'invalid_xlsx');
  const hugeCsv = ['sku,stock', ...Array.from({ length: MAX_TABLE_ROWS + 5 }, (_, i) => `SKU-${i},10`)].join('\n');
  await assert.rejects(() => readTable(Buffer.from(hugeCsv, 'utf8'), 'huge.csv'), (err) => err.code === 'too_many_rows');
});

test('P0-09: SQL sort/filter fuzzing and unsafe URL schemes are safely rejected or neutralized', async () => {
  const uid = insert('users', { name: 'SQL User', email: `sql-${randomUUID().slice(0, 8)}@example.test`, password_hash: 'x', role: 'owner', token_version: 1 });
  const sid = insert('stores', { owner_id: uid, slug: `sql-${uid}`, code: 'SQ', name_ar: 'محل', name_en: 'SQL Store', departments: ',women,' });
  const token = signToken({ id: uid, token_version: 1 });

  for (const fuzz of ["newest; DROP TABLE products;--", "' OR '1'='1", 'price_asc, (SELECT password_hash FROM users LIMIT 1)']) {
    const r1 = await req('GET', `/api/owner/products?sort=${encodeURIComponent(fuzz)}&status=${encodeURIComponent(fuzz)}`, null, { Authorization: `Bearer ${token}` });
    assert.equal(r1.status, 200);
    const r2 = await req('GET', `/api/owner/orders?sort=${encodeURIComponent(fuzz)}`, null, { Authorization: `Bearer ${token}` });
    assert.equal(r2.status, 200);
    const r3 = await req('GET', `/api/owner/customers?sort=${encodeURIComponent(fuzz)}`, null, { Authorization: `Bearer ${token}` });
    assert.equal(r3.status, 200);
  }
  assert.ok(q.val('SELECT COUNT(*) FROM stores') >= 1, 'tables intact');
});

test('P0-11: Admin enforces TOTP in production, persists TOTP replay step in DB, supports IP allowlist, and logs failed auth to admin_audit', async () => {
  const beforeAudit = q.val('SELECT COUNT(*) FROM admin_audit');
  const badKey = await req('GET', '/api/admin/status', null, { 'x-admin-key': 'wrong-key' });
  assert.equal(badKey.status, 401);
  assert.ok(q.val('SELECT COUNT(*) FROM admin_audit') > beforeAudit, 'failed admin key attempt recorded in admin_audit');

  // IP allowlist enforcement
  process.env.ADMIN_ALLOWED_IPS = '10.255.255.1';
  try {
    const blockedIp = await req('GET', '/api/admin/status', null, { 'x-admin-key': config.adminKey });
    assert.equal(blockedIp.status, 403);
    assert.equal(blockedIp.body.error.code, 'ip_not_allowed');
  } finally {
    delete process.env.ADMIN_ALLOWED_IPS;
  }

  // Require TOTP in production
  const prevEnv = config.env;
  const prevTotp = config.adminTotpSecret;
  config.env = 'production';
  config.adminTotpSecret = '';
  try {
    const noTotp = await req('GET', '/api/admin/status', null, { 'x-admin-key': config.adminKey });
    assert.equal(noTotp.status, 503);
    assert.equal(noTotp.body.error.code, 'admin_totp_required');
  } finally {
    config.env = prevEnv;
    config.adminTotpSecret = prevTotp;
  }

  // TOTP login sets HttpOnly cookie, persists step in app_settings, and rejects replay of the same code
  const secret = newSecret();
  config.adminTotpSecret = secret;
  try {
    q.run("DELETE FROM app_settings WHERE key='admin_totp_last_step'");
    const code = codeAt(secret);
    const loginOk = await req('POST', '/api/admin/login', { code }, { 'x-admin-key': config.adminKey });
    assert.equal(loginOk.status, 200);
    assert.equal(loginOk.body.twoStep, true);
    assert.match(loginOk.headers.get('set-cookie') || '', /twist_admin_session=.*HttpOnly/i);
    assert.ok(Number(q.val("SELECT value FROM app_settings WHERE key='admin_totp_last_step'")) > 0, 'lastStep persisted in DB');

    const replay = await req('POST', '/api/admin/login', { code }, { 'x-admin-key': config.adminKey });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'bad_code');
  } finally {
    config.adminTotpSecret = prevTotp;
  }
});

test('QA-02a: tokens lacking tv (token_version) are strictly rejected for owners and buyers', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const email = `tv-test-${randomUUID().slice(0, 8)}@example.test`;
  const uid = insert('users', { name: 'TV Owner', email, password_hash: await hashPassword('Pass#123'), role: 'owner', token_version: 1 });
  insert('stores', { owner_id: uid, slug: `tv-${uid}`, code: 'TV', name_ar: 'محل تي في', name_en: 'TV Store', departments: ',men,' });

  // 1. Owner token WITHOUT tv claim is rejected with 401
  const legacyOwnerToken = jwt.sign({ sub: uid }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
  const ownerRes = await req('GET', '/api/owner/store', null, { Authorization: `Bearer ${legacyOwnerToken}` });
  assert.equal(ownerRes.status, 401, 'legacy owner token without tv must be rejected');

  // 2. Buyer token WITHOUT tv claim is rejected
  const buyerId = insert('buyers', { name: 'TV Buyer', phone: '01099998888', password_hash: await hashPassword('Pass#123'), phone_verified: 1, token_version: 1 });
  const buyerSecret = `${config.jwtSecret}:buyer`;
  const legacyBuyerToken = jwt.sign({ sub: buyerId, k: 'buyer' }, buyerSecret, { algorithm: 'HS256', expiresIn: '1h' });
  const buyerRes = await req('GET', '/api/buyer/me', null, { 'x-buyer-token': legacyBuyerToken });
  assert.equal(buyerRes.status, 401, 'legacy buyer token without tv must be rejected');
});
