import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Package, AlertTriangle, CheckCircle2, Clock, Store as StoreIcon, Camera, Sparkles, Pencil, Trash2,
  ExternalLink, MessageCircle, Eye, EyeOff, Star, Check, X, RefreshCw, ShieldAlert, Tags, Filter,
} from 'lucide-react';
import { PageHeader, FilterTabs, SearchInput, Pagination, KpiCard } from '../../components/dash/Kit.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Sheet, { ConfirmDialog } from '../../components/ui/Sheet.jsx';
import { Field, Input, Select, Textarea, Switch, Segmented } from '../../components/ui/Field.jsx';
import { QtyStepper } from '../../components/ui/Commerce.jsx';
import SmartImage from '../../components/ui/SmartImage.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDebounced } from '../../lib/hooks.js';
import { cx } from '../../components/ui/cx.js';
import { adminApi, useAdminApi, fmtMoney, fmtNum, fmtDateTime, useAdminDepartments, waLink } from './adminApi.js';

function fmtRelativeTime(sqlDate) {
  if (!sqlDate) return '';
  const ms = Date.parse(`${String(sqlDate).replace(' ', 'T')}Z`);
  if (!Number.isFinite(ms)) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 2) return 'لسه نازل حالاً';
  if (diffMin < 60) return `منذ ${fmtNum(diffMin)} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `منذ ${fmtNum(diffHr)} ساعة`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'منذ يوم';
  if (diffDays === 2) return 'منذ يومين';
  if (diffDays <= 10) return `منذ ${fmtNum(diffDays)} أيام`;
  return `منذ ${fmtNum(diffDays)} يوم`;
}

const QUALITY_BADGE = (q) => {
  if (q == null) return null;
  if (q >= 75) return { label: `جودة ممتازة (${q})`, cls: 'bg-emerald-500 text-white' };
  if (q >= 50) return { label: `جودة مقبولة (${q})`, cls: 'bg-amber-400 text-neutral-900' };
  return { label: `صورة ضعيفة (${q})`, cls: 'bg-red-600 text-white' };
};

const ISSUE_TONE = {
  critical: 'bg-red-50 text-red-800 ring-1 ring-red-200 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-500/30',
  warning: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30',
  info: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',
};

const STATUS_META = {
  active: { label: 'ظاهر في الموقع', tone: 'success' },
  draft: { label: 'موقوف من الظهور (مخفي)', tone: 'danger' },
  archived: { label: 'مؤرشف', tone: 'neutral' },
};

const REVIEW_META = {
  approved: { label: 'تمت المعاينة ✓', tone: 'success' },
  flagged: { label: 'فيه مشكلة ⚠️', tone: 'danger' },
  pending: { label: 'بانتظار المعاينة', tone: 'warning' },
};

const QUICK_NOTE_TEMPLATES = [
  'الصور المضافة ملهاش علاقة بالمنتج — يا ريت ترفع صور المنتج الحقيقية.',
  'جودة الصورة ضعيفة أو مش واضحة — يا ريت ترفع صورة بإضاءة أوضح.',
  'اسم المنتج مش واضح — يا ريت تكتب نوع القطعة واللون أو الخامة (مثال: فستان سهرة ستان كحلي).',
  'القسم المختار ملهوش علاقة بالمنتج — يا ريت تختار القسم الصحيح.',
  'يا ريت تضيف المقاسات المتاحة ووصف الخامة عشان العملاء تقدر تطلب.',
];

function buildWhatsAppModerationMessage(p, customNote, selectedFlags, issueTypes) {
  const storeName = p.store?.name_ar || 'المحل';
  const issueMap = new Map((issueTypes || []).map((i) => [i.code, i.label]));
  const reasons = [
    ...(p.moderation?.issues || []).map((i) => i.detail || i.label),
    ...(selectedFlags || []).map((c) => issueMap.get(c)).filter(Boolean),
  ];
  const uniqueReasons = [...new Set(reasons)];
  const editUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard/products/${p.id}` : `/dashboard/products/${p.id}`;
  const lines = [
    `أهلاً ${storeName} 👋،`,
    `بخصوص منتج «${p.name_ar}» على منصة Twist:`,
  ];
  if (customNote?.trim()) {
    lines.push(`\n💬 ملاحظة إدارة المنصة:\n${customNote.trim()}`);
  }
  if (uniqueReasons.length) {
    lines.push('\nالملاحظات المطلوب تعديلها:');
    uniqueReasons.forEach((r) => lines.push(`• ${r}`));
  }
  lines.push(`\nتقدر تدخل تعدّل المنتج مباشرة من لوحة تحكم المحل من هنا:\n${editUrl}`);
  return lines.join('\n');
}

function AdminNoteDialog({ product, onClose, onSaved, issueTypes }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [flags, setFlags] = useState([]);
  const [hideProduct, setHideProduct] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!product) return;
    setNote(product.moderation?.reviewNote || '');
    setFlags(product.moderation?.manualFlags || []);
    setHideProduct(product.status === 'draft');
  }, [product]);

  if (!product) return <Sheet open={false} onClose={onClose} />;

  const toggleFlag = (code) => {
    setFlags((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const appendTemplate = (tpl) => {
    setNote((prev) => (prev.trim() ? `${prev.trim()}\n${tpl}` : tpl));
  };

  const submit = async (sendWa = false) => {
    setBusy(sendWa ? 'wa' : 'save');
    try {
      const body = {
        review_note: note.trim() || null,
        admin_flags: flags,
        review_status: note.trim() || flags.length || hideProduct ? 'flagged' : 'pending',
        status: hideProduct ? 'draft' : product.status,
      };
      const res = await adminApi(`/products/${product.id}`, { method: 'PATCH', body });
      toast({
        title: hideProduct
          ? 'تم إرسال الكومنت للوحة المحل وإيقاف ظهور المنتج مؤقتاً ✅'
          : 'تم حفظ الكومنت وهيظهر لصاحب المحل على المنتج في لوحته ✅',
      });
      if (sendWa && product.store?.whatsapp) {
        const url = waLink(product.store.whatsapp, buildWhatsAppModerationMessage(product, note, flags, issueTypes));
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      onSaved(res.product);
      onClose();
    } catch (e) {
      toast({ tone: 'error', title: e.message || 'تعذر حفظ الكومنت' });
    }
    setBusy('');
  };

  return (
    <Sheet
      open={!!product}
      onClose={onClose}
      title={`كومنت لصاحب المحل: ${product.name_ar}`}
      description={`محل: ${product.store?.name_ar} ${product.store?.owner_name ? `(${product.store.owner_name})` : ''} — الكومنت هيظهرله فوراً في لوحة تحكم المحل على المنتج ده`}
      side="end"
      size="md"
      footer={(
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => submit(false)}
            loading={busy === 'save'}
            className="flex-1"
          >
            حفظ الكومنت في لوحة المحل ✓
          </Button>
          {product.store?.whatsapp && (
            <Button
              variant="outline"
              icon={MessageCircle}
              onClick={() => submit(true)}
              loading={busy === 'wa'}
              className="border-emerald-600/40 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200"
            >
              حفظ + إرسال واتساب للمحل 💬
            </Button>
          )}
        </div>
      )}
    >
      <div className="space-y-4 py-4">
        <Field
          label="اكتب الكومنت / التعديل المطلوب من صاحب المحل"
          hint="هيظهر لصاحب المحل في تنبيه واضح فوق المنتج في صفحة المنتجات وصفحة تعديل المنتج"
        >
          <Textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: يا ريت تغيّر الصورة التانية لأنها مش واضحة، وتكتب اسم الموديل والخامة بالتفصيل…"
          />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">جُمل سريعة جاهزة (اضغط لإضافتها في الكومنت):</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_NOTE_TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => appendTemplate(tpl)}
                className="rounded-xl border border-line bg-surface px-2.5 py-1.5 text-start text-xs font-medium hover:bg-fg/[0.05]"
              >
                + {tpl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">تحديد نوع المشكلة (تظهر كعلامات على المنتج):</p>
          <div className="flex flex-wrap gap-1.5">
            {(issueTypes || []).filter((it) => it.manual).map((it) => {
              const on = flags.includes(it.code);
              return (
                <button
                  key={it.code}
                  type="button"
                  onClick={() => toggleFlag(it.code)}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition',
                    on ? 'bg-red-600 text-white' : 'border border-line-strong bg-canvas text-fg hover:bg-fg/[0.05]',
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-3.5">
          <Switch
            checked={hideProduct}
            onChange={setHideProduct}
            label="إيقاف ظهور المنتج من الموقع لحد ما صاحب المحل يعدّله"
            description="لو فعّلت الاختيار ده، المنتج هيتحول لمخفي ومش هيظهر للعملاء غير لما يتعدل ويتراجع"
          />
        </div>
      </div>
    </Sheet>
  );
}

function AdminProductSheet({ productId, onClose, onSaved, depts, issueTypes, audiences, modaTypes }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAdminApi(productId ? `/products/${productId}` : null);
  const p = productId && data?.product?.id === productId ? data.product : null;

  const [form, setForm] = useState(null);
  const [varStocks, setVarStocks] = useState({});
  const [removedMedia, setRemovedMedia] = useState([]);
  const [primaryMediaId, setPrimaryMediaId] = useState(null);
  const [origPreview, setOrigPreview] = useState({});
  const [busy, setBusy] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!p) {
      setForm(null);
      return;
    }
    setForm({
      name_ar: p.name_ar || '',
      name_en: p.name_en || '',
      description_ar: p.description_ar || '',
      price: String(p.price ?? ''),
      compare_at_price: p.compare_at_price ? String(p.compare_at_price) : '',
      stock: Number(p.stock ?? 0),
      status: p.status || 'active',
      featured: Boolean(p.featured),
      department: p.department || '',
      category_id: p.category_id ? String(p.category_id) : '',
      audience: p.audience || '',
      moda_key: p.moda_key || '',
      review_note: p.moderation?.reviewNote || '',
      admin_flags: p.moderation?.manualFlags || [],
    });
    setVarStocks(Object.fromEntries((p.variants || []).map((v) => [v.id, v.stock])));
    setRemovedMedia([]);
    const prim = (p.media || []).find((m) => m.is_primary)?.id || p.media?.[0]?.id || null;
    setPrimaryMediaId(prim);
    setOrigPreview({});
  }, [p]);

  if (!productId) return <Sheet open={false} onClose={onClose} />;

  const activeDepts = depts.list.filter((d) => d.active);
  const visibleMedia = (p?.media || []).filter((m) => !removedMedia.includes(m.id));
  const hasVariants = (p?.variants || []).length > 0;

  const toggleFlag = (code) => {
    if (!form) return;
    const exists = form.admin_flags.includes(code);
    setForm({
      ...form,
      admin_flags: exists ? form.admin_flags.filter((c) => c !== code) : [...form.admin_flags, code],
    });
  };

  const removePhoto = (mid) => {
    const nextRemoved = [...removedMedia, mid];
    setRemovedMedia(nextRemoved);
    if (primaryMediaId === mid) {
      const rem = (p?.media || []).filter((m) => !nextRemoved.includes(m.id));
      setPrimaryMediaId(rem[0]?.id || null);
    }
  };

  const restorePhotos = () => {
    setRemovedMedia([]);
    const prim = (p?.media || []).find((m) => m.is_primary)?.id || p?.media?.[0]?.id || null;
    setPrimaryMediaId(prim);
  };

  const applySuggestion = () => {
    if (!p || !form) return;
    setForm({
      ...form,
      department: p.moderation?.suggestedDepartment?.slug || form.department,
      moda_key: p.moderation?.suggestedModa?.key || form.moda_key,
      audience: p.moderation?.suggestedAudience || form.audience,
    });
    toast({ title: 'تم اختيار التصنيف المقترح — اضغط حفظ للتأكيد' });
  };

  const save = async (mode = 'save') => {
    if (!p || !form) return;
    setBusy(mode);
    try {
      const body = {
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim() || form.name_ar.trim(),
        description_ar: form.description_ar.trim(),
        price: Number(form.price),
        compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        status: mode === 'flag_hide' ? 'draft' : form.status,
        featured: Boolean(form.featured),
        department: form.department || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        audience: form.audience || null,
        moda_key: form.moda_key || null,
        review_note: form.review_note.trim() || null,
        admin_flags: mode === 'approve' ? [] : form.admin_flags,
        remove_media_ids: removedMedia.length ? removedMedia : undefined,
        primary_media_id: primaryMediaId,
      };
      if (mode === 'approve') body.review_status = 'approved';
      else if (mode === 'flag_hide' || mode === 'flag') body.review_status = 'flagged';

      if (hasVariants) {
        body.variants_stock = p.variants.map((v) => ({ id: v.id, stock: Number(varStocks[v.id] ?? v.stock) }));
      } else {
        body.stock = Number(form.stock) || 0;
      }

      const res = await adminApi(`/products/${p.id}`, { method: 'PATCH', body });
      toast({
        title: mode === 'approve'
          ? 'تم حفظ التعديلات واعتماد معاينة المنتج ✅'
          : mode === 'flag_hide'
            ? 'تم تعليم المنتج وتحويله لمسودة مؤقتاً ⚠️'
            : 'تم حفظ تعديلات المنتج من أدمن تويست ✅',
      });
      onSaved(res.product);
      if (mode === 'approve' || mode === 'flag_hide') onClose();
      else reload();
    } catch (e) {
      toast({ tone: 'error', title: e.message || 'تعذر حفظ التعديلات' });
    }
    setBusy('');
  };

  const handleDelete = async () => {
    if (!p) return;
    setBusy('delete');
    try {
      const r = await adminApi(`/products/${p.id}`, { method: 'DELETE' });
      toast({ title: r.archived ? 'المنتج عليه طلبات سابقة — تم أرشفته وإخفاؤه' : 'تم حذف المنتج نهائياً' });
      setConfirmDel(false);
      onSaved(null);
      onClose();
    } catch (e) {
      toast({ tone: 'error', title: e.message || 'تعذر حذف المنتج' });
    }
    setBusy('');
  };

  const colorName = (hex) => {
    const c = p?.colors?.find((x) => x.hex === hex);
    return c ? (c.name_ar || c.name_en) : '';
  };

  const waUrl = p && form && p.store?.whatsapp
    ? waLink(p.store.whatsapp, buildWhatsAppModerationMessage(p, form.review_note, form.admin_flags, issueTypes))
    : null;

  return (
    <Sheet
      open={!!productId}
      onClose={onClose}
      title={p ? `معاينة وتعديل: ${p.name_ar}` : 'معاينة المنتج'}
      description={p ? `محل: ${p.store.name_ar} (${p.store.owner_name || 'صاحب المحل'}) · نزل ${fmtDateTime(p.created_at)}` : ''}
      side="end"
      size="lg"
      footer={p && form && (
        <div className="flex flex-wrap gap-2">
          <Button
            icon={CheckCircle2}
            onClick={() => save('approve')}
            loading={busy === 'approve'}
            className="flex-1"
          >
            حفظ واعتماد المعاينة ✓
          </Button>
          <Button
            variant="outline"
            onClick={() => save('save')}
            loading={busy === 'save'}
          >
            حفظ التعديلات
          </Button>
          <Button
            variant="outline"
            icon={EyeOff}
            onClick={() => save('flag_hide')}
            loading={busy === 'flag_hide'}
            className="border-red-500/40 text-red-700 hover:bg-red-50 dark:text-red-300"
          >
            إيقاف الظهور من الموقع
          </Button>
        </div>
      )}
    >
      {error ? (
        <ErrorState error={error} onRetry={reload} compact />
      ) : loading || !p || !form ? (
        <div className="space-y-4 py-4">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6 py-4">
          {/* Quick Links & Status Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={REVIEW_META[p.moderation.reviewStatus]?.tone || 'warning'} dot>
                {REVIEW_META[p.moderation.reviewStatus]?.label}
              </Badge>
              <Badge tone={STATUS_META[p.status]?.tone || 'neutral'}>
                {STATUS_META[p.status]?.label || p.status}
              </Badge>
              <span className="text-xs text-muted" dir="ltr">#{p.id}</span>
              <span className="text-xs text-muted">· {fmtRelativeTime(p.created_at)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link
                to={`/admin/manage/${p.store.slug}/products/${p.id}`}
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-line bg-elevated px-2.5 text-xs font-semibold hover:bg-fg/[0.05]"
              >
                <Pencil className="h-3.5 w-3.5" />المحرر الكامل (رفع صور/مقاسات)
              </Link>
              <a
                href={`/s/${p.store.slug}/p/${encodeURIComponent(p.slug)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-xl border border-line bg-elevated px-2.5 text-xs font-semibold hover:bg-fg/[0.05]"
              >
                <ExternalLink className="h-3.5 w-3.5" />معاينة في المتجر
              </a>
            </div>
          </div>

          {/* Detected Issues & Suggested Fixes */}
          {(p.moderation.issues.length > 0 || p.moderation.suggestedDepartment) && (
            <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-50/70 p-4 dark:bg-amber-500/10">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-bold text-amber-950 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  ملاحظات الفحص التلقائي للمنتج ({fmtNum(p.moderation.issues.length)})
                </p>
                {(p.moderation.suggestedDepartment || p.moderation.suggestedModa) && (
                  <button
                    type="button"
                    onClick={applySuggestion}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    تطبيق التصنيف المقترح تلقائياً
                  </button>
                )}
              </div>
              <ul className="space-y-1.5">
                {p.moderation.issues.map((iss) => (
                  <li key={iss.code} className="flex items-start gap-2 text-xs font-medium text-amber-950 dark:text-amber-100">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                    <span>
                      <strong className="font-bold">{iss.label}:</strong> {iss.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {p.moderation.suggestedDepartment && form.department !== p.moderation.suggestedDepartment.slug && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 p-2.5 text-xs dark:bg-black/20">
                  <span>
                    القسم المقترح من اسم المنتج: <strong className="font-bold">{p.moderation.suggestedDepartment.label}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, department: p.moderation.suggestedDepartment.slug })}
                    className="rounded-lg bg-fg px-2.5 py-1 font-bold text-canvas"
                  >
                    اختيار هذا القسم
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section 1: Photos Inspector */}
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">صور المنتج ({fmtNum(visibleMedia.length)})</p>
                <p className="text-xs text-muted">تقدر تحذف أي صورة وحشة أو ملهاش علاقة بالمنتج، أو تغيّر الصورة الرئيسية.</p>
              </div>
              {removedMedia.length > 0 && (
                <button type="button" onClick={restorePhotos} className="text-xs font-semibold text-brand hover:underline">
                  تراجع عن حذف الصور ({removedMedia.length})
                </button>
              )}
            </div>

            {!visibleMedia.length ? (
              <div className="rounded-xl border border-dashed border-red-300 bg-red-50/50 p-6 text-center text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                المنتج بدون صور حالياً! يمكنك رفع صور له من <Link to={`/admin/manage/${p.store.slug}/products/${p.id}`} className="font-bold underline">المحرر الكامل</Link>.
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visibleMedia.map((m) => {
                  const qb = QUALITY_BADGE(m.quality);
                  const isPrim = primaryMediaId === m.id;
                  const showOrig = origPreview[m.id];
                  return (
                    <li key={m.id} className={cx(' overflow-hidden rounded-xl border bg-surface p-2 transition', isPrim ? 'border-fg ring-1 ring-fg' : 'border-line')}>
                      <div className="relative overflow-hidden rounded-lg bg-neutral-100">
                        {showOrig ? (
                          <div className="relative aspect-[4/5]">
                            <img src={`${m.base}/source.jpg`} alt="" className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
                          </div>
                        ) : (
                          <SmartImage media={m} ratio="4 / 5" sizes="180px" />
                        )}
                        {qb && (
                          <span className={cx('absolute bottom-1.5 end-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm', qb.cls)}>
                            {qb.label}
                          </span>
                        )}
                        {isPrim && (
                          <span className="absolute start-1.5 top-1.5 rounded-full bg-fg px-2 py-0.5 text-[10px] font-bold text-canvas">
                            الرئيسية ★
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        {!isPrim ? (
                          <button
                            type="button"
                            onClick={() => setPrimaryMediaId(m.id)}
                            className="rounded-md bg-fg/[0.06] px-2 py-1 font-semibold hover:bg-fg/[0.12]"
                          >
                            خلّيها رئيسية
                          </button>
                        ) : <span className="font-semibold text-muted">صورة الغلاف</span>}

                        <div className="flex items-center gap-1">
                          {m.quality != null && (
                            <button
                              type="button"
                              onClick={() => setOrigPreview((o) => ({ ...o, [m.id]: !o[m.id] }))}
                              title="مقارنة الصورة الأصلية"
                              className="rounded-md px-1.5 py-1 text-muted hover:bg-fg/[0.06] hover:text-fg"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removePhoto(m.id)}
                            title="حذف هذه الصورة"
                            className="rounded-md px-1.5 py-1 text-sale hover:bg-sale/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Section 2: Edit Product Name, Department, Type & Price */}
          <div className="space-y-4 rounded-2xl border border-line p-4">
            <p className="text-sm font-bold">بيانات المنتج والتصنيف (تعديل مباشر من أدمن تويست)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم المنتج (عربي)">
                <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="مثال: فستان سهرة ستان كحلي" />
              </Field>
              <Field label="اسم المنتج (إنجليزي)" optional="اختياري">
                <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="قسم المنصة (Twist)"
                hint="لو اخترت قسم جديد هيتضاف للمحل ويتظبط تلقائياً"
                error={!form.department ? 'القسم مش متحدد' : undefined}
              >
                <Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  <option value="">— بدون قسم (محتاج تحديد) —</option>
                  {activeDepts.map((d) => (
                    <option key={d.slug} value={d.slug}>{depts.label(d.slug)}</option>
                  ))}
                </Select>
              </Field>

              <Field label="قسم المحل الداخلي" optional="اختياري">
                <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">— تلقائي حسب قسم المنصة —</option>
                  {(p.store_categories || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name_ar}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الفئة (لمين؟)" optional="لمحرك البحث وتويلا">
                <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  <option value="">— تلقائي من الاسم —</option>
                  {(audiences || []).map((a) => (
                    <option key={a.key} value={a.key}>{a.ar}</option>
                  ))}
                </Select>
              </Field>

              <Field label="نوع القطعة (قاموس تويلا)" optional="اختياري">
                <Select value={form.moda_key} onChange={(e) => setForm({ ...form, moda_key: e.target.value })}>
                  <option value="">— تلقائي من الاسم —</option>
                  {(modaTypes || []).map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="السعر (ج.م)">
                <Input
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })}
                />
              </Field>
              <Field label="السعر قبل الخصم" optional="اختياري">
                <Input
                  inputMode="numeric"
                  value={form.compare_at_price}
                  onChange={(e) => setForm({ ...form, compare_at_price: e.target.value.replace(/\D/g, '') })}
                />
              </Field>
              <Field label="حالة الظهور" className="col-span-2 sm:col-span-1">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">منشور (ظاهر للعملاء)</option>
                  <option value="draft">مسودة (مخفي عن العملاء)</option>
                  <option value="archived">مؤرشف</option>
                </Select>
              </Field>
            </div>

            <Field label="وصف المنتج (عربي)" optional="بيساعد في البحث وفهم الخامة">
              <Textarea
                rows={3}
                value={form.description_ar}
                onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
                placeholder="اكتب وصف واضح للخامة والموديل والتفاصيل…"
              />
            </Field>

            <Switch
              checked={form.featured}
              onChange={(v) => setForm({ ...form, featured: v })}
              label="تثبيت المنتج في أول صفحة المحل (Featured)"
            />

            {/* Inventory */}
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-sm font-semibold">المخزون والمقاسات</p>
              {hasVariants ? (
                <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                  {p.variants.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        {v.color && <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15" style={{ background: v.color }} />}
                        <span>{colorName(v.color)}</span>
                        {v.size && <span className="rounded bg-fg/[0.07] px-1.5 py-0.5 text-xs font-bold">{v.size}</span>}
                      </span>
                      <QtyStepper
                        size="sm"
                        min={0}
                        max={9999}
                        value={varStocks[v.id] ?? 0}
                        onChange={(n) => setVarStocks((s) => ({ ...s, [v.id]: n }))}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">الكمية المتاحة</span>
                  <QtyStepper min={0} max={9999} value={Number(form.stock) || 0} onChange={(n) => setForm({ ...form, stock: n })} />
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Manual Moderation Flags & Store Owner Notification */}
          <div className="space-y-3 rounded-2xl border border-line p-4">
            <p className="text-sm font-bold">تحديد مشاكل المنتج والتواصل مع صاحب المحل</p>
            <p className="text-xs text-muted">علّم على المشاكل الموجودة في المنتج (زي صور ملهاش علاقة بالمنتج أو اسم مش واضح) عشان تظهر في الفلتر وتتبعت لصاحب المحل.</p>
            <div className="flex flex-wrap gap-2">
              {(issueTypes || []).filter((it) => it.manual).map((it) => {
                const on = form.admin_flags.includes(it.code);
                return (
                  <button
                    key={it.code}
                    type="button"
                    onClick={() => toggleFlag(it.code)}
                    aria-pressed={on}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                      on
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'border border-line-strong bg-canvas text-fg hover:bg-fg/[0.05]',
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                    {it.label}
                  </button>
                );
              })}
            </div>

            <Field label="كومنت لصاحب المحل (بيظهرله على المنتج في لوحة المحل + في رسالة الواتساب)" optional="اختياري">
              <Textarea
                rows={3}
                value={form.review_note}
                onChange={(e) => setForm({ ...form, review_note: e.target.value })}
                placeholder="مثال: الصورة التانية ملهاش علاقة بالبنطلون، يا ريت ترفع صورة واضحة للمنتج…"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_NOTE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => setForm({ ...form, review_note: form.review_note.trim() ? `${form.review_note.trim()}\n${tpl}` : tpl })}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-start text-[11px] font-medium hover:bg-fg/[0.05]"
                >
                  + {tpl}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                {waUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={MessageCircle}
                    onClick={async () => {
                      await save('flag');
                      window.open(waUrl, '_blank', 'noopener,noreferrer');
                    }}
                    loading={busy === 'flag'}
                    className="border-emerald-600/40 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200"
                  >
                    حفظ الكومنت + إرسال واتساب للمحل ({p.store.name_ar})
                  </Button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-sale hover:bg-sale/10"
              >
                <Trash2 className="h-4 w-4" />حذف المنتج
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={handleDelete}
        loading={busy === 'delete'}
        tone="danger"
        title="حذف المنتج؟"
        body={p ? `متأكد إنك عايز تحذف «${p.name_ar}» من محل «${p.store.name_ar}»؟ لو عليه طلبات سابقة هيتحوّل للأرشيف تلقائياً.` : ''}
        confirmLabel="نعم، احذف"
      />
    </Sheet>
  );
}

export default function AdminProducts() {
  const toast = useToast();
  const depts = useAdminDepartments();
  const [params, setParams] = useSearchParams();

  const [tab, setTab] = useState(() => params.get('tab') || 'all');
  const [issue, setIssue] = useState(() => params.get('issue') || '');
  const [store, setStore] = useState(() => params.get('store') || '');
  const [department, setDepartment] = useState(() => params.get('department') || '');
  const [status, setStatus] = useState(() => params.get('status') || 'all');
  const [days, setDays] = useState(() => params.get('days') || '');
  const [sort, setSort] = useState(() => params.get('sort') || 'newest');
  const [term, setTerm] = useState(() => params.get('q') || '');
  const [page, setPage] = useState(1);

  const [editingId, setEditingId] = useState(null);
  const [noteProduct, setNoteProduct] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDept, setBulkDept] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const dq = useDebounced(term, 250);

  const queryStr = useMemo(() => {
    const sp = new URLSearchParams();
    if (tab && tab !== 'all') sp.set('tab', tab);
    if (issue) sp.set('issue', issue);
    if (store) sp.set('store', store);
    if (department) sp.set('department', department);
    if (status && status !== 'all') sp.set('status', status);
    if (days) sp.set('days', days);
    if (sort && sort !== 'newest') sp.set('sort', sort);
    if (dq) sp.set('q', dq);
    if (page > 1) sp.set('page', String(page));
    return sp.toString();
  }, [tab, issue, store, department, status, days, sort, dq, page]);

  useEffect(() => {
    if (params.toString() !== queryStr) {
      setParams(queryStr ? new URLSearchParams(queryStr) : {}, { replace: true });
    }
  }, [queryStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useAdminApi(`/products${queryStr ? `?${queryStr}` : ''}`);

  useEffect(() => {
    setSelectedIds([]);
  }, [queryStr]);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const items = data?.items || [];
  const counts = data?.counts || {};
  const issueCounts = data?.issueCounts || {};
  const issueTypes = data?.issueTypes || [];
  const stores = data?.stores || [];
  const selectedStoreObj = store ? stores.find((s) => s.slug === store) : null;
  const activeDepts = depts.list.filter((d) => d.active);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const allSelectedOnPage = items.length > 0 && items.every((it) => selectedIds.includes(it.id));
  const toggleSelectAll = () => {
    if (allSelectedOnPage) setSelectedIds([]);
    else setSelectedIds(items.map((it) => it.id));
  };

  const quickApprove = async (p) => {
    setBusyId(`approve:${p.id}`);
    try {
      await adminApi(`/products/${p.id}`, { method: 'PATCH', body: { review_status: 'approved', status: 'active' } });
      toast({ title: `تم اعتماد وإظهار «${p.name_ar}» ✓` });
      reload();
    } catch (e) {
      toast({ tone: 'error', title: e.message });
    }
    setBusyId(null);
  };

  const quickToggleVisibility = async (p) => {
    const isVisible = p.status === 'active';
    setBusyId(`vis:${p.id}`);
    try {
      if (isVisible) {
        await adminApi(`/products/${p.id}`, {
          method: 'PATCH',
          body: { status: 'draft', review_status: 'flagged' },
        });
        toast({ title: `تم إيقاف ظهور «${p.name_ar}» من الموقع 🚫` });
      } else {
        await adminApi(`/products/${p.id}`, {
          method: 'PATCH',
          body: { status: 'active', review_status: 'approved' },
        });
        toast({ title: `تم إعادة إظهار «${p.name_ar}» في الموقع ✓` });
      }
      reload();
    } catch (e) {
      toast({ tone: 'error', title: e.message });
    }
    setBusyId(null);
  };

  const quickFixDept = async (p) => {
    const sug = p.moderation?.suggestedDepartment;
    if (!sug?.slug) return;
    setBusyId(`dept:${p.id}`);
    try {
      await adminApi(`/products/${p.id}`, {
        method: 'PATCH',
        body: {
          department: sug.slug,
          ...(p.moderation?.suggestedModa?.key && !p.moda_key ? { moda_key: p.moderation.suggestedModa.key } : {}),
          ...(p.moderation?.suggestedAudience && !p.audience ? { audience: p.moderation.suggestedAudience } : {}),
        },
      });
      toast({ title: `تم نقل «${p.name_ar}» لقسم «${sug.label}» ✨` });
      reload();
    } catch (e) {
      toast({ tone: 'error', title: e.message });
    }
    setBusyId(null);
  };

  const runBulk = async (payload, successMsg) => {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    try {
      const r = await adminApi('/products/bulk', { method: 'POST', body: { ids: selectedIds, ...payload } });
      toast({ title: `${successMsg} (${fmtNum(r.updated)} منتج)` });
      setSelectedIds([]);
      setBulkDept('');
      reload();
    } catch (e) {
      toast({ tone: 'error', title: e.message });
    }
    setBulkBusy(false);
  };

  const resetFilters = () => {
    setTab('all');
    setIssue('');
    setStore('');
    setDepartment('');
    setStatus('all');
    setDays('');
    setSort('newest');
    setTerm('');
    setPage(1);
  };

  const hasActiveFilters = tab !== 'all' || issue || store || department || status !== 'all' || days || term;

  return (
    <div>
      <PageHeader
        title="المنتجات ومعاينة الكتالوج"
        subtitle="كل المنتجات ووقت نزولها، وفلتر أصحاب المحلات، وكشف تلقائي للمنتجات اللي محتاجة معاينة أو تعديل"
        actions={
          <div className="flex flex-wrap gap-2">
            {hasActiveFilters && (
              <Button size="sm" variant="outline" icon={X} onClick={resetFilters}>
                مسح الفلاتر
              </Button>
            )}
            <Button size="sm" variant="outline" icon={RefreshCw} onClick={reload}>
              تحديث
            </Button>
          </div>
        }
      />

      {/* Top Summary KPI Cards (Clickable) */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" onClick={() => { setTab('all'); setIssue(''); setPage(1); }} className="text-start">
          <KpiCard label="كل المنتجات النشطة" value={counts.all ?? 0} icon={Package} tone="sky" format={fmtNum} loading={loading && !data} hint="اضغط لعرض الكل" />
        </button>
        <button type="button" onClick={() => { setTab('needs_review'); setPage(1); }} className="text-start">
          <KpiCard label="منتجات محتاجة معاينة" value={counts.needs_review ?? 0} icon={Clock} tone="accent" format={fmtNum} loading={loading && !data} hint="جديدة أو فيها ملاحظات" />
        </button>
        <button type="button" onClick={() => { setTab('issues'); setPage(1); }} className="text-start">
          <KpiCard label="فيها مشاكل واضحة ⚠️" value={counts.issues ?? 0} icon={AlertTriangle} tone="brand" format={fmtNum} loading={loading && !data} hint="صورة / اسم / قسم غلط أو ناقص" />
        </button>
        <button type="button" onClick={() => { setTab('approved'); setIssue(''); setPage(1); }} className="text-start">
          <KpiCard label="تمت معاينتها ✓" value={counts.approved ?? 0} icon={CheckCircle2} tone="violet" format={fmtNum} loading={loading && !data} hint="معتمدة وسليمة" />
        </button>
      </div>

      {/* Search & Filters Grid */}
      <div className="mb-4 space-y-3 rounded-2xl border border-line bg-elevated p-4">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            className="sm:col-span-2"
            value={term}
            onChange={(v) => { setTerm(v); setPage(1); }}
            placeholder="ابحث باسم المنتج، رقم #ID، الكود/الباركود، أو اسم المحل وصاحبه…"
          />

          {/* Store / Store Owner Filter */}
          <Select
            size="sm"
            value={store}
            onChange={(e) => { setStore(e.target.value); setPage(1); }}
            aria-label="فلتر المحل / صاحب المحل"
            className="h-11"
          >
            <option value="">كل المحلات وأصحابها ({fmtNum(stores.length)})</option>
            {stores.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name_ar} {s.owner_name ? `(${s.owner_name})` : ''} — {fmtNum(s.total_products)} منتج{s.issue_products > 0 ? ` · ⚠️ ${fmtNum(s.issue_products)}` : ''}
              </option>
            ))}
          </Select>

          {/* Department Filter */}
          <Select
            size="sm"
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
            aria-label="فلتر القسم"
            className="h-11"
          >
            <option value="">كل الأقسام</option>
            <option value="__none__">🚫 بدون قسم / قسم غير مفعّل</option>
            {activeDepts.map((d) => (
              <option key={d.slug} value={d.slug}>{depts.label(d.slug)}</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {/* Time Filter */}
          <Select
            size="sm"
            value={days}
            onChange={(e) => { setDays(e.target.value); setPage(1); }}
            aria-label="وقت نزول المنتج"
          >
            <option value="">وقت النزول: كل الأوقات</option>
            <option value="1">نزل النهاردة (آخر ٢٤ ساعة)</option>
            <option value="3">آخر ٣ أيام</option>
            <option value="7">آخر ٧ أيام</option>
            <option value="30">آخر ٣٠ يوم</option>
          </Select>

          {/* Status Filter */}
          <Select
            size="sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            aria-label="حالة المنتج"
          >
            <option value="all">الحالة: الكل (المنشور والمسودة)</option>
            <option value="active">منشور فقط (ظاهر للعملاء)</option>
            <option value="draft">مسودة فقط (مخفي)</option>
            <option value="out_of_stock">خلص من المخزون</option>
            <option value="archived">الأرشيف</option>
          </Select>

          {/* Sort Order */}
          <Select
            size="sm"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            aria-label="الترتيب"
            className="col-span-2 sm:col-span-1"
          >
            <option value="newest">الترتيب: الأحدث نزولاً أولاً</option>
            <option value="issues_desc">الأكثر مشاكل (الأولى بالمعاينة)</option>
            <option value="quality_asc">الأضعف جودة صور أولاً</option>
            <option value="oldest">الأقدم نزولاً أولاً</option>
            <option value="price_asc">السعر: الأقل للأعلى</option>
            <option value="price_desc">السعر: الأعلى للأقل</option>
          </Select>
        </div>

        {/* Selected Store Owner Banner */}
        {selectedStoreObj && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3.5 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StoreIcon className="h-4 w-4 text-brand" />
              <span className="font-bold">{selectedStoreObj.name_ar}</span>
              {selectedStoreObj.owner_name && <span className="text-muted">· صاحب المحل: {selectedStoreObj.owner_name}</span>}
              <span className="text-xs text-muted">
                ({fmtNum(selectedStoreObj.total_products)} منتج · {fmtNum(selectedStoreObj.issue_products)} فيه ملاحظات)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/admin/manage/${selectedStoreObj.slug}/products`}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-fg px-3 text-xs font-semibold text-canvas"
              >
                <Pencil className="h-3.5 w-3.5" />إدارة منتجات المحل الكاملة
              </Link>
              {selectedStoreObj.whatsapp && (
                <a
                  href={waLink(selectedStoreObj.whatsapp, `أهلاً ${selectedStoreObj.name_ar}، بخصوص منتجات متجرك على Twist:`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-canvas px-2.5 text-xs font-semibold hover:bg-fg/[0.05]"
                >
                  <MessageCircle className="h-3.5 w-3.5" />واتساب الصاحب
                </a>
              )}
              <button
                type="button"
                onClick={() => setStore('')}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:text-fg"
              >
                إلغاء فلتر المحل ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Moderation Status Tabs */}
      <div className="mb-3">
        <FilterTabs
          value={tab}
          onChange={(v) => { setTab(v); setPage(1); }}
          options={[
            { value: 'all', label: 'كل المنتجات', count: counts.all },
            { value: 'needs_review', label: 'محتاجة معاينة', count: counts.needs_review },
            { value: 'issues', label: 'فيها مشاكل ⚠️', count: counts.issues },
            { value: 'unreviewed', label: 'جديدة (غير مراجعة)', count: counts.unreviewed },
            { value: 'approved', label: 'تمت المعاينة ✓', count: counts.approved },
            { value: 'flagged', label: 'موقوفة من الظهور 🚫', count: counts.flagged },
          ]}
        />
      </div>

      {/* Specific Quality Issue Quick-Filter Pills */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="me-1 inline-flex items-center gap-1 text-xs font-semibold text-muted">
          <Filter className="h-3.5 w-3.5" />فلتر نوع المشكلة:
        </span>
        <button
          type="button"
          onClick={() => { setIssue(''); setPage(1); }}
          className={cx(
            'rounded-full px-3 py-1 text-xs font-semibold transition',
            !issue ? 'bg-fg text-canvas' : 'bg-elevated text-fg ring-1 ring-line hover:bg-fg/[0.05]',
          )}
        >
          الكل
        </button>
        {issueTypes.map((it) => {
          const cnt = issueCounts[it.code] || 0;
          const active = issue === it.code;
          return (
            <button
              key={it.code}
              type="button"
              onClick={() => { setIssue(active ? '' : it.code); setPage(1); }}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition',
                active
                  ? 'bg-red-600 text-white shadow-sm'
                  : cnt > 0
                    ? 'bg-elevated text-fg ring-1 ring-line hover:bg-fg/[0.05]'
                    : 'bg-elevated/50 text-muted ring-1 ring-line/60 opacity-60',
              )}
            >
              <span>{it.label}</span>
              <span className={cx('rounded-full px-1.5 py-0.2 text-[11px] tabular', active ? 'bg-white/20 text-white' : cnt > 0 ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200' : 'bg-fg/[0.06]')}>
                {fmtNum(cnt)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#03244D] px-4 py-3 text-white shadow-soft">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>محدد {fmtNum(selectedIds.length)} منتج</span>
            <button type="button" onClick={() => setSelectedIds([])} className="text-xs text-white/75 underline hover:text-white">
              إلغاء التحديد
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              icon={CheckCircle2}
              loading={bulkBusy}
              onClick={() => runBulk({ action: 'approve' }, 'تم اعتماد معاينة المنتجات المحددة')}
            >
              اعتماد المعاينة ✓
            </Button>
            <Button
              size="xs"
              variant="outline"
              icon={Sparkles}
              loading={bulkBusy}
              onClick={() => runBulk({ action: 'apply_suggested_department' }, 'تم تطبيق القسم المقترح')}
              className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20"
            >
              تطبيق القسم المقترح ✨
            </Button>
            <div className="flex items-center gap-1">
              <select
                value={bulkDept}
                onChange={(e) => setBulkDept(e.target.value)}
                aria-label="نقل لقسم"
                className="h-8 rounded-lg border border-white/25 bg-white/10 px-2 text-xs text-white outline-none"
              >
                <option value="" className="text-neutral-900">نقل المحدد لقسم…</option>
                {activeDepts.map((d) => (
                  <option key={d.slug} value={d.slug} className="text-neutral-900">{depts.label(d.slug)}</option>
                ))}
              </select>
              {bulkDept && (
                <Button
                  size="xs"
                  loading={bulkBusy}
                  onClick={() => runBulk({ action: 'set_department', department: bulkDept }, 'تم نقل المنتجات للقسم الجديد')}
                >
                  نقل
                </Button>
              )}
            </div>
            <Button
              size="xs"
              variant="outline"
              icon={EyeOff}
              loading={bulkBusy}
              onClick={() => runBulk({ action: 'flag', status: 'draft' }, 'تم إيقاف ظهور المنتجات المحددة من الموقع')}
              className="!border-red-400/50 !bg-red-500/20 !text-white hover:!bg-red-500/30"
            >
              إيقاف الظهور 🚫
            </Button>
            <Button
              size="xs"
              variant="outline"
              icon={Eye}
              loading={bulkBusy}
              onClick={() => runBulk({ action: 'set_status', status: 'active' }, 'تم إعادة إظهار المنتجات في الموقع')}
              className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20"
            >
              إعادة الإظهار في الموقع
            </Button>
          </div>
        </div>
      )}

      {/* Products List */}
      {loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : !items.length ? (
        <EmptyState
          icon={Package}
          title="مفيش منتجات مطابقة للفلتر ده"
          body="جرّب تغيّر الفلتر أو تبحث بكلمة تانية."
          action={hasActiveFilters && <Button variant="outline" onClick={resetFilters}>إظهار كل المنتجات</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
          {/* Table Header / Select All */}
          <div className="flex items-center justify-between border-b border-line bg-surface/60 px-4 py-2.5 text-xs font-semibold text-muted">
            <label className="inline-flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={allSelectedOnPage}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-line-strong accent-[rgb(var(--c-primary))]"
              />
              <span>تحديد كل الصفحة ({fmtNum(items.length)} من إجمالي {fmtNum(data?.total || 0)})</span>
            </label>
            <span>اضغط على أي منتج أو زر «تعديل ومعاينة» للتعديل السريع من أدمن تويست</span>
          </div>

          <ul className="divide-y divide-line">
            {items.map((p) => {
              const selected = selectedIds.includes(p.id);
              const qb = QUALITY_BADGE(p.primary_quality);
              const issues = p.moderation?.issues || [];
              const sugDept = p.moderation?.suggestedDepartment;
              const revMeta = REVIEW_META[p.moderation?.reviewStatus] || REVIEW_META.pending;
              const stMeta = STATUS_META[p.status] || STATUS_META.active;

              return (
                <li
                  key={p.id}
                  className={cx(
                    'p-4 transition hover:bg-fg/[0.015] sm:px-5',
                    selected && 'bg-brand/[0.04]',
                    p.moderation?.hasMajorIssues && p.moderation?.reviewStatus !== 'approved' && 'border-s-4 border-s-amber-500',
                  )}
                >
                  <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start">
                    {/* Checkbox + Product Thumbnail */}
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`تحديد ${p.name_ar}`}
                        className="mt-2 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-[rgb(var(--c-primary))]"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingId(p.id)}
                        className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface text-start"
                      >
                        {p.image ? (
                          <SmartImage media={p.image} ratio="4 / 5" sizes="80px" className="h-full w-full" />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-red-50 text-red-500 dark:bg-red-500/10">
                            <Camera className="h-6 w-6" />
                          </div>
                        )}
                        <span className="absolute bottom-1 start-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {p.photo_count ? `${fmtNum(p.photo_count)} صور` : 'بدون صور'}
                        </span>
                        {qb && p.primary_quality < 50 && (
                          <span className="absolute end-1 top-1 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white">
                            {p.primary_quality}
                          </span>
                        )}
                      </button>

                      {/* Mobile title preview next to image */}
                      <div className="min-w-0 flex-1 sm:hidden">
                        <button type="button" onClick={() => setEditingId(p.id)} className="text-start font-bold hover:underline">
                          {p.name_ar}
                        </button>
                        <p className="mt-0.5 text-sm font-bold tabular text-brand">{fmtMoney(p.price)}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {p.store.name_ar} · {fmtRelativeTime(p.created_at)}
                        </p>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Top row: Title, Badges, Price */}
                      <div className="hidden flex-wrap items-center justify-between gap-2 sm:flex">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(p.id)}
                            className="truncate text-base font-bold hover:text-brand hover:underline"
                          >
                            {p.name_ar}
                          </button>
                          <span className="text-xs text-muted" dir="ltr">#{p.id}</span>
                          {p.featured && <Badge tone="brand" size="sm">مثبت ★</Badge>}
                          <Badge tone={stMeta.tone} size="sm">{stMeta.label}</Badge>
                          <Badge tone={revMeta.tone} size="sm" dot>{revMeta.label}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.compare_at_price > p.price && (
                            <span className="text-xs text-muted line-through tabular">{fmtMoney(p.compare_at_price)}</span>
                          )}
                          <span className="text-base font-bold tabular">{fmtMoney(p.price)}</span>
                        </div>
                      </div>

                      {/* Second row: Store Owner, Upload Time, Department, Stock */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
                        <button
                          type="button"
                          onClick={() => { setStore(p.store.slug); setPage(1); }}
                          className="inline-flex items-center gap-1 font-semibold text-fg hover:text-brand hover:underline"
                          title="فلتر بمنتجات هذا المحل"
                        >
                          <StoreIcon className="h-3.5 w-3.5 text-brand" />
                          <span>{p.store.name_ar}</span>
                          {p.store.owner_name && <span className="font-normal text-muted">({p.store.owner_name})</span>}
                        </button>

                        <span className="inline-flex items-center gap-1" title="وقت نزول المنتج">
                          <Clock className="h-3.5 w-3.5" />
                          <strong className="font-semibold text-fg">{fmtRelativeTime(p.created_at)}</strong>
                          <span>({fmtDateTime(p.created_at)})</span>
                        </span>

                        <span className="inline-flex items-center gap-1">
                          <Tags className="h-3.5 w-3.5" />
                          {p.department_label ? (
                            <span className="font-medium text-fg">{p.department_label}</span>
                          ) : (
                            <span className="font-bold text-red-600">بدون قسم!</span>
                          )}
                          {p.moda_label && <span className="text-muted">· {p.moda_label}</span>}
                        </span>

                        <span>
                          المخزون:{' '}
                          <strong className={cx('font-semibold tabular', p.stock_status === 'out' ? 'text-red-600' : 'text-fg')}>
                            {p.track_stock ? (p.stock <= 0 ? 'خلص (0)' : fmtNum(p.stock)) : 'غير متتبع'}
                          </strong>
                          {p.variant_count > 0 && ` (${fmtNum(p.variant_count)} مقاس/لون)`}
                        </span>
                      </div>

                      {/* Detected / Flagged Issues Pills & Details */}
                      {issues.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {issues.map((iss) => (
                            <span
                              key={iss.code}
                              className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium', ISSUE_TONE[iss.severity] || ISSUE_TONE.warning)}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                <strong className="font-bold">{iss.label}:</strong> {iss.detail}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      {p.moderation?.reviewNote && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-950 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-100">
                          <span className="flex items-start gap-1.5">
                            <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                            <span>
                              <strong className="font-bold">كومنت ظاهر لصاحب المحل:</strong> {p.moderation.reviewNote}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setNoteProduct(p)}
                            className="font-bold underline hover:text-red-700"
                          >
                            تعديل الكومنت
                          </button>
                        </div>
                      )}

                      {/* Quick 1-Click Suggested Department Fix */}
                      {sugDept && (p.moderation.issues.some((i) => i.code === 'no_department' || i.code === 'dept_mismatch')) && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            disabled={busyId === `dept:${p.id}`}
                            onClick={() => quickFixDept(p)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 dark:text-amber-200"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                            {busyId === `dept:${p.id}` ? 'جارٍ النقل…' : `تصليح سريع: نقل لقسم «${sugDept.label}» بضغطة واحدة`}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons Column */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <Button size="xs" variant="brand" icon={Pencil} onClick={() => setEditingId(p.id)}>
                        تعديل ومعاينة
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={MessageCircle}
                        onClick={() => setNoteProduct(p)}
                      >
                        {p.moderation?.reviewNote ? 'تعديل الكومنت' : 'كومنت للمحل + واتساب'}
                      </Button>
                      {p.status === 'active' ? (
                        <Button
                          size="xs"
                          variant="danger-ghost"
                          icon={EyeOff}
                          loading={busyId === `vis:${p.id}`}
                          onClick={() => quickToggleVisibility(p)}
                          className="border border-red-200 bg-red-50/60 hover:bg-red-100/80 dark:border-red-500/30 dark:bg-red-500/10"
                        >
                          إيقاف الظهور
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={Eye}
                          loading={busyId === `vis:${p.id}`}
                          onClick={() => quickToggleVisibility(p)}
                          className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
                        >
                          إعادة الإظهار
                        </Button>
                      )}
                      {p.moderation?.reviewStatus !== 'approved' && p.status === 'active' && (
                        <Button
                          size="xs"
                          variant="outline"
                          icon={Check}
                          loading={busyId === `approve:${p.id}`}
                          onClick={() => quickApprove(p)}
                        >
                          اعتماد (سليم)
                        </Button>
                      )}
                      <Link
                        to={`/admin/manage/${p.store.slug}/products/${p.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-fg/[0.05] hover:text-fg"
                      >
                        المحرر الكامل
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Pagination page={data?.page || 1} pages={data?.pages || 1} onChange={setPage} />

      <AdminProductSheet
        productId={editingId}
        onClose={() => setEditingId(null)}
        onSaved={() => reload()}
        depts={depts}
        issueTypes={issueTypes}
        audiences={data?.audiences}
        modaTypes={data?.modaTypes}
      />

      <AdminNoteDialog
        product={noteProduct}
        onClose={() => setNoteProduct(null)}
        onSaved={() => reload()}
        issueTypes={issueTypes}
      />
    </div>
  );
}
