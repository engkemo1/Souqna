import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const env = process.env.NODE_ENV || 'development';
const rawJwtSecret = process.env.JWT_SECRET || '';
const jwtSecretInsecure = !rawJwtSecret || rawJwtSecret.startsWith('dev-only') || rawJwtSecret.length < 24;

export const config = {
  port: Number(process.env.PORT || 4000),
  env,
  jwtSecretInsecure,
  jwtSecret: !jwtSecretInsecure
    ? rawJwtSecret
    : env === 'production'
      ? crypto.randomBytes(32).toString('hex')
      : rawJwtSecret || 'dev-only-change-me-souqna',
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'souqna.db'),
  mediaDir: process.env.MEDIA_DIR || path.join(ROOT, 'data', 'media'),
  // Set to your CDN origin (e.g. https://cdn.banhalook.app/media) — the API emits URLs relative to this base.
  mediaBaseUrl: process.env.MEDIA_BASE_URL || '/media',
  // Cloudflare R2 photo storage (optional). When all five are set, new photos go to R2 instead of the volume.
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
  },
  webDist: path.resolve(ROOT, '..', 'web', 'dist'),
  maxUploadMb: 15,
  // Accounts are created by the Twist team, not by the public. Set ALLOW_REGISTER=1 only to re-open sign-up.
  allowRegister: process.env.ALLOW_REGISTER === '1',
  // Platform admin key for /admin (sent as the x-admin-key header). Required to use the admin tools.
  // The public demo account (ahmed@…): always read-only, so "Try the dashboard" can never change a real store or the site.
  demoEmail: (process.env.DEMO_EMAIL || 'ahmed@banhalook.app').toLowerCase(),
  adminKey: process.env.ADMIN_KEY || '',
  // Google sign-in: the OAuth Web client id (public value). Leave empty to hide the Google button.
  googleClientId: (process.env.GOOGLE_CLIENT_ID || '982783137966-un49hfr1o0mkajd46nahhc2higrvm6e8.apps.googleusercontent.com').trim(),
  // Optional two-step confirmation for /admin: a base32 secret (generate with `npm run admin-totp -w server`). When set, the key alone is not enough.
  adminTotpSecret: (process.env.ADMIN_TOTP_SECRET || '').replace(/\s/g, ''),
  // Daily backup (database + photos). Set BACKUP_DIR to a folder on a persistent disk / synced drive. BACKUP_KEEP_DAYS = how many daily DB copies to keep.
  backupDir: process.env.BACKUP_DIR || '',
  backupKeepDays: Number(process.env.BACKUP_KEEP_DAYS || 14),
  // WhatsApp Cloud API (Meta). Used only when a store's auto_whatsapp switch is on.
  // Twist team number that gets a WhatsApp alert whenever an order must be delivered by us.
  indexNowKey: process.env.INDEXNOW_KEY || '4c71c0c9e5781e1ad172891efd3e6767', // public by design (served at /<key>.txt); INDEXNOW_KEY=off disables
  siteUrl: (process.env.PUBLIC_SITE_URL || 'https://twistegy.com').replace(/\/+$/, ''),
  platformWa: process.env.PLATFORM_WA || '201206928670',
  wa: {
    token: process.env.WA_TOKEN || '',
    phoneId: process.env.WA_PHONE_ID || '',
    template: process.env.WA_TEMPLATE || 'new_order',
    serviceTemplate: process.env.WA_SERVICE_TEMPLATE || 'service_request',
    platformTemplate: process.env.WA_PLATFORM_TEMPLATE || 'delivery_request',
    alertTemplate: process.env.WA_ALERT_TEMPLATE || '', // optional: approved template with ONE variable ({{1}} = the message) for team alerts
    lang: process.env.WA_TEMPLATE_LANG || 'ar',
    apiBase: process.env.WA_API_BASE || 'https://graph.facebook.com/v21.0',
    // Inbound webhook (Meta → /api/wa/webhook). verifyToken: any secret string you also type in Meta's Webhooks screen.
    // Master switch for the new WhatsApp features (webhook, sign-in codes, products by WhatsApp). Off unless WA_ENABLED=1.
    enabled: process.env.WA_ENABLED === '1',
    verifyToken: process.env.WA_VERIFY_TOKEN || '',
    // App secret (Meta App → Settings → Basic). When set, every webhook call must carry a valid X-Hub-Signature-256.
    appSecret: process.env.WA_APP_SECRET || '',
    // Approved AUTHENTICATION template (copy-code button) used for customer sign-in codes.
    authTemplate: process.env.WA_AUTH_TEMPLATE || '',
    // Approved UTILITY template for order updates to customers who ordered without an account (push covers signed-in shoppers).
    // Body (4 variables): أهلاً {{1}}، طلبك رقم {{2}}: {{3}}. تتبّع طلبك من هنا: {{4}}   — empty = feature off.
    customerTemplate: process.env.WA_CUSTOMER_TEMPLATE || '',
    authLang: process.env.WA_AUTH_LANG || process.env.WA_TEMPLATE_LANG || 'ar',
  },
};
