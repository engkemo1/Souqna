// The one-off script turns the Black Friday campaign into «وفّرها مرتين»: new text/theme/mode, start moved to Fri 4 Dec 2026 at the SAME Cairo time, percent untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DB = path.join(os.tmpdir(), `souqna-twice-${randomUUID()}.db`);
process.env.DB_FILE = DB; process.env.JWT_SECRET = `tw-${randomUUID()}`;
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/scripts/update-campaign-twice.js');

test('Black Friday → «وفّرها مرتين»: preview is read-only; APPLY keeps the Cairo clock time and duration, sets the extra Twist discount to 10%', async () => {
  const { q } = await import('../src/db/index.js');
  const { saveCampaign, getCampaign } = await import('../src/lib/sale-campaigns.js');
  const start = Date.UTC(2026, 10, 27, 7, 30); // Fri 27 Nov 09:30 Cairo (UTC+2)
  const r = saveCampaign({ kind: 'discount', name: 'بلاك فرايدي', headline: 'بلاك فرايدي', sub: 'خصومات', theme: 'blackfriday', mode: 'best', status: 'active', startsAt: start, endsAt: start + 24 * 3600e3, announceAt: start - 3 * 24 * 3600e3, percent: 30, color1: '#111111', hype: { s_far: 'بلاك فرايدي جاي', l_mid: 'كمّل تسوق' } });
  assert.ok(r.campaign, JSON.stringify(r)); const id = r.campaign.id;
  const run = (apply) => execFileSync(process.execPath, ['--no-warnings', script], { env: { ...process.env, APPLY: apply ? '1' : '0' }, encoding: 'utf8' });
  const out = run(false);
  assert.match(out, /PREVIEW/); assert.match(out, /2026-12-04 09:30 \(Cairo\)/);
  assert.equal(q.get('SELECT starts_at AS s FROM sale_campaigns WHERE id=?', [id]).s, start, 'preview writes nothing');
  run(true);
  const c = q.get('SELECT * FROM sale_campaigns WHERE id=?', [id]);
  assert.equal(c.name, 'وفّرها مرتين'); assert.equal(c.headline, 'وفّرها مرتين'); assert.equal(c.sub, 'خصم المحل + خصم إضافي من تويست');
  assert.equal(c.theme, 'twice'); assert.equal(c.mode, 'stack'); assert.equal(c.percent, 10, 'Twist extra discount = 10%'); assert.equal(c.color1, '', 'old colours cleared');
  assert.equal(c.starts_at, Date.UTC(2026, 11, 4, 7, 30), 'Fri 4 Dec 09:30 Cairo'); assert.equal(c.ends_at - c.starts_at, 24 * 3600e3);
  assert.equal(c.starts_at - c.announce_at, 3 * 24 * 3600e3, 'teaser lead time kept');
  assert.deepEqual(JSON.parse(c.hype_json), { l_mid: 'كمّل تسوق' }, 'only the Black Friday hype line is dropped');
  assert.deepEqual(JSON.parse(c.badge_json).chips, ['أول Black Friday من تويست']);
  assert.ok(['scheduled', 'soon'].includes(getCampaign(id).phase), 'not live before 4 Dec');
});
