/**
 * تحميل ملفات المعرفة (server/src/knowledge/*.json) وبناء فهارس البحث.
 * الملفات بيانات، فتعديلها بيغيّر سلوك تويلا من غير كود.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { norm, skeletonPhrase, isLatinToken } from './text.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'knowledge');
const load = (name) => JSON.parse(readFileSync(path.join(DIR, name), 'utf8'));

let cache = null;

/** يبني فهرس: عبارة معيارية → [{group,key}] ، مع فهرس الهيكل الساكن للاتيني لو مش ملتبس. */
function buildIndex(entries) {
  const exact = new Map(); const skel = new Map(); let maxLen = 1;
  for (const { group, key, aliases } of entries) {
    for (const raw of aliases) {
      const a = norm(raw);
      if (!a) continue;
      const words = a.split(' ');
      maxLen = Math.max(maxLen, words.length);
      const list = exact.get(a) || []; if (!list.some((x) => x.group === group && x.key === key)) list.push({ group, key }); exact.set(a, list);
      if (words.every(isLatinToken) && words.join('').length >= 4) {
        const sk = skeletonPhrase(a);
        if (sk.replace(/ /g, '').length >= 3) {
          const l2 = skel.get(sk) || []; if (!l2.some((x) => x.group === group && x.key === key)) l2.push({ group, key }); skel.set(sk, l2);
        }
      }
    }
  }
  // الهيكل الملتبس (بيشير لأكتر من مفتاح) بيتشال
  for (const [k, v] of skel) if (new Set(v.map((x) => `${x.group}:${x.key}`)).size > 1) skel.delete(k);
  return { exact, skel, maxLen };
}

export function loadKnowledge({ force = false } = {}) {
  if (cache && !force) return cache;
  const taxonomy = load('taxonomy.json'); const synonyms = load('synonyms.json');
  const outfits = load('outfits.json'); const phrases = load('phrases.json');
  const questions = load('questions.json'); const weather = load('weather.json');

  const items = new Map();
  for (const [family, f] of Object.entries(taxonomy.families)) for (const it of f.items) items.set(it.key, { ...it, family });
  const colors = new Map(taxonomy.colors.list.map((c) => [c.key, c]));
  const contexts = new Map(taxonomy.contexts.map((c) => [c.key, c]));

  const entries = [];
  for (const [key, aliases] of Object.entries(synonyms.garments)) entries.push({ group: 'garment', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.contexts)) entries.push({ group: 'context', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.audiences)) entries.push({ group: 'audience', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.colors)) entries.push({ group: 'color', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.materials)) entries.push({ group: 'material', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.tastes)) entries.push({ group: 'taste', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.intents)) entries.push({ group: 'intent', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.relationships)) if (Array.isArray(aliases)) entries.push({ group: 'relation', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.time_words)) if (Array.isArray(aliases)) entries.push({ group: 'time', key, aliases });
  for (const [wd, aliases] of Object.entries(synonyms.time_words.weekdays)) entries.push({ group: 'weekday', key: wd, aliases });
  for (const [key, aliases] of Object.entries(synonyms.season_words)) entries.push({ group: 'season', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.partner_strict)) if (Array.isArray(aliases) && key !== 'pair_prefix') entries.push({ group: 'partner', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.gender_hints)) entries.push({ group: 'gender', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.kids_words)) entries.push({ group: 'kids', key, aliases });
  entries.push({ group: 'negation', key: 'neg', aliases: synonyms.negation_markers });
  entries.push({ group: 'advice', key: 'question', aliases: synonyms.advice_markers.question });
  entries.push({ group: 'advice', key: 'shopping', aliases: synonyms.advice_markers.shopping_verbs });
  entries.push({ group: 'advice', key: 'full_look', aliases: synonyms.advice_markers.full_look });

  cache = {
    taxonomy, synonyms, outfits, phrases, questions, weather,
    items, colors, contexts, index: buildIndex(entries),
    looksById: new Map(outfits.looks.map((l) => [l.id, l])),
    nearWhite: new Set(taxonomy.colors.near_white),
    substitutes: taxonomy.substitutes || {},
  };
  return cache;
}
