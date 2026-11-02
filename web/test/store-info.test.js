import test from 'node:test';
import assert from 'node:assert/strict';
import { openNow, statusInfo, minutesLabel, waNumber, telHref, mapHref, fmtTime, todayHours, weekRows, upcomingHolidays } from '../src/lib/storeInfo.js';

// the classic status fields (the schedule adds more: next opening, holiday)
const core = (s) => s && Object.fromEntries(Object.entries(s).filter(([k]) => ['state', 'minsToClose', 'opensTodayAt'].includes(k)));

// January: Cairo is UTC+2 (no DST), so the expectations below do not depend on the date the suite runs.
// 2026-01-14 is a Wednesday. Day numbers: 0 = Sunday ... 5 = Friday.
const at = (iso) => new Date(iso);
const day = { open: '10:00', close: '23:00', dayOff: null };

test('open/closed from real hours (Cairo time)', () => {
  assert.equal(openNow(day, at('2026-01-14T09:00:00Z')), true); // 11:00 Cairo
  assert.equal(openNow(day, at('2026-01-14T07:59:00Z')), false); // 09:59
  assert.equal(openNow(day, at('2026-01-14T08:00:00Z')), true); // 10:00 exactly opens
  assert.equal(openNow(day, at('2026-01-14T21:00:00Z')), false); // 23:00 exactly closes
});

test('a store that closes after midnight is open at 01:30 and closed at 02:30', () => {
  const night = { open: '18:00', close: '02:00', dayOff: null };
  assert.equal(openNow(night, at('2026-01-14T23:30:00Z')), true); // 01:30 Thu
  assert.equal(openNow(night, at('2026-01-15T00:30:00Z')), false); // 02:30
  assert.equal(openNow(night, at('2026-01-14T14:00:00Z')), false); // 16:00
  assert.equal(openNow(night, at('2026-01-14T17:00:00Z')), true); // 19:00
});

test('weekly day off closes the store that day, including the after-midnight tail of the previous shift', () => {
  const friOff = { open: '10:00', close: '23:00', dayOff: 5 };
  assert.equal(openNow(friOff, at('2026-01-16T10:00:00Z')), false); // Friday
  assert.equal(openNow(friOff, at('2026-01-15T10:00:00Z')), true); // Thursday
  const nightFriOff = { open: '18:00', close: '02:00', dayOff: 5 };
  assert.equal(openNow(nightFriOff, at('2026-01-16T23:00:00Z')), false); // Sat 01:00 belongs to Friday's (off) shift
  assert.equal(openNow(nightFriOff, at('2026-01-17T18:00:00Z')), true); // Sat 20:00
  assert.equal(openNow(nightFriOff, at('2026-01-16T18:00:00Z')), false); // Fri 20:00
});

test('no or invalid hours: nothing is claimed', () => {
  assert.equal(openNow(null), null);
  assert.equal(openNow({ open: '', close: '' }), null);
  assert.equal(openNow({ open: '25:00', close: '23:00' }), null);
});

test('time labels', () => {
  assert.equal(fmtTime('10:00', true), '10 ص'); assert.equal(fmtTime('23:30', true), '11:30 م');
  assert.equal(fmtTime('00:00', false), '12 AM'); assert.equal(fmtTime('13:05', false), '1:05 PM');
});

test('WhatsApp uses the saved number, or nothing', () => {
  assert.equal(waNumber('01012345678'), '201012345678');
  assert.equal(waNumber('+20 101 234 5678'), '201012345678');
  assert.equal(waNumber('201012345678'), '201012345678');
  assert.equal(waNumber(''), null); assert.equal(waNumber(null), null); assert.equal(waNumber('123'), null);
});

test('call link uses the saved phone, or nothing', () => {
  assert.equal(telHref(' 0101 234-5678 '), 'tel:01012345678');
  assert.equal(telHref('+20 101 234 5678'), 'tel:+201012345678');
  assert.equal(telHref(''), null); assert.equal(telHref(undefined), null); assert.equal(telHref('12'), null);
});

test('location: saved map link, else saved coordinates, else saved address, else nothing', () => {
  assert.equal(mapHref({ mapUrl: 'https://maps.app.goo.gl/abc', lat: 30, lng: 31 }, 'x'), 'https://maps.app.goo.gl/abc');
  assert.equal(mapHref({ mapUrl: '', lat: 30.46, lng: 31.18 }, 'x'), 'https://www.google.com/maps/search/?api=1&query=30.46,31.18');
  assert.match(mapHref({ mapUrl: null, lat: null, lng: null }, 'شارع سعد'), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal(mapHref({ mapUrl: null, lat: null, lng: null }, ''), null);
  assert.equal(mapHref({}, ''), null);
  // a non-http link is never used as an href
  assert.equal(mapHref({ mapUrl: 'javascript:alert(1)' }, ''), null);
});

test('status: open, closing soon (<= 60 min), closed, and opens-later-today', () => {
  assert.deepEqual(core(statusInfo(day, at('2026-01-14T09:00:00Z'))), { state: 'open', minsToClose: 720 }); // 11:00 -> 23:00
  assert.deepEqual(core(statusInfo(day, at('2026-01-14T20:35:00Z'))), { state: 'closing_soon', minsToClose: 25 }); // 22:35
  assert.deepEqual(core(statusInfo(day, at('2026-01-14T06:00:00Z'))), { state: 'closed', opensTodayAt: '10:00' }); // 08:00, opens later today
  assert.deepEqual(core(statusInfo(day, at('2026-01-14T21:30:00Z'))), { state: 'closed', opensTodayAt: null }); // 23:30, after closing: no claim about tomorrow
  assert.deepEqual(core(statusInfo(day, at('2026-01-14T22:00:00Z'))), { state: 'closed', opensTodayAt: '10:00' }); // 00:00 Thursday: opens later that day
  const friOff = { open: '10:00', close: '23:00', dayOff: 5 };
  assert.deepEqual(core(statusInfo(friOff, at('2026-01-16T06:00:00Z'))), { state: 'closed', opensTodayAt: null }); // Friday morning: day off, never "opens today"
  assert.equal(statusInfo(null), null);
});

test('status across midnight', () => {
  const night = { open: '18:00', close: '02:00', dayOff: null };
  assert.deepEqual(core(statusInfo(night, at('2026-01-14T17:00:00Z'))), { state: 'open', minsToClose: 420 }); // 19:00 -> 02:00
  assert.deepEqual(core(statusInfo(night, at('2026-01-14T23:30:00Z'))), { state: 'closing_soon', minsToClose: 30 }); // 01:30
  assert.deepEqual(core(statusInfo(night, at('2026-01-15T00:30:00Z'))), { state: 'closed', opensTodayAt: '18:00' }); // 02:30, reopens 18:00
});

test('minute labels', () => {
  assert.equal(minutesLabel(1, true), 'دقيقة'); assert.equal(minutesLabel(2, true), 'دقيقتين');
  assert.equal(minutesLabel(5, true), '5 دقائق'); assert.equal(minutesLabel(25, true), '25 دقيقة');
  assert.equal(minutesLabel(1, false), '1 minute'); assert.equal(minutesLabel(30, false), '30 minutes');
});

// ---- weekly schedule: per-day hours, a break between two shifts, holidays ----
const D = (shifts, closed = false) => ({ closed, shifts });
const week = (over = {}) => ({ days: [0, 1, 2, 3, 4, 5, 6].map((i) => over[i] || D([{ open: '10:00', close: '22:00' }])), holidays: [] });

test('schedule: different hours per day (Friday later, Saturday closed)', () => {
  const h = week({ 5: D([{ open: '14:00', close: '23:00' }]), 6: D([], true) });
  assert.equal(openNow(h, at('2026-01-16T09:00:00Z')), false); // Friday 11:00 Cairo: opens at 14:00
  assert.equal(openNow(h, at('2026-01-16T12:30:00Z')), true); // Friday 14:30
  assert.equal(openNow(h, at('2026-01-17T10:00:00Z')), false); // Saturday closed
  assert.equal(openNow(h, at('2026-01-14T09:00:00Z')), true); // Wednesday 11:00
});

test('schedule: a break between two shifts', () => {
  const h = week({ 3: D([{ open: '10:00', close: '14:00' }, { open: '17:00', close: '23:00' }]) });
  assert.equal(openNow(h, at('2026-01-14T11:00:00Z')), true); // 13:00
  assert.equal(openNow(h, at('2026-01-14T13:00:00Z')), false); // 15:00, break
  assert.equal(openNow(h, at('2026-01-14T16:00:00Z')), true); // 18:00
  const st = statusInfo(h, at('2026-01-14T13:00:00Z'));
  assert.equal(st.state, 'closed'); assert.equal(st.next.at, '17:00'); assert.equal(st.next.dayOffset, 0);
  assert.equal(todayHours(h, true, at('2026-01-14T13:00:00Z')), '10 ص – 2 م · 5 م – 11 م');
});

test('schedule: a holiday closes the whole day and the next opening is after it', () => {
  const h = { ...week(), holidays: [{ from: '2026-01-14', to: '2026-01-15', note: 'عيد' }] };
  assert.equal(openNow(h, at('2026-01-14T09:00:00Z')), false);
  const st = statusInfo(h, at('2026-01-14T09:00:00Z'));
  assert.equal(st.state, 'closed'); assert.equal(st.holiday.note, 'عيد'); assert.equal(st.next.dayOffset, 2); assert.equal(st.next.at, '10:00');
  assert.equal(openNow(h, at('2026-01-16T09:00:00Z')), true); // back on Friday
  assert.equal(upcomingHolidays(h, at('2026-01-14T09:00:00Z')).length, 1);
  assert.equal(upcomingHolidays(h, at('2026-01-20T09:00:00Z')).length, 0); // past holidays are dropped
});

test('schedule: after-midnight shift keeps working across the day boundary and holidays', () => {
  const h = week({ 3: D([{ open: '18:00', close: '02:00' }]) });
  assert.equal(openNow(h, at('2026-01-14T23:30:00Z')), true); // Thu 01:30 (Wednesday shift)
  const hh = { ...h, holidays: [{ from: '2026-01-15', to: '2026-01-15', note: '' }] };
  assert.equal(openNow(hh, at('2026-01-14T23:30:00Z')), true); // the shift belongs to Wednesday, not the Thursday holiday
});

test('week rows: Saturday first, today flagged, closed days empty', () => {
  const h = week({ 6: D([], true) });
  const rows = weekRows(h, true, at('2026-01-14T09:00:00Z'));
  assert.equal(rows[0].name, 'السبت'); assert.equal(rows[0].closed, true);
  assert.equal(rows.find((r) => r.today).name, 'الأربع');
  assert.equal(rows[1].text, '10 ص – 10 م');
});

test('legacy single open/close still works and shows the same week', () => {
  const rows = weekRows({ open: '10:00', close: '23:00', dayOff: 5 }, false, at('2026-01-14T09:00:00Z'));
  assert.equal(rows.filter((r) => r.closed).map((r) => r.name).join(), 'Friday');
});
