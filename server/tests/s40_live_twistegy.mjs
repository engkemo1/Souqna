// s40: كتالوج twistegy.com الحقيقي (199 اسم) — فهم عربي/إنجليزي لنفس القطعة + ماركات + رد «ست» + long≠lounge
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { runModa } = await import(path.join(here, '../src/lib/moda/engine.js'));
const lines = fs.readFileSync(path.join(here, 'fixtures/twistegy_live_names.txt'), 'utf8').trim().split('\n');
const rows = lines.map((l, i) => { const [n, s, , p] = l.split('|'); return { id: i + 1, store_id: 1, slug: 'l' + i, name_ar: n, name_en: n, description_ar: '', price: +p, category_id: 1, status: 'active', colors_json: '[]', sizes_json: '[]', track_stock: 0, stock: 10, moda_key: null, department: null, audience: null, cat_text: '', store_name_ar: s, rating: 4, rating_count: 5, sold_count: 3 }; });
const by = new Map(rows.map((r) => [r.id, r]));
const now = new Date('2026-11-16T12:00:00Z');
const idsOf = (r) => [...new Set((JSON.stringify(r.blocks || null).match(/"id":(\d+)/g) || []).map((x) => +x.slice(5)))].filter((i) => by.has(i));
const names = (r) => idsOf(r).map((i) => by.get(i).name_ar);
let pass = 0, fail = 0; const bad = [];
const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); } };
const one = async (q) => runModa([{ role: 'user', content: q }], { products: rows, session: null, now });
const two = async (a, b) => { const m = [{ role: 'user', content: a }]; let r = await runModa(m, { products: rows, session: null, now }); m.push({ role: 'assistant', content: r.say || '' }, { role: 'user', content: b }); return runModa(m, { products: rows, session: r.session, now }); };
for (const q of ['فستان سواريه', 'soiree dress', 'evening dress', 'فستان سهرة', 'party dress', 'i need a long evening dress', 'long evening dress']) { const n = names(await one(q)); ok(n.some((x) => /سواريه|سهرة|Evening|Soire/i.test(x)), `${q} => ${n}`); }
for (const [q, re] of [['فستان كاجوال', /كاش|دريس/], ['casual dress', /كاش|دريس/], ['sunglasses', /نضار/], ['shades', /نضار/], ['tie', /كرافت/], ['bow tie', /ببيون|فيونك/]]) { const n = names(await one(q)); if (n.length) ok(n.some((x) => re.test(x)), `${q} => ${n}`); }
for (const [a, b, re] of [['nike shoes', 'for men', /كوتش/], ['حذاء نايك', 'ست', /كوتش/], ['كوتشي', 'راجل', /كوتش/], ['جاكيت جينز', 'ست', /جينز/], ['denim jacket', 'men', /جينز|جاك/], ['فستان البسه في فرح صحبتي', 'محجبة', /سواريه|سهرة/]]) { const n = names(await two(a, b)); ok(n.length && re.test(n[0] + ' ' + n.join(' ')), `${a}+${b} => ${n}`); }
for (const [q, re] of [['بونيه', /بوني|رقبي/], ['رقبيه نينجا', /رقبي/], ['bonnet', /بوني|رقبي/], ['hijab cap', /بوني|رقبي/]]) { const n = names(await one(q)); ok(n.length && re.test(n.join(' ')), `${q} => ${n}`); }
for (const [a, b] of [['نضاره', 'راجل'], ['sunglasses', 'for men'], ['نضارة حريمي', 'ست']]) { const n = names(await two(a, b)); ok(n.some((x) => /نضار/.test(x)), `${a}+${b} => ${n}`); }
const n1 = names(await two('nike shoes', 'for men')); ok(!/كلاسيك|قرنيه/.test(n1[0] || ''), `nike first=${n1[0]}`);
console.log(JSON.stringify({ total: pass + fail, pass, fail, bad }));
process.exit(fail ? 1 : 0);
