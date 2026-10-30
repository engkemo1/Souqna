import { q, insert } from '../../db/index.js';
import { nowIso } from '../util.js';

const FIELDS = ['name_ar', 'name_en', 'description_ar', 'description_en', 'type', 'status', 'priority', 'stacking', 'stack_with_coupons', 'starts_at', 'ends_at', 'daily_from', 'daily_to', 'days_mask',
  'usage_limit', 'per_customer_limit', 'audience', 'audience_phones_json', 'image_mode', 'image_category', 'image_media_id', 'template_key', 'rules_json'];
export const snapshot = (row) => Object.fromEntries(FIELDS.map((f) => [f, row?.[f] ?? null]));

/** Names of the fields that differ between two snapshots ('rules_json' is reported as 'rules'). */
export const changedFields = (a, b) => FIELDS.filter((f) => String(a[f] ?? '') !== String(b[f] ?? '')).map((f) => (f === 'rules_json' ? 'rules' : f));

export function logAudit(req, { promotionId, name, action, detail }) {
  insert('promotion_audit', {
    store_id: req.store.id, promotion_id: promotionId ?? null, promotion_name: name || null, action,
    actor_id: req.user?.id ?? null, actor_name: req.user?.name || null, detail_json: detail ? JSON.stringify(detail) : null, created_at: nowIso(),
  });
}

export const history = (storeId, { promotionId = null, limit = 100 } = {}) => q.all(
  `SELECT * FROM promotion_audit WHERE store_id=? ${promotionId ? 'AND promotion_id=?' : ''} ORDER BY id DESC LIMIT ?`,
  promotionId ? [storeId, promotionId, limit] : [storeId, limit],
).map((r) => ({ id: r.id, promotionId: r.promotion_id, name: r.promotion_name, action: r.action, actor: r.actor_name, detail: r.detail_json ? JSON.parse(r.detail_json) : null, at: r.created_at }));
