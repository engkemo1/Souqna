import { q } from '../db/index.js';
import { config } from '../config.js';

/**
 * IndexNow: tells Bing (and other engines that support it) about new pages right away instead of waiting for a crawl.
 * Every few hours we submit the URLs that are new since the last successful run (the first run submits everything).
 * Public key file is served at /<key>.txt by index.js. Disabled with INDEXNOW_KEY=off.
 */
const KEY = config.indexNowKey;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const SETTING = 'indexnow_since';

export const indexNowKey = () => (KEY && KEY !== 'off' ? KEY : null);

async function submit(origin, urls) {
  for (let i = 0; i < urls.length; i += 9000) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(origin).host, key: KEY, keyLocation: `${origin}/${KEY}.txt`, urlList: urls.slice(i, i + 9000) }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow answered ${res.status}`);
  }
}

export async function runIndexNow(origin, collectUrls) {
  if (!indexNowKey()) return;
  const since = q.val('SELECT value FROM app_settings WHERE key=?', [SETTING]) || null;
  const now = q.val("SELECT datetime('now')");
  const urls = collectUrls(since);
  if (urls.length) await submit(origin, urls);
  q.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [SETTING, now]);
  console.log(`[indexnow] sent ${urls.length} URL(s)`);
}

export function startIndexNow(origin, collectUrls) {
  if (!indexNowKey()) return;
  const tick = () => runIndexNow(origin, collectUrls).catch((e) => console.warn('[indexnow]', e.message));
  setTimeout(tick, 2 * 60 * 1000).unref();
  setInterval(tick, 6 * 60 * 60 * 1000).unref();
}
