export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'resource') => new AppError(404, 'not_found', `${what} not found`);
export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const forbidden = () => new AppError(403, 'forbidden', 'You do not have access to this resource');

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const h = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) { next(e); }
};

/**
 * Central error handler. Never leaks SQL, stack traces or internals to the client —
 * the UI receives a stable `code` it can translate, plus field errors for forms.
 */
export function errorHandler(err, req, res, _next) {
  if (err?.name === 'ZodError') {
    const fields = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] = i.message;
    return res.status(422).json({ error: { code: 'validation_failed', message: 'Please check the highlighted fields.', fields } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'file_too_large', message: 'This image is too large.' } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.details } });
  }
  if (String(err?.message || '').includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: { code: 'already_exists', message: 'This value is already in use.' } });
  }
  console.error('[unhandled]', req.method, req.originalUrl, err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
}
