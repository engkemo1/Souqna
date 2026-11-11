/**
 * قاعدة معلومات تويلا: بتجمّع من القاعدة الحقيقية كل اللي نعرفه عن المنتجات والمحلات اللي الكلام بيخصها،
 * وبتديها للعقل كـ«حقائق». العقل ممنوع يجاوب عن منتج/محل بحاجة مش مكتوبة هنا، ولو السؤال برّه الحقائق يقول إنه مش متأكد.
 * مفيش أسعار هنا (السعر بيظهر في الكارت) عشان الحارس ما يشيلش الرد.
 */
import { keywordSearch } from './search.js';

const J = (s, d) => { if (s && typeof s === 'object') return s; try { return JSON.parse(s || ''); } catch { return d; } };
const clip = (s, n = 220) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const AI_LABELS = { material_look: 'شكل الخامة', sleeves: 'الكم', neckline: 'الياقة', length: 'الطول', pattern: 'النقشة', fit: 'القصّة', season: 'الموسم', formality: 'الرسمية' };
const AUD = { men: 'رجالي', women: 'حريمي', boys: 'ولادي', girls: 'بناتي', kids: 'أطفال', unisex: 'للجنسين' };

/** سطر حقائق لمنتج واحد. كل حقل ناقص بيتكتب «مش مسجل» عشان العقل يعرف إنه مجهول مش يخمّن. */
export function productFacts(p, storeName = '') {
  if (!p) return '';
  const sizes = J(p.sizes_json, p.sizes || []);
  const colors = J(p.colors_json, p.colors || []);
  const attrs = J(p.attrs_json, p.attrs || {});
  // تحليل الصورة بالذكاء الاصطناعي (جدول منفصل). بيانات المحل بتكسب عليه، وممكن يتقفل بـ MODA_AI_FACTS=0
  const aiRaw = process.env.MODA_AI_FACTS === '0' ? null : J(p.ai_json, null);
  const ai = aiRaw && typeof aiRaw === 'object' ? Object.fromEntries(Object.entries(aiRaw).filter(([k, v]) => AI_LABELS[k] && v && !(k === 'material_look' && String(p.material_ar || p.material || '').trim()))) : null;
  const plain = Object.entries(attrs || {}).filter(([k, v]) => v != null && v !== '' && (typeof v !== 'object' || (Array.isArray(v) && v.length)))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : v}`).slice(0, 10).join('، ');
  const stock = p.track_stock === 0 || p.trackStock === false ? 'متاح' : (Number(p.stock ?? p.stockCount) > 0 ? 'متاح' : 'خلصان');
  const parts = [
    `«${clip(p.name_ar || p.name, 90)}»`,
    `المحل: ${clip(storeName || p.store_name_ar || p.store?.name, 60) || 'مش مسجل'}`,
    `الفئة: ${AUD[p.gender || p.audience] || 'مش مسجل'}`,
    `الخامة: ${clip(p.material_ar || p.material, 120) || 'مش مسجلة من المحل'}`,
    `العناية: ${clip(p.care_ar || p.care, 120) || 'مش مسجلة'}`,
    `الوصف: ${clip(p.description_ar || p.description, 260) || 'مفيش وصف'}`,
    `المقاسات: ${Array.isArray(sizes) && sizes.length ? sizes.slice(0, 12).join('، ') : 'مش مسجلة'}`,
    `الألوان: ${Array.isArray(colors) && colors.length ? colors.map((c) => (typeof c === 'object' ? (c.name_ar || c.name || c.ar || c.hex) : c)).slice(0, 8).join('، ') : 'مش مسجلة'}`,
    `المخزون: ${stock}`,
    Number(p.no_return ?? p.noReturn) ? 'القطعة دي مش بترجع' : '',
    plain ? `مواصفات: ${plain}` : '',
    ai && Object.keys(ai).length ? `من تحليل الصورة (تقدير مش مؤكد من المحل): ${Object.entries(ai).map(([k, v]) => `${AI_LABELS[k]}=${clip(v, 40)}`).join('، ')}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

/** سطر حقائق لمحل. */
export function storeFacts(s) {
  if (!s) return '';
  const hours = s.hours ? (typeof s.hours === 'string' ? s.hours : JSON.stringify(s.hours)) : '';
  return [
    `محل «${clip(s.name_ar, 60)}»`,
    s.address_ar ? `العنوان: ${clip(s.address_ar, 120)}` : 'العنوان: مش مسجل',
    s.phone || s.whatsapp ? `التليفون/واتساب: ${[s.phone, s.whatsapp].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}` : 'التليفون: مش مسجل',
    hours ? `المواعيد: ${clip(hours, 160)}` : 'المواعيد: مش مسجلة',
    s.return_days != null ? `الاستبدال/الاسترجاع: ${s.return_days} أيام من الاستلام` : '',
    s.map_url ? 'له لوكيشن على الخريطة في صفحة المحل' : '',
  ].filter(Boolean).join(' | ');
}

/** يبني كتلة الحقائق للدور الحالي: القطع المعروضة + القطع المذكورة في الرسالة + محلاتهم. */
export function buildKb({ products = [], lookItems = [], stores = [], text = '', contact = null, limit = 8 } = {}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const picked = [];
  const seen = new Set();
  const add = (p) => { if (p && !seen.has(p.id) && picked.length < limit) { seen.add(p.id); picked.push(p); } };
  for (const it of lookItems || []) add(byId.get(it.id ?? it.productId));
  let hits = [];
  try { hits = text ? keywordSearch(text, products, { limit: 3 }) : []; } catch { hits = []; }
  hits.forEach(add);
  const storeBySlug = new Map((stores || []).map((s) => [s.slug, s]));
  const storeLines = [];
  const storeSeen = new Set();
  for (const p of picked) {
    const s = storeBySlug.get(p.store_slug);
    if (s && !storeSeen.has(s.slug)) { storeSeen.add(s.slug); storeLines.push(storeFacts(s)); }
  }
  const lines = [];
  if (picked.length) lines.push('المنتجات المعروضة/المذكورة دلوقتي:\n' + picked.map((p, i) => `${i + 1}) ${productFacts(p, storeBySlug.get(p.store_slug)?.name_ar)}`).join('\n'));
  if (storeLines.length) lines.push('محلاتها:\n' + storeLines.join('\n'));
  if (contact && (contact.phone || contact.whatsapp)) lines.push(`دعم Twist: ${[contact.phone, contact.whatsapp].filter(Boolean).join(' / ')}`);
  return lines.join('\n');
}
