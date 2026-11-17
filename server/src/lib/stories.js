// ستوري المحلات في الصفحة الرئيسية (زي الإنستجرام): صورة + كلمة اختيارية + زرار لمنتج، وبتختفي بعد 24 ساعة.
// الرؤية بتتحكم فيها expires_at (الطلبات بتفلتر بيها)، والتنضيف (مسح الصورة والصف) بيتم كل شوية في الخلفية.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { q, insert } from '../db/index.js';
import { mediaMap, getMedia, deleteMedia } from './media.js';
import { videoUrls, deleteStoryVideo } from './story-video.js';

export const STORY_TTL_HOURS = 24;
export const STORY_MAX_ACTIVE = 8; // لكل محل في نفس الوقت
export const STORY_MAX_CAPTION = 140;
export const STORY_MAX_PRODUCTS = 4;
export const STORY_MAX_LABEL = 24;
export const PLATFORM_MAX_ACTIVE = 20; // ستوري تويست الرسمي
export const PLATFORM_HOURS = [24, 48, 72, 168]; // يوم | يومين | 3 أيام | أسبوع
export const CTA_KINDS = ['store', 'new', 'sale', 'category'];
export const TEXT_BGS = ['#1B1B1B', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#2563EB'];

let ready = false;
function ensure() {
  if (ready) return;
  q.run(`CREATE TABLE IF NOT EXISTS store_stories (
    id INTEGER PRIMARY KEY, store_id INTEGER NOT NULL, media_id INTEGER, caption TEXT NOT NULL DEFAULT '',
    product_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'image', video_key TEXT, poster_key TEXT, video_remote INTEGER NOT NULL DEFAULT 0, video_seconds REAL
  )`);
  const cols = q.all('PRAGMA table_info(store_stories)').map((c) => c.name);
  for (const [c, d] of [['kind', "TEXT NOT NULL DEFAULT 'image'"], ['video_key', 'TEXT'], ['poster_key', 'TEXT'], ['video_remote', 'INTEGER NOT NULL DEFAULT 0'], ['video_seconds', 'REAL'],
    ['product_ids', 'TEXT'], ['cta_kind', 'TEXT'], ['cta_slug', 'TEXT'], ['cta_label', "TEXT NOT NULL DEFAULT ''"], ['bg', 'TEXT'], ['platform', 'INTEGER NOT NULL DEFAULT 0'], ['views', 'INTEGER NOT NULL DEFAULT 0'], ['clicks', 'INTEGER NOT NULL DEFAULT 0']]) {
    if (!cols.includes(c)) q.run(`ALTER TABLE store_stories ADD COLUMN ${c} ${d}`);
  }
  // كل جهاز بيتحسب مرة واحدة بس لكل ستوري (مشاهدة ومرة ضغطة) — بنخزن هاش مش IP، وبيتمسح مع الستوري
  q.run('CREATE TABLE IF NOT EXISTS story_events (story_id INTEGER NOT NULL, event TEXT NOT NULL, viewer TEXT NOT NULL, PRIMARY KEY (story_id, event, viewer))');
  // الأدمن هو اللي بيحدد أنهي محل يقدر ينزل ستوري (مقفولة افتراضيًا)
  q.run(`CREATE TABLE IF NOT EXISTS story_access (store_id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  q.run('CREATE INDEX IF NOT EXISTS idx_store_stories_store ON store_stories(store_id, expires_at)');
  q.run('CREATE INDEX IF NOT EXISTS idx_store_stories_exp ON store_stories(expires_at)');
  ready = true;
}

export function storiesAllowed(storeId) {
  ensure();
  return !!q.get('SELECT 1 AS ok FROM story_access WHERE store_id=? AND enabled=1', [storeId]);
}
export function setStoriesAllowed(storeId, enabled) {
  ensure();
  q.run(`INSERT INTO story_access (store_id, enabled, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at`, [storeId, enabled ? 1 : 0]);
}
/** كل المحلات النشطة مع حالة الستوري وعدد الستوريات الشغالة (للأدمن). */
export function adminStoryStores() {
  ensure();
  return q.all(`SELECT s.id, s.slug, s.name_ar, s.name_en, COALESCE(a.enabled,0) AS enabled,
      (SELECT COUNT(*) FROM store_stories st WHERE st.store_id=s.id AND st.expires_at > datetime('now')) AS active
    FROM stores s LEFT JOIN story_access a ON a.store_id=s.id WHERE s.status='active' ORDER BY enabled DESC, s.name_ar`)
    .map((r) => ({ id: r.id, slug: r.slug, name: { ar: r.name_ar, en: r.name_en }, enabled: !!r.enabled, active: r.active }));
}
export function setAllStoriesAllowed(enabled) {
  ensure();
  for (const s of q.all("SELECT id FROM stores WHERE status='active'")) setStoriesAllowed(s.id, enabled);
}

export const cleanCaption = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, STORY_MAX_CAPTION);

export function activeCount(storeId) {
  ensure();
  return q.get("SELECT COUNT(*) AS n FROM store_stories WHERE store_id=? AND expires_at > datetime('now')", [storeId])?.n || 0;
}

/**
 * بيضيف ستوري (صورة | فيديو | نص). كله اختياري: منتجات (لحد 4) و/أو زرار (المحل | الأحدث | العروض | قسم) بكلمة يكتبها صاحب المحل.
 * بيرجع { id } أو { error } (limit | product | category | empty).
 */
export function addStory({ storeId, mediaId = null, video = null, caption = '', bg = null, productIds = [], cta = null }) {
  ensure();
  if (activeCount(storeId) >= STORY_MAX_ACTIVE) return { error: 'limit' };
  const text = cleanCaption(caption);
  const kind = video ? 'video' : mediaId ? 'image' : 'text';
  if (kind === 'text' && !text) return { error: 'empty' };
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, STORY_MAX_PRODUCTS);
  if (ids.length) {
    const ok = q.all(`SELECT id FROM products WHERE store_id=? AND status='active' AND id IN (${ids.map(() => '?').join(',')})`, [storeId, ...ids]);
    if (ok.length !== ids.length) return { error: 'product' };
  }
  let c = { cta_kind: null, cta_slug: null, cta_label: '' };
  if (cta && CTA_KINDS.includes(cta.kind)) {
    let slug = null;
    if (cta.kind === 'category') {
      slug = q.get('SELECT slug FROM categories WHERE store_id=? AND slug=?', [storeId, String(cta.slug || '')])?.slug;
      if (!slug) return { error: 'category' };
    }
    c = { cta_kind: cta.kind, cta_slug: slug, cta_label: String(cta.label || '').replace(/\s+/g, ' ').trim().slice(0, STORY_MAX_LABEL) };
  }
  const vid = video ? { video_key: video.key, poster_key: video.posterKey, video_remote: video.remote ? 1 : 0, video_seconds: video.seconds } : {};
  const id = insert('store_stories', {
    ...vid, ...c, kind, store_id: storeId, media_id: mediaId, caption: text, product_ids: ids.length ? JSON.stringify(ids) : null,
    bg: kind === 'text' ? (TEXT_BGS.includes(bg) ? bg : TEXT_BGS[0]) : null,
    expires_at: q.get(`SELECT datetime('now', '+${STORY_TTL_HOURS} hours') AS t`).t,
  });
  return { id };
}

/** عدّاد مشاهدات/ضغطات: الجهاز الواحد (IP + متصفح) بيتحسب مرة واحدة بس لكل ستوري. بيرجع true لو اتزاد فعلًا. */
export function bumpStory(id, field, who = '') {
  ensure();
  if (!['views', 'clicks'].includes(field)) return false;
  const live = q.get("SELECT id FROM store_stories WHERE id=? AND expires_at > datetime('now')", [Number(id)]);
  if (!live) return false;
  const viewer = crypto.createHash('sha256').update(String(who)).digest('hex').slice(0, 24);
  const ins = q.run('INSERT OR IGNORE INTO story_events (story_id, event, viewer) VALUES (?, ?, ?)', [live.id, field, viewer]);
  if (!ins.changes) return false;
  q.run(`UPDATE store_stories SET ${field}=${field}+1 WHERE id=?`, [live.id]);
  return true;
}

const idsOf = (r) => { try { return JSON.parse(r.product_ids || '[]'); } catch { return []; } };
const productOf = (rows) => {
  const ids = [...new Set(rows.flatMap(idsOf))];
  if (!ids.length) return new Map();
  const ph = ids.map(() => '?').join(',');
  const prods = q.all(`SELECT p.id, p.slug, p.name_ar, p.name_en, p.price, s.slug AS store_slug FROM products p LEFT JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND p.id IN (${ph})`, ids);
  const first = new Map();
  for (const x of q.all(`SELECT product_id, media_id FROM product_media WHERE product_id IN (${ph}) ORDER BY is_primary DESC, position`, ids)) if (!first.has(x.product_id)) first.set(x.product_id, x.media_id);
  const media = mediaMap([...first.values()]);
  return new Map(prods.map((p) => [p.id, { ...p, image: media.get(first.get(p.id)) || null }]));
};
export const ctaHref = (kind, slug, storeSlug) => {
  const base = `/s/${storeSlug}`;
  return { store: base, new: `${base}/shop?sort=newest`, sale: `${base}/shop?sale=1`, category: `${base}/shop?category=${encodeURIComponent(slug || '')}` }[kind] || base;
};
const DEFAULT_LABEL = { store: 'زور المحل', new: 'شوف الأحدث', sale: 'شوف العروض', category: 'تسوق الكوليكشن', link: 'تسوق دلوقتي' };
const fileUrl = (r) => `${r.video_remote ? config.r2.publicUrl : config.mediaBaseUrl}/${r.poster_key}`;
const storyOut = (r, media, prods, storeSlug, owner = false) => {
  const products = idsOf(r).map((id) => prods.get(id)).filter(Boolean)
    .map((p) => ({ id: p.id, slug: p.slug, storeSlug: p.store_slug || storeSlug, name: { ar: p.name_ar, en: p.name_en }, price: p.price, image: p.image }));
  return {
    id: r.id, kind: r.kind || 'image', image: (r.platform && r.kind === 'image' && r.poster_key) ? fileUrl(r) : media.get(r.media_id) || null, video: r.kind === 'video' ? videoUrls(r) : null, bg: r.bg || null,
    caption: r.caption, createdAt: r.created_at, expiresAt: r.expires_at, products,
    cta: r.cta_kind ? { kind: r.cta_kind, slug: r.cta_slug, label: r.cta_label || DEFAULT_LABEL[r.cta_kind], href: r.cta_kind === 'link' ? r.cta_slug : storeSlug ? ctaHref(r.cta_kind, r.cta_slug, storeSlug) : null } : null,
    ...(owner ? { views: r.views || 0, clicks: r.clicks || 0 } : {}),
  };
};
const hasBody = (o) => o.image || o.video || o.kind === 'text';

/** للصفحة الرئيسية: المحلات اللي عندها ستوري شغال، الأحدث الأول، وجوه كل محل الستوريات من الأقدم للأحدث. */
export function activeStories() {
  ensure();
  const twist = twistGroup();
  const rest = storeGroups();
  return twist ? [twist, ...rest] : rest;
}

/** ستوري تويست الرسمي: مجموعة واحدة في الأول، من غير ما تعتمد على أي محل. */
function twistGroup() {
  const rows = q.all("SELECT * FROM store_stories WHERE platform=1 AND expires_at > datetime('now') ORDER BY created_at ASC, id ASC LIMIT 40");
  if (!rows.length) return null;
  const prods = productOf(rows);
  const items = rows.map((r) => storyOut(r, new Map(), prods, null)).filter(hasBody);
  if (!items.length) return null;
  return { platform: true, store: { slug: '__twist', name: { ar: 'تويست', en: 'Twist' }, logo: '/brand/twist-story.png', logoInitials: 'T', logoColor: '#1B1B1B' }, items };
}

function storeGroups() {
  const rows = q.all(`SELECT st.* FROM store_stories st JOIN stores s ON s.id=st.store_id
    JOIN story_access sa ON sa.store_id=s.id AND sa.enabled=1
    WHERE st.platform=0 AND st.expires_at > datetime('now') AND s.status='active' AND s.hidden=0 ORDER BY st.created_at ASC, st.id ASC LIMIT 400`);
  if (!rows.length) return [];
  const storeIds = [...new Set(rows.map((r) => r.store_id))];
  const stores = new Map(q.all(`SELECT id, slug, name_ar, name_en, logo_media_id, logo_initials, logo_color FROM stores WHERE id IN (${storeIds.map(() => '?').join(',')})`, storeIds).map((s) => [s.id, s]));
  const media = mediaMap([...rows.map((r) => r.media_id), ...[...stores.values()].map((s) => s.logo_media_id)].filter(Boolean));
  const prods = productOf(rows);
  const groups = new Map();
  for (const r of rows) {
    const s = stores.get(r.store_id); if (!s) continue;
    if (!groups.has(s.id)) groups.set(s.id, { store: { slug: s.slug, name: { ar: s.name_ar, en: s.name_en }, logo: media.get(s.logo_media_id) || null, logoInitials: s.logo_initials || '', logoColor: s.logo_color || '#1B1B1B' }, items: [], latest: '' });
    const g = groups.get(s.id);
    const o = storyOut(r, media, prods, s.slug);
    if (hasBody(o)) g.items.push(o);
    if (r.created_at > g.latest) g.latest = r.created_at;
  }
  return [...groups.values()].filter((g) => g.items.length).sort((a, b) => (a.latest < b.latest ? 1 : -1)).map(({ latest, ...g }) => g);
}

/** ستوريات المحل نفسه (للوحة التحكم). */
export function ownStories(storeId) {
  ensure();
  const rows = q.all("SELECT * FROM store_stories WHERE store_id=? AND expires_at > datetime('now') ORDER BY id DESC", [storeId]);
  const media = mediaMap(rows.map((r) => r.media_id));
  const prods = productOf(rows);
  const slug = q.get('SELECT slug FROM stores WHERE id=?', [storeId])?.slug || null;
  return rows.map((r) => storyOut(r, media, prods, slug, true)).filter(hasBody);
}

async function dropFiles(r) {
  q.run('DELETE FROM story_events WHERE story_id=?', [r.id]);
  try { const m = getMedia(r.media_id); if (m) await deleteMedia(m); } catch { /* الصورة اتمسحت قبل كده */ }
  if (r.kind === 'video' || (r.platform && r.poster_key)) await deleteStoryVideo(r);
}

/** مسح ستوري من الأدمن (مراجعة محتوى) من غير شرط المحل. */
export async function adminRemoveStory(id) {
  ensure();
  const r = q.get('SELECT * FROM store_stories WHERE id=?', [id]);
  if (!r) return false;
  q.run('DELETE FROM store_stories WHERE id=?', [r.id]);
  await dropFiles(r);
  return true;
}

/** كل الستوريات الشغالة مع اسم المحل (للأدمن). */
export function adminActiveStories() {
  ensure();
  const rows = q.all(`SELECT st.*, s.slug AS store_slug, s.name_ar AS store_name FROM store_stories st LEFT JOIN stores s ON s.id=st.store_id
    WHERE st.expires_at > datetime('now') ORDER BY st.platform DESC, st.id DESC LIMIT 200`);
  const media = mediaMap(rows.map((r) => r.media_id));
  const prods = productOf(rows);
  return rows.map((r) => ({ ...storyOut(r, media, prods, r.store_slug || null, true), platform: !!r.platform, store: r.platform ? { slug: '', name: 'Twist (رسمي)' } : { slug: r.store_slug, name: r.store_name } }));
}

export async function removeStory(storeId, id) {
  ensure();
  const r = q.get('SELECT * FROM store_stories WHERE id=? AND store_id=?', [id, storeId]);
  if (!r) return false;
  q.run('DELETE FROM store_stories WHERE id=?', [r.id]);
  await dropFiles(r);
  return true;
}

const LINK_RE = /^\/(?!\/)[A-Za-z0-9\-._~%/?=&#+؀-ۿ]*$/;
/** رابط جوه الموقع بس (بيبدأ بـ / ومش //) — مفيش روابط خارجية. */
export const cleanLink = (v) => { const t = String(v || '').trim(); return t.length <= 200 && LINK_RE.test(t) ? t : null; };

/**
 * ستوري تويست الرسمي (من الأدمن): صورة (image: {key, remote}) | فيديو | نص. منتجات من أي محل شغال (لحد 4)،
 * وزرار لأي صفحة جوه الموقع، ومدة 24 ساعة / يومين / 3 أيام / أسبوع. بيرجع { id } أو { error: limit | product | link | empty }.
 */
export function addPlatformStory({ image = null, video = null, caption = '', bg = null, productIds = [], cta = null, hours = 24 }) {
  ensure();
  if ((q.get("SELECT COUNT(*) AS n FROM store_stories WHERE platform=1 AND expires_at > datetime('now')")?.n || 0) >= PLATFORM_MAX_ACTIVE) return { error: 'limit' };
  const text = cleanCaption(caption);
  const kind = video ? 'video' : image ? 'image' : 'text';
  if (kind === 'text' && !text) return { error: 'empty' };
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, STORY_MAX_PRODUCTS);
  if (ids.length) {
    const ok = q.all(`SELECT p.id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND p.id IN (${ids.map(() => '?').join(',')})`, ids);
    if (ok.length !== ids.length) return { error: 'product' };
  }
  let c = { cta_kind: null, cta_slug: null, cta_label: '' };
  if (cta && String(cta.href || '').trim()) {
    const href = cleanLink(cta.href);
    if (!href) return { error: 'link' };
    c = { cta_kind: 'link', cta_slug: href, cta_label: String(cta.label || '').replace(/\s+/g, ' ').trim().slice(0, STORY_MAX_LABEL) };
  }
  const hrs = PLATFORM_HOURS.includes(Number(hours)) ? Number(hours) : 24;
  const media = video ? { video_key: video.key, poster_key: video.posterKey, video_remote: video.remote ? 1 : 0, video_seconds: video.seconds }
    : image ? { poster_key: image.key, video_remote: image.remote ? 1 : 0 } : {};
  const id = insert('store_stories', {
    ...media, ...c, kind, platform: 1, store_id: 0, media_id: null, caption: text, product_ids: ids.length ? JSON.stringify(ids) : null,
    bg: kind === 'text' ? (TEXT_BGS.includes(bg) ? bg : TEXT_BGS[0]) : null,
    expires_at: q.get(`SELECT datetime('now', '+${hrs} hours') AS t`).t,
  });
  return { id };
}

/** بحث منتجات من كل المحلات الشغالة (لاختيار منتجات ستوري تويست). */
export function searchStoryProducts(term = '') {
  ensure();
  const t = String(term || '').trim().slice(0, 60).replace(/[%_]/g, '');
  const like = `%${t}%`;
  const rows = q.all(`SELECT p.id, p.slug, p.name_ar, p.name_en, p.price, s.slug AS store_slug, s.name_ar AS store_name FROM products p JOIN stores s ON s.id=p.store_id
    WHERE p.status='active' AND s.status='active' AND s.hidden=0 AND (?='' OR p.name_ar LIKE ? OR p.name_en LIKE ? OR s.name_ar LIKE ? OR s.slug LIKE ?) ORDER BY p.id DESC LIMIT 24`, [t, like, like, like, like]);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id); const ph = ids.map(() => '?').join(',');
  const first = new Map();
  for (const x of q.all(`SELECT product_id, media_id FROM product_media WHERE product_id IN (${ph}) ORDER BY is_primary DESC, position`, ids)) if (!first.has(x.product_id)) first.set(x.product_id, x.media_id);
  const media = mediaMap([...first.values()]);
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: { ar: r.name_ar, en: r.name_en }, price: r.price, storeSlug: r.store_slug, storeName: r.store_name, image: media.get(first.get(r.id)) || null }));
}

/** تنضيف: بيمسح الستوريات المنتهية (والصورة بتاعتها). آمن لو اتنفذ أكتر من مرة. */
export async function expireStories() {
  ensure();
  const rows = q.all("SELECT * FROM store_stories WHERE expires_at <= datetime('now') LIMIT 100");
  for (const r of rows) {
    q.run('DELETE FROM store_stories WHERE id=?', [r.id]);
    await dropFiles(r);
  }
  return rows.length;
}
