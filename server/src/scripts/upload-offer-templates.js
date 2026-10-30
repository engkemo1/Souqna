/**
 * Upload the shared offer image library once (run after adding or changing images):
 *   npm run offer-templates -w server                       (reads server/seed-assets/offer-templates/)
 *   npm run offer-templates -w server -- /path/to/folder
 * File names:  <category>.(png|jpg|webp)                       one picture per product category for ALL offer types (perfumes.webp, womens-fashion.webp)
 *              <offer_type>.<category>.(png|...)              optional override for one offer type + category
 *              <offer_type>.(png|...)                         the neutral image for that offer type
 * Uses the existing R2 configuration; images already uploaded with identical content are skipped.
 * A new product category needs no code: add it with addImageCategory() / the admin, then name files with its key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishTemplate, GENERAL, ANY } from '../lib/promotions/templates.js';
import { TEMPLATE_KEYS } from '../lib/promotions/store.js';
import { q } from '../db/index.js';

const dir = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../seed-assets/offer-templates'));
if (!fs.existsSync(dir)) { console.log(`[offer-templates] no folder at ${dir} - nothing to upload yet.`); process.exit(0); }
const cats = new Set([GENERAL, ...q.all('SELECT key FROM offer_image_categories').map((c) => c.key)]);
let n = 0;
// <category>.png                  -> one picture for that product category, used by EVERY offer type (womens-fashion.png, perfumes.webp ...)
// <offer_type>.<category>.png     -> a picture for one offer type + category pair
// <offer_type>.png                -> that offer type's neutral picture
for (const f of fs.readdirSync(dir).sort()) {
  const m = f.match(/^(.+)\.(webp|png|jpe?g)$/i);
  if (!m) continue;
  const parts = m[1].toLowerCase().replace(/-/g, '_').split('.');
  let type; let category;
  if (parts.length === 1) { if (cats.has(parts[0])) { type = ANY; category = parts[0]; } else if (TEMPLATE_KEYS.includes(parts[0])) { type = parts[0]; category = GENERAL; } }
  else if (parts.length === 2) [type, category] = parts;
  if (!type || !category) { console.log(`[offer-templates] ${f}: not a known category or offer type, skipped`); continue; }
  if (type !== ANY && !TEMPLATE_KEYS.includes(type)) { console.log(`[offer-templates] ${f}: unknown offer type "${type}", skipped`); continue; }
  if (!cats.has(category)) { console.log(`[offer-templates] ${f}: unknown category "${category}" - add it first, skipped`); continue; }
  const r = await publishTemplate(type, category, path.join(dir, f));
  console.log(`[offer-templates] ${type} + ${category}: ${r.status}`); n++;
}
if (!n) console.log('[offer-templates] no matching images found.');
