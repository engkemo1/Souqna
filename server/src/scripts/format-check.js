#!/usr/bin/env node
/**
 * Non-blocking format check (warnings only in Phase 0 as required by instructions).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIRS = [
  path.join(ROOT, 'server', 'src'),
  path.join(ROOT, 'shared'),
  path.join(ROOT, 'web', 'src'),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(m?js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(d));
let crlfCount = 0;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('\r\n')) crlfCount++;
}
if (crlfCount > 0) {
  console.warn(`[format:warn] ${crlfCount} file(s) use CRLF line endings (see .editorconfig / .prettierrc.json).`);
}
console.log(`[format:check] Checked ${files.length} source files (warnings only).`);
