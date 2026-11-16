/**
 * Structured JSON logger, PII redactor, request ID middleware, and in-process latency/error metrics.
 */
import crypto from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const loopHistogram = monitorEventLoopDelay({ resolution: 20 });
loopHistogram.enable();

const LATENCY_SAMPLES_MAX = 1000;
const latencySamples = [];
let totalRequests = 0;
let totalErrors5xx = 0;
let totalErrors4xx = 0;

/**
 * Redacts Egyptian mobile numbers, email addresses, and tokens from log strings/objects.
 */
export function redactPii(input) {
  if (input == null) return input;
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  return s
    .replace(/\b(20)?(01[0125])\d{5}(\d{3})\b/g, '$1$2•••••$3')
    .replace(/\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, '$1***@$2')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/(cshr_)[A-Za-z0-9_-]+/g, '$1[REDACTED]');
}

export function log(level, msg, fields = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg: redactPii(String(msg)),
    ...Object.fromEntries(
      Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, typeof v === 'string' ? redactPii(v) : v]),
    ),
  };
  if (process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json') {
    const line = JSON.stringify(entry);
    if (level === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  } else if (level === 'error') {
    console.error(`[${entry.level}] ${entry.msg}`, Object.keys(fields).length ? fields : '');
  }
}

export const logger = {
  info: (msg, fields) => log('info', msg, fields),
  warn: (msg, fields) => log('warn', msg, fields),
  error: (msg, fields) => log('error', msg, fields),
};

export function requestObservabilityMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const reqId =
    typeof incomingId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId)
      ? incomingId
      : crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  const start = performance.now();

  res.on('finish', () => {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    totalRequests++;
    if (res.statusCode >= 500) totalErrors5xx++;
    else if (res.statusCode >= 400) totalErrors4xx++;

    if (latencySamples.length >= LATENCY_SAMPLES_MAX) latencySamples.shift();
    latencySamples.push(durationMs);

    if (res.statusCode >= 500 || process.env.LOG_REQUESTS === '1') {
      log(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
        reqId,
        method: req.method,
        path: req.originalUrl?.split('?')[0] || req.path,
        status: res.statusCode,
        durationMs,
        storeId: req.store?.id,
        userId: req.user?.id,
      });
    }
  });

  next();
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function getObservabilityMetrics() {
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const mem = process.memoryUsage();
  return {
    uptimeSec: Math.round(process.uptime()),
    requestsTotal: totalRequests,
    errors4xxTotal: totalErrors4xx,
    errors5xxTotal: totalErrors5xx,
    errorRate5xx: totalRequests > 0 ? Math.round((totalErrors5xx / totalRequests) * 10000) / 100 : 0,
    latencyMs: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      samples: sorted.length,
    },
    eventLoopLagMs: {
      mean: Math.round((loopHistogram.mean / 1e6) * 100) / 100,
      p99: Math.round((loopHistogram.percentile(99) / 1e6) * 100) / 100,
    },
    memoryBytes: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
  };
}

export function formatPrometheusMetrics(extra = {}) {
  const m = getObservabilityMetrics();
  const lines = [
    '# HELP twist_uptime_seconds Process uptime in seconds',
    '# TYPE twist_uptime_seconds gauge',
    `twist_uptime_seconds ${m.uptimeSec}`,
    '# HELP twist_http_requests_total Total HTTP requests handled',
    '# TYPE twist_http_requests_total counter',
    `twist_http_requests_total ${m.requestsTotal}`,
    '# HELP twist_http_errors_5xx_total Total HTTP 5xx responses',
    '# TYPE twist_http_errors_5xx_total counter',
    `twist_http_errors_5xx_total ${m.errors5xxTotal}`,
    '# HELP twist_http_latency_p95_ms 95th percentile HTTP latency in ms',
    '# TYPE twist_http_latency_p95_ms gauge',
    `twist_http_latency_p95_ms ${m.latencyMs.p95}`,
    '# HELP twist_eventloop_lag_p99_ms 99th percentile event loop lag in ms',
    '# TYPE twist_eventloop_lag_p99_ms gauge',
    `twist_eventloop_lag_p99_ms ${m.eventLoopLagMs.p99}`,
    '# HELP twist_memory_rss_bytes Resident set size in bytes',
    '# TYPE twist_memory_rss_bytes gauge',
    `twist_memory_rss_bytes ${m.memoryBytes.rss}`,
  ];
  if (extra.dbBytes != null) {
    lines.push(
      '# HELP twist_sqlite_db_bytes SQLite database size in bytes',
      '# TYPE twist_sqlite_db_bytes gauge',
      `twist_sqlite_db_bytes ${extra.dbBytes}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
