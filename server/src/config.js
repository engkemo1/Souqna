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
  // Accounts are created by the BanhaLook team, not by the public. Set ALLOW_REGISTER=1 only to re-open sign-up.
  allowRegister: process.env.ALLOW_REGISTER === '1',
  // Platform admin key for /admin (sent as the x-admin-key header). Required to use the admin tools.
  adminKey: process.env.ADMIN_KEY || '',
  // WhatsApp Cloud API (Meta). Used only when a store's auto_whatsapp switch is on.
  wa: {
    token: process.env.WA_TOKEN || '',
    phoneId: process.env.WA_PHONE_ID || '',
    template: process.env.WA_TEMPLATE || 'new_order',
    lang: process.env.WA_TEMPLATE_LANG || 'ar',
    apiBase: process.env.WA_API_BASE || 'https://graph.facebook.com/v21.0',
  },
};
