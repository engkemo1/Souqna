import { Plus, Trash2, Copy } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { Input, Switch } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import { cx } from '../ui/cx.js';
import { DAYS_AR, DAYS_EN } from '../../lib/storeInfo.js';

const SHIFT = { open: '10:00', close: '23:00' };
const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first (the Egyptian week)
const todayIso = () => new Date().toISOString().slice(0, 10);

/** The schedule the editor starts from: the old single open/close (+ day off) becomes seven identical days. */
export function scheduleFromStore(hours) {
  if (!hours) return null;
  if (Array.isArray(hours.days) && hours.days.length === 7) return { days: hours.days.map((d) => ({ closed: !!d.closed, shifts: (d.shifts || []).map((x) => ({ open: x.open, close: x.close })) })), holidays: (hours.holidays || []).map((h) => ({ from: h.from, to: h.to, note: h.note || '' })) };
  const off = hours.dayOff ?? -1;
  return { days: Array.from({ length: 7 }, (_, i) => ({ closed: i === off, shifts: i === off ? [] : [{ open: hours.open, close: hours.close }] })), holidays: [] };
}

/** Weekly hours (up to two periods per day) + holidays. Display only: it tells customers when the store is open, it never blocks an order. */
export default function HoursEditor({ value, onChange }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const names = ar ? DAYS_AR : DAYS_EN;

  if (!value) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-4 text-center">
        <p className="text-sm text-muted">{ar ? 'لسه ما حددتش مواعيد المحل. العميل هيشوف «مفتوح الآن / يفتح الساعة كذا» لما تحددها.' : 'No opening hours yet. Customers will see “Open now / Opens at …” once you set them.'}</p>
        <Button className="mt-3" icon={Plus} onClick={() => onChange({ days: Array.from({ length: 7 }, () => ({ closed: false, shifts: [{ ...SHIFT }] })), holidays: [] })}>{ar ? 'حدّد المواعيد' : 'Set hours'}</Button>
      </div>
    );
  }

  const setDay = (i, patch) => onChange({ ...value, days: value.days.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  const setShift = (i, j, patch) => setDay(i, { shifts: value.days[i].shifts.map((s, k) => (k === j ? { ...s, ...patch } : s)) });
  const copyToAll = (i) => onChange({ ...value, days: value.days.map(() => ({ closed: value.days[i].closed, shifts: value.days[i].shifts.map((s) => ({ ...s })) })) });
  const setHoliday = (i, patch) => onChange({ ...value, holidays: value.holidays.map((h, k) => (k === i ? { ...h, ...patch } : h)) });
  const today = todayIso();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {ORDER.map((i) => {
          const d = value.days[i];
          return (
            <div key={i} className={cx('rounded-2xl border p-3', d.closed ? 'border-line bg-fg/[0.03]' : 'border-line-strong')}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-20 text-[15px] font-bold">{names[i]}</span>
                <Switch label={d.closed ? (ar ? 'إجازة' : 'Closed') : (ar ? 'مفتوح' : 'Open')} checked={!d.closed} onChange={(v) => setDay(i, v ? { closed: false, shifts: d.shifts.length ? d.shifts : [{ ...SHIFT }] } : { closed: true })} />
                <button type="button" onClick={() => copyToAll(i)} className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-fg/[0.06] hover:text-fg" title={ar ? 'استخدم نفس المواعيد لكل الأيام' : 'Use these hours for every day'}>
                  <Copy className="h-3.5 w-3.5" />{ar ? 'نفس المواعيد لكل الأيام' : 'Copy to all days'}
                </button>
              </div>
              {!d.closed && (
                <div className="mt-3 space-y-2">
                  {d.shifts.map((s, j) => (
                    <div key={j} className="flex flex-wrap items-center gap-2">
                      <span className="w-14 text-xs text-muted">{j === 0 ? (ar ? 'من' : 'From') : (ar ? 'ومن' : 'And')}</span>
                      <Input type="time" dir="ltr" value={s.open} onChange={(e) => setShift(i, j, { open: e.target.value })} className="w-32" aria-label={ar ? 'بيفتح' : 'Opens'} />
                      <span className="text-xs text-muted">{ar ? 'لـ' : 'to'}</span>
                      <Input type="time" dir="ltr" value={s.close} onChange={(e) => setShift(i, j, { close: e.target.value })} className="w-32" aria-label={ar ? 'بيقفل' : 'Closes'} />
                      {j > 0 && <button type="button" onClick={() => setDay(i, { shifts: d.shifts.filter((_, k) => k !== j) })} aria-label={ar ? 'شيل الفترة' : 'Remove period'} className="grid h-9 w-9 place-items-center rounded-lg text-sale hover:bg-sale/10"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  ))}
                  {d.shifts.length < 2 && <button type="button" onClick={() => setDay(i, { shifts: [...d.shifts, { open: '17:00', close: '23:00' }] })} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-brand/10"><Plus className="h-3.5 w-3.5" />{ar ? 'فترة تانية (استراحة في النص)' : 'Second period (a break in between)'}</button>}
                  {d.shifts.some((s) => s.close <= s.open) && <p className="text-xs text-muted">{ar ? 'القفل بعد منتصف الليل: المحل بيفضل مفتوح لحد الساعة دي تاني يوم.' : 'Closes after midnight: the store stays open until that time the next day.'}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{ar ? 'الإجازات' : 'Holidays'}</p>
        <p className="text-xs text-muted">{ar ? 'في الأيام دي العميل هيشوف إن المحل في إجازة وميعاد الفتح الجاي.' : 'On these dates customers see the store is on holiday and when it reopens.'}</p>
        {value.holidays.map((h, i) => (
          <div key={i} className={cx('flex flex-wrap items-center gap-2 rounded-2xl border border-line p-3', h.to < today && 'opacity-60')}>
            <span className="text-xs text-muted">{ar ? 'من' : 'From'}</span>
            <Input type="date" dir="ltr" value={h.from} onChange={(e) => setHoliday(i, { from: e.target.value, to: h.to < e.target.value ? e.target.value : h.to })} className="w-40" />
            <span className="text-xs text-muted">{ar ? 'إلى' : 'to'}</span>
            <Input type="date" dir="ltr" min={h.from} value={h.to} onChange={(e) => setHoliday(i, { to: e.target.value })} className="w-40" />
            <Input value={h.note} maxLength={60} placeholder={ar ? 'السبب (اختياري) مثلاً: عيد' : 'Reason (optional)'} onChange={(e) => setHoliday(i, { note: e.target.value })} className="min-w-[10rem] flex-1" />
            {h.to < today && <span className="text-xs text-muted">{ar ? 'انتهت' : 'Ended'}</span>}
            <button type="button" onClick={() => onChange({ ...value, holidays: value.holidays.filter((_, k) => k !== i) })} aria-label={ar ? 'شيل الإجازة' : 'Remove holiday'} className="grid h-9 w-9 place-items-center rounded-lg text-sale hover:bg-sale/10"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button variant="secondary" size="sm" icon={Plus} disabled={value.holidays.length >= 40} onClick={() => onChange({ ...value, holidays: [...value.holidays, { from: today, to: today, note: '' }] })}>{ar ? 'أضف إجازة' : 'Add a holiday'}</Button>
      </div>

      <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-sale hover:underline">{ar ? 'إلغاء المواعيد (ما يظهرش مفتوح/مغلق)' : 'Remove opening hours'}</button>
    </div>
  );
}
