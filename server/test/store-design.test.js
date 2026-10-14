import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTheme } from '@souqna/shared';
import { TEMPLATES, SEASONS, resolveDesign, normalizeDesignPatch, waNumber, completeness } from '@souqna/shared/layout';
import { rulesSuggestion } from '../src/lib/store-designer.js';

test('every template and season is complete and produces a valid, readable theme', () => {
  for (const [id, t] of Object.entries(TEMPLATES)) {
    assert.ok(t.sections[0] === 'hero', id);
    assert.equal(new Set(t.sections).size, t.sections.length, `${id} has duplicate sections`);
  }
  for (const [id, s] of Object.entries(SEASONS)) assert.equal(buildTheme(s.palette).valid, true, id);
});

test('owner input is sanitised: unknown values dropped, text stripped, countdown date validated', () => {
  const p = normalizeDesignPatch({ design: { template: 'hax', season: 'nope', overrides: { card: 'flat', grid: 'x' } }, flash: { enabled: true, title_ar: '<img onerror=1>عرض', endsAt: 'garbage' }, whatsapp: { enabled: 1, message_ar: 'أهلاً' } });
  assert.equal(p.design.template, 'classic'); assert.equal(p.design.season, null); assert.deepEqual(p.design.overrides, { card: 'flat' });
  assert.equal(p.flash.title_ar, 'عرض'); assert.equal(p.flash.endsAt, ''); assert.equal(p.whatsapp.enabled, true);
});

test('overrides win over the template; default is the current classic look', () => {
  assert.equal(resolveDesign({}).template, 'classic');
  const d = resolveDesign({ design: { template: 'streetwear', overrides: { card: 'soft' } } });
  assert.equal(d.card, 'soft'); assert.equal(d.cat, 'circles'); assert.ok(d.sections.includes('ticker'));
});

test('egyptian WhatsApp numbers become international and completeness reflects the store', () => {
  assert.equal(waNumber('010 1234 5678'), '201012345678'); assert.equal(waNumber('abc'), '');
  assert.equal(completeness({}).percent, 0);
  assert.ok(completeness({ logo: {}, cover: {}, hours: {}, customization: { design: { template: 'atelier' } } }).percent > 30);
});

test('designer fallback always suggests a valid template, palette and safe copy', () => {
  const s = rulesSuggestion({ kind: 'wedding', vibe: 'luxury' });
  assert.ok(TEMPLATES[s.template]); assert.ok(s.tagline_ar.length > 3 && !/\d/.test(s.about_ar));
  assert.ok(TEMPLATES[rulesSuggestion({}).template]);
});
