/**
 * Cloudflare R2 (S3-compatible) client — no dependencies, AWS Signature V4 over fetch.
 * Enabled only when all R2_* variables are set; otherwise photos stay on the local disk (MEDIA_DIR).
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

const c = config.r2;
export const r2Enabled = Boolean(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicUrl);
const endpoint = process.env.R2_ENDPOINT || `https://${c.accountId}.r2.cloudflarestorage.com`; // R2_ENDPOINT only for EU buckets / tests
const host = new URL(endpoint).host;
const sha = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const enc = (key) => key.split('/').map(encodeURIComponent).join('/');

async function request(method, key, body, contentType) {
  const payload = body || Buffer.alloc(0);
  const now = new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amz.slice(0, 8);
  const pathName = `/${c.bucket}/${enc(key)}`;
  const payloadHash = sha(payload);
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz };
  if (contentType) headers['content-type'] = contentType;
  const names = Object.keys(headers).sort();
  const canonical = [method, pathName, '', names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
  const kSig = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, day), 'auto'), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSig).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  delete headers.host;
  const res = await fetch(`${endpoint}${pathName}`, { method, headers, body: method === 'PUT' ? payload : undefined });
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new Error(`R2 ${method} ${key} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res;
}

const TYPES = { webp: 'image/webp', jpg: 'image/jpeg' };
export const r2Put = (key, buf) => request('PUT', key, buf, TYPES[key.split('.').pop()] || 'application/octet-stream');
export const r2Delete = (key) => request('DELETE', key);
export async function r2Get(key) { const r = await request('GET', key); return Buffer.from(await r.arrayBuffer()); }
