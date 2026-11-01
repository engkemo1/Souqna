import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import Button from '../components/ui/Button.jsx';

export default function NotFound({ crashed, inStore }) {
  const { t } = useI18n();
  const err = useRouteError();
  useEffect(() => { if (crashed && err) console.error('[route crash]', err?.message || err, err?.stack || ''); }, [crashed, err]);   // so a production crash leaves a readable trace in the console
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4">
      <EmptyState
        icon={Compass}
        title={crashed ? t('error.title') : t('error.notFound')}
        body={crashed ? t('error.body') : t('error.notFoundBody')}
        action={<Button to={inStore ? '..' : '/'} relative="path">{t('error.goHome')}</Button>}
      />
    </div>
  );
}
