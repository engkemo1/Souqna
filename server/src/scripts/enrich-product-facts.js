/**
 * يحلل صورة كل منتج بالذكاء الاصطناعي (رؤية) ويطلّع مواصفات ظاهرة في الصورة (خامة شكلها، كم، ياقة، طول، نقشة، قصّة، موسم، رسمية)
 * ويحفظها في جدول منفصل product_ai_facts (مش جوه بيانات المنتج، فمبتظهرش للعميل في الـAPI ومبتتمسحش لما صاحب المحل يعدّل المنتج).
 * تويلا بتقولها دايمًا «من الصورة، مش مؤكد من المحل»، وبيانات المحل (لو مكتوبة) بتكسب عليها دايمًا. مبتغيّرش أي حقل في المنتج نفسه.
 * احتياطات: بيتخطّى المنتجات اللي صورتها مشكوك فيها، بيحلل القطعة المسمّاة بس، بيشيل المواصفات اللي ملهاش معنى للنوع (كم للبنطلون)،
 *   بيعيد التحليل لو الصورة الرئيسية اتغيّرت، ولو CONSENSUS=1 بيطلب اتفاق مزوّدين على الخامة والقصّة قبل ما يحفظها.
 *
 *   docker compose exec app node --no-warnings server/src/scripts/enrich-product-facts.js            (dry run: يجرّب 5 منتجات ويطبع)
 *   docker compose exec -e APPLY=1 app node --no-warnings server/src/scripts/enrich-product-facts.js (يحفظ)
 *   LIMIT=100 يحدد العدد، REDO=1 يعيد اللي اتحلل (وبيعيد تلقائي لو الصورة الرئيسية اتغيّرت)، CONSENSUS=1 يطلب اتفاق مزوّدين، PROVIDER=gemini,groq,… (أي مزوّد من نفس مفاتيح تويلا)
 * بعد التشغيل: docker compose restart app
 */
import { q } from '../db/index.js';
import { readPrimaryImage } from '../lib/visual.js';
import { loadKnowledge } from '../lib/moda/knowledge.js';
import { enrichProduct } from '../lib/moda/products.js';

const APPLY = process.env.APPLY === '1';
const LIMIT = Number(process.env.LIMIT || (APPLY ? 100000 : 5));
const REDO = process.env.REDO === '1';
const VOCAB = {
  material_look: ['قطن', 'جينز', 'جلد', 'كتان', 'ستان', 'شيفون', 'صوف', 'تريكو', 'قماش رسمي', 'بوليستر لامع', 'شبك', ''],
  sleeves: ['كم طويل', 'كم قصير', 'من غير كم', 'كم تلات أرباع', ''],
  neckline: ['ياقة قميص', 'رقبة دائرية', 'V', 'عالي', 'كتف مكشوف', 'من غير ياقة', ''],
  length: ['قصير', 'لحد الركبة', 'متوسط', 'طويل', 'ماكسي', ''],
  pattern: ['سادة', 'مخطط', 'كاروهات', 'مطبوع', 'مطرز', 'منقط', ''],
  fit: ['ضيق', 'مستقيم', 'واسع', 'أوفر سايز', ''],
  season: ['صيفي', 'شتوي', 'كل المواسم', ''],
  formality: ['رسمي', 'شبه رسمي', 'كاجوال', 'رياضي', 'سواريه', ''],
};
const promptFor = (name) => `You look at ONE product photo from a clothing store. The product is named «${name}»: describe ONLY that item (ignore other garments, the model, the background), and ONLY what is clearly visible. Reply with ONE JSON object, no prose.
For each key pick exactly one value from its list, or "" if it is not clearly visible or not applicable (do NOT guess, an empty string is the correct answer when unsure):
${Object.entries(VOCAB).map(([k, v]) => `${k}: ${v.filter(Boolean).join(' | ')}`).join('\n')}
Example: {"material_look":"جينز","sleeves":"","neckline":"","length":"طويل","pattern":"سادة","fit":"مستقيم","season":"كل المواسم","formality":"كاجوال"}`;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const parse = (t) => { const s = String(t || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function viaGemini(buf, PROMPT) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY; if (!key) throw new Error('no gemini key');
  const model = process.env.FACTS_GEMINI_MODEL || 'gemini-2.0-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(40000),
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: b64(buf) } }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
  });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`gemini ${r.status}`);
  return { out: parse(j.candidates?.[0]?.content?.parts?.[0]?.text), model };
}
async function viaAnthropic(buf, PROMPT) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('no anthropic key');
  const model = process.env.FACTS_ANTHROPIC_MODEL || 'claude-haiku-4-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(40000),
    body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64(buf) } }, { type: 'text', text: PROMPT }] }] }),
  });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`anthropic ${r.status}`);
  return { out: parse(j.content?.[0]?.text), model };
}
async function viaCloudflare(buf, PROMPT) {
  const acc = process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID; const tok = process.env.CF_AI_TOKEN; if (!acc || !tok) throw new Error('no cloudflare key');
  const r = await fetch(`${process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4'}/accounts/${acc}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ image: [...buf], max_tokens: 250, prompt: PROMPT }),
  });
  const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(`cloudflare ${r.status}`);
  return { out: parse(j.result?.description ?? j.result?.response), model: 'llava-1.5-7b' };
}
// مزوّدين متوافقين مع OpenAI وبيدعموا الصور (نفس مفاتيح تويلا). الموديل ممكن يتغيّر بـ FACTS_<NAME>_MODEL.
const COMPAT_VISION = {
  groq:        { base: 'https://api.groq.com/openai/v1', key: 'GROQ_API_KEY', model: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  mistral:     { base: 'https://api.mistral.ai/v1', key: 'MISTRAL_API_KEY', model: 'mistral-small-latest' },
  openrouter:  { base: 'https://openrouter.ai/api/v1', key: 'OPENROUTER_API_KEY', model: 'google/gemma-3-27b-it:free' },
  nvidia:      { base: 'https://integrate.api.nvidia.com/v1', key: 'NVIDIA_API_KEY', model: 'meta/llama-3.2-90b-vision-instruct' },
  scaleway:    { base: 'https://api.scaleway.ai/v1', key: 'SCALEWAY_API_KEY', model: 'mistral-small-3.2-24b-instruct-2506' },
  huggingface: { base: 'https://router.huggingface.co/v1', key: 'HF_TOKEN', model: 'Qwen/Qwen2.5-VL-72B-Instruct' },
  qwen:        { base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', key: 'DASHSCOPE_API_KEY', model: 'qwen-vl-plus' },
  extra:       { base: (process.env.EXTRA_LLM_BASE_URL || '').replace(/\/+$/, ''), key: 'EXTRA_LLM_KEY', model: process.env.EXTRA_LLM_MODEL || '' },
};
const viaCompat = (name) => async (buf, PROMPT) => {
  const c = COMPAT_VISION[name]; const key = process.env[c.key]; const model = process.env[`FACTS_${name.toUpperCase()}_MODEL`] || c.model;
  if (!key || !c.base || !model) throw new Error(`no ${name} key`);
  const r = await fetch(`${c.base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model, temperature: 0, max_tokens: 300, messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64(buf)}` } }] }] }),
  });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${name} ${r.status}`);
  return { out: parse(j.choices?.[0]?.message?.content), model };
};
const PROVIDERS = { gemini: viaGemini, anthropic: viaAnthropic, cloudflare: viaCloudflare, ...Object.fromEntries(Object.keys(COMPAT_VISION).map((n) => [n, viaCompat(n)])) };
const hasKey = (n) => (n === 'gemini' ? !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  : n === 'anthropic' ? !!process.env.ANTHROPIC_API_KEY
    : n === 'cloudflare' ? !!((process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID) && process.env.CF_AI_TOKEN)
      : !!(process.env[COMPAT_VISION[n].key] && COMPAT_VISION[n].base && COMPAT_VISION[n].model));
// الترتيب: الأدق في الصور أولًا. بنجرّب بس اللي مفتاحه موجود، ولو واحد فشل بننتقل للتاني.
const ALL = ['gemini', 'anthropic', 'groq', 'mistral', 'nvidia', 'scaleway', 'huggingface', 'qwen', 'openrouter', 'extra', 'cloudflare'];
const order = (process.env.PROVIDER ? process.env.PROVIDER.split(',').map((x) => x.trim()) : ALL).filter((n) => PROVIDERS[n] && hasKey(n));
console.log(order.length ? `مزوّدين الرؤية المتاحين (بالترتيب): ${order.join(' ← ')}` : 'مفيش ولا مفتاح مزوّد رؤية متظبط على السيرفر (Gemini/Anthropic/Groq/Mistral/NVIDIA/Scaleway/HuggingFace/Qwen/OpenRouter/Cloudflare/EXTRA_LLM_*)');
if (!order.length) process.exit(1);

// أي مواصفات ليها معنى لأنهي نوع قطعة (كم/ياقة للبنطلون أو الجزمة ملهاش معنى → بتتشال)
const RELEVANT = {
  tops: ['material_look', 'sleeves', 'neckline', 'length', 'pattern', 'fit', 'season', 'formality'],
  dresses: ['material_look', 'sleeves', 'neckline', 'length', 'pattern', 'fit', 'season', 'formality'],
  suiting: ['material_look', 'sleeves', 'pattern', 'fit', 'season', 'formality'],
  outerwear: ['material_look', 'sleeves', 'length', 'pattern', 'fit', 'season', 'formality'],
  modest: ['material_look', 'sleeves', 'length', 'pattern', 'fit', 'season', 'formality'],
  sport: ['material_look', 'sleeves', 'length', 'pattern', 'fit', 'season', 'formality'],
  underwear_sleep: ['material_look', 'sleeves', 'length', 'pattern', 'season'],
  bottoms: ['material_look', 'length', 'pattern', 'fit', 'season', 'formality'],
  shoes: ['material_look', 'pattern', 'formality'],
  bags: ['material_look', 'pattern', 'formality'],
  accessories: ['material_look', 'pattern', 'formality'],
};
const SAFE_DEFAULT = ['pattern', 'formality'];
const CONSENSUS_KEYS = ['material_look', 'fit', 'season'];
const CONSENSUS = process.env.CONSENSUS === '1';

const clean = (o, allowed) => {
  if (!o || typeof o !== 'object') return null;
  const res = {};
  for (const [k, list] of Object.entries(VOCAB)) { const v = String(o[k] ?? '').trim(); if (v && list.includes(v) && allowed.includes(k)) res[k] = v; } // أي قيمة برا القائمة أو ملهاش معنى للنوع بتتشال
  return Object.keys(res).length ? res : null;
};

q.run(`CREATE TABLE IF NOT EXISTS product_ai_facts (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  facts_json TEXT NOT NULL, media_id INTEGER, model TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
const K = loadKnowledge();
const rows = q.all(`SELECT p.id, p.name_ar, p.name_en, p.moda_key, p.photo_mismatch, COALESCE(c.name_ar || ' ' || c.name_en, '') AS cat_text, f.media_id AS done_media
  FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN product_ai_facts f ON f.product_id=p.id
  WHERE p.status='active' ORDER BY p.id DESC`);
let done = 0, saved = 0, skipped = 0, failed = 0, noPhoto = 0, doubtful = 0, noKind = 0, streak = 0;
for (const r of rows) {
  if (done >= LIMIT) break;
  if (Number(r.photo_mismatch) === 1) { doubtful++; continue; } // الصورة مشكوك فيها → مش هنحلل صورة ممكن تكون لقطعة تانية
  const mediaId = q.val('SELECT media_id FROM product_media WHERE product_id=? ORDER BY is_primary DESC, position LIMIT 1', [r.id]);
  if (r.done_media != null && r.done_media === mediaId && !REDO) { skipped++; continue; } // اتحلل وصورته زي ما هي
  const e = enrichProduct({ ...r }, K);
  const family = e.key ? K.items.get(e.key)?.family : null;
  if (!e.key || e.typeConflict) { noKind++; continue; } // مش عارفين نوع القطعة بثقة → مفيش تحليل
  const allowed = RELEVANT[family] || SAFE_DEFAULT;
  const buf = await readPrimaryImage(r.id); if (!buf) { noPhoto++; continue; }
  const prompt = promptFor(String(r.name_ar || r.name_en || '').slice(0, 80));
  const results = []; let lastErr = '';
  for (const name of order) {
    try { const res = await PROVIDERS[name](buf, prompt); if (res?.out) { results.push({ ...res, provider: name }); if (!CONSENSUS || results.length >= 2) break; } } catch (err) { lastErr = err.message; }
  }
  done++;
  let facts = clean(results[0]?.out, allowed);
  if (facts && CONSENSUS) {
    if (results.length >= 2) { const f2 = clean(results[1].out, allowed) || {}; for (const k of CONSENSUS_KEYS) if (facts[k] && facts[k] !== f2[k]) delete facts[k]; } // خامة/قصّة/موسم لازم مزوّدين يتفقوا
    else for (const k of CONSENSUS_KEYS) delete facts[k]; // مزوّد واحد بس → مبنثقش في الحاجات دي
  }
  if (!facts || !Object.keys(facts).length) { failed++; streak++; console.log(`#${r.id} ${r.name_ar} — لا نتيجة ${lastErr}`); if (streak >= 10) { console.error('10 فشل ورا بعض: بوقف (حد يومي أو مفتاح غلط؟). أعد التشغيل بعدين وهيكمل من مكانه.'); break; } continue; }
  streak = 0;
  console.log(`#${r.id} ${r.name_ar} [${results.map((x) => x.provider).join('+')}] → ${JSON.stringify(facts)}`);
  if (APPLY) { q.run('INSERT INTO product_ai_facts(product_id, facts_json, media_id, model) VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET facts_json=excluded.facts_json, media_id=excluded.media_id, model=excluded.model, created_at=datetime(\'now\')', [r.id, JSON.stringify({ ...facts, v: 1, source: 'image_ai' }), mediaId ?? null, results.map((x) => x.model).join('+')]); saved++; }
  await new Promise((ok) => setTimeout(ok, Number(process.env.SLEEP_MS || 700)));
}
console.log(`\nانتهى: اتحلل ${done}، اتحفظ ${saved}، اتخطى (اتحلل قبل كده) ${skipped}، صورة مشكوك فيها ${doubtful}، نوع مش واضح ${noKind}، بدون صورة ${noPhoto}، فشل ${failed}${APPLY ? '' : ' (dry run: مفيش حفظ — شغّل APPLY=1)'}`);
