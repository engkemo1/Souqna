import { useState } from 'react';
import { MessageCircle, Copy, Check, Headset, Sparkles, ChevronDown } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useDashBase } from '../../lib/dashBase.js';
import { useToast } from '../ui/Toast.jsx';

const TEMPLATE = ['الاسم: فستان سواريه', 'السعر: 350', 'قبل الخصم: 450', 'الألوان: أسود، أحمر', 'المقاسات: S M L XL', 'الخامة: ستان', 'مفيش استبدال'].join('\n');
const wa = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;

/** «Add products from WhatsApp»: this month's usage, the caption to copy, and a friendly monthly-plan offer that opens a chat with Twist. */
export default function WaProductsCard({ className = '' }) {
  const base = useDashBase();
  const { store } = useAuth();
  const { tr, isRtl } = useI18n();
  const toast = useToast();
  const { data } = useApi('/owner/wa-products');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  if (base !== '/dashboard' || !data) return null; // admin managing a store: not shown
  const ar = isRtl;
  const name = tr(store.name);
  const pct = data.limit ? Math.min(100, Math.round((data.used / data.limit) * 100)) : 0;
  const out = data.enabled && data.left === 0;
  const low = data.enabled && data.left > 0 && data.left <= 3;
  const copy = async () => {
    try { await navigator.clipboard.writeText(TEMPLATE); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { toast({ tone: 'error', title: ar ? 'معرفناش ننسخ، انسخه بإيدك' : 'Could not copy' }); }
  };
  const chip = 'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition active:scale-[0.98]';
  const upgradeText = ar ? `أهلاً تويست، أنا صاحب محل «${name}». عايز أشترك في الباقة الشهرية لزيادة حد الإضافة بواتساب.` : `Hi Twist, I own “${name}”. I'd like the monthly plan to raise my WhatsApp limit.`;
  return (
    <section className={`overflow-hidden rounded-3xl border border-line bg-elevated shadow-sm ${className}`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><MessageCircle className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-extrabold leading-snug">{ar ? 'ضيف منتجاتك من واتساب' : 'Add products from WhatsApp'}</p>
            <p className="mt-1 text-[13px] leading-6 text-muted">
              {data.enabled
                ? (ar ? 'ابعت صورة القطعة واكتب اسمها وسعرها. إحنا بنكتب الوصف، وانت بتضغط «نشر الآن».' : 'Send a photo with its name and price. We write the rest; you tap “Publish”.')
                : (ar ? 'الإضافة بواتساب مش مفعّلة لمحلك دلوقتي. تقدر تضيف من لوحة التحكم، أو كلّم الشركة لتفعيلها.' : 'WhatsApp adding is off for your store right now.')}
            </p>
          </div>
        </div>

        {data.enabled && (
          <div className="mt-4 rounded-2xl bg-secondary p-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">{ar ? 'استخدامك الشهر ده' : 'Used this month'}</span>
              <span className={`text-base font-extrabold ${out ? 'text-sale' : ''}`}>{data.used}<span className="font-semibold text-muted"> / {data.limit}</span></span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full transition-all ${out || low ? 'bg-sale' : 'bg-brand'}`} style={{ width: `${Math.max(pct, data.used ? 6 : 0)}%` }} /></div>
            <p className="mt-2 text-xs text-muted">{out ? (ar ? 'خلص حدك الشهري، وبيتجدد أول الشهر الجاي.' : 'Limit reached; it renews next month.') : (ar ? `باقي لك ${data.left} منتج الشهر ده.` : `${data.left} left this month.`)}</p>
          </div>
        )}

        {data.enabled && (
          <div className="mt-3">
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between rounded-xl py-1 text-sm font-semibold text-brand">
              {ar ? 'شوف شكل الكابشن اللي تكتبه تحت الصورة' : 'See the caption to write under the photo'}
              <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="mt-2">
                <pre dir={ar ? 'rtl' : 'ltr'} className="whitespace-pre-wrap rounded-xl border border-line bg-canvas p-3 text-[13px] leading-6">{TEMPLATE}</pre>
                <p className="mt-1.5 text-xs text-muted">{ar ? 'المطلوب الاسم والسعر بس، والباقي اختياري. لأكتر من صورة للقطعة ابعتهم ورا بعض.' : 'Only name and price are required.'}</p>
                <button type="button" onClick={copy} className={`${chip} mt-2 h-10 border border-line-strong`}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? (ar ? 'اتنسخ' : 'Copied') : (ar ? 'انسخ الكابشن' : 'Copy caption')}</button>
              </div>
            )}
          </div>
        )}

        {data.enabled && data.botNumber && (
          <a href={wa(data.botNumber, 'مساعدة')} target="_blank" rel="noreferrer" className={`${chip} mt-3 w-full bg-btn text-on-btn`}><MessageCircle className="h-4 w-4" />{ar ? 'افتح واتساب وضيف منتج' : 'Open WhatsApp'}</a>
        )}
      </div>

      <div className={`border-t border-line p-4 sm:p-5 ${out ? 'bg-sale/5' : 'bg-brand/5'}`}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand/15 text-brand"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{ar ? 'زوّد حدك باشتراك بسيط كل شهر' : 'Raise your limit with a simple monthly plan'}</p>
            <p className="mt-0.5 text-[13px] leading-6 text-muted">{ar ? 'وضيف كل منتجاتك من واتساب من غير حد، وفي أي وقت.' : 'Add all your products from WhatsApp, anytime.'}{data.price ? <span className="ms-1 font-bold text-fg">{data.price}</span> : null}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={wa(data.company, upgradeText)} target="_blank" rel="noreferrer" className={`${chip} ${out || low ? 'bg-btn text-on-btn' : 'border border-line-strong'} flex-1 sm:flex-none`}><Sparkles className="h-4 w-4" />{ar ? 'اشترك دلوقتي' : 'Subscribe'}</a>
          <a href={wa(data.company, ar ? `أهلاً تويست، أنا صاحب محل «${name}» ومحتاج مساعدة.` : `Hi Twist, I own “${name}” and need help.`)} target="_blank" rel="noreferrer" className={`${chip} border border-line-strong flex-1 sm:flex-none`}><Headset className="h-4 w-4" />{ar ? 'كلّم الشركة' : 'Contact Twist'}</a>
        </div>
      </div>
    </section>
  );
}
