import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shirt, Check, ArrowRight, PhoneCall, MessageCircle, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';
import MarketHeader from '../../components/market/MarketHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Input, Textarea } from '../../components/ui/Field.jsx';
import { errorMessage, fieldErrors } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { cx } from '../../components/ui/cx.js';

const CK = 'bo.custom.contact';
const loadContact = () => { try { return JSON.parse(localStorage.getItem(CK) || '{}'); } catch { return {}; } };
const KINDS = [['graduation', 'تخرّج / مناقشة مشروع'], ['company', 'شركة / موظفين'], ['restaurant', 'مطعم / كافيه'], ['team', 'مدرسة / فريق / نادي'], ['baby', 'طقم سبوع للأطفال'], ['event', 'مناسبة · فساتين وبدل'], ['other', 'حاجة تانية']];

function Shell({ children }) {
  return <div className="min-h-dvh bg-canvas"><MarketHeader /><main className="container max-w-xl pb-16 pt-6 sm:pt-10"><Link to="/" className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3.5 py-2 text-sm font-semibold hover:border-fg"><ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />الرئيسية</Link>{children}</main></div>;
}

export default function CustomDesign() {
  const { t } = useI18n();
  const toast = useToast();
  const saved = useRef(loadContact()).current;
  const [sp] = useSearchParams();
  const startKind = KINDS.some(([k]) => k === sp.get('kind')) ? sp.get('kind') : 'other';
  const [f, setF] = useState({ kind: startKind, item: '', qty: '', details: '', budget: '', needed_by: '', contact_pref: 'call', name: saved.name || '', phone: saved.phone || '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    const body = {}; Object.entries(f).forEach(([k, v]) => { if (String(v).trim()) body[k] = String(v).trim(); });
    try {
      const r = await api('/custom-requests', { method: 'POST', body });
      try { localStorage.setItem(CK, JSON.stringify({ name: f.name, phone: f.phone })); } catch { /* ignore */ }
      setSent(r);
    } catch (x) { setErrors(fieldErrors(t, x)); toast({ tone: 'error', title: errorMessage(t, x) }); }
    setBusy(false);
  };

  if (sent) {
    return (
      <Shell>
        <div className="rounded-3xl border border-line bg-elevated p-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-7 w-7" /></span>
          <h1 className="mt-4 font-display text-2xl font-bold">وصلنا طلبك</h1>
          <p className="mt-2 text-muted">رقم طلبك <span dir="ltr" className="font-semibold">{sent.number}</span>. خدمة العملاء هتكلمك {f.contact_pref === 'whatsapp' ? 'على واتساب' : 'تليفون'} قريب عشان نتفق على التفاصيل والسعر. تقدر تبعتلنا صور التصميم اللي في دماغك وقتها.</p>
          <div className="mt-5"><Button to="/">رجوع للرئيسية</Button></div>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-brand"><Shirt className="h-7 w-7" /></span>
        <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">أي تصميم ملابس في دماغك.. بيتنفّذ لك</h1>
        <p className="mt-2 text-muted">لطفلك، لشركتك، لمطعمك، لمدرستك، للتخرّج أو أي مناسبة: ملابس، يونيفورم، فساتين، بدل، وأي حاجة تانية. قولنا اللي عاوزه وهنكلمك.</p>
      </div>
      <ul className="mt-5 grid gap-2.5 rounded-2xl bg-secondary p-4 text-sm text-on-secondary">
        {[[MessageCircle, 'ابعت الطلب من غير ما تدفع حاجة'], [PhoneCall, 'خدمة العملاء بتكلمك وتتفق معاك على التصميم والسعر'], [Users, 'بننفّذ مع محلات وورش شغالين معانا في بنها']].map(([Icon, text]) => <li key={text} className="flex items-start gap-3"><Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />{text}</li>)}
      </ul>
      <form onSubmit={submit} className="mt-6 space-y-6 rounded-3xl border border-line bg-elevated p-5 sm:p-6">
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-on-primary">1</span>الطلب لمين؟ <span className="text-xs font-normal text-muted">(اختياري، لو مفيش اللي يناسبك سيبه واكتب طلبك تحت)</span></h2>
          <div className="grid grid-cols-2 gap-2">{KINDS.map(([k, label]) => <button key={k} type="button" onClick={() => setF({ ...f, kind: f.kind === k ? 'other' : k })} className={cx('rounded-2xl border px-3 py-3.5 text-sm font-semibold', f.kind === k ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-elevated hover:border-fg')}>{label}</button>)}</div>
        </section>
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-on-primary">2</span>عاوز إيه بالظبط؟</h2>
          <Textarea rows={4} value={f.details} onChange={set('details')} placeholder={f.kind === 'baby' ? 'مثلاً: طقم سبوع ولد أبيض وذهبي، مقاس 3 شهور، ومكتوب عليه اسم المولود' : 'مثلاً: 80 تيشيرت أسود عليهم اسم الدفعة ولوجو الكلية على الصدر'} required minLength={5} maxLength={1500} />
          {errors.details && <p className="mt-1 text-sm text-red-600">{errors.details}</p>}
          <details className="mt-3 rounded-2xl bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">تفاصيل زيادة (اختياري)</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="القطعة"><Input value={f.item} onChange={set('item')} placeholder="تيشيرت، فستان، بدلة…" maxLength={80} /></Field>
              <Field label="العدد"><Input dir="ltr" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, '') })} className="text-start" /></Field>
              <Field label="الميزانية (ج.م)"><Input dir="ltr" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, '') })} className="text-start" /></Field>
              <Field label="محتاجه إمتى"><Input value={f.needed_by} onChange={set('needed_by')} placeholder="آخر الشهر" maxLength={40} /></Field>
            </div>
          </details>
        </section>
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-on-primary">3</span>نكلمك على إيه؟</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسمك" error={errors.name}><Input value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" /></Field>
            <Field label="رقم الموبايل" error={errors.phone}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" className="text-start" required autoComplete="tel" /></Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">{[['call', 'كلّموني تليفون', PhoneCall], ['whatsapp', 'كلّموني واتساب', MessageCircle]].map(([k, label, Icon]) => <button key={k} type="button" onClick={() => setF({ ...f, contact_pref: k })} className={cx('flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold', f.contact_pref === k ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-elevated hover:border-fg')}><Icon className="h-4 w-4" />{label}</button>)}</div>
        </section>
        <Button type="submit" size="lg" full loading={busy}>ابعت الطلب</Button>
        <p className="text-center text-[13px] text-muted">مفيش دفع ولا التزام. هنتفق على السعر والتفاصيل في المكالمة.</p>
      </form>
    </Shell>
  );
}
