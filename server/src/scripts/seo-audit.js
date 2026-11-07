#!/usr/bin/env node
/**
 * Twist SEO audit. Crawls the live sitemap and reports anything an SEO tool would flag.
 * Run after adding stores, sections or products:
 *
 *   node server/src/scripts/seo-audit.js                    (audits https://twistegy.com)
 *   node server/src/scripts/seo-audit.js http://localhost:3000
 *
 * Exits with code 1 when it finds errors, so it can also run in CI.
 * No dependencies: needs Node 18+ (built-in fetch).
 */
const ORIGIN = (process.argv[2] || 'https://twistegy.com').replace(/\/+$/, '');
const CONCURRENCY = 8;
const TITLE_MAX = 65;
const DESC_MIN = 50;
const DESC_MAX = 170;

const errors = [];
const warnings = [];
const err = (url, msg) => errors.push({ url, msg });
const warn = (url, msg) => warnings.push({ url, msg });

const pick = (html, re) => (html.match(re) || [])[1] || '';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const norm = (u) => { try { const x = new URL(u); return decodeURI(x.origin + x.pathname.replace(/\/+$/, '')) + x.search; } catch { return u; } };

async function get(url, opts = {}) {
  const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'twist-seo-audit' }, ...opts });
  const type = res.headers.get('content-type') || '';
  const text = /text|json|xml/.test(type) ? await res.text() : '';
  return { status: res.status, headers: res.headers, text };
}

function auditPage(url, r, seen) {
  if (r.status !== 200) return err(url, `HTTP ${r.status} (sitemap URLs must return 200)`);
  const html = r.text;
  const title = decode(pick(html, /<title>([^<]*)<\/title>/));
  const desc = decode(pick(html, /<meta name="description" content="([^"]*)"/));
  const canonical = pick(html, /<link rel="canonical" href="([^"]*)"/);
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  const robots = `${pick(html, /<meta name="robots" content="([^"]*)"/)} ${r.headers.get('x-robots-tag') || ''}`;

  if (!title) err(url, 'missing <title>');
  else if (title.length > TITLE_MAX) warn(url, `title is ${title.length} chars (over ${TITLE_MAX}): ${title}`);
  if (!desc) err(url, 'missing meta description');
  else if (desc.length < DESC_MIN) warn(url, `description is short (${desc.length} chars)`);
  else if (desc.length > DESC_MAX) warn(url, `description is long (${desc.length} chars)`);
  if (!canonical) err(url, 'missing canonical');
  else if (norm(canonical) !== norm(url)) err(url, `canonical points elsewhere: ${canonical}`);
  if (h1s !== 1) err(url, `expected exactly 1 <h1>, found ${h1s}`);
  if (/noindex/i.test(robots)) err(url, 'page is in the sitemap but marked noindex');
  if (!/property="og:title"/.test(html)) warn(url, 'missing og:title');
  if (!/property="og:image"/.test(html)) warn(url, 'missing og:image');
  if (/<html[^>]*>/.test(html) && !/<html[^>]*\blang=/.test(html)) err(url, 'missing html lang');

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { err(url, 'invalid JSON-LD'); }
  }
  if (/undefined|\[object Object\]|NaN|null\s*\|/.test(title + desc)) err(url, `title/description contains a placeholder value: ${title}`);

  for (const [key, val] of [['title', title], ['description', desc]]) {
    if (!val) continue;
    const list = seen[key].get(val) || [];
    list.push(url);
    seen[key].set(val, list);
  }
}

async function main() {
  console.log(`Auditing ${ORIGIN}\n`);

  const robots = await get(`${ORIGIN}/robots.txt`);
  if (robots.status !== 200) err('/robots.txt', `HTTP ${robots.status}`);
  else if (!/^Sitemap:\s*\S+/im.test(robots.text)) err('/robots.txt', 'no Sitemap: line');

  const sm = await get(`${ORIGIN}/sitemap.xml`);
  if (sm.status !== 200) { err('/sitemap.xml', `HTTP ${sm.status}`); return report(0); }
  const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
  const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dupes.length) err('/sitemap.xml', `duplicate URLs: ${[...new Set(dupes)].join(', ')}`);
  if (urls.some((u) => !u.startsWith(ORIGIN) && !u.startsWith('https://twistegy.com'))) warn('/sitemap.xml', 'contains URLs from another origin');

  const nf = await get(`${ORIGIN}/this-page-should-not-exist-${Date.now()}`);
  if (nf.status !== 404) err('/<missing page>', `unknown URLs return ${nf.status}, expected 404`);

  const seen = { title: new Map(), description: new Map() };
  let i = 0;
  const target = (u) => u.replace(/^https?:\/\/[^/]+/, ORIGIN); // lets you audit localhost with the production sitemap
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try { auditPage(u, await get(target(u)), seen); } catch (e) { err(u, `request failed: ${e.message}`); }
    }
  }));

  for (const [key, map] of Object.entries(seen)) {
    for (const [val, list] of map) if (list.length > 1) err(list[0], `duplicate ${key} on ${list.length} pages (${list.slice(0, 3).join(' , ')}): ${val}`);
  }
  report(urls.length);
}

function report(n) {
  const show = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label} (${list.length})`);
    for (const x of list.slice(0, 60)) console.log(`  - ${x.url}\n      ${x.msg}`);
    if (list.length > 60) console.log(`  ... and ${list.length - 60} more`);
  };
  show('ERRORS', errors);
  show('WARNINGS', warnings);
  console.log(`\nChecked ${n} sitemap URLs: ${errors.length} errors, ${warnings.length} warnings.`);
  console.log(errors.length ? 'FAIL' : 'PASS');
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
