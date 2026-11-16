/**
 * Resilient outbound HTTP helper: timeout (AbortController), exponential backoff with jitter
 * for idempotent / retryable requests, and lightweight per-service circuit breaker.
 */
const circuits = new Map(); // key -> { failures, openedAt }

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;

export function isCircuitOpen(key) {
  if (!key) return false;
  const state = circuits.get(key);
  if (!state || state.failures < FAILURE_THRESHOLD) return false;
  if (Date.now() - state.openedAt >= COOLDOWN_MS) {
    circuits.set(key, { failures: FAILURE_THRESHOLD - 1, openedAt: state.openedAt });
    return false;
  }
  return true;
}

export function recordCircuitSuccess(key) {
  if (key) circuits.delete(key);
}

export function recordCircuitFailure(key) {
  if (!key) return;
  const cur = circuits.get(key) || { failures: 0, openedAt: 0 };
  const failures = cur.failures + 1;
  circuits.set(key, { failures, openedAt: failures >= FAILURE_THRESHOLD ? Date.now() : cur.openedAt });
}

export function resetCircuits() {
  circuits.clear();
}

export async function fetchWithRetry(
  url,
  options = {},
  {
    timeoutMs = 10_000,
    retries = 0,
    baseDelayMs = 200,
    circuitKey = null,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (circuitKey && isCircuitOpen(circuitKey)) {
    const err = new Error(`Circuit breaker open for ${circuitKey}`);
    err.code = 'CIRCUIT_OPEN';
    throw err;
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      const res = await fetchImpl(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 500 && attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (res.status >= 500) recordCircuitFailure(circuitKey);
      else recordCircuitSuccess(circuitKey);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.name === 'AbortError' ? Object.assign(new Error(`Request to ${url} timed out after ${timeoutMs}ms`), { code: 'ETIMEDOUT' }) : err;
      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      recordCircuitFailure(circuitKey);
      throw lastErr;
    }
  }
  throw lastErr;
}
