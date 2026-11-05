import { useState } from 'react';
import { Download } from 'lucide-react';
import { adminKey, adminSession } from './adminApi.js';

/** Downloads one of the server's CSV exports (opens fine in Excel). The admin headers are sent with a normal fetch, so no key ever goes in a URL. */
export default function ExportButton({ kind, days = 30, label = 'تصدير Excel' }) {
  const [state, setState] = useState('idle');
  const go = async () => {
    setState('busy');
    try {
      const res = await fetch(`/api/admin/export/${kind}?days=${days}`, { headers: { 'x-admin-key': adminKey.get(), 'x-admin-session': adminSession.get() } });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || `${kind}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setState('idle');
    } catch { setState('error'); setTimeout(() => setState('idle'), 3000); }
  };
  return (
    <button type="button" onClick={go} disabled={state === 'busy'} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium hover:bg-fg/[0.05] disabled:opacity-60">
      <Download className="h-4 w-4" />{state === 'busy' ? 'جاري التحميل…' : state === 'error' ? 'حصل خطأ، جرّب تاني' : label}
    </button>
  );
}
