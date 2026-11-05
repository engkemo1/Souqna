import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_FILE = path.join(os.tmpdir(), `souqna-repeat-${randomUUID()}.db`);
process.env.JWT_SECRET = `repeat-${randomUUID()}-0123456789`;
process.env.ADMIN_KEY = 'repeat-admin-key-0123456789';

const at = (dow, hm) => ({ dow, hm, date: '2030-01-01', stamp: `2030-01-01T${hm}` });
const body = (over = {}) => ({ type: 'custom', title_ar: 'إعلان', title_en: 'Ad', desktop_image: '/img/a.jpg', destination_url: '/search', placements: [{ key: 'market_hero', order: 0, devices: ['desktop', 'mobile'] }], ...over });

test('repeat: weekday + time windows, including a window past midnight', async () => {
  const { repeatMatches, repeatNextOpen } = await import('../src/lib/featured.js');
  const fri = { days: [5], windows: [] };
  assert.equal(repeatMatches(fri, at(5, '03:00')), true);
  assert.equal(repeatMatches(fri, at(4, '23:59')), false);
  assert.equal(repeatMatches(fri, at(6, '00:00')), false);
  const evening = { days: [], windows: [{ from: '20:00', to: '23:00' }] };
  assert.equal(repeatMatches(evening, at(2, '20:00')), true);
  assert.equal(repeatMatches(evening, at(2, '23:00')), false); // end is exclusive
  assert.equal(repeatMatches(evening, at(2, '19:59')), false);
  const night = { days: [5], windows: [{ from: '22:00', to: '02:00' }] }; // Friday 22:00 → Saturday 02:00
  assert.equal(repeatMatches(night, at(5, '23:30')), true);
  assert.equal(repeatMatches(night, at(6, '01:59')), true);
  assert.equal(repeatMatches(night, at(6, '02:00')), false);
  assert.equal(repeatMatches(night, at(5, '01:00')), false);
  const sat = { days: [6], windows: [{ from: '22:00', to: '02:00' }] }; // Saturday night wraps into Sunday
  assert.equal(repeatMatches(sat, at(0, '01:00')), true);
  const sun = { days: [0], windows: [{ from: '22:00', to: '02:00' }] }; // Sunday night wraps into Monday
  assert.equal(repeatMatches(sun, at(1, '01:00')), true);
  const wrap = { days: [6], windows: [{ from: '23:00', to: '24:00' }] };
  assert.equal(repeatMatches(wrap, at(6, '23:59')), true);
  assert.equal(repeatMatches(null, at(3, '12:00')), true);
  // next opening: Tuesday 19:00 → Tuesday 20:00 is 60 minutes away
  assert.equal(repeatNextOpen(evening, '2030-01-01T19:00'), 60); // 2030-01-01 is a Tuesday
  assert.equal(repeatNextOpen(evening, '2030-01-01T20:30'), 0);
  assert.equal(repeatNextOpen(fri, '2030-01-01T10:00'), 3 * 1440 - 10 * 60); // Tue 10:00 → Fri 00:00
});

test('repeat: validation, normalisation, state, and slot capacity', async () => {
  const f = await import('../src/lib/featured.js');
  const { q } = await import('../src/db/index.js');
  q.run('DELETE FROM featured_campaigns');
  for (const bad of [{ days: [7] }, { days: ['x'] }, { windows: [{ from: '10:00', to: '10:00' }] }, { windows: [{ from: '25:00', to: '10:00' }] }, { windows: Array(5).fill({ from: '08:00', to: '09:00' }) }, 'fri']) {
    assert.throws(() => f.createCampaign(body({ repeat: bad })), (e) => e.status === 422, JSON.stringify(bad));
  }
  // "every day, all day" is no restriction at all
  const open = f.createCampaign(body({ repeat: { days: [0, 1, 2, 3, 4, 5, 6], windows: [] } }));
  assert.equal(open.repeat, null);
  q.run('DELETE FROM featured_campaigns');

  // hero slot allows 3: three Friday-evening ads fill it, a fourth on the same time is refused, but a Saturday one fits
  const mk = (rep, extra = {}) => f.createCampaign(body({ repeat: rep, ...extra }), { publish: true });
  const friEve = { days: [5], windows: [{ from: '18:00', to: '23:00' }] };
  mk(friEve); mk(friEve); mk(friEve);
  assert.throws(() => mk(friEve), (e) => e.status === 409);
  const sat = mk({ days: [6], windows: [] });
  assert.deepEqual(sat.repeat, { days: [6], windows: [] });
  const morning = mk({ days: [5], windows: [{ from: '06:00', to: '12:00' }] });
  assert.ok(morning.id);

  // state: resting outside the schedule, active inside; public listing follows
  const today = f.campaignState({ status: 'active', starts_at: null, ends_at: null, repeat_json: JSON.stringify({ days: [5], windows: [] }) }, at(5, '10:00'));
  const off = f.campaignState({ status: 'active', starts_at: null, ends_at: null, repeat_json: JSON.stringify({ days: [5], windows: [] }) }, at(2, '10:00'));
  assert.equal(today, 'active'); assert.equal(off, 'resting');
  const shown = f.publicCampaigns({ placement: 'market_hero', now: at(2, '10:00') });
  assert.equal(shown.length, 0); // every campaign here is Friday/Saturday only
  const fri = f.publicCampaigns({ placement: 'market_hero', now: at(5, '19:00') });
  assert.equal(fri.length, 3); // the 3 Friday-evening ads (the morning one is outside its window)
  const adm = f.getCampaign(morning.id);
  assert.equal(adm.state === 'resting' || adm.state === 'active', true);
  if (adm.state === 'resting') assert.ok(adm.repeatNextInMin >= 0);
});
