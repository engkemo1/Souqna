/**
 * Keeps the CLIP model files in Cloudflare R2 (the bucket you already use for photos) instead of a persistent volume.
 *   restoreModel()  → copies models/<id>/** from R2 into the local cache dir (container disk, may be wiped on every deploy)
 *   uploadModel()   → copies the local cache dir to R2 (done automatically the first time the model had to come from HuggingFace)
 * A manifest.json lists the files so no bucket-listing permission is needed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { r2Enabled, r2Get, r2Put } from './r2.js';

const prefix = (modelId) => `models/${modelId}`;
const defaultStore = { enabled: () => r2Enabled, get: r2Get, put: r2Put };

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, base));
    else if (!e.name.endsWith('.lock') && !e.name.endsWith('.tmp')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/** true when the model is now present locally (restored from R2, or already complete). */
export async function restoreModel(cacheDir, modelId, store = defaultStore) {
  if (!store.enabled()) return false;
  let manifest;
  try { manifest = JSON.parse((await store.get(`${prefix(modelId)}/manifest.json`)).toString('utf8')); } catch { return false; } // not uploaded yet
  if (!Array.isArray(manifest.files) || !manifest.files.length) return false;
  const root = path.join(cacheDir, modelId);
  for (const f of manifest.files) {
    const dest = path.join(root, ...f.path.split('/'));
    if (!dest.startsWith(root + path.sep)) throw new Error(`unsafe path in manifest: ${f.path}`);
    const have = await fs.stat(dest).then((s) => s.size).catch(() => -1);
    if (have === f.size) continue;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const buf = await store.get(`${prefix(modelId)}/${f.path}`);
    if (buf.length !== f.size) throw new Error(`size mismatch for ${f.path}`);
    await fs.writeFile(dest, buf);
  }
  return true;
}

/** Uploads every cached file of the model, then the manifest (last, so a half-finished upload is never "complete"). */
export async function uploadModel(cacheDir, modelId, store = defaultStore) {
  if (!store.enabled()) return false;
  const root = path.join(cacheDir, modelId);
  const files = [];
  for (const rel of await walk(root)) {
    const buf = await fs.readFile(path.join(root, ...rel.split('/')));
    await store.put(`${prefix(modelId)}/${rel}`, buf);
    files.push({ path: rel, size: buf.length });
  }
  if (!files.length) return false;
  await store.put(`${prefix(modelId)}/manifest.json`, Buffer.from(JSON.stringify({ model: modelId, files, at: new Date().toISOString() })));
  return true;
}
