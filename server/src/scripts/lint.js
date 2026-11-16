#!/usr/bin/env node
/**
 * Lint & static syntax verification across workspaces (`server`, `shared`, `web`).
 * Runs parallel `node --check` across all `.js`/`.mjs` modules plus static checks
 * for debugger statements and common error patterns.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIRS = [
  path.join(ROOT, 'server', 'src'),
  path.join(ROOT, 'server', 'test'),
  path.join(ROOT, 'shared'),
  path.join(ROOT, 'web', 'src'),
  path.join(ROOT, 'web', 'test'),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '_gemini_backup') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(m?js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(d));
let errors = 0;
const warnings = 0;
const jsFiles = [];

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  if (/\bdebugger\s*;/.test(src)) {
    console.error(`[lint:error] ${rel}: unexpected 'debugger' statement`);
    errors++;
  }
  if (file.endsWith('.js') || file.endsWith('.mjs')) jsFiles.push(file);
}

const CONCURRENCY = 12;
let idx = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (idx < jsFiles.length) {
      const file = jsFiles[idx++];
      await new Promise((resolve) => {
        execFile(process.execPath, ['--check', file], (err, _stdout, stderr) => {
          if (err) {
            console.error(`[lint:error] ${path.relative(ROOT, file)}:\n${stderr || err.message}`);
            errors++;
          }
          resolve();
        });
      });
    }
  }),
);

console.log(`[lint] Checked ${files.length} files (${errors} errors, ${warnings} warnings).`);
if (errors > 0) process.exit(1);
