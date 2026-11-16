/**
 * تعلّم بمراجعة: بياخد الجمل اللي تويلا مافهمتهاش (fallback/none من سجل الأسئلة) ويقترح كلمات جديدة لقطع موجودة.
 * مابيغيّرش أي حاجة لوحده: الناتج مقترحات بس. الموافقة = إضافة الكلمة في learned_aliases.json بـ status:"approved".
 */
import { loadKnowledge } from './knowledge.js';
import { norm, tokenize } from './text.js';

const bigrams = (w) => { const s = new Set(); for (let i = 0; i < w.length - 1; i += 1) s.add(w.slice(i, i + 2)); return s; };
export function dice(a, b) {
  if (a === b) return 1; if (a.length < 3 || b.length < 3) return 0;
  const A = bigrams(a); const B = bigrams(b); let n = 0; for (const x of A) if (B.has(x)) n += 1;
  return (2 * n) / (A.size + B.size);
}
const STOP = new Set(['عايز', 'عايزه', 'عاوز', 'عاوزه', 'محتاج', 'محتاجه', 'ممكن', 'لو', 'سمحت', 'من', 'في', 'على', 'ب', 'ل', 'لي', 'لو', 'انا', 'ايه', 'اي', 'فيه', 'عندكم', 'عندك', 'وريني', 'ورني', 'هات', 'هاتلي', 'جيبلي', 'عايزين', 'ده', 'دي', 'دا']);

/** كل الكلمات اللي تويلا بتعرفها (من الفهرس) عشان نميّز الكلمة الجديدة بجد. */
function knownWords(K) { const set = new Set(); for (const phrase of K.index.exact.keys()) for (const w of phrase.split(' ')) set.add(w); return set; }

/**
 * rows: [{ text, kind, n? }] — kind fallback/none بس بيتحسبوا.
 * بيرجّع: [{ word, count, examples[], suggestions:[{ key, via, similarity }] }] مرتبة بالتكرار.
 */
export function proposeFromLost(rows, { minCount = 2, minSimilarity = 0.5, maxSuggestions = 3, K = loadKnowledge() } = {}) {
  const known = knownWords(K);
  const garmentAliases = []; // {key, word}
  for (const [phrase, list] of K.index.exact) for (const m of list) if (m.group === 'garment') for (const w of phrase.split(' ')) if (w.length >= 3) garmentAliases.push({ key: m.key, word: w });
  const seen = new Map();
  for (const r of rows || []) {
    if (r?.kind && r.kind !== 'fallback' && r.kind !== 'none') continue;
    const text = String(r?.text || ''); const w = r?.n || 1;
    for (const tok of tokenize(norm(text))) {
      if (tok.length < 3 || known.has(tok) || STOP.has(tok) || /^\d+$/.test(tok) || !/[؀-ۿ]/.test(tok)) continue;
      const e = seen.get(tok) || { word: tok, count: 0, examples: [] }; e.count += w; if (e.examples.length < 3 && !e.examples.includes(text)) e.examples.push(text); seen.set(tok, e);
    }
  }
  const out = [];
  for (const e of seen.values()) {
    if (e.count < minCount) continue;
    const best = new Map();
    for (const g of garmentAliases) { const sim = dice(e.word, g.word); if (sim >= minSimilarity && (!best.has(g.key) || best.get(g.key).similarity < sim)) best.set(g.key, { key: g.key, via: g.word, similarity: Math.round(sim * 100) / 100 }); }
    out.push({ ...e, suggestions: [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, maxSuggestions) });
  }
  return out.sort((a, b) => b.count - a.count || b.suggestions.length - a.suggestions.length);
}
