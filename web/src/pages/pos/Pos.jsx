import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Wifi, WifiOff, Search, Plus, Minus, Trash2, Receipt, RotateCcw, CalendarDays, CloudUpload, ShoppingCart, Printer, X, ArrowRight, AlertTriangle, ScanBarcode, Check, CalendarCheck, Phone, Camera, PackagePlus, Sparkles, LoaderCircle, Smartphone, Unlink } from 'lucide-react';
import { qrSvg } from '../../lib/qr/index.js';
import { api, upload } from '../../lib/api.js';
import { useToast } from '../../components/ui/Toast.jsx';
import Button from '../../components/ui/Button.jsx';
import { cx } from '../../components/ui/cx.js';
import SmartImage from '../../components/ui/SmartImage.jsx';
import { useTheme, DASHBOARD_THEME } from '../../lib/theme.js';
import { addToCart, applyPhotoSuggestion, buildIndex, newUuid, createScanBuffer, lookupCode, normCode, productStock, reservationCart, returnRefundPreview, searchProducts, setQty, settle, totals } from '../../lib/pos/engine.js';
import { egp, printHtml, receiptHtml } from '../../lib/pos/receipt.js';
import { usePos } from './usePos.js';
import CameraScanner from '../../components/pos/CameraScanner.jsx';

const METHODS = [['cash', 'نقدي'], ['card', 'بطاقة'], ['wallet', 'محفظة']];
const METHOD_NAME = Object.fromEntries(METHODS);
const AI_COLOR_AR = { Black: 'أسود', White: 'أبيض', Grey: 'رمادي', Navy: 'كحلي', Blue: 'أزرق', Red: 'أحمر', Burgundy: 'نبيتي', Green: 'أخضر', Olive: 'زيتي', Beige: 'بيج', Brown: 'بني', Yellow: 'أصفر', Orange: 'برتقالي', Purple: 'موف', Pink: 'وردي' };
const AI_SIZE_KIND_AR = { clothes: 'ملابس (مثل S وM وL)', pants: 'بناطيل (مقاس رقمي)', shoes: 'أحذية (مقاس أوروبي)', kids: 'ملابس أطفال', length: 'طول عباية أو جلابية', free: 'فري سايز' };
const timeOf = (iso) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const num = (v) => Math.max(0, Math.round(Number(String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))) || 0));

const BLOCKED = {
  cashier_off: 'الكاشير مش مفعّل للمحل ده. كلّم فريق Twist.',
  cashier_pending: 'اشتراك الكاشير لسه ما بدأش. كلّم فريق Twist.',
  cashier_paused: 'الكاشير متوقف مؤقتاً للمحل ده. كلّم فريق Twist.',
  cashier_expired: 'اشتراك الكاشير خلص. بياناتك محفوظة، جدّد الاشتراك مع Twist وكمّل.',
  pos_not_twist: 'المحل ده بيستخدم برنامج كاشير تاني.',
};

function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-elevated shadow-lift sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-full hover:bg-fg/[0.07]"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-surface/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Pair a phone as a barcode scanner for this cashier screen: a QR the phone opens, and its live status. */
function PhoneScannerModal({ remote, phoneAt, online, onCreate, onUnpair, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = remote ? `${window.location.origin}/scan/${remote.token}` : '';
  const qr = useMemo(() => (url ? qrSvg(url, { size: 220, logo: false }) : ''), [url]);
  const recent = phoneAt && Date.now() - Date.parse(phoneAt) < 40000;
  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (x) { setError(x.status === 0 ? 'محتاج نت.' : x.message); } setBusy(false); };
  return (
    <Modal title="الموبايل كقارئ باركود" onClose={onClose}>
      {!remote ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">استخدم كاميرا أي موبايل كقارئ باركود للكاشير ده: تمسح بالموبايل والصنف ينزل في السلة على الكمبيوتر. مش محتاج تسجيل دخول على الموبايل ولا تطبيق.</p>
          <Button full size="lg" icon={Smartphone} loading={busy} disabled={!online} onClick={() => run(onCreate)}>{online ? 'اعمل كود الربط' : 'محتاج نت'}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cx('rounded-xl px-3 py-2.5 text-sm font-semibold', recent ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-900')}>{recent ? 'الموبايل متوصل — امسح بيه دلوقتي' : 'مستنيين الموبايل يفتح الكود'}</div>
          <div className="mx-auto w-[220px] overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-line" dangerouslySetInnerHTML={{ __html: qr }} />
          <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed">
            <li>افتح كاميرا الموبايل ووجّهها للكود ده، وافتح اللينك اللي يظهر.</li>
            <li>اسمح للصفحة تستخدم الكاميرا.</li>
            <li>امسح الباركود بالموبايل: الصنف ينزل في السلة هنا، والموبايل يصفّر ويكتب اسم الصنف.</li>
          </ol>
          <p className="break-all rounded-lg bg-fg/[0.04] px-3 py-2 text-xs text-muted" dir="ltr">{url}</p>
          <p className="text-xs text-muted">الربط فاضل شغال 30 يوم على الجهاز ده، حتى لو قفلت الصفحة. الموبايل والكمبيوتر لازم يكون عليهم نت. اللينك ده بيبعت أكواد للكاشير ده بس، ومحدش يقدر يشوف بيه أسعار أو فواتير.</p>
          <Button variant="secondary" icon={Unlink} loading={busy} onClick={() => run(onUnpair)}>فك الربط (لو الموبايل ضاع أو اتغيّر)</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-sale/10 p-3 text-sm text-sale">{error}</p>}
    </Modal>
  );
}

function CameraScannerModal({ onClose, onDetected }) {
  return <Modal title="امسح باركود بالكاميرا" onClose={onClose}><CameraScanner onCode={onDetected} /></Modal>;
}

const Stat = ({ label, value, strong }) => (
  <div className="flex items-center justify-between py-1.5 text-sm"><span className="text-muted">{label}</span><span className={cx('tabular-nums', strong && 'text-base font-bold')}>{value}</span></div>
);

function ShiftModal({ shift, online, canClose, onClose, onMove, onCloseShift }) {
  const [mode, setMode] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [counted, setCounted] = useState(String(shift.expectedCash ?? 0));
  const typed = useRef(false); // once the cashier typed what they counted, a background refresh must not overwrite it
  const moveAttempt = useRef(null); // same movement retried after a lost answer = same id, recorded once
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { typed.current = false; }, [shift.id]);
  useEffect(() => { if (!typed.current) setCounted(String(shift.expectedCash ?? 0)); }, [shift.id, shift.expectedCash]);
  const delta = num(counted) - (shift.expectedCash || 0);
  const submitMove = async (e) => {
    e.preventDefault(); setError('');
    if (num(amount) < 1 || reason.trim().length < 2) { setError('اكتب المبلغ والسبب.'); return; }
    setBusy(true);
    const body = { kind: mode, amount: num(amount), reason: reason.trim() };
    const fingerprint = JSON.stringify(body);
    if (moveAttempt.current?.fingerprint !== fingerprint) moveAttempt.current = { fingerprint, uuid: newUuid() };
    try { await onMove({ ...body, uuid: moveAttempt.current.uuid }); moveAttempt.current = null; setMode(''); setAmount(''); setReason(''); }
    catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  const submitClose = async () => {
    setError(''); setBusy(true);
    try { await onCloseShift({ countedCash: num(counted), note: note.trim() }); }
    catch (x) { setError(x.message); setBusy(false); }
  };
  if (mode) return <Modal title={mode === 'in' ? 'إضافة نقدية للدرج' : 'سحب نقدية من الدرج'} onClose={() => setMode('')} footer={<Button full size="lg" loading={busy} onClick={() => document.getElementById('pos-cash-movement')?.requestSubmit()}>{mode === 'in' ? 'تأكيد الإضافة' : 'تأكيد السحب'}</Button>}>
    <form id="pos-cash-movement" onSubmit={submitMove} className="space-y-3"><label className="block"><span className="mb-1 block text-sm font-semibold">المبلغ · جنيه</span><input autoFocus inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 w-full rounded-xl border border-line px-3 text-xl font-bold tabular-nums" placeholder="0" /></label><label className="block"><span className="mb-1 block text-sm font-semibold">السبب</span><input value={reason} onChange={(e) => setReason(e.target.value)} className="h-12 w-full rounded-xl border border-line px-3" placeholder={mode === 'in' ? 'مثال: فكة للدرج' : 'مثال: مصروف توصيل'} /></label>{error && <p role="alert" className="rounded-lg bg-sale/10 p-2 text-sm text-sale">{error}</p>}</form>
  </Modal>;
  return <Modal title="الوردية والدرج" onClose={onClose} wide footer={<Button full size="lg" loading={busy} disabled={!online || !canClose} onClick={submitClose}>إغلاق الوردية</Button>}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[['رصيد بداية الوردية', shift.openingCash], ['مبيعات نقدي', shift.cashSales], ['مرتجعات نقدي', shift.cashRefunds], ['إضافات للدرج', shift.cashIn], ['سحوبات من الدرج', shift.cashOut], ['المفروض في الدرج', shift.expectedCash]].map(([label, value]) => <div key={label} className="rounded-xl bg-surface p-3"><div className="text-xs text-muted">{label}</div><div className="mt-1 font-bold tabular-nums">{egp(value)}</div></div>)}
    </div>
    <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" icon={Plus} onClick={() => setMode('in')}>إضافة نقدية</Button><Button variant="secondary" icon={Minus} onClick={() => setMode('out')}>سحب نقدية</Button></div>
    <div className="mt-4 rounded-2xl border border-line p-3">
      <label className="block"><span className="mb-1 block text-sm font-semibold">عدّ النقد الموجود فعليًا</span><input inputMode="numeric" value={counted} onChange={(e) => { typed.current = true; setCounted(e.target.value); }} className="h-12 w-full rounded-xl border border-line px-3 text-lg font-bold tabular-nums" /></label>
      <div className={cx('mt-2 text-sm font-semibold', delta === 0 ? 'text-success' : 'text-amber-700')}>{delta === 0 ? 'الدرج مطابق للحساب' : `الفرق عن المتوقع: ${delta > 0 ? '+' : '−'}${egp(Math.abs(delta))}`}</div>
      <label className="mt-3 block"><span className="mb-1 block text-xs text-muted">ملاحظة (اختياري)</span><input value={note} onChange={(e) => setNote(e.target.value)} className="h-10 w-full rounded-lg border border-line px-3 text-sm" placeholder="سبب فرق الدرج إن وجد" /></label>
    </div>
    {!online && <p className="mt-3 text-sm text-amber-800">إغلاق الوردية يحتاج اتصالًا بالإنترنت. تقدر تكمل البيع من الوردية المفتوحة.</p>}
    {!canClose && <p className="mt-3 text-sm text-amber-800">ابعت الفواتير المعلّقة أو كمّل البيع المفتوح قبل إغلاق الوردية.</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-sale/10 p-2 text-sm text-sale">{error}</p>}
  </Modal>;
}

/* ------------------------------------------------------------------ pickers */

function VariantPicker({ product, onPick, onClose }) {
  return (
    <Modal title={product.name} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">{egp(product.price)} — اختار المقاس واللون</p>
      <div className="grid grid-cols-2 gap-2.5">
        {product.variants.map((v) => (
          <button key={v.id} type="button" onClick={() => onPick(v)}
            className={cx('rounded-2xl border p-3 text-start transition active:scale-[.97]', v.stock <= 0 && product.track ? 'border-sale/40 bg-sale/5' : 'border-line bg-surface hover:border-primary')}>
            <div className="font-semibold">{[v.color, v.size].filter(Boolean).join(' · ') || 'موديل'}</div>
            <div className={cx('mt-0.5 text-xs', v.stock <= 0 && product.track ? 'text-sale' : 'text-muted')}>{product.track ? (v.stock > 0 ? `متاح ${v.stock}` : 'نفد من المخزون') : 'بدون متابعة مخزون'}{v.held ? ` · محجوز ${v.held}` : ''}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function QuickProductModal({ initialName = '', initialBarcode = '', online, onClose, onSaved }) {
  const [name, setName] = useState(initialName);
  const [nameEnglish, setNameEnglish] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [barcode, setBarcode] = useState(initialBarcode);
  const [photo, setPhoto] = useState(null);
  const [photoMedia, setPhotoMedia] = useState(null);
  const [description, setDescription] = useState('');
  const [descriptionEnglish, setDescriptionEnglish] = useState('');
  const [department, setDepartment] = useState('');
  const [aiColors, setAiColors] = useState([]);
  const [aiSizeKind, setAiSizeKind] = useState('');
  const [aiProviderStatus, setAiProviderStatus] = useState(null);
  const [aiDraft, setAiDraft] = useState(null);
  const [learnCorrection, setLearnCorrection] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [withVariants, setWithVariants] = useState(false);
  const [variants, setVariants] = useState([{ color: '', size: '', stock: '1', barcode: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!online) return;
    let active = true;
    api('/owner/ai/product/status').then((status) => { if (active) setAiProviderStatus(status); }).catch(() => { if (active) setAiProviderStatus({ checkFailed: true }); });
    return () => { active = false; };
  }, [online]);

  const uploadPhoto = async () => {
    if (!photo) return [];
    if (photoMedia?.file === photo) return photoMedia.media;
    const form = new FormData(); form.append('files', photo);
    const uploaded = await upload('/owner/media?kind=product', form);
    const items = uploaded.media || [];
    setPhotoMedia({ file: photo, media: items });
    return items;
  };

  const suggestFromPhoto = async () => {
    if (!photo) { setError('صوّر المنتج أو اختار صورته الأول.'); return; }
    if (!online) { setError('اقتراح البيانات من الصورة محتاج إنترنت.'); return; }
    setError(''); setAiMessage(''); setAiBusy(true);
    try {
      const [media] = await uploadPhoto();
      if (!media?.id) throw new Error('ماقدرناش نجهّز الصورة للتحليل.');
      const { suggestion } = await api('/owner/ai/product', { method: 'POST', body: { mediaId: media.id, hint: name.trim() || undefined } });
      const { patch, draft } = applyPhotoSuggestion(suggestion, { name_ar: name, name_en: nameEnglish, description_ar: description, description_en: descriptionEnglish, department }, aiDraft || {});
      if (patch.name_ar) setName(patch.name_ar);
      if (patch.name_en) setNameEnglish(patch.name_en);
      if (patch.description_ar) setDescription(patch.description_ar);
      if (patch.description_en) setDescriptionEnglish(patch.description_en);
      if (patch.department) setDepartment(patch.department);
      if (draft) setAiDraft(draft);
      let filled = Object.keys(patch).length;
      const colors = (suggestion?.colors || []).filter((c) => AI_COLOR_AR[c]);
      if (colors.length) { setAiColors(colors); filled++; }
      if (suggestion?.size_kind && AI_SIZE_KIND_AR[suggestion.size_kind]) { setAiSizeKind(suggestion.size_kind); filled++; }
      setAiMessage(filled ? 'راجعنا الصورة وملّينا البيانات الناقصة. تقدر تعدّل أي اقتراح قبل الحفظ.' : 'حللنا الصورة؛ بياناتك المكتوبة محفوظة. مفيش اقتراحات إضافية مناسبة للحقول الفاضية.');
    } catch (x) {
      const messages = {
        ai_unavailable: 'مساعد الصور محتاج تفعيل مزود الذكاء الاصطناعي من إعدادات Twist.',
        stylist_unavailable: 'مساعد الصور مشغول أو حصل عطل مؤقت. الصورة محفوظة؛ جرّب تاني بعد شوية.',
        rate_limited: 'وصل المحل للحد اليومي لاقتراحات الصور. جرّب بكرة.',
        invalid_image: 'الصورة دي مش واضحة أو نوعها غير مدعوم. اختار صورة تانية.',
      };
      setError(messages[x.code] || (x.code === 'network' ? 'الاتصال فصل أثناء تحليل الصورة. الصورة محفوظة؛ اتأكد من الإنترنت وجرّب تاني.' : (x.message || 'ماقدرناش نقرا تفاصيل الصورة.')));
    } finally { setAiBusy(false); }
  };

  const addSuggestedColor = (color) => {
    const label = AI_COLOR_AR[color];
    if (!label) return;
    setWithVariants(true);
    setVariants((rows) => rows.some((v) => v.color.trim() === label) ? rows : [...rows, { color: label, size: '', stock: '0', barcode: '' }]);
  };

  const save = async (e) => {
    e.preventDefault(); setError('');
    if (aiBusy) { setError('استنى لما تحليل الصورة يخلص قبل حفظ الصنف.'); return; }
    if (!online) { setError('إضافة الصنف محتاجة اتصال بالإنترنت. البيع الحالي يفضل شغال أوفلاين.'); return; }
    if (name.trim().length < 2) { setError('اكتب اسم واضح للصنف.'); return; }
    if (num(price) < 1) { setError('اكتب سعر البيع.'); return; }
    const rows = withVariants ? variants.filter((v) => v.color.trim() || v.size.trim()) : [];
    if (withVariants && !rows.length) { setError('أضف مقاس أو لون واحد على الأقل.'); return; }
    if (rows.some((v) => num(v.stock) < 0)) { setError('راجع كميات المقاسات والألوان.'); return; }
    setBusy(true);
    try {
      const media = (await uploadPhoto()).map((m) => m.id);
      const body = {
        name_ar: name.trim(), name_en: nameEnglish.trim(), description_ar: description.trim(), description_en: descriptionEnglish.trim(), price: num(price), barcode: barcode.trim() || null, department: department || null,
        status: 'active', track_stock: true, stock: withVariants ? 0 : num(stock),
        variants: rows.map((v) => ({ color: v.color.trim() || null, size: v.size.trim() || null, stock: num(v.stock), barcode: v.barcode.trim() || null })),
        media, primary_media_id: media[0] || null,
      };
      const result = await api('/owner/products', { method: 'POST', body });
      const p = result.product;
      const corrected = { name_ar: name.trim(), name_en: nameEnglish.trim(), description_ar: description.trim(), description_en: descriptionEnglish.trim(), department };
      if (learnCorrection && aiDraft && Object.keys(aiDraft).some((key) => aiDraft[key] !== corrected[key])) {
        try { await api('/owner/ai/product/learn', { method: 'POST', body: { suggested: aiDraft, corrected } }); } catch { /* Product creation must succeed even if learning feedback cannot be recorded. */ }
      }
      onSaved({
        id: p.id, name: p.name, sku: p.sku || '', barcode: p.barcode || '', price: p.price,
        track: true, stock: p.stockCount ?? (withVariants ? rows.reduce((sum, v) => sum + num(v.stock), 0) : num(stock)),
        variants: (p.variants || []).map((v) => ({ ...v, color: v.color || '', size: v.size || '', sku: v.sku || '', barcode: v.barcode || '', held: 0 })),
        sold: 0, category: p.category?.name || '', image: p.media?.[0] || null,
      });
    } catch (x) { setError(x.code === 'barcode_in_use' ? 'الباركود ده متسجل قبل كده لصنف تاني.' : (x.message || 'ماقدرناش نحفظ الصنف.')); } finally { setBusy(false); }
  };

  return (
    <Modal title="إضافة صنف سريع" onClose={onClose} wide footer={
      <Button full size="lg" loading={busy || aiBusy} disabled={!online || aiBusy} icon={PackagePlus} onClick={() => document.getElementById('pos-quick-product-form')?.requestSubmit()}>
        حفظ الصنف وإضافته للبيع
      </Button>}>
      <form id="pos-quick-product-form" onSubmit={save} className="space-y-4">
        <div className="rounded-2xl bg-primary/5 p-3 text-sm text-muted">هيتسجل في كتالوج المحل ويظهر في الكاشير والمتجر. لو مفيش باركود، هتلاقيه بعد كده بالبحث عن اسمه.</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold">اسم الصنف</span><input autoFocus value={name} onChange={(x) => setName(x.target.value)} placeholder="مثال: تيشيرت قطن أسود" className="h-12 w-full rounded-xl border border-line px-3 focus:outline-none focus:shadow-ring" /></label>
          <label className="block"><span className="mb-1 block text-sm font-semibold">سعر البيع · جنيه</span><input inputMode="numeric" value={price} onChange={(x) => setPrice(x.target.value)} placeholder="مثال: ٤٥٠" className="h-12 w-full rounded-xl border border-line px-3 tabular-nums focus:outline-none focus:shadow-ring" /></label>
          {!withVariants && <label className="block"><span className="mb-1 block text-sm font-semibold">الكمية المتاحة</span><input inputMode="numeric" value={stock} onChange={(x) => setStock(x.target.value)} placeholder="1" className="h-12 w-full rounded-xl border border-line px-3 tabular-nums focus:outline-none focus:shadow-ring" /></label>}
          <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold">الباركود <span className="font-normal text-muted">اختياري</span></span><input dir="ltr" value={barcode} onChange={(x) => setBarcode(x.target.value)} placeholder="سيبه فاضي وابحث بالاسم وقت البيع" className="h-12 w-full rounded-xl border border-line px-3 focus:outline-none focus:shadow-ring" /></label>
          {aiProviderStatus?.departments?.length > 0 && <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold">قسم المتجر <span className="font-normal text-muted">اختياري — راجعه قبل الحفظ</span></span><select value={department} onChange={(e) => setDepartment(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-elevated px-3"><option value="">سيبه فاضي</option>{aiProviderStatus.departments.map((d) => <option key={d.slug} value={d.slug}>{d.name.ar}</option>)}</select></label>}
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={withVariants} onChange={(e) => setWithVariants(e.target.checked)} className="h-4 w-4 accent-primary" /><span><span className="block text-sm font-semibold">الصنف له مقاسات أو ألوان مختلفة</span><span className="block text-xs text-muted">سجّل رصيد كل مقاس/لون لوحده</span></span></label>
        {withVariants && <div className="space-y-2">
          {variants.map((v, i) => <div key={i} className="grid grid-cols-[1fr_1fr_74px_1fr_36px] gap-1.5">
            <input value={v.color} onChange={(e) => setVariants((list) => list.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} placeholder="اللون" aria-label="اللون" className="h-10 min-w-0 rounded-lg border border-line px-2 text-sm" />
            <input value={v.size} onChange={(e) => setVariants((list) => list.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} placeholder="المقاس" aria-label="المقاس" className="h-10 min-w-0 rounded-lg border border-line px-2 text-sm" />
            <input inputMode="numeric" value={v.stock} onChange={(e) => setVariants((list) => list.map((x, j) => j === i ? { ...x, stock: e.target.value } : x))} placeholder="العدد" aria-label="العدد" className="h-10 min-w-0 rounded-lg border border-line px-2 text-sm tabular-nums" />
            <input dir="ltr" value={v.barcode} onChange={(e) => setVariants((list) => list.map((x, j) => j === i ? { ...x, barcode: e.target.value } : x))} placeholder="Barcode" aria-label="باركود المقاس" className="h-10 min-w-0 rounded-lg border border-line px-2 text-sm" />
            <button type="button" aria-label="حذف التركيبة" onClick={() => setVariants((list) => list.length > 1 ? list.filter((_, j) => j !== i) : list)} className="grid h-10 w-9 place-items-center rounded-lg text-muted hover:bg-sale/10 hover:text-sale"><X className="h-4 w-4" /></button>
          </div>)}
          <button type="button" onClick={() => setVariants((list) => [...list, { color: '', size: '', stock: '0', barcode: '' }])} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/5"><Plus className="h-4 w-4" />إضافة لون أو مقاس</button>
        </div>}
        <label className={cx('flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong p-3', !aiBusy && 'hover:bg-fg/[0.03]', aiBusy && 'cursor-wait opacity-70')}><input type="file" accept="image/*" capture="environment" disabled={aiBusy || busy} className="sr-only" onChange={(e) => { setPhoto(e.target.files?.[0] || null); setPhotoMedia(null); setAiColors([]); setAiSizeKind(''); setAiDraft(null); setAiMessage(''); setError(''); }} /><span className="grid h-11 w-11 place-items-center rounded-xl bg-surface"><Camera className="h-5 w-5 text-primary" /></span><span><span className="block text-sm font-semibold">صورة للمتجر <span className="font-normal text-muted">اختياري</span></span><span className="block text-xs text-muted">صوّرها دلوقتي أو اختار صورة من الجهاز</span></span>{photo && <span className="ms-auto max-w-36 truncate text-xs text-success">{photo.name}</span>}</label>
        {photo && <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" size="sm" icon={aiBusy ? LoaderCircle : Sparkles} loading={aiBusy} disabled={!online || busy || (aiProviderStatus && !aiProviderStatus.configured && !aiProviderStatus.checkFailed)} onClick={suggestFromPhoto}>حلّل الصورة واملأ البيانات الناقصة</Button><span className="text-xs text-muted">الاقتراحات ماتغيّرش بيانات كتبتها، والسعر بتحدده بنفسك.</span></div>}
        {photo && aiProviderStatus && !aiProviderStatus.configured && !aiProviderStatus.checkFailed && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">مساعد الصورة غير مفعّل على الخادم حاليًا. اطلب من إدارة Twist إعداد مزود الذكاء الاصطناعي؛ تقدر تكمل إضافة الصنف يدويًا والصورة هتتحفظ.</p>}
        {aiMessage && <p role="status" className="rounded-xl bg-success/10 p-3 text-sm text-success">{aiMessage}</p>}
        {aiDraft && <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted"><input type="checkbox" checked={learnCorrection} onChange={(e) => setLearnCorrection(e.target.checked)} className="mt-0.5 accent-primary" /><span>استخدم تعديلي على اقتراح المساعد كمثال للمحل ده فقط في المرات الجاية. بيانات المحلات ماتتشاركش.</span></label>}
        {aiColors.length > 0 && <div className="rounded-xl border border-line p-3"><p className="text-sm font-semibold">ألوان مقترحة من الصورة</p><p className="mt-1 text-xs text-muted">اختار اللون اللي موجود فعلًا. كل لون جديد بيتضاف بكمية صفر لحد ما تدخل رصيدك.</p><div className="mt-2 flex flex-wrap gap-2">{aiColors.map((color) => { const label = AI_COLOR_AR[color]; const chosen = variants.some((v) => v.color.trim() === label); return <button key={color} type="button" aria-pressed={chosen} onClick={() => addSuggestedColor(color)} className={cx('rounded-full border px-3 py-1.5 text-sm', chosen ? 'border-success bg-success/10 text-success' : 'border-line hover:border-primary')}>{label}{chosen ? ' · مضاف' : ' · أضف'}</button>; })}</div>{aiSizeKind && <p className="mt-3 text-xs text-muted">تخمين نوع المقاس: {AI_SIZE_KIND_AR[aiSizeKind]}. راجع المقاسات الفعلية من التوريد قبل الحفظ.</p>}</div>}
        {description && <label className="block"><span className="mb-1 block text-sm font-semibold">وصف للمتجر <span className="font-normal text-muted">اختياري</span></span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-line px-3 py-2 text-sm" /></label>}
        {(nameEnglish || descriptionEnglish) && <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">بيانات بالإنجليزي (اختياري)</summary><label className="mt-3 block"><span className="mb-1 block text-xs text-muted">اسم المنتج بالإنجليزي</span><input dir="ltr" value={nameEnglish} onChange={(e) => setNameEnglish(e.target.value)} className="h-10 w-full rounded-lg border border-line px-3 text-sm" /></label><label className="mt-3 block"><span className="mb-1 block text-xs text-muted">وصف بالإنجليزي</span><textarea dir="ltr" rows={3} value={descriptionEnglish} onChange={(e) => setDescriptionEnglish(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm" /></label></details>}
        {error && <p role="alert" className="rounded-xl bg-sale/10 p-3 text-sm text-sale">{error}</p>}
      </form>
    </Modal>
  );
}

function ReceiveStockModal({ products, initialProduct = null, online, onClose, onReceive }) {
  const eligible = products.filter((p) => p.track);
  const [query, setQuery] = useState(initialProduct?.name || '');
  const [productId, setProductId] = useState(initialProduct ? String(initialProduct.id) : '');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestAttempt = useRef(null);
  const needle = query.trim().toLowerCase();
  const codeNeedle = normCode(query);
  const matches = eligible.filter((p) => !needle || `${p.name} ${p.barcode} ${p.sku}`.toLowerCase().includes(needle) || [p.barcode, p.sku, ...(p.variants || []).flatMap((v) => [v.barcode, v.sku])].some((code) => code && normCode(code).includes(codeNeedle))).slice(0, 8);
  const product = eligible.find((p) => String(p.id) === productId);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!product) { setError('اختار الصنف الأول.'); return; }
    if (product.variants.length && !variantId) { setError('اختار اللون أو المقاس.'); return; }
    if (num(quantity) < 1) { setError('اكتب الكمية اللي وصلت.'); return; }
    setBusy(true);
    try {
      const payload = { productId: product.id, variantId: variantId ? Number(variantId) : null, quantity: num(quantity), note: note.trim() };
      const fingerprint = JSON.stringify(payload);
      if (requestAttempt.current?.fingerprint !== fingerprint) requestAttempt.current = { fingerprint, uuid: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` };
      await onReceive({ ...payload, uuid: requestAttempt.current.uuid });
      onClose();
    }
    catch (x) { setError(x.message || 'ماقدرناش نزود الرصيد.'); } finally { setBusy(false); }
  };
  return <Modal title="استلام بضاعة" onClose={onClose} footer={<Button full size="lg" loading={busy} disabled={!online} icon={PackagePlus} onClick={() => document.getElementById('pos-stock-receive')?.requestSubmit()}>تحديث رصيد الصنف</Button>}>
    <form id="pos-stock-receive" onSubmit={submit} className="space-y-4">
      <label className="block"><span className="mb-1 block text-sm font-semibold">دور على الصنف</span><input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setProductId(''); setVariantId(''); }} placeholder="اسم أو باركود" className="h-12 w-full rounded-xl border border-line px-3" /></label>
      {!product && <div className="max-h-52 space-y-1 overflow-y-auto">{matches.map((p) => <button key={p.id} type="button" onClick={() => { setProductId(String(p.id)); setQuery(p.name); setVariantId(''); }} className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-start hover:border-primary"><span className="min-w-0 truncate font-medium">{p.name}</span><span className="ms-3 shrink-0 text-xs text-muted">رصيد {productStock(p)}</span></button>)}{!matches.length && <p className="p-3 text-sm text-muted">مش لاقيين صنف بيتابع المخزون.</p>}</div>}
      {product && <div className="rounded-xl bg-surface p-3"><div className="font-semibold">{product.name}</div><div className="text-sm text-muted">الرصيد الحالي: {productStock(product)}</div></div>}
      {product?.variants.length > 0 && <label className="block"><span className="mb-1 block text-sm font-semibold">اللون / المقاس</span><select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-elevated px-3"><option value="">اختار التركيبة</option>{product.variants.map((v) => <option key={v.id} value={v.id}>{[v.color, v.size].filter(Boolean).join(' · ')} — رصيد {v.stock}</option>)}</select></label>}
      <label className="block"><span className="mb-1 block text-sm font-semibold">الكمية اللي وصلت</span><input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="مثال: 12" className="h-14 w-full rounded-xl border border-line px-3 text-xl font-bold tabular-nums" /></label>
      <label className="block"><span className="mb-1 block text-sm font-semibold">ملاحظة <span className="font-normal text-muted">اختياري</span></span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: استلام فاتورة المورد ١٢٤" className="h-11 w-full rounded-xl border border-line px-3" /></label>
      {!online && <p className="text-sm text-amber-800">استلام البضاعة يحتاج إنترنت عشان رصيد المتجر يتحدّث فورًا.</p>}{error && <p role="alert" className="rounded-xl bg-sale/10 p-3 text-sm text-sale">{error}</p>}
    </form>
  </Modal>;
}

function PaySheet({ total, onClose, onConfirm, busy }) {
  const [rows, setRows] = useState([{ method: 'cash', amount: String(total) }]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const pays = rows.map((r) => ({ method: r.method, amount: num(r.amount) }));
  const s = settle(total, pays);
  const cashPaid = pays.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = (method) => setRows((r) => [...r, { method, amount: String(Math.max(0, total - pays.reduce((a, p) => a + p.amount, 0))) }]);
  const cashIdx = rows.findIndex((r) => r.method === 'cash');
  const chips = [...new Set([total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 200) * 200])].filter((v) => v >= total).slice(0, 4);
  return (
    <Modal title="الدفع" onClose={onClose} footer={
      <Button full size="lg" disabled={!s.ok || busy} loading={busy} onClick={() => onConfirm({ payments: pays, customerName: name.trim(), customerPhone: phone.trim() })} icon={Check}>
        تأكيد وطباعة الفاتورة
      </Button>}>
      <div className="mb-4 rounded-2xl bg-surface p-4 text-center"><div className="text-sm text-muted">المطلوب</div><div className="text-4xl font-bold tabular-nums">{egp(total)}</div></div>
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={r.method} onChange={(e) => set(i, { method: e.target.value })} aria-label="طريقة الدفع" className="h-12 rounded-xl border border-line bg-elevated px-3 font-medium">
              {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input inputMode="numeric" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} onFocus={(e) => e.target.select()} aria-label="المبلغ" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-elevated px-3 text-lg font-semibold tabular-nums focus:outline-none focus:shadow-ring" />
            {rows.length > 1 && <button type="button" aria-label="شيل" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-fg/[0.07]"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
      {cashIdx >= 0 && rows.length === 1 && (
        <div className="mt-3 flex flex-wrap gap-2">{chips.map((c) => <button key={c} type="button" onClick={() => set(cashIdx, { amount: String(c) })} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium tabular-nums hover:border-primary">{egp(c)}</button>)}</div>
      )}
      {rows.length < 3 && <div className="mt-3 flex gap-2 text-sm">{METHODS.map(([k, l]) => <button key={k} type="button" onClick={() => add(k)} className="rounded-full border border-dashed border-line-strong px-3 py-1.5 text-muted hover:text-fg">+ {l}</button>)}</div>}
      <div className="mt-4 rounded-2xl border border-line p-3">
        <Stat label="المدفوع" value={egp(s.paid)} />
        {s.remaining > 0 && <Stat label="لسه مطلوب" value={egp(s.remaining)} strong />}
        {s.paid - total > cashPaid && <p role="alert" className="rounded-xl bg-sale/10 px-3 py-2 text-sm text-sale">المبلغ الزيادة أكبر من النقدي، ومينفعش نرجّع باقي على البطاقة أو المحفظة. قلّل المبلغ أو زوّد النقدي.</p>}
        {s.change > 0 && <div className="flex items-center justify-between rounded-xl bg-success/10 px-3 py-2 text-success"><span className="font-semibold">الباقي للعميل</span><span className="text-xl font-bold tabular-nums">{egp(s.change)}</span></div>}
      </div>
      <details className="mt-4 text-sm"><summary className="cursor-pointer text-muted">بيانات العميل (اختياري)</summary>
        <div className="mt-2 grid gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className="h-11 rounded-xl border border-line px-3" /><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="الموبايل" inputMode="tel" className="h-11 rounded-xl border border-line px-3" /></div>
      </details>
    </Modal>
  );
}

function ReceiptModal({ storeName, sale, onClose, autoPrint }) {
  const html = useMemo(() => receiptHtml({ storeName, sale }), [storeName, sale]);
  const printed = useRef(false);
  useEffect(() => { if (autoPrint && !printed.current) { printed.current = true; printHtml(html); } }, [autoPrint, html]);
  return (
    <Modal title={sale.number != null ? `فاتورة رقم ${sale.number}` : `فاتورة ${sale.localNo}`} onClose={onClose}
      footer={<div className="flex gap-2"><Button variant="secondary" icon={Printer} onClick={() => printHtml(html)}>طباعة</Button><Button full onClick={onClose} icon={Plus}>بيع جديد</Button></div>}>
      <div className="mb-3 flex items-center gap-2 rounded-2xl bg-success/10 p-3 text-success"><Check className="h-5 w-5" /><span className="font-semibold">تم البيع — {egp(sale.total)}</span></div>
      {sale.change > 0 && <div className="mb-3 text-center text-sm">الباقي للعميل: <b className="text-lg tabular-nums">{egp(sale.change)}</b></div>}
      {sale.number == null && <p className="mb-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />الفاتورة اتحفظت على الجهاز ومستنية النت. هتاخد رقمها الرسمي لوحدها.</p>}
      <iframe title="معاينة الفاتورة" srcDoc={html} className="h-[320px] w-full rounded-xl border border-line bg-white" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ invoices, returns, day */

function InvoiceModal({ target: refSale, store, shiftId, onClose, onChanged }) {
  const toast = useToast();
  const [sale, setSale] = useState(null);
  const [err, setErr] = useState(null);
  const [back, setBack] = useState({});
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [defective, setDefective] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(refSale.number ? `/pos/sales/number/${refSale.number}` : `/pos/sales/${refSale.id}`).then((d) => setSale(d.sale)).catch((e) => setErr(e.status === 0 ? 'محتاج نت عشان تفتح الفواتير القديمة.' : e.status === 404 ? 'مفيش فاتورة بالرقم ده.' : e.message));
  }, [refSale]);
  const returnAttempt = useRef(null);
  const preview = sale ? returnRefundPreview(sale.items, sale, back) : 0;
  const hasSelectedItems = Object.values(back).some((qty) => qty > 0);
  const hasDefectiveItems = Object.entries(back).some(([id, qty]) => qty > 0 && defective[id]);
  const confirm = async () => {
    setBusy(true);
    try {
      const items = Object.entries(back).filter(([, q]) => q > 0).map(([saleItemId, qty]) => ({ saleItemId: Number(saleItemId), qty, defective: !!defective[saleItemId] }));
      // pressing Confirm again after a lost answer sends the SAME return id, so the server records it once
      const fingerprint = JSON.stringify({ saleId: sale.id, items, method, reason });
      if (returnAttempt.current?.fingerprint !== fingerprint) returnAttempt.current = { fingerprint, uuid: newUuid() };
      const r = await api('/pos/returns', { method: 'POST', body: { uuid: returnAttempt.current.uuid, saleId: sale.id, items, method, reason, shiftId } });
      returnAttempt.current = null;
      setSale(r.sale); setBack({}); setDefective({}); toast({ title: `تم المرتجع — ${egp(r.refund)}` }); onChanged?.();
    } catch (e) { toast({ tone: 'error', title: e.status === 0 ? 'المرتجع محتاج نت' : e.message }); } finally { setBusy(false); }
  };
  const reprint = () => {
    let giveBack = sale.change; // the stored cash line is net of change; the customer handed over the full amount
    const payments = sale.payments.map((p) => { if (p.method === 'cash' && giveBack > 0) { const x = { ...p, amount: p.amount + giveBack }; giveBack = 0; return x; } return p; });
    printHtml(receiptHtml({ storeName: store.name, copy: true, sale: { ...sale, payments } }));
  };
  return (
    <Modal title={sale ? `فاتورة رقم ${sale.number}` : 'فاتورة'} onClose={onClose} wide
      footer={sale && <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" icon={Printer} onClick={reprint}>إعادة طباعة</Button>
        <Button className="ms-auto" disabled={!hasSelectedItems} loading={busy} icon={RotateCcw} onClick={confirm}>{preview ? `تأكيد مرتجع ${egp(preview)}` : hasSelectedItems ? 'تأكيد استلام الصنف بدون رد مبلغ' : 'اختار الأصناف للمرتجع'}</Button></div>}>
      {err && <p className="py-8 text-center text-muted">{err}</p>}
      {!sale && !err && <p className="py-8 text-center text-muted">جاري التحميل…</p>}
      {sale && (<>
        <p className="mb-3 text-sm text-muted">{new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sale.createdAt))}{sale.customerName ? ` · ${sale.customerName}` : ''}</p>
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {sale.items.map((it) => {
            const left = it.qty - it.returnedQty;
            return (
              <li key={it.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{it.name}</div>
                  <div className="text-xs text-muted">{[it.color, it.size].filter(Boolean).join(' · ')} {it.qty} × {egp(it.price)}{it.returnedQty ? ` · اترجّع ${it.returnedQty}` : ''}{it.oversold ? ' · اتباع بدون رصيد' : ''}{it.noReturn ? ' · غير قابل للاسترجاع' : it.returnUntil ? ` · آخر يوم للاسترجاع ${it.returnUntil}` : ''}</div>
                  {(back[it.id] || 0) > 0 && <label className="mt-1 flex items-center gap-1 text-xs text-amber-800"><input type="checkbox" checked={!!defective[it.id]} onChange={(e) => setDefective((d) => ({ ...d, [it.id]: e.target.checked }))} />القطعة دي فيها عيب؛ لا ترجع للمخزون</label>}</div>
                {left > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <button type="button" aria-label="أقل" className="grid h-9 w-9 place-items-center rounded-full border border-line" onClick={() => setBack((b) => ({ ...b, [it.id]: Math.max(0, (b[it.id] || 0) - 1) }))}><Minus className="h-4 w-4" /></button>
                    <span className="w-6 text-center tabular-nums">{back[it.id] || 0}</span>
                    <button type="button" aria-label="أكتر" className="grid h-9 w-9 place-items-center rounded-full border border-line" onClick={() => setBack((b) => ({ ...b, [it.id]: Math.min(left, (b[it.id] || 0) + 1) }))}><Plus className="h-4 w-4" /></button>
                  </div>) : <span className="text-xs text-muted">اترجّع بالكامل</span>}
              </li>);
          })}
        </ul>
        <div className="mt-3"><Stat label="الإجمالي" value={egp(sale.total)} strong />{sale.discount > 0 && <Stat label="خصم" value={egp(sale.discount)} />}
          {sale.payments.map((p, i) => <Stat key={i} label={METHOD_NAME[p.method]} value={egp(p.amount)} />)}
          {sale.returns.map((r) => <Stat key={r.id} label={`مرتجع ${timeOf(r.createdAt)}${r.items?.some((i) => i.defective) ? ' · به عيب' : ''}`} value={`− ${egp(r.refund)}`} />)}</div>
        {(preview > 0 || hasDefectiveItems) && (<div className="mt-3 flex items-center gap-2 text-sm">{preview > 0 && <><span className="text-muted">رجّع الفلوس:</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-xl border border-line px-2">{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </>}<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={hasDefectiveItems ? 'وصف العيب (اختياري)' : 'السبب (اختياري)'} className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3" /></div>)}
      </>)}
    </Modal>
  );
}

function DayModal({ onClose, onOpen, pending }) {
  const [day, setDay] = useState(today());
  const [sum, setSum] = useState(null);
  const [list, setList] = useState([]);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setErr(null); setSum(null);
    Promise.all([api(`/pos/summary?day=${day}`), api(`/pos/sales?day=${day}&limit=100`)]).then(([s, l]) => { setSum(s); setList(l.sales); }).catch((e) => setErr(e.status === 0 ? 'محتاج نت عشان تشوف تقرير اليوم.' : e.message));
  }, [day]);
  return (
    <Modal title="تقرير اليوم" onClose={onClose} wide>
      <div className="mb-3 flex items-center gap-2"><input type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-10 rounded-xl border border-line px-3" /></div>
      {pending > 0 && <p className="mb-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />فيه {pending} فاتورة لسه ما وصلتش للسيرفر — الأرقام دي مش شاملاها.</p>}
      {err && <p className="py-8 text-center text-muted">{err}</p>}
      {sum && (<>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['فواتير', sum.invoices], ['قطع', sum.pieces], ['المبيعات', egp(sum.gross)], ['الصافي', egp(sum.net)]].map(([l, v]) => <div key={l} className="rounded-2xl bg-surface p-3 text-center"><div className="text-xs text-muted">{l}</div><div className="text-lg font-bold tabular-nums">{v}</div></div>)}
        </div>
        <div className="mt-3 rounded-2xl border border-line p-3">
          <Stat label="نقدي (في الدرج)" value={egp(sum.byMethod.cash)} /><Stat label="بطاقة" value={egp(sum.byMethod.card)} /><Stat label="محفظة" value={egp(sum.byMethod.wallet)} />
          <Stat label="خصومات" value={egp(sum.discounts)} /><Stat label="مرتجعات" value={egp(sum.refunds)} />
        </div>
        <h3 className="mb-2 mt-4 text-sm font-semibold text-muted">الفواتير</h3>
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {list.length === 0 && <li className="p-4 text-center text-sm text-muted">مفيش فواتير في اليوم ده.</li>}
          {list.map((s) => <li key={s.id}><button type="button" onClick={() => onOpen({ id: s.id })} className="flex w-full items-center gap-3 p-3 text-start hover:bg-fg/[0.04]"><span className="font-semibold tabular-nums">#{s.number}</span><span className="text-sm text-muted">{timeOf(s.createdAt)}</span>{s.returns > 0 && <span className="rounded-full bg-sale/10 px-2 py-0.5 text-xs text-sale">مرتجع</span>}<span className="ms-auto font-semibold tabular-nums">{egp(s.total)}</span></button></li>)}
        </ul>
      </>)}
    </Modal>
  );
}

/** "Reserve & try in store" requests waiting in the shop. The shopper arrives, the cashier loads their pieces and sells. */
function ReservationsModal({ list, onClose, onPick }) {
  const [text, setText] = useState('');
  const k = text.trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).toLowerCase();
  const shown = k ? list.filter((r) => [r.number, r.name, r.phone].join(' ').toLowerCase().includes(k)) : list;
  return (
    <Modal title="حجوزات القياس" onClose={onClose} wide>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="رقم الحجز أو اسم العميل أو موبايله" className="mb-3 h-12 w-full rounded-2xl border border-line px-4 focus:outline-none focus:shadow-ring" />
      {shown.length === 0 ? <p className="py-8 text-center text-muted">{list.length ? 'مفيش حجز بالبيانات دي.' : 'مفيش حجوزات مستنية.'}</p> : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{r.name}</span>
                <span className="inline-flex items-center gap-1 text-sm text-muted" dir="ltr"><Phone className="h-3.5 w-3.5" />{r.phone}</span>
                <span className="font-mono text-xs text-muted" dir="ltr">{r.number}</span>
                <span className={cx('ms-auto rounded-full px-2.5 py-1 text-xs font-semibold', r.status === 'confirmed' ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-900')}>
                  {r.status === 'confirmed' ? `محجوز لحد ${timeOf(r.until)}` : 'لسه مستني تأكيد'}
                </span>
              </div>
              <ul className="mt-2 text-sm text-muted">{r.items.map((i, j) => <li key={j}>{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}{[i.color, i.size].filter(Boolean).length ? ` · ${[i.color, i.size].filter(Boolean).join(' · ')}` : ''}</li>)}</ul>
              <div className="mt-2.5 flex items-center justify-between gap-2"><span className="font-semibold tabular-nums">{egp(r.total)}</span><Button size="sm" icon={ShoppingCart} onClick={() => onPick(r)}>العميل وصل — حمّل في السلة</Button></div>
            </li>))}
        </ul>)}
      <p className="mt-3 text-xs text-muted">القطع دي متشالة من المخزون من وقت الحجز، فبيعها هنا مش هيخصمها تاني. اللي العميل ميخدهوش يرجع للبيع لوحده.</p>
    </Modal>
  );
}

function QueueModal({ queue, onClose, retry, discard, sync, online }) {
  return (
    <Modal title="فواتير مستنية الإرسال" onClose={onClose} wide footer={<Button full icon={CloudUpload} disabled={!online} onClick={sync}>{online ? 'ابعت دلوقتي' : 'مفيش نت'}</Button>}>
      {queue.length === 0 ? <p className="py-8 text-center text-muted">كل الفواتير وصلت للسيرفر.</p> : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {queue.map((e) => (
            <li key={e.uuid} className="p-3">
              <div className="flex items-center gap-3"><span className="font-semibold">{e.body.localNo}</span><span className="text-sm text-muted">{timeOf(e.body.createdAt)}</span><span className="ms-auto font-semibold tabular-nums">{egp(e.receipt.total)}</span></div>
              {e.state === 'failed' ? (
                <div className="mt-2 rounded-xl bg-sale/5 p-2.5 text-sm"><p className="text-sale">السيرفر رفضها: {e.error?.message}</p>
                  <div className="mt-2 flex gap-2"><Button size="xs" variant="secondary" onClick={() => retry(e.uuid)}>إعادة المحاولة</Button><Button size="xs" variant="danger-ghost" onClick={() => window.confirm('الفاتورة دي هتتشال من الجهاز ومش هتتسجل. متأكد؟') && discard(e.uuid)}>حذف</Button></div></div>
              ) : <p className="mt-1 text-xs text-muted">محفوظة على الجهاز، هتتبعت أول ما النت يشتغل.</p>}
            </li>))}
        </ul>)}
    </Modal>
  );
}

/* ------------------------------------------------------------------ screen */

export default function Pos() {
  useTheme(DASHBOARD_THEME);
  const toast = useToast();
  const pos = usePos();
  const { products, store, queue, online } = pos;
  const [text, setText] = useState('');
  const [cart, setCart] = useState([]);
  const [disc, setDisc] = useState({ type: 'amount', value: '' });
  const [picker, setPicker] = useState(null);
  const [modal, setModal] = useState(null); // pay | receipt | day | queue | invoice
  const [receipt, setReceipt] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [autoPrint, setAutoPrint] = useState(() => { try { return localStorage.getItem('twist.pos.autoprint') !== '0'; } catch { return true; } });
  const [offlineReady, setOfflineReady] = useState(false);
  const [res, setRes] = useState(null); // the reservation being sold, if any
  const [category, setCategory] = useState('');
  const [openingCash, setOpeningCash] = useState('0');
  const [openingBusy, setOpeningBusy] = useState(false);
  const [barcodeToRegister, setBarcodeToRegister] = useState('');
  const searchRef = useRef(null);

  // Load the camera scanner quietly once (online), so it is in the offline cache before anyone needs it without internet.
  useEffect(() => {
    if (!navigator.onLine) return undefined;
    const t = setTimeout(() => { import('@zxing/browser').catch(() => {}); }, 5000);
    return () => clearTimeout(t);
  }, []);

  // Ask the service worker to keep this page and its build files, so the cashier opens with no internet from now on.
  useEffect(() => {
    try { localStorage.setItem('twist.pos.seen', '1'); } catch { /* ignore */ }
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (e) => { if (e.data?.type === 'pos-cache') setOfflineReady(!!e.data.ok); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    navigator.serviceWorker.ready.then((reg) => {
      const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.includes('/assets/'));
      reg.active?.postMessage({ type: 'cache-pos', urls });
    }).catch(() => {});
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  const index = useMemo(() => buildIndex(products), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [products]);
  const inCategory = useMemo(() => category ? products.filter((p) => p.category === category) : products, [products, category]);
  const shown = useMemo(() => searchProducts(inCategory, text), [inCategory, text]);
  const popular = useMemo(() => [...products].sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 5), [products]);
  const lowStock = useMemo(() => products.filter((p) => p.track && p.lowStockAt > 0 && productStock(p) <= p.lowStockAt).sort((a, b) => productStock(a) - productStock(b)).slice(0, 5), [products]);
  const t = totals(cart, { type: disc.type, value: num(disc.value) });
  const waiting = queue.filter((e) => e.state === 'pending').length;
  const failed = queue.filter((e) => e.state === 'failed').length;

  const add = useCallback((product, variant) => {
    setCart((c) => addToCart(c, product, variant));
    const held = (variant || product).held;
    if (held) toast({ tone: 'info', title: 'فيه قطعة من دي محجوزة لعميل', description: 'لو ده صاحب الحجز، افتحه من «حجوزات» عشان القطعة متتخصمش مرتين.' });
    else if (product.track && (variant ? variant.stock : product.stock) <= 0) toast({ tone: 'info', title: 'الرصيد صفر', description: `${product.name} — البيع هيتسجل بدون رصيد` });
  }, [toast]);

  const scan = useCallback((code) => {
    const r = lookupCode(index, code);
    if (!r) { setBarcodeToRegister(code); setText(code); toast({ tone: 'info', title: 'الباركود مش مسجل', description: 'تقدر تضيف الصنف بنفس الكود من هنا.' }); return false; }
    setBarcodeToRegister('');
    if (r.ambiguous) { toast({ tone: 'error', title: 'الكود ده مكرر على أكتر من صنف', description: 'دوّر بالاسم واختار الصنف.' }); setText(code); return false; }
    const { product, variant } = r.hit;
    if (!variant && product.variants.length) setPicker(product); else add(product, variant);
    setText(''); return true;
  }, [index, add, toast]);
  // ---- phone used as a barcode scanner (paired by QR); codes arrive over a live connection
  const [remote, setRemote] = useState(null); // { token }
  const [phoneAt, setPhoneAt] = useState(null);
  const remoteKey = store ? `remote:${store.id}` : null;
  useEffect(() => {
    if (!remoteKey) return;
    pos.db.current?.get(remoteKey).then((v) => setRemote(v || null)).catch(() => {});
  }, [remoteKey, pos.db, pos.phase]);
  const remoteScan = useRef(null);
  remoteScan.current = (code) => {
    if (modal && modal !== 'phone-scanner') return { ok: false, text: 'فيه شاشة مفتوحة على الكاشير، قفلها الأول وامسح تاني' };
    if (picker) return { ok: false, text: 'الكاشير لسه بيختار مقاس للصنف اللي قبله' };
    if (modal === 'phone-scanner') setModal(null);
    const r = lookupCode(index, code);
    scan(code);
    if (!r) return { ok: false, text: 'الكود ده مش متسجل على أي صنف' };
    if (r.ambiguous) return { ok: false, text: 'الكود مكرر على أكتر من صنف، اختار من الكمبيوتر' };
    const { product, variant } = r.hit;
    if (!variant && product.variants.length) return { ok: true, text: `${product.name} — اختار المقاس على الكمبيوتر` };
    return { ok: true, text: `اتضاف: ${product.name}${variant ? ` · ${[variant.color, variant.size].filter(Boolean).join(' ')}` : ''}` };
  };
  useEffect(() => {
    if (!remote?.token || !online || typeof EventSource === 'undefined') return undefined;
    const base = `/api/pos-remote/${encodeURIComponent(remote.token)}`;
    const es = new EventSource(`${base}/events`);
    es.addEventListener('hello', (e) => { try { setPhoneAt(JSON.parse(e.data).phoneSeenAt || null); } catch { /* ignore */ } });
    es.addEventListener('phone', (e) => { try { setPhoneAt(JSON.parse(e.data).at); } catch { /* ignore */ } });
    es.addEventListener('scan', (e) => {
      let d; try { d = JSON.parse(e.data); } catch { return; }
      setPhoneAt(new Date().toISOString());
      const answer = remoteScan.current?.(String(d.code || '')) || { ok: false, text: '' };
      fetch(`${base}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: d.id, ...answer }) }).catch(() => {});
    });
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return; // the browser reconnects by itself
      // closed for good: the pairing was removed or expired → forget it on this computer
      fetch(base).then((r) => { if (r.status === 404 && remoteKey) { pos.db.current?.set(remoteKey, null); setRemote(null); } }).catch(() => {});
    };
    return () => es.close();
  }, [remote?.token, online, remoteKey, pos.db]);
  const createRemote = async () => {
    const r = await api('/pos/remote', { method: 'POST' });
    const v = { token: r.token, expiresAt: r.expiresAt };
    await pos.db.current?.set(remoteKey, v); setRemote(v); setPhoneAt(null);
  };
  const unpairRemote = async () => {
    if (remote?.token) await api(`/pos/remote/${encodeURIComponent(remote.token)}`, { method: 'DELETE' }).catch(() => {});
    await pos.db.current?.set(remoteKey, null); setRemote(null); setPhoneAt(null);
  };
  const [, tick] = useState(0);
  useEffect(() => { if (!remote) return undefined; const id = setInterval(() => tick((n) => n + 1), 20000); return () => clearInterval(id); }, [remote]);
  const phoneLive = phoneAt && Date.now() - Date.parse(phoneAt) < 40000;

  const cameraDetected = useCallback((code) => {
    scan(code); setModal(null); searchRef.current?.focus();
  }, [scan]);

  // barcode scanners type like a keyboard: fast characters then Enter
  useEffect(() => {
    const buf = createScanBuffer();
    const k = (e) => {
      if (modal || picker) return;
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && document.activeElement !== searchRef.current;
      if (inField) return;
      const code = buf.push(e.key);
      if (code && document.activeElement !== searchRef.current) { e.preventDefault(); scan(code); }
      else if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [modal, picker, scan]);

  const onSearchKey = (e) => {
    if (e.key !== 'Enter' || !text.trim()) return;
    e.preventDefault();
    if (lookupCode(index, text)) { scan(text.trim()); return; }
    if (shown.length === 0 && normCode(text).length >= 4) { setBarcodeToRegister(text.trim()); return; }
    if (shown.length === 1) { const p = shown[0]; if (p.variants.length) setPicker(p); else add(p, null); setText(''); }
  };

  const loadReservation = (r) => {
    if (cart.length && !window.confirm('السلة فيها حاجات. نشيلها ونحمّل الحجز؟')) return;
    setCart(reservationCart(products, r)); setDisc({ type: 'amount', value: '' }); setRes(r); setModal(null); setCartOpen(true);
  };
  const clearAll = () => { setRes(null); setCart([]); setDisc({ type: 'amount', value: '' }); setText(''); setCartOpen(false); searchRef.current?.focus(); };

  const pay = async ({ payments, customerName, customerPhone }) => {
    setPaying(true);
    try {
      const r = await pos.checkout({ cart, discount: { type: disc.type, value: num(disc.value) }, payments, customerName: customerName || res?.name || '', customerPhone: customerPhone || res?.phone || '', reservation: res });
      setReceipt(r); setModal('receipt'); clearAll();
    } catch (e) { toast({ tone: 'error', title: 'مقدرناش نحفظ الفاتورة على الجهاز', description: e.message }); } finally { setPaying(false); }
  };

  if (pos.phase === 'signin') return <Navigate to="/login?next=%2Fpos" replace />;
  if (pos.phase === 'loading') return <div className="grid min-h-dvh place-items-center text-muted">جاري تجهيز الكاشير…</div>;
  if (pos.phase === 'blocked') return (
    <div className="grid min-h-dvh place-items-center p-6 text-center"><div className="max-w-sm"><AlertTriangle className="mx-auto h-10 w-10 text-amber-500" /><h1 className="mt-3 text-xl font-bold">الكاشير مش متاح دلوقتي</h1><p className="mt-2 text-muted">{BLOCKED[pos.blocked?.code] || pos.blocked?.message}</p>
      {queue.length > 0 && <p className="mt-3 text-sm">فيه {queue.length} فاتورة محفوظة على الجهاز، هتتبعت أول ما الكاشير يرجع.</p>}<Button className="mt-5" to="/dashboard" variant="secondary" iconEnd={ArrowRight}>رجوع للوحة التحكم</Button></div></div>);
  if (pos.phase === 'empty' || pos.phase === 'offline-empty') return (
    <div className="grid min-h-dvh place-items-center p-6 text-center"><div className="max-w-sm"><WifiOff className="mx-auto h-10 w-10 text-muted" /><h1 className="mt-3 text-xl font-bold">لازم تفتح الكاشير مرة واحدة والنت شغال</h1><p className="mt-2 text-muted">أول مرة بس بنحمّل فيها المنتجات على الجهاز. بعدها يشتغل من غير نت.</p><Button className="mt-5" onClick={() => window.location.reload()}>حاول تاني</Button></div></div>);

  if (pos.phase === 'ready' && !pos.shift) return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-4 text-fg" dir="rtl"><div className="w-full max-w-lg rounded-3xl border border-line bg-elevated p-6 shadow-lift sm:p-8">
      <div className="mb-5 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Receipt className="h-6 w-6" /></span><div><p className="text-sm text-muted">{store?.name}</p><h1 className="text-2xl font-bold">ابدأ وردية جديدة</h1></div></div>
      <p className="mb-5 text-sm leading-6 text-muted">عدّ الفكة الموجودة في الدرج قبل أول بيعة. في نهاية الوردية هنقارن المبلغ الفعلي بالمبيعات والحركات المسجلة.</p>
      <label className="block"><span className="mb-1 block text-sm font-semibold">رصيد بداية الدرج · جنيه</span><input inputMode="numeric" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="h-14 w-full rounded-xl border border-line px-4 text-xl font-bold tabular-nums focus:outline-none focus:shadow-ring" /></label>
      {!online && <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">مفيش وردية مفتوحة محفوظة على الجهاز. اتصل بالإنترنت لفتح وردية جديدة.</p>}
      <Button full size="lg" className="mt-4" disabled={!online || openingBusy} loading={openingBusy} onClick={async () => { setOpeningBusy(true); try { await pos.openShift(num(openingCash)); toast({ title: 'الوردية بدأت' }); } catch (e) { toast({ tone: 'error', title: e.message }); } finally { setOpeningBusy(false); } }}>فتح الوردية</Button>
      {pos.closedShift && <div className="mt-5 rounded-2xl border border-line p-4"><p className="font-semibold">آخر وردية مقفولة</p><div className="mt-2 grid grid-cols-2 gap-2 text-sm"><Stat label="المتوقع" value={egp(pos.closedShift.expectedCash)} /><Stat label="المعدود" value={egp(pos.closedShift.countedCash)} /><Stat label="الفرق" value={egp(pos.closedShift.difference)} /></div></div>}
      <Link to="/dashboard" className="mt-5 block text-center text-sm font-medium text-muted hover:text-fg">رجوع للوحة التحكم</Link>
    </div></div>);

  return (
    <div className="flex h-dvh flex-col bg-canvas text-fg" dir="rtl">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-elevated px-3 py-2.5 sm:px-4">
        <Link to="/dashboard" aria-label="لوحة التحكم" className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg/[0.07]"><ArrowRight className="h-5 w-5" /></Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">كاشير · {store?.name}</h1>
        {/* on a phone the buttons get their own row that scrolls sideways, so the name stays readable and nothing leaves the screen */}
        <div className="flex items-center gap-2 max-md:order-last max-md:-mx-3 max-md:w-[calc(100%+1.5rem)] max-md:overflow-x-auto max-md:px-3 max-md:pb-1 [&>*]:shrink-0">
        <button type="button" onClick={() => setModal('quick-product')} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-on-primary hover:opacity-90"><PackagePlus className="h-4 w-4" /><span className="hidden sm:inline">صنف جديد</span></button>
        <button type="button" onClick={() => setModal('phone-scanner')} className={cx('inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium hover:bg-fg/[0.05]', phoneLive ? 'border-success text-success' : 'border-line')} aria-label="الموبايل كقارئ باركود"><Smartphone className="h-4 w-4" /><span className="hidden sm:inline">{phoneLive ? 'الموبايل متوصل' : 'موبايل كقارئ'}</span></button>
        <button type="button" onClick={() => setModal('camera-scan')} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]" aria-label="مسح باركود بالكاميرا"><Camera className="h-4 w-4" /><span className="hidden sm:inline">مسح بالكاميرا</span></button>
        <button type="button" onClick={() => setModal('receive-stock')} disabled={!online} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05] disabled:opacity-50"><Plus className="h-4 w-4" /><span className="hidden sm:inline">استلام بضاعة</span></button>
        <button type="button" onClick={() => setModal('shift')} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]"><CalendarCheck className="h-4 w-4" /><span className="hidden sm:inline">الوردية</span></button>
        <span className={cx('hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex', online ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-900')}>{online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{online ? 'متصل' : 'أوفلاين'}</span>
        {offlineReady && <span className="hidden text-xs text-muted lg:inline">جاهز للأوفلاين</span>}
        {(waiting > 0 || failed > 0) && <button type="button" onClick={() => setModal('queue')} className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold', failed ? 'bg-sale/10 text-sale' : 'bg-amber-100 text-amber-900')}><CloudUpload className="h-3.5 w-3.5" />{failed ? `${failed} مرفوضة` : `${waiting} مستنية`}</button>}
        {pos.reservations.length > 0 && <button type="button" onClick={() => { pos.refreshReservations(); setModal('reservations'); }} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]"><CalendarCheck className="h-4 w-4" /><span className="hidden sm:inline">حجوزات</span><span className="rounded-full bg-btn px-1.5 text-xs font-bold text-on-btn tabular-nums">{pos.reservations.length}</span></button>}
        <button type="button" onClick={() => setModal('invoice-find')} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]"><RotateCcw className="h-4 w-4" /><span className="hidden sm:inline">مرتجع</span></button>
        <button type="button" onClick={() => setModal('day')} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]"><CalendarDays className="h-4 w-4" /><span className="hidden sm:inline">اليوم</span></button>
        <label className="hidden cursor-pointer items-center gap-1.5 text-xs text-muted lg:flex"><input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); try { localStorage.setItem('twist.pos.autoprint', e.target.checked ? '1' : '0'); } catch { /* ignore */ } }} />طباعة تلقائية</label>
        </div>
      </header>

      {!pos.safeStorage && <div className="bg-sale px-4 py-2 text-center text-sm font-semibold text-on-sale">المتصفح مش سامح بتخزين على الجهاز — متشتغلش أوفلاين، الفواتير ممكن تضيع لو النت قطع.</div>}
      {pos.authExpired && <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">الجلسة انتهت — الفواتير بتتحفظ على الجهاز. <Link to="/login?next=%2Fpos" className="font-bold underline">سجّل دخول</Link> عشان تتبعت.</div>}

      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_380px]">
        <section className="flex min-h-0 flex-col">
          <div className="border-b border-line p-3">
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input ref={searchRef} autoFocus value={text} onChange={(e) => { setText(e.target.value); setBarcodeToRegister(''); }} onKeyDown={onSearchKey} placeholder="اكتب اسم المنتج أو امسح الباركود" aria-label="بحث عن منتج أو مسح باركود" className="h-12 w-full rounded-2xl border border-line bg-elevated ps-11 pe-4 text-base focus:outline-none focus:shadow-ring" />
              <ScanBarcode className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" /></div>
            {!text && popular.length > 0 && <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1"><span className="shrink-0 text-xs font-semibold text-muted">الأكثر مبيعًا</span>{popular.map((p) => <button key={p.id} type="button" onClick={() => p.variants.length ? setPicker(p) : add(p, null)} className="shrink-0 rounded-xl border border-line bg-elevated px-3 py-2 text-start hover:border-primary"><span className="block max-w-36 truncate text-xs font-semibold">{p.name}</span><span className="mt-0.5 block text-[11px] tabular-nums text-muted">{egp(p.price)}</span></button>)}</div>}
            {!text && lowStock.length > 0 && <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1"><span className="shrink-0 text-xs font-semibold text-amber-800">قرب يخلص</span>{lowStock.map((p) => <button key={p.id} type="button" onClick={() => setModal({ receiveStockProduct: p })} disabled={!online} className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-start disabled:opacity-50"><span className="block max-w-36 truncate text-xs font-semibold">{p.name}</span><span className="mt-0.5 block text-[11px] text-amber-800">متبقي {productStock(p)} · استلام</span></button>)}</div>}
            {categories.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setCategory('')} className={cx('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', !category ? 'bg-btn text-on-btn' : 'bg-surface text-muted hover:text-fg')}>كل الأصناف</button>{categories.map((c) => <button key={c} type="button" onClick={() => setCategory(c)} className={cx('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', category === c ? 'bg-btn text-on-btn' : 'bg-surface text-muted hover:text-fg')}>{c}</button>)}</div>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 md:pb-3">
            {shown.length === 0 ? <div className="mx-auto grid max-w-md justify-items-center gap-3 py-12 text-center"><p className="text-sm text-muted">{barcodeToRegister ? 'الباركود ده مش مربوط بصنف لسه.' : (text ? 'مش لاقيين الصنف بالاسم ده.' : 'مفيش أصناف في القسم ده.')}</p><Button icon={PackagePlus} onClick={() => setModal(barcodeToRegister ? { newProductBarcode: barcodeToRegister } : 'quick-product')} disabled={!online}>{barcodeToRegister ? 'أضف الصنف بالباركود ده' : 'أضف الصنف من هنا'}</Button>{!online && <p className="text-xs text-muted">إضافة صنف جديد تحتاج إنترنت. البيع من الكتالوج المحمّل يفضل متاح.</p>}</div> : (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {shown.map((p) => { const st = productStock(p); const out = p.track && st <= 0; return (
                  <li key={p.id}><button type="button" data-testid="product" onClick={() => (p.variants.length ? setPicker(p) : add(p, null))} className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-elevated text-start transition hover:border-primary active:scale-[.98]">
                    <SmartImage media={p.image} alt={p.name} ratio="4 / 3" sizes="(max-width: 640px) 50vw, 25vw" className="w-full bg-surface" />
                    <span className="flex w-full flex-1 flex-col p-3"><span className="line-clamp-2 min-h-[2.5rem] font-medium leading-snug">{p.name}</span>
                    <span className="mt-2 text-lg font-bold tabular-nums">{egp(p.price)}</span>
                    <span className={cx('mt-1 text-xs', out ? 'text-sale' : 'text-muted')}>{p.track ? (out ? 'نفد' : `متاح ${st}`) : 'بدون رصيد'}{p.variants.length ? ` · ${p.variants.length} لون/مقاس` : ''}{p.held ? ` · محجوز ${p.held}` : ''}</span></span></button></li>); })}
              </ul>)}
          </div>
        </section>

        <aside className={cx('flex min-h-0 flex-col border-s border-line bg-elevated max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:max-h-[85dvh] max-md:rounded-t-3xl max-md:shadow-sheet', !cartOpen && 'max-md:hidden')} aria-label="السلة">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">السلة {t.pieces > 0 && <span className="text-muted">({t.pieces})</span>}</h2>
            <div className="flex gap-1">{cart.length > 0 && <button type="button" onClick={clearAll} className="rounded-lg px-2.5 py-1.5 text-sm text-sale hover:bg-sale/10">فضّي</button>}<button type="button" onClick={() => setCartOpen(false)} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-full hover:bg-fg/[0.07] md:hidden"><X className="h-5 w-5" /></button></div></div>
          {res && <div className="flex items-center gap-2 border-b border-line bg-success/10 px-4 py-2.5 text-sm text-success"><CalendarCheck className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate font-semibold">حجز {res.name} · <span dir="ltr">{res.number}</span></span><button type="button" onClick={() => setRes(null)} className="text-xs underline">مش حجز</button></div>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? <div className="grid h-full min-h-[160px] place-items-center p-6 text-center text-muted"><div><ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-40" />امسح باركود أو اختار منتج</div></div> : (
              <ul className="divide-y divide-line">
                {cart.map((l) => (
                  <li key={l.key} data-testid="cart-line" className="p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate font-medium">{l.name}</div>
                    <div className="text-xs text-muted">{[l.color, l.size].filter(Boolean).join(' · ')} {egp(l.price)}{l.track && l.qty > l.stock ? ' · أكتر من الرصيد' : ''}</div></div>
                    <div className="font-semibold tabular-nums">{egp(l.price * l.qty)}</div></div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button type="button" aria-label="أقل" onClick={() => setCart((c) => setQty(c, l.key, l.qty - 1))} className="grid h-9 w-9 place-items-center rounded-full border border-line"><Minus className="h-4 w-4" /></button>
                      <span className="w-8 text-center font-semibold tabular-nums">{l.qty}</span>
                      <button type="button" aria-label="أكتر" onClick={() => setCart((c) => setQty(c, l.key, l.qty + 1))} className="grid h-9 w-9 place-items-center rounded-full border border-line"><Plus className="h-4 w-4" /></button>
                      <button type="button" aria-label="شيل" onClick={() => setCart((c) => setQty(c, l.key, 0))} className="ms-auto grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-fg/[0.07]"><Trash2 className="h-4 w-4" /></button></div></li>))}
              </ul>)}
          </div>
          <div className="border-t border-line p-4">
            <Stat label="الإجمالي" value={egp(t.subtotal)} />
            <div className="flex items-center justify-between gap-2 py-1.5 text-sm"><span className="text-muted">خصم</span>
              <div className="flex items-center gap-1.5"><input inputMode="numeric" value={disc.value} onChange={(e) => setDisc((d) => ({ ...d, value: e.target.value }))} placeholder="0" aria-label="قيمة الخصم" className="h-9 w-20 rounded-lg border border-line px-2 text-center tabular-nums" />
                <div className="flex overflow-hidden rounded-lg border border-line text-xs font-semibold">{[['amount', 'ج.م'], ['percent', '%']].map(([k, l]) => <button key={k} type="button" onClick={() => setDisc((d) => ({ ...d, type: k }))} className={cx('px-2.5 py-2', disc.type === k ? 'bg-btn text-on-btn' : 'bg-elevated')}>{l}</button>)}</div></div></div>
            <div className="mt-1 flex items-end justify-between border-t border-line pt-3"><span className="font-semibold">المطلوب</span><span data-testid="total" className="text-3xl font-bold tabular-nums">{egp(t.total)}</span></div>
            <Button full size="lg" className="mt-3" disabled={!cart.length} icon={Receipt} onClick={() => setModal('pay')}>ادفع</Button>
          </div>
        </aside>
      </div>

      {!cartOpen && cart.length > 0 && <button type="button" onClick={() => setCartOpen(true)} className="fixed inset-x-3 bottom-3 z-30 flex h-14 items-center justify-between rounded-2xl bg-btn px-5 font-semibold text-on-btn shadow-lift md:hidden"><span className="inline-flex items-center gap-2"><ShoppingCart className="h-5 w-5" />السلة ({t.pieces})</span><span className="tabular-nums">{egp(t.total)}</span></button>}

      {picker && <VariantPicker product={picker} onClose={() => setPicker(null)} onPick={(v) => { add(picker, v); setPicker(null); searchRef.current?.focus(); }} />}
      {modal === 'phone-scanner' && <PhoneScannerModal remote={remote} phoneAt={phoneAt} online={online} onCreate={createRemote} onUnpair={unpairRemote} onClose={() => setModal(null)} />}
      {modal === 'camera-scan' && <CameraScannerModal onClose={() => setModal(null)} onDetected={cameraDetected} />}
      {(modal === 'quick-product' || modal?.newProductBarcode) && <QuickProductModal initialName={modal?.newProductBarcode ? '' : text} initialBarcode={modal?.newProductBarcode || ''} online={online} onClose={() => setModal(null)} onSaved={async (p) => {
        try { await pos.refresh(); } catch { /* The product is already saved; still add it to this register's local catalog. */ }
        setText(''); setCategory(''); setModal(null);
        if (p.variants.length) setPicker(p); else add(p, null);
      }} />}
      {(modal === 'receive-stock' || modal?.receiveStockProduct) && <ReceiveStockModal products={products} initialProduct={modal?.receiveStockProduct} online={online} onClose={() => setModal(null)} onReceive={pos.receiveStock} />}
      {modal === 'pay' && <PaySheet total={t.total} busy={paying} onClose={() => setModal(null)} onConfirm={pay} />}
      {modal === 'receipt' && receipt && <ReceiptModal storeName={store.name} sale={receipt} autoPrint={autoPrint} onClose={() => { setModal(null); searchRef.current?.focus(); }} />}
      {modal === 'reservations' && <ReservationsModal list={pos.reservations} onClose={() => setModal(null)} onPick={loadReservation} />}
      {modal === 'queue' && <QueueModal queue={queue} online={online} sync={pos.sync} retry={pos.retry} discard={pos.discard} onClose={() => setModal(null)} />}
      {modal === 'day' && <DayModal pending={waiting} onClose={() => setModal(null)} onOpen={(ref) => setModal({ invoice: ref })} />}
      {modal === 'invoice-find' && <FindInvoice onClose={() => setModal(null)} onOpen={(ref) => setModal({ invoice: ref })} />}
      {modal?.invoice && <InvoiceModal target={modal.invoice} store={store} shiftId={pos.shift?.id} onClose={() => setModal(null)} onChanged={pos.refresh} />}
      {modal === 'shift' && pos.shift && <ShiftModal shift={pos.shift} online={online} canClose={!cart.length && queue.length === 0} onClose={() => setModal(null)} onMove={pos.moveCash} onCloseShift={async (data) => {
        const closed = await pos.closeShift(data); setModal(null);
        toast({ title: 'الوردية اتقفلت', description: closed.difference ? `فرق الدرج ${egp(closed.difference)}` : 'الدرج مطابق للمبيعات.' });
      }} />}
    </div>
  );
}

function FindInvoice({ onClose, onOpen }) {
  const [n, setN] = useState('');
  return (
    <Modal title="مرتجع — رقم الفاتورة" onClose={onClose} footer={<Button full disabled={!num(n)} onClick={() => onOpen({ number: num(n) })}>افتح الفاتورة</Button>}>
      <input autoFocus inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && num(n) && onOpen({ number: num(n) })} placeholder="رقم الفاتورة المطبوع" className="h-14 w-full rounded-2xl border border-line px-4 text-center text-2xl font-bold tabular-nums focus:outline-none focus:shadow-ring" />
      <p className="mt-3 text-sm text-muted">الفواتير المؤقتة (م-0001) لازم تتبعت الأول وتاخد رقم رسمي. المرتجع بيحتاج نت.</p>
    </Modal>
  );
}
