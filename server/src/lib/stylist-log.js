/** سجل أسئلة تويلا (بدون بيانات شخصيه) + زمن الرد: بيبيّن للأدمن الأسئلة اللي ملقتش رد والردود البطيئه. */
import { q } from '../db/index.js';

let ready = false;
function ensure() {
  if (ready) return;
  q.run(`CREATE TABLE IF NOT EXISTS stylist_log (
    id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), text TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'other', ref TEXT, products INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0
  )`);
  q.run('CREATE INDEX IF NOT EXISTS idx_stylist_log_at ON stylist_log(at)');
  ready = true;
}

/** من غير أرقام طويله (تليفونات/أكواد) ولا إيميلات ولا روابط. */
export function cleanLogText(s) {
  return String(s || '').replace(/https?:\/\/\S+/gi, '#').replace(/\S+@\S+\.\S+/g, '#').replace(/\d{6,}/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** النوع: faq / advice / shop (فيه منتجات) / clarify / none (مفيش نتيجه) / fallback (مفهمتش) / greeting / photo / other */
export function kindOf(res, { photo = false } = {}) {
  if (photo) return 'photo';
  if (!res) return 'other';
  if (res.faq) return 'faq';
  if (res.adviceId || res.intent === 'advice') return 'advice';
  if (res.state === 'none' || res.state === 'no_look') return 'none';
  if (res.blocks?.tabs?.length || (res.looks && res.looks.length)) return 'shop';
  if (res.state === 'clarify') return 'clarify';
  if (res.intent === 'greeting' || res.intent === 'thanks') return 'greeting';
  if (res.intent === 'unknown' || (res.state === 'chat' && !res.intent)) return 'fallback';
  return 'other';
}

export function logStylist(text, res, ms, opts = {}) {
  try {
    ensure();
    const t = cleanLogText(text);
    if (!t && !opts.photo) return;
    const n = (res?.blocks?.tabs || []).reduce((s, tab) => s + (tab.items?.length || 0), 0) || res?.looks?.length || 0;
    q.run('INSERT INTO stylist_log (text, kind, ref, products, ms) VALUES (?,?,?,?,?)', [t, kindOf(res, opts), res?.faq || res?.adviceId || null, n, Math.max(0, Math.round(ms || 0))]);
    if (Math.random() < 0.02) q.run("DELETE FROM stylist_log WHERE at < datetime('now','-120 days')");
  } catch { /* السجل اختياري: مايوقفش الشات */ }
}

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function stylistLogReport(days = 30) {
  ensure();
  const since = `-${Math.max(1, Math.min(120, Number(days) || 30))} days`;
  const rows = q.all("SELECT text, kind, ref, products, ms FROM stylist_log WHERE at >= datetime('now', ?) ORDER BY id DESC LIMIT 20000", [since]);
  const kinds = {}; const refs = {}; const lost = new Map(); const times = [];
  for (const r of rows) {
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    if ((r.kind === 'faq' || r.kind === 'advice') && r.ref) refs[`${r.kind}:${r.ref}`] = (refs[`${r.kind}:${r.ref}`] || 0) + 1;
    if (r.kind === 'fallback' || r.kind === 'none') { const k = `${r.kind}|${r.text}`; lost.set(k, (lost.get(k) || 0) + 1); }
    if (r.kind !== 'photo' && r.ms > 0) times.push(r.ms);
  }
  const total = rows.length;
  const lostList = [...lost.entries()].map(([k, n]) => { const [kind, text] = k.split('|'); return { kind, text, n }; }).sort((a, b) => b.n - a.n).slice(0, 25);
  return {
    total, kinds,
    answeredRate: total ? Math.round(((total - (kinds.fallback || 0) - (kinds.none || 0)) / total) * 100) : 100,
    latency: { avg: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0, p50: pct(times, 0.5), p95: pct(times, 0.95), max: times.length ? Math.max(...times) : 0 },
    slow: rows.filter((r) => r.kind !== 'photo').sort((a, b) => b.ms - a.ms).slice(0, 8).map((r) => ({ text: r.text, kind: r.kind, ms: r.ms })),
    lost: lostList,
    top: Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => ({ ref: k, n })),
  };
}
