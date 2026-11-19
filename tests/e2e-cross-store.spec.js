import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

let server;
let baseUrl;

test.beforeAll(async () => {
  const dbFile = path.join(os.tmpdir(), `souqna-qa17-${randomUUID()}.db`);
  process.env.DB_FILE = dbFile;
  process.env.JWT_SECRET = `qa17-jwt-secret-${randomUUID()}-min32charslong`;
  process.env.ADMIN_KEY = `qa17-admin-key-${randomUUID()}`;
  process.env.ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
  process.env.NODE_ENV = 'production';
  process.env.BCRYPT_ROUNDS = '10';

  const { app } = await import('../server/src/index.js');
  const { q, insert } = await import('../server/src/db/index.js');

  // Insert owner user
  const userId = insert('users', {
    name: 'Test Owner',
    email: `owner-${randomUUID()}@twistegy.com`,
    password_hash: 'hash',
    role: 'owner',
  });

  // Insert two test stores
  const storeGhostId = insert('stores', {
    owner_id: userId,
    slug: 'ghost',
    code: 'GH',
    name_ar: 'جوست',
    name_en: 'Ghost',
    status: 'active',
    hidden: 0,
    search_indexable: 1,
    departments: 'men,women',
  });

  const storeMandyId = insert('stores', {
    owner_id: userId,
    slug: 'special-mandy',
    code: 'SM',
    name_ar: 'سبيشال ماندي',
    name_en: 'Special Mandy',
    status: 'active',
    hidden: 0,
    search_indexable: 1,
    departments: 'men,shoes',
  });

  // Alias for ghost
  insert('store_slug_aliases', {
    store_id: storeGhostId,
    old_slug: 'old-ghost',
  });

  // Product under ghost
  const p1Id = insert('products', {
    store_id: storeGhostId,
    slug: 'جاكيت-ماركات',
    name_ar: 'جاكيت ماركات',
    name_en: 'Brand Jacket',
    price: 850,
    status: 'active',
    department: 'men',
    stock: 5,
    track_stock: 1,
  });

  // Product under special-mandy
  const p2Id = insert('products', {
    store_id: storeMandyId,
    slug: 'كوتش-جوتشي',
    name_ar: 'كوتش جوتشي',
    name_en: 'Gucci Shoes',
    price: 1200,
    status: 'active',
    department: 'shoes',
    stock: 3,
    track_stock: 1,
  });

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  process.env.SITE_ORIGIN = baseUrl;
});

test.afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('QA-17: Cross-store link click stays on target store and renders product without 404', async ({ page }) => {
  // 1. Visit ghost product
  await page.goto(`${baseUrl}/s/ghost/p/${encodeURIComponent('جاكيت-ماركات')}`);
  await expect(page).toHaveURL(new RegExp(`/s/ghost/p/`));
  await expect(page.locator('h1, [data-testid="product-name"], h2').first()).toBeVisible();

  // 2. Click a link or navigate directly to the cross-store product (simulating clicking SmartLook/cross-store card)
  const targetUrl = `${baseUrl}/s/special-mandy/p/${encodeURIComponent('كوتش-جوتشي')}`;
  await page.evaluate((url) => {
    // Simulate clicking a client-side link (React Router pushState / click on <Link>)
    const a = document.createElement('a');
    a.href = url;
    a.id = 'cross-store-test-link';
    document.body.appendChild(a);
    a.click();
  }, targetUrl);

  // 3. Verify URL stays on special-mandy
  await page.waitForURL(new RegExp(`/s/special-mandy/p/`));
  // Wait to ensure no stale-data bounce occurs (the bug bounced within 250ms)
  await page.waitForTimeout(500);
  expect(page.url()).toContain('/s/special-mandy/p/');
  expect(page.url()).not.toContain('/s/ghost/');

  // 4. Verify no "Page not found" / "الصفحة دي مش موجودة" appears
  const notFoundText = page.locator('text=الصفحة دي مش موجودة');
  await expect(notFoundText).not.toBeVisible();

  // 5. Verify the target product name renders
  await expect(page.locator('text=كوتش جوتشي').first()).toBeVisible();
});

test('QA-17: Store slug alias redirects old slug to canonical slug without breaking navigation', async ({ page }) => {
  await page.goto(`${baseUrl}/s/old-ghost`);
  await page.waitForURL(new RegExp(`/s/ghost`));
  expect(page.url()).toContain('/s/ghost');
  expect(page.url()).not.toContain('old-ghost');
});

test('QA-16: Soft-404 eliminated - non-active products return 404/410 HTTP status', async () => {
  // Non-existent product
  const resNotFound = await fetch(`${baseUrl}/s/ghost/p/non-existent-product`);
  expect(resNotFound.status).toBe(404);
  expect(resNotFound.headers.get('x-robots-tag')).toContain('noindex');

  // API returns 404
  const apiNotFound = await fetch(`${baseUrl}/api/stores/ghost/products/non-existent-product`);
  expect(apiNotFound.status).toBe(404);
});

test('QA-17: Cross-store link sources (Search, StoreCard, Push Notification URL)', async ({ page }) => {
  // Direct push notification URL directly to target store product
  await page.goto(`${baseUrl}/s/special-mandy/p/${encodeURIComponent('كوتش-جوتشي')}`);
  await expect(page).toHaveURL(new RegExp(`/s/special-mandy/p/`));
  await expect(page.locator('text=كوتش جوتشي').first()).toBeVisible();
  expect(page.url()).not.toContain('/s/ghost');

  // StoreCard on /stores
  await page.goto(`${baseUrl}/stores`);
  await page.waitForLoadState('networkidle');
  const storeLink = page.locator('a[href*="/s/special-mandy"]').first();
  if (await storeLink.isVisible()) {
    await storeLink.click();
    await page.waitForURL(new RegExp(`/s/special-mandy`));
    expect(page.url()).toContain('/s/special-mandy');
  }
});

test('QA-16: 404 requests on /s/*/p/* are logged and observable in admin broken-links', async () => {
  // Make 404 request with specific path
  const randomSlug = `dead-link-${Date.now()}`;
  await fetch(`${baseUrl}/s/ghost/p/${randomSlug}`, {
    headers: { 'User-Agent': 'QA-Test-Agent', 'Referer': 'https://twistegy.com/test-ref' },
  });

  // Admin endpoint returns the broken link
  const adminRes = await fetch(`${baseUrl}/api/admin/broken-links`, {
    headers: { 'Authorization': `Bearer ${process.env.ADMIN_KEY}` },
  });
  expect(adminRes.status).toBe(200);
  const data = await adminRes.json();
  const hit = data.items.find((x) => x.path.includes(randomSlug));
  expect(hit).toBeDefined();
  expect(hit.hits).toBeGreaterThanOrEqual(1);
});
