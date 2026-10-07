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
  // Set to your CDN origin (e.g. https://cdn.souqna.app/media) — the API emits URLs relative to this base.
  mediaBaseUrl: process.env.MEDIA_BASE_URL || '/media',
  webDist: path.resolve(ROOT, '..', 'web', 'dist'),
  maxUploadMb: 15,
};
