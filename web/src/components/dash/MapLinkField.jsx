import { MapPin } from 'lucide-react';
import { useI18n } from '../../lib/i18n.jsx';
import { Field, Input } from '../ui/Field.jsx';

/** Opens Google Maps around the shop so its owner can copy a share link into the field. */
export default function MapLinkField({ value, onChange, query, error, className = '' }) {
  const { t } = useI18n();
  const search = String(query || '').trim() || 'clothing stores in Banha, Egypt';
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(search)}`;
  const labelEnd = (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:underline">
      <MapPin className="h-3.5 w-3.5" />{t('settings.mapPick')}
    </a>
  );
  return (
    <Field label={t('settings.mapUrl')} optional={t('common.optional')} hint={t('settings.mapUrlHint')} error={error} labelEnd={labelEnd} className={className}>
      <Input dir="ltr" type="url" inputMode="url" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="https://maps.app.goo.gl/..." className="text-start" />
    </Field>
  );
}
