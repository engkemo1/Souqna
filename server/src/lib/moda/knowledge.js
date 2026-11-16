/**
 * تحميل ملفات المعرفة (server/src/knowledge/*.json) وبناء فهارس البحث.
 * الملفات بيانات، فتعديلها بيغيّر سلوك تويلا من غير كود.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { norm, skeletonPhrase, isLatinToken } from './text.js';
import { buildKb } from './kbBridge.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'knowledge');
const load = (name) => JSON.parse(readFileSync(path.join(DIR, name), 'utf8'));

let cache = null;
let kbOverride = null; // نسخة مرفوعة من الأدمن (محفوظة في قاعدة البيانات) بتغلب الملف
let bridgeOverride = null;
const loadOpt = (name) => (existsSync(path.join(DIR, name)) ? load(name) : null);
/** الأدمن رفع نسخة جديدة من قاعدة المعرفة أو الجسر: تتطبق فورًا من غير deploy. null = نرجع للملف. */
export function setKbOverride({ kb, bridge } = {}) {
  if (kb !== undefined) kbOverride = kb ? (typeof kb === 'string' ? JSON.parse(kb) : kb) : null;
  if (bridge !== undefined) bridgeOverride = bridge ? (typeof bridge === 'string' ? JSON.parse(bridge) : bridge) : null;
  cache = null;
}
export const kbFiles = () => ({ kb: loadOpt('fashion_kb.json'), bridge: loadOpt('kb_bridge.json'), kbCustom: !!kbOverride, bridgeCustom: !!bridgeOverride });

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
  // جمع سالم تلقائي لأسماء القطع (سترة→سترات، بنطلون→بنطلونات): الكتالوجات والعملاء بيكتبوا الجمع كتير ومش لازم نكتب كل صيغة بإيدينا
  const plurals = (aliases) => { const out = []; const have = new Set(aliases); for (const al of aliases) { if (typeof al !== 'string' || !/^[\u0621-\u064A]{3,}$/.test(al)) continue; const base = /[ةه]$/.test(al) ? al.slice(0, -1) : al; const p = `${base}ات`; if (!have.has(p)) { have.add(p); out.push(p); } } return out; };
  for (const [key, aliases] of Object.entries(synonyms.garments)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'garment', key, aliases: key === 'watch' ? aliases : [...aliases, ...plurals(aliases)] }); // ساعات = ساعات زمن مش ساعات يد («سفر 8 ساعات»)
  for (const [key, aliases] of Object.entries(synonyms.contexts)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'context', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.audiences)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'audience', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.colors)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'color', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.materials)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'material', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.tastes)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'taste', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.intents)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'intent', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.relationships)) if (Array.isArray(aliases)) entries.push({ group: 'relation', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.time_words)) if (Array.isArray(aliases)) entries.push({ group: 'time', key, aliases });
  for (const [wd, aliases] of Object.entries(synonyms.time_words.weekdays)) entries.push({ group: 'weekday', key: wd, aliases });
  for (const [key, aliases] of Object.entries(synonyms.season_words)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'season', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.partner_strict)) if (Array.isArray(aliases) && key !== 'pair_prefix') entries.push({ group: 'partner', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.gender_hints)) if (Array.isArray(aliases) && !key.startsWith('_')) entries.push({ group: 'gender', key, aliases });
  for (const [key, aliases] of Object.entries(synonyms.kids_words)) entries.push({ group: 'kids', key, aliases });
  // قاعدة معرفة الموضة: أسماء القطع والألوان بالمصري بتتضاف للقاموس (من غير ما تغيّر معنى كلمة موجودة)
  const items0 = new Set(items.keys());
  const kbSrc = kbOverride || loadOpt('fashion_kb.json'); const bridgeSrc = bridgeOverride || loadOpt('kb_bridge.json');
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => !k.startsWith('_') && Array.isArray(v)));
  // أي كلمة ليها معنى تاني عند تويلا (مناسبة، فئة، خامة، ذوق، نية، «طقم»، وقت، فصل، علاقة…): قاعدة معرفة مرفوعة ما تقدرش تخطفها كاسم قطعة
  const flatWords = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => flatWords(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) flatWords(v, out); return out; };
  const protect = Object.fromEntries(['relationships', 'budget_words', 'intents', 'negation_markers', 'gender_hints', 'partner_strict', 'kids_words', 'time_words', 'season_words', 'advice_markers'].map((g) => [`p_${g}`, flatWords(synonyms[g])]));
  let kb;
  try {
    kb = buildKb(kbSrc, bridgeSrc, { garments: synonyms.garments, colors: synonyms.colors, itemKeys: items0,
      otherWords: { ...protect, ...Object.fromEntries(Object.entries(pick(synonyms.contexts)).map(([k, v]) => [`c_${k}`, v])), ...Object.fromEntries(Object.entries(pick(synonyms.audiences)).map(([k, v]) => [`a_${k}`, v])), ...Object.fromEntries(Object.entries(pick(synonyms.materials)).map(([k, v]) => [`m_${k}`, v])), ...Object.fromEntries(Object.entries(pick(synonyms.tastes)).map(([k, v]) => [`t_${k}`, v])) } });
  } catch (e) { kb = buildKb(null); kb.report.warnings.push(`قاعدة المعرفة فيها خطأ: ${e.message}`); }
  kb.custom = !!kbOverride; kb.bridgeCustom = !!bridgeOverride;
  entries.push(...kb.aliasEntries);
  // كلمات اتعلّمتها تويلا من أسئلة العملاء وانت وافقت عليها (learned_aliases.json): بتتضاف كمرادفات لقطعة موجودة بس،
  // ومابتغيّرش معنى أي كلمة موجودة (لو الكلمة ليها معنى تاني بتتجاهل). status لازم يكون approved.
  try {
    const learned = loadOpt('learned_aliases.json');
    if (learned && Array.isArray(learned.entries)) {
      const taken = new Set(); for (const e of entries) for (const a of e.aliases || []) taken.add(norm(a));
      for (const it of learned.entries) {
        if (it?.status !== 'approved' || !items.has(it.key) || typeof it.alias !== 'string') continue;
        const a = norm(it.alias); if (!a || taken.has(a)) continue;
        taken.add(a); entries.push({ group: 'garment', key: it.key, aliases: [it.alias] });
        if (Array.isArray(synonyms.garments[it.key])) synonyms.garments[it.key].push(it.alias); // جدول أسماء المنتجات (inferKey) بيقرا من هنا
      }
    }
  } catch { /* ملف الكلمات المتعلّمة اختياري: لو بايظ بنتجاهله */ }
  entries.push({ group: 'negation', key: 'neg', aliases: synonyms.negation_markers });
  entries.push({ group: 'advice', key: 'question', aliases: synonyms.advice_markers.question });
  entries.push({ group: 'advice', key: 'shopping', aliases: synonyms.advice_markers.shopping_verbs });
  entries.push({ group: 'advice', key: 'full_look', aliases: synonyms.advice_markers.full_look });

  cache = {
    taxonomy, synonyms, outfits, phrases, questions, weather,
    items, colors, contexts, index: buildIndex(entries), kb,
    looksById: new Map(outfits.looks.map((l) => [l.id, l])),
    nearWhite: new Set(taxonomy.colors.near_white),
    substitutes: taxonomy.substitutes || {},
  };
  return cache;
}
