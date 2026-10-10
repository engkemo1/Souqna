/** Thin fetch wrapper: JSON in/out, auth header, typed errors, upload progress. */
const TOKEN_KEY = 'souqna.token';

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Admin scope: while the platform admin manages a store, every `/owner/...` call is sent to
 * `/admin/stores/<slug>/as/...` with the admin key instead of an owner token.
 */
let adminScope = null;
export const setAdminScope = (scope) => { adminScope = scope; };
function route(path, headers) {
  if (adminScope && path.startsWith('/owner/')) return { path: `/admin/stores/${encodeURIComponent(adminScope.slug)}/as${path.slice(6)}`, headers: { ...headers, 'x-admin-key': adminScope.key(), 'x-admin-session': adminScope.session?.() || '' }, scoped: true };
  return { path, headers, scoped: false };
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(rawPath, { method = 'GET', body, signal, headers: rawHeaders = {} } = {}) {
  const { path, headers, scoped } = route(rawPath, rawHeaders);
  const token = scoped ? null : tokenStore.get();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      headers: {
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Network error');
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = data?.error || {};
    if (res.status === 401 && path.startsWith('/owner') && !scoped) onUnauthorized();
    throw new ApiError(res.status, err.code || 'server_error', err.message || 'Request failed', err.fields);
  }
  return data;
}

/** Multipart upload with progress (fetch has no upload progress yet). */
export function upload(rawPath, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const { path, headers, scoped } = route(rawPath, {});
    xhr.open('POST', `/api${path}`);
    const token = scoped ? null : tokenStore.get();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error?.code || 'server_error', data?.error?.message || 'Upload failed'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Network error'));
    xhr.send(formData);
  });
}
