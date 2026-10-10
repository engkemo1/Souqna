import { q } from '../db/index.js';
import { AppError } from './errors.js';
import { json } from '../db/index.js';

export const listDepartments = ({ all = false } = {}) =>
  q.all(`SELECT d.*, (SELECT COUNT(*) FROM stores s WHERE s.departments LIKE '%,' || d.slug || ',%') AS stores_count
         FROM departments d ${all ? '' : 'WHERE d.active=1'} ORDER BY d.sort, d.id`)
    .map((d) => ({ id: d.id, slug: d.slug, name: { ar: d.name_ar, en: d.name_en }, name_ar: d.name_ar, name_en: d.name_en, sizes: json(d.sizes_json, []), sort: d.sort, active: !!d.active, stores_count: d.stores_count }));

/** Throws a field error unless every slug is an active department. */
export function assertDepartments(list) {
  const ok = new Set(q.all('SELECT slug FROM departments WHERE active=1').map((d) => d.slug));
  if (!Array.isArray(list) || !list.length || !list.every((d) => ok.has(d))) throw new AppError(422, 'validation_failed', 'Pick at least one valid department.', { departments: 'departments_required' });
}
