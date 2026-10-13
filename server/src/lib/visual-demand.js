/**
 * Demand intelligence for visual search: what customers photograph and DON'T find in Banha.
 * Privacy: no photo and no IP address is stored — only the detected type, a dominant colour name and a daily-salted
 * visitor hash (used to count distinct people). Rows older than 180 days are deleted.
 */
import crypto from 'node:crypto';
import { q } from '../db/index.js';
import { FRIENDLY_AR, colorByKey } from './visual-core.js';
import { visualProductFamily } from './visual-taxonomy.js';

const visitorId = (ip) => crypto.createHash('sha256').update(`${ip}|${new Date().toISOString().slice(0, 10)}|souqna-visual`).digest('hex').slice(0, 16);
try { q.run("DELETE FROM visual_searches WHERE created_at < datetime('now','-180 days')"); } catch { /* table is created by schema.sql */ }

/** groups: [{ type, color, best, items }] as returned by searchByImage (items = confident matches only). Never throws. */
export function logVisualSearch({ ip, model, department = '', groups }) {
  try {
    const visitor = visitorId(ip || 'x');
    for (const g of groups) {
      q.run('INSERT INTO visual_searches (visitor, model, family, color, department, found, results, best) VALUES (?,?,?,?,?,?,?,?)',
        [visitor, model, g.type || '', g.color || '', department, g.items.length ? 1 : 0, g.items.length, Number.isFinite(g.best) ? Math.round(g.best * 1000) / 1000 : null]);
    }
  } catch (e) { console.error('[visual] demand log failed:', e.message); }
}

/**
 * The platform admin decides whether store owners can see this report (Admin → النظام → البحث المرئي). Default: OFF.
 * The admin panel always sees the data.
 */
export const demandForOwnersEnabled = () => q.get("SELECT value FROM app_settings WHERE key='visual_demand_owners'")?.value === '1';
export function setDemandForOwners(on) {
  q.run("INSERT INTO app_settings(key,value) VALUES('visual_demand_owners',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [on ? '1' : '0']);
  return demandForOwnersEnabled();
}

/** store's active products per taxonomy family — so a report can say "you already have 3 of these" */
function familyCounts(storeId) {
  const rows = q.all(`SELECT p.name_ar, p.name_en, p.department, COALESCE(c.name_ar || ' ' || c.name_en, '') AS cat_text
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.store_id=? AND p.status='active'`, [storeId]);
  const out = {};
  for (const r of rows) { const f = visualProductFamily(r); if (f) out[f] = (out[f] || 0) + 1; }
  return out;
}

/** Most-wanted pieces that visual search could NOT match, grouped by type + colour. */
export function unmetDemand({ days = 30, limit = 10, storeId = null } = {}) {
  const rows = q.all(`SELECT family, color, COUNT(*) AS searches, COUNT(DISTINCT visitor) AS people, MAX(created_at) AS last
      FROM visual_searches WHERE found=0 AND family<>'' AND date(created_at) >= date('now', ?)
      GROUP BY family, color ORDER BY people DESC, searches DESC LIMIT ?`, [`-${Math.max(1, days)} days`, limit]);
  const have = storeId ? familyCounts(storeId) : null;
  return rows.map((r) => {
    const c = colorByKey(r.color);
    return { family: r.family, label: FRIENDLY_AR[r.family] || r.family, color: r.color, colorLabel: c ? { ar: c.ar, en: c.en } : null,
      searches: r.searches, people: r.people, last: r.last, ...(have ? { have: have[r.family] || 0 } : {}) };
  });
}

export function demandTotals({ days = 30 } = {}) {
  const w = `date(created_at) >= date('now', '-${Math.max(1, Math.floor(days))} days')`;
  const t = q.get(`SELECT COUNT(*) AS pieces, COALESCE(SUM(found),0) AS found, COUNT(DISTINCT visitor) AS people FROM visual_searches WHERE ${w}`);
  const requests = q.val(`SELECT COUNT(*) FROM sourcing_requests WHERE source='visual' AND ${w}`) || 0;
  return { days, pieces: t.pieces, found: t.found, missed: t.pieces - t.found, people: t.people, requests };
}
