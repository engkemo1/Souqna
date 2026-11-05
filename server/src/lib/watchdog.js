/**
 * Self-check every 10 minutes → WhatsApp alert to the platform team (same channel as late-order alerts).
 * Catches: daily backup or off-site backup too old, disk nearly full, memory very high.
 * Each problem alerts once, repeats at most every 12 h while it lasts, and a "back to normal" message is sent when it clears.
 * It cannot see a dead server — that needs an external uptime monitor pinging /api/health. WATCHDOG=0 disables.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { notifyPlatformAlert } from './whatsapp.js';

db.exec(`CREATE TABLE IF NOT EXISTS watchdog_state (id TEXT PRIMARY KEY, since TEXT NOT NULL, last_alert TEXT NOT NULL);`);
const H = 3600e3, REPEAT = 12 * H, GRACE = 15 * 60e3;
const booted = Date.now();

/** Returns the list of current problems: [{ id, text }]. Never throws. */
export async function collectProblems(nowMs = Date.now()) {
  const out = [];
  const age = (at) => { const t = Date.parse(at); return Number.isFinite(t) ? nowMs - t : Infinity; };
  try {
    const { lastBackup, lastOffsite } = await import('./backup.js');
    const { offsiteEnabled } = await import('./r2.js');
    if (config.backupDir) {
      const b = lastBackup();
      if (!b || age(b.at) > 36 * H) out.push({ id: 'backup', text: 'النسخة الاحتياطية اليومية قديمة (أكتر من ٣٦ ساعة) أو ما اشتغلتش.' });
    }
    if (offsiteEnabled) {
      const o = lastOffsite();
      if (!o || age(o.at) > 36 * H) out.push({ id: 'offsite', text: 'النسخة الاحتياطية خارج السيرفر (R2) قديمة أو فشلت.' });
    }
  } catch { /* backup modules unavailable: skip */ }
  try {
    const st = fs.statfsSync(path.dirname(path.resolve(config.dbFile)));
    const free = Number(st.bavail) / Number(st.blocks || 1);
    if (free < 0.1) out.push({ id: 'disk', text: `مساحة القرص قربت تخلص: فاضل ${Math.round(free * 100)}٪ بس.` });
  } catch { /* ignore */ }
  try {
    const mb = process.memoryUsage().rss / 1048576;
    if (mb > 1500) out.push({ id: 'memory', text: `استهلاك الذاكرة عالي: ${Math.round(mb)} ميجا.` });
  } catch { /* ignore */ }
  return out;
}

export async function runWatchdog(nowMs = Date.now(), send = notifyPlatformAlert) {
  if (nowMs - booted < GRACE && send === notifyPlatformAlert) return { alerts: 0, cleared: 0 }; // let the daily jobs run after a restart
  const problems = await collectProblems(nowMs);
  const iso = (ms) => new Date(ms).toISOString();
  const state = new Map(db.prepare('SELECT * FROM watchdog_state').all().map((r) => [r.id, r]));
  let alerts = 0, cleared = 0;
  for (const p of problems) {
    const s = state.get(p.id);
    if (!s) {
      db.prepare('INSERT INTO watchdog_state (id, since, last_alert) VALUES (?,?,?)').run(p.id, iso(nowMs), iso(nowMs));
      send(`⚠️ Twist — تنبيه نظام\n${p.text}`); alerts++;
    } else if (nowMs - Date.parse(s.last_alert) > REPEAT) {
      db.prepare('UPDATE watchdog_state SET last_alert=? WHERE id=?').run(iso(nowMs), p.id);
      send(`⚠️ Twist — لسه المشكلة موجودة\n${p.text}`); alerts++;
    }
  }
  const live = new Set(problems.map((p) => p.id));
  for (const [id] of state) if (!live.has(id)) { db.prepare('DELETE FROM watchdog_state WHERE id=?').run(id); send(`✅ Twist — رجع طبيعي (${id})`); cleared++; }
  return { alerts, cleared };
}

export function startWatchdog() {
  if (process.env.WATCHDOG === '0') return;
  const run = () => runWatchdog().catch((e) => console.error(`[watchdog] ${e.message}`));
  setTimeout(run, 5 * 60e3).unref?.();
  setInterval(run, 10 * 60e3).unref?.();
}
