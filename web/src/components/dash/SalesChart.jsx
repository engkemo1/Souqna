import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { useI18n } from '../../lib/i18n.jsx';
import { formatMoney, formatCompact, formatDate, formatNumber } from '../../lib/format.js';

const BRAND = '#FF5A1F';
const PREV = '#B9B5AC';

function TooltipBox({ active, payload, label, lang, t, kind }) {
  if (!active || !payload?.length) return null;
  const cur = payload.find((p) => p.dataKey === 'sales' || p.dataKey === 'orders' || p.dataKey === 'value');
  const prev = payload.find((p) => p.dataKey === 'prev');
  return (
    <div className="rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-sm shadow-lift">
      <p className="mb-1 text-xs text-muted">{label && /^\d{4}-/.test(label) ? formatDate(`${label} 12:00:00`, lang, { weekday: 'short', day: 'numeric', month: 'short' }) : label}</p>
      {cur && <p className="font-semibold tabular">{kind === 'count' ? formatNumber(cur.value, lang) : formatMoney(cur.value, lang)}</p>}
      {prev && <p className="text-xs text-muted tabular">{t('dash.previousPeriod')}: {formatMoney(prev.value, lang)}</p>}
    </div>
  );
}

export function SalesAreaChart({ series, previous, height = 280 }) {
  const { lang, t, isRtl } = useI18n();
  const data = series.map((d, i) => ({ ...d, prev: previous?.[i] ?? null }));
  const tickEvery = Math.ceil(data.length / 7);
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 18, left: 18, bottom: 0 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.22} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(var(--c-border))" strokeDasharray="0" />
          <XAxis dataKey="day" reversed={isRtl} tickLine={false} axisLine={false} interval={tickEvery - 1} tick={{ fontSize: 12, fill: 'rgb(var(--c-muted))' }}
            tickFormatter={(d) => formatDate(`${d} 12:00:00`, lang, { day: 'numeric', month: 'short' })} dy={8} />
          <YAxis orientation={isRtl ? 'right' : 'left'} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12, fill: 'rgb(var(--c-muted))' }} tickFormatter={(v) => formatCompact(v, lang)} />
          <Tooltip content={<TooltipBox lang={lang} t={t} />} cursor={{ stroke: 'rgb(var(--c-border-strong))', strokeDasharray: '4 4' }} />
          {previous && <Area type="monotone" dataKey="prev" stroke={PREV} strokeWidth={1.75} strokeDasharray="5 5" fill="none" dot={false} activeDot={false} animationDuration={900} />}
          <Area type="monotone" dataKey="sales" stroke={BRAND} strokeWidth={2.5} fill="url(#salesFill)" dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff', fill: BRAND }} animationDuration={1100} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBars({ data, dataKey, labelKey, height = 220, kind = 'count', color = BRAND, highlightMax = true }) {
  const { lang, t, isRtl } = useI18n();
  const max = Math.max(...data.map((d) => d[dataKey]));
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--c-border))" />
          <XAxis dataKey={labelKey} reversed={isRtl} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'rgb(var(--c-muted))' }} dy={6} interval="preserveStartEnd" />
          <YAxis orientation={isRtl ? 'right' : 'left'} tickLine={false} axisLine={false} width={34} tick={{ fontSize: 11, fill: 'rgb(var(--c-muted))' }} tickFormatter={(v) => formatCompact(v, lang)} allowDecimals={false} />
          <Tooltip content={<TooltipBox lang={lang} t={t} kind={kind} />} cursor={{ fill: 'rgb(var(--c-text) / 0.04)' }} />
          <Bar dataKey={dataKey} radius={[6, 6, 2, 2]} animationDuration={900}
            shape={(props) => {
              const { x, y, width, height: h, payload } = props;
              const fill = highlightMax && payload[dataKey] === max ? color : `${color}66`;
              const r = Math.min(6, width / 2);
              return <path d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + h} Z`} fill={fill} />;
            }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
