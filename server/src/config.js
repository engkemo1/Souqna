import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envSchema, isPlaceholderSecret, validateProductionEnv } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export function buildConfig(rawEnv = process.env) {
  const parsed = validateProductionEnv(rawEnv);
  const env = parsed.NODE_ENV;
  const rawJwtSecret = parsed.JWT_SECRET.trim();
  const jwtSecretInsecure = !rawJwtSecret || isPlaceholderSecret(rawJwtSecret) || rawJwtSecret.length < 32;
  const rawAdminKey = parsed.ADMIN_KEY.trim();
  const adminKeyInsecure = !rawAdminKey || isPlaceholderSecret(rawAdminKey) || rawAdminKey.length < 16;

  return {
    port: parsed.PORT,
    env,
    workerRole: parsed.WORKER_ROLE,
    jwtSecretInsecure,
    adminKeyInsecure,
    jwtSecret: !jwtSecretInsecure
      ? rawJwtSecret
      : rawJwtSecret || 'dev-only-change-me-souqna',
    jwtExpiresIn: parsed.JWT_EXPIRES_IN || '1h',
    bcryptRounds: parsed.BCRYPT_ROUNDS || 12,
    dbFile: parsed.DB_FILE || path.join(ROOT, 'data', 'souqna.db'),
    mediaDir: parsed.MEDIA_DIR || path.join(ROOT, 'data', 'media'),
    mediaBaseUrl: parsed.MEDIA_BASE_URL || '/media',
    r2: {
      accountId: parsed.R2_ACCOUNT_ID,
      accessKeyId: parsed.R2_ACCESS_KEY_ID,
      secretAccessKey: parsed.R2_SECRET_ACCESS_KEY,
      bucket: parsed.R2_BUCKET,
      publicUrl: parsed.R2_PUBLIC_URL.replace(/\/+$/, ''),
    },
    webDist: path.resolve(ROOT, '..', 'web', 'dist'),
    maxUploadMb: 15,
    allowRegister: parsed.ALLOW_REGISTER === '1',
    seedDemo: parsed.SEED_DEMO === '1',
    allowProdSeed: parsed.ALLOW_PROD_SEED === '1',
    allowEmptyDb: parsed.ALLOW_EMPTY_DB === '1',
    demoEmail: parsed.DEMO_EMAIL.toLowerCase(),
    adminKey: rawAdminKey,
    googleClientId: (
      parsed.GOOGLE_CLIENT_ID ||
      (env !== 'production' ? '982783137966-un49hfr1o0mkajd46nahhc2higrvm6e8.apps.googleusercontent.com' : '')
    ).trim(),
    adminTotpSecret: parsed.ADMIN_TOTP_SECRET.replace(/\s/g, ''),
    adminAllowedIps: parsed.ADMIN_ALLOWED_IPS.split(',').map((s) => s.trim()).filter(Boolean),
    backupDir: parsed.BACKUP_DIR,
    backupKeepDays: parsed.BACKUP_KEEP_DAYS,
    indexNowKey: parsed.INDEXNOW_KEY || (env !== 'production' ? '4c71c0c9e5781e1ad172891efd3e6767' : 'off'),
    siteUrl: parsed.PUBLIC_SITE_URL.replace(/\/+$/, ''),
    platformWa: parsed.PLATFORM_WA,
    cspReportOnly: env === 'production' ? parsed.CSP_REPORT_ONLY !== '0' : parsed.CSP_REPORT_ONLY === '1',
    wa: {
      token: parsed.WA_TOKEN,
      phoneId: parsed.WA_PHONE_ID,
      template: parsed.WA_TEMPLATE,
      serviceTemplate: parsed.WA_SERVICE_TEMPLATE,
      platformTemplate: parsed.WA_PLATFORM_TEMPLATE,
      alertTemplate: parsed.WA_ALERT_TEMPLATE,
      lang: parsed.WA_TEMPLATE_LANG,
      apiBase: parsed.WA_API_BASE,
      enabled: parsed.WA_ENABLED === '1' && Boolean(parsed.WA_APP_SECRET.trim()),
      verifyToken: parsed.WA_VERIFY_TOKEN,
      appSecret: parsed.WA_APP_SECRET.trim(),
      authTemplate: parsed.WA_AUTH_TEMPLATE,
      customerTemplate: parsed.WA_CUSTOMER_TEMPLATE,
      authLang: parsed.WA_AUTH_LANG || parsed.WA_TEMPLATE_LANG || 'ar',
    },
  };
}

export const config = buildConfig(process.env);
export { envSchema, isPlaceholderSecret, validateProductionEnv };
