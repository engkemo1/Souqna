import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Wifi, WifiOff, Search, Plus, Minus, Trash2, Receipt, RotateCcw, CalendarDays, CloudUpload, ShoppingCart, Printer, X, ArrowRight, AlertTriangle, ScanBarcode, Check } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/ui/Toast.jsx';
import Button from '../../components/ui/Button.jsx';
import { cx } from '../../components/ui/cx.js';
import { useTheme, DASHBOARD_THEME } from '../../lib/theme.js';
import { addToCart, buildIndex, createScanBuffer, lookupCode, productStock, searchProducts, setQty, settle, totals } from '../../lib/pos/engine.js';
import { egp, printHtml, receiptHtml } from '../../lib/pos/receipt.js';
import { usePos } from './usePos.js';

const METHODS = [['cash', 'نقدي'], ['card', 'بطاقة'], ['wallet', 'محفظة']];
const METHOD_NAME = Object.fromEntries(METHODS);
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

const Stat = ({ label, value, strong }) => (
  <div className="flex items-center justify-between py-1.5 text-sm"><span className="text-muted">{label}</span><span className={cx('tabular-nums', strong && 'text-base font-bold')}>{value}</span></div>
);

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
            <div className={cx('mt-0.5 text-xs', v.stock <= 0 && product.track ? 'text-sale' : 'text-muted')}>{product.track ? (v.stock > 0 ? `متاح ${v.stock}` : 'نفد من المخزون') : 'بدون متابعة مخزون'}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function PaySheet({ total, onClose, onConfirm, busy }) {
  const [rows, setRows] = useState([{ method: 'cash', amount: String(total) }]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const pays = rows.map((r) => ({ method: r.method, amount: num(r.amount) }));
  const s = settle(total, pays);
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

function InvoiceModal({ target: refSale, store, onClose, onChanged }) {
  const toast = useToast();
  const [sale, setSale] = useState(null);
  const [err, setErr] = useState(null);
  const [back, setBack] = useState({});
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(refSale.number ? `/pos/sales/number/${refSale.number}` : `/pos/sales/${refSale.id}`).then((d) => setSale(d.sale)).catch((e) => setErr(e.status === 0 ? 'محتاج نت عشان تفتح الفواتير القديمة.' : e.status === 404 ? 'مفيش فاتورة بالرقم ده.' : e.message));
  }, [refSale]);
  const preview = sale ? sale.items.reduce((s, it) => {
    const q = back[it.id] || 0; if (!q) return s;
    const net = it.price * it.qty - it.discount; const share = sale.subtotal ? Math.round((net * sale.discount) / sale.subtotal) : 0;
    return s + Math.round((net - share) / it.qty) * q;
  }, 0) : 0;
  const confirm = async () => {
    setBusy(true);
    try {
      const items = Object.entries(back).filter(([, q]) => q > 0).map(([saleItemId, qty]) => ({ saleItemId: Number(saleItemId), qty }));
      const r = await api('/pos/returns', { method: 'POST', body: { uuid: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, saleId: sale.id, items, method, reason } });
      setSale(r.sale); setBack({}); toast({ title: `تم المرتجع — ${egp(r.refund)}` }); onChanged?.();
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
        <Button className="ms-auto" disabled={!preview} loading={busy} icon={RotateCcw} onClick={confirm}>{preview ? `تأكيد مرتجع ${egp(preview)}` : 'اختار الأصناف للمرتجع'}</Button></div>}>
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
                  <div className="text-xs text-muted">{[it.color, it.size].filter(Boolean).join(' · ')} {it.qty} × {egp(it.price)}{it.returnedQty ? ` · اترجّع ${it.returnedQty}` : ''}{it.oversold ? ' · اتباع بدون رصيد' : ''}</div></div>
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
          {sale.returns.map((r) => <Stat key={r.id} label={`مرتجع ${timeOf(r.createdAt)}`} value={`− ${egp(r.refund)}`} />)}</div>
        {preview > 0 && (<div className="mt-3 flex items-center gap-2 text-sm"><span className="text-muted">رجّع الفلوس:</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-xl border border-line px-2">{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب (اختياري)" className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3" /></div>)}
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
  const searchRef = useRef(null);

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
  const shown = useMemo(() => searchProducts(products, text), [products, text]);
  const t = totals(cart, { type: disc.type, value: num(disc.value) });
  const waiting = queue.filter((e) => e.state === 'pending').length;
  const failed = queue.filter((e) => e.state === 'failed').length;

  const add = useCallback((product, variant) => {
    setCart((c) => addToCart(c, product, variant));
    if (product.track && (variant ? variant.stock : product.stock) <= 0) toast({ tone: 'info', title: 'الرصيد صفر', description: `${product.name} — البيع هيتسجل بدون رصيد` });
  }, [toast]);

  const scan = useCallback((code) => {
    const r = lookupCode(index, code);
    if (!r) { toast({ tone: 'error', title: 'الكود ده مش موجود', description: code }); return false; }
    if (r.ambiguous) { toast({ tone: 'error', title: 'الكود ده مكرر على أكتر من صنف', description: 'دوّر بالاسم واختار الصنف.' }); setText(code); return false; }
    const { product, variant } = r.hit;
    if (!variant && product.variants.length) setPicker(product); else add(product, variant);
    setText(''); return true;
  }, [index, add, toast]);

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
    if (shown.length === 1) { const p = shown[0]; if (p.variants.length) setPicker(p); else add(p, null); setText(''); }
  };

  const clearAll = () => { setCart([]); setDisc({ type: 'amount', value: '' }); setText(''); setCartOpen(false); searchRef.current?.focus(); };

  const pay = async ({ payments, customerName, customerPhone }) => {
    setPaying(true);
    try {
      const r = await pos.checkout({ cart, discount: { type: disc.type, value: num(disc.value) }, payments, customerName, customerPhone });
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

  return (
    <div className="flex h-dvh flex-col bg-canvas text-fg" dir="rtl">
      <header className="flex items-center gap-2 border-b border-line bg-elevated px-3 py-2.5 sm:px-4">
        <Link to="/dashboard" aria-label="لوحة التحكم" className="grid h-10 w-10 place-items-center rounded-full hover:bg-fg/[0.07]"><ArrowRight className="h-5 w-5" /></Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">كاشير · {store?.name}</h1>
        <span className={cx('hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex', online ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-900')}>{online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{online ? 'متصل' : 'أوفلاين'}</span>
        {offlineReady && <span className="hidden text-xs text-muted lg:inline">جاهز للأوفلاين</span>}
        {(waiting > 0 || failed > 0) && <button type="button" onClick={() => setModal('queue')} className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold', failed ? 'bg-sale/10 text-sale' : 'bg-amber-100 text-amber-900')}><CloudUpload className="h-3.5 w-3.5" />{failed ? `${failed} مرفوضة` : `${waiting} مستنية`}</button>}
        <button type="button" onClick={() => setModal('invoice-find')} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]"><RotateCcw className="h-4 w-4" /><span className="hidden sm:inline">مرتجع</span></button>
        <button type="button" onClick={() => setModal('day')} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-fg/[0.05]"><CalendarDays className="h-4 w-4" /><span className="hidden sm:inline">اليوم</span></button>
        <label className="hidden cursor-pointer items-center gap-1.5 text-xs text-muted lg:flex"><input type="checkbox" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); try { localStorage.setItem('twist.pos.autoprint', e.target.checked ? '1' : '0'); } catch { /* ignore */ } }} />طباعة تلقائية</label>
      </header>

      {!pos.safeStorage && <div className="bg-sale px-4 py-2 text-center text-sm font-semibold text-white">المتصفح مش سامح بتخزين على الجهاز — متشتغلش أوفلاين، الفواتير ممكن تضيع لو النت قطع.</div>}
      {pos.authExpired && <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">الجلسة انتهت — الفواتير بتتحفظ على الجهاز. <Link to="/login?next=%2Fpos" className="font-bold underline">سجّل دخول</Link> عشان تتبعت.</div>}

      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_380px]">
        <section className="flex min-h-0 flex-col">
          <div className="border-b border-line p-3">
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input ref={searchRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onSearchKey} placeholder="ابحث بالاسم أو امسح الباركود (F2)" aria-label="بحث عن منتج" className="h-12 w-full rounded-2xl border border-line bg-elevated ps-11 pe-4 text-base focus:outline-none focus:shadow-ring" />
              <ScanBarcode className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" /></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 md:pb-3">
            {shown.length === 0 ? <p className="py-16 text-center text-muted">مفيش منتج بالاسم ده.</p> : (
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {shown.map((p) => { const st = productStock(p); const out = p.track && st <= 0; return (
                  <li key={p.id}><button type="button" data-testid="product" onClick={() => (p.variants.length ? setPicker(p) : add(p, null))} className="flex h-full w-full flex-col rounded-2xl border border-line bg-elevated p-3 text-start transition hover:border-primary active:scale-[.98]">
                    <span className="line-clamp-2 min-h-[2.5rem] font-medium leading-snug">{p.name}</span>
                    <span className="mt-2 text-lg font-bold tabular-nums">{egp(p.price)}</span>
                    <span className={cx('mt-1 text-xs', out ? 'text-sale' : 'text-muted')}>{p.track ? (out ? 'نفد' : `متاح ${st}`) : 'بدون رصيد'}{p.variants.length ? ` · ${p.variants.length} موديل` : ''}</span></button></li>); })}
              </ul>)}
          </div>
        </section>

        <aside className={cx('flex min-h-0 flex-col border-s border-line bg-elevated max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:max-h-[85dvh] max-md:rounded-t-3xl max-md:shadow-sheet', !cartOpen && 'max-md:hidden')} aria-label="السلة">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">السلة {t.pieces > 0 && <span className="text-muted">({t.pieces})</span>}</h2>
            <div className="flex gap-1">{cart.length > 0 && <button type="button" onClick={clearAll} className="rounded-lg px-2.5 py-1.5 text-sm text-sale hover:bg-sale/10">فضّي</button>}<button type="button" onClick={() => setCartOpen(false)} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-full hover:bg-fg/[0.07] md:hidden"><X className="h-5 w-5" /></button></div></div>
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
      {modal === 'pay' && <PaySheet total={t.total} busy={paying} onClose={() => setModal(null)} onConfirm={pay} />}
      {modal === 'receipt' && receipt && <ReceiptModal storeName={store.name} sale={receipt} autoPrint={autoPrint} onClose={() => { setModal(null); searchRef.current?.focus(); }} />}
      {modal === 'queue' && <QueueModal queue={queue} online={online} sync={pos.sync} retry={pos.retry} discard={pos.discard} onClose={() => setModal(null)} />}
      {modal === 'day' && <DayModal pending={waiting} onClose={() => setModal(null)} onOpen={(ref) => setModal({ invoice: ref })} />}
      {modal === 'invoice-find' && <FindInvoice onClose={() => setModal(null)} onOpen={(ref) => setModal({ invoice: ref })} />}
      {modal?.invoice && <InvoiceModal target={modal.invoice} store={store} onClose={() => setModal(null)} onChanged={pos.refresh} />}
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
