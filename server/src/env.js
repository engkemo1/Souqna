import { z } from 'zod';

const PLACEHOLDER_SECRETS = new Set([
  'please-change-me',
  'change-me-admin-key',
  'dev-only-change-me-souqna',
  'change-me',
  'secret',
  'admin',
  'password',
  '123456',
]);

export function isPlaceholderSecret(val) {
  const s = String(val || '').trim().toLowerCase();
  if (!s) return true;
  if (PLACEHOLDER_SECRETS.has(s)) return true;
  if (s.startsWith('dev-only') || s.startsWith('please-change') || s.startsWith('change-me')) return true;
  return false;
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  WORKER_ROLE: z.enum(['all', 'web', 'worker']).default('all'),
  JWT_SECRET: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('1h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  ADMIN_KEY: z.string().default(''),
  ADMIN_TOTP_SECRET: z.string().default(''),
  ADMIN_ALLOWED_IPS: z.string().default(''),
  ALLOW_REGISTER: z.string().default('0'),
  SEED_DEMO: z.string().default('0'),
  ALLOW_PROD_SEED: z.string().default('0'),
  ALLOW_EMPTY_DB: z.string().default('0'),
  DEMO_EMAIL: z.string().default('ahmed@banhalook.app'),
  PUBLIC_SITE_URL: z.string().default('https://twistegy.com'),
  PLATFORM_WA: z.string().default('201206928670'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  INDEXNOW_KEY: z.string().default(''),
  DB_FILE: z.string().default(''),
  MEDIA_DIR: z.string().default(''),
  MEDIA_BASE_URL: z.string().default('/media'),
  BACKUP_DIR: z.string().default(''),
  BACKUP_KEEP_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),
  BACKUP_R2_BUCKET: z.string().default(''),
  WA_ENABLED: z.string().default('0'),
  WA_TOKEN: z.string().default(''),
  WA_PHONE_ID: z.string().default(''),
  WA_TEMPLATE: z.string().default('new_order'),
  WA_SERVICE_TEMPLATE: z.string().default('service_request'),
  WA_PLATFORM_TEMPLATE: z.string().default('delivery_request'),
  WA_ALERT_TEMPLATE: z.string().default(''),
  WA_TEMPLATE_LANG: z.string().default('ar'),
  WA_API_BASE: z.string().default('https://graph.facebook.com/v21.0'),
  WA_VERIFY_TOKEN: z.string().default(''),
  WA_APP_SECRET: z.string().default(''),
  WA_AUTH_TEMPLATE: z.string().default(''),
  WA_CUSTOMER_TEMPLATE: z.string().default(''),
  WA_AUTH_LANG: z.string().default(''),
  CSP_REPORT_ONLY: z.string().default('0'),
});

/**
 * Validates raw environment variables and enforces fail-fast rules for production.
 * Throws an Error with all validation problems if production requirements are not met.
 */
export function validateProductionEnv(rawEnv = process.env) {
  const parsed = envSchema.parse(rawEnv);
  const errors = [];
  const isProd = parsed.NODE_ENV === 'production';

  const jwtSecret = parsed.JWT_SECRET.trim();
  const adminKey = parsed.ADMIN_KEY.trim();
  const waEnabled = parsed.WA_ENABLED === '1';
  const waAppSecret = parsed.WA_APP_SECRET.trim();

  if (waEnabled && !waAppSecret) {
    errors.push('WA_ENABLED=1 requires a non-empty WA_APP_SECRET to verify webhook signatures.');
  }

  if (isProd) {
    if (jwtSecret.length < 32 || isPlaceholderSecret(jwtSecret)) {
      errors.push('JWT_SECRET must be set to a strong non-placeholder secret of at least 32 characters in production.');
    }
    if (adminKey.length < 16 || isPlaceholderSecret(adminKey)) {
      errors.push('ADMIN_KEY must be set to a strong non-placeholder secret of at least 16 characters in production.');
    }
  }

  if (errors.length > 0) {
    const err = new Error(`[env] Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
    err.code = 'INVALID_ENV_CONFIG';
    err.errors = errors;
    throw err;
  }

  return parsed;
}

/**
 * Prints a safe startup summary of active features (never logs secret values).
 */
export function formatStartupSummary(cfg) {
  return {
    env: cfg.env,
    port: cfg.port,
    workerRole: cfg.workerRole || 'all',
    features: {
      r2Media: Boolean(cfg.r2?.bucket && cfg.r2?.accessKeyId && cfg.r2?.secretAccessKey),
      r2Backup: Boolean(process.env.BACKUP_R2_BUCKET),
      localBackup: Boolean(cfg.backupDir),
      whatsapp: Boolean(cfg.wa?.enabled && cfg.wa?.token && cfg.wa?.phoneId && cfg.wa?.appSecret),
      googleSignIn: Boolean(cfg.googleClientId),
      adminTotp: Boolean(cfg.adminTotpSecret),
      adminIpAllowlist: Boolean(cfg.adminAllowedIps?.length),
      registrationOpen: Boolean(cfg.allowRegister),
      indexNow: Boolean(cfg.indexNowKey && cfg.indexNowKey !== 'off'),
    },
  };
}
