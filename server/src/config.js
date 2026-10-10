import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-souqna',
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'souqna.db'),
  mediaDir: process.env.MEDIA_DIR || path.join(ROOT, 'data', 'media'),
  // Set to your CDN origin (e.g. https://cdn.banhalook.app/media) — the API emits URLs relative to this base.
  mediaBaseUrl: process.env.MEDIA_BASE_URL || '/media',
  webDist: path.resolve(ROOT, '..', 'web', 'dist'),
  maxUploadMb: 15,
  // Accounts are created by the Banha Outfit team, not by the public. Set ALLOW_REGISTER=1 only to re-open sign-up.
  allowRegister: process.env.ALLOW_REGISTER === '1',
  // Platform admin key for /admin (sent as the x-admin-key header). Required to use the admin tools.
  // The public demo account (ahmed@…): always read-only, so "Try the dashboard" can never change a real store or the site.
  demoEmail: (process.env.DEMO_EMAIL || 'ahmed@banhalook.app').toLowerCase(),
  adminKey: process.env.ADMIN_KEY || '',
  // Optional two-step confirmation for /admin: a base32 secret (generate with `npm run admin-totp -w server`). When set, the key alone is not enough.
  adminTotpSecret: (process.env.ADMIN_TOTP_SECRET || '').replace(/\s/g, ''),
  // Daily backup (database + photos). Set BACKUP_DIR to a folder on a persistent disk / synced drive. BACKUP_KEEP_DAYS = how many daily DB copies to keep.
  backupDir: process.env.BACKUP_DIR || '',
  backupKeepDays: Number(process.env.BACKUP_KEEP_DAYS || 14),
  // WhatsApp Cloud API (Meta). Used only when a store's auto_whatsapp switch is on.
  // Banha Outfit team number that gets a WhatsApp alert whenever an order must be delivered by us.
  platformWa: process.env.PLATFORM_WA || '201067378110',
  wa: {
    token: process.env.WA_TOKEN || '',
    phoneId: process.env.WA_PHONE_ID || '',
    template: process.env.WA_TEMPLATE || 'new_order',
    serviceTemplate: process.env.WA_SERVICE_TEMPLATE || 'service_request',
    platformTemplate: process.env.WA_PLATFORM_TEMPLATE || 'delivery_request',
    lang: process.env.WA_TEMPLATE_LANG || 'ar',
    apiBase: process.env.WA_API_BASE || 'https://graph.facebook.com/v21.0',
  },
};
