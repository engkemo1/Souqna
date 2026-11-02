import { Field, Segmented, Select } from '../ui/Field.jsx';
import { BANNER_FONTS, bannerFontFamily, loadBannerFont } from '../../lib/bannerFonts.js';
import { useI18n } from '../../lib/i18n.jsx';
import { cx } from '../ui/cx.js';

const COLORS = ['#FFFFFF', '#111111', '#F5D77A', '#FF5A5F', '#7FD1AE', '#8EC5FF', '#FFB4D1'];

/** How an offer card shows its picture and words: fit / height / focus, text colour, font. value = { fit, focus, ratio, text_color, font }. */
export default function DisplayControls({ value, onChange }) {
  const { lang } = useI18n();
  const p = (ar, en) => (lang === 'ar' ? ar : en);
  const v = value;
  const set = (patch) => onChange({ ...v, ...patch });
  const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p('عرض الصورة', 'Picture fit')} hint={p('«كاملة» = الصورة تظهر كلها بدون قص. «تملى الإطار» = ممكن تتقص الحواف.', '“Whole” shows the entire picture; “Fill” may trim the edges.')}>
          <Segmented value={v.fit} onChange={(x) => set({ fit: x })} className="w-full [&>button]:flex-1" options={[{ value: 'contain', label: p('كاملة', 'Whole') }, { value: 'cover', label: p('تملى الإطار', 'Fill') }]} />
        </Field>
        <Field label={p('شكل وارتفاع الكارت', 'Card shape')}>
          <Select value={v.ratio} onChange={(e) => set({ ratio: e.target.value })}>
            {[['default', p('الافتراضي', 'Default')], ['auto', p('يتظبط على الصورة (الأفضل)', 'Match the picture (best)')], ['21/9', p('عريض وقصير', 'Wide & short')], ['16/9', '16:9'], ['4/3', '4:3'], ['1/1', p('مربع', 'Square')]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        {v.fit === 'cover' && (
          <Field label={p('الجزء اللي يفضل ظاهر', 'Keep visible')}>
            <Segmented value={v.focus} onChange={(x) => set({ focus: x })} className="w-full [&>button]:flex-1" options={[{ value: 'top', label: p('فوق', 'Top') }, { value: 'center', label: p('النص', 'Middle') }, { value: 'bottom', label: p('تحت', 'Bottom') }]} />
          </Field>
        )}
      </div>
      <Field label={p('لون الكلام', 'Text colour')} hint={p('سيبه تلقائي وهنختار الأنسب.', 'Leave on Auto to pick the best.')}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => set({ text_color: '' })} aria-pressed={!v.text_color} className={cx('h-9 rounded-full border px-3 text-[13px] font-semibold', !v.text_color ? 'border-fg bg-fg text-canvas' : 'border-line-strong')}>{p('تلقائي', 'Auto')}</button>
          {COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={same(v.text_color, c)} onClick={() => set({ text_color: c })} className={cx('h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-canvas', same(v.text_color, c) ? 'ring-fg' : 'ring-line-strong')} style={{ backgroundColor: c }} />)}
          <label className="relative inline-flex h-9 w-9 cursor-pointer overflow-hidden rounded-full ring-2 ring-line-strong ring-offset-2 ring-offset-canvas" title={p('لون تاني', 'Custom')}>
            <span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} />
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(v.text_color) ? v.text_color : '#ffffff'} onChange={(e) => set({ text_color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
        </div>
      </Field>
      <Field label={p('نوع الخط', 'Font')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {BANNER_FONTS.map((x) => (
            <button key={x.key || 'default'} type="button" aria-pressed={v.font === x.key} onMouseEnter={() => loadBannerFont(x.key)} onFocus={() => loadBannerFont(x.key)} onClick={() => { loadBannerFont(x.key); set({ font: x.key }); }}
              className={cx('flex min-h-[3rem] items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-start transition', v.font === x.key ? 'border-fg bg-fg/[0.04] ring-1 ring-fg' : 'border-line-strong hover:border-fg')} style={{ fontFamily: bannerFontFamily(x.key) }}>
              <span className="text-lg font-bold">{p('اشتري 2 واحصل على 1', 'Buy 2 Get 1')}</span><span className="text-[11px] font-normal text-muted" style={{ fontFamily: 'inherit' }}>{x.ar}</span>
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}
