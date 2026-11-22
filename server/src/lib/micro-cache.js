/**
 * Tiny in-memory response cache for PUBLIC, user-independent GET endpoints (home page data, departments, store pages…).
 *
 * Why: the database layer is synchronous, so one heavy query blocks every other visitor while it runs. With thousands of
 * people opening the home page, the same 100 KB answer would be recomputed thousands of times. Here the first visitor pays,
 * everyone else in the next few seconds gets the stored answer in microseconds. A change made in the admin shows up within `ttl`.
 *
 * Safe by construction: only GET, only 200 responses, never when an auth / admin / buyer header is present, bounded size.
 */
const store = new Map();
const MAX_ENTRIES = 800;
const MAX_BYTES = 600_000; // never keep one huge answer

export function microCache(ttlSeconds = 15) {
  const ttl = ttlSeconds * 1000;
  return (req, res, next) => {
    if (req.method !== 'GET' || req.headers.authorization || req.headers['x-admin-key'] || req.headers['x-buyer-token'] || req.headers['x-no-cache']) return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    const now = Date.now();
    if (hit && hit.exp > now) {
      res.set('X-Cache', 'HIT');
      if (hit.cc) res.set('Cache-Control', hit.cc);
      return res.status(200).type('application/json').send(hit.body);
    }
    res.set('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (obj) => {
      try {
        if (res.statusCode === 200) {
          const body = JSON.stringify(obj);
          if (body.length <= MAX_BYTES) {
            if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
            store.set(key, { body, exp: Date.now() + ttl, cc: res.get('Cache-Control') || '' });
          }
          return res.type('application/json').send(body);
        }
      } catch { /* fall through to the normal path */ }
      return json(obj);
    };
    next();
  };
}

export const clearMicroCache = () => store.clear();

/**
 * Keeps the busiest answers permanently warm: every `everyMs` the server asks itself for them (same URL the website uses),
 * so a visitor never has to wait for the heavy home-page queries — they always find a fresh stored answer.
 */
export function prewarm(port, paths, everyMs = 20_000) {
  const run = async () => {
    for (const p of paths) {
      try { const r = await fetch(`http://127.0.0.1:${port}/api${p}`, { headers: { 'accept-encoding': 'identity' } }); await r.arrayBuffer(); } catch { /* next round */ }
      await new Promise((ok) => setTimeout(ok, 50)); // let real visitors in between
    }
  };
  setTimeout(run, 3000).unref();
  return setInterval(run, everyMs).unref();
}
