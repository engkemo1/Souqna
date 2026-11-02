import test from 'node:test';
import assert from 'node:assert/strict';
import { hoursSchema, legacyFromSchedule, storeHours } from '../src/lib/hours.js';

const day = (shifts, closed = false) => ({ closed, shifts });
const full = (over = {}) => ({ days: [0, 1, 2, 3, 4, 5, 6].map((i) => over[i] || day([{ open: '10:00', close: '22:00' }])), holidays: [] });

test('schedule validates: 7 days, at most 2 shifts, open days need a shift, holiday dates in order', () => {
  assert.ok(hoursSchema.safeParse(full()).success);
  assert.ok(hoursSchema.safeParse(full({ 3: day([{ open: '10:00', close: '14:00' }, { open: '17:00', close: '23:00' }]) })).success);
  assert.ok(!hoursSchema.safeParse({ days: full().days.slice(0, 6), holidays: [] }).success); // 6 days
  assert.ok(!hoursSchema.safeParse(full({ 1: day([{ open: '9:00', close: '14:00' }]) })).success); // bad time
  assert.ok(!hoursSchema.safeParse(full({ 1: day([]) })).success); // open day without a shift
  assert.ok(!hoursSchema.safeParse(full({ 1: day([{ open: '08:00', close: '09:00' }, { open: '10:00', close: '11:00' }, { open: '12:00', close: '13:00' }]) })).success); // 3 shifts
  assert.ok(!hoursSchema.safeParse({ ...full(), holidays: [{ from: '2026-01-10', to: '2026-01-05' }] }).success);
  assert.ok(hoursSchema.safeParse({ ...full(), holidays: [{ from: '2026-01-05', to: '2026-01-10', note: 'عيد' }] }).success);
});

test('legacy columns follow the schedule (first open day opens/closes, a single closed day = day off)', () => {
  assert.deepEqual(legacyFromSchedule(full({ 5: day([], true) })), { opens_at: '10:00', closes_at: '22:00', day_off: 5 });
  assert.equal(legacyFromSchedule(full({ 5: day([], true), 6: day([], true) })).day_off, null); // two closed days
  assert.deepEqual(legacyFromSchedule({ days: Array.from({ length: 7 }, () => day([], true)), holidays: [] }), { opens_at: null, closes_at: null, day_off: null });
});

test('storeHours: schedule wins, legacy columns still work, nothing saved = null', () => {
  const sched = full({ 5: day([], true) });
  const a = storeHours({ hours_json: JSON.stringify(sched), opens_at: null, closes_at: null, day_off: null });
  assert.equal(a.days.length, 7); assert.equal(a.dayOff, 5); assert.equal(a.open, '10:00');
  assert.deepEqual(storeHours({ hours_json: null, opens_at: '09:00', closes_at: '21:00', day_off: 4 }), { open: '09:00', close: '21:00', dayOff: 4 });
  assert.equal(storeHours({ hours_json: null, opens_at: null, closes_at: null }), null);
  assert.deepEqual(storeHours({ hours_json: '{broken', opens_at: '09:00', closes_at: '21:00', day_off: null }), { open: '09:00', close: '21:00', dayOff: null }); // a bad blob falls back
});
