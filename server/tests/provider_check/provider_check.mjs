// تجربة حقيقية لـ Gemini و Groq بالمفاتيح الحقيقية، بتفحص رد الموديل الخام (قبل ما الكود يرفضه أو ينقذه) على 5 محاور:
//  1) فهم تعليمات تويلا  2) منتجات صحيحة من الكتالوج  3) الحفاظ على قواعد التنسيق  4) JSON سليم  5) الأطقم المتعددة
// وبعدها بتبيّن هل الكود قبل الرد (curated) ولا رجع للقواعد.
// التشغيل من فولدر server:  node tests/provider_check/provider_check.mjs [gemini|groq|both]
// المفاتيح من متغيرات البيئة: GEMINI_API_KEY و GROQ_API_KEY (مش بتتكتب في أي ملف). اختياري: GEMINI_MODEL / GROQ_MODEL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { runModa } = await import(path.resolve(here, '../../src/lib/moda/engine.js'));
const { makeCurator, estTokens } = await import(path.resolve(here, '../../src/lib/moda/curate.js'));
const rows = fs.readFileSync(path.join(here, 'cat1.txt'), 'utf8').trim().split('\n').map((l) => { const [id, name, price, cols] = l.split('|'); return { id: +id, name_ar: name, name_en: '', price: +price, stock: 5, cat_text: '', description_ar: '', sold_count: 5, colors_json: cols ? cols.split('/').map((n) => ({ name_ar: n })) : [] }; });
const byId = new Map(rows.map((r) => [r.id, r]));
const { loadKnowledge } = await import(path.resolve(here, '../../src/lib/moda/knowledge.js'));
const K_has = (t) => typeof t === 'string' && loadKnowledge().items.has(t);
// [label, طلب, تاريخ, ميزانية, نوع مملوك (لو فيه), رسمي؟ (ممنوع كوتشي/هودي/شورت/رياضي), عدد الأشخاص المتوقع]
const SC = [
  ['S1 رجالي خروجة + كوتشي أبيض', 'عندي كوتشي ابيض عايز طقم خروجة لراجل ميزانيتي 3000', '2026-11-14', 3000, 'sneakers', false, 1],
  ['S3 شغل رجالي + كوتشي أبيض', 'عندي كوتشي ابيض عايز طقم شغل لراجل ميزانيتي 4000', '2026-11-14', 4000, 'sneakers', false, 1],
  ['S4 فرح رجالي + كوتشي أبيض (رسمي)', 'عندي كوتشي ابيض ورايح فرح صاحبي لراجل ميزانيتي 6000', '2026-11-14', 6000, 'sneakers', true, 1],
  ['S5 جامعة حريمي (prompt مضغوط، تابين)', 'عندي كوتشي ابيض عايزة طقم جامعة لبنت مش محجبة ميزانيتي 3000', '2026-11-14', 3000, 'sneakers', false, 2],
  ['S6 خروجة محجبة (prompt مضغوط، تابين)', 'عندي كوتشي ابيض عايزة طقم خروجة لبنت محجبة ميزانيتي 3000', '2026-11-14', 3000, 'sneakers', false, 2],
  ['M3 أطقم متعددة: راجل + ولد + بنت (3 أشخاص)', 'عايز طقم خروجة لراجل ولبنت ولولد ميزانيتنا 8000', '2026-11-14', 8000, null, false, 3],
];
const PROVIDERS = {
  gemini: { key: process.env.GEMINI_API_KEY, call: async (system, messages, key) => {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(40000),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: 0.4, maxOutputTokens: 1600, responseMimeType: 'application/json' } }) });
    const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j?.error?.message || ''}`.slice(0, 200)); return j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''; } },
  groq: { key: process.env.GROQ_API_KEY, call: async (system, messages, key) => {
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(40000),
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: 1600, temperature: 0.4, response_format: { type: 'json_object' } }) });
    const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j?.error?.message || ''}`.slice(0, 200)); return j.choices?.[0]?.message?.content || ''; } },
};

const extractJson = (raw) => { if (raw && typeof raw === 'object') return raw; const t = String(raw || ''); const a = t.indexOf('{'), b = t.lastIndexOf('}'); try { return a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : null; } catch { return null; } };
const strictJson = (raw) => { try { JSON.parse(String(raw).trim()); return true; } catch { return false; } };
const AR = /[؀-ۿ]/; const FORMAL_BAD = /(كوتش|هودي|شورت|رياضي|ترنج|جوجر|تيشيرت|تيشرت|شبشب)/;
const stockOf = (system) => Object.fromEntries([...system.matchAll(/STOCK for "([a-z_]+)"[^\n]*\n([\s\S]*?)(?=\nSTOCK for |\n[A-Z])/g)].map((m) => [m[1], new Set(m[2].split('\n').map((l) => l.split(' | ')[0]).filter((x) => /^\d+$/.test(x)))]));
const which = process.argv[2] || 'both'; const names = which === 'both' ? ['gemini', 'groq'] : [which];
const summary = [];
for (const name of names) {
  const P = PROVIDERS[name];
  if (!P.key) { console.log(`\n== ${name}: مفيش مفتاح (${name === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY'}) — اتخطى (BLOCKED)`); summary.push([name, 'BLOCKED', 0, 0]); continue; }
  console.log(`\n==== ${name} ====`); let pass = 0, total = 0;
  for (const [label, q, now, budget, owned, formal, nPeople] of SC) {
    const rec = { raw: null, system: '', err: null, ms: 0, tok: 0 };
    const curator = makeCurator(async (system, messages) => { rec.system = system; rec.tok = estTokens(system); const t0 = Date.now(); rec.t0 = t0; try { rec.raw = await P.call(system, messages, P.key); } catch (e) { rec.err = e.message; throw e; } finally { rec.ms = Date.now() - t0; } return rec.raw; });
    let r; try { r = await runModa([{ role: 'user', content: q }], { products: rows, now: new Date(now + 'T12:00:00Z'), curator }); } catch (e) { rec.err = rec.err || e.message; }
    if (!rec.ms && rec.t0 && !rec.err) { rec.ms = Date.now() - rec.t0; rec.err = `المنسّق استسلم بعد مهلة (${rec.ms}ms) قبل ما الموديل يخلّص: الموديل بطيء، مش رده غلط`; }
    const stock = stockOf(rec.system); const j = extractJson(rec.raw); const people = Array.isArray(j?.people) ? j.people : [];
    const all = people.flatMap((p) => (p.items || []).map((i) => ({ ...i, aud: p.aud })));
    const checks = [];
    // 4) JSON سليم
    checks.push(['4 JSON سليم (يتparse ويحتوي people)', !rec.err && Boolean(j) && people.length > 0, rec.err ? `API: ${rec.err}` : strictJson(rec.raw) ? 'JSON صافي' : 'JSON جوه نص/علامات (الكود بيستخلصه)']);
    // 1) فهم التعليمات: ملاحظة + سبب عربي لكل قطعة + نوع صالح
    checks.push(['1 فهم تعليمات تويلا (note عربي + why عربي لكل قطعة + type صالح)', people.length > 0 && people.every((p) => AR.test(p.note || '')) && all.length > 0 && all.every((i) => AR.test(i.why || '') && K_has(i.type)), `${all.filter((i) => AR.test(i.why || '')).length}/${all.length} سبب عربي`]);
    // 2) منتجات صحيحة من الكتالوج
    const bad = all.filter((i) => i.productId != null && !(stock[i.aud] && stock[i.aud].has(String(i.productId))));
    checks.push(['2 منتجات صحيحة من الكتالوج (كل productId من قايمة المخزون لنفس الشخص)', all.length > 0 && bad.length === 0, bad.length ? `مخترع/غلط: ${bad.map((i) => i.productId).join(',')}` : `${all.filter((i) => i.productId != null).length} منتج كلهم من المخزون`]);
    // 3) قواعد التنسيق
    const picked = all.filter((i) => i.productId != null).map((i) => byId.get(+i.productId)).filter(Boolean); const total$ = picked.reduce((t, p) => t + p.price, 0);
    const reOwn = owned ? picked.filter((p) => /كوتش/.test(p.name_ar)).length : 0; const formalBad = formal ? picked.filter((p) => FORMAL_BAD.test(p.name_ar)).length : 0;
    const dupType = all.filter((i, k) => i.productId != null && all.findIndex((x) => x.aud === i.aud && x.type === i.type && x.productId != null) !== k).length;
    checks.push(['3 قواعد التنسيق (الميزانية، مفيش قطعة مملوكة مكررة، مفيش كاجوال/رياضي في الرسمي، مفيش نوعين من نفس القطعة)', total$ <= budget && !reOwn && !formalBad && !dupType, `إجمالي ${total$}/${budget}${reOwn ? ' | كوتشي مكرر' : ''}${formalBad ? ' | قطع كاجوال في مناسبة رسمية' : ''}${dupType ? ' | نوع مكرر' : ''}`]);
    // 5) الأطقم المتعددة
    const auds = new Set(people.map((p) => p.aud)); const wanted = [...Object.keys(stock)];
    checks.push([`5 أطقم متعددة (طقم لكل شخص مطلوب: ${wanted.join('/')})`, wanted.length >= 1 && wanted.every((a) => auds.has(a)) && (nPeople === 1 || people.length >= 2), `${people.length} طقم من ${wanted.length}`]);
    const accepted = Boolean(r?.curated || r?.plan?.curated);
    console.log(`\n${label}\n   prompt~${rec.tok} tok | ${rec.ms}ms | الكود قبل الرد (curated)=${accepted}`);
    for (const [n, ok, info] of checks) { total += 1; if (ok) pass += 1; console.log(`   ${ok ? 'PASS' : 'FAIL'} - ${n}  [${info}]`); }
  }
  summary.push([name, pass === total ? 'PASS' : 'FAIL', pass, total]);
}
console.log('\n=== الخلاصة ==='); for (const [n, st, p, t] of summary) console.log(`${n}: ${st}${t ? ` (${p}/${t} فحص)` : ''}`);
