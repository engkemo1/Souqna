import { useEffect, useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, X, Search, Sparkles, Navigation } from 'lucide-react';
import { GOVERNORATES } from '@souqna/shared';
import { Field, Input, Select, Switch } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { PageHeader, Panel } from '../../components/dash/Kit.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import PlaceAutocomplete from '../../components/ui/PlaceAutocomplete.jsx';
import { CheckoutLocationPicker } from '../../components/ui/MapView.jsx';
import { calcDistanceKm, BANHA_COORDS } from '../../lib/egyptPlaces.js';
import { adminApi, useAdminApi, fmtMoney } from './adminApi.js';

const blank = { governorate: GOVERNORATES[0], city: '', fee: '', distanceKm: '' };

const QUICK_PRESETS = [
  { name: 'شبرا الخيمة', gov: 'Qalyubia', km: 38 },
  { name: 'طوخ', gov: 'Qalyubia', km: 11 },
  { name: 'قها', gov: 'Qalyubia', km: 16 },
  { name: 'كفر شكر', gov: 'Qalyubia', km: 18 },
  { name: 'قليوب', gov: 'Qalyubia', km: 30 },
  { name: 'العبور', gov: 'Qalyubia', km: 45 },
  { name: 'الخانكة', gov: 'Qalyubia', km: 36 },
  { name: 'شبرا مصر', gov: 'Cairo', km: 44 },
  { name: 'كفر الجزار', gov: 'Qalyubia', km: 2.5 },
  { name: 'كفر ابوزكري', gov: 'Qalyubia', km: 2.3 },
  { name: 'بطا', gov: 'Qalyubia', km: 1.5 },
  { name: 'بقيرة', gov: 'Qalyubia', km: 5 },
  { name: 'مسجد الخضر', gov: 'Qalyubia', km: 0.9 },
  { name: 'شارع كلية التجارة', gov: 'Qalyubia', km: 0.5 },
  { name: 'شارع الكوبري', gov: 'Qalyubia', km: 0.6 },
  { name: 'شارع فريد ندا', gov: 'Qalyubia', km: 0.2 },
  { name: 'الفلل', gov: 'Qalyubia', km: 1.1 },
  { name: 'عزبة الزراعة', gov: 'Qalyubia', km: 2.3 },
];

function PlatformFreeShipping() {
  const toast = useToast();
  const { data, reload } = useAdminApi('/free-shipping');
  const [on, setOn] = useState(false);
  const [over, setOver] = useState('0');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setOn(!!data.enabled); setOver(String(data.over ?? 0)); } }, [data]);
  const save = async () => {
    setBusy(true);
    try { await adminApi('/free-shipping', { method: 'PUT', body: { enabled: on, over: Number(over || 0) } }); toast({ title: 'اتحفظ' }); reload(); }
    catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); }
    setBusy(false);
  };
  const closeAll = async () => {
    if (!window.confirm('هتقفل الشحن المجاني لكل المحلات. كل صاحب محل يقدر يفتحه تاني لمحله. متأكد؟')) return;
    try { const r = await adminApi('/free-shipping/close-all', { method: 'POST' }); toast({ title: `اتقفل في ${r.closed} محل` }); }
    catch (e) { toast({ tone: 'error', title: e.message || 'حصلت مشكلة' }); }
  };
  return (
    <Panel title="شحن مجاني من Twist (على كل المحلات)" className="mb-5">
      <p className="mb-4 text-sm leading-6 text-muted">لما تفتحه، العميل مبيدفعش رسوم توصيل على سلة Twist، وتويست هي اللي بتتحمّل تكلفة المندوب. مقفول تلقائياً. كل محل كمان يقدر يفتح شحن مجاني لمحله من إعداداته.</p>
      <Switch checked={on} onChange={setOn} label="تفعيل الشحن المجاني من Twist" />
      {on && <Field className="mt-3 sm:max-w-xs" label="لو إجمالي السلة وصل لـ" hint="اكتب 0 عشان يبقى مجاني على كل الطلبات"><Input inputMode="numeric" suffix="ج.م" value={over} onChange={(e) => setOver(e.target.value.replace(/\D/g, ''))} /></Field>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={save} loading={busy}>حفظ</Button><Button variant="outline" onClick={closeAll}>قفل الشحن المجاني لكل المحلات</Button></div>
    </Panel>
  );
}

export default function DeliveryRates() {
  const { data, error, loading, reload } = useAdminApi('/delivery-rates');
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [coords, setCoords] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pricing, setPricing] = useState({ baseFee: '50', includedKm: '2', perKm: '10', extraPickupStopFee: '0', extraPickupZoneFee: '0' });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.pricing) {
      setPricing({
        baseFee: String(data.pricing.baseFee),
        includedKm: String(data.pricing.includedKm),
        perKm: String(data.pricing.perKm),
        extraPickupStopFee: String(data.pricing.extraPickupStopFee ?? 0),
        extraPickupZoneFee: String(data.pricing.extraPickupZoneFee ?? 0),
      });
    }
  }, [data?.pricing]);

  const reset = () => { setForm(blank); setEditing(null); setCoords(null); };

  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await adminApi(editing ? `/delivery-rates/${editing}` : '/delivery-rates', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          governorate: form.governorate,
          city: form.city.trim(),
          fee: form.fee === '' ? undefined : Number(form.fee),
          distanceKm: form.distanceKm === '' ? null : Number(form.distanceKm),
        },
      });
      toast({ title: editing ? 'تم تحديث رسوم المنطقة' : 'تمت إضافة رسوم المنطقة بنجاح' });
      reset(); reload();
    } catch (e) {
      toast({ tone: 'error', title: e.fields?.city === 'area_taken' ? 'فيه رسوم مسجلة للمنطقة دي بالفعل' : e.message });
    }
    setBusy(false);
  };

  const edit = (item) => {
    setEditing(item.id);
    setForm({
      governorate: item.governorate,
      city: item.city,
      fee: item.distanceKm == null ? String(item.fee) : '',
      distanceKm: item.distanceKm == null ? '' : String(item.distanceKm),
    });
  };

  const applyPreset = (preset) => {
    setForm({
      governorate: preset.gov,
      city: preset.name,
      distanceKm: String(preset.km),
      fee: '',
    });
    setCoords(null);
  };

  const handleMapPick = (lat, lng, details) => {
    const km = calcDistanceKm(lat, lng, BANHA_COORDS);
    setCoords({ lat, lng });
    setForm((f) => ({
      ...f,
      city: f.city && f.city !== '*' ? f.city : (details?.primaryName || details?.shortName || details?.name || f.city),
      governorate: details?.gov || f.governorate,
      distanceKm: String(km),
      fee: '',
    }));
  };

  const savePricing = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await adminApi('/delivery-rates/pricing', {
        method: 'PUT',
        body: {
          baseFee: Number(pricing.baseFee),
          includedKm: Number(pricing.includedKm),
          perKm: Number(pricing.perKm),
          extraPickupStopFee: Number(pricing.extraPickupStopFee),
          extraPickupZoneFee: Number(pricing.extraPickupZoneFee),
        },
      });
      toast({ title: 'تم حفظ طريقة حساب رسوم التوصيل' }); reload();
    } catch (e) { toast({ tone: 'error', title: e.message }); }
    setBusy(false);
  };

  const remove = async (item) => {
    if (!window.confirm(`حذف رسوم ${item.city || item.governorate}؟`)) return;
    try {
      await adminApi(`/delivery-rates/${item.id}`, { method: 'DELETE' });
      toast({ title: 'تم حذف سعر المنطقة' }); reload();
    } catch (e) { toast({ tone: 'error', title: e.message }); }
  };

  // Preview estimated fee from distance
  const calculatedFee = useMemo(() => {
    if (!form.distanceKm || isNaN(Number(form.distanceKm))) return null;
    const km = Number(form.distanceKm);
    const base = Number(pricing.baseFee) || 50;
    const inc = Number(pricing.includedKm) || 2;
    const per = Number(pricing.perKm) || 10;
    return Math.min(5000, base + Math.ceil(Math.max(0, km - inc)) * per);
  }, [form.distanceKm, pricing]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!searchQuery.trim()) return data.items;
    const q = searchQuery.trim().toLowerCase();
    return data.items.filter(
      (item) =>
        (item.city && item.city.toLowerCase().includes(q)) ||
        (item.governorate && item.governorate.toLowerCase().includes(q))
    );
  }, [data?.items, searchQuery]);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="رسوم التوصيل حسب المنطقة"
        subtitle="تحديد أسعار التوصيل بدقة حسب المناطق والمسافة بالكيلومتر من بنها."
      />

      <div className="mb-5 rounded-2xl bg-amber-50/80 p-4 text-sm leading-6 text-amber-900 border border-amber-200/60">
        💡 <strong>نصيحة التسعير:</strong> المسافات مسجلة تقريبياً من وسط بنها. يمكنك كتابة أي شارع أو منطقة (زي شبرا الخيمة، كفر ابوزكري، مسجد الخضر، شارع كلية التجارة) وسيتم حساب المسافة والسعر تلقائياً، أو يمكنك إدخال سعر ثابت بدلاً من المسافة.
      </div>

      <PlatformFreeShipping />

      <Panel title="طريقة حساب رسوم التوصيل" className="mb-5">
        <p className="mb-4 text-sm leading-6 text-muted">
          المعادلة: السعر الأساسي + (المسافة الزائدة عن المسافة المشمولة) × سعر الكيلومتر الإضافي.
        </p>
        <form onSubmit={savePricing} className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <Field label="السعر الأساسي"><Input inputMode="numeric" suffix="ج.م" value={pricing.baseFee} onChange={(e) => setPricing({ ...pricing, baseFee: e.target.value.replace(/\D/g, '') })} required /></Field>
          <Field label="المسافة المشمولة"><Input inputMode="decimal" suffix="كم" value={pricing.includedKm} onChange={(e) => setPricing({ ...pricing, includedKm: e.target.value.replace(/[^\d.]/g, '') })} required /></Field>
          <Field label="لكل كيلومتر إضافي (تقريب لأعلى)"><Input inputMode="numeric" suffix="ج.م" value={pricing.perKm} onChange={(e) => setPricing({ ...pricing, perKm: e.target.value.replace(/\D/g, '') })} required /></Field>
          <Field label="لكل نقطة استلام إضافية" hint="تُحسب مرة لكل محل بعد الأول"><Input inputMode="numeric" suffix="ج.م" value={pricing.extraPickupStopFee} onChange={(e) => setPricing({ ...pricing, extraPickupStopFee: e.target.value.replace(/\D/g, '') })} required /></Field>
          <Field label="لكل منطقة استلام إضافية" hint="المحلات التي تشارك نفس منطقة الاستلام تُحسب منطقة واحدة"><Input inputMode="numeric" suffix="ج.م" value={pricing.extraPickupZoneFee} onChange={(e) => setPricing({ ...pricing, extraPickupZoneFee: e.target.value.replace(/\D/g, '') })} required /></Field>
          <div className="sm:col-span-3"><Button type="submit" loading={busy}>حفظ طريقة الحساب</Button></div>
        </form>
      </Panel>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Panel title={editing ? 'تعديل رسوم المنطقة' : 'إضافة رسوم لمنطقة'}>
          {/* Quick presets */}
          <div className="mb-4">
            <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              أماكن مقترحة شائعة (اضغط للإضافة الفورية):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-lg border border-line bg-fg/[0.03] px-2.5 py-1 text-xs hover:border-brand hover:bg-brand/5 hover:text-brand transition-colors"
                >
                  {p.name} <span className="text-[11px] text-muted">({p.km} كم)</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={save} className="space-y-4">
            <Field label="المحافظة">
              <Select value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value, city: e.target.value === '*' ? '*' : '' })}>
                <option value="*">باقي المناطق (السعر الافتراضي)</option>
                {GOVERNORATES.map((gov) => <option key={gov} value={gov}>{gov}</option>)}
              </Select>
            </Field>

            <Field label="المدينة أو المنطقة" hint={form.governorate === '*' ? 'السعر سيُستخدم للمناطق التي ليس لها سعر محدد' : 'اكتب أي منطقة، شارع، كلية أو معلم (مثلاً: شبرا الخيمة، كفر ابوزكري، مسجد الخضر)'}>
              <PlaceAutocomplete
                value={form.city === '*' ? '' : form.city}
                disabled={form.governorate === '*'}
                onChange={(v) => setForm({ ...form, city: v })}
                onSelect={(place) => {
                  setForm((f) => ({
                    ...f,
                    city: place.shortName || place.name.split(',')[0].trim(),
                    governorate: place.gov || f.governorate,
                    distanceKm: place.distanceKm != null ? String(place.distanceKm) : (place.lat && place.lng ? String(calcDistanceKm(place.lat, place.lng)) : f.distanceKm),
                    fee: '',
                  }));
                  if (place.lat && place.lng) setCoords({ lat: place.lat, lng: place.lng });
                }}
                placeholder="اكتب اسم المدينة، القرية أو الشارع…"
              />
            </Field>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowMap(!showMap)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
              >
                <Navigation className="h-3.5 w-3.5" />
                {showMap ? 'إخفاء الخريطة' : '🗺️ تحديد أو قياس المسافة على الخريطة'}
              </button>
            </div>

            {showMap && (
              <div className="rounded-xl border border-line p-2 bg-elevated">
                <p className="mb-2 text-xs text-muted">اضغط على أي مكان على الخريطة لحساب المسافة من وسط بنها تلقائياً:</p>
                <CheckoutLocationPicker
                  lat={coords?.lat}
                  lng={coords?.lng}
                  onChange={handleMapPick}
                  height={220}
                  helpText="اضغط على الخريطة لحساب المسافة تلقائياً من وسط بنها"
                />
              </div>
            )}

            <Field label="المسافة من وسط بنها" hint="اتركها فارغة لإدخال سعر ثابت بدل حساب المسافة">
              <Input
                inputMode="decimal"
                suffix="كم"
                value={form.distanceKm}
                onChange={(e) => setForm({ ...form, distanceKm: e.target.value.replace(/[^\d.]/g, ''), fee: '' })}
              />
            </Field>

            {calculatedFee != null && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-800">
                ✓ <strong>السعر المحسوب للعميل: {calculatedFee} ج.م</strong> (بناءً على مسافة {form.distanceKm} كم من بنها)
              </div>
            )}

            {!form.distanceKm && (
              <Field label="أو رسوم ثابتة للمنطقة (تجاوز المسافة)">
                <Input
                  inputMode="numeric"
                  suffix="ج.م"
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: e.target.value.replace(/\D/g, '') })}
                  placeholder="مثال: 50"
                />
              </Field>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" loading={busy} icon={editing ? Pencil : Plus}>
                {editing ? 'حفظ التعديل' : 'إضافة السعر'}
              </Button>
              {editing && (
                <Button type="button" variant="outline" icon={X} onClick={reset}>
                  إلغاء
                </Button>
              )}
            </div>
          </form>
        </Panel>

        <Panel
          title="الأسعار المسجلة"
          subtitle={`${data?.items?.length || 0} منطقة`}
        >
          {/* Search filter for registered areas */}
          <div className="mb-3 relative">
            <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-muted">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في الأسعار المسجلة (مثلاً: شبرا، بطا، كفر)…"
              className="w-full rounded-xl border border-line bg-elevated ps-8 pe-3 py-1.5 text-xs outline-none focus:border-fg"
            />
          </div>

          {loading && !data ? (
            <Skeleton className="h-40 w-full" />
          ) : !filteredItems.length ? (
            <EmptyState
              icon={MapPin}
              title="مفيش نتائج مطابقة"
              body="جرّب بحث بكلمة تانية أو أضف المنطقة من النموذج على اليمين."
            />
          ) : (
            <ul className="divide-y divide-line max-h-[580px] overflow-auto pe-1">
              {filteredItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <MapPin className="h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {item.governorate === '*'
                        ? 'السعر الافتراضي — باقي المناطق'
                        : item.city
                        ? `${item.city}، ${item.governorate}`
                        : item.governorate}
                    </p>
                    <p className="text-xs text-muted">
                      {item.distanceKm == null ? '' : `${item.distanceKm} كم من بنها · `}
                      <span className="font-semibold text-fg">{fmtMoney(item.fee)}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => edit(item)}
                    aria-label="تعديل السعر"
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/[0.06]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    aria-label="حذف السعر"
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-sale/10 hover:text-sale"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
