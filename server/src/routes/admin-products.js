import { Router } from 'express';
import { z } from 'zod';
import { encodeDepartments, decodeDepartments } from '@souqna/shared';
import { q, tx, update, json } from '../db/index.js';
import { h, AppError, badRequest } from '../lib/errors.js';
import { ensureDeptCategories } from '../lib/departments.js';
import { AUDIENCES, AUDIENCE_KEYS } from '../lib/product-types.js';
import { loadKnowledge } from '../lib/moda/knowledge.js';
import { invalidateModaCatalogue } from '../lib/stylist.js';
import { triggerReindex } from '../lib/visual.js';
import { notifyPriceDrop, notifyBackInStock } from '../lib/buyers.js';
import { notifyStore } from '../lib/push.js';
import { serializeMedia, mediaMap, getMedia, deleteMedia } from '../lib/media.js';
import { stockStatus } from '../lib/serialize.js';
import { nowIso, clampInt } from '../lib/util.js';
import { ISSUE_TYPES, ISSUE_CODES, buildModerationContext, analyzeProduct } from '../lib/product-moderation.js';

const r = Router();

const normSearch = (s) => String(s || '')
  .toLowerCase()
  .replace(/[\u064B-\u065F\u0640]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .trim();

function loadAllProductsForAdmin() {
  return q.all(`
    SELECT p.*,
      s.slug AS store_slug, s.name_ar AS store_name, s.phone AS store_phone, s.whatsapp AS store_whatsapp, s.status AS store_status, s.departments AS store_departments,
      u.name AS owner_name,
      c.name_ar AS category_name_ar, c.name_en AS category_name_en,
      (SELECT COUNT(*) FROM product_media pm WHERE pm.product_id = p.id) AS photo_count,
      (SELECT pm.media_id FROM product_media pm WHERE pm.product_id = p.id ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1) AS primary_media_id,
      (SELECT m.quality FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1) AS primary_quality,
      (SELECT MIN(m.quality) FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id AND m.quality IS NOT NULL) AS min_quality,
      (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variant_count
    FROM products p
    JOIN stores s ON s.id = p.store_id
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.created_at DESC, p.id DESC
  `);
}

function serializeAdminProductRow(p, ctx, mod, mediaLookup) {
  const modaItem = p.moda_key ? ctx.K.items.get(p.moda_key) : null;
  return {
    id: p.id,
    slug: p.slug,
    name_ar: p.name_ar,
    name_en: p.name_en,
    description_ar: p.description_ar || '',
    price: p.price,
    compare_at_price: p.compare_at_price,
    sku: p.sku || '',
    barcode: p.barcode || '',
    status: p.status,
    featured: Boolean(p.featured),
    track_stock: Boolean(p.track_stock),
    stock: p.stock,
    stock_status: stockStatus(p),
    sold_count: p.sold_count || 0,
    views: p.views || 0,
    variant_count: p.variant_count || 0,
    sizes: json(p.sizes_json, []),
    department: p.department || '',
    department_label: p.department ? ctx.labelOf(p.department) : '',
    category_id: p.category_id || null,
    category_name: p.category_name_ar || p.category_name_en || '',
    audience: p.audience || '',
    moda_key: p.moda_key || '',
    moda_label: modaItem?.ar || '',
    created_at: p.created_at,
    updated_at: p.updated_at,
    photo_count: p.photo_count || 0,
    primary_quality: p.primary_quality,
    min_quality: p.min_quality,
    image: p.primary_media_id ? (mediaLookup.get(p.primary_media_id) || null) : null,
    store: {
      id: p.store_id,
      slug: p.store_slug,
      name_ar: p.store_name,
      owner_name: p.owner_name || '',
      phone: p.store_phone || '',
      whatsapp: p.store_whatsapp || p.store_phone || '',
      status: p.store_status,
    },
    moderation: {
      reviewStatus: mod.reviewStatus,
      reviewNote: p.admin_review_note || '',
      reviewedAt: p.admin_reviewed_at || null,
      manualFlags: json(p.admin_flags_json, []),
      needsReview: mod.needsReview,
      hasIssues: mod.hasIssues,
      hasMajorIssues: mod.hasMajorIssues,
      majorIssueCount: mod.majorIssueCount,
      issues: mod.issues,
      suggestedDepartment: mod.suggestedDepartment,
      suggestedModa: mod.suggestedModa,
      suggestedAudience: mod.suggestedAudience,
    },
  };
}

/**
 * Helper used by /api/admin/notifications to show the badge count of products with major issues / needing attention.
 */
export function countProductsWithIssues() {
  try {
    const ctx = buildModerationContext();
    const rows = q.all(`
      SELECT p.id, p.name_ar, p.name_en, p.description_ar, p.description_en, p.department, p.category_id, p.audience, p.moda_key,
        p.sizes_json, p.admin_review_status, p.admin_flags_json, s.departments AS store_departments,
        (SELECT COUNT(*) FROM product_media pm WHERE pm.product_id = p.id) AS photo_count,
        (SELECT m.quality FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1) AS primary_quality,
        (SELECT MIN(m.quality) FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id AND m.quality IS NOT NULL) AS min_quality,
        (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variant_count
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.status <> 'archived' AND s.status = 'active'
    `);
    let count = 0;
    for (const r2 of rows) {
      const mod = analyzeProduct(r2, ctx);
      if (mod.reviewStatus !== 'approved' && (mod.hasMajorIssues || mod.reviewStatus === 'flagged')) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * GET /api/admin/products
 * Lists all products across all stores with rich filtering, search, store owner stats, and quality moderation flags.
 */
r.get('/products', h((req, res) => {
  const {
    tab = 'all',
    issue = '',
    store = '',
    department = '',
    status = 'all',
    days = '',
    q: searchTerm = '',
    sort = 'newest',
  } = req.query;

  const ctx = buildModerationContext();
  const allRows = loadAllProductsForAdmin();
  const allStores = q.all(`
    SELECT s.id, s.slug, s.name_ar, s.phone, s.whatsapp, s.status, u.name AS owner_name
    FROM stores s LEFT JOIN users u ON u.id = s.owner_id
    ORDER BY s.name_ar
  `);

  const storeStats = new Map(allStores.map((s) => [s.slug, {
    id: s.id,
    slug: s.slug,
    name_ar: s.name_ar,
    owner_name: s.owner_name || '',
    phone: s.phone || '',
    whatsapp: s.whatsapp || s.phone || '',
    status: s.status,
    total_products: 0,
    issue_products: 0,
    needs_review_count: 0,
  }]));

  const analyzed = allRows.map((row) => {
    const mod = analyzeProduct(row, ctx);
    const st = storeStats.get(row.store_slug);
    if (st && row.status !== 'archived') {
      st.total_products++;
      if (mod.hasMajorIssues || mod.reviewStatus === 'flagged') st.issue_products++;
      if (mod.needsReview) st.needs_review_count++;
    }
    return { row, mod };
  });

  // Apply store, department, status, days, and search filters first so tab & issue counts reflect the active filter context
  const term = normSearch(searchTerm);
  const daysNum = [1, 3, 7, 14, 30, 90].includes(Number(days)) ? Number(days) : 0;
  const sinceIso = daysNum ? new Date(Date.now() - daysNum * 864e5).toISOString().slice(0, 19).replace('T', ' ') : null;

  const baseFiltered = analyzed.filter(({ row }) => {
    if (status === 'all') {
      if (row.status === 'archived') return false;
    } else if (status === 'out_of_stock') {
      if (row.status === 'archived' || !row.track_stock || row.stock > 0) return false;
    } else if (['active', 'draft', 'archived'].includes(String(status))) {
      if (row.status !== status) return false;
    }
    if (store && row.store_slug !== store) return false;
    if (department) {
      if (department === '__none__') {
        if (row.department && ctx.deptsBySlug.get(row.department)?.active) return false;
      } else {
        const chain = row.department ? ctx.chainOf(row.department) : [];
        if (!chain.includes(String(department))) return false;
      }
    }
    if (sinceIso && String(row.created_at || '') < sinceIso) return false;
    if (term) {
      const idMatch = term.replace(/^#/, '') === String(row.id);
      const hay = normSearch(`${row.name_ar} ${row.name_en} ${row.sku || ''} ${row.barcode || ''} ${row.store_name} ${row.owner_name || ''} ${row.department || ''}`);
      if (!idMatch && !hay.includes(term)) return false;
    }
    return true;
  });

  // Compute tab counts and issue counts on baseFiltered
  const counts = {
    all: baseFiltered.length,
    needs_review: 0,
    issues: 0,
    unreviewed: 0,
    approved: 0,
    flagged: 0,
  };
  const issueCounts = Object.fromEntries(ISSUE_CODES.map((c) => [c, 0]));

  for (const { row, mod } of baseFiltered) {
    if (mod.needsReview) counts.needs_review++;
    if (mod.hasMajorIssues || mod.reviewStatus === 'flagged') counts.issues++;
    if (mod.reviewStatus === 'pending') counts.unreviewed++;
    if (mod.reviewStatus === 'approved') counts.approved++;
    if (mod.reviewStatus === 'flagged' || row.status === 'draft') counts.flagged++;
    for (const ic of mod.issueCodes) {
      if (issueCounts[ic] !== undefined) issueCounts[ic]++;
    }
  }

  // Filter by tab and specific issue
  const finalFiltered = baseFiltered.filter(({ row, mod }) => {
    if (tab === 'needs_review' && !mod.needsReview) return false;
    if (tab === 'issues' && !(mod.hasMajorIssues || mod.reviewStatus === 'flagged')) return false;
    if (tab === 'unreviewed' && mod.reviewStatus !== 'pending') return false;
    if (tab === 'approved' && mod.reviewStatus !== 'approved') return false;
    if (tab === 'flagged' && !(mod.reviewStatus === 'flagged' || row.status === 'draft')) return false;
    if (issue && ISSUE_CODES.includes(String(issue)) && !mod.issueCodes.includes(String(issue))) return false;
    return true;
  });

  // Sort
  finalFiltered.sort((a, b) => {
    if (sort === 'oldest') return String(a.row.created_at).localeCompare(String(b.row.created_at)) || (a.row.id - b.row.id);
    if (sort === 'issues_desc') {
      const diff = (b.mod.majorIssueCount * 10 + b.mod.issues.length) - (a.mod.majorIssueCount * 10 + a.mod.issues.length);
      if (diff !== 0) return diff;
    }
    if (sort === 'quality_asc') {
      const qa = a.row.photo_count === 0 ? -1 : (a.row.primary_quality ?? 100);
      const qb = b.row.photo_count === 0 ? -1 : (b.row.primary_quality ?? 100);
      if (qa !== qb) return qa - qb;
    }
    if (sort === 'price_asc') return (a.row.price - b.row.price) || (b.row.id - a.row.id);
    if (sort === 'price_desc') return (b.row.price - a.row.price) || (b.row.id - a.row.id);
    return String(b.row.created_at).localeCompare(String(a.row.created_at)) || (b.row.id - a.row.id);
  });

  const limit = clampInt(req.query.limit, 1, 100, 30);
  const page = clampInt(req.query.page, 1, 1000, 1);
  const total = finalFiltered.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const slice = finalFiltered.slice((page - 1) * limit, page * limit);

  const mediaLookup = mediaMap(slice.map((x) => x.row.primary_media_id).filter(Boolean));
  const items = slice.map(({ row, mod }) => serializeAdminProductRow(row, ctx, mod, mediaLookup));

  const modaTypes = [...ctx.K.items.entries()]
    .filter(([, item]) => !item.virtual)
    .map(([key, item]) => ({ key, label: item.ar, family: item.family }));

  res.json({
    items,
    total,
    page,
    pages,
    counts,
    issueCounts,
    issueTypes: ISSUE_TYPES,
    stores: [...storeStats.values()],
    audiences: AUDIENCES,
    modaTypes,
  });
}));

/**
 * GET /api/admin/products/:id
 * Detailed product view for the Admin Edit & Moderation drawer.
 */
r.get('/products/:id', h((req, res) => {
  const pid = Number(req.params.id);
  const row = q.get(`
    SELECT p.*,
      s.slug AS store_slug, s.name_ar AS store_name, s.phone AS store_phone, s.whatsapp AS store_whatsapp, s.status AS store_status, s.departments AS store_departments,
      u.name AS owner_name,
      c.name_ar AS category_name_ar, c.name_en AS category_name_en,
      (SELECT COUNT(*) FROM product_media pm WHERE pm.product_id = p.id) AS photo_count,
      (SELECT pm.media_id FROM product_media pm WHERE pm.product_id = p.id ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1) AS primary_media_id,
      (SELECT m.quality FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1) AS primary_quality,
      (SELECT MIN(m.quality) FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id AND m.quality IS NOT NULL) AS min_quality,
      (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variant_count
    FROM products p
    JOIN stores s ON s.id = p.store_id
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `, [pid]);
  if (!row) throw new AppError(404, 'not_found', 'المنتج غير موجود.');

  const ctx = buildModerationContext();
  const mod = analyzeProduct(row, ctx);

  const mediaRows = q.all(`
    SELECT m.*, pm.is_primary, pm.position
    FROM product_media pm
    JOIN media m ON m.id = pm.media_id
    WHERE pm.product_id = ?
    ORDER BY pm.is_primary DESC, pm.position ASC
  `, [pid]);

  const variants = q.all('SELECT id, color, size, sku, barcode, stock FROM variants WHERE product_id = ? ORDER BY id', [pid]);
  const storeCategories = q.all('SELECT id, slug, name_ar, name_en, parent_id, system FROM categories WHERE store_id = ? ORDER BY sort, id', [row.store_id]);
  const mediaLookup = mediaMap(row.primary_media_id ? [row.primary_media_id] : []);

  res.json({
    product: {
      ...serializeAdminProductRow(row, ctx, mod, mediaLookup),
      description_en: row.description_en || '',
      cost: row.cost,
      colors: json(row.colors_json, []),
      material_ar: row.material_ar || '',
      care_ar: row.care_ar || '',
      seo_title: row.seo_title || '',
      seo_description: row.seo_description || '',
      media: mediaRows.map((m) => ({
        ...serializeMedia(m),
        quality: m.quality,
        is_primary: Boolean(m.is_primary),
        position: m.position,
      })),
      variants,
      store_categories: storeCategories,
      store_departments: decodeDepartments(row.store_departments),
    },
  });
}));

const adminPatchSchema = z.object({
  name_ar: z.string().trim().min(2).max(120).optional(),
  name_en: z.string().trim().max(120).optional(),
  description_ar: z.string().trim().max(4000).optional(),
  description_en: z.string().trim().max(4000).optional(),
  price: z.coerce.number().int().min(1).max(1_000_000).optional(),
  compare_at_price: z.union([z.coerce.number().int().min(0).max(1_000_000), z.null()]).optional(),
  stock: z.coerce.number().int().min(0).max(100000).optional(),
  track_stock: z.boolean().optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
  featured: z.boolean().optional(),
  department: z.string().trim().max(40).nullable().optional(),
  category_id: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  audience: z.string().trim().max(20).nullable().optional(),
  moda_key: z.string().trim().max(80).nullable().optional(),
  variants_stock: z.array(z.object({ id: z.coerce.number().int().positive(), stock: z.coerce.number().int().min(0).max(100000) })).max(200).optional(),
  remove_media_ids: z.array(z.coerce.number().int().positive()).max(30).optional(),
  primary_media_id: z.coerce.number().int().positive().nullable().optional(),
  review_status: z.enum(['approved', 'flagged', 'pending']).optional(),
  review_note: z.string().trim().max(500).nullable().optional(),
  admin_flags: z.array(z.enum(ISSUE_CODES)).max(10).optional(),
});

function assignStoreDepartmentAndCategory(storeId, deptSlug, currentCategoryId) {
  if (!deptSlug) return { department: null, category_id: currentCategoryId };
  const dep = q.get('SELECT slug, active FROM departments WHERE slug = ?', [deptSlug]);
  if (!dep || !dep.active) throw badRequest('invalid_department', 'اختار قسم مفعّل على المنصة.');
  const currentStoreDepts = decodeDepartments(q.val('SELECT departments FROM stores WHERE id = ?', [storeId]));
  if (!currentStoreDepts.includes(deptSlug)) {
    const nextDepts = [...currentStoreDepts, deptSlug];
    q.run('UPDATE stores SET departments = ? WHERE id = ?', [encodeDepartments(nextDepts), storeId]);
  }
  ensureDeptCategories(storeId, [deptSlug]);
  const catSlug = deptSlug.replace(/_/g, '-');
  const matchingCat = q.get('SELECT id FROM categories WHERE store_id = ? AND slug = ?', [storeId, catSlug]);
  return {
    department: deptSlug,
    category_id: matchingCat ? matchingCat.id : currentCategoryId,
  };
}

/**
 * PATCH /api/admin/products/:id
 * Edit product details, photos, taxonomy, and moderation state directly from Twist Admin.
 */
r.patch('/products/:id', h(async (req, res) => {
  const pid = Number(req.params.id);
  const p = q.get('SELECT * FROM products WHERE id = ?', [pid]);
  if (!p) throw new AppError(404, 'not_found', 'المنتج غير موجود.');

  const body = adminPatchSchema.parse(req.body || {});
  const nextPrice = body.price ?? p.price;
  const nextCompare = body.compare_at_price === undefined ? p.compare_at_price : (body.compare_at_price || null);
  if (nextCompare && nextCompare <= nextPrice) {
    throw new AppError(422, 'validation_failed', 'السعر قبل الخصم لازم يكون أكبر من السعر الحالي.', { compare_at_price: 'compare_gt_price' });
  }

  if (body.moda_key) {
    const item = loadKnowledge().items.get(body.moda_key);
    if (!item || item.virtual) throw badRequest('invalid_moda_type', 'نوع القطعة غير صالح في قاموس تويلا.');
  }

  const now = nowIso();
  const unattachedMediaToDelete = [];

  tx(() => {
    const patch = { updated_at: now };
    if (body.name_ar !== undefined) {
      patch.name_ar = body.name_ar;
      if (!p.name_en || p.name_en === p.name_ar) patch.name_en = body.name_en || body.name_ar;
    }
    if (body.name_en !== undefined) patch.name_en = body.name_en || body.name_ar || p.name_ar;
    if (body.description_ar !== undefined) patch.description_ar = body.description_ar;
    if (body.description_en !== undefined) patch.description_en = body.description_en;
    if (body.price !== undefined) patch.price = body.price;
    if (body.compare_at_price !== undefined) patch.compare_at_price = body.compare_at_price || null;
    if (body.track_stock !== undefined) patch.track_stock = body.track_stock ? 1 : 0;
    if (body.status !== undefined) patch.status = body.status;
    if (body.featured !== undefined) patch.featured = body.featured ? 1 : 0;
    if (body.audience !== undefined) patch.audience = body.audience && AUDIENCE_KEYS.has(body.audience) ? body.audience : null;
    if (body.moda_key !== undefined) patch.moda_key = body.moda_key || null;

    if (body.department !== undefined) {
      if (body.department) {
        const assigned = assignStoreDepartmentAndCategory(p.store_id, body.department, p.category_id);
        patch.department = assigned.department;
        if (body.category_id === undefined && assigned.category_id) patch.category_id = assigned.category_id;
      } else {
        patch.department = null;
      }
    }
    if (body.category_id !== undefined) {
      if (body.category_id && !q.val('SELECT id FROM categories WHERE id = ? AND store_id = ?', [body.category_id, p.store_id])) {
        throw badRequest('invalid_category', 'القسم الداخلي غير موجود في هذا المحل.');
      }
      patch.category_id = body.category_id || null;
    }

    // Handle variant stocks or single stock
    const hasVariants = q.val('SELECT COUNT(*) FROM variants WHERE product_id = ?', [pid]) > 0;
    if (body.variants_stock?.length && hasVariants) {
      for (const vs of body.variants_stock) {
        q.run('UPDATE variants SET stock = ? WHERE id = ? AND product_id = ?', [vs.stock, vs.id, pid]);
      }
      patch.stock = q.val('SELECT COALESCE(SUM(stock), 0) FROM variants WHERE product_id = ?', [pid]) || 0;
    } else if (body.stock !== undefined && !hasVariants) {
      patch.stock = body.stock;
    }

    // Handle removing bad/irrelevant photos
    if (body.remove_media_ids?.length) {
      for (const mid of body.remove_media_ids) {
        q.run('DELETE FROM product_media WHERE product_id = ? AND media_id = ?', [pid, mid]);
        const stillUsed = q.val('SELECT COUNT(*) FROM product_media WHERE media_id = ?', [mid]);
        if (!stillUsed) {
          const m = getMedia(mid);
          if (m) unattachedMediaToDelete.push(m);
        }
      }
    }

    // Ensure a primary photo is set if photos remain
    const remainingMedia = q.all('SELECT media_id, is_primary FROM product_media WHERE product_id = ? ORDER BY is_primary DESC, position ASC', [pid]);
    if (remainingMedia.length) {
      const targetPrimary = (body.primary_media_id && remainingMedia.some((m) => m.media_id === body.primary_media_id))
        ? body.primary_media_id
        : (remainingMedia.find((m) => m.is_primary)?.media_id || remainingMedia[0].media_id);
      q.run('UPDATE product_media SET is_primary = CASE WHEN media_id = ? THEN 1 ELSE 0 END WHERE product_id = ?', [targetPrimary, pid]);
    }

    // Moderation fields
    if (body.review_status !== undefined) {
      patch.admin_review_status = body.review_status === 'pending' ? null : body.review_status;
      patch.admin_reviewed_at = body.review_status === 'pending' ? null : now;
      if (body.review_status === 'approved' && body.admin_flags === undefined) {
        patch.admin_flags_json = null;
      }
    }
    if (body.review_note !== undefined) {
      patch.admin_review_note = body.review_note || null;
    }
    if (body.admin_flags !== undefined) {
      patch.admin_flags_json = body.admin_flags.length ? JSON.stringify([...new Set(body.admin_flags)]) : null;
    }

    update('products', pid, patch);
  });

  for (const m of unattachedMediaToDelete) {
    try { await deleteMedia(m); } catch { /* ignore */ }
  }

  if (body.price !== undefined && body.price < p.price) notifyPriceDrop(pid, p.price, body.price);
  const updatedRow = q.get('SELECT * FROM products WHERE id = ?', [pid]);
  if (p.track_stock && p.stock <= 0 && updatedRow.stock > 0) notifyBackInStock(pid);
  if ((body.review_note && body.review_note !== p.admin_review_note) || (body.review_status === 'flagged' && p.admin_review_status !== 'flagged')) {
    notifyStore(p.store_id, {
      title: `ملاحظة من إدارة Twist على «${updatedRow.name_ar}» 💬`,
      body: updatedRow.admin_review_note || 'يرجى مراجعة وتعديل بيانات أو صور هذا المنتج من لوحة التحكم.',
      url: `/dashboard/products/${pid}`,
      tag: `mod-${pid}`,
    });
  }
  invalidateModaCatalogue();
  triggerReindex();

  const ctx = buildModerationContext();
  const fullRow = q.get(`
    SELECT p.*,
      s.slug AS store_slug, s.name_ar AS store_name, s.phone AS store_phone, s.whatsapp AS store_whatsapp, s.status AS store_status, s.departments AS store_departments,
      u.name AS owner_name,
      c.name_ar AS category_name_ar, c.name_en AS category_name_en,
      (SELECT COUNT(*) FROM product_media pm WHERE pm.product_id = p.id) AS photo_count,
      (SELECT pm.media_id FROM product_media pm WHERE pm.product_id = p.id ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1) AS primary_media_id,
      (SELECT m.quality FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1) AS primary_quality,
      (SELECT MIN(m.quality) FROM product_media pm JOIN media m ON m.id = pm.media_id WHERE pm.product_id = p.id AND m.quality IS NOT NULL) AS min_quality,
      (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variant_count
    FROM products p
    JOIN stores s ON s.id = p.store_id
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `, [pid]);
  const mod = analyzeProduct(fullRow, ctx);
  const mediaLookup = mediaMap(fullRow.primary_media_id ? [fullRow.primary_media_id] : []);

  res.json({ product: serializeAdminProductRow(fullRow, ctx, mod, mediaLookup) });
}));

/**
 * POST /api/admin/products/bulk
 * Bulk moderation / department assignment / status updates across selected products.
 */
r.post('/products/bulk', h((req, res) => {
  const body = z.object({
    ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
    action: z.enum(['approve', 'flag', 'set_status', 'set_department', 'apply_suggested_department']),
    status: z.enum(['active', 'draft', 'archived']).optional(),
    department: z.string().trim().max(40).optional(),
    flag: z.enum(ISSUE_CODES).optional(),
    note: z.string().trim().max(500).optional(),
  }).parse(req.body || {});

  const ctx = buildModerationContext();
  const now = nowIso();
  let updated = 0;

  tx(() => {
    for (const id of body.ids) {
      const p = q.get('SELECT p.*, s.departments AS store_departments FROM products p JOIN stores s ON s.id = p.store_id WHERE p.id = ?', [id]);
      if (!p) continue;
      if (body.action === 'approve') {
        update('products', id, { admin_review_status: 'approved', admin_reviewed_at: now, admin_flags_json: null, updated_at: now });
        updated++;
      } else if (body.action === 'flag') {
        const curFlags = new Set(json(p.admin_flags_json, []));
        if (body.flag) curFlags.add(body.flag);
        update('products', id, {
          admin_review_status: 'flagged',
          admin_reviewed_at: now,
          admin_flags_json: curFlags.size ? JSON.stringify([...curFlags]) : p.admin_flags_json,
          ...(body.note ? { admin_review_note: body.note } : {}),
          ...(body.status ? { status: body.status } : {}),
          updated_at: now,
        });
        updated++;
      } else if (body.action === 'set_status' && body.status) {
        update('products', id, { status: body.status, updated_at: now });
        updated++;
      } else if (body.action === 'set_department' && body.department) {
        const assigned = assignStoreDepartmentAndCategory(p.store_id, body.department, p.category_id);
        update('products', id, { department: assigned.department, category_id: assigned.category_id, updated_at: now });
        updated++;
      } else if (body.action === 'apply_suggested_department') {
        const mod = analyzeProduct(p, ctx);
        if (mod.suggestedDepartment?.slug) {
          const assigned = assignStoreDepartmentAndCategory(p.store_id, mod.suggestedDepartment.slug, p.category_id);
          update('products', id, {
            department: assigned.department,
            category_id: assigned.category_id,
            ...(mod.suggestedModa?.key && !p.moda_key ? { moda_key: mod.suggestedModa.key } : {}),
            ...(mod.suggestedAudience && !p.audience ? { audience: mod.suggestedAudience } : {}),
            updated_at: now,
          });
          updated++;
        }
      }
    }
  });

  if (updated > 0) {
    invalidateModaCatalogue();
    triggerReindex();
  }
  res.json({ ok: true, updated });
}));

/**
 * DELETE /api/admin/products/:id
 * Deletes a product (or soft-archives it if it has past order items).
 */
r.delete('/products/:id', h(async (req, res) => {
  const pid = Number(req.params.id);
  const p = q.get('SELECT * FROM products WHERE id = ?', [pid]);
  if (!p) throw new AppError(404, 'not_found', 'المنتج غير موجود.');
  const hasOrders = q.val('SELECT COUNT(*) FROM order_items WHERE product_id = ?', [pid]);
  if (hasOrders) {
    q.run("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?", [nowIso(), pid]);
    invalidateModaCatalogue();
    return res.json({ archived: true, deleted: false });
  }
  const mediaIds = q.all('SELECT media_id FROM product_media WHERE product_id = ?', [pid]).map((x) => x.media_id);
  q.run('DELETE FROM products WHERE id = ?', [pid]);
  for (const mid of mediaIds) {
    if (!q.val('SELECT COUNT(*) FROM product_media WHERE media_id = ?', [mid])) {
      const m = getMedia(mid);
      if (m) { try { await deleteMedia(m); } catch { /* ignore */ } }
    }
  }
  invalidateModaCatalogue();
  res.json({ archived: false, deleted: true });
}));

export default r;
