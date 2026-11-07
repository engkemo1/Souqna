import { useState } from 'react';
import { Copy, ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2, UserRound, MessageCircle, Phone, MapPin, Gift, X } from 'lucide-react';
import { PageHeader, ListSkeleton } from '../../components/dash/Kit.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { Field, Input, Switch, Textarea } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { adminApi, useAdminApi, fmtNum } from './adminApi.js';
import { ImagePick } from './FeaturedAds.jsx';
import { LocationPicker } from '../../components/ui/MapView.jsx';

const blank = () => ({
  name_ar: '', name_en: '', slug: '', tagline_ar: '', about_ar: '', logo: '', cover: '', gallery: [], address_ar: '', hours_ar: '', open_from: '', open_to: '', open_days: [],
  whatsapp: '', phone: '', maps_url: '', lat: '', lng: '', instagram: '', facebook: '', tiktok: '', offer_text_ar: '', offer_code: '', consent: false, twist_orders: false, status: 'active',
});
const fromAdv = (a) => ({
  name_ar: a.nameAr, name_en: a.nameEn, slug: a.slug, tagline_ar: a.taglineAr, about_ar: a.aboutAr, logo: a.logo, cover: a.cover, gallery: a.gallery || [],
  address_ar: a.addressAr, hours_ar: a.hoursAr, open_from: a.openFrom || '', open_to: a.openTo || '', open_days: a.openDays || [], whatsapp: a.whatsapp, phone: a.phone, maps_url: a.mapsUrl, lat: a.lat ?? '', lng: a.lng ?? '', instagram: a.instagram, facebook: a.facebook, tiktok: a.tiktok || '',
  offer_text_ar: '', offer_code: '', consent: a.consent, twist_orders: a.twistOrders, status: a.status,
});
const ERR = {
  name_ar: 'اكتب اسم المعلن', whatsapp: 'لازم واتساب أو تليفون أو لينك خريطة (رقم صحيح)', phone: 'رقم غير صالح', consent: 'لازم تأكد إن المعلن موافق على النشر',
  maps_url: 'لينك https غير صالح', instagram: 'لينك https غير صالح', tiktok: 'لينك https غير صالح', facebook: 'لينك https غير صالح', slug: 'عنوان الصفحة مستخدم قبل كده',
  twist_orders: 'اكتب اسم وسعر لصورة واحدة على الأقل قبل تفعيل البيع بالسلة',
  gallery: 'الصور: ٦ بحد أقصى، والسعر رقم صحيح بالجنيه، والألوان/المقاسات 10 بحد أقصى (20 حرف للواحد)', offer_code: 'الكلمة من غير لينكات', logo: 'صورة غير صالحة', cover: 'صورة غير صالحة',
};

const COLOR_PRESETS = ['أسود', 'أبيض', 'كحلي', 'رمادي', 'بيج', 'بني', 'جملي', 'زيتي', 'أحمر', 'أزرق', 'أخضر', 'أصفر'];
const SIZE_PRESETS = [['S', 'M', 'L', 'XL', 'XXL', '3XL'], ['38', '40', '42', '44', '46'], ['Free Size']];
const splitOpts = (t) => String(t || '').split(/[,،;\n]/).map((x) => x.trim()).filter(Boolean);

/** Optional options of one product (colours or sizes): tap ready-made chips and/or type your own separated by commas. */
function OptionPicker({ label, presets, value, onChange, placeholder }) {
  const list = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState('');
  const has = (x) => list.some((y) => y.toLowerCase() === x.toLowerCase());
  const add = (xs) => { const next = [...list]; for (const x of xs) if (x.length <= 20 && !has(x) && !next.some((y) => y.toLowerCase() === x.toLowerCase()) && next.length < 10) next.push(x); onChange(next); };
  const toggle = (x) => onChange(has(x) ? list.filter((y) => y.toLowerCase() !== x.toLowerCase()) : list.length < 10 ? [...list, x] : list);
  const commit = () => { const xs = splitOpts(draft); if (xs.length) add(xs); setDraft(''); };
  const flat = presets.flat();
  const custom = list.filter((x) => !flat.some((p) => p.toLowerCase() === x.toLowerCase()));
  const Chip = ({ x, on }) => (
    <button type="button" aria-pressed={on} onClick={() => toggle(x)}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'border-fg bg-fg text-canvas' : 'border-line bg-canvas text-fg/80 hover:border-fg/40'}`}>{x}</button>
  );
  return (
    <div className="rounded-xl bg-fg/[0.03] p-2.5">
      <p className="mb-1.5 text-xs font-semibold">{label} <span className="font-normal text-muted">(اختياري{list.length ? ` · ${list.length}` : ''})</span></p>
      <div className="space-y-1.5">
        {presets.map((row, i) => (
          <div key={i} className="flex flex-wrap gap-1.5">{row.map((x) => <Chip key={x} x={x} on={has(x)} />)}</div>
        ))}
        {custom.length > 0 && <div className="flex flex-wrap gap-1.5">{custom.map((x) => <Chip key={x} x={x} on />)}</div>}
      </div>
      <Input value={draft} className="mt-2" maxLength={120} placeholder={placeholder}
        onChange={(e) => { const v = e.target.value; if (/[,،]/.test(v)) { add(splitOpts(v)); setDraft(''); } else setDraft(v); }}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
    </div>
  );
}

function Form({ editing, onClose, onSaved }) {
  const toast = useToast();
  const isNew = editing === 'new';
  const [f, setF] = useState(() => (isNew ? blank() : fromAdv(editing)));
  const [fe, setFe] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target ? e.target.value : e }));
  const save = async () => {
    setBusy(true); setFe({});
    try {
      const r = await adminApi(isNew ? '/featured/advertisers' : `/featured/advertisers/${editing.id}`, { method: isNew ? 'POST' : 'PUT', body: f });
      toast({ tone: 'success', title: isNew ? 'اتضاف المعلن' : 'اتحفظت التعديلات' });
      onSaved(r.advertiser);
    } catch (x) {
      setFe(x.fields || {});
      toast({ tone: 'error', title: (x.fields && ERR[Object.keys(x.fields)[0]]) || x.message });
    }
    setBusy(false);
  };
  const addPhoto = (url) => url && setF((v) => (v.gallery.length >= 6 ? v : { ...v, gallery: [...v.gallery, { src: url, name: '', price: '', colors: [], sizes: [] }] }));
  const setItem = (src, patch) => setF((v) => ({ ...v, gallery: v.gallery.map((g) => (g.src === src ? { ...g, ...patch } : g)) }));
  return (
    <Sheet open onClose={() => !busy && onClose()} title={isNew ? 'معلن خارجي جديد' : 'تعديل المعلن'} side="end" size="lg"
      footer={<div className="flex gap-2"><Button full loading={busy} onClick={save}>{isNew ? 'إضافة' : 'حفظ'}</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>}>
      <div className="space-y-4">
        <p className="rounded-xl bg-fg/[0.04] p-3 text-sm text-muted">ده عميل مش عنده محل على Twist. بنعمله صفحة تعريفية خفيفة (من غير منتجات ولا سلة)، والإعلان بيفتحها. اكتب بس اللي العميل وافق يتنشر.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الاسم (عربي)" error={fe.name_ar && ERR.name_ar}><Input value={f.name_ar} onChange={set('name_ar')} maxLength={80} /></Field>
          <Field label="الاسم (إنجليزي)" optional="اختياري"><Input dir="ltr" value={f.name_en} onChange={set('name_en')} maxLength={80} /></Field>
        </div>
        <Field label="سطر تعريفي قصير" optional="اختياري" hint="مثال: أحسن تفصيل بدل في بنها"><Input value={f.tagline_ar} onChange={set('tagline_ar')} maxLength={90} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImagePick label="اللوجو" hint="مربع، يفضل PNG" kind="fg" value={f.logo} onChange={set('logo')} error={fe.logo && ERR.logo} />
          <ImagePick label="صورة الغلاف (الواجهة)" hint="صورة المحل من برا أو صورة معبّرة" value={f.cover} onChange={set('cover')} error={fe.cover && ERR.cover} />
        </div>
        <Field label={`صور إضافية (${f.gallery.length}/6)`} optional="اختياري" error={fe.gallery && ERR.gallery}>
          <p className="mb-2 text-xs text-muted">لو كتبت اسم أو سعر للقطعة، بيظهر تحت الصورة وبيظهر زرار «اطلبها على واتساب». من غيرهم الصورة بتتعرض بس.</p>
          <div className="space-y-2">
            {f.gallery.map((g) => (
              <div key={g.src} className="rounded-xl border border-line p-2">
                <div className="flex items-center gap-2">
                <img src={g.src} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_120px]">
                  <Input value={g.name} onChange={(e) => setItem(g.src, { name: e.target.value })} maxLength={60} placeholder="اسم القطعة (اختياري)" />
                  <Input dir="ltr" inputMode="numeric" value={g.price ?? ''} onChange={(e) => setItem(g.src, { price: e.target.value.replace(/[^\d]/g, '') })} placeholder="السعر جنيه" />
                </div>
                <button type="button" aria-label="شيل الصورة" onClick={() => setF((v) => ({ ...v, gallery: v.gallery.filter((x) => x.src !== g.src) }))} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fg/[0.08] hover:bg-fg/[0.15]"><X className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OptionPicker label="الألوان" presets={[COLOR_PRESETS]} value={g.colors} onChange={(colors) => setItem(g.src, { colors })} placeholder="اكتب ألوان تانية وافصل بفاصلة: أسود، بيج" />
                  <OptionPicker label="المقاسات" presets={SIZE_PRESETS} value={g.sizes} onChange={(sizes) => setItem(g.src, { sizes })} placeholder="اكتب مقاسات تانية وافصل بفاصلة: M، L، XL" />
                </div>
              </div>
            ))}
          </div>
          {f.gallery.length < 6 && <div className="mt-2"><ImagePick label="" hint="الصور من غير سعر ولا زرار شراء" kind="fg" value="" onChange={addPhoto} /></div>}
        </Field>
        <div className="rounded-2xl border border-line p-4">
          <Switch checked={f.twist_orders} onChange={() => setF((v) => ({ ...v, twist_orders: !v.twist_orders }))} label="البيع بسلة Twist (إحنا نوصّل)" description="القطع اللي ليها اسم وسعر تتضاف في سلة Twist وتوصلنا في «الطلبات» زي أي طلب، ونوصّلها إحنا." />
          {f.twist_orders && <ul className="mt-3 list-disc space-y-1 ps-5 text-xs text-muted"><li>كل قطعة (اسم + سعر) بتبقى منتج في محل مخفي باسم المعلن — مش بيظهر في البحث ولا في دليل المحلات.</li><li>مفيش تتبّع مخزون: القطعة دايمًا متاحة لحد ما تشيل سعرها أو تخبّي المعلن. اتأكد مع العميل إنها موجودة.</li><li>الطلب بيوصل في «الطلبات» باسم المعلن وبعنوانه كعنوان استلام، وسعر التوصيل بيتحسب من قايمة أسعار التوصيل.</li><li>الصورة بتتحمّل منتج بدون قص. لو اتغيّرت الصورة اعتبرها قطعة جديدة.</li></ul>}
          {fe.twist_orders && <p className="mt-2 text-xs text-red-600">{ERR.twist_orders}</p>}
        </div>
        <Field label="نبذة" optional="اختياري"><Textarea rows={3} value={f.about_ar} onChange={set('about_ar')} maxLength={400} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="واتساب" error={fe.whatsapp && ERR.whatsapp} hint="مثال: 01012345678"><Input dir="ltr" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
          <Field label="تليفون للاتصال" optional="اختياري" error={fe.phone && ERR.phone}><Input dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <Field label="العنوان" optional="اختياري"><Input value={f.address_ar} onChange={set('address_ar')} maxLength={160} /></Field>
        <Field label="موقع المحل على الخريطة" optional="اختياري" error={fe.lat && 'الموقع غير صالح'} hint="دوّر على اسم المكان أو اضغط على الخريطة أو اسحب الدبوس. العميل هيفتح الاتجاهات على الموقع ده بالظبط.">
          <LocationPicker lat={f.lat} lng={f.lng} onChange={(la, ln) => setF((v) => ({ ...v, lat: la, lng: ln }))} height={240} />
          {f.lat !== '' && f.lat !== null && <button type="button" onClick={() => setF((v) => ({ ...v, lat: '', lng: '' }))} className="mt-2 text-xs font-semibold text-muted underline">شيل الموقع</button>}
        </Field>
        <Field label="لينك الموقع على الخريطة" optional="اختياري" error={fe.maps_url && ERR.maps_url} hint="اختياري لو حددت الموقع فوق — لو كتبت لينك بيتقدّم على الدبوس (لازم https)"><Input dir="ltr" value={f.maps_url} onChange={set('maps_url')} placeholder="https://maps.app.goo.gl/…" /></Field>
        <Field label="مواعيد الشغل" optional="اختياري"><Input value={f.hours_ar} onChange={set('hours_ar')} maxLength={100} placeholder="يوميًا 10 ص – 12 م" /></Field>
        <div className="rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold">ساعات الشغل بالتفصيل (علشان تظهر «مفتوح دلوقتي»)</p>
          <p className="mb-3 mt-1 text-xs text-muted">اختياري. بتوقيت القاهرة. لو المحل بيقفل بعد منتصف الليل اكتب وقت قفل أصغر (مثلاً من 10:00 لـ 01:00). سيب الأيام فاضية = كل يوم.</p>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-muted">من</span><input type="time" dir="ltr" value={f.open_from} onChange={set('open_from')} className="h-9 rounded-lg border border-line bg-transparent px-2 text-sm" />
            <span className="text-xs text-muted">لـ</span><input type="time" dir="ltr" value={f.open_to} onChange={set('open_to')} className="h-9 rounded-lg border border-line bg-transparent px-2 text-sm" />
            {(f.open_from || f.open_to) && <button type="button" onClick={() => setF((v) => ({ ...v, open_from: '', open_to: '' }))} className="text-xs text-muted hover:text-fg">مسح</button>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[[6, 'السبت'], [0, 'الأحد'], [1, 'الاتنين'], [2, 'التلات'], [3, 'الأربع'], [4, 'الخميس'], [5, 'الجمعة']].map(([k, n]) => {
              const on = f.open_days.includes(k);
              return <button key={k} type="button" aria-pressed={on} onClick={() => setF((v) => ({ ...v, open_days: on ? v.open_days.filter((d) => d !== k) : [...v.open_days, k] }))} className={`h-8 rounded-lg border px-3 text-xs font-medium ${on ? 'border-fg bg-fg text-canvas' : 'border-line hover:bg-fg/[0.05]'}`}>{n}</button>;
            })}
          </div>
          {fe.open_from && <p className="mt-2 text-xs text-red-600">اكتب وقتين مختلفين (من/لـ)</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="إنستجرام" optional="اختياري" error={fe.instagram && ERR.instagram}><Input dir="ltr" value={f.instagram} onChange={set('instagram')} placeholder="https://instagram.com/…" /></Field>
          <Field label="فيسبوك" optional="اختياري" error={fe.facebook && ERR.facebook}><Input dir="ltr" value={f.facebook} onChange={set('facebook')} placeholder="https://facebook.com/…" /></Field>
          <Field label="تيك توك" optional="اختياري" error={fe.tiktok && ERR.tiktok}><Input dir="ltr" value={f.tiktok} onChange={set('tiktok')} placeholder="https://tiktok.com/@…" /></Field>
        </div>
        <Field label="عنوان الصفحة" optional="اختياري" error={fe.slug && ERR.slug} hint="إنجليزي بس، مثال: al-nour — بيبقى twistegy.com/a/al-nour. لو فاضي بنعمله لوحدنا."><Input dir="ltr" value={f.slug} onChange={set('slug')} maxLength={40} disabled={!isNew && false} /></Field>
        <Switch checked={f.consent} onChange={() => setF((v) => ({ ...v, consent: !v.consent }))} label="المعلن وافق على نشر اسمه وصوره وبياناته" description="لازم قبل النشر. لو شلتها الصفحة والإعلان بيختفوا." />
        {fe.consent && <p className="text-xs text-red-600">{ERR.consent}</p>}
        <Switch checked={f.status === 'active'} onChange={() => setF((v) => ({ ...v, status: v.status === 'active' ? 'hidden' : 'active' }))} label="الصفحة ظاهرة" description="لو اتخبّت، الصفحة والإعلانات المرتبطة بيها بتختفي." />
      </div>
    </Sheet>
  );
}

export default function Advertisers() {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAdminApi(`/featured/advertisers?days=${days}`);
  const [editing, setEditing] = useState(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast({ tone: 'success', title: msg }); } catch { toast({ tone: 'error', title: 'مقدرتش أنسخ — انسخ يدوي' }); } };
  const report = async (a) => { try { const r = await adminApi(`/featured/advertisers/${a.id}/report?days=7`); await copy(r.text, 'اتنسخ تقرير آخر ٧ أيام — ابعته للعميل على واتساب'); } catch (x) { toast({ tone: 'error', title: x.message }); } };
  const toggle = async (a) => { try { await adminApi(`/featured/advertisers/${a.id}`, { method: 'PUT', body: { ...fromAdv(a), status: a.status === 'active' ? 'hidden' : 'active' } }); reload(); } catch (x) { toast({ tone: 'error', title: x.message }); } };
  const remove = async (a) => {
    if (!window.confirm(`تمسح «${a.nameAr}» نهائيًا؟`)) return; // eslint-disable-line no-alert
    try { await adminApi(`/featured/advertisers/${a.id}`, { method: 'DELETE' }); toast({ tone: 'success', title: 'اتمسح' }); reload(); } catch (x) { toast({ tone: 'error', title: x.code === 'in_use' ? 'عليه إعلانات — خبّيه بدل ما تمسحه' : x.code === 'has_orders' ? 'عليه طلبات — خبّيه بدل ما تمسحه' : x.message }); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="المعلنون الخارجيون" subtitle="عملاء مش عندهم محل على Twist — صفحة تعريفية خفيفة + إعلان يفتحها"
        actions={<Button icon={Plus} onClick={() => setEditing('new')}>معلن جديد</Button>} />
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`h-9 rounded-xl border px-3 text-sm font-medium ${days === d ? 'border-fg bg-fg text-canvas' : 'border-line hover:bg-fg/[0.05]'}`}>آخر {d} يوم</button>)}
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <ListSkeleton rows={3} /> : !data?.items.length ? (
        <EmptyState icon={UserRound} title="لسه مفيش معلنين" body="ضيف أول معلن، وبعدها اعمله إعلان من «الإعلانات والعروض المميزة» → معلن خارجي." action={<Button icon={Plus} onClick={() => setEditing('new')}>معلن جديد</Button>} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((a) => (
            <li key={a.id} className="rounded-2xl border border-line bg-elevated p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]">{(a.logo || a.cover) && <img src={a.logo || a.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><b className="truncate">{a.nameAr}</b><Badge tone={a.status === 'active' ? 'success' : 'neutral'} size="sm">{a.status === 'active' ? 'ظاهر' : 'مخفي'}</Badge>{a.ads.campaigns > 0 && <Badge size="sm">{a.ads.campaigns} إعلان</Badge>}{a.twistOrders && <Badge tone="info" size="sm">بيع بسلة Twist</Badge>}</div>
                  <p className="mt-1 text-xs text-muted" dir="ltr">{origin}{a.url}</p>
                </div>
                <div className="tabular grid grid-cols-5 gap-x-4 text-center text-xs text-muted">
                  <div><b className="block text-base text-fg">{fmtNum(a.stats.view)}</b>زيارة</div>
                  <div><b className="block text-base text-fg"><MessageCircle className="mx-auto mb-0.5 h-3.5 w-3.5" />{fmtNum(a.stats.whatsapp)}</b>واتساب</div>
                  <div><b className="block text-base text-fg"><Phone className="mx-auto mb-0.5 h-3.5 w-3.5" />{fmtNum(a.stats.call)}</b>اتصال</div>
                  <div><b className="block text-base text-fg"><MapPin className="mx-auto mb-0.5 h-3.5 w-3.5" />{fmtNum(a.stats.map)}</b>خريطة</div>
                  <div><b className="block text-base text-fg"><Gift className="mx-auto mb-0.5 h-3.5 w-3.5" />{fmtNum(a.stats.order)}</b>طلب قطعة</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(a)}>تعديل</Button>
                <Button size="sm" variant="outline" icon={ExternalLink} onClick={() => window.open(a.url, '_blank', 'noopener')}>افتح الصفحة</Button>
                <Button size="sm" variant="outline" icon={Copy} onClick={() => copy(`${origin}${a.url}`, 'اتنسخ الرابط')}>انسخ الرابط</Button>
                <Button size="sm" variant="outline" icon={MessageCircle} onClick={() => report(a)}>تقرير للعميل</Button>
                <Button size="sm" variant="outline" icon={a.status === 'active' ? EyeOff : Eye} onClick={() => toggle(a)}>{a.status === 'active' ? 'إخفاء' : 'إظهار'}</Button>
                <Button size="sm" variant="outline" icon={Trash2} onClick={() => remove(a)}>مسح</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <Form editing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
