/**
 * Turn the current Black Friday discount campaign into «وفّرها مرتين» (the shop's discount + an extra one from Twist) — the same campaign row,
 * so the admin, the home hero, the top bar, the countdown and the shop pages all read the new text and date from ONE place.
 *
 *   - name / headline / sub / extra line, theme `twice` (Twist navy + orange, no Black Friday artwork), mode `stack` (Twist's % comes off the shop's price after its own discount);
 *   - starts Friday 4 Dec 2026 at the SAME Cairo clock time the campaign has now (duration and the "coming soon" lead time are kept);
 *   - Twist's extra discount is set to 10% (change PERCENT=… to use another number; the admin can still edit it afterwards);
 *   - old Black Friday colours / falling glyphs / hype lines are cleared so the new identity shows.
 * Shop discounts (products' own prices) are never changed.
 *
 *   node --no-warnings server/src/scripts/update-campaign-twice.js            # preview (writes nothing)
 *   APPLY=1 node --no-warnings server/src/scripts/update-campaign-twice.js    # write
 *   CAMPAIGN_ID=7 ...                                                          # pick one when several match
 */
import { q } from '../db/index.js';
import { saveCampaign, getCampaign } from '../lib/sale-campaigns.js';

const APPLY = process.env.APPLY === '1';
const NEW_DAY = { y: 2026, m: 12, d: 4 };
const OLD_BF = /بلاك|black\s*friday/i;
const PERCENT = Math.max(1, Math.min(90, Math.round(Number(process.env.PERCENT) || 10)));

const cairoParts = (ms) => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)); const g = (t) => Number(f.find((x) => x.type === t).value); return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), min: g('minute') }; };
/** Cairo wall-clock → UTC ms (offset looked up for that date, so it stays right whatever DST does). */
export const cairoToUtc = ({ y, m, d, h, min }) => { let guess = Date.UTC(y, m - 1, d, h, min); for (let i = 0; i < 3; i++) { const p = cairoParts(guess); const off = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess; guess = Date.UTC(y, m - 1, d, h, min) - off; } return guess; };
const fmt = (ms) => { const p = cairoParts(ms); const z = (n) => String(n).padStart(2, '0'); return `${p.y}-${z(p.m)}-${z(p.d)} ${z(p.h)}:${z(p.min)} (Cairo)`; };

const rows = q.all("SELECT * FROM sale_campaigns WHERE kind='discount' AND status<>'ended' ORDER BY id DESC");
const wanted = process.env.CAMPAIGN_ID ? rows.filter((r) => String(r.id) === process.env.CAMPAIGN_ID) : rows.filter((r) => r.theme === 'blackfriday' || OLD_BF.test(`${r.name} ${r.headline}`));
if (!wanted.length) { console.log('No open Black Friday discount campaign found. Nothing to do.'); process.exit(0); }
if (wanted.length > 1) { console.log('Several campaigns match — run again with CAMPAIGN_ID=<id>:'); for (const r of wanted) console.log(`  #${r.id} ${r.name} [${r.status}] starts ${fmt(r.starts_at)}`); process.exit(1); }
const r = wanted[0];
const t = cairoParts(r.starts_at);
const newStart = cairoToUtc({ ...NEW_DAY, h: t.h, min: t.min });
const newEnd = newStart + (r.ends_at - r.starts_at);
const newAnnounce = r.announce_at ? newStart - (r.starts_at - r.announce_at) : null;
let hype = {}; try { hype = JSON.parse(r.hype_json || '{}') || {}; } catch { hype = {}; }
const keptHype = Object.fromEntries(Object.entries(hype).filter(([, v]) => !OLD_BF.test(String(v))));
const body = {
  percent: PERCENT, name: 'وفّرها مرتين', headline: 'وفّرها مرتين', sub: 'خصم المحل + خصم إضافي من تويست', theme: 'twice', mode: 'stack',
  color1: '', color2: '', fallGlyphs: '',
  startsAt: newStart, endsAt: newEnd, announceAt: newAnnounce,
  hype: keptHype,
  badge: { ...(JSON.parse(r.badge_json || '{}') || {}), chips: ['أول Black Friday من تويست'] },
};
console.log(`${APPLY ? 'APPLY' : 'PREVIEW'} — campaign #${r.id} «${r.name}» [${r.status}]`);
console.log(`  name      : ${r.name} → ${body.name}`);
console.log(`  headline  : ${r.headline || '—'} → ${body.headline}`);
console.log(`  sub       : ${r.sub || '—'} → ${body.sub}`);
console.log(`  theme/mode: ${r.theme}/${r.mode} → twice/stack`);
console.log(`  starts    : ${fmt(r.starts_at)} → ${fmt(newStart)}`);
console.log(`  ends      : ${fmt(r.ends_at)} → ${fmt(newEnd)}`);
if (r.announce_at) console.log(`  teaser    : ${fmt(r.announce_at)} → ${fmt(newAnnounce)}`);
console.log(`  percent   : ${r.percent || 0}% → ${PERCENT}% (Twist's extra discount, taken off the shop's price after its own discount)`);
if (Object.keys(hype).length !== Object.keys(keptHype).length) console.log(`  hype lines mentioning Black Friday removed: ${Object.keys(hype).length - Object.keys(keptHype).length}`);
if (r.status === 'active' && r.starts_at <= Date.now()) console.log('  NOTE: this campaign is live now; moving the start to 4 Dec switches the discount off until then.');
if (APPLY) { const res = saveCampaign(body, r.id); if (res.error) { console.error('Refused:', res.error, res.with ? JSON.stringify(res.with) : ''); process.exit(1); } const c = getCampaign(r.id); console.log(`done. now: ${c.phase}, starts ${fmt(c.startsAt)}`); }
